'use strict';

(function(){
  function $(id){return document.getElementById(id);}
  function txt(id,fb='—'){const el=$(id);return (el&&(el.textContent||el.value||'').trim())||fb;}
  function val(id,fb=''){const el=$(id);return (el&&String(el.value||'').trim())||fb;}

  function setButtonState(id,text){
    const btn=$(id);
    if(!btn) return function(){};
    const old=btn.textContent;
    btn.disabled=true;
    btn.textContent=text;
    return function(){
      btn.textContent=old;
      const has=Number((txt('valSamples','0')).replace(',','.'))>0;
      btn.disabled=!has;
    };
  }

  function safeName(ext){
    const base=(val('equipName','crono-maquina')||'crono-maquina').trim();
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()+ext;
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=name;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function canvasToBlob(canvas){
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar imagem.')),'image/png',0.95));
  }

  function readSamples(){
    const rows=[...document.querySelectorAll('#historyListScreen .history-row')];
    const samples=[];
    rows.forEach((row,i)=>{
      const time=(row.querySelector('.history-time')?.textContent||'').trim();
      const n=parseFloat(time.replace(',','.'));
      if(Number.isFinite(n)) samples.push({idx:i+1,time:n,label:time});
    });
    return samples;
  }

  function makeCards(){
    const cards=[
      ['AMOSTRAS (N)',txt('valSamples','0'),'#111'],
      ['CAPACIDADE',txt('valHourlyCap','0'),'#007bff'],
      ['ÚLTIMO CICLO',txt('valLastCycle','0.00s'),'#111'],
      ['CICLO MÉDIO',txt('valAvgCycle','0.00s'),'#b89600'],
      ['MÍNIMO',txt('valMinCycle','0.00s'),'#28a745'],
      ['MÁXIMO',txt('valMaxCycle','0.00s'),'#dc3545'],
      ['DESVIO PADRÃO',txt('valStdDev','0.00s'),'#111'],
      ['ÍNDICE DE ESTABIL.',txt('valEstabilidade','100.0%'),'#111'],
      ['EFICIÊNCIA (%)',txt('valEfficiency','--'),'#111']
    ];
    return cards.map((c,i)=>`<div style="${cardStyle(i===8)}"><div style="font-size:8px;color:#555;font-weight:800;text-align:center;line-height:1.15">${c[0]}</div><div style="font-size:${i===8?'20':'19'}px;color:${c[2]};font-weight:800;line-height:1.1;margin-top:4px">${c[1]}</div></div>`).join('');
  }

  function cardStyle(wide){
    return `background:#f8f9fb;border:1px solid #d8dde6;border-radius:8px;min-height:${wide?'48':'57'}px;padding:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;${wide?'grid-column:span 4;':''}`;
  }

  function buildControlChart(samples){
    const avg=parseFloat(txt('valAvgCycle','0').replace(',','.'))||0;
    const takt=parseFloat(val('takt','0').replace(',','.'))||0;
    const max=Math.max(...samples.map(s=>s.time),avg,takt,1);
    const bars=samples.map(s=>{
      const h=Math.max(4,Math.min(100,(s.time/max)*100));
      const color=takt&&s.time>takt?'#dc3545':'#28a745';
      return `<div style="flex:1;position:relative;height:${h}%;background:${color};border:1px solid rgba(0,0,0,.35);border-radius:3px 3px 0 0;min-width:5px"><span style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:8px;color:#111;font-weight:700">${s.idx}</span></div>`;
    }).join('');
    const avgBottom=Math.min(100,(avg/max)*100);
    const taktBottom=takt?Math.min(100,(takt/max)*100):null;
    return `<div style="font-size:15px;font-weight:800;color:#aaa;text-align:center;text-transform:uppercase;margin:8px 0 6px">Curva de Controle de Ciclos</div><div style="height:166px;background:#f4f4f4;border-left:2px solid #333;border-bottom:2px solid #333;display:flex;align-items:flex-end;gap:4px;position:relative;padding:0 6px 0 6px;margin-bottom:28px"><div style="position:absolute;left:0;right:0;bottom:${avgBottom}%;border-top:1.5px dashed #333;z-index:3"><span style="font-size:9px;font-weight:800;background:rgba(255,255,255,.8);color:#222">MÉDIA ${avg.toFixed(1)}s</span></div>${taktBottom!==null?`<div style="position:absolute;left:0;right:0;bottom:${taktBottom}%;border-top:1.5px solid #222;z-index:3;text-align:right"><span style="font-size:9px;font-weight:800;background:rgba(255,255,255,.8);color:#222">TAKT ${takt}s</span></div>`:''}${bars}</div>`;
  }

  function buildHistogram(samples){
    if(!samples.length) return '';
    const times=samples.map(s=>s.time);
    const min=Math.min(...times),max=Math.max(...times),bins=5,range=Math.max(0.01,max-min);
    const counts=Array(bins).fill(0);
    times.forEach(v=>{let ix=Math.floor((v-min)/range*bins);if(ix>=bins)ix=bins-1;counts[ix]++;});
    const mc=Math.max(...counts,1);
    const bars=counts.map((c,i)=>{
      const h=Math.max(3,(c/mc)*100);
      const label=(min+(range/bins)*i).toFixed(1);
      return `<div style="flex:1;height:100%;position:relative;display:flex;align-items:flex-end;justify-content:center"><div style="width:88%;height:${h}%;background:#118bee;border-radius:3px 3px 0 0;position:relative"><span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:800;color:#111">${c}</span></div><span style="position:absolute;bottom:-17px;font-size:8px;color:#666">${label}</span></div>`;
    }).join('');
    return `<div style="font-size:15px;font-weight:800;color:#aaa;text-align:center;text-transform:uppercase;margin:8px 0 6px">Histograma (Distribuição)</div><div style="height:166px;background:#f4f4f4;border-left:2px solid #333;border-bottom:2px solid #333;display:flex;align-items:flex-end;gap:6px;position:relative;padding:18px 8px 0;margin-bottom:18px">${bars}</div>`;
  }

  function buildSamples(samples){
    return `<div style="margin-top:14px;padding-top:11px;border-top:1px solid #d6d6d6;display:grid;grid-template-columns:repeat(7,1fr);gap:2px 7px">${samples.map(s=>`<div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:3px;font-size:8px;color:#111"><span style="color:#777;font-weight:800">#${s.idx}</span><span style="font-family:monospace;font-weight:700">${s.label}</span></div>`).join('')}</div>`;
  }

  function createReportElement(doc){
    const samples=readSamples();
    const report=doc.createElement('div');
    report.style.cssText='width:794px;min-height:1123px;background:#fff;color:#222;padding:28px 30px 24px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;';
    report.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #333;padding-bottom:8px;margin-bottom:12px">
        <div><div style="font-size:21px;font-weight:800;letter-spacing:-.02em">Relatório de Cronoanálise de Processos</div><div style="font-size:11px;color:#555;margin-top:3px">Documento de controle de estabilidade e tempo padrão.</div></div>
        <div style="font-size:11px;text-align:right;color:#444;line-height:1.45"><div><b>Data:</b> ${new Date().toLocaleDateString('pt-BR')}</div><div><b>Analista:</b> ${val('analystName','—')}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:44% 56%;gap:18px;align-items:start">
        <div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;padding:10px 12px;background:#f8f9fb;border:1px solid #d8dde6;border-radius:6px;font-size:10.5px;line-height:1.28;margin-bottom:10px">
            <div><b>Equipamento/Operação:</b><br>${val('equipName','—')}</div><div><b>Tipo de análise:</b><br>${$('analysisMode')?.selectedOptions?.[0]?.textContent||'—'}</div>
            <div><b>Peças/Ciclo:</b> ${val('units','—')}</div><div><b>Capacidade Medida:</b> ${$('timeUnit')?.value==='60'?'un/min':'un/h'}</div>
            <div><b>Takt Time:</b> ${val('takt','—')}s</div><div><b>Meta de Produção:</b> ${val('target','—')}</div>
          </div>
          <div style="background:#f5f7fa;border-left:4px solid #1e88e5;padding:8px 10px;margin-bottom:12px;font-size:10.5px;color:#555;line-height:1.35;font-style:italic">${txt('printExecutiveSummary','—')}</div>
          <div style="text-align:center;margin:2px 0 10px"><span style="font-size:10px;color:#999;font-weight:800;text-transform:uppercase">Tempo total de medição </span><span style="font-size:24px;color:#888;font-weight:800;font-family:monospace">${txt('totalTimer','00:00')}</span></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px">${makeCards()}</div>
        </div>
        <div>${buildControlChart(samples)}${buildHistogram(samples)}</div>
      </div>
      ${buildSamples(samples)}
    `;
    return report;
  }

  function createSandbox(){
    const iframe=document.createElement('iframe');
    iframe.style.cssText='position:fixed;left:-1200px;top:0;width:900px;height:1300px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc=iframe.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>');
    doc.close();
    return {iframe,doc};
  }

  async function captureA4(){
    if(typeof window.html2canvas!=='function') throw new Error('html2canvas não carregado.');
    const {iframe,doc}=createSandbox();
    const report=createReportElement(doc);
    doc.body.appendChild(report);
    await new Promise(r=>setTimeout(r,80));
    try{return await window.html2canvas(report,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true});}
    finally{iframe.remove();}
  }

  async function exportPNG(){
    const restore=setButtonState('btnPNG','⏳ Gerando...');
    try{const canvas=await captureA4();const blob=await canvasToBlob(canvas);downloadBlob(blob,safeName('.png'));}
    catch(e){console.error(e);alert(e.message||'Erro ao gerar PNG.');}
    finally{restore();}
  }

  async function exportPDF(){
    const restore=setButtonState('btnPDF','⏳ Gerando...');
    try{
      if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');
      const canvas=await captureA4();
      const img=canvas.toDataURL('image/png');
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF('p','mm','a4');
      pdf.addImage(img,'PNG',0,0,210,297,undefined,'FAST');
      pdf.save(safeName('.pdf'));
    }catch(e){console.error(e);alert(e.message||'Erro ao gerar PDF.');}
    finally{restore();}
  }

  window.generatePNG=exportPNG;
  window.generateRealPDF=exportPDF;
  function rebind(){const png=$('btnPNG');const pdf=$('btnPDF');if(png) png.onclick=exportPNG;if(pdf) pdf.onclick=exportPDF;}
  rebind();
  window.addEventListener('load',rebind);
})();
