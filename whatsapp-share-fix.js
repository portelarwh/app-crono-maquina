'use strict';

(function(){
  function $(id){ return document.getElementById(id); }

  function num(value, digits){
    var n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits == null ? 1 : digits) : '—';
  }

  function downloadBlob(blob, name){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function buildSummaryText(){
    var data = typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : {};
    var form = data.form || {};
    var stats = data.stats || {};
    var extras = data.extras || {};
    var impact = data.impact || {};
    var standardTime = data.standardTime || {};
    var unit = form.timeUnitLabel || (($('timeUnit') && $('timeUnit').value === '60') ? 'un/min' : 'un/h');
    var equip = (form.equipName || ($('equipName') && $('equipName').value) || '').trim() || '-';
    var samples = Array.isArray(data.laps) ? data.laps.length : 0;

    return 'Resumo Executivo — Cronoanálise Máquina\n\n'
      + 'Equipamento: ' + equip + '\n'
      + 'Linha/Turno/Produto: ' + (extras.lineName || '-') + ' / ' + (extras.shiftName || '-') + ' / ' + (extras.productName || '-') + '\n'
      + 'Amostras: ' + samples + '\n'
      + 'Ciclo médio: ' + num(stats.av, 2) + 's\n'
      + 'Capacidade: ' + num(stats.cap, 1) + ' ' + unit + '\n'
      + 'Estabilidade: ' + num(stats.stab, 1) + '%\n'
      + 'Gap: ' + (impact.target ? (num(impact.gap, 1) + ' (' + num(impact.gapPct, 1) + '%) ' + unit) : '—') + '\n'
      + 'Perda/h: ' + (impact.target ? (num(impact.lossPerHour, 0) + ' un/h') : '—') + '\n'
      + 'Perda/turno: ' + (impact.target ? (num(impact.lossPerShift, 0) + ' un') : '—') + '\n'
      + 'Tempo padrão: ' + (standardTime.standardSec ? (num(standardTime.standardSec, 2) + 's') : '—');
  }

  async function shareOfficialPNG(){
    var btn = $('btnWhatsApp');
    var originalText = btn ? btn.textContent : '';

    if(typeof window.buildCronoMachinePNGBlob !== 'function'){
      alert('Função de geração do PNG não carregada. Recarregue a página e tente novamente.');
      return;
    }

    if(btn){
      btn.disabled = true;
      btn.textContent = '⏳ Gerando...';
    }

    try{
      var text = buildSummaryText();
      var blob = await window.buildCronoMachinePNGBlob();
      var fileName = typeof window.getCronoMachinePNGFileName === 'function'
        ? window.getCronoMachinePNGFileName()
        : 'crono-maquina.png';
      var file = new File([blob], fileName, { type: 'image/png' });

      if(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })){
        await navigator.share({
          files: [file],
          title: 'Cronoanálise Máquina',
          text: text
        });
      }else{
        downloadBlob(blob, fileName);
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
      }
    }catch(e){
      if(e && e.name === 'AbortError') return;
      console.error('Erro WhatsApp:', e);
      alert((e && e.message) || 'Erro ao gerar compartilhamento para WhatsApp.');
    }finally{
      if(btn){
        var data = typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : {};
        var hasSamples = Array.isArray(data.laps) && data.laps.length > 0;
        btn.textContent = originalText;
        btn.disabled = !hasSamples;
      }
    }
  }

  function bind(){
    var btn = $('btnWhatsApp');
    if(!btn || btn.dataset.officialWhatsappBound === 'true') return;

    btn.dataset.officialWhatsappBound = 'true';
    btn.addEventListener('click', function(event){
      if(btn.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      shareOfficialPNG();
    }, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  }else{
    bind();
  }
})();
