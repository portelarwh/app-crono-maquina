'use strict';

(function(){
  function $(id){return document.getElementById(id)}

  function setButtonState(id,text){
    const btn=$(id);
    if(!btn) return function(){};
    const old=btn.textContent;
    btn.disabled=true;
    btn.textContent=text;
    return function(){
      btn.textContent=old;
      const has=Number(($('valSamples')?.textContent||'0').replace(',','.'))>0;
      btn.disabled=!has;
    };
  }

  function safeName(ext){
    const base=($('equipName')?.value||'crono-maquina').trim()||'crono-maquina';
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
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar imagem.')),'image/png',0.95);
    });
  }

  function injectRefinedA4(doc){
    doc.documentElement.removeAttribute('data-theme');
    doc.body.classList.add('export-mode');

    const style=doc.createElement('style');
    style.textContent=`
      *,*::before,*::after{
        color-scheme:light !important;
        box-shadow:none !important;
        text-shadow:none !important;
        backdrop-filter:none !important;
        -webkit-backdrop-filter:none !important;
      }
      html,body{background:#ffffff !important;color:#222 !important;margin:0 !important;}
      body.export-mode{width:794px !important;min-height:1123px !important;padding:0 !important;overflow:hidden !important;}
      #exportContainer{
        width:794px !important;
        min-height:1123px !important;
        padding:28px 30px 24px !important;
        background:#fff !important;
        box-sizing:border-box !important;
        font-family:Arial,Helvetica,sans-serif !important;
      }
      .print-header{
        display:flex !important;
        justify-content:space-between !important;
        align-items:flex-start !important;
        border-bottom:3px solid #333 !important;
        padding-bottom:8px !important;
        margin-bottom:12px !important;
      }
      .print-header h1{font-size:21px !important;margin:0 0 3px !important;color:#222 !important;font-weight:800 !important;letter-spacing:-.02em !important;}
      .print-header p{font-size:11px !important;margin:1px 0 !important;color:#555 !important;line-height:1.3 !important;}
      #print-wrapper{display:grid !important;grid-template-columns:44% 56% !important;gap:18px !important;align-items:start !important;width:100% !important;}
      .col-1,.col-2{width:auto !important;min-width:0 !important;}
      .card{background:transparent !important;border:0 !important;padding:0 !important;margin:0 0 9px !important;box-shadow:none !important;}
      #configForm,.btn-row,.live-timer,.fixed-bottom,.info-icon,.btn-delete,#actionButtons,#lapQtyModeGroup,.branding,.app-header,.modal-overlay{display:none !important;}
      .print-summary{
        display:grid !important;
        grid-template-columns:1fr 1fr !important;
        gap:4px 14px !important;
        padding:10px 12px !important;
        background:#f8f9fb !important;
        border:1px solid #d8dde6 !important;
        border-radius:6px !important;
        font-size:10.5px !important;
        line-height:1.28 !important;
        margin-bottom:10px !important;
        color:#222 !important;
      }
      .print-executive-summary{
        display:block !important;
        background:#f5f7fa !important;
        border-left:4px solid #1e88e5 !important;
        padding:8px 10px !important;
        margin-bottom:12px !important;
        font-size:10.5px !important;
        color:#555 !important;
        line-height:1.35 !important;
        font-style:italic !important;
      }
      .total-timer-wrap{display:block !important;text-align:center !important;margin:2px 0 10px !important;}
      .total-timer-label{font-size:10px !important;color:#999 !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.02em !important;}
      .total-timer{font-size:24px !important;color:#888 !important;font-weight:800 !important;font-family:monospace !important;}
      .results-grid{display:grid !important;grid-template-columns:repeat(4,1fr) !important;gap:7px !important;}
      .result-box{
        min-height:58px !important;
        display:flex !important;
        flex-direction:column !important;
        align-items:center !important;
        justify-content:center !important;
        background:#f8f9fb !important;
        border:1px solid #d8dde6 !important;
        border-radius:8px !important;
        padding:6px 5px !important;
      }
      .result-title{font-size:8px !important;color:#555 !important;font-weight:800 !important;text-transform:uppercase !important;line-height:1.15 !important;margin:0 0 3px !important;text-align:center !important;}
      .result-value{font-size:20px !important;line-height:1.05 !important;font-weight:800 !important;color:#111 !important;margin:0 !important;}
      .full-width{grid-column:span 4 !important;min-height:52px !important;}
      .text-green{color:#28a745 !important}.text-red{color:#dc3545 !important}.text-yellow{color:#c9a000 !important}.text-blue{color:#007bff !important}
      .chart-title{font-size:15px !important;font-weight:800 !important;color:#aaa !important;text-align:center !important;text-transform:uppercase !important;margin:10px 0 6px !important;letter-spacing:-.02em !important;}
      .chart-wrapper,.histogram-wrapper{
        height:164px !important;
        margin:0 0 26px !important;
        background:#f4f4f4 !important;
        border-left:2px solid #333 !important;
        border-bottom:2px solid #333 !important;
        border-top:0 !important;border-right:0 !important;
      }
      .histogram-wrapper{padding-top:20px !important;margin-bottom:18px !important;}
      .chart-bar,.hist-bar{background:#118bee !important;border-radius:3px 3px 0 0 !important;min-height:3px !important;}
      .chart-bar.over-takt{background:#dc3545 !important;border:1px solid #9d1c2b !important;}
      .chart-bar.under-takt{background:#28a745 !important;border:1px solid #1f7d35 !important;}
      .sample-label{display:block !important;color:#111 !important;font-size:8px !important;bottom:-15px !important;font-weight:700 !important;}
      .avg-line{border-top:1.5px dashed #333 !important;}
      .avg-label,.takt-label{font-size:9px !important;color:#222 !important;font-weight:800 !important;background:rgba(255,255,255,.75) !important;padding:1px 3px !important;}
      .takt-line{height:1.5px !important;background:#222 !important;}
      .hist-label{position:absolute !important;bottom:3px !important;color:#111 !important;font-size:8px !important;font-weight:800 !important;}
      .hist-x-label{font-size:8px !important;color:#666 !important;bottom:-17px !important;}
      #historyCard{display:block !important;margin-top:14px !important;padding-top:12px !important;border-top:1px solid #d6d6d6 !important;}
      #historyListScreen{display:none !important;}
      .print-only-history{
        display:grid !important;
        grid-template-columns:repeat(7,1fr) !important;
        gap:2px 7px !important;
        max-height:none !important;
        overflow:hidden !important;
        background:#fff !important;
        border:0 !important;
      }
      .history-row{display:flex !important;align-items:center !important;justify-content:space-between !important;border-bottom:1px solid #eee !important;padding:3px 3px !important;color:#111 !important;font-size:8px !important;}
      .history-id{color:#777 !important;font-weight:800 !important;width:20px !important;}
      .history-time{font-size:8px !important;color:#111 !important;font-family:monospace !important;text-align:right !important;}
    `;
    doc.head.appendChild(style);
  }

  async function captureReport(){
    const container=$('exportContainer');
    if(!container) throw new Error('Área do relatório não encontrada.');
    if(typeof window.html2canvas!=='function') throw new Error('html2canvas não carregado.');
    return await window.html2canvas(container,{scale:2,backgroundColor:'#fff',useCORS:true,allowTaint:true,logging:false,onclone:injectRefinedA4});
  }

  async function exportPNG(){
    const restore=setButtonState('btnPNG','⏳ Gerando...');
    try{
      const canvas=await captureReport();
      const blob=await canvasToBlob(canvas);
      downloadBlob(blob,safeName('.png'));
    }catch(e){console.error(e);alert(e.message||'Erro ao gerar PNG.');}
    finally{restore();}
  }

  async function exportPDF(){
    const restore=setButtonState('btnPDF','⏳ Gerando...');
    try{
      if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');
      const canvas=await captureReport();
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

  function rebind(){
    const png=$('btnPNG');
    const pdf=$('btnPDF');
    if(png) png.onclick=exportPNG;
    if(pdf) pdf.onclick=exportPDF;
  }

  rebind();
  window.addEventListener('load',rebind);
})();
