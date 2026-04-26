'use strict';

(function () {
  function byId(id){return document.getElementById(id);}

  async function generateImageBlob(){
    const source = byId('exportContainer');
    if(!source) throw new Error('Container não encontrado');

    document.body.classList.add('export-mode');
    if(typeof renderPrint === 'function') renderPrint();

    try {
      const canvas = await html2canvas(source, {
        scale: 2,
        backgroundColor: '#ffffff',
        onclone: function(clonedDoc) {
          clonedDoc.documentElement.removeAttribute('data-theme');
          clonedDoc.body.classList.add('export-mode');
        }
      });
      return await new Promise(res => canvas.toBlob(res, 'image/png'));
    } finally {
      document.body.classList.remove('export-mode');
    }
  }

  async function generatePDFBlob(){
    const blob = await generateImageBlob();
    const reader = new FileReader();
    const dataUrl = await new Promise(r => {
      reader.onloadend = () => r(reader.result);
      reader.readAsDataURL(blob);
    });

    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297);
    return pdf.output('blob');
  }

  function download(blob, name){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.generatePNG = async function(){
    try {
      const blob = await generateImageBlob();
      download(blob, 'crono-maquina.png');
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao gerar PNG:', e);
    }
  };

  window.generateRealPDF = async function(){
    try {
      const blob = await generatePDFBlob();
      download(blob, 'crono-maquina.pdf');
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao gerar PDF:', e);
    }
  };

  window.shareWhatsApp = async function(){
    try {
      const blob = await generateImageBlob();
      const file = new File([blob], 'crono.png', {type: 'image/png'});
      if(navigator.share && navigator.canShare && navigator.canShare({files: [file]})){
        await navigator.share({files: [file], title: 'Crono Máquina'});
      } else {
        download(blob, 'crono-maquina.png');
        window.open('https://wa.me', '_blank');
      }
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao compartilhar:', e);
    }
  };

  window.__EXPORT_FIXES_LOADED__ = true;
})();
