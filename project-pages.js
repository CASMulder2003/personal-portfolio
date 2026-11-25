(() => {
  'use strict';
  const page = document.body.dataset.page;
  const get = id => document.getElementById(id);
  const number = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});
  const ns = 'http://www.w3.org/2000/svg';
  function node(tag, attributes = {}, text) {
    const result = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => result.setAttribute(key, value));
    if (text !== undefined) result.textContent = text;
    return result;
  }

  if (page === 'moments') {
    get('evidence-select').addEventListener('change', event => {
      document.querySelectorAll('.evidence-panel').forEach(panel => {
        panel.hidden = panel.id !== 'evidence-' + event.target.value;
      });
    });
    return;
  }
  if (page !== 'home' && page !== 'urban') return;

  function drawHomeNetwork(data) {
    const svg = get('urban-home-network');
    if (!svg) return;
    const graph = data.network.topology;
    const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
    const xMin = Math.min(...xs), yMin = Math.min(...ys);
    const dx = Math.max(...xs) - xMin, dy = Math.max(...ys) - yMin;
    const scale = Math.min(522 / dx, 183 / dy);
    const ox = (550 - dx * scale) / 2, oy = (205 - dy * scale) / 2;
    const coords = new Map(graph.nodes.map(n => [n.id, [ox + (n.x - xMin) * scale, 205 - oy - (n.y - yMin) * scale]]));
    const degree = new Map();
    const lines = node('g', {stroke: '#6d9589', 'stroke-width': 1.15, fill: 'none'});
    graph.edges.forEach(edge => {
      const a = coords.get(edge.source), b = coords.get(edge.target);
      lines.append(node('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1]}));
      [edge.source, edge.target].forEach(id => degree.set(id, (degree.get(id) || 0) + 1));
    });
    svg.append(lines);
    graph.nodes.forEach(n => {
      const p = coords.get(n.id), hub = degree.get(n.id) > 3;
      svg.append(node('circle', {cx: p[0], cy: p[1], r: hub ? 2.5 : 1.2, fill: hub ? '#a96a4a' : '#28675f'}));
    });
  }

  function drawNetwork(data) {
    const key = get('network-strategy').value;
    const strategy = data.network.strategies[key];
    const step = Number(get('network-step').value);
    const count = strategy.lcc[step];
    const compact = get('network-chart').clientWidth < 450;
    const width = compact ? 360 : 650, height = compact ? 275 : 305;
    const left = 43, right = width - 24, top = 17, bottom = height - 49;
    const x = value => left + (right - left) * value / 15;
    const y = value => bottom - (bottom - top) * value / 420;
    const title = `${strategy.label} targeting: ${count} stations in the largest connected group after ${step} removals.`;
    const svg = node('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title});
    svg.append(node('title', {}, title));
    [0, 100, 200, 300, 400].forEach(value => {
      svg.append(node('line', {x1: left, x2: right, y1: y(value), y2: y(value), class: 'network-grid'}));
      svg.append(node('text', {x: left - 9, y: y(value) + 5, 'text-anchor': 'end', class: 'network-chart-text'}, value));
    });
    [0, 5, 10, 15].forEach(value => {
      svg.append(node('text', {x: x(value), y: bottom + 23, 'text-anchor': 'middle', class: 'network-chart-text'}, value));
    });
    svg.append(node('text', {x: (left + right) / 2, y: height - 3, 'text-anchor': 'middle', class: 'network-chart-text'}, 'Stations removed'));
    const path = strategy.lcc.map((value, i) => (i ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(value).toFixed(2)).join(' ');
    svg.append(node('path', {d: path, class: 'network-line'}));
    strategy.lcc.forEach((value, i) => svg.append(node('circle', {cx: x(i), cy: y(value), r: 2.5, fill: '#28675f'})));
    svg.append(node('circle', {cx: x(15), cy: y(data.network.random.final_lcc_mean), r: 5, fill: '#ab684a'}));
    svg.append(node('text', {x: x(15) - 11, y: y(data.network.random.final_lcc_mean) - 9, 'text-anchor': 'end', class: 'network-chart-text'}, '354.1 random'));
    svg.append(node('line', {x1: x(step), x2: x(step), y1: top, y2: bottom, stroke: '#6b8c80', 'stroke-dasharray': '4 5'}));
    svg.append(node('circle', {cx: x(step), cy: y(count), r: 6, fill: '#28675f', stroke: '#fff', 'stroke-width': 2}));
    get('network-chart').replaceChildren(svg);
    get('network-step-label').textContent = `${step} of 15`;
    get('network-step').setAttribute('aria-valuetext', `${step} removals, ${count} stations in the largest connected group`);
    get('network-count').textContent = count;
    get('network-caption').textContent = `stations in the largest group after ${step} ${step === 1 ? 'removal' : 'removals'}`;
    get('network-annotation').textContent = step === 0
      ? 'The supplied graph starts as one connected group of 401 stations.'
      : strategy.lcc[step - 1] === count
        ? `Removing ${strategy.removed[step - 1]} at this step leaves the largest group at ${count} stations. Other parts of the graph can still change.`
        : `Removing ${strategy.removed[step - 1]} at this step reduces the largest group from ${strategy.lcc[step - 1]} to ${count} stations.`;
    get('network-endpoint').textContent = `After all 15 removals: ${strategy.lcc[15]} stations. Random removal averaged ${data.network.random.final_lcc_mean} across 20 runs.`;
  }

  function barRow(label, value, max, alternative) {
    const div = document.createElement('div');
    div.className = 'horizontal-result';
    const lab = document.createElement('div');
    lab.className = 'result-label';
    const name = document.createElement('span'); name.textContent = label;
    const amount = document.createElement('strong'); amount.textContent = number.format(value);
    lab.append(name, amount);
    const track = document.createElement('div'); track.className = 'result-track'; track.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div'); bar.className = 'result-bar' + (alternative ? ' alternative' : '');
    bar.style.width = (value / max * 100) + '%';
    track.append(bar); div.append(lab, track); return div;
  }

  function drawRetail(data) {
    const size = get('store-size').value;
    const demand = get('retail-demand-bars'), walk = get('retail-walk-bars');
    demand.replaceChildren(); walk.replaceChildren();
    ['A', 'B'].forEach(id => {
      const site = data.retail.sites[id];
      const scenario = data.retail.scenarios.find(item => item.site === id && item.format === size);
      demand.append(barRow(site.name, scenario.predicted_weekly_trips, 2000, id === 'B'));
      walk.append(barRow(site.name, site.walking_residents, 7000, id === 'B'));
    });
    get('retail-conclusion').textContent = `At the ${size === 'Large' ? 'larger' : 'smaller'} format, Emerson Park leads on modelled demand. A recommendation prioritising local walking access would favour the alternative near Elm Park.`;
  }

  function resultsTable(data) {
    const table = document.createElement('table'); table.className = 'retail-table';
    const caption = document.createElement('caption'); caption.textContent = 'Stations in the largest connected group, by removal step';
    const head = document.createElement('thead'), header = document.createElement('tr');
    ['Removed', 'Degree', 'Betweenness', 'Closeness'].forEach(label => {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; header.append(cell);
    });
    head.append(header);
    const body = document.createElement('tbody');
    data.network.steps.forEach(step => {
      const row = document.createElement('tr');
      const cell = document.createElement('th'); cell.scope = 'row'; cell.textContent = step; row.append(cell);
      ['degree', 'betweenness', 'closeness'].forEach(key => {
        const td = document.createElement('td'); td.textContent = data.network.strategies[key].lcc[step]; row.append(td);
      });
      body.append(row);
    });
    table.append(caption, head, body); get('network-data-table').append(table);
  }

  async function start() {
    try {
      const response = await fetch('assets/data/urban-simulation.json');
      if (!response.ok) throw new Error('Project data could not be loaded.');
      const data = await response.json();
      if (page === 'home') { drawHomeNetwork(data); return; }
      drawNetwork(data); drawRetail(data); resultsTable(data);
      get('network-strategy').addEventListener('change', () => drawNetwork(data));
      get('network-step').addEventListener('input', () => drawNetwork(data));
      get('store-size').addEventListener('change', () => drawRetail(data));
      window.addEventListener('resize', () => drawNetwork(data));
    } catch (error) {
      const note = document.createElement('p'); note.className = 'error-note';
      note.textContent = 'The project figures could not load. Please refresh the page to try again.';
      (get('network-chart') || get('urban-home-network')?.parentElement)?.append(note);
      console.error(error);
    }
  }
  start();
})();
