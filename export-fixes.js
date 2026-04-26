'use strict';

(function () {
  function byId(id){return document.getElementById(id);}

  function buildSummaryText(){
    const s = typeof stats === 'function' ? stats() : null;
    const equipName = (byId('equipName')?.value || '').trim() || '-';
    const timeUnit = byId('timeUnit')?.value;
    const unitLabel = timeUnit === '3600' ? 'un/h' : 'un/min';

    let text = 'Resumo Executivo — Cronoanálise Máquina\n\n';
    text += `Equipamento: ${equipName}\n`;
    if(s && Number.isFinite(s.av)){
      text += `Amostras: ${byId('valSamples')?.textContent || '-'}\n`;
      text += `Ciclo médio: ${s.av.toFixed(2)}s\n`;
      text += `Capacidade: ${s.cap.toFixed(1)} ${unitLabel}\n`;
      text += `Estabilidade: ${s.stab.toFixed(1)}%`;
    }
    return text;
  }

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

  function canShareFiles(file){
    return !!(navigator.share && navigator.canShare && navigator.canShare({files: [file]}));
  }

  // PNG: usa Web Share API (salva na galeria no mobile) ou download no desktop
  window.generatePNG = async function(){
    try {
      const blob = await generateImageBlob();
      const file = new File([blob], 'crono-maquina.png', {type: 'image/png'});
      if(canShareFiles(file)){
        await navigator.share({files: [file], title: 'Crono Máquina'});
      } else {
        download(blob, 'crono-maquina.png');
      }
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao gerar PNG:', e);
    }
  };

  // PDF: sempre salva no diretório via download direto
  window.generateRealPDF = async function(){
    try {
      const blob = await generatePDFBlob();
      download(blob, 'crono-maquina.pdf');
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao gerar PDF:', e);
    }
  };

  // WhatsApp: compartilha PNG + texto do relatório via Web Share API,
  // ou baixa o PNG e abre WhatsApp com mensagem pré-preenchida no desktop
  window.shareWhatsApp = async function(){
    try {
      const blob = await generateImageBlob();
      const file = new File([blob], 'crono.png', {type: 'image/png'});
      const text = buildSummaryText();

      if(canShareFiles(file)){
        await navigator.share({files: [file], title: 'Crono Máquina', text});
      } else {
        download(blob, 'crono-maquina.png');
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      }
    } catch(e) {
      if(e.name !== 'AbortError') console.error('Erro ao compartilhar:', e);
    }
  };

  window.__EXPORT_FIXES_LOADED__ = true;
})();
