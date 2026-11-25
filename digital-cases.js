/* Portfolio map reconstructions. Original source projects are linked on each page. */
(() => {
  'use strict';
  const page = document.body.dataset.page;
  if (!['heritage', 'lighting'].includes(page)) return;
  const canvas = document.getElementById('digital-map');
  const status = document.getElementById('digital-map-status');
  const ctx = canvas.getContext('2d');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const intersects = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  const colours = { tree: '#5e8870', bench: '#96795c', signal: '#786383', bus_stop: '#47788c' };
  const categoryNames = { park: 'Park', memorial: 'Memorial', church: 'Place of worship', listed: 'Grade I listed building' };
  let data, paths, ready = false, selected = null, night = 1, request = 0;
  let width = 1, height = 1, dpr = 1, baseScale = 1;
  const latRef = page === 'heritage' ? 51.53 : 52.36;
  const mx = 111320 * Math.cos(latRef * Math.PI / 180), my = 111320;
  const origin = page === 'heritage' ? [-.15, 51.53] : [4.9, 52.36];
  const project = c => [(c[0] - origin[0]) * mx, -(c[1] - origin[1]) * my];
  const unproject = p => [p[0] / mx + origin[0], -p[1] / my + origin[1]];
  let extent, view = { x: 0, y: 0, k: 1 };
  const pointers = new Map();
  let gesture = null;
  const controls = [...document.querySelectorAll('[data-map-action]')];
  const dataInputs = [...document.querySelectorAll('.digital-map-aside input, .digital-map-aside select')];
  [...controls, ...dataInputs].forEach(b => { b.disabled = true; });

  function linePath(lines) {
    const p = new Path2D();
    for (const line of lines) for (let i = 0; i < line.length; i++) {
      const q = project(line[i]);
      if (!i) p.moveTo(...q); else p.lineTo(...q);
    }
    return p;
  }
  function polygonPath(items) {
    const p = new Path2D();
    for (const g of items) {
      const polygons = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      for (const poly of polygons) for (const ring of poly) {
        ring.forEach((c, i) => { const q = project(c); if (!i) p.moveTo(...q); else p.lineTo(...q); });
        p.closePath();
      }
    }
    return p;
  }
  function bboxCoordinates(items) {
    const points = [];
    const walk = c => { if (typeof c[0] === 'number') points.push(project(c)); else c.forEach(walk); };
    items.forEach(g => walk(g.coordinates));
    return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  }
  function scale() { return baseScale * view.k; }
  function screen(p) { return [(p[0] - view.x) * scale() + width / 2, (p[1] - view.y) * scale() + height / 2]; }
  function world(p) { return [(p[0] - width / 2) / scale() + view.x, (p[1] - height / 2) / scale() + view.y]; }
  function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function bounds() {
    const nw = unproject(world([0, 0])), se = unproject(world([width, height]));
    return [nw[0], se[1], se[0], nw[1]];
  }
  function constrain() {
    view.k = clamp(view.k, 1, 16);
    const hx = width / (2 * scale()), hy = height / (2 * scale());
    const xMin = extent[0] - 150, xMax = extent[2] + 150, yMin = extent[1] - 150, yMax = extent[3] + 150;
    view.x = xMax - xMin < hx * 2 ? (xMin + xMax) / 2 : clamp(view.x, xMin + hx, xMax - hx);
    view.y = yMax - yMin < hy * 2 ? (yMin + yMax) / 2 : clamp(view.y, yMin + hy, yMax - hy);
  }
  function reset() {
    view = { x: (extent[0] + extent[2]) / 2, y: (extent[1] + extent[3]) / 2, k: 1 };
    if (page === 'lighting') document.getElementById('lighting-area').value = 'all';
    drawSoon();
  }
  function zoom(factor, anchor = [width / 2, height / 2]) {
    const before = world(anchor);
    view.k = clamp(view.k * factor, 1, 16);
    view.x = before[0] - (anchor[0] - width / 2) / scale();
    view.y = before[1] - (anchor[1] - height / 2) / scale();
    constrain(); drawSoon();
  }
  function focus(lng, lat, k) { const p = project([lng, lat]); view = {x: p[0], y: p[1], k}; constrain(); drawSoon(); }
  function drawSoon() { if (!request && ready) request = requestAnimationFrame(() => { request = 0; draw(); }); }
  function mix(a, b, t) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
  function label(text, p, colour, align = 'center') {
    const q = screen(p);
    if (q[0] < 10 || q[0] > width - 10 || q[1] < 15 || q[1] > height - 20) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '12px Arial, sans-serif'; ctx.textAlign = align;
    ctx.lineWidth = 4; ctx.strokeStyle = '#e9eee6'; ctx.lineJoin = 'round'; ctx.strokeText(text, q[0], q[1]);
    ctx.fillStyle = colour; ctx.fillText(text, q[0], q[1]);
    mapTransform();
  }
  function mapTransform() { const s = scale(); ctx.setTransform(dpr*s, 0, 0, dpr*s, dpr*(width/2-view.x*s), dpr*(height/2-view.y*s)); }
  function drawHeritage() {
    ctx.fillStyle = '#e9eee6'; ctx.fillRect(0, 0, width, height);
    mapTransform(); ctx.fillStyle = '#f4f2e9'; ctx.strokeStyle = '#aab9ab'; ctx.lineWidth = 1 / scale();
    ctx.fill(paths.boundaries, 'evenodd'); ctx.stroke(paths.boundaries);
    for (const input of document.querySelectorAll('.digital-layer-options input')) if (input.checked) {
      ctx.fillStyle = colours[input.value]; ctx.globalAlpha = .74;
      const radius = (view.k < 2 ? 1 : 1.6) / scale();
      ctx.beginPath();
      for (const q of paths.cues[input.value]) { const s = screen(q); if (s[0] < -5 || s[0] > width+5 || s[1] < -5 || s[1] > height+5) continue; ctx.moveTo(q[0]+radius,q[1]); ctx.arc(q[0],q[1],radius,0,Math.PI*2); }
      ctx.fill(); ctx.globalAlpha = 1;
    }
    if (document.getElementById('heritage-sites').checked) {
      ctx.fillStyle = '#ae633f'; ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 1.1 / scale();
      for (let i=0;i<data.sites.length;i++) { const q=paths.sites[i],r=(selected===i?6:3.5)/scale();ctx.beginPath();ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.fill();ctx.stroke(); }
      if (selected !== null) {
        const q=paths.sites[selected];label(data.sites[selected].name,[q[0],q[1]-14/scale()],'#784b32');
      } else if(view.k<2) {
        label('Camden',project([-.151,51.552]),'#506657');label('Westminster',project([-.174,51.512]),'#506657');
      }
    }
  }
  function drawLighting() {
    ctx.fillStyle = mix([234,237,228],[17,34,40],night); ctx.fillRect(0,0,width,height);
    mapTransform();ctx.fillStyle=mix([245,244,235],[23,42,47],night);ctx.fill(paths.boundaries,'evenodd');
    ctx.strokeStyle=mix([162,177,166],[57,77,79],night);ctx.lineWidth=.6/scale();ctx.stroke(paths.roads);
    ctx.strokeStyle=mix([171,112,62],[239,188,106],night);ctx.lineWidth=(.8+night*.3)/scale();ctx.stroke(paths.lit);
    const b=bounds();let total=0,lit=0;
    for(const r of data.roads) if(intersects(r[0],b)){total+=r[1];if(r[2])lit+=r[1];}
    document.getElementById('lighting-percentage').textContent=total?`${Math.round(lit/total*100)}%`:'No roads';
    document.getElementById('lighting-lengths').textContent=total?`${(lit/1000).toFixed(1)} km identified as lit / ${(total/1000).toFixed(1)} km included`:'Move back towards the mapped area.';
  }
  function draw() {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    if(page==='heritage')drawHeritage();else drawLighting();
    const target=100/scale(), magnitude=10**Math.floor(Math.log10(target));
    const metres=[1,2,5,10].map(v=>v*magnitude).filter(v=>v<=target).pop()||magnitude;
    const ruler=document.getElementById('digital-map-scale');ruler.style.width=`${metres*scale()}px`;ruler.textContent=metres>=1000?`${metres/1000} km`:`${metres} m`;
    controls.find(b=>b.dataset.mapAction==='out').disabled=view.k<=1.001;
    controls.find(b=>b.dataset.mapAction==='in').disabled=view.k>=15.999;
  }
  function resize() {
    const r=canvas.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    if(extent){baseScale=Math.min(width/(extent[2]-extent[0]),height/(extent[3]-extent[1]))*.90;constrain();drawSoon();}
  }
  function pickSite(index) {
    selected=index;document.getElementById('heritage-site').value=String(index);
    const site=data.sites[index];document.getElementById('heritage-sites').checked=true;
    document.getElementById('heritage-detail').textContent=`${site.name}. ${categoryNames[site.type]||'Heritage destination'}. The surrounding points are environmental cues, not a generated walking route.`;
  }
  function beginGesture(){
    const p=[...pointers.values()];
    if(p.length===1)gesture={kind:'pan',start:p[0],last:p[0],view:{...view},moved:false};
    else if(p.length>=2){const mid=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2];gesture={kind:'pinch',distance:Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),world:world(mid),k:view.k,moved:true};}
  }
  canvas.addEventListener('pointerdown',e=>{if(!ready||e.button>0)return;canvas.focus({preventScroll:true});pointers.set(e.pointerId,local(e));canvas.setPointerCapture(e.pointerId);beginGesture();canvas.classList.add('is-dragging');});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,local(e));const p=[...pointers.values()];
    if(gesture.kind==='pinch'&&p.length>=2){const distance=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),mid=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2];view.k=clamp(gesture.k*distance/Math.max(1,gesture.distance),1,16);view.x=gesture.world[0]-(mid[0]-width/2)/scale();view.y=gesture.world[1]-(mid[1]-height/2)/scale();}
    else if(gesture.kind==='pan'){const q=p[0],dx=q[0]-gesture.start[0],dy=q[1]-gesture.start[1];gesture.moved||=Math.hypot(dx,dy)>4;view.x=gesture.view.x-dx/scale();view.y=gesture.view.y-dy/scale();}
    constrain();drawSoon();
  });
  function endPointer(e,cancelled=false){
    if(!pointers.has(e.pointerId))return;
    if(!cancelled&&page==='heritage'&&gesture?.kind==='pan'&&!gesture.moved&&document.getElementById('heritage-sites').checked){const q=local(e);let best=-1,distance=12;paths.sites.forEach((p,i)=>{const s=screen(p),d=Math.hypot(q[0]-s[0],q[1]-s[1]);if(d<distance){best=i;distance=d;}});if(best>=0)pickSite(best);drawSoon();}
    pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(pointers.size){beginGesture();gesture.moved=true;}else{gesture=null;canvas.classList.remove('is-dragging');}
  }
  canvas.addEventListener('pointerup',e=>endPointer(e));canvas.addEventListener('pointercancel',e=>endPointer(e,true));
  window.addEventListener('blur',()=>{pointers.clear();gesture=null;canvas.classList.remove('is-dragging');});
  canvas.addEventListener('keydown',e=>{
    if(!ready)return;let handled=true;
    if(e.key==='+'||e.key==='=')zoom(1.5);else if(e.key==='-')zoom(1/1.5);else if(e.key==='Home'||e.key==='0')reset();
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const step=(e.shiftKey?120:55)/scale();view.x+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;view.y+=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;constrain();drawSoon();}else handled=false;
    if(handled)e.preventDefault();
  });
  controls.forEach(b=>b.addEventListener('click',()=>{if(!ready)return;const a=b.dataset.mapAction;if(a==='reset')reset();else zoom(a==='in'?1.5:1/1.5);}));
  // Deliberately leave wheel events to page/browser scrolling. Explicit map
  // controls and touch gestures avoid surprising scroll capture in a case study.
  new ResizeObserver(resize).observe(canvas.parentElement);

  async function load(){
    const url=`assets/data/digital-${page==='heritage'?'heritage.json':'lighting.json.gz'}`;
    const r=await fetch(url);if(!r.ok)throw new Error(`Data ${r.status}`);
    if(page==='heritage')data=await r.json();else{
      const bytes=new Uint8Array(await r.arrayBuffer());
      if(bytes[0]===31&&bytes[1]===139){if(!('DecompressionStream'in window))throw new Error('Decompression unavailable');data=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}
      else data=JSON.parse(new TextDecoder().decode(bytes));
    }
    if(page==='heritage'){
      extent=bboxCoordinates(data.boundary);paths={boundaries:polygonPath(data.boundary),sites:data.sites.map(s=>project(s.coordinates)),cues:Object.fromEntries(Object.entries(data.cues).map(([k,points])=>[k,points.map(project)]))};
      const select=document.getElementById('heritage-site');
      data.sites.map((s,i)=>({...s,index:i})).sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{const option=document.createElement('option');option.value=s.index;option.textContent=s.name;select.append(option);});
      select.addEventListener('change',()=>{if(select.value===''){selected=null;reset();return;}const i=Number(select.value);pickSite(i);focus(...data.sites[i].coordinates,6);});
      document.querySelectorAll('.digital-map-aside input[type=checkbox]').forEach(el=>el.addEventListener('change',drawSoon));
    }else{
      const nw=project([4.728,52.432]),se=project([5.106,52.277]);extent=[nw[0],nw[1],se[0],se[1]];
      const roadsPath=new Path2D(),litPath=new Path2D();
      for(const r of data.roads) for(const line of r[3]){let x=0,y=0;line.forEach((c,i)=>{x=i?x+c[0]:c[0];y=i?y+c[1]:c[1];const p=project([x/data.scale+data.origin[0],y/data.scale+data.origin[1]]);if(!i){roadsPath.moveTo(...p);if(r[2])litPath.moveTo(...p);}else{roadsPath.lineTo(...p);if(r[2])litPath.lineTo(...p);}});delete r[3];}
      paths={roads:roadsPath,lit:litPath,boundaries:polygonPath(data.neighbourhoods)};
      document.getElementById('lighting-display').addEventListener('input',e=>{night=Number(e.target.value)/100;document.getElementById('lighting-display-value').textContent=night===0?'Day':night===1?'Night':`${Math.round(night*100)}% night`;drawSoon();});
      document.getElementById('lighting-area').addEventListener('change',e=>{const presets={centre:[4.889,52.373,5],north:[4.938,52.400,4],southeast:[4.972,52.315,4]};const p=presets[e.target.value];if(p)focus(...p);else reset();});
    }
    ready=true;[...controls,...dataInputs].forEach(b=>{b.disabled=false;});status.hidden=true;resize();reset();
  }
  load().catch(error=>{console.warn('Portfolio map could not load:',error);status.textContent='The map could not load here. The original interactive remains available through the link above.';controls.forEach(b=>{b.disabled=true;});});
})();
