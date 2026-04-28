'use strict';
(()=>{
const APP_VERSION='v3.0.0';
window.APP_VERSION=APP_VERSION;
const STORAGE_KEY='operix_crono_maquina_v240';
const $=id=>document.getElementById(id);
const state={running:false,startedAt:null,totalElapsedMs:0,currentLapStartMs:null,laps:[],tickId:null,pendingLap:null};
const els={equipName:$('equipName'),analystName:$('analystName'),analysisMode:$('analysisMode'),units:$('units'),defaultLapQty:$('defaultLapQty'),defaultLapQtyGroup:$('defaultLapQtyGroup'),timeUnit:$('timeUnit'),takt:$('takt'),target:$('target'),lblTargetText:$('lblTargetText'),lapQtyMode:$('lapQtyMode'),lapQtyModeGroup:$('lapQtyModeGroup'),btnStart:$('btnStart'),btnStop:$('btnStop'),btnReset:$('btnReset'),btnLap:$('btnLap'),btnExport:$('btnExport'),btnPNG:$('btnPNG'),btnPDF:$('btnPDF'),btnWhatsApp:$('btnWhatsApp'),liveTimer:$('liveTimer'),totalTimer:$('totalTimer'),lapObs:$('lapObs'),lapCause:$('lapCause'),valSamples:$('valSamples'),valHourlyCap:$('valHourlyCap'),valLastCycle:$('valLastCycle'),valAvgCycle:$('valAvgCycle'),valMinCycle:$('valMinCycle'),valMaxCycle:$('valMaxCycle'),valStdDev:$('valStdDev'),valEstabilidade:$('valEstabilidade'),valEfficiency:$('valEfficiency'),lblCapTitle:$('lblCapTitle'),lblLastCycleTitle:$('lblLastCycleTitle'),lblAvgCycleTitle:$('lblAvgCycleTitle'),historyListScreen:$('historyListScreen'),historyListPrint:$('historyListPrint'),chartContainer:$('chartContainer'),histogramContainer:$('histogramContainer'),qtyModal:$('qtyModal'),qtyModalInput:$('qtyModalInput'),confirmModal:$('confirmModal'),confirmModalTitle:$('confirmModalTitle'),confirmModalText:$('confirmModalText'),infoModal:$('infoModal'),modalTitle:$('modalTitle'),modalText:$('modalText'),printDate:$('printDate'),printAnalyst:$('printAnalyst'),printEquipName:$('printEquipName'),printAnalysisMode:$('printAnalysisMode'),printUnits:$('printUnits'),printTimeUnit:$('printTimeUnit'),printTakt:$('printTakt'),printTarget:$('printTarget'),printExecutiveSummary:$('printExecutiveSummary'),appVersion:$('appVersion'),splashScreen:$('splashScreen')};
function n(el,fb=0){const raw=String(el?.value??'').trim().replace(',','.');const v=parseFloat(raw);return Number.isFinite(v)?v:fb}
function pn(s){const v=parseFloat(String(s??'').trim().replace(',','.'));return Number.isFinite(v)?v:NaN}
function escAttr(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function id(){return (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`)}
function fmtClock(ms,cent=false){ms=Math.max(0,Math.floor(ms||0));const s=Math.floor(ms/1000),m=Math.floor(s/60),ss=s%60,c=Math.floor(ms%1000/10);return cent?`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(c).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
function fmtS(s){return `${(Number.isFinite(s)?s:0).toFixed(2)}s`}
function totalMs(now=Date.now()){return state.running&&state.startedAt?state.totalElapsedMs+(now-state.startedAt):state.totalElapsedMs}
function lapMs(now=Date.now()){return state.running&&state.currentLapStartMs?now-state.currentLapStartMs:0}
function qty(lap){if(Number.isFinite(Number(lap.qty)))return Number(lap.qty);const d=n(els.defaultLapQty,NaN);if(Number.isFinite(d)&&d>0)return d;return n(els.units,1)||1}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function sd(a){if(a.length<2)return 0;const m=avg(a);return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)}
function arrMin(a,d=0){return a.length?a.reduce((x,y)=>x<y?x:y,Infinity):d}
function arrMax(a,d=0){return a.length?a.reduce((x,y)=>x>y?x:y,-Infinity):d}
function stats(){const sec=state.laps.map(l=>l.durationMs/1000).filter(Number.isFinite);const t=sec.reduce((a,b)=>a+b,0);const q=state.laps.reduce((a,l)=>a+qty(l),0);const base=n(els.timeUnit,3600);const cap=t>0?q/t*base:0;const av=avg(sec),dev=sd(sec),target=n(els.target,0);return{sec,t,q,cap,av,dev,min:arrMin(sec),max:arrMax(sec),stab:av>0?Math.max(0,100-dev/av*100):100,eff:target>0?cap/target*100:null}}
function getCronoMachineData(){
  const s=stats();
  return{
    version:APP_VERSION,
    running:state.running,
    totalElapsedMs:totalMs(),
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
    laps:state.laps.map((lap,index)=>({
      index:index+1,
      id:lap.id,
      durationMs:lap.durationMs,
      durationSec:lap.durationMs/1000,
      qty:qty(lap),
      rawQty:lap.qty,
      obs:lap.obs||'',
      cause:lap.cause||'Normal',
      endedAt:lap.endedAt||null
    }))
  };
}
function startTimer(){if(state.running)return;const now=Date.now();state.running=true;state.startedAt=now;state.currentLapStartMs=state.currentLapStartMs??now;tick();render();persist()}
function stopTimer(){if(!state.running||!state.startedAt)return;const now=Date.now();state.totalElapsedMs+=now-state.startedAt;state.startedAt=null;state.running=false;stopTick();render();persist()}
let confirmCb=null;function resetTimer(){if(state.laps.length||totalMs()>0||state.running){openConfirm('Zerar medição','Deseja zerar todos os tempos, amostras e histórico?',doReset);return}doReset()}
function doReset(){stopTick();Object.assign(state,{running:false,startedAt:null,totalElapsedMs:0,currentLapStartMs:null,laps:[],pendingLap:null});if(els.lapObs)els.lapObs.value='';render();persist()}
function tick(){stopTick();let last=0;const loop=t=>{if(!state.running)return;if(t-last>=100){renderTimersOnly();last=t}state.tickId=requestAnimationFrame(loop)};state.tickId=requestAnimationFrame(loop)}
function stopTick(){if(state.tickId){cancelAnimationFrame(state.tickId);state.tickId=null}}
function renderTimersOnly(){if(els.liveTimer)els.liveTimer.textContent=fmtClock(lapMs(),true);if(els.totalTimer)els.totalTimer.textContent=fmtClock(totalMs(),false)}
function recordLap(){if(!state.running||!state.currentLapStartMs)return;const now=Date.now(),durationMs=now-state.currentLapStartMs;let q=n(els.units,1)||1;if(els.analysisMode.value==='interval'){const d=n(els.defaultLapQty,NaN);q=Number.isFinite(d)&&d>0?d:null;if(els.lapQtyMode.value==='durante'){if(state.pendingLap){els.qtyModalInput.focus();return}state.pendingLap={durationMs,endedAt:now};els.qtyModalInput.value=q||'';els.qtyModal.style.display='flex';els.qtyModalInput.focus();return}}addLap(durationMs,q,now)}
function addLap(durationMs,q,endedAt){const cause=(els.lapCause?.value||'Normal').trim();state.laps.push({id:id(),durationMs:Math.max(0,durationMs),qty:q,obs:(els.lapObs?.value||'').trim(),cause,endedAt});state.currentLapStartMs=endedAt;if(els.lapObs)els.lapObs.value='';render();persist()}
function updateLapQty(lapId,value){const l=state.laps.find(x=>x.id===lapId);if(!l)return;const v=pn(value);l.qty=Number.isFinite(v)&&v>=0?v:null;render();persist()}
function deleteLap(lapId){state.laps=state.laps.filter(l=>l.id!==lapId);render();persist()}
function render(){renderTimersOnly();renderMode();renderStats();renderHistory();renderCharts();renderPrint();renderControls()}
function renderMode(){const interval=els.analysisMode.value==='interval';els.defaultLapQtyGroup.style.display=interval?'':'none';els.lapQtyModeGroup.style.display=interval?'':'none';els.lapObs.style.display=state.running?'block':'none';if(els.lapCause)els.lapCause.style.display=state.running?'block':'none';els.lblLastCycleTitle.textContent=interval?'ÚLTIMO INTERVALO':'ÚLTIMO CICLO';els.lblAvgCycleTitle.textContent=interval?'MÉDIA INTERVALO':'CICLO MÉDIO';const ph=els.timeUnit.value==='3600';els.lblTargetText.textContent=ph?'Meta (un/h)':'Meta (un/min)';els.lblCapTitle.textContent=ph?'CAPACIDADE (un/h)':'CAPACIDADE (un/min)'}
function renderStats(){const s=stats(),last=state.laps.at(-1);els.valSamples.textContent=state.laps.length;els.valHourlyCap.textContent=s.cap?s.cap.toFixed(1):'0';els.valLastCycle.textContent=last?fmtS(last.durationMs/1000):'0.00s';els.valAvgCycle.textContent=fmtS(s.av);els.valMinCycle.textContent=fmtS(s.min);els.valMaxCycle.textContent=fmtS(s.max);els.valStdDev.textContent=fmtS(s.dev);els.valEstabilidade.textContent=`${s.stab.toFixed(1)}%`;els.valEfficiency.textContent=s.eff===null?'--':`${s.eff.toFixed(1)}%`}
function renderControls(){const has=state.laps.length>0;els.btnStart.disabled=state.running;els.btnStop.disabled=!state.running;els.btnLap.disabled=!state.running;[els.btnExport,els.btnPNG,els.btnPDF,els.btnWhatsApp].forEach(b=>{if(b)b.disabled=!has})}
function row(l,i,print=false){const qv=escAttr(l.qty??'');const lid=escAttr(l.id);return `<div class="history-row"><span class="history-id">#${i+1}</span><span class="history-time">${fmtS(l.durationMs/1000)}</span>${els.analysisMode.value==='interval'?`<input class="history-qty-input" value="${qv}" placeholder="Qtd" inputmode="decimal" data-lap-id="${lid}">`:''}${!print?`<button class="btn-delete" aria-label="Remover amostra ${i+1}" data-action="deleteLap" data-lap-id="${lid}">×</button>`:''}</div>`}
function renderHistory(){els.historyListScreen.innerHTML=state.laps.length?state.laps.map((l,i)=>row(l,i,false)).join(''):'<div class="history-row"><span class="history-time">Nenhuma amostra registrada</span></div>';els.historyListPrint.innerHTML=state.laps.map((l,i)=>row(l,i,true)).join('')}
function renderCharts(){const s=stats(),sec=s.sec,takt=n(els.takt,0);if(!sec.length){els.chartContainer.innerHTML='';els.histogramContainer.innerHTML='';return}const max=Math.max(arrMax(sec),takt||0,1);els.chartContainer.innerHTML=sec.map((v,i)=>`<div class="chart-bar ${takt&&v>takt?'over-takt':'under-takt'}" style="height:${Math.max(4,v/max*100)}%"><span class="sample-label">${i+1}</span></div>`).join('')+(takt?`<div class="takt-line" style="bottom:${Math.min(100,takt/max*100)}%"><span class="takt-label">TAKT ${takt}s</span></div>`:'')+`<div class="avg-line" style="bottom:${Math.min(100,s.av/max*100)}%"><span class="avg-label">MÉDIA ${s.av.toFixed(1)}s</span></div>`;const bins=5,min=s.min,range=Math.max(0.01,s.max-min),counts=Array(bins).fill(0);sec.forEach(v=>{let ix=Math.floor((v-min)/range*bins);if(ix>=bins)ix=bins-1;counts[ix]++});const mc=Math.max(...counts,1);els.histogramContainer.innerHTML=counts.map((c,i)=>`<div class="hist-col"><span class="hist-label">${c}</span><div class="hist-bar" style="height:${Math.max(2,c/mc*100)}%"></div><span class="hist-x-label">${(min+range/bins*i).toFixed(1)}</span></div>`).join('')}
function renderPrint(){const s=stats(),mode=els.analysisMode.value==='interval'?'Produção por intervalo':'Tempo por ciclo';els.printDate.textContent=new Date().toLocaleDateString('pt-BR');els.printAnalyst.textContent=els.analystName.value||'—';els.printEquipName.textContent=els.equipName.value||'—';els.printAnalysisMode.textContent=mode;els.printUnits.textContent=els.units.value||'—';els.printTimeUnit.textContent=els.timeUnit.value==='3600'?'un/h':'un/min';els.printTakt.textContent=els.takt.value?`${els.takt.value}s`:'—';els.printTarget.textContent=els.target.value||'—';els.printExecutiveSummary.textContent=state.laps.length?`Foram coletadas ${state.laps.length} amostras, com ciclo médio de ${s.av.toFixed(2)}s e capacidade estimada de ${s.cap.toFixed(1)} ${els.timeUnit.value==='3600'?'un/h':'un/min'}. Índice de estabilidade: ${s.stab.toFixed(1)}%.`:'Sem amostras registradas.'}
function syncTargets(source){if(source==='takt'){const t=n(els.takt,0),u=n(els.units,1),base=n(els.timeUnit,3600);if(t>0)els.target.value=(u/t*base).toFixed(1)}else if(source==='target'){const tar=n(els.target,0),u=n(els.units,1),base=n(els.timeUnit,3600);if(tar>0)els.takt.value=(u/tar*base).toFixed(2)}render();persist()}
let prevTimeUnit='3600';
function changeTimeUnit(){const tar=n(els.target,0);const cur=els.timeUnit.value;if(tar>0&&prevTimeUnit!==cur)els.target.value=(prevTimeUnit==='3600'?tar/60:tar*60).toFixed(2);prevTimeUnit=cur;syncTargets('target')}
function changeAnalysisMode(){render();persist()}
function closeQtyModal(ok){if(state.pendingLap&&ok){const q=n(els.qtyModalInput,0);addLap(state.pendingLap.durationMs,q,state.pendingLap.endedAt)}state.pendingLap=null;els.qtyModal.style.display='none'}
function openConfirm(title,text,cb){confirmCb=cb;els.confirmModalTitle.textContent=title;els.confirmModalText.textContent=text;els.confirmModal.style.display='flex'}function closeConfirmModal(ok){els.confirmModal.style.display='none';if(ok&&confirmCb)confirmCb();confirmCb=null}
const infoTexts={modo_analise:['Tipo de análise','Tempo por ciclo mede cada ciclo. Produção por intervalo mede uma janela de tempo e permite informar quantidade produzida.'],pecas_ciclo:['Peças por ciclo','Quantidade produzida a cada ciclo registrado.'],qtd_lap:['Qtd. padrão por lap','Quantidade usada automaticamente em cada intervalo quando não houver edição manual.'],takt:['Takt Time','Tempo disponível por unidade para atender a demanda.'],meta:['Meta','Capacidade esperada para comparação com a capacidade medida.'],amostras:['Amostras','Número de ciclos ou intervalos registrados.'],capacidade:['Capacidade','Produção estimada com base nas amostras coletadas.'],ultimo:['Último ciclo','Duração da última amostra registrada.'],medio:['Ciclo médio','Média das amostras registradas.'],minimo:['Mínimo','Menor tempo registrado.'],maximo:['Máximo','Maior tempo registrado.'],desvio:['Desvio padrão','Variação entre os tempos coletados.'],estabilidade:['Índice de estabilidade','Quanto menor a variação, maior a estabilidade.'],eficiencia:['Eficiência','Capacidade medida comparada com a meta informada.'],curva_controle:['Curva de controle','Mostra a sequência dos ciclos e a comparação com média e takt.'],histograma:['Histograma','Mostra a distribuição dos tempos coletados.']};
function showInfo(key){const item=infoTexts[key]||['Informação','Sem descrição cadastrada.'];els.modalTitle.textContent=item[0];els.modalText.textContent=item[1];els.infoModal.style.display='flex'}function closeInfo(){els.infoModal.style.display='none'}
function exportToExcel(){const rows=[['Amostra','Tempo_s','Quantidade','Observacao'],...state.laps.map((l,i)=>[i+1,(l.durationMs/1000).toFixed(2).replace('.',','),qty(l),(l.obs||'').replace(/[\r\n]+/g,' ')])];const csv='﻿'+rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\r\n');downloadBlob(csv,'crono-maquina.csv','text/csv;charset=utf-8')}
function downloadBlob(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),100)}
function showLibError(){alert('Biblioteca de exportação não carregada. Verifique sua conexão com a internet e recarregue a página.')}
async function shareWhatsApp(){if(typeof window.html2canvas!=='function'){showLibError();return}const restoreBtn=(()=>{const b=els.btnWhatsApp;if(!b)return()=>{};const t=b.textContent;b.disabled=true;b.textContent='⏳ Gerando...';return()=>{b.textContent=t;b.disabled=!(state.laps.length>0)}})();const s=stats();const unitLabel=els.timeUnit.value==='3600'?'un/h':'un/min';const data=typeof window.getCronoMachineData==='function'?window.getCronoMachineData():null;const impact=data?.impact||{};const std=data?.standardTime||{};const ex=data?.extras||{};const f=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';const text=`Resumo Executivo — Cronoanálise Máquina\n\nEquipamento: ${(els.equipName.value||'').trim()||'-'}\nLinha/Turno/Produto: ${ex.lineName||'-'} / ${ex.shiftName||'-'} / ${ex.productName||'-'}\nAmostras: ${state.laps.length}\nCiclo médio: ${s.av.toFixed(2)}s\nCapacidade: ${s.cap.toFixed(1)} ${unitLabel}\nEstabilidade: ${s.stab.toFixed(1)}%\nGap: ${impact.target?`${f(impact.gap,1)} (${f(impact.gapPct,1)}%)`:'—'} ${unitLabel}\nPerda/h: ${impact.target?`${f(impact.lossPerHour,0)} un/h`:'—'}\nPerda/turno: ${impact.target?`${f(impact.lossPerShift,0)} un`:'—'}\nTempo padrão: ${std.standardSec?`${f(std.standardSec,2)}s`:'—'}`;renderPrint();try{const canvas=await html2canvas($('exportContainer'),{scale:2,backgroundColor:'#ffffff',onclone:function(doc){doc.documentElement.removeAttribute('data-theme');doc.body.classList.add('export-mode')}});const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const file=new File([blob],'crono.png',{type:'image/png'});if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Crono Máquina',text})}else{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='crono-maquina.png';document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),100);window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer')}}catch(e){if(e.name!=='AbortError')console.error('Erro WhatsApp:',e)}finally{restoreBtn()}}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({state:{running:state.running,startedAt:state.startedAt,totalElapsedMs:state.totalElapsedMs,currentLapStartMs:state.currentLapStartMs,laps:state.laps},form:{equipName:els.equipName.value,analystName:els.analystName.value,analysisMode:els.analysisMode.value,units:els.units.value,defaultLapQty:els.defaultLapQty.value,timeUnit:els.timeUnit.value,takt:els.takt.value,target:els.target.value,lapQtyMode:els.lapQtyMode.value}}))}catch(e){console.warn('[Crono] Falha ao salvar dados locais:',e)}}
function load(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;const data=JSON.parse(raw);if(data&&typeof data==='object'&&data.form&&typeof data.form==='object')Object.entries(data.form).forEach(([k,v])=>{if(els[k]&&(typeof v==='string'||typeof v==='number'))els[k].value=String(v).slice(0,200)});if(data&&data.state&&typeof data.state==='object'){state.running=false;state.startedAt=null;state.totalElapsedMs=Math.max(0,Number(data.state.totalElapsedMs)||0);state.currentLapStartMs=Number(data.state.currentLapStartMs)||null;const arr=Array.isArray(data.state.laps)?data.state.laps:[];state.laps=arr.filter(l=>l&&typeof l==='object').map(l=>({id:typeof l.id==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(l.id)?l.id:id(),durationMs:Math.max(0,Number(l.durationMs)||0),qty:Number.isFinite(Number(l.qty))?Number(l.qty):null,obs:typeof l.obs==='string'?l.obs.slice(0,200):'',cause:typeof l.cause==='string'?l.cause.slice(0,50):'Normal',endedAt:Number(l.endedAt)||null}))}}catch(e){localStorage.removeItem(STORAGE_KEY)}}
const ACTIONS={start:startTimer,stop:stopTimer,reset:resetTimer,lap:recordLap,exportCsv:exportToExcel,exportPng:()=>window.generatePNG?.(),exportPdf:()=>window.generateRealPDF?.(),shareWhatsapp:shareWhatsApp,info:t=>showInfo(t.dataset.info),closeInfo:closeInfo,closeQty:t=>closeQtyModal(t.dataset.confirm==='true'),closeConfirm:t=>closeConfirmModal(t.dataset.confirm==='true'),deleteLap:t=>deleteLap(t.dataset.lapId)};
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
    if(t.classList?.contains('history-qty-input'))updateLapQty(t.dataset.lapId,t.value);
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
function init(){if(els.appVersion)els.appVersion.textContent=APP_VERSION;load();prevTimeUnit=els.timeUnit?.value||'3600';bind();render()}init();
window.getCronoMachineData=getCronoMachineData;
})();
