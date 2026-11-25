'use strict';
const NS='http://www.w3.org/2000/svg';
const fmt=new Intl.NumberFormat('en-GB',{maximumFractionDigits:0});
const thresholds=[30,45,60,90,120];
const colors=['#d9e7d9','#a9cbb1','#77ad92','#458b75','#206b5e','#174b48'];
const zero='#dce4dc', missing='#aeb6b9';
const page=document.body.dataset.page;
let dataset, context, route, stations, provenance, summary;
let metric='gain', budget=3, selected='BU01710101', mapPaths=new Map();
const MAP_WIDTH=760, MAP_HEIGHT=590, MAP_MAX_ZOOM=16;
let mapViewport, mapProjection, mapSymbols=[];
let mapView={k:1,x:0,y:0}, mapGesture=null, mapPointers=new Map(), ignoreMapClickUntil=0;
const $=id=>document.getElementById(id);
function svgEl(tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;}
function safeNum(value){return value===null||value===undefined||!Number.isFinite(value)?null:value;}
function values(f){const p=f.properties,a=safeNum(p.baseline?.[budget]),b=safeNum(p.scenario?.[budget]);return{baseline:a,scenario:b,gain:a===null||b===null?null:b-a};}
function scaleSpec(){return metric==='gain'?{breaks:[0,1000,5000,20000,50000,100000],labels:['1','1k','5k','20k','50k','100k+'],title:'Additional reachable jobs'}:{breaks:[0,100000,250000,500000,1000000,2000000],labels:['1','100k','250k','500k','1m','2m+'],title:'Estimated reachable jobs'};}
function colorFor(v){if(v===null)return missing;if(v===0)return zero;if(v<0)return '#bc806a';const b=scaleSpec().breaks;let i=0;for(let j=0;j<b.length;j++)if(v>=b[j])i=j;return colors[i];}
function getCoords(geometry){if(!geometry)return[];const t=geometry.type,c=geometry.coordinates;if(t==='Point')return[c];if(t==='LineString'||t==='MultiPoint')return c;if(t==='Polygon'||t==='MultiLineString')return c.flat();if(t==='MultiPolygon')return c.flat(2);return[];}
function projector(width,height){const coords=dataset.features.flatMap(f=>getCoords(f.geometry));const radians=Math.PI/180,lat=52.6*radians, x=v=>v[0]*Math.cos(lat), y=v=>-v[1];let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of coords){x0=Math.min(x0,x(p));x1=Math.max(x1,x(p));y0=Math.min(y0,y(p));y1=Math.max(y1,y(p));}const padX=36,padY=31,scale=Math.min((width-2*padX)/(x1-x0),(height-2*padY)/(y1-y0));const ox=(width-(x1-x0)*scale)/2,oy=(height-(y1-y0)*scale)/2;return p=>[(x(p)-x0)*scale+ox,(y(p)-y0)*scale+oy];}
function pathFor(g,project){const line=(pts,close)=>pts.map((p,i)=>{const[x,y]=project(p);return(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2);}).join('')+(close?'Z':'');switch(g?.type){case'Polygon':return g.coordinates.map(r=>line(r,true)).join('');case'MultiPolygon':return g.coordinates.flatMap(poly=>poly.map(r=>line(r,true))).join('');case'LineString':return line(g.coordinates,false);case'MultiLineString':return g.coordinates.map(r=>line(r,false)).join('');default:return'';}}
function drawMap(svg,interactive=false){
 const width=interactive?MAP_WIDTH:680,height=interactive?MAP_HEIGHT:490,project=projector(width,height);
 svg.replaceChildren();svg.append(svgEl('title',{},interactive?'Explore estimated job accessibility':'Modelled additional job access within 90 minutes'));
 const defs=svgEl('defs'),clip=svgEl('clipPath',{id:interactive?'map-clip':'home-clip'});
 clip.append(svgEl('rect',{width,height}));defs.append(clip);svg.append(defs);
 const frame=svgEl('g',interactive?{}:{'clip-path':'url(#home-clip)'}),group=svgEl('g');frame.append(group);svg.append(frame);
 if(interactive){mapViewport=group;mapViewport.id='map-geography';mapProjection=project;mapSymbols=[];mapPaths.clear();}
 for(const f of context.features)group.append(svgEl('path',{d:pathFor(f.geometry,project),class:'geo-context'}));
 const areas=svgEl('g');group.append(areas);
 for(const f of dataset.features){
  const p=svgEl('path',{d:pathFor(f.geometry,project),fill:colorFor(values(f)[metric]),class:'geo-area','data-code':f.properties.code});
  if(interactive){mapPaths.set(f.properties.code,p);p.addEventListener('click',()=>{if(Date.now()>=ignoreMapClickUntil)selectArea(f.properties.code);});p.addEventListener('pointermove',ev=>showTooltip(ev,f));p.addEventListener('pointerleave',()=>{$('map-tooltip').hidden=true;});}
  areas.append(p);
 }
 for(const f of route.features)group.append(svgEl('path',{d:pathFor(f.geometry,project),class:'geo-route'}));
 for(const f of stations.features){
  const[x,y]=project(f.geometry.coordinates),name=f.properties.stop_name;
  const symbol=svgEl('g',{transform:`translate(${x} ${y})`,class:'station-symbol'});
  symbol.append(svgEl('circle',{cx:0,cy:0,r:interactive?3.6:3.4,class:'geo-station'}));
  let dx=7,dy=-7;if(/Leeuwarden/i.test(name)){dx=-9;dy=-9;}if(/Lelystad/i.test(name)){dx=-8;dy=16;}if(/Almere/i.test(name)){dx=-8;dy=17;}
  symbol.append(svgEl('text',{x:dx,y:dy,class:'station-label','text-anchor':dx<0?'end':'start'},name?.replace(' Centrum','').replace(' (Lelylijn)','')));
  group.append(symbol);if(interactive)mapSymbols.push({element:symbol,x,y});
 }
 if(interactive){
  const north=svgEl('g',{'aria-hidden':'true'});north.append(svgEl('text',{x:width-30,y:25,'font-size':10,fill:'#526d65'},'N'));north.append(svgEl('path',{d:`M${width-26},31 l-4,11 4,-3 4,3 Z`,fill:'#526d65'}));svg.append(north);
 }
}
function boundedMapView(k,x,y){
 k=Math.max(1,Math.min(MAP_MAX_ZOOM,k));
 return{k,x:Math.max(MAP_WIDTH*(1-k),Math.min(0,x)),y:Math.max(MAP_HEIGHT*(1-k),Math.min(0,y))};
}
function applyMapView(next){
 mapView=boundedMapView(next.k,next.x,next.y);
 mapViewport.setAttribute('transform',`translate(${mapView.x} ${mapView.y}) scale(${mapView.k})`);
 mapSymbols.forEach(s=>s.element.setAttribute('transform',`translate(${s.x} ${s.y}) scale(${1/mapView.k})`));
 $('detail-map').classList.toggle('is-zoomed',mapView.k>1);
 $('map-tooltip').hidden=true;
}
function zoomMapAt(k,anchor={x:MAP_WIDTH/2,y:MAP_HEIGHT/2}){
 k=Math.max(1,Math.min(MAP_MAX_ZOOM,k));
 const local={x:(anchor.x-mapView.x)/mapView.k,y:(anchor.y-mapView.y)/mapView.k};
 applyMapView({k,x:anchor.x-local.x*k,y:anchor.y-local.y*k});
}
function fullMap(){applyMapView({k:1,x:0,y:0});}
function focusMapPoint(point,k){const[x,y]=mapProjection(point);applyMapView({k,x:MAP_WIDTH/2-x*k,y:MAP_HEIGHT/2-y*k});}
function focusSelectedArea(){
 const feature=dataset.features.find(f=>f.properties.code===selected);if(!feature)return;
 const points=getCoords(feature.geometry).map(mapProjection);if(!points.length)return;
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 points.forEach(([x,y])=>{x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);});
 const k=Math.max(1,Math.min(MAP_MAX_ZOOM,(MAP_WIDTH-150)/Math.max(1,x1-x0),(MAP_HEIGHT-150)/Math.max(1,y1-y0)));
 applyMapView({k,x:MAP_WIDTH/2-(x0+x1)/2*k,y:MAP_HEIGHT/2-(y0+y1)/2*k});
}
function mapPointerPosition(event){
 const matrix=$('detail-map').getScreenCTM();
 if(!matrix)return{x:MAP_WIDTH/2,y:MAP_HEIGHT/2};
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return{x:point.x,y:point.y};
}
function beginMapGesture(){
 const points=[...mapPointers.values()];
 if(points.length>=2){
  const a=points[0].point,b=points[1].point,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  mapGesture={mode:'pinch',moved:true,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),view:{...mapView},anchor:{x:(center.x-mapView.x)/mapView.k,y:(center.y-mapView.y)/mapView.k}};
 }else if(points.length===1){
  mapGesture={mode:'pan',moved:false,origin:points[0].point,client:points[0].client,view:{...mapView}};
 }else mapGesture=null;
}
function setupMapNavigation(){
 const svg=$('detail-map');
 svg.addEventListener('wheel',event=>{
  if(mapView.k<=1&&event.deltaY>0)return;
  event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?MAP_HEIGHT:1),factor=Math.exp(-Math.max(-200,Math.min(200,delta))*.005);
  zoomMapAt(mapView.k*factor,mapPointerPosition(event));
 },{passive:false});
 svg.addEventListener('dblclick',event=>{event.preventDefault();ignoreMapClickUntil=Date.now()+350;zoomMapAt(mapView.k*(event.shiftKey?1/2:2),mapPointerPosition(event));});
 svg.addEventListener('keydown',event=>{
  let handled=true;
  if(event.key==='+'||event.key==='=')zoomMapAt(mapView.k*1.5);
  else if(event.key==='-'||event.key==='_')zoomMapAt(mapView.k/1.5);
  else if(event.key==='Home'||event.key==='0')fullMap();
  else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
   const delta=event.shiftKey?120:55;applyMapView({k:mapView.k,x:mapView.x+(event.key==='ArrowLeft'?delta:event.key==='ArrowRight'?-delta:0),y:mapView.y+(event.key==='ArrowUp'?delta:event.key==='ArrowDown'?-delta:0)});
  }else handled=false;
  if(handled)event.preventDefault();
 });
 svg.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  mapPointers.set(event.pointerId,{point:mapPointerPosition(event),client:{x:event.clientX,y:event.clientY},code:event.target.closest?.('.geo-area')?.dataset.code});
  svg.setPointerCapture(event.pointerId);if(event.pointerType==='mouse')svg.focus({preventScroll:true});
  $('map-tooltip').hidden=true;beginMapGesture();
 });
 svg.addEventListener('pointermove',event=>{
  if(!mapPointers.has(event.pointerId)||!mapGesture)return;
  const current=mapPointers.get(event.pointerId);current.point=mapPointerPosition(event);current.client={x:event.clientX,y:event.clientY};
  const points=[...mapPointers.values()];
  if(points.length>=2&&mapGesture.mode==='pinch'){
   const a=points[0].point,b=points[1].point,k=Math.max(1,Math.min(MAP_MAX_ZOOM,mapGesture.view.k*Math.hypot(a.x-b.x,a.y-b.y)/mapGesture.distance));
   applyMapView({k,x:(a.x+b.x)/2-mapGesture.anchor.x*k,y:(a.y+b.y)/2-mapGesture.anchor.y*k});
  }else if(mapGesture.mode==='pan'){
   if(Math.hypot(event.clientX-mapGesture.client.x,event.clientY-mapGesture.client.y)>5)mapGesture.moved=true;
   if(mapGesture.moved)applyMapView({k:mapGesture.view.k,x:mapGesture.view.x+current.point.x-mapGesture.origin.x,y:mapGesture.view.y+current.point.y-mapGesture.origin.y});
  }
  if(mapGesture.moved)svg.classList.add('is-panning');
 });
 function finishPointer(event){
  const pointer=mapPointers.get(event.pointerId);if(!pointer)return;
  const wasGesture=mapGesture?.moved||mapGesture?.mode==='pinch';
  if(event.type==='pointerup'&&!wasGesture&&mapPointers.size===1&&pointer.code)selectArea(pointer.code);
  ignoreMapClickUntil=Date.now()+350;
  mapPointers.delete(event.pointerId);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
  beginMapGesture();if(mapGesture&&wasGesture)mapGesture.moved=true;
  if(!mapPointers.size)svg.classList.remove('is-panning');
 }
 svg.addEventListener('pointerup',finishPointer);svg.addEventListener('pointercancel',finishPointer);svg.addEventListener('lostpointercapture',finishPointer);
 window.addEventListener('blur',()=>{mapPointers.clear();mapGesture=null;svg.classList.remove('is-panning');ignoreMapClickUntil=Date.now()+350;});
 applyMapView({k:1,x:0,y:0});
}
function updateMap(){for(const f of dataset.features){const path=mapPaths.get(f.properties.code);if(path)path.setAttribute('fill',colorFor(values(f)[metric]));}const spec=scaleSpec(),legend=$('map-legend');legend.replaceChildren();const h=document.createElement('div');h.className='legend-heading';h.textContent=spec.title;legend.append(h);const bins=document.createElement('div');bins.className='legend-bins';colors.forEach(col=>{const i=document.createElement('i');i.style.background=col;bins.append(i);});legend.append(bins);const labels=document.createElement('div');labels.className='legend-labels';spec.labels.forEach(l=>{const s=document.createElement('span');s.textContent=l;labels.append(s);});legend.append(labels);const rest=document.createElement('div');rest.className='legend-secondary';for(const [label,col]of[['Zero',zero],['Missing',missing],['Outside study','#f7f5ef']]){const s=document.createElement('span'),i=document.createElement('i');i.style.background=col;s.append(i,document.createTextNode(label));rest.append(s);}legend.append(rest);
 const t=thresholds[budget];let total=0,gaining=0,weighted=0;for(const f of dataset.features){const v=values(f);if(f.properties.eligible&&v.gain!==null){const pop=f.properties.population;total+=pop;weighted+=v.gain*pop;if(v.gain>0)gaining+=pop;}}const pct=total?100*gaining/total:0;const strong=document.createElement('b');strong.textContent=pct.toFixed(1)+'%';$('reach-summary').replaceChildren(strong,document.createTextNode(` of residents in the broad study area gain additional reachable jobs within ${t} minutes.`));$('detail-map').setAttribute('aria-label',`${spec.title} within ${t} minutes across the study area. ${pct.toFixed(1)} percent of residents gain additional reachable jobs.`);renderReadout();}
