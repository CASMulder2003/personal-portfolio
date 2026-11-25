(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const color = {teal:'#28675f', copper:'#ab684a', grey:'#a1aaa6', ink:'#253a46'};
  const fmt = (n, d=3) => Number(n).toFixed(d);
  const percent = n => `${Math.round(n*100)}%`;
  const width = (id, fallback) => Math.max(280, Math.round($(id).clientWidth || fallback));
  function onResize(draw){let timer;window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(draw,120);});}
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const node = (tag, attrs={}, text='') => {const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text)el.textContent=text;return el;};
  function svg(id,w,h,title){const el=node('svg',{viewBox:`0 0 ${w} ${h}`,role:'img',class:'model-plot','aria-label':title});el.append(node('title',{},title));$(id).replaceChildren(el);return el;}
  function text(s,x,y,t,attrs={}){s.append(node('text',{x,y,...attrs},t));}
  function line(s,x1,y1,x2,y2,attrs={}){s.append(node('line',{x1,y1,x2,y2,...attrs}));}
  function plot(id,w,h,title,xmax,ymax,xticks,yticks,xlabel,ylabel){
    w=width(id,w);
    const s=svg(id,w,h,title),m={l:53,r:18,t:25,b:49},x=v=>m.l+v/xmax*(w-m.l-m.r),y=v=>h-m.b-v/ymax*(h-m.t-m.b);
    yticks.forEach(v=>{line(s,x(0),y(v),x(xmax),y(v),{class:'plot-grid'});text(s,x(0)-10,y(v)+4,Number(v.toFixed(2)).toString(),{'text-anchor':'end'});});
    xticks.forEach(v=>text(s,x(v),h-m.b+21,String(v),{'text-anchor':'middle'}));
    text(s,m.l,13,ylabel,{class:'plot-title'});text(s,(w+m.l-m.r)/2,h-7,xlabel,{'text-anchor':'middle'});
    return {s,x,y};
  }
  function path(s,values,x,y,stroke,attrs={}){s.append(node('path',{d:values.map((p,i)=>`${i?'L':'M'}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' '),fill:'none',stroke,'stroke-width':2.5,...attrs}));}
  function table(headers,rows){return `<div class="model-table-wrap"><table class="model-table"><thead><tr>${headers.map(x=>`<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${esc(c)}</td>`:`<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
  async function data(name){const r=await fetch(`assets/data/${name}.json`);if(!r.ok)throw Error('Data could not be loaded');return r.json();}

  async function cyclist(){
    const d=await data('cyclist-severity');
    const cm=d.baseline_confusion, support=cm.map(r=>r.reduce((a,b)=>a+b,0));
    const baseline=cm.map((r,i)=>{const precision=r[i]/cm.reduce((a,row)=>a+row[i],0),recall=r[i]/support[i];return {precision,recall,f1:2*precision*recall/(precision+recall)};});
    let metric='recall',cmMode='percent';
    $('diagnostic-metric').value=metric;
    const descriptions={recall:'Of the accidents in each true class, how many did the model identify?',precision:'Of the accidents assigned to a class, how many belonged there?',f1:'The harmonic mean of precision and recall. Each class is assessed separately.'};
    function draw(){
      const w=width('class-diagnostic',560),left=w<420?130:142;
      const s=svg('class-diagnostic',w,340,`${metric} by severity class, baseline and tuned random forests`),x=v=>left+v*(w-left-22);
      [0,.2,.4,.6,.8,1].forEach(v=>{line(s,x(v),20,x(v),274,{class:'plot-grid'});text(s,x(v),297,fmt(v,1),{'text-anchor':'middle'});});
      d.classes.forEach((c,i)=>{const y=48+i*83,a=baseline[i][metric],b=d.tuned_report[i][metric];text(s,left-12,y+12,c,{'text-anchor':'end',class:'plot-title'});
        [[a,color.grey,0],[b,color.teal,25]].forEach(([v,col,dy])=>{s.append(node('rect',{x:x(0),y:y+dy,width:x(v)-x(0),height:15,fill:col}));text(s,Math.min(x(v)+8,w-37),y+dy+12,fmt(v),{class:'plot-value'});});
      });
      text(s,(x(0)+x(1))/2,330,metric==='f1'?'F1 score':metric[0].toUpperCase()+metric.slice(1),{'text-anchor':'middle'});
      $('diagnostic-note').textContent=descriptions[metric];
      $('class-diagnostic-table').innerHTML=table(['Class','Baseline '+metric,'Tuned '+metric,'Test cases'],d.classes.map((c,i)=>[c,fmt(baseline[i][metric]),fmt(d.tuned_report[i][metric]),support[i].toLocaleString('en-GB')]));
    }
    function confusion(){
      const w=width('confusion-diagnostic',500),x=w<420?130:150,y=48,cw=(w-x-8)/3,ch=80;
      const s=svg('confusion-diagnostic',w,365,'Baseline confusion matrix: true severity by predicted severity');
      text(s,x+cw*1.5,16,'Predicted class',{'text-anchor':'middle',class:'plot-title'});
      ['Damage','Injury','Fatal'].forEach((c,i)=>text(s,x+i*cw+cw/2,37,c,{'text-anchor':'middle'}));
      d.classes.forEach((c,i)=>{text(s,x-12,y+i*ch+ch/2+4,c,{'text-anchor':'end',class:'plot-title'});
        cm[i].forEach((v,j)=>{const fraction=v/support[i],r=node('rect',{x:x+j*cw,y:y+i*ch,width:cw-3,height:ch-3,fill:color.teal,'fill-opacity':.09+fraction*.91});r.append(node('title',{},`${c} predicted as ${d.classes[j]}: ${v} accidents (${fmt(fraction*100,1)}%)`));s.append(r);text(s,x+j*cw+cw/2,y+i*ch+ch/2+4,cmMode==='count'?v.toLocaleString('en-GB'):`${fmt(fraction*100,1)}%`,{'text-anchor':'middle',style:`fill:${fraction>.5?'white':color.ink};font-weight:600`});});
      });
      text(s,8,322,'Rows = true class. Columns = prediction.',{style:'font-size:11px'});
      text(s,8,341,cmMode==='count'?'30,108 held-out accidents.':'Percentages are within each true class.',{style:'font-size:11px'});
    }
    $('diagnostic-metric').addEventListener('change',e=>{metric=e.target.value;draw();});
    document.querySelectorAll('[data-cm-mode]').forEach(b=>b.addEventListener('click',()=>{cmMode=b.dataset.cmMode;document.querySelectorAll('[data-cm-mode]').forEach(t=>t.setAttribute('aria-pressed',t===b));confusion();}));
    $('confusion-table').innerHTML=table(['True / predicted',...d.classes],cm.map((r,i)=>[d.classes[i],...r]));
    draw();confusion();onResize(()=>{draw();confusion();});
  }

  async function sugar(){
    const d=await data('sugarscape-taxation');let tax=.1,metric='gini';
    $('sugar-metric').value=metric;
    const picker=$('sugar-rate');picker.innerHTML=d.tax_rates.map(t=>`<option value="${t}"${t===tax?' selected':''}>${percent(t)} tax per tick</option>`).join('');
    function draw(){
      const label=metric==='gini'?'Mean Gini coefficient':'Mean top 10% sugar share',max=metric==='gini'?.55:.4;
      const ticks=metric==='gini'?[0,.1,.2,.3,.4,.5]:[0,.1,.2,.3,.4];
      const a=plot('sugar-average',660,340,'Reported S3 inequality by tax rate',35,max,[0,5,10,15,20,25,30,35],ticks,'Tax rate per tick (%)',label);
      path(a.s,d.summary.map(r=>[r.tax*100,r[metric].mean]),a.x,a.y,color.teal);
      d.summary.forEach(r=>{const v=r[metric],xp=a.x(r.tax*100),yp=a.y(v.mean),selected=r.tax===tax;
        line(a.s,xp,a.y(v.mean-v.sd_run_means),xp,a.y(v.mean+v.sd_run_means),{stroke:color.teal,'stroke-width':1.5});
        [-1,1].forEach(k=>line(a.s,xp-4,a.y(v.mean+k*v.sd_run_means),xp+4,a.y(v.mean+k*v.sd_run_means),{stroke:color.teal}));
        const mark=node('circle',{cx:xp,cy:yp,r:selected?7:4,fill:selected?color.copper:color.teal,stroke:'#fffefa','stroke-width':2});mark.append(node('title',{},`${percent(r.tax)} tax: ${fmt(v.mean)}, SD of run means ${fmt(v.sd_run_means,4)}`));a.s.append(mark);
      });
      const current=d.summary.find(r=>r.tax===tax),base=d.summary[0];
      $('sugar-mean').textContent=fmt(current[metric].mean);
      $('sugar-mean-caption').textContent=`${label.replace('Mean ','')} at ${percent(tax)} tax`;
      $('sugar-sd').textContent=fmt(current[metric].sd_run_means,4);
      $('sugar-readout-note').textContent=`The no-tax mean is ${fmt(base[metric].mean)}. These are simulated sugar holdings, not measured household wealth.`;
      const b=plot('sugar-time',560,335,`S3 ${label} over time at ${percent(tax)} tax`,1000,max,[0,200,400,600,800,1000],ticks,'Simulation tick (not a real time unit)',label);
      const selected=d.series.find(r=>r.tax===tax);
      path(b.s,d.series[0].ticks.map((t,i)=>[t,d.series[0][metric][i]]),b.x,b.y,color.grey,{'stroke-width':2});
      path(b.s,selected.ticks.map((t,i)=>[t,selected[metric][i]]),b.x,b.y,color.teal);
      line(b.s,b.x(200),b.y(0),b.x(200),b.y(max),{stroke:color.copper,'stroke-width':1,'stroke-dasharray':'4 4'});
      text(b.s,b.x(200)+8,31,'Summary begins',{'font-size':11});
      const c=plot('sugar-lorenz',560,335,`S3 Lorenz curve at ${percent(tax)} tax`,100,100,[0,20,40,60,80,100],[0,20,40,60,80,100],'Cumulative population (%)','Cumulative sugar (%)');
      line(c.s,c.x(0),c.y(0),c.x(100),c.y(100),{stroke:color.grey,'stroke-dasharray':'5 4'});
      [d.lorenz[0],d.lorenz.find(r=>r.tax===tax)].forEach((r,i)=>path(c.s,r.population_percent.map((v,j)=>[v,r.wealth_percent[j]]),c.x,c.y,i?color.teal:color.grey));
      $('sugar-selected-label').textContent=`${percent(tax)} tax`;
      $('sugar-selected-lorenz').textContent=`${percent(tax)} tax`;
      $('sugar-data-table').innerHTML=table(['Tax per tick','Mean Gini','SD of run means','Mean top 10% share','SD of run means'],d.summary.map(r=>[percent(r.tax),fmt(r.gini.mean,4),fmt(r.gini.sd_run_means,4),fmt(r.top10.mean,4),fmt(r.top10.sd_run_means,4)]));
    }
    picker.addEventListener('change',e=>{tax=Number(e.target.value);draw();});
    $('sugar-metric').addEventListener('change',e=>{metric=e.target.value;draw();});draw();onResize(draw);
  }

  async function backwash(){
    const d=await data('backwash-spread');let chosen='Periph AB',showCorridor=true;
    const picker=$('backwash-node');picker.innerHTML=d.nodes.map(n=>`<option value="${esc(n.id)}"${n.id===chosen?' selected':''}>${esc(n.id)}</option>`).join('');
    const descriptions={core:'Cores start with higher opportunity stocks and a higher population-allocation weight. The model gives them a stronger opportunity feedback.',periph:'Peripheral centres connect cores to rural hinterlands. Periph AB sits on the proposed corridor between Core A and Core B.',rural:'Rural nodes connect through a peripheral centre. They start with lower opportunity stocks and housing costs.'};
    function draw(){
      const s=svg('backwash-topology',660,620,'Original synthetic network: 3 cores, 7 peripheral centres, 15 rural nodes and 27 links');s.classList.add('backwash-network');s.setAttribute('role','group');
      const x=v=>330+v*11.4,y=v=>300-v*11.4,lookup=new Map(d.nodes.map(n=>[n.id,n]));
      d.edges.forEach(e=>{const a=lookup.get(e.source),b=lookup.get(e.target),active=showCorridor&&e.improvement_parameter>0;
        const l=node('line',{x1:x(a.x),y1:y(a.y),x2:x(b.x),y2:y(b.y),stroke:active?color.copper:'#c6d0ca','stroke-width':active?4:1.5});l.append(node('title',{},`${e.source} to ${e.target}${e.improvement_parameter?' · included in transport intervention':''}`));s.append(l);
      });
      const colors={core:color.teal,periph:color.copper,rural:'#91a59c'},sizes={core:16,periph:10,rural:6};
      const renderedWidth=Math.max(560,width('backwash-topology',660)),labelSize=14*660/renderedWidth;
      d.nodes.forEach(n=>{const g=node('g',{class:'model-node',tabindex:0,role:'button','aria-label':`Inspect ${n.id}, ${n.tier==='periph'?'peripheral centre':n.tier}`,'aria-pressed':n.id===chosen});
        if(n.id===chosen)g.append(node('circle',{cx:x(n.x),cy:y(n.y),r:sizes[n.tier]+7,fill:'none',stroke:color.ink,'stroke-width':1.5}));
        g.append(node('circle',{cx:x(n.x),cy:y(n.y),r:sizes[n.tier],fill:colors[n.tier],stroke:'#fffefa','stroke-width':2}));
        const offsetLabels={'Periph A2':[-12,'end'],'Periph B2':[12,'start'],'Rural C2':[-4,'end'],'Rural C3':[4,'start']};
        const [labelDx,labelAnchor]=offsetLabels[n.id]||[0,'middle'];
        g.append(node('text',{x:x(n.x)+labelDx,y:y(n.y)+sizes[n.tier]+labelSize+4,'text-anchor':labelAnchor,class:'node-label',style:`font-size:${labelSize}px`},n.id));
        const select=()=>{chosen=n.id;picker.value=chosen;draw();const target=[...$('backwash-topology').querySelectorAll('[role=button]')].find(e=>e.getAttribute('aria-pressed')==='true');if(document.activeElement===document.body)target?.focus({preventScroll:true});};
        g.addEventListener('click',select);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});s.append(g);
      });
      const n=lookup.get(chosen);$('backwash-node-title').textContent=n.id;$('backwash-node-type').textContent=n.tier==='periph'?'Peripheral centre':`${n.tier[0].toUpperCase()+n.tier.slice(1)} node`;
      $('backwash-node-description').textContent=descriptions[n.tier];
      $('backwash-opportunity').textContent=fmt(n.initial_opportunity,2);$('backwash-housing').textContent=fmt(n.initial_housing_cost,2);
      $('backwash-connections').textContent=d.edges.filter(e=>e.source===chosen||e.target===chosen).length;
    }
    picker.addEventListener('change',e=>{chosen=e.target.value;draw();});
    $('backwash-corridor').addEventListener('click',e=>{showCorridor=!showCorridor;e.currentTarget.setAttribute('aria-pressed',showCorridor);e.currentTarget.textContent=showCorridor?'Intervention links highlighted':'Highlight intervention links';draw();});draw();onResize(draw);
    $('backwash-nodes-table').innerHTML=table(['Node','Tier','Initial opportunity','Initial housing cost'],d.nodes.map(n=>[n.id,n.tier,fmt(n.initial_opportunity,2),fmt(n.initial_housing_cost,2)]));
  }
  const pages={cyclist,sugar,backwash};
  const init=pages[document.body.dataset.modelCase];
  if(init){
    const controls=[...document.querySelectorAll('.model-explorer button,.model-explorer select')];
    const status=[...document.querySelectorAll('[data-load-status]')].map(el=>({el,text:el.textContent}));
    controls.forEach(el=>{el.disabled=true;});
    status.forEach(({el})=>{el.textContent='Loading saved project data…';});
    init().then(()=>{controls.forEach(el=>{el.disabled=false;});status.forEach(({el,text})=>{el.textContent=text;});document.querySelectorAll('.model-explorer').forEach(el=>el.setAttribute('aria-busy','false'));}).catch(e=>{console.error(e);document.querySelectorAll('.model-explorer').forEach(el=>el.setAttribute('aria-busy','false'));document.querySelectorAll('[data-load-status]').forEach(el=>{el.setAttribute('role','alert');el.textContent='The interactive data could not load. Please reload the page or use the source download below.';});});
  }
})();
