'use strict';

(function(){
  function $(id){return document.getElementById(id)}

  function setButtonState(id,loadingText){
    const btn=$(id);
    if(!btn) return function(){};
    const oldText=btn.textContent;
    btn.disabled=true;
    btn.textContent=loadingText;
    return function(){
      btn.textContent=oldText;
      const hasSamples=Number(($('valSamples')?.textContent||'0').replace(',','.'))>0;
      btn.disabled=!hasSamples;
    };
  }

  function safeName(ext){
    const equip=($('equipName')?.value||'crono-maquina').trim()||'crono-maquina';
    return equip
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9-_]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .toLowerCase()+ext;
  }

  function downloadBlob(blob,filename){
    if(!blob) throw new Error('Arquivo não gerado.');
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function applyExportSafeStyles(doc){
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
      body,#exportContainer{background:#ffffff !important;color:#222222 !important;}
      .app-header,.fixed-bottom,.modal-overlay{display:none !important;}
      .info-icon{background:#e5e7eb !important;color:#555555 !important;}
      .result-box,.print-summary{background:#f8f9fa !important;border-color:#dddddd !important;}
      .chart-wrapper,.histogram-wrapper{background:#f4f4f4 !important;border-color:#333333 !important;}
      .chart-bar,.hist-bar{background:#007bff !important;}
      .chart-bar.over-takt{background:#dc3545 !important;}
      .chart-bar.under-takt{background:#28a745 !important;}
      .avg-line{border-top-color:#333333 !important;}
      .takt-line{background:#000000 !important;}
      .avg-label,.takt-label,.hist-label,.hist-x-label{color:#000000 !important;}
    `;
    doc.head.appendChild(style);
  }

  async function captureReportCanvas(){
    const container=$('exportContainer');
    if(!container) throw new Error('Área do relatório não encontrada.');
    if(typeof window.html2canvas!=='function') throw new Error('Biblioteca html2canvas não carregada.');
    if(typeof window.renderPrint==='function') window.renderPrint();

    return await window.html2canvas(container,{
      scale:2,
      backgroundColor:'#ffffff',
      useCORS:true,
      allowTaint:true,
      logging:false,
      onclone:applyExportSafeStyles
    });
  }

  async function canvasToBlob(canvas){
    return await new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao converter imagem.')),'image/png',0.95);
    });
  }

  window.generatePNG=async function(){
    const restore=setButtonState('btnPNG','⏳ Gerando...');
    try{
      const canvas=await captureReportCanvas();
      const blob=await canvasToBlob(canvas);
      downloadBlob(blob,safeName('.png'));
    }catch(e){
      console.error('Erro PNG:',e);
      alert(e.message||'Erro ao gerar PNG.');
    }finally{
      restore();
    }
  };

  window.generateRealPDF=async function(){
    const restore=setButtonState('btnPDF','⏳ Gerando...');
    try{
      if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('Biblioteca jsPDF não carregada.');
      const canvas=await captureReportCanvas();
      const img=canvas.toDataURL('image/png');
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF('p','mm','a4');
      const pageW=pdf.internal.pageSize.getWidth();
      const pageH=pdf.internal.pageSize.getHeight();
      pdf.addImage(img,'PNG',0,0,pageW,pageH,undefined,'FAST');
      pdf.save(safeName('.pdf'));
    }catch(e){
      console.error('Erro PDF:',e);
      alert(e.message||'Erro ao gerar PDF.');
    }finally{
      restore();
    }
  };

  function rebind(){
    const png=$('btnPNG');
    const pdf=$('btnPDF');
    if(png) png.onclick=window.generatePNG;
    if(pdf) pdf.onclick=window.generateRealPDF;
  }

  rebind();
  window.addEventListener('load',rebind);
  window.__EXPORT_FIXES_LOADED__=true;
})();