function selectArea(code){const previous=mapPaths.get(selected);previous?.classList.remove('selected');selected=code;mapPaths.get(code)?.classList.add('selected');$('area-select').value=code;renderReadout();}
function renderReadout(){const f=dataset.features.find(f=>f.properties.code===selected);if(!f)return;const p=f.properties,v=values(f),box=$('area-readout');box.replaceChildren();const h=document.createElement('h3');h.className='area-name';h.textContent=p.name;const r=document.createElement('p');r.className='area-region';r.textContent=p.region;const dl=document.createElement('dl');dl.className='area-stats';for(const[label,key]of[['Existing network','baseline'],['With Lelylijn','scenario'],['Additional jobs','gain']]){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=v[key]===null?'No data':(key==='gain'&&v[key]>0?'+':'')+fmt.format(v[key]);div.append(dt,dd);dl.append(div);}box.append(h,r,dl);}
function showTooltip(ev,f){if(ev.pointerType==='touch'||mapPointers.size)return;const tip=$('map-tooltip'),rect=tip.parentElement.getBoundingClientRect(),v=values(f)[metric];tip.textContent=`${f.properties.name}: ${v===null?'no data':fmt.format(v)+' jobs'}`;tip.hidden=false;tip.style.left=Math.max(5,Math.min(ev.clientX-rect.left+12,rect.width-235))+'px';tip.style.top=Math.max(5,Math.min(ev.clientY-rect.top+14,rect.height-50))+'px';}
function setupAreas(){const select=$('area-select');select.replaceChildren();const sorted=[...dataset.features].sort((a,b)=>a.properties.name.localeCompare(b.properties.name));const fragment=document.createDocumentFragment();for(const f of sorted){const o=document.createElement('option');o.value=f.properties.code;o.textContent=f.properties.name+' · '+f.properties.region;fragment.append(o);}select.append(fragment);select.addEventListener('change',()=>{selectArea(select.value);focusSelectedArea();});selectArea(selected);}
function drawShares(){const box=$('share-chart');box.replaceChildren();for(const[label,value]of[['Share of residents',provenance.frames.primary.populationShare],['Share of accessibility gain',provenance.frames.primary.weightedGainShare]]){const row=document.createElement('div');row.className='share-row';const lab=document.createElement('div');lab.className='share-label';const s=document.createElement('span'),strong=document.createElement('strong');s.textContent=label;strong.textContent=(100*value).toFixed(1)+'%';lab.append(s,strong);const track=document.createElement('div');track.className='share-track';const fill=document.createElement('div');fill.className='share-fill';fill.style.width=100*value+'%';track.append(fill);row.append(lab,track);box.append(row);}}
function drawFairness(){
 const kind=$('fairness-measure').value;
 const config={
  gini:{title:'Change in overall inequality',description:'The Gini index measures how unevenly access is distributed. A reduction indicates more equal access within the population being evaluated.',unit:'Change in Gini index. Negative = more equal access.',min:-.020,max:0,mult:1,ticks:[-.02,-.01,0],digits:4,color:'#28675f'},
  fgt0:{title:'Change in low-accessibility incidence',description:'The share below a fixed benchmark: 145,056 reachable jobs, the primary population’s baseline median. This study-defined threshold is held constant across populations and scenarios.',unit:'Percentage-point change. Negative = fewer residents below the fixed benchmark.',min:-6,max:0,mult:100,ticks:[-6,-3,0],digits:2,color:'#28675f'},
  needs_gap:{title:'Change in relative needs-gap incidence',description:'The share living in neighbourhoods where relative socioeconomic need exceeds relative job access. Need combines income, car ownership and social-assistance receipt. Access is standardised separately for each scenario. The small rise reflects relative position, without implying that job access has fallen.',unit:'Percentage-point change. Positive = a larger share with need exceeding relative access. Uses complete socioeconomic data; analysed populations differ from the access comparison.',min:0,max:.25,mult:100,ticks:[0,.125,.25],digits:2,color:'#a7694b'}
 }[kind];
 $('fairness-title').textContent=config.title;
 $('fairness-description').textContent=config.description;
 $('fairness-unit').textContent=config.unit;
 const mobile=$('gini-chart').clientWidth<400;
 const width=mobile?360:510,height=mobile?261:184,x0=mobile?5:174,x1=mobile?286:422;
 const scale=v=>x0+(v-config.min)/(config.max-config.min)*(x1-x0);
 const svg=svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':config.title});
 svg.append(svgEl('title',{},config.title));
 const pops=['588,660 residents','2.82 million residents','6.03 million residents'];
 const labels=['Primary population','Five-region population','Broad study area'];
 for(const tick of config.ticks){
  const x=scale(tick);
  svg.append(svgEl('line',{x1:x,y1:mobile?35:12,x2:x,y2:mobile?230:147,stroke:'#ccd5cd','stroke-width':1}));
  svg.append(svgEl('text',{x,y:mobile?252:171,'text-anchor':mobile&&tick===config.min?'start':'middle',class:'axis-text'},kind==='gini'?tick.toFixed(2):String(tick)));
 }
 summary.frames.forEach((f,i)=>{
  const v=f[kind]*config.mult,y=mobile?52+i*78:26+i*48;
  svg.append(svgEl('text',{x:0,y:mobile?y-31:y+3},labels[i]));
  if(!mobile)svg.append(svgEl('text',{x:0,y:y+18,class:'axis-text'},kind==='needs_gap'?'Complete socioeconomic data':pops[i]));
  const zeroX=scale(0),valueX=scale(v);
  svg.append(svgEl('rect',{x:Math.min(zeroX,valueX),y:y-9,width:Math.max(1,Math.abs(valueX-zeroX)),height:18,fill:config.color}));
  svg.append(svgEl('text',{x:mobile?355:497,y:y+5,'text-anchor':'end',fill:config.color},(v>0?'+':'')+v.toFixed(config.digits)));
 });
 $('gini-chart').replaceChildren(svg);
}
function downloadData(){const headers=['neighbourhood_code','neighbourhood','region','population','eligible_summary','job_budget_minutes','baseline_jobs','scenario_jobs','additional_jobs'];const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const rows=dataset.features.map(f=>{const p=f.properties,v=values(f);return[p.code,p.name,p.region,p.population,p.eligible,thresholds[budget],v.baseline,v.scenario,v.gain].map(quote).join(',');});const blob=new Blob([headers.join(',')+'\r\n'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`lelylijn-accessibility-${thresholds[budget]}min.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function retailChart(){const rows=[['Emerson Park','280 m²',1384],['Near Elm Park','280 m²',1243],['Emerson Park','2,800 m²',1801],['Near Elm Park','2,800 m²',1619]],box=$('retail-chart');for(const [name,size,value]of rows){const row=document.createElement('div');row.className='mini-bar-row'+(value===1801?' best':'');const label=document.createElement('span');label.append(document.createTextNode(name),document.createElement('br'));const small=document.createElement('small');small.textContent=size;label.append(small);const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=(value/2000*100)+'%';track.append(fill);const num=document.createElement('span');num.textContent=fmt.format(value);row.append(label,track,num);box.append(row);}}
async function init(){if(page==='home'&&$('retail-chart'))retailChart();try{const paths=['lelylijn-neighbourhoods.geojson','lelylijn-context.geojson','lelylijn-route.geojson','lelylijn-stations.geojson','lelylijn-provenance.json','lelylijn-summary.json'];[dataset,context,route,stations,provenance,summary]=await Promise.all(paths.map(async path=>{const r=await fetch('assets/data/'+path+'?v=20261119geometry');if(!r.ok)throw Error('Unable to load '+path);return r.json();}));if(page==='home'){drawMap($('home-map'));return;}drawMap($('detail-map'),true);setupMapNavigation();setupAreas();updateMap();drawShares();drawFairness();document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));updateMap();}));$('travel-time').addEventListener('change',ev=>{budget=Number(ev.target.value);updateMap();});$('fairness-measure').addEventListener('change',drawFairness);window.addEventListener('resize',drawFairness);$('download-map').addEventListener('click',downloadData);$('map-reset').addEventListener('click',()=>{metric='gain';budget=3;$('travel-time').value='3';document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.metric==='gain')));selectArea('BU01710101');fullMap();updateMap();});}catch(err){const target=$('area-readout')||$('home-map');if(target){const note=document.createElement('p');note.className='error-note';note.textContent='The map could not load. Refresh the page to try again.';target.parentElement.append(note);}console.error(err);}}
init();
