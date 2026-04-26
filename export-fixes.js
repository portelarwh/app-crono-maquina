'use strict';

(function(){
  function $(id){return document.getElementById(id);}
  function txt(id,fb='—'){const el=$(id);return (el&&(el.textContent||el.value||'').trim())||fb;}
  function val(id,fb=''){const el=$(id);return (el&&String(el.value||'').trim())||fb;}
  function unit(){return $('timeUnit')?.value==='60'?'un/min':'un/h';}
  function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}

  function setButtonState(id,text){
    const btn=$(id); if(!btn) return function(){};
    const old=btn.textContent; btn.disabled=true; btn.textContent=text;
    return function(){btn.textContent=old;btn.disabled=Number(txt('valSamples','0').replace(',','.'))<=0;};
  }

  function safeName(ext){
    const base=(val('equipName','crono-maquina')||'crono-maquina').trim();
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()+ext;
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=name; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function canvasToBlob(canvas){
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar imagem.')),'image/png',0.95));
  }

  function readSamples(){
    const rows=[...document.querySelectorAll('#historyListScreen .history-row')];
    const samples=[];
    rows.forEach((row,i)=>{
      const raw=(row.querySelector('.history-time')?.textContent||'').trim();
      const n=parseFloat(raw.replace(',','.'));
      if(Number.isFinite(n)) samples.push({idx:i+1,time:n,label:raw.replace('s','')});
    });
    return samples;
  }

  const icon={
    gear:'⚙️', cal:'▣', user:'●', eq:'▥', chart:'⌁', cube:'◇', gauge:'◔', clock:'◷', target:'◎', info:'i', list:'☷', shield:'▱', sum:'Σ', up:'↗', down:'↓', bars:'▮', check:'✓'
  };

  function paramBlock(label,value,ico){
    return `<div class="param"><div class="ico">${ico}</div><div><div class="plabel">${label}</div><div class="pvalue">${esc(value)}</div></div></div>`;
  }

  function card(label,value,color,ico){
    return `<div class="metric"><div class="mico" style="color:${color}">${ico}</div><div class="mtitle">${label}</div><div class="mvalue" style="color:${color}">${esc(value)}</div></div>`;
  }

  function metricsHtml(){
    return [
      card('AMOSTRAS (N)',txt('valSamples','0'),'#07183a',icon.list),
      card(`CAPACIDADE (${unit().toUpperCase()})`,txt('valHourlyCap','0'),'#0879e9',icon.gauge),
      card('ÚLTIMO CICLO',txt('valLastCycle','0.00s'),'#07183a',icon.clock),
      card('CICLO MÉDIO',txt('valAvgCycle','0.00s'),'#f26b00',icon.bars),
      card('MÍNIMO',txt('valMinCycle','0.00s'),'#1e9a44',icon.down),
      card('MÁXIMO',txt('valMaxCycle','0.00s'),'#df1f2d',icon.up),
      card('DESVIO PADRÃO',txt('valStdDev','0.00s'),'#6b35a8',icon.sum),
      card('ÍNDICE DE ESTABILIDADE',txt('valEstabilidade','100.0%'),'#0879e9',icon.shield)
    ].join('')+`<div class="eff"><div class="effico">${icon.target}</div><div><div class="mtitle">EFICIÊNCIA (%)</div><div class="effval">${esc(txt('valEfficiency','--'))}</div></div></div>`;
  }

  function controlChart(samples){
    const avg=parseFloat(txt('valAvgCycle','0').replace(',','.'))||0;
    const takt=parseFloat(val('takt','0').replace(',','.'))||0;
    const max=Math.max(...samples.map(s=>s.time),avg,takt,1);
    const ticks=[0,.25,.5,.75,1].map(p=>`<div class="gridline" style="bottom:${p*100}%"></div>`).join('');
    const bars=samples.map(s=>{
      const h=Math.max(3,Math.min(100,s.time/max*100));
      const color=takt&&s.time>takt?'#ef334a':'#2da84e';
      return `<div class="cbarwrap"><div class="cbar" style="height:${h}%;background:${color}"></div><div class="xlabel">${s.idx}</div></div>`;
    }).join('');
    const avgB=Math.min(100,avg/max*100), taktB=takt?Math.min(100,takt/max*100):null;
    return `<section class="panel chartpanel"><h2>CURVA DE CONTROLE DE CICLOS</h2><div class="ylabel">Tempo (s)</div><div class="chartbox">${ticks}<div class="ref avg" style="bottom:${avgB}%"><span>MÉDIA ${avg.toFixed(2)}s</span></div>${taktB!==null?`<div class="ref takt" style="bottom:${taktB}%"><span>TAKT ${takt:g}s</span></div>`.replace(':g',''):''}<div class="bars">${bars}</div></div><div class="axisname">Amostras</div></section>`;
  }

  function histogram(samples){
    if(!samples.length) return `<section class="panel chartpanel"><h2>HISTOGRAMA (DISTRIBUIÇÃO)</h2></section>`;
    const times=samples.map(s=>s.time), min=Math.min(...times), max=Math.max(...times), bins=5, range=Math.max(.01,max-min);
    const counts=Array(bins).fill(0); times.forEach(v=>{let ix=Math.floor((v-min)/range*bins); if(ix>=bins)ix=bins-1; counts[ix]++;});
    const mc=Math.max(...counts,1);
    const bars=counts.map((c,i)=>{
      const h=Math.max(3,c/mc*100); const a=min+range/bins*i; const b=min+range/bins*(i+1);
      return `<div class="hwrap"><div class="hbar" style="height:${h}%"><span>${c}</span></div><div class="hlabel">${a.toFixed(1)} - ${b.toFixed(1)}</div></div>`;
    }).join('');
    const lines=[0,25,50,75,100].map(v=>`<div class="gridline" style="bottom:${v}%"></div>`).join('');
    return `<section class="panel chartpanel hist"><h2>HISTOGRAMA (DISTRIBUIÇÃO)</h2><div class="ylabel">Frequência</div><div class="chartbox">${lines}<div class="hbars">${bars}</div></div><div class="axisname">Tempo (s)</div></section>`;
  }

  function sampleTable(samples){
    const half=Math.ceil(samples.length/2);
    const left=samples.slice(0,half), right=samples.slice(half);
    const rows=Array.from({length:half}).map((_,i)=>{
      const a=left[i], b=right[i];
      return `<tr><td>${a?`<b>${a.idx}</b>`:''}</td><td>${a?`${a.label}`:''}</td><td>–</td><td>${b?`<b>${b.idx}</b>`:''}</td><td>${b?`${b.label}`:''}</td><td>–</td></tr>`;
    }).join('');
    return `<section class="panel samples"><h3>${icon.cal} AMOSTRAS COLETADAS</h3><table><thead><tr><th>#</th><th>Tempo (s)</th><th>Observação</th><th>#</th><th>Tempo (s)</th><th>Observação</th></tr></thead><tbody>${rows}</tbody></table><p>Obs.: Tempos em segundos (s).</p></section>`;
  }

  function createReportElement(doc){
    const samples=readSamples();
    const report=doc.createElement('div');
    report.className='report-a4';
    report.innerHTML=`
      <style>
        *{box-sizing:border-box} body{margin:0;background:#fff} .report-a4{width:794px;min-height:1123px;background:#fff;color:#07183a;padding:24px 28px 22px;font-family:Arial,Helvetica,sans-serif;line-height:1.2;}
        .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #07183a;padding-bottom:12px;margin-bottom:16px}.brand{display:flex;gap:14px;align-items:center}.gear{font-size:46px;line-height:1}.title{font-size:24px;font-weight:900;letter-spacing:-.04em}.subtitle{font-size:13px;color:#58677d;margin-top:4px}.meta{font-size:13px;line-height:1.6;text-align:right;color:#07183a}.main{display:grid;grid-template-columns:46% 54%;gap:16px;align-items:start}.panel{border:1px solid #d5dce8;border-radius:8px;background:#fff;box-shadow:0 1px 5px rgba(7,24,58,.06)}
        .params{display:grid;grid-template-columns:1fr 1fr;gap:15px 18px;padding:18px}.param{display:flex;align-items:center;gap:10px}.ico{width:24px;text-align:center;font-size:19px;color:#07183a}.plabel{font-size:11px;color:#07183a;font-weight:500}.pvalue{font-size:14px;color:#07183a;font-weight:800;margin-top:2px}.summary{margin-top:14px;padding:16px 16px 16px 20px;border-left:4px solid #0d7df2;background:#f7faff;color:#10213d;font-size:12px}.summary .sico{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#0d7df2;color:#fff;align-items:center;justify-content:center;font-weight:900;margin-right:9px}.time{text-align:center;margin:24px 0 14px;font-weight:900;color:#07183a}.time small{font-size:13px}.time span{font-size:27px;color:#0879e9;font-family:monospace}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{min-height:104px;border:1px solid #d5dce8;border-radius:7px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;text-align:center}.mico{font-size:25px;height:29px}.mtitle{font-size:9px;color:#07183a;font-weight:900;margin:5px 0 7px}.mvalue{font-size:23px;font-weight:900}.eff{grid-column:span 4;min-height:76px;border:1px solid #d5dce8;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;gap:15px}.effico{font-size:34px;color:#07183a}.effval{font-size:27px;font-weight:900;color:#07183a}
        .chartpanel{padding:12px 14px 14px;margin-bottom:16px}.chartpanel h2{margin:0 0 8px;text-align:center;font-size:18px;color:#07183a;font-weight:900}.chartbox{height:240px;border-left:2px solid #07183a;border-bottom:2px solid #07183a;position:relative;background:#fff;margin-left:8px}.gridline{position:absolute;left:0;right:0;border-top:1px dashed #ccd4df}.bars,.hbars{position:absolute;inset:0 10px 0 22px;display:flex;align-items:flex-end;gap:6px}.cbarwrap{flex:1;height:100%;display:flex;align-items:flex-end;position:relative}.cbar{width:100%;border-radius:4px 4px 0 0;border:1px solid rgba(7,24,58,.2)}.xlabel{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800}.ylabel{font-size:10px;font-weight:800;margin-bottom:4px}.axisname{text-align:center;margin-top:22px;font-size:12px;font-weight:900}.ref{position:absolute;left:0;right:0;z-index:3}.ref.avg{border-top:2px dashed #9aa6b5}.ref.takt{border-top:2px dashed #f26b00}.ref span{float:right;background:#fff;padding:0 5px;font-size:10px;font-weight:900}.hwrap{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative}.hbar{width:82%;background:#118bee;border-radius:4px 4px 0 0;position:relative}.hbar span{position:absolute;top:-19px;left:50%;transform:translateX(-50%);font-size:15px;font-weight:900}.hlabel{position:absolute;bottom:-24px;font-size:10px;font-weight:800}.hist .chartbox{height:230px}
        .samples{margin-top:14px;padding:12px 12px 10px}.samples h3{font-size:14px;margin:0 0 10px;font-weight:900}.samples table{width:100%;border-collapse:collapse;font-size:11px}.samples th{background:#f3f6fa;color:#07183a;font-weight:900}.samples td,.samples th{border:1px solid #d5dce8;padding:5px;text-align:center}.samples p{font-size:10px;color:#58677d;margin:7px 0 0}.foot{margin-top:26px;border-top:3px solid #07183a;padding-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;font-size:11px;color:#07183a;align-items:center}.foot b{display:block;font-size:12px}.sig{border-top:1px solid #07183a;text-align:center;padding-top:6px;color:#07183a}
      </style>
      <header class="top"><div class="brand"><div class="gear">${icon.gear}</div><div><div class="title">RELATÓRIO DE CRONOANÁLISE DE PROCESSOS</div><div class="subtitle">Documento de controle de estabilidade e tempo padrão</div></div></div><div class="meta"><div>▣ <b>Data:</b> ${new Date().toLocaleDateString('pt-BR')}</div><div>● <b>Analista:</b> ${esc(val('analystName','—'))}</div></div></header>
      <main class="main"><section><div class="panel params">${paramBlock('Equipamento/Operação:',val('equipName','—'),icon.eq)}${paramBlock('Tipo de análise:',$('analysisMode')?.selectedOptions?.[0]?.textContent||'—',icon.chart)}${paramBlock('Peças/Ciclo:',val('units','—'),icon.cube)}${paramBlock('Capacidade Medida:',unit(),icon.gauge)}${paramBlock('Takt Time:',`${val('takt','—')}s`,icon.clock)}${paramBlock('Meta de Produção:',val('target','—'),icon.target)}</div><div class="panel summary"><span class="sico">i</span>${esc(txt('printExecutiveSummary','—'))}</div><div class="time"><small>TEMPO TOTAL DE MEDIÇÃO</small> ${icon.clock} <span>${esc(txt('totalTimer','00:00'))}</span></div><div class="metrics">${metricsHtml()}</div></section><section>${controlChart(samples)}${histogram(samples)}</section></main>${sampleTable(samples)}<footer class="foot"><div>${icon.gear} <b>Crono Máquina v2.4.9</b>Sistema de cronoanálise e tempo padrão</div><div>${icon.shield} <b>Dados coletados com precisão</b>para tomada de decisão confiável</div><div class="sig">Assinatura do Analista</div></footer>`;
    return report;
  }

  function createSandbox(){
    const iframe=document.createElement('iframe'); iframe.style.cssText='position:fixed;left:-1200px;top:0;width:900px;height:1300px;border:0;visibility:hidden;'; document.body.appendChild(iframe);
    const doc=iframe.contentDocument; doc.open(); doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); doc.close(); return {iframe,doc};
  }

  async function captureA4(){
    if(typeof window.html2canvas!=='function') throw new Error('html2canvas não carregado.');
    const {iframe,doc}=createSandbox(); const report=createReportElement(doc); doc.body.appendChild(report); await new Promise(r=>setTimeout(r,80));
    try{return await window.html2canvas(report,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true});} finally{iframe.remove();}
  }

  async function exportPNG(){const restore=setButtonState('btnPNG','⏳ Gerando...'); try{const canvas=await captureA4();downloadBlob(await canvasToBlob(canvas),safeName('.png'));}catch(e){console.error(e);alert(e.message||'Erro ao gerar PNG.');}finally{restore();}}
  async function exportPDF(){const restore=setButtonState('btnPDF','⏳ Gerando...'); try{if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('jsPDF não carregado.'); const canvas=await captureA4(); const {jsPDF}=window.jspdf; const pdf=new jsPDF('p','mm','a4'); pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297,undefined,'FAST'); pdf.save(safeName('.pdf'));}catch(e){console.error(e);alert(e.message||'Erro ao gerar PDF.');}finally{restore();}}

  window.generatePNG=exportPNG; window.generateRealPDF=exportPDF;
  function rebind(){const png=$('btnPNG');const pdf=$('btnPDF');if(png) png.onclick=exportPNG;if(pdf) pdf.onclick=exportPDF;} rebind(); window.addEventListener('load',rebind);
})();
