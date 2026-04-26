'use strict';

(function () {
  var PDF_SAMPLE_LIMIT = 20;

  function byId(id) { return document.getElementById(id); }
  function getText(id, fallback) {
    var el = byId(id);
    var value = el ? (el.textContent || el.value || '').trim() : '';
    return value || fallback || '—';
  }
  function getValue(id, fallback) {
    var el = byId(id);
    var value = el ? String(el.value || '').trim() : '';
    return value || fallback || '—';
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function unitLabel() {
    var el = byId('timeUnit');
    return el && el.value === '60' ? 'un/min' : 'un/h';
  }
  function setButtonState(id, label) {
    var btn = byId(id);
    if (!btn) return function () {};
    var oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    return function () {
      btn.textContent = oldText;
      var samples = Number(String(getText('valSamples', '0')).replace(',', '.'));
      btn.disabled = !(samples > 0);
    };
  }
  function safeFileName(ext) {
    var base = getValue('equipName', 'crono-maquina');
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() + ext;
  }
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem.'));
      }, 'image/png', 0.95);
    });
  }
  function readSamples() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#historyListScreen .history-row'));
    var samples = [];
    rows.forEach(function (row, i) {
      var raw = ((row.querySelector('.history-time') || {}).textContent || '').trim();
      var num = parseFloat(raw.replace(',', '.'));
      if (Number.isFinite(num)) samples.push({ idx: i + 1, time: num, label: raw.replace('s', '') });
    });
    return samples;
  }
  function metricCard(title, value, color, icon) {
    return '<div class="metric">' +
      '<div class="metricIcon" style="color:' + color + '">' + icon + '</div>' +
      '<div class="metricTitle">' + escapeHtml(title) + '</div>' +
      '<div class="metricValue" style="color:' + color + '">' + escapeHtml(value) + '</div>' +
    '</div>';
  }
  function metricsHtml() {
    return [
      metricCard('AMOSTRAS (N)', getText('valSamples', '0'), '#07183a', '☷'),
      metricCard('CAPACIDADE (' + unitLabel().toUpperCase() + ')', getText('valHourlyCap', '0'), '#0879e9', '◔'),
      metricCard('ÚLTIMO CICLO', getText('valLastCycle', '0.00s'), '#07183a', '◷'),
      metricCard('CICLO MÉDIO', getText('valAvgCycle', '0.00s'), '#f26b00', '▮'),
      metricCard('MÍNIMO', getText('valMinCycle', '0.00s'), '#1e9a44', '↓'),
      metricCard('MÁXIMO', getText('valMaxCycle', '0.00s'), '#df1f2d', '↗'),
      metricCard('DESVIO PADRÃO', getText('valStdDev', '0.00s'), '#6b35a8', 'Σ'),
      metricCard('ÍNDICE DE ESTABILIDADE', getText('valEstabilidade', '100.0%'), '#0879e9', '▱')
    ].join('') + '<div class="eff"><div class="effIcon">◎</div><div><div class="metricTitle">EFICIÊNCIA (%)</div><div class="effValue">' + escapeHtml(getText('valEfficiency', '--')) + '</div></div></div>';
  }
  function parameter(label, value, icon) {
    return '<div class="param"><div class="paramIcon">' + icon + '</div><div><div class="paramLabel">' + escapeHtml(label) + '</div><div class="paramValue">' + escapeHtml(value) + '</div></div></div>';
  }
  function controlChart(samples) {
    var avg = parseFloat(getText('valAvgCycle', '0').replace(',', '.')) || 0;
    var takt = parseFloat(getValue('takt', '0').replace(',', '.')) || 0;
    var max = Math.max.apply(null, samples.map(function (s) { return s.time; }).concat([avg, takt, 1]));
    var grid = [0, 25, 50, 75, 100].map(function (v) { return '<div class="gridLine" style="bottom:' + v + '%"></div>'; }).join('');
    var bars = samples.map(function (s) {
      var h = Math.max(3, Math.min(100, (s.time / max) * 100));
      var color = takt && s.time > takt ? '#ef334a' : '#2da84e';
      return '<div class="barWrap"><div class="bar" style="height:' + h + '%;background:' + color + '"></div><div class="xLabel">' + s.idx + '</div></div>';
    }).join('');
    var avgBottom = Math.min(100, (avg / max) * 100);
    var taktBottom = takt ? Math.min(100, (takt / max) * 100) : null;
    var taktLine = taktBottom === null ? '' : '<div class="refLine takt" style="bottom:' + taktBottom + '%"><span>TAKT ' + takt.toFixed(2).replace('.00', '') + 's</span></div>';
    return '<section class="panel chartPanel"><h2>CURVA DE CONTROLE DE CICLOS</h2><div class="yLabel">Tempo (s)</div><div class="chartBox">' + grid + '<div class="refLine avg" style="bottom:' + avgBottom + '%"><span>MÉDIA ' + avg.toFixed(2) + 's</span></div>' + taktLine + '<div class="bars">' + bars + '</div></div><div class="axisName">Amostras</div></section>';
  }
  function histogram(samples) {
    if (!samples.length) return '<section class="panel chartPanel"><h2>HISTOGRAMA (DISTRIBUIÇÃO)</h2></section>';
    var times = samples.map(function (s) { return s.time; });
    var min = Math.min.apply(null, times);
    var max = Math.max.apply(null, times);
    var bins = 5;
    var range = Math.max(0.01, max - min);
    var counts = [0, 0, 0, 0, 0];
    times.forEach(function (v) {
      var ix = Math.floor(((v - min) / range) * bins);
      if (ix >= bins) ix = bins - 1;
      counts[ix] += 1;
    });
    var highest = Math.max.apply(null, counts.concat([1]));
    var grid = [0, 25, 50, 75, 100].map(function (v) { return '<div class="gridLine" style="bottom:' + v + '%"></div>'; }).join('');
    var bars = counts.map(function (c, i) {
      var h = Math.max(3, (c / highest) * 100);
      var a = min + (range / bins) * i;
      var b = min + (range / bins) * (i + 1);
      return '<div class="hWrap"><div class="hBar" style="height:' + h + '%"><span>' + c + '</span></div><div class="hLabel">' + a.toFixed(1) + ' - ' + b.toFixed(1) + '</div></div>';
    }).join('');
    return '<section class="panel chartPanel hist"><h2>HISTOGRAMA (DISTRIBUIÇÃO)</h2><div class="yLabel">Frequência</div><div class="chartBox">' + grid + '<div class="hBars">' + bars + '</div></div><div class="axisName">Tempo (s)</div></section>';
  }
  function sampleTable(samples, title) {
    var half = Math.ceil(samples.length / 2);
    var left = samples.slice(0, half);
    var right = samples.slice(half);
    var rows = [];
    for (var i = 0; i < half; i += 1) {
      var a = left[i];
      var b = right[i];
      rows.push('<tr><td>' + (a ? '<b>' + a.idx + '</b>' : '') + '</td><td>' + (a ? a.label : '') + '</td><td>–</td><td>' + (b ? '<b>' + b.idx + '</b>' : '') + '</td><td>' + (b ? b.label : '') + '</td><td>–</td></tr>');
    }
    return '<section class="panel samples"><h3>▣ ' + escapeHtml(title || 'AMOSTRAS COLETADAS') + '</h3><table><thead><tr><th>#</th><th>Tempo (s)</th><th>Observação</th><th>#</th><th>Tempo (s)</th><th>Observação</th></tr></thead><tbody>' + rows.join('') + '</tbody></table><p>Obs.: Tempos em segundos (s).</p></section>';
  }
  function reportCss(extra) {
    return '<style>' +
      '*{box-sizing:border-box}body{margin:0;background:#fff}.reportA4{width:794px;min-height:1123px;background:#fff;color:#07183a;padding:24px 28px 22px;font-family:Arial,Helvetica,sans-serif;line-height:1.2}.top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #07183a;padding-bottom:12px;margin-bottom:16px}.brand{display:flex;gap:14px;align-items:center}.gear{font-size:46px;line-height:1}.title{font-size:24px;font-weight:900;letter-spacing:-.04em}.subtitle{font-size:13px;color:#58677d;margin-top:4px}.meta{font-size:13px;line-height:1.6;text-align:right;color:#07183a}.main{display:grid;grid-template-columns:46% 54%;gap:16px;align-items:start}.panel{border:1px solid #d5dce8;border-radius:8px;background:#fff;box-shadow:0 1px 5px rgba(7,24,58,.06)}.params{display:grid;grid-template-columns:1fr 1fr;gap:15px 18px;padding:18px}.param{display:flex;align-items:center;gap:10px}.paramIcon{width:24px;text-align:center;font-size:19px;color:#07183a}.paramLabel{font-size:11px;color:#07183a;font-weight:500}.paramValue{font-size:14px;color:#07183a;font-weight:800;margin-top:2px}.summary{margin-top:14px;padding:16px 16px 16px 20px;border-left:4px solid #0d7df2;background:#f7faff;color:#10213d;font-size:12px}.summary .sico{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#0d7df2;color:#fff;align-items:center;justify-content:center;font-weight:900;margin-right:9px}.time{text-align:center;margin:24px 0 14px;font-weight:900;color:#07183a}.time small{font-size:13px}.time span{font-size:27px;color:#0879e9;font-family:monospace}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metric{min-height:104px;border:1px solid #d5dce8;border-radius:7px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;text-align:center}.metricIcon{font-size:25px;height:29px}.metricTitle{font-size:9px;color:#07183a;font-weight:900;margin:5px 0 7px}.metricValue{font-size:23px;font-weight:900}.eff{grid-column:span 4;min-height:76px;border:1px solid #d5dce8;border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;gap:15px}.effIcon{font-size:34px;color:#07183a}.effValue{font-size:27px;font-weight:900;color:#07183a}.chartPanel{padding:12px 14px 14px;margin-bottom:16px}.chartPanel h2{margin:0 0 8px;text-align:center;font-size:18px;color:#07183a;font-weight:900}.chartBox{height:240px;border-left:2px solid #07183a;border-bottom:2px solid #07183a;position:relative;background:#fff;margin-left:8px}.gridLine{position:absolute;left:0;right:0;border-top:1px dashed #ccd4df}.bars,.hBars{position:absolute;inset:0 10px 0 22px;display:flex;align-items:flex-end;gap:6px}.barWrap{flex:1;height:100%;display:flex;align-items:flex-end;position:relative}.bar{width:100%;border-radius:4px 4px 0 0;border:1px solid rgba(7,24,58,.2)}.xLabel{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800}.yLabel{font-size:10px;font-weight:800;margin-bottom:4px}.axisName{text-align:center;margin-top:22px;font-size:12px;font-weight:900}.refLine{position:absolute;left:0;right:0;z-index:3}.refLine.avg{border-top:2px dashed #9aa6b5}.refLine.takt{border-top:2px dashed #f26b00}.refLine span{float:right;background:#fff;padding:0 5px;font-size:10px;font-weight:900}.hWrap{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative}.hBar{width:82%;background:#118bee;border-radius:4px 4px 0 0;position:relative}.hBar span{position:absolute;top:-19px;left:50%;transform:translateX(-50%);font-size:15px;font-weight:900}.hLabel{position:absolute;bottom:-24px;font-size:10px;font-weight:800}.hist .chartBox{height:230px}.samples{margin-top:14px;padding:12px 12px 10px}.samples h3{font-size:14px;margin:0 0 10px;font-weight:900}.samples table{width:100%;border-collapse:collapse;font-size:11px}.samples th{background:#f3f6fa;color:#07183a;font-weight:900}.samples td,.samples th{border:1px solid #d5dce8;padding:5px;text-align:center}.samples p{font-size:10px;color:#58677d;margin:7px 0 0}.foot{margin-top:26px;border-top:3px solid #07183a;padding-top:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;font-size:11px;color:#07183a;align-items:center}.foot b{display:block;font-size:12px}.sig{border-top:1px solid #07183a;text-align:center;padding-top:6px;color:#07183a}' +
      (extra || '') + '</style>';
  }
  function headerHtml(title, subtitle) {
    return '<header class="top"><div class="brand"><div class="gear">⚙️</div><div><div class="title">' + escapeHtml(title) + '</div><div class="subtitle">' + escapeHtml(subtitle) + '</div></div></div><div class="meta"><div>▣ <b>Data:</b> ' + new Date().toLocaleDateString('pt-BR') + '</div><div>● <b>Analista:</b> ' + escapeHtml(getValue('analystName', '—')) + '</div></div></header>';
  }
  function footerHtml() {
    return '<footer class="foot"><div>⚙️ <b>Crono Máquina v2.4.9</b>Sistema de cronoanálise e tempo padrão</div><div>▱ <b>Dados coletados com precisão</b>para tomada de decisão confiável</div><div class="sig">Assinatura do Analista</div></footer>';
  }
  function createReportElement(doc, options) {
    options = options || {};
    var samples = readSamples();
    var report = doc.createElement('div');
    report.className = 'reportA4';
    var mode = byId('analysisMode') && byId('analysisMode').selectedOptions[0] ? byId('analysisMode').selectedOptions[0].textContent : '—';
    var includeSamples = options.includeSamples !== false;
    report.innerHTML = reportCss(includeSamples ? '' : '.reportA4{min-height:1123px}.foot{margin-top:38px}') +
      headerHtml('RELATÓRIO DE CRONOANÁLISE DE PROCESSOS', 'Documento de controle de estabilidade e tempo padrão') +
      '<main class="main"><section><div class="panel params">' +
      parameter('Equipamento/Operação:', getValue('equipName', '—'), '▥') +
      parameter('Tipo de análise:', mode, '⌁') +
      parameter('Peças/Ciclo:', getValue('units', '—'), '◇') +
      parameter('Capacidade Medida:', unitLabel(), '◔') +
      parameter('Takt Time:', getValue('takt', '—') + 's', '◷') +
      parameter('Meta de Produção:', getValue('target', '—'), '◎') +
      '</div><div class="panel summary"><span class="sico">i</span>' + escapeHtml(getText('printExecutiveSummary', '—')) + '</div><div class="time"><small>TEMPO TOTAL DE MEDIÇÃO</small> ◷ <span>' + escapeHtml(getText('totalTimer', '00:00')) + '</span></div><div class="metrics">' + metricsHtml() + '</div></section><section>' + controlChart(samples) + histogram(samples) + '</section></main>' +
      (includeSamples ? sampleTable(samples, 'AMOSTRAS COLETADAS') : '<section class="panel samples"><h3>▣ AMOSTRAS COLETADAS</h3><p>Este estudo possui ' + samples.length + ' amostras. A tabela completa foi direcionada para a página 2 para preservar a leitura executiva da página principal.</p></section>') + footerHtml();
    return report;
  }
  function createSamplesPage(doc, samples) {
    var report = doc.createElement('div');
    report.className = 'reportA4 samplesPage';
    report.innerHTML = reportCss('.samplesPage .samples{margin-top:20px}.samplesPage .samples table{font-size:10.5px}.samplesPage .samples td,.samplesPage .samples th{padding:4px}.samplesPage .foot{margin-top:28px}') +
      headerHtml('DETALHAMENTO DAS AMOSTRAS', 'Tabela completa de tempos coletados durante a cronoanálise') +
      '<div class="panel params">' +
      parameter('Equipamento/Operação:', getValue('equipName', '—'), '▥') +
      parameter('Total de amostras:', String(samples.length), '☷') +
      parameter('Ciclo médio:', getText('valAvgCycle', '0.00s'), '▮') +
      parameter('Desvio padrão:', getText('valStdDev', '0.00s'), 'Σ') +
      '</div>' + sampleTable(samples, 'TABELA COMPLETA DE AMOSTRAS') + footerHtml();
    return report;
  }
  function createSandbox() {
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-1200px;top:0;width:900px;height:1300px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();
    return { iframe: iframe, doc: doc };
  }
  async function captureElement(element) {
    return await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
  }
  async function captureA4(options) {
    if (typeof window.html2canvas !== 'function') throw new Error('html2canvas não carregado.');
    var sandbox = createSandbox();
    var report = createReportElement(sandbox.doc, options || {});
    sandbox.doc.body.appendChild(report);
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    try { return await captureElement(report); }
    finally { sandbox.iframe.remove(); }
  }
  async function exportPNG() {
    var restore = setButtonState('btnPNG', '⏳ Gerando...');
    try {
      var canvas = await captureA4({ includeSamples: true });
      var blob = await canvasToBlob(canvas);
      downloadBlob(blob, safeFileName('.png'));
    } catch (e) {
      console.error(e);
      alert(e.message || 'Erro ao gerar PNG.');
    } finally {
      restore();
    }
  }
  async function exportPDF() {
    var restore = setButtonState('btnPDF', '⏳ Gerando...');
    try {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');
      var samples = readSamples();
      var twoPages = samples.length > PDF_SAMPLE_LIMIT;
      var sandbox = createSandbox();
      var page1 = createReportElement(sandbox.doc, { includeSamples: !twoPages });
      sandbox.doc.body.appendChild(page1);
      await new Promise(function (resolve) { setTimeout(resolve, 80); });
      var canvas1 = await captureElement(page1);
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      if (twoPages) {
        var page2 = createSamplesPage(sandbox.doc, samples);
        page1.remove();
        sandbox.doc.body.appendChild(page2);
        await new Promise(function (resolve) { setTimeout(resolve, 80); });
        var canvas2 = await captureElement(page2);
        pdf.addPage('a4', 'p');
        pdf.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      }
      sandbox.iframe.remove();
      pdf.save(safeFileName('.pdf'));
    } catch (e) {
      console.error(e);
      alert(e.message || 'Erro ao gerar PDF.');
    } finally {
      restore();
    }
  }
  window.generatePNG = exportPNG;
  window.generateRealPDF = exportPDF;
  function rebind() {
    var png = byId('btnPNG');
    var pdf = byId('btnPDF');
    if (png) png.onclick = exportPNG;
    if (pdf) pdf.onclick = exportPDF;
  }
  rebind();
  window.addEventListener('load', rebind);
})();