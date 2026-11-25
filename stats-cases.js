(() => {
  'use strict';
  const study = document.body.dataset.study;
  if (!['airbnb', 'youth'].includes(study)) return;
  const svg = document.querySelector('#stats-map');
  const select = document.querySelector('#stats-area-select');
  const readout = document.querySelector('#stats-area-readout');
  const measureSelect = document.querySelector('#stats-map-measure');
  const palette = ['#e0e8d9', '#c4d6b8', '#9dbb9b', '#729b80', '#467762', '#244f45'];
  const ns = 'http://www.w3.org/2000/svg';
  const fmt = new Intl.NumberFormat('en-GB');
  const one = value => Number(value).toFixed(1);
  const el = (name, attrs = {}, content = '') => {
    const node = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (content) node.textContent = content;
    return node;
  };
  const points = geometry => geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  const bounds = coords => [Math.min(...coords.map(p => p[0])), Math.min(...coords.map(p => p[1])), Math.max(...coords.map(p => p[0])), Math.max(...coords.map(p => p[1]))];
  const colour = (value, bins) => { const i = bins.slice(1).findIndex(end => value <= end); return palette[i < 0 ? palette.length - 1 : i]; };
  let data, selected, featurePaths = new Map(), mapGroup, selectionPath;
  let W = 700, H = study === 'youth' ? 610 : 540, camera, project, zoom = 1, drag = null, suppressClick = false;

  function mapMetric() {
    if (study === 'youth') return {field: 'nonemployment_rate', bins: [0, 10, 20, 30, 40, 50, 60], labels: ['0', '10', '20', '30', '40', '50', '60%'], title: 'Share of young residents without paid work'};
    if (measureSelect.value === 'share') return {field: 'professional_share', bins: [0, 15, 30, 45, 60, 75, 100], labels: ['0', '15', '30', '45', '60', '75', '100%'], title: 'Share of mapped Airbnb listings in each borough'};
    return {field: 'professional_listings', bins: [0, 250, 500, 1000, 2000, 4000, 6000], labels: ['0', '250', '500', '1k', '2k', '4k', '6k'], title: 'Listings associated with the selected host segment'};
  }

  function paintMap() {
    const metric = mapMetric();
    for (const feature of data.features) featurePaths.get(feature.properties.code).setAttribute('fill', colour(feature.properties[metric.field], metric.bins));
    const legend = document.querySelector('#stats-map-legend');
    legend.replaceChildren();
    const title = document.createElement('p'); title.textContent = metric.title;
    const scale = document.createElement('div'); scale.className = 'stats-legend-scale';
    palette.forEach(c => { const swatch = document.createElement('span'); swatch.style.background = c; scale.append(swatch); });
    const labels = document.createElement('div'); labels.className = 'stats-legend-values';
    metric.labels.forEach(label => { const span = document.createElement('span'); span.textContent = label; labels.append(span); });
    legend.append(title, scale, labels);
  }

  function statistic(list, label, value, small = false) {
    const group = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value; if (small) dd.className = 'small-stat';
    group.append(dt, dd); list.append(group);
  }

  function choose(code) {
    selected = data.features.find(f => f.properties.code === code) || data.features[0];
    select.value = selected.properties.code;
    const p = selected.properties;
    selectionPath.setAttribute('d', featurePaths.get(p.code).getAttribute('d'));
    readout.replaceChildren();
    const heading = document.createElement('h4'); heading.textContent = p.name;
    const list = document.createElement('dl'); list.className = 'stats-area-stats';
    const context = document.createElement('p'); context.className = 'stats-area-comparison';
    if (study === 'airbnb') {
      statistic(list, 'Listings associated with professional hosts', fmt.format(p.professional_listings));
      statistic(list, 'Share of borough Airbnb listings', `${one(p.professional_share)}%`);
      statistic(list, 'All mapped Airbnb listings', fmt.format(p.total_listings), true);
      context.textContent = 'The citywide share is 36.1%. This percentage describes the Airbnb market, not local housing stock.';
    } else {
      statistic(list, 'Young residents without paid work', `${one(p.nonemployment_rate)}%`);
      statistic(list, 'Non-working young residents', fmt.format(p.nonworking_youth), true);
      statistic(list, 'All residents aged 15 to under 27', fmt.format(p.total_youth), true);
      context.textContent = `The median municipality is ${one(data.median_rate)}%. Counts are rounded, so small differences should be read cautiously.`;
    }
    readout.append(heading, list, context);
  }

  function pathOf(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map((coord, i) => {
      const [x, y] = project(coord); return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join('') + 'Z').join('')).join('');
  }

  function applyCamera() {
    svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.w} ${camera.h}`);
    svg.classList.toggle('is-zoomed', zoom > 1.001);
    document.querySelector('[data-map-action="out"]').disabled = zoom <= 1.001;
    document.querySelector('[data-map-action="in"]').disabled = zoom >= 12;
  }

  function setZoom(next, center) {
    next = Math.min(12, Math.max(1, next));
    if (next === 1) { zoom = 1; camera = {x: 0, y: 0, w: W, h: H}; applyCamera(); return; }
    const [cx, cy] = center || [camera.x + camera.w / 2, camera.y + camera.h / 2];
    zoom = next;
    camera = {x: cx - W / zoom / 2, y: cy - H / zoom / 2, w: W / zoom, h: H / zoom};
    applyCamera();
  }

  function buildMap() {
    const activeCode = selected?.properties.code;
    W = svg.getBoundingClientRect().width < 500 ? 430 : 700;
    const coords = data.features.flatMap(f => points(f.geometry));
    const geographicBounds = bounds(coords);
    const cosine = Math.cos((geographicBounds[1] + geographicBounds[3]) / 2 * Math.PI / 180);
    const projected = coords.map(([x, y]) => [x * cosine, -y]);
    const [minX, minY, maxX, maxY] = bounds(projected);
    const scale = Math.min((W - 44) / (maxX - minX), (H - 135) / (maxY - minY));
    const ox = (W - (maxX - minX) * scale) / 2, oy = 57 + (H - 135 - (maxY - minY) * scale) / 2;
    project = ([x, y]) => [(x * cosine - minX) * scale + ox, (-y - minY) * scale + oy];
    svg.replaceChildren(el('title', {}, study === 'airbnb' ? 'London Airbnb activity by borough' : 'Youth non-employment across Dutch municipalities'));
    mapGroup = el('g'); featurePaths = new Map();
    data.features.forEach(feature => {
      const path = el('path', {d: pathOf(feature.geometry), class: 'stats-area', 'fill-rule': 'evenodd', 'data-code': feature.properties.code});
      const p = feature.properties;
      path.append(el('title', {}, study === 'airbnb' ? `${p.name}: ${fmt.format(p.professional_listings)} selected-host listings, ${one(p.professional_share)}% of borough Airbnb listings` : `${p.name}: ${one(p.nonemployment_rate)}% of young residents without paid work`));
      path.addEventListener('click', () => { if (!suppressClick) choose(p.code); });
      mapGroup.append(path); featurePaths.set(p.code, path);
    });
    selectionPath = el('path', {class: 'stats-selected-outline', 'fill-rule': 'evenodd'});
    mapGroup.append(selectionPath); svg.append(mapGroup);
    paintMap();
    choose(activeCode || (study === 'airbnb' ? 'E09000033' : 'GM0363'));
    setZoom(1);
  }

  function drawSensitivity() {
    const container = document.querySelector('#sensitivity-chart');
    if (!container) return;
    const mobile = container.getBoundingClientRect().width < 600;
    const width = mobile ? 390 : 900, height = mobile ? 265 : 248;
    const chart = el('svg', {viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'The age 20 to 25 coefficient is positive 1.44 in all 342 municipalities, but approximately negative 0.42 and statistically non-significant after excluding six influential municipalities.'});
    const margin = mobile ? {left: 28, right: 32} : {left: 285, right: 60};
    const x = value => margin.left + (value + 1) / 3 * (width - margin.left - margin.right);
    const rows = mobile ? [66, 163] : [62, 150];
    const bottom = mobile ? 211 : 203;
    [-1, 0, 1, 2].forEach(value => {
      chart.append(el('line', {x1:x(value), x2:x(value), y1:mobile ? 42 : 30, y2:bottom, stroke:value===0?'#799183':'#d4dbcf', 'stroke-width':value===0?1.5:1, 'stroke-dasharray':value===0?'4 4':'0'}));
      chart.append(el('text', {x:x(value), y:bottom+22, 'text-anchor':'middle', fill:'#526458', 'font-family':'Arial,sans-serif', 'font-size':14}, value > 0 ? `+${value}` : `${value}`));
    });
    const configs = [{label:'All 342 municipalities',value:1.443478,display:'+1.44',p:'p < 0.001',colour:'#2f6654'}, {label:'Excluding six influential places',value:-0.42,display:'≈ −0.42',p:'p = 0.19',colour:'#9b6c48'}];
    configs.forEach((r, i) => {
      const y = rows[i];
      chart.append(el('text', {x:mobile?margin.left:0, y:mobile?y-33:y-5, fill:'#243b30','font-family':'Arial,sans-serif','font-size':mobile?14:16,'font-weight':600},r.label));
      if (!mobile) chart.append(el('text',{x:0,y:y+18,fill:'#526458','font-family':'Arial,sans-serif','font-size':14},r.p));
      chart.append(el('line',{x1:x(0),x2:x(r.value),y1:y,y2:y,stroke:r.colour,'stroke-width':3}));
      chart.append(el('circle',{cx:x(r.value),cy:y,r:6,fill:r.colour}));
      chart.append(el('text',{x:x(r.value),y:y-13,'text-anchor':'middle',fill:r.colour,'font-family':'Arial,sans-serif','font-size':17,'font-weight':700},r.display));
      if (mobile) chart.append(el('text',{x:width-margin.right,y:y+25,'text-anchor':'end',fill:'#526458','font-family':'Arial,sans-serif','font-size':13},r.p));
    });
    chart.append(el('text',{x:(margin.left+width-margin.right)/2,y:height-5,'text-anchor':'middle',fill:'#526458','font-family':'Arial,sans-serif','font-size':mobile?12:14},'Percentage-point association'));
    container.replaceChildren(chart);
  }

  document.querySelectorAll('[data-map-action]').forEach(button => button.addEventListener('click', () => {
    if (!camera) return;
    const action = button.dataset.mapAction;
    if (action === 'in') setZoom(zoom * 1.5);
    if (action === 'out') setZoom(zoom / 1.5);
    if (action === 'reset') setZoom(1);
    if (action === 'focus' && selected) {
      const [x1,y1,x2,y2] = bounds(points(selected.geometry).map(project));
      const target = Math.min(W/(x2-x1+18), H/(y2-y1+18)) * .7;
      setZoom(target,[(x1+x2)/2,(y1+y2)/2]);
    }
  }));
  select.addEventListener('change', () => choose(select.value));
  measureSelect?.addEventListener('change', paintMap);
  svg.addEventListener('pointerdown', event => {
    if (zoom <= 1 || event.button !== 0) return;
    const matrix = svg.getScreenCTM();
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,cx:camera.x,cy:camera.y,sx:matrix.a,sy:matrix.d,moved:false,code:event.target.dataset.code};
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    if (Math.hypot(dx,dy)>4) drag.moved=true;
    if (!drag.moved) return;
    svg.classList.add('is-panning');
    camera.x=drag.cx-dx/drag.sx; camera.y=drag.cy-dy/drag.sy; applyCamera();
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick=drag.moved;
    if(!drag.moved && drag.code) choose(drag.code);
    drag=null; svg.classList.remove('is-panning');
    if(svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    setTimeout(()=>{suppressClick=false;},0);
  }
  svg.addEventListener('pointerup',endDrag);
  svg.addEventListener('pointercancel',endDrag);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{if(data)buildMap();drawSensitivity();},150);
  });
  drawSensitivity();
  fetch(`assets/data/${study === 'airbnb' ? 'london-airbnb' : 'youth-nonemployment'}.json`)
    .then(response=>{if(!response.ok)throw new Error('Map data unavailable');return response.json();})
    .then(result=>{
      data=result; select.replaceChildren();
      [...data.features].sort((a,b)=>a.properties.name.localeCompare(b.properties.name)).forEach(feature=>{
        const option=document.createElement('option');option.value=feature.properties.code;option.textContent=feature.properties.name;select.append(option);
      });
      select.disabled=false;buildMap();
    }).catch(()=>{
      const note=document.createElement('p');note.className='stats-map-error';note.textContent='The map data could not be loaded. The source data download and the study’s main findings remain available below.';
      svg.replaceWith(note);select.options[0].textContent='Map unavailable';
    });
})();
