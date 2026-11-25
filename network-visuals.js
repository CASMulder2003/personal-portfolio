(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const integer = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const svgNode = (tag, attrs = {}, text) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const htmlNode = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  let data;
  let weighting = 'topology';
  let selectedStation = 'Stratford';
  let byName, rankMaps, centrePositions, fragmentPositions;
  const centreView = {z: 1, x: 0, y: 0, width: 400, height: 360};
  const fragmentView = {z: 1, x: 0, y: 0, width: 620, height: 430};
  const centralitySvgs = [0, 1, 2].map(i => get(`centrality-map-${i}`));
  const fragmentSvg = get('fragmentation-map');
  const families = {
    topology: ['degree', 'betweenness', 'closeness'],
    weighted: ['weighted_degree', 'weighted_betweenness', 'weighted_closeness'],
  };
  const headings = {
    degree: ['Direct connections', 'How many neighbours does a station have?'],
    betweenness: ['Shortest-path bridges', 'How often do shortest paths pass through?'],
    closeness: ['Network proximity', 'How few connections separate it from the rest?'],
    weighted_degree: ['Incident passenger flow', 'How much edge flow meets at a station?'],
    weighted_betweenness: ['Stronger-flow paths', 'Which stations bridge paths using inverse-flow costs?'],
    weighted_closeness: ['Physical proximity', 'How short are distances through the network?'],
  };
  const shortUnits = {
    degree: 'connections / 400', betweenness: 'normalised shortest-path share',
    closeness: 'inverse mean distance in connections', weighted_degree: 'sum of incident edge flows',
    weighted_betweenness: 'normalised shortest-path share', weighted_closeness: 'inverse metres',
  };
  function formatValue(value, key) {
    if (key === 'weighted_degree') return integer.format(value);
    if (key === 'weighted_closeness') return value.toExponential(3);
    return value.toFixed(4);
  }
  function positions(width, height, pad) {
    const xs = data.nodes.map(n => n.x), ys = data.nodes.map(n => n.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY;
    const s = Math.min((width - pad * 2) / dx, (height - pad * 2) / dy);
    const ox = (width - dx * s) / 2, oy = (height - dy * s) / 2;
    return new Map(data.nodes.map(n => [n.id, [ox + (n.x - minX) * s, height - oy - (n.y - minY) * s]]));
  }
  function measureColour(t) {
    const light = [198, 216, 204], dark = [23, 91, 81];
    return `rgb(${light.map((c, i) => Math.round(c + (dark[i] - c) * t)).join(',')})`;
  }
  function setView(view, svgs) {
    view.x = clamp(view.x, view.width * (1 - view.z) - 24, 24);
    view.y = clamp(view.y, view.height * (1 - view.z) - 24, 24);
    svgs.forEach(svg => {
      const group = svg.querySelector('.network-geography');
      if (!group) return;
      group.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.z})`);
      group.querySelectorAll('[data-radius]').forEach(el => el.setAttribute('r', Number(el.dataset.radius) / view.z));
      group.querySelectorAll('.map-selected-label').forEach(el => {
        const [x, y] = [Number(el.dataset.x), Number(el.dataset.y)];
        el.setAttribute('x', x + Number(el.dataset.dx || 11) / view.z);
        el.setAttribute('y', y - 10 / view.z);
        el.style.fontSize = `${12 / view.z}px`;
        el.style.strokeWidth = `${5 / view.z}px`;
      });
      group.querySelectorAll('[data-cross-size]').forEach(el => {
        const x = Number(el.dataset.x), y = Number(el.dataset.y), size = Number(el.dataset.crossSize) / view.z;
        el.setAttribute('d', `M${x - size},${y - size}L${x + size},${y + size}M${x - size},${y + size}L${x + size},${y - size}`);
      });
    });
    if (view === centreView) {
      get('centrality-zoom-label').textContent = `${Math.round(view.z * 100)}%`;
      document.querySelector('[data-centrality-zoom="out"]').disabled = view.z <= 1;
      document.querySelector('[data-centrality-zoom="in"]').disabled = view.z >= 5;
    } else {
      document.querySelector('[data-fragment-zoom="out"]').disabled = view.z <= 1;
      document.querySelector('[data-fragment-zoom="in"]').disabled = view.z >= 5;
    }
  }
  function zoom(view, svgs, action) {
    if (action === 'reset') { view.z = 1; view.x = 0; view.y = 0; }
    else {
      const z = clamp(view.z * (action === 'in' ? 1.5 : 1 / 1.5), 1, 5);
      view.x = view.width / 2 - (view.width / 2 - view.x) * z / view.z;
      view.y = view.height / 2 - (view.height / 2 - view.y) * z / view.z;
      view.z = z;
    }
    setView(view, svgs);
  }
  function attachPan(svg, view, svgs, canSelect) {
    let drag = null;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const rect = svg.getBoundingClientRect();
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, tx: view.x, ty: view.y,
        sx: view.width / rect.width, sy: view.height / rect.height, moved: false,
        station: event.target.closest('[data-station]')?.dataset.station};
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    svg.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      svg.classList.add('is-panning');
      view.x = drag.tx + dx * drag.sx; view.y = drag.ty + dy * drag.sy;
      setView(view, svgs);
    });
    const end = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const completed = drag; drag = null;
      svg.classList.remove('is-panning');
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (event.type === 'pointerup' && canSelect && !completed.moved && completed.station) selectStation(completed.station);
    };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  }
  function selectStation(name) {
    if (!byName.has(name)) return;
    selectedStation = name; get('centrality-station').value = name;
    drawCentralities();
  }
  function stationLabel(group, name, point, width) {
    const right = point[0] > width * .73;
    group.append(svgNode('text', {x: point[0], y: point[1], class: 'map-selected-label',
      'data-x': point[0], 'data-y': point[1], 'data-dx': right ? -11 : 11,
      'text-anchor': right ? 'end' : 'start'}, name));
  }
  function drawCentralities() {
    const selected = byName.get(selectedStation);
    families[weighting].forEach((key, i) => {
      const svg = centralitySvgs[i], meta = data.measures[key];
      svg.replaceChildren(svgNode('title', {}, `${meta.label}: ${selectedStation}, ${formatValue(selected.measures[key], key)}, rank ${rankMaps[key].get(selectedStation)}`));
      svg.setAttribute('aria-label', `Geographic ${meta.label.toLowerCase()} map. Selected ${selectedStation}, rank ${rankMaps[key].get(selectedStation)} of 401. Use the station selector to inspect values.`);
      const geography = svgNode('g', {class: 'network-geography'});
      const edges = svgNode('g', {stroke: '#a4b7ac', 'stroke-width': .75, 'stroke-opacity': .65});
      data.edges.forEach(e => {
        const a = centrePositions.get(e.source), b = centrePositions.get(e.target);
        edges.append(svgNode('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'network-edge'}));
      });
      geography.append(edges);
      const ordered = [...data.nodes].sort((a, b) => a.measures[key] - b.measures[key]);
      ordered.forEach(n => {
        const point = centrePositions.get(n.id), t = n.measures[key] / meta.max;
        const circle = svgNode('circle', {cx: point[0], cy: point[1], r: 1.2 + Math.sqrt(t) * 5,
          'data-radius': 1.2 + Math.sqrt(t) * 5, fill: measureColour(t), stroke: '#f4f6f1', 'stroke-width': .3,
          'vector-effect': 'non-scaling-stroke', class: 'network-node', 'data-station': n.id});
        circle.append(svgNode('title', {}, `${n.id}: ${formatValue(n.measures[key], key)} (${shortUnits[key]}), rank ${rankMaps[key].get(n.id)}`));
        geography.append(circle);
      });
      const p = centrePositions.get(selectedStation);
      const r = 1.2 + Math.sqrt(selected.measures[key] / meta.max) * 5;
      geography.append(svgNode('circle', {cx: p[0], cy: p[1], r: r + 3, 'data-radius': r + 3,
        fill: 'none', stroke: '#ab684a', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none'}));
      stationLabel(geography, selectedStation, p, 400); svg.append(geography);
      get(`centrality-label-${i}`).textContent = meta.label;
      get(`centrality-title-${i}`).textContent = headings[key][0];
      get(`centrality-description-${i}`).textContent = headings[key][1];
      const scale = get(`centrality-scale-${i}`), row = htmlNode('div', 'measure-scale-row');
      row.append(htmlNode('span', '', '0'), htmlNode('span', '', formatValue(meta.max, key)));
      scale.replaceChildren(row, htmlNode('div', 'measure-gradient'), htmlNode('div', 'measure-scale-unit', shortUnits[key]));
      const values = get(`centrality-value-${i}`), reading = htmlNode('div', 'value-rank');
      reading.append(htmlNode('span', 'raw-value', formatValue(selected.measures[key], key)), htmlNode('span', 'rank-value', `Rank ${rankMaps[key].get(selectedStation)} / 401`));
      values.replaceChildren(htmlNode('span', 'selected-name', selectedStation), reading,
        htmlNode('span', 'raw-unit', key === 'degree' ? `${selected.connections} direct connections; normalised value` : shortUnits[key]));
    });
    get('centrality-mode-note').textContent = weighting === 'topology'
      ? 'Unweighted connections. Each map shows a different definition of structural importance.'
      : 'Mixed weights: incident passenger flow, inverse-flow path cost and physical distance. These are different definitions, not one common passenger measure.';
    setView(centreView, centralitySvgs);
  }
  function drawFragmentMap(state) {
    fragmentSvg.replaceChildren(svgNode('title', {}, `After ${state.step} removals: ${state.largest_component_size} stations in the largest connected group, ${state.outside_largest_remaining} in other groups.`));
    fragmentSvg.setAttribute('aria-label', `Map after ${state.step} removals. Largest group: ${state.largest_component_size} stations. Other groups: ${state.outside_largest_remaining}. Removed: ${state.step}.`);
    const geography = svgNode('g', {class: 'network-geography'});
    const edges = svgNode('g');
    data.edges.forEach(e => {
      const a = fragmentPositions.get(e.source), b = fragmentPositions.get(e.target);
      const ca = state.component_by_node[e.source_index], cb = state.component_by_node[e.target_index];
      const removed = ca === -1 || cb === -1;
      edges.append(svgNode('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'network-edge',
        stroke: removed ? '#cbbdad' : ca === 0 ? '#3e7d6c' : '#a6b4aa',
        'stroke-width': removed ? .8 : 1.2, 'stroke-dasharray': removed ? '3 3' : 'none', 'stroke-opacity': removed ? .6 : .85}));
    });
    geography.append(edges);
    data.nodes.forEach((n, i) => {
      const p = fragmentPositions.get(n.id), component = state.component_by_node[i];
      if (component === -1) return;
      const circle = svgNode('circle', {cx: p[0], cy: p[1], r: component === 0 ? 2.3 : 2,
        'data-radius': component === 0 ? 2.3 : 2, fill: component === 0 ? '#28675f' : '#98aaa0'});
      circle.append(svgNode('title', {}, `${n.id}: ${component === 0 ? 'largest connected group' : `another connected group (${state.component_sizes[component]} stations)`}`));
      geography.append(circle);
    });
    state.removed_indices.forEach(i => {
      const n = data.nodes[i], p = fragmentPositions.get(n.id), current = n.id === state.removed_at_step;
      const cross = svgNode('path', {'data-cross-size': current ? 5.5 : 3.5, 'data-x': p[0], 'data-y': p[1],
        fill: 'none', stroke: '#ab684a', 'stroke-width': current ? 2.5 : 1.8, 'vector-effect': 'non-scaling-stroke'});
      cross.append(svgNode('title', {}, `${n.id}: removed`)); geography.append(cross);
    });
    if (state.removed_at_step) stationLabel(geography, state.removed_at_step, fragmentPositions.get(state.removed_at_step), 620);
    fragmentSvg.append(geography); setView(fragmentView, [fragmentSvg]);
  }
  function drawCurve(key, step) {
    const series = data.removal_states[key].states.map(s => s.largest_component_size), count = series[step];
    const compact = get('network-chart').clientWidth < 400;
    const width = compact ? 360 : 500, height = compact ? 260 : 290;
    const left = 42, right = width - 23, top = 20, bottom = height - 46;
    const x = v => left + (right - left) * v / 15, y = v => bottom - (bottom - top) * v / 420;
    const svg = svgNode('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${key} targeting. ${count} stations in the largest group after ${step} removals.`});
    svg.append(svgNode('title', {}, 'Largest connected group through the recorded removal sequence'));
    [0,100,200,300,400].forEach(v => {
      svg.append(svgNode('line', {x1:left,x2:right,y1:y(v),y2:y(v),class:'network-grid'}));
      svg.append(svgNode('text',{x:left-9,y:y(v)+5,'text-anchor':'end',class:'network-chart-text'},v));
    });
    [0,5,10,15].forEach(v => svg.append(svgNode('text',{x:x(v),y:bottom+22,'text-anchor':'middle',class:'network-chart-text'},v)));
    svg.append(svgNode('text',{x:(left+right)/2,y:height-2,'text-anchor':'middle',class:'network-chart-text'},'Stations removed'));
    svg.append(svgNode('path',{d:series.map((v,i)=>(i?'L':'M')+x(i)+','+y(v)).join(' '),class:'network-line'}));
    series.forEach((v,i)=>svg.append(svgNode('circle',{cx:x(i),cy:y(v),r:2.5,fill:'#28675f'})));
    const random = data.random_reference.final_lcc_mean;
    svg.append(svgNode('circle',{cx:x(15),cy:y(random),r:5,fill:'#ab684a'}));
    svg.append(svgNode('text',{x:x(15)-9,y:y(random)-10,'text-anchor':'end',class:'network-chart-text'},`${random} random`));
    svg.append(svgNode('line',{x1:x(step),x2:x(step),y1:top,y2:bottom,stroke:'#6b8c80','stroke-dasharray':'4 5'}));
    svg.append(svgNode('circle',{cx:x(step),cy:y(count),r:6,fill:'#28675f',stroke:'#fff','stroke-width':2}));
    get('network-chart').replaceChildren(svg);
  }
  function drawFragmentation() {
    const key = get('network-strategy').value, step = Number(get('network-step').value);
    const states = data.removal_states[key].states, state = states[step];
    drawFragmentMap(state); drawCurve(key, step);
    get('network-step-label').textContent = `${step} of 15`;
    get('network-step').setAttribute('aria-valuetext', `${step} removals, ${state.largest_component_size} stations in the largest connected group`);
    get('network-count').textContent = state.largest_component_size;
    get('network-other-count').textContent = state.outside_largest_remaining;
    get('network-removed-count').textContent = step;
    get('network-annotation').textContent = step === 0 ? 'The supplied graph starts as one connected group of 401 stations.'
      : states[step-1].largest_component_size === state.largest_component_size
        ? `Removing ${state.removed_at_step} leaves the largest group at ${state.largest_component_size} stations. Other parts of the graph can still change.`
        : `Removing ${state.removed_at_step} at this step reduces the largest group from ${states[step-1].largest_component_size} to ${state.largest_component_size} stations.`;
    get('network-endpoint').textContent = `After all 15 removals: ${states[15].largest_component_size} stations. Random removal averaged ${data.random_reference.final_lcc_mean} across ${data.random_reference.runs} runs.`;
    get('previous-network-step').disabled = step === 0; get('next-network-step').disabled = step === 15;
  }
  function buildSupportingReadouts() {
    const corr = get('rank-correlations');
    [['Degree','Passenger flows'],['Betweenness','Inverse-flow costs'],['Closeness','Segment length']].forEach(([title,note],i)=>{
      const el = htmlNode('div');
      el.append(htmlNode('b','',data.rank_correlations.matrix[i][i+3].toFixed(2)),htmlNode('span','',title),htmlNode('small','',note));
      corr.append(el);
    });
    const table = htmlNode('table','retail-table');
    table.append(htmlNode('caption','','Stations in the largest connected group, by removal step'));
    const head = htmlNode('thead'), hr = htmlNode('tr');
    ['Removed','Degree','Betweenness','Closeness'].forEach(label=>{const th=htmlNode('th','',label);th.scope='col';hr.append(th);});
    head.append(hr);table.append(head);const body=htmlNode('tbody');
    for(let step=0;step<16;step++){
      const tr=htmlNode('tr'),th=htmlNode('th','',step);th.scope='row';tr.append(th);
      ['degree','betweenness','closeness'].forEach(key=>tr.append(htmlNode('td','',data.removal_states[key].states[step].largest_component_size)));
      body.append(tr);
    }
    table.append(body);get('network-data-table').append(table);
  }
  async function start() {
    try {
      const response = await fetch('assets/data/urban-network-measures.json');
      if(!response.ok)throw new Error('Network measures could not load.');
      data=await response.json();
      byName=new Map(data.nodes.map(n=>[n.id,n]));
      rankMaps=Object.fromEntries(data.measure_order.map(key=>[key,new Map(data.rankings[key].map(n=>[n.id,n.rank]))]));
      centrePositions=positions(400,360,24);fragmentPositions=positions(620,430,25);
      const select=get('centrality-station');select.replaceChildren();
      [...data.nodes].sort((a,b)=>a.id.localeCompare(b.id,'en')).forEach(n=>{const o=htmlNode('option','',n.id);o.value=n.id;select.append(o);});
      select.value=selectedStation;select.addEventListener('change',event=>selectStation(event.target.value));
      document.querySelectorAll('[data-weighting]').forEach(button=>button.addEventListener('click',()=>{
        weighting=button.dataset.weighting;
        document.querySelectorAll('[data-weighting]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        drawCentralities();
      }));
      document.querySelectorAll('[data-centrality-zoom]').forEach(b=>b.addEventListener('click',()=>zoom(centreView,centralitySvgs,b.dataset.centralityZoom)));
      document.querySelectorAll('[data-fragment-zoom]').forEach(b=>b.addEventListener('click',()=>zoom(fragmentView,[fragmentSvg],b.dataset.fragmentZoom)));
      get('focus-centrality-station').addEventListener('click',()=>{
        const p=centrePositions.get(selectedStation);centreView.z=3;
        centreView.x=200-p[0]*3;centreView.y=180-p[1]*3;setView(centreView,centralitySvgs);
      });
      centralitySvgs.forEach(svg=>attachPan(svg,centreView,centralitySvgs,true));attachPan(fragmentSvg,fragmentView,[fragmentSvg],false);
      get('network-strategy').addEventListener('change',drawFragmentation);
      get('network-step').addEventListener('input',drawFragmentation);
      [['previous-network-step',-1],['next-network-step',1]].forEach(([id,change])=>get(id).addEventListener('click',()=>{
        get('network-step').value=clamp(Number(get('network-step').value)+change,0,15);drawFragmentation();
      }));
      window.addEventListener('resize',()=>drawCurve(get('network-strategy').value,Number(get('network-step').value)));
      drawCentralities();drawFragmentation();buildSupportingReadouts();
    } catch(error) {
      const note=htmlNode('p','error-note','The network figures could not load. Please refresh to try again.');
      get('centrality-maps').prepend(note);console.error(error);
    }
  }
  start();
})();
