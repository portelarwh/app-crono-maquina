'use strict';

(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function hasSamples() {
    const value = Number((byId('valSamples')?.textContent || '0').replace(',', '.'));
    return Number.isFinite(value) && value > 0;
  }

  function sanitizeFilename(value) {
    return String(value || 'cronoanalise')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'cronoanalise';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getText(id, fallback = '—') {
    const el = byId(id);
    const text = el ? (el.textContent || el.value || '').trim() : '';
    return text || fallback;
  }

  function getValue(id, fallback = '') {
    const el = byId(id);
    const value = el ? String(el.value || '').trim() : '';
    return value || fallback;
  }

  function buildWhatsAppSummary() {
    const equipName = getValue('equipName', 'Operação não informada');
    const analystName = getValue('analystName', 'Não informado');
    const samples = getText('valSamples', '0');
    const avgCycle = getText('valAvgCycle', '0.00s');
    const minCycle = getText('valMinCycle', '0.00s');
    const maxCycle = getText('valMaxCycle', '0.00s');
    const lastCycle = getText('valLastCycle', '0.00s');
    const stdDev = getText('valStdDev', '0.00s');
    const capacidade = getText('valHourlyCap', '0');
    const estabilidade = getText('valEstabilidade', '100.0%');
    const eficiencia = getText('valEfficiency', '--');
    const timeUnitValue = getValue('timeUnit', '3600');
    const takt = getValue('takt', '');
    const meta = getValue('target', '');
    const summary = getText('printExecutiveSummary', 'Resumo automático não disponível.');

    const unidadeTempo = timeUnitValue === '60' ? 'un/min' : 'un/h';
    const params = [];
    if (takt) params.push(`• 🎯 Takt Time: ${takt}s`);
    if (meta) params.push(`• 🎯 Meta: ${meta} ${unidadeTempo}`);
    params.push(`• 🧭 Unidade de capacidade: ${unidadeTempo}`);

    return [
      '📄 DADOS TÉCNICOS',
      `🏭 *Operação:* ${equipName}`,
      `👤 *Analista:* ${analystName}`,
      `🔢 *Amostras registradas:* ${samples}`,
      '',
      '⚙️ *Parâmetros da simulação*',
      ...params,
      '',
      '⏱️ *Resultados da medição*',
      `• 🟢 Ciclo médio: ${avgCycle}`,
      `• 🟢 Mínimo: ${minCycle}`,
      `• 🔴 Máximo: ${maxCycle}`,
      `• 🔵 Último ciclo: ${lastCycle}`,
      `• 📏 Desvio padrão: ${stdDev}`,
      '',
      '📊 *Indicadores*',
      `• ⚡ Capacidade: ${capacidade} ${unidadeTempo}`,
      `• 📈 Estabilidade: ${estabilidade}`,
      `• 🎯 Eficiência: ${eficiencia}`,
      '',
      '📝 *RESUMO:*',
      summary
    ].join('\n');
  }

  async function prepareCapture() {
    if (typeof window.stopTimer === 'function') {
      // não pausa a medição; apenas garante que os campos de tela já foram renderizados pelo app.js
    }

    document.body.classList.add('export-mode');

    const container = byId('exportContainer');
    if (!container) throw new Error('exportContainer não encontrado.');

    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 200)));
    return container;
  }

  function restoreCapture() {
    document.body.classList.remove('export-mode');
  }

  async function generateImageBlob() {
    if (!window.html2canvas) throw new Error('html2canvas não carregado.');

    const container = await prepareCapture();
    try {
      const canvas = await window.html2canvas(container, {
        scale: Math.min(2, window.devicePixelRatio || 2),
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight
      });

      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Não foi possível gerar o PNG.'));
        }, 'image/png', 0.95);
      });
    } finally {
      restoreCapture();
    }
  }

  async function generatePDFBlob() {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');

    const pngBlob = await generateImageBlob();
    const imgDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(pngBlob);
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const img = new Image();
    img.src = imgDataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const ratio = img.width / img.height;
    const pageRatio = pdfWidth / pdfHeight;
    let renderWidth;
    let renderHeight;
    let x;
    let y;

    if (ratio > pageRatio) {
      renderWidth = pdfWidth;
      renderHeight = pdfWidth / ratio;
      x = 0;
      y = (pdfHeight - renderHeight) / 2;
    } else {
      renderHeight = pdfHeight;
      renderWidth = pdfHeight * ratio;
      y = 0;
      x = (pdfWidth - renderWidth) / 2;
    }

    pdf.addImage(imgDataUrl, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');
    return pdf.output('blob');
  }

  async function runWithButtonState(buttonId, loadingText, task, shouldEnableAfter = hasSamples) {
    const btn = byId(buttonId);
    const oldText = btn ? btn.innerText : '';

    if (btn) {
      btn.innerText = loadingText;
      btn.disabled = true;
    }

    try {
      await task();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao gerar o arquivo.');
    } finally {
      if (btn) {
        btn.innerText = oldText;
        btn.disabled = !shouldEnableAfter();
      }
    }
  }

  window.generatePNG = function generatePNG() {
    return runWithButtonState('btnPNG', '⏳ Gerando...', async () => {
      const equipName = getValue('equipName', 'Cronoanalise');
      const pngBlob = await generateImageBlob();
      downloadBlob(pngBlob, `Cronoanalise_${sanitizeFilename(equipName)}.png`);
    });
  };

  window.generateRealPDF = function generateRealPDF() {
    return runWithButtonState('btnPDF', '⏳ Gerando...', async () => {
      const equipName = getValue('equipName', 'Cronoanalise');
      const pdfBlob = await generatePDFBlob();
      downloadBlob(pdfBlob, `Cronoanalise_${sanitizeFilename(equipName)}.pdf`);
    });
  };

  window.shareWhatsApp = function shareWhatsApp() {
    return runWithButtonState('btnWhatsApp', '⏳ Gerando...', async () => {
      const equipName = getValue('equipName', 'Operação não informada');
      const safeBase = sanitizeFilename(equipName || 'cronoanalise');
      const shareText = buildWhatsAppSummary();
      const pngBlob = await generateImageBlob();
      const pngFile = new File([pngBlob], `Cronoanalise_${safeBase}.png`, { type: 'image/png' });

      if (navigator.share) {
        try {
          if (!navigator.canShare || navigator.canShare({ files: [pngFile] })) {
            await navigator.share({
              title: `Cronoanálise - ${equipName}`,
              text: shareText,
              files: [pngFile]
            });
            return;
          }
        } catch (shareErr) {
          console.warn('Compartilhamento direto com anexo não concluído.', shareErr);
        }
      }

      downloadBlob(pngBlob, `Cronoanalise_${safeBase}.png`);
      const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n📎 O PNG do relatório foi baixado no aparelho para anexar manualmente.`)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      alert('O WhatsApp recebeu o resumo executivo. O PNG do relatório foi baixado no aparelho para anexar manualmente.');
    });
  };

  window.generateImageBlob = generateImageBlob;
  window.generatePDFBlob = generatePDFBlob;
  window.buildWhatsAppSummary = buildWhatsAppSummary;
})();
