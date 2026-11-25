(() => {
  'use strict';
  const get=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
  const format=new Intl.NumberFormat('en-GB',{maximumFractionDigits:0});
  let geography,study,selected=null;
  const el=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
  function coords(g){switch(g.type){case'Point':return[g.coordinates];case'LineString':return g.coordinates;case'Polygon':case'MultiLineString':return g.coordinates.flat();case'MultiPolygon':return g.coordinates.flat(2);default:return[];}}
  function paths(g,p){const line=(r,close)=>r.map((xy,i)=>{const v=p(xy);return(i?'L':'M')+v[0].toFixed(2)+','+v[1].toFixed(2);}).join('')+(close?'Z':'');switch(g.type){case'LineString':return line(g.coordinates,false);case'MultiLineString':return g.coordinates.map(r=>line(r,false)).join('');case'Polygon':return g.coordinates.map(r=>line(r,true)).join('');case'MultiPolygon':return g.coordinates.flatMap(s=>s.map(r=>line(r,true))).join('');default:return'';}}
  function drawMap(){
    const mode=get('retail-map-view').value,svg=get('retail-map'),mobile=svg.clientWidth<600;
    const width=mobile?510:960,height=570,lat=51.55*Math.PI/180,xf=x=>x*Math.cos(lat);
    let points;
    if(mode==='A'||mode==='B'){
      const s=geography.sites.find(s=>s.id===mode),c=s.coordinates;
      const x=1800/(111320*Math.cos(lat)),y=1800/111320;
      points=[[c[0]-x,c[1]-y],[c[0]+x,c[1]+y]];
    }else points=coords(mode==='borough'?geography.boundary:geography.local_streets_extent);
    const xs=points.map(p=>xf(p[0])),ys=points.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
    const scale=Math.min((width-60)/(x1-x0),(height-65)/(y1-y0));
    const ox=(width-(x1-x0)*scale)/2,oy=(height-(y1-y0)*scale)/2;
    const project=p=>[ox+(xf(p[0])-x0)*scale,height-oy-(p[1]-y0)*scale];
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren(el('title',{},'Candidate locations, existing supermarkets and output-area centroids within modelled walking reach'));
    svg.append(el('path',{d:geography.output_areas.features.map(f=>paths(f.geometry,project)).join(''),class:'retail-oa'}));
    if(mode!=='borough')svg.append(el('path',{d:geography.local_streets.map(g=>paths(g,project)).join(''),class:'retail-roads'}));
    svg.append(el('path',{d:paths(geography.boundary,project),class:'retail-borough'}));
    geography.existing_stores.forEach(store=>{const[x,y]=project(store.coordinates);const dot=el('circle',{cx:x,cy:y,r:mobile?3:3.4,fill:'#6b7473',stroke:'#fff','stroke-width':1});dot.append(el('title',{},store.name+' · existing supermarket'));svg.append(dot);});
    const centroidActions=new Map();
    geography.centroids.features.filter(f=>f.properties.reached_A||f.properties.reached_B).forEach(f=>{
      const p=f.properties,[x,y]=project(f.geometry.coordinates),color=p.reached_A?'#28675f':'#ab684a';
      if(x<0||x>width||y<0||y>height)return;
      const dot=el('circle',{cx:x,cy:y,r:mode==='A'||mode==='B'?6:5.4,fill:color,class:'retail-centroid'+(selected===p.code?' selected':''),tabindex:0,role:'button','aria-label':`${p.code}: ${format.format(p.population)} residents. Select to inspect estimated walking times.`});
      const activate=()=>{selected=p.code;get('retail-map-selection').textContent=`${p.code}: ${format.format(p.population)} residents. Estimated walking time: ${p.walk_minutes_A===null?'not connected':p.walk_minutes_A.toFixed(1)+' minutes'} to Emerson Park; ${p.walk_minutes_B===null?'not connected':p.walk_minutes_B.toFixed(1)+' minutes'} near Elm Park. Population is assigned through this area’s snapped centroid.`;svg.querySelectorAll('.retail-centroid').forEach(n=>n.classList.remove('selected'));dot.classList.add('selected');};
      centroidActions.set(p.code,activate);
      dot.addEventListener('click',activate);dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});svg.append(dot);
    });
    geography.sites.forEach(s=>{const[x,y]=project(s.coordinates),color=s.id==='A'?'#28675f':'#ab684a';const marker=el('circle',{cx:x,cy:y,r:11,fill:color,stroke:'#fff','stroke-width':2.5,cursor:'pointer','aria-hidden':'true'});marker.addEventListener('click',()=>centroidActions.get(s.oa)?.());svg.append(marker);svg.append(el('text',{x,y:y+4.5,'text-anchor':'middle',fill:'#fff','font-family':'Arial','font-size':13,'font-weight':700,'pointer-events':'none','aria-hidden':'true'},s.id));const left=mode==='compare'||mode==='borough'?s.id==='B':false;svg.append(el('text',{x:x+(left?-16:16),y:y-14,'text-anchor':left?'end':'start',class:'retail-point-label','pointer-events':'none','aria-hidden':'true'},s.name));});
    const metres=mode==='A'||mode==='B'?500:1000,length=metres/111320*scale,x=22,y=height-20;
    svg.append(el('path',{d:`M${x},${y-5}v5h${length}v-5`,fill:'none',stroke:'#466052','stroke-width':1.7}));svg.append(el('text',{x,y:y-10,class:'retail-map-scale'},metres===1000?'1 km':'500 m'));
  }
  function bar(label,value,max,alternative){const row=document.createElement('div');row.className='horizontal-result';const line=document.createElement('div');line.className='result-label';const name=document.createElement('span');name.textContent=label;const count=document.createElement('strong');count.textContent=format.format(value);line.append(name,count);const track=document.createElement('div');track.className='result-track';track.setAttribute('aria-hidden','true');const fill=document.createElement('div');fill.className='result-bar'+(alternative?' alternative':'');fill.style.width=value/max*100+'%';track.append(fill);row.append(line,track);return row;}
  function drawBars(){const size=get('store-size').value;get('retail-demand-bars').replaceChildren();get('retail-walk-bars').replaceChildren();['A','B'].forEach(id=>{const site=study.retail.sites[id],scenario=study.retail.scenarios.find(s=>s.site===id&&s.format===size);get('retail-demand-bars').append(bar(site.name,scenario.predicted_weekly_trips,2000,id==='B'));get('retail-walk-bars').append(bar(site.name,site.walking_residents,7000,id==='B'));});get('retail-conclusion').textContent=`At the ${size==='Large'?'larger':'smaller'} format, Emerson Park leads on modelled demand. A recommendation prioritising local walking access would favour the alternative near Elm Park.`;}
  Promise.all(['retail-geography.json','urban-simulation.json'].map(async name=>{const r=await fetch('assets/data/'+name);if(!r.ok)throw Error('Figure data unavailable');return r.json();})).then(([map,data])=>{geography=map;study=data;drawMap();drawBars();get('retail-map-view').addEventListener('change',drawMap);get('store-size').addEventListener('change',drawBars);window.addEventListener('resize',drawMap);}).catch(error=>{get('retail-map-selection').textContent='The map could not load. Refresh the page to try again.';console.error(error);});
})();
