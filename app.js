'use strict';
(()=>{
const APP_VERSION='v4.0.2';
window.APP_VERSION=APP_VERSION;
const STORAGE_KEY='operix_crono_maquina_v400';
const $=id=>document.getElementById(id);
const state={running:false,startedAt:null,totalElapsedMs:0,mode:'idle',currentCycle:null,lastSegmentStartMs:null,activeDowntime:null,events:[],tickId:null,pendingCycle:null,chartType:'bars'};
const els={equipName:$('equipName'),analystName:$('analystName'),analysisMode:$('analysisMode'),units:$('units'),defaultLapQty:$('defaultLapQty'),defaultLapQtyGroup:$('defaultLapQtyGroup'),timeUnit:$('timeUnit'),takt:$('takt'),target:$('target'),lblTargetText:$('lblTargetText'),lapQtyMode:$('lapQtyMode'),lapQtyModeGroup:$('lapQtyModeGroup'),btnStart:$('btnStart'),btnStop:$('btnStop'),btnReset:$('btnReset'),btnLap:$('btnLap'),btnExport:$('btnExport'),btnPNG:$('btnPNG'),btnPDF:$('btnPDF'),btnWhatsApp:$('btnWhatsApp'),liveTimer:$('liveTimer'),totalTimer:$('totalTimer'),lapObs:$('lapObs'),lapCauseGrid:$('lapCauseGrid'),downtimeIndicator:$('downtimeIndicator'),valSamples:$('valSamples'),valHourlyCap:$('valHourlyCap'),valLastCycle:$('valLastCycle'),valAvgCycle:$('valAvgCycle'),valMinCycle:$('valMinCycle'),valMaxCycle:$('valMaxCycle'),valStdDev:$('valStdDev'),valEstabilidade:$('valEstabilidade'),valEfficiency:$('valEfficiency'),lblCapTitle:$('lblCapTitle'),lblLastCycleTitle:$('lblLastCycleTitle'),lblAvgCycleTitle:$('lblAvgCycleTitle'),historyListScreen:$('historyListScreen'),historyListPrint:$('historyListPrint'),chartContainer:$('chartContainer'),histogramContainer:$('histogramContainer'),eventTimeline:$('eventTimeline'),qtyModal:$('qtyModal'),qtyModalInput:$('qtyModalInput'),confirmModal:$('confirmModal'),confirmModalTitle:$('confirmModalTitle'),confirmModalText:$('confirmModalText'),infoModal:$('infoModal'),modalTitle:$('modalTitle'),modalText:$('modalText'),printDate:$('printDate'),printAnalyst:$('printAnalyst'),printEquipName:$('printEquipName'),printAnalysisMode:$('printAnalysisMode'),printUnits:$('printUnits'),printTimeUnit:$('printTimeUnit'),printTakt:$('printTakt'),printTarget:$('printTarget'),printExecutiveSummary:$('printExecutiveSummary'),appVersion:$('appVersion'),splashScreen:$('splashScreen')};


function dismissSplash(){
  const sp=els.splashScreen;
  if(!sp) return;
  const fade=()=>sp.classList.add('sp-out');
  fade();
  window.setTimeout(()=>{sp.style.display='none';},700);
}
function n(el,fb=0){const raw=String(el?.value??'').trim().replace(',','.');const v=parseFloat(raw);return Number.isFinite(v)?v:fb}
function pn(s){const v=parseFloat(String(s??'').trim().replace(',','.'));return Number.isFinite(v)?v:NaN}
function escAttr(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function id(){return (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`)}
function fmtClock(ms,cent=false){ms=Math.max(0,Math.floor(ms||0));const s=Math.floor(ms/1000),m=Math.floor(s/60),ss=s%60,c=Math.floor(ms%1000/10);return cent?`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(c).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
function fmtS(s){return `${(Number.isFinite(s)?s:0).toFixed(2)}s`}
function totalMs(now=Date.now()){return state.running&&state.startedAt?state.totalElapsedMs+(now-state.startedAt):state.totalElapsedMs}
function lapMs(now=Date.now()){if(!state.currentCycle)return 0;let v=state.currentCycle.productiveAccumMs||0;if(state.mode==='running_normal'&&state.running&&state.lastSegmentStartMs)v+=now-state.lastSegmentStartMs;return v}
function activeDowntimeDurationMs(now=Date.now()){if(!state.activeDowntime)return 0;let v=state.activeDowntime.accumMs||0;if(state.running&&state.activeDowntime.startMs)v+=now-state.activeDowntime.startMs;return v}
function cycles(){return state.events.filter(e=>e.type==='cycle')}
function downtimesOf(){return state.events.filter(e=>e.type==='downtime')}
function buildTimeline(){
  const timeline=[];
  const cyc=cycles().slice().sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
  const dts=downtimesOf();
  for(const c of cyc){
    if(!c.startedAt||!c.endedAt)continue;
    const inner=dts.filter(d=>d.startedAt&&d.endedAt&&d.startedAt>=c.startedAt&&d.endedAt<=c.endedAt).sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
    let cursor=c.startedAt;
    for(const d of inner){
      const prodDur=(d.startedAt||0)-cursor;
      if(prodDur>=300)timeline.push({type:'productive',cause:'Normal',durationMs:prodDur,cycleId:c.id});
      timeline.push({type:'downtime',cause:d.cause,durationMs:d.durationMs,cycleId:c.id,id:d.id});
      cursor=d.endedAt||cursor;
    }
    const finalDur=c.endedAt-cursor;
    if(finalDur>=300)timeline.push({type:'productive',cause:'Normal',durationMs:finalDur,cycleId:c.id});
  }
  return timeline;
}
function qty(c){if(Number.isFinite(Number(c.qty)))return Number(c.qty);const d=n(els.defaultLapQty,NaN);if(Number.isFinite(d)&&d>0)return d;return n(els.units,1)||1}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=avg(a);return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)}
function arrMin(a,d=0){return a.length?a.reduce((x,y)=>x<y?x:y,Infinity):d}
function arrMax(a,d=0){return a.length?a.reduce((x,y)=>x>y?x:y,-Infinity):d}
function stats(){const cyc=cycles();const sec=cyc.map(c=>(c.productiveMs||c.durationMs||0)/1000).filter(Number.isFinite);const totalSec=totalMs()/1000;const q=cyc.reduce((a,c)=>a+qty(c),0);const base=n(els.timeUnit,3600);const cap=totalSec>0?q/totalSec*base:0;const av=avg(sec),dev=sd(sec),target=n(els.target,0);return{sec,t:totalSec,q,cap,av,dev,min:arrMin(sec),max:arrMax(sec),stab:av>0?Math.max(0,100-dev/av*100):100,eff:target>0?cap/target*100:null}}
function getCronoMachineData(){
  const s=stats();
  return{
    version:APP_VERSION,
    running:state.running,
    mode:state.mode,
    totalElapsedMs:totalMs(),
    activeDowntime:state.activeDowntime?{cause:state.activeDowntime.cause,durationMs:activeDowntimeDurationMs(),startedAt:state.activeDowntime.firstStartMs||state.activeDowntime.startMs||null}:null,
    form:{
      equipName:els.equipName?.value||'',
      analystName:els.analystName?.value||'',
      analysisMode:els.analysisMode?.value||'cycle',
      analysisModeLabel:els.analysisMode?.value==='interval'?'Produção por intervalo':'Tempo por ciclo',
      units:n(els.units,1),
      defaultLapQty:n(els.defaultLapQty,0),
      timeUnit:els.timeUnit?.value||'3600',
      timeUnitLabel:els.timeUnit?.value==='60'?'un/min':'un/h',
      takt:n(els.takt,0),
      target:n(els.target,0),
      lapQtyMode:els.lapQtyMode?.value||'durante'
    },
    stats:s,
    laps:state.events.map((e,index)=>({
      index:index+1,
      id:e.id,
      type:e.type,
      cause:e.cause||'Normal',
      durationMs:e.durationMs,
      durationSec:(e.durationMs||0)/1000,
      productiveMs:e.productiveMs??null,
      productiveSec:Number.isFinite(Number(e.productiveMs))?Number(e.productiveMs)/1000:null,
      qty:e.type==='cycle'?qty(e):null,
      rawQty:e.qty??null,
      obs:e.obs||'',
      startedAt:e.startedAt||null,
      endedAt:e.endedAt||null
    }))
  };
}
function startTimer(){
  if(state.running)return;
  const now=Date.now();
  state.running=true;
  state.startedAt=now;
  if(state.mode==='idle'){
    state.mode='running_normal';
    if(!state.currentCycle)state.currentCycle={startMs:now,productiveAccumMs:0};
    state.lastSegmentStartMs=now;
  }else if(state.mode==='running_normal'){
    state.lastSegmentStartMs=now;
  }else if(state.mode==='downtime_active'&&state.activeDowntime){
    state.activeDowntime.startMs=now;
  }
  tick();render();persist();
}
function stopTimer(){
  if(!state.running||!state.startedAt)return;
  const now=Date.now();
  if(state.mode==='running_normal'&&state.currentCycle&&state.lastSegmentStartMs){
    state.currentCycle.productiveAccumMs+=now-state.lastSegmentStartMs;
    state.lastSegmentStartMs=null;
  }
  if(state.mode==='downtime_active'&&state.activeDowntime&&state.activeDowntime.startMs){
    state.activeDowntime.accumMs=(state.activeDowntime.accumMs||0)+(now-state.activeDowntime.startMs);
    state.activeDowntime.startMs=null;
  }
  state.totalElapsedMs+=now-state.startedAt;
  state.startedAt=null;
  state.running=false;
  stopTick();render();persist();
}
let confirmCb=null;function resetTimer(){if(state.events.length||totalMs()>0||state.running||state.mode!=='idle'){openConfirm('Zerar medição','Deseja zerar todos os tempos, amostras e histórico?',doReset);return}doReset()}
function doReset(){stopTick();Object.assign(state,{running:false,startedAt:null,totalElapsedMs:0,mode:'idle',currentCycle:null,lastSegmentStartMs:null,activeDowntime:null,events:[],tickId:null,pendingCycle:null});if(els.lapObs)els.lapObs.value='';render();persist()}
function tick(){stopTick();let last=0;const loop=t=>{if(!state.running)return;if(t-last>=100){renderTimersOnly();last=t}state.tickId=requestAnimationFrame(loop)};state.tickId=requestAnimationFrame(loop)}
function stopTick(){if(state.tickId){cancelAnimationFrame(state.tickId);state.tickId=null}}
function renderTimersOnly(){if(els.liveTimer)els.liveTimer.textContent=fmtClock(lapMs(),true);if(els.totalTimer)els.totalTimer.textContent=fmtClock(totalMs(),false);if(els.downtimeIndicator&&state.mode==='downtime_active'&&state.activeDowntime){els.downtimeIndicator.textContent=`⏸ ${state.activeDowntime.cause} · ${fmtClock(activeDowntimeDurationMs(),false)}`}}
function closeActiveDowntime(now){
  if(!state.activeDowntime)return 0;
  const dt=state.activeDowntime;
  let dur=dt.accumMs||0;
  if(state.running&&dt.startMs)dur+=now-dt.startMs;
  if(dur>=300){
    state.events.push({id:dt.id,type:'downtime',cause:dt.cause,durationMs:dur,startedAt:dt.firstStartMs||dt.startMs||now,endedAt:now});
  }
  state.activeDowntime=null;
  return dur;
}
function recordNormal(){
  if(!state.running)return;
  const now=Date.now();
  if(state.mode==='running_normal'){
    closeCycle(now);
  }else if(state.mode==='downtime_active'){
    closeActiveDowntime(now);
    state.mode='running_normal';
    state.lastSegmentStartMs=now;
    render();persist();
  }
}
function closeCycle(now){
  if(!state.currentCycle)return;
  if(state.lastSegmentStartMs){state.currentCycle.productiveAccumMs+=now-state.lastSegmentStartMs}
  const productiveMs=state.currentCycle.productiveAccumMs;
  const durationMs=now-state.currentCycle.startMs;
  let q=n(els.units,1)||1;
  if(els.analysisMode.value==='interval'){
    const d=n(els.defaultLapQty,NaN);
    q=Number.isFinite(d)&&d>0?d:null;
    if(els.lapQtyMode.value==='durante'){
      if(state.pendingCycle){els.qtyModalInput.focus();return}
      state.pendingCycle={durationMs,productiveMs,startMs:state.currentCycle.startMs,endedAt:now};
      els.qtyModalInput.value=q||'';
      els.qtyModal.style.display='flex';
      els.qtyModalInput.focus();
      return;
    }
  }
  finalizeCycle({durationMs,productiveMs,startMs:state.currentCycle.startMs,endedAt:now,q});
}
function finalizeCycle({durationMs,productiveMs,startMs,endedAt,q}){
  state.events.push({id:id(),type:'cycle',cause:'Normal',durationMs:Math.max(0,durationMs),productiveMs:Math.max(0,productiveMs),qty:q,obs:(els.lapObs?.value||'').trim(),startedAt:startMs,endedAt});
  state.currentCycle={startMs:endedAt,productiveAccumMs:0};
  state.lastSegmentStartMs=endedAt;
  if(els.lapObs)els.lapObs.value='';
  render();persist();
}
function recordDowntime(t){
  if(!state.running)return;
  const cause=String((t&&t.dataset&&t.dataset.cause)||'').trim();
  if(!cause||cause==='Normal')return;
  const now=Date.now();
  if(state.mode==='running_normal'){
    if(state.lastSegmentStartMs){state.currentCycle.productiveAccumMs+=now-state.lastSegmentStartMs;state.lastSegmentStartMs=null}
    state.mode='downtime_active';
    state.activeDowntime={id:id(),cause,startMs:now,firstStartMs:now,accumMs:0};
  }else if(state.mode==='downtime_active'&&state.activeDowntime){
    if(state.activeDowntime.cause===cause){
      closeActiveDowntime(now);
      state.mode='running_normal';
      state.lastSegmentStartMs=now;
    }else{
      closeActiveDowntime(now);
      state.activeDowntime={id:id(),cause,startMs:now,firstStartMs:now,accumMs:0};
    }
  }
  render();persist();
}
function updateLapQty(eventId,value){const e=state.events.find(x=>x.id===eventId);if(!e||e.type!=='cycle')return;const v=pn(value);e.qty=Number.isFinite(v)&&v>=0?v:null;render();persist()}
function deleteEvent(eventId){state.events=state.events.filter(e=>e.id!==eventId);render();persist()}
function render(){renderTimersOnly();renderMode();renderStats();renderHistory();renderCharts();renderEventTimeline();renderPrint();renderControls()}
function renderEventTimeline(){
  const cont=els.eventTimeline;
  if(!cont)return;
  const timeline=buildTimeline();
  if(!timeline.length){cont.innerHTML='';return}
  const max=Math.max(...timeline.map(t=>(t.durationMs||0)/1000),1);
  const prevW=cont.scrollWidth,prevL=cont.scrollLeft;
  const wasAtEnd=prevW<=cont.clientWidth+1||(prevW-prevL-cont.clientWidth)<30;
  cont.innerHTML=timeline.map((seg,i)=>{
    const sec=(seg.durationMs||0)/1000;
    const isProd=seg.type==='productive';
    const isFirstOfCycle=i>0&&timeline[i-1].cycleId!==seg.cycleId;
    const tip=`${isProd?'Normal':seg.cause}: ${sec.toFixed(2)}s`;
    return `<div class="evt-bar ${isProd?'evt-bar-prod':'evt-bar-dt'}${isFirstOfCycle?' evt-cycle-sep':''}" style="height:${Math.max(4,sec/max*100)}%" title="${escAttr(tip)}">${!isProd?'<span class="evt-bar-icon">⏸</span>':''}</div>`;
  }).join('');
  requestAnimationFrame(()=>{if(wasAtEnd)cont.scrollLeft=cont.scrollWidth;else cont.scrollLeft=prevL});
}
function renderMode(){const interval=els.analysisMode.value==='interval';els.defaultLapQtyGroup.style.display=interval?'':'none';els.lapQtyModeGroup.style.display=interval?'':'none';els.lapObs.style.display=state.running?'block':'none';if(els.lapCauseGrid)els.lapCauseGrid.style.display=state.running?'grid':'none';if(els.downtimeIndicator)els.downtimeIndicator.style.display=state.mode==='downtime_active'?'flex':'none';els.lblLastCycleTitle.textContent=interval?'ÚLTIMO INTERVALO':'ÚLTIMO CICLO';els.lblAvgCycleTitle.textContent=interval?'MÉDIA INTERVALO':'CICLO MÉDIO';const ph=els.timeUnit.value==='3600';els.lblTargetText.textContent=ph?'Meta (un/h)':'Meta (un/min)';els.lblCapTitle.textContent=ph?'CAPACIDADE (un/h)':'CAPACIDADE (un/min)'}
function renderStats(){const s=stats(),cyc=cycles(),last=cyc.at(-1);els.valSamples.textContent=cyc.length;els.valHourlyCap.textContent=s.cap?s.cap.toFixed(1):'0';els.valLastCycle.textContent=last?fmtS((last.productiveMs||last.durationMs||0)/1000):'0.00s';els.valAvgCycle.textContent=fmtS(s.av);els.valMinCycle.textContent=fmtS(s.min);els.valMaxCycle.textContent=fmtS(s.max);els.valStdDev.textContent=fmtS(s.dev);els.valEstabilidade.textContent=`${s.stab.toFixed(1)}%`;els.valEfficiency.textContent=s.eff===null?'--':`${s.eff.toFixed(1)}%`}
function renderControls(){
  const has=state.events.length>0;
  els.btnStart.disabled=state.running;
  els.btnStop.disabled=!state.running;
  els.btnLap.disabled=!state.running;
  if(els.btnLap)els.btnLap.textContent=state.mode==='downtime_active'?'↩ RETOMAR':'⏱ NORMAL';
  document.querySelectorAll('.btn-cause').forEach(b=>{
    b.disabled=!state.running;
    const isActive=state.mode==='downtime_active'&&state.activeDowntime&&b.dataset.cause===state.activeDowntime.cause;
    b.classList.toggle('active',!!isActive);
  });
  [els.btnExport,els.btnPNG,els.btnPDF,els.btnWhatsApp].forEach(b=>{if(b)b.disabled=!has});
}
function row(e,i,print=false){
  const lid=escAttr(e.id);
  if(e.type==='downtime'){
    return `<div class="history-row history-downtime"><span class="history-id">⏸ ${escAttr(e.cause)}</span><span class="history-time">${fmtS((e.durationMs||0)/1000)}</span>${!print?`<button class="btn-delete" aria-label="Remover parada" data-action="deleteEvent" data-event-id="${lid}">×</button>`:''}</div>`;
  }
  const qv=escAttr(e.qty??'');
  const idx=cycles().findIndex(c=>c.id===e.id)+1;
  const sec=(e.productiveMs||e.durationMs||0)/1000;
  return `<div class="history-row history-cycle"><span class="history-id">#${idx}</span><span class="history-time">${fmtS(sec)}</span>${els.analysisMode.value==='interval'?`<input class="history-qty-input" value="${qv}" placeholder="Qtd" inputmode="decimal" data-event-id="${lid}">`:''}${!print?`<button class="btn-delete" aria-label="Remover ciclo ${idx}" data-action="deleteEvent" data-event-id="${lid}">×</button>`:''}</div>`;
}
function renderHistory(){els.historyListScreen.innerHTML=state.events.length?state.events.map((e,i)=>row(e,i,false)).join(''):'<div class="history-row"><span class="history-time">Nenhuma amostra registrada</span></div>';els.historyListPrint.innerHTML=state.events.map((e,i)=>row(e,i,true)).join('')}
function renderCharts(){
  const s=stats(),sec=s.sec,takt=n(els.takt,0),cyc=cycles();
  const cont=els.chartContainer;
  if(!sec.length){if(cont)cont.innerHTML='';els.histogramContainer.innerHTML='';return}
  const max=Math.max(arrMax(sec),takt||0,1);
  const chartType=state.chartType==='line'?'line':'bars';
  const dt=sec.map((v,i)=>{const c=cyc[i];return c&&Number.isFinite(c.productiveMs)&&c.durationMs>c.productiveMs+500?c.durationMs-c.productiveMs:0});
  const prevW=cont.scrollWidth,prevL=cont.scrollLeft;
  const wasAtEnd=prevW<=cont.clientWidth+1||(prevW-prevL-cont.clientWidth)<30;
  cont.classList.toggle('chart-line',chartType==='line');
  cont.classList.toggle('chart-bars',chartType==='bars');
  if(chartType==='line'){
    const W=22,H=110,pad=6;
    const totalW=Math.max(W*sec.length,cont.clientWidth||100);
    const yOf=v=>H-pad-(v/max)*(H-pad*2);
    const points=sec.map((v,i)=>({x:i*W+W/2,y:yOf(v),v,over:!!(takt&&v>takt),hasDt:dt[i]>0,dt:dt[i]}));
    const pathD=points.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const taktY=takt?yOf(takt):null;
    const avgY=yOf(s.av);
    cont.innerHTML=`<svg class="chart-svg" viewBox="0 0 ${totalW} ${H}" preserveAspectRatio="none" style="width:${totalW}px;height:100%;display:block">${taktY!==null?`<line x1="0" y1="${taktY.toFixed(1)}" x2="${totalW}" y2="${taktY.toFixed(1)}" class="svg-takt-line"/>`:''}<line x1="0" y1="${avgY.toFixed(1)}" x2="${totalW}" y2="${avgY.toFixed(1)}" class="svg-avg-line" stroke-dasharray="4 3"/><path d="${pathD}" class="svg-line-curve"/>${points.map(p=>`<circle cx="${p.x}" cy="${p.y.toFixed(1)}" r="3.5" class="svg-point ${p.over?'over-takt':'under-takt'}"></circle>`).join('')}${points.map(p=>p.hasDt?`<text x="${p.x}" y="${Math.max(11,p.y-8).toFixed(1)}" text-anchor="middle" class="svg-warn"><title>Ciclo com ${(p.dt/1000).toFixed(1)}s de parada interna</title>⚠</text>`:'').join('')}</svg>${takt?`<span class="chart-axis-label takt-axis-label" style="bottom:${Math.min(98,(takt/max)*100)}%">TAKT ${takt}s</span>`:''}<span class="chart-axis-label avg-axis-label" style="bottom:${Math.min(98,(s.av/max)*100)}%">MÉDIA ${s.av.toFixed(1)}s</span>`;
  }else{
    cont.innerHTML=sec.map((v,i)=>{const hasDt=dt[i]>0;const tip=hasDt?`Ciclo com ${(dt[i]/1000).toFixed(1)}s de parada interna`:'';return `<div class="chart-bar ${takt&&v>takt?'over-takt':'under-takt'}${hasDt?' has-downtime':''}" style="height:${Math.max(4,v/max*100)}%"${tip?` title="${escAttr(tip)}"`:''}>${hasDt?'<span class="bar-warning" aria-label="Ciclo com parada interna">⚠</span>':''}<span class="sample-label">${i+1}</span></div>`}).join('')+(takt?`<div class="takt-line" style="bottom:${Math.min(100,takt/max*100)}%"><span class="takt-label">TAKT ${takt}s</span></div>`:'')+`<div class="avg-line" style="bottom:${Math.min(100,s.av/max*100)}%"><span class="avg-label">MÉDIA ${s.av.toFixed(1)}s</span></div>`;
  }
  requestAnimationFrame(()=>{if(wasAtEnd)cont.scrollLeft=cont.scrollWidth;else cont.scrollLeft=prevL});
  document.querySelectorAll('.chart-toggle-btn').forEach(b=>b.classList.toggle('active',b.dataset.chartType===chartType));
  const bins=5,min=s.min,range=Math.max(0.01,s.max-min),counts=Array(bins).fill(0);
  sec.forEach(v=>{let ix=Math.floor((v-min)/range*bins);if(ix>=bins)ix=bins-1;counts[ix]++});
  const mc=Math.max(...counts,1);
  els.histogramContainer.innerHTML=counts.map((c,i)=>`<div class="hist-col"><span class="hist-label">${c}</span><div class="hist-bar" style="height:${Math.max(2,c/mc*100)}%"></div><span class="hist-x-label">${(min+range/bins*i).toFixed(1)}</span></div>`).join('');
}
function setChartType(t){const ct=t?.dataset?.chartType;if(ct!=='bars'&&ct!=='line')return;state.chartType=ct;render();persist()}
function renderPrint(){const s=stats(),mode=els.analysisMode.value==='interval'?'Produção por intervalo':'Tempo por ciclo';els.printDate.textContent=new Date().toLocaleDateString('pt-BR');els.printAnalyst.textContent=els.analystName.value||'—';els.printEquipName.textContent=els.equipName.value||'—';els.printAnalysisMode.textContent=mode;els.printUnits.textContent=els.units.value||'—';els.printTimeUnit.textContent=els.timeUnit.value==='3600'?'un/h':'un/min';els.printTakt.textContent=els.takt.value?`${els.takt.value}s`:'—';els.printTarget.textContent=els.target.value||'—';const cycCount=cycles().length;els.printExecutiveSummary.textContent=cycCount?`Foram coletados ${cycCount} ciclos, com tempo médio de ${s.av.toFixed(2)}s e capacidade estimada de ${s.cap.toFixed(1)} ${els.timeUnit.value==='3600'?'un/h':'un/min'}. Índice de estabilidade: ${s.stab.toFixed(1)}%.`:'Sem amostras registradas.'}
function syncTargets(source){if(source==='takt'){const t=n(els.takt,0),u=n(els.units,1),base=n(els.timeUnit,3600);if(t>0)els.target.value=(u/t*base).toFixed(1)}else if(source==='target'){const tar=n(els.target,0),u=n(els.units,1),base=n(els.timeUnit,3600);if(tar>0)els.takt.value=(u/tar*base).toFixed(2)}render();persist()}
let prevTimeUnit='3600';
function changeTimeUnit(){const tar=n(els.target,0);const cur=els.timeUnit.value;if(tar>0&&prevTimeUnit!==cur)els.target.value=(prevTimeUnit==='3600'?tar/60:tar*60).toFixed(2);prevTimeUnit=cur;syncTargets('target')}
function changeAnalysisMode(){render();persist()}
function closeQtyModal(ok){if(state.pendingCycle&&ok){const q=n(els.qtyModalInput,0);const pc=state.pendingCycle;state.pendingCycle=null;els.qtyModal.style.display='none';finalizeCycle({...pc,q});return}state.pendingCycle=null;els.qtyModal.style.display='none'}
function openConfirm(title,text,cb){confirmCb=cb;els.confirmModalTitle.textContent=title;els.confirmModalText.textContent=text;els.confirmModal.style.display='flex'}function closeConfirmModal(ok){els.confirmModal.style.display='none';if(ok&&confirmCb)confirmCb();confirmCb=null}
const infoTexts={modo_analise:['Tipo de análise','Tempo por ciclo mede cada ciclo. Produção por intervalo mede uma janela de tempo e permite informar quantidade produzida.'],pecas_ciclo:['Peças por ciclo','Quantidade produzida a cada ciclo registrado.'],qtd_lap:['Qtd. padrão por lap','Quantidade usada automaticamente em cada intervalo quando não houver edição manual.'],takt:['Takt Time','Tempo disponível por unidade para atender a demanda.'],meta:['Meta','Capacidade esperada para comparação com a capacidade medida.'],amostras:['Amostras','Número de ciclos ou intervalos registrados.'],capacidade:['Capacidade','Produção estimada com base nas amostras coletadas.'],ultimo:['Último ciclo','Duração da última amostra registrada.'],medio:['Ciclo médio','Média das amostras registradas.'],minimo:['Mínimo','Menor tempo registrado.'],maximo:['Máximo','Maior tempo registrado.'],desvio:['Desvio padrão','Variação entre os tempos coletados.'],estabilidade:['Índice de estabilidade','Quanto menor a variação, maior a estabilidade.'],eficiencia:['Eficiência','Capacidade medida comparada com a meta informada.'],curva_controle:['Curva de controle','Mostra a sequência dos ciclos e a comparação com média e takt.'],histograma:['Histograma','Mostra a distribuição dos tempos coletados.'],etapas:['Etapas dos ciclos','Sequência de cada etapa: barra verde para tempo produtivo (Normal) e barra vermelha para parada (Microparada, Setup, etc.). Permite ver dentro de um ciclo onde o tempo foi gasto.']};
function showInfo(key){const item=infoTexts[key]||['Informação','Sem descrição cadastrada.'];els.modalTitle.textContent=item[0];els.modalText.textContent=item[1];els.infoModal.style.display='flex'}function closeInfo(){els.infoModal.style.display='none'}
function exportToExcel(){const rows=[['#','Tipo','Causa','Tempo_s','Quantidade','Observacao'],...state.events.map((e,i)=>{const sec=((e.type==='cycle'?e.productiveMs:e.durationMs)||0)/1000;return [i+1,e.type==='cycle'?'Ciclo':'Parada',e.cause||'',sec.toFixed(2).replace('.',','),e.type==='cycle'?qty(e):'',(e.obs||'').replace(/[\r\n]+/g,' ')]})];const csv='﻿'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\r\n');downloadBlob(csv,'crono-maquina.csv','text/csv;charset=utf-8')}
function downloadBlob(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),100)}
function showLibError(){alert('Biblioteca de exportação não carregada. Verifique sua conexão com a internet e recarregue a página.')}
async function shareWhatsApp(){if(typeof window.html2canvas!=='function'){showLibError();return}const restoreBtn=(()=>{const b=els.btnWhatsApp;if(!b)return()=>{};const t=b.textContent;b.disabled=true;b.textContent='⏳ Gerando...';return()=>{b.textContent=t;b.disabled=!(state.events.length>0)}})();const s=stats();const cycCount=cycles().length;const unitLabel=els.timeUnit.value==='3600'?'un/h':'un/min';const data=typeof window.getCronoMachineData==='function'?window.getCronoMachineData():null;const impact=data?.impact||{};const std=data?.standardTime||{};const ex=data?.extras||{};const f=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';const text=`Resumo Executivo — Cronoanálise Máquina\n\nEquipamento: ${(els.equipName.value||'').trim()||'-'}\nLinha/Turno/Produto: ${ex.lineName||'-'} / ${ex.shiftName||'-'} / ${ex.productName||'-'}\nCiclos: ${cycCount}\nCiclo médio: ${s.av.toFixed(2)}s\nCapacidade: ${s.cap.toFixed(1)} ${unitLabel}\nEstabilidade: ${s.stab.toFixed(1)}%\nGap: ${impact.target?`${f(impact.gap,1)} (${f(impact.gapPct,1)}%) ${unitLabel}`:'—'}\nPerda/h: ${impact.target?`${f(impact.lossPerHour,0)} un/h`:'—'}\nPerda/turno: ${impact.target?`${f(impact.lossPerShift,0)} un`:'—'}\nTempo padrão: ${std.standardSec?`${f(std.standardSec,2)}s`:'—'}`;renderPrint();try{const canvas=await html2canvas($('exportContainer'),{scale:2,backgroundColor:'#ffffff',onclone:function(doc){doc.documentElement.removeAttribute('data-theme');doc.body.classList.add('export-mode')}});const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const file=new File([blob],'crono.png',{type:'image/png'});if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Crono Máquina',text})}else{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='crono-maquina.png';document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),100);window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer')}}catch(e){if(e.name!=='AbortError')console.error('Erro WhatsApp:',e)}finally{restoreBtn()}}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({state:{running:state.running,startedAt:state.startedAt,totalElapsedMs:state.totalElapsedMs,mode:state.mode,currentCycle:state.currentCycle,activeDowntime:state.activeDowntime,events:state.events,chartType:state.chartType},form:{equipName:els.equipName.value,analystName:els.analystName.value,analysisMode:els.analysisMode.value,units:els.units.value,defaultLapQty:els.defaultLapQty.value,timeUnit:els.timeUnit.value,takt:els.takt.value,target:els.target.value,lapQtyMode:els.lapQtyMode.value}}))}catch(e){console.warn('[Crono] Falha ao salvar dados locais:',e)}}
function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return;
    const data=JSON.parse(raw);
    if(data&&typeof data==='object'&&data.form&&typeof data.form==='object')Object.entries(data.form).forEach(([k,v])=>{if(els[k]&&(typeof v==='string'||typeof v==='number'))els[k].value=String(v).slice(0,200)});
    if(data&&data.state&&typeof data.state==='object'){
      state.running=false;
      state.startedAt=null;
      state.totalElapsedMs=Math.max(0,Number(data.state.totalElapsedMs)||0);
      state.mode=['idle','running_normal','downtime_active'].includes(data.state.mode)?data.state.mode:'idle';
      state.chartType=data.state.chartType==='line'?'line':'bars';
      state.currentCycle=data.state.currentCycle&&typeof data.state.currentCycle==='object'?{startMs:Number(data.state.currentCycle.startMs)||null,productiveAccumMs:Math.max(0,Number(data.state.currentCycle.productiveAccumMs)||0)}:null;
      state.lastSegmentStartMs=null;
      state.activeDowntime=data.state.activeDowntime&&typeof data.state.activeDowntime==='object'?{id:typeof data.state.activeDowntime.id==='string'?data.state.activeDowntime.id:id(),cause:typeof data.state.activeDowntime.cause==='string'?data.state.activeDowntime.cause.slice(0,50):'Microparada',startMs:null,firstStartMs:Number(data.state.activeDowntime.firstStartMs)||Number(data.state.activeDowntime.startMs)||null,accumMs:Math.max(0,Number(data.state.activeDowntime.accumMs)||0)}:null;
      const arr=Array.isArray(data.state.events)?data.state.events:[];
      state.events=arr.filter(e=>e&&typeof e==='object').map(e=>({id:typeof e.id==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(e.id)?e.id:id(),type:e.type==='downtime'?'downtime':'cycle',cause:typeof e.cause==='string'?e.cause.slice(0,50):'Normal',durationMs:Math.max(0,Number(e.durationMs)||0),productiveMs:Number.isFinite(Number(e.productiveMs))?Math.max(0,Number(e.productiveMs)):undefined,qty:Number.isFinite(Number(e.qty))?Number(e.qty):null,obs:typeof e.obs==='string'?e.obs.slice(0,200):'',startedAt:Number(e.startedAt)||null,endedAt:Number(e.endedAt)||null}));
    }
  }catch(e){localStorage.removeItem(STORAGE_KEY)}
}
const ACTIONS={start:startTimer,stop:stopTimer,reset:resetTimer,normal:recordNormal,downtime:recordDowntime,setChartType:setChartType,exportCsv:exportToExcel,exportPng:()=>window.generatePNG?.(),exportPdf:()=>window.generateRealPDF?.(),shareWhatsapp:shareWhatsApp,info:t=>showInfo(t.dataset.info),closeInfo:closeInfo,closeQty:t=>closeQtyModal(t.dataset.confirm==='true'),closeConfirm:t=>closeConfirmModal(t.dataset.confirm==='true'),deleteEvent:t=>deleteEvent(t.dataset.eventId)};
const debounce=(fn,ms)=>{let h;return(...a)=>{clearTimeout(h);h=setTimeout(()=>fn(...a),ms)}};
const renderDeb=debounce(render,80);
const persistDeb=debounce(persist,250);
function bind(){
  const inputs=[els.equipName,els.analystName,els.analysisMode,els.units,els.defaultLapQty,els.timeUnit,els.takt,els.target,els.lapQtyMode];
  ['input','change'].forEach(ev=>inputs.forEach(el=>el&&el.addEventListener(ev,e=>{
    const t=e.target,oc=t.dataset?.onChange;
    if(oc==='syncTargets'){syncTargets(t.dataset.source);return}
    if(oc==='changeTimeUnit'&&ev==='change'){changeTimeUnit();return}
    if(oc==='changeAnalysisMode'&&ev==='change'){changeAnalysisMode();return}
    renderDeb();persistDeb();
  })));
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-action]');
    if(!t)return;
    const fn=ACTIONS[t.dataset.action];
    if(fn)fn(t);
  });
  els.historyListScreen?.addEventListener('change',e=>{
    const t=e.target;
    if(t.classList?.contains('history-qty-input'))updateLapQty(t.dataset.eventId,t.value);
  });
  els.infoModal?.addEventListener('click',e=>{if(e.target===els.infoModal)closeInfo()});
  [els.equipName,els.analystName].forEach(el=>el?.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!state.running&&(els.equipName?.value||'').trim()){
      e.preventDefault();
      startTimer();
    }
  }));
  document.querySelectorAll('img[data-fallback-hide]').forEach(img=>{
    if(img.complete&&img.naturalWidth===0)img.style.display='none';
    else img.addEventListener('error',()=>{img.style.display='none'});
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist()});
  window.addEventListener('beforeunload',()=>{stopTick();persist()});
}
function init(){if(els.appVersion)els.appVersion.textContent=APP_VERSION;load();prevTimeUnit=els.timeUnit?.value||'3600';bind();render();dismissSplash()}try{init()}catch(e){console.error('[Crono] Falha na inicialização:',e);dismissSplash();}
window.getCronoMachineData=getCronoMachineData;
})();
