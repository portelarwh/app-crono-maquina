'use strict';

(function(){
  function $(id){ return document.getElementById(id); }

  function num(value, digits){
    var n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits == null ? 1 : digits) : '—';
  }

  function clean(value, fallback){
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text || fallback || '—';
  }

  function fieldValue(id, fallback){
    var el = $(id);
    return clean(el ? (el.value || el.textContent || el.innerText) : '', fallback || '—');
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

function getConclusion(stats, impact){
  var executive = fieldValue('printExecutiveSummary', '');
  if(executive && executive !== '—') return executive;

  var stability = Number(stats && stats.stab);
  var gapPct = Number(impact && impact.gapPct);

  if(Number.isFinite(gapPct) && gapPct < 0){
    return 'A capacidade medida ficou abaixo da meta definida. A prioridade deve ser entender os ciclos acima do padrão e as perdas de ritmo.';
  }
  if(Number.isFinite(stability) && stability < 85){
    return 'A operação apresentou variação relevante entre os ciclos, indicando possível instabilidade no método, no processo ou nas condições de operação.';
  }
  if(Number.isFinite(stability) && stability >= 95){
    return 'A operação apresentou boa estabilidade na amostragem atual, com variação controlada entre os ciclos medidos.';
  }
  return 'A cronoanálise consolidou os principais indicadores de ciclo, capacidade e estabilidade do processo.';
}

function getAction(stats, impact){
  var stability = Number(stats && stats.stab);
  var gapPct = Number(impact && impact.gapPct);

  if(Number.isFinite(gapPct) && gapPct < 0){
    return 'Priorizar a análise dos ciclos mais longos, validar o método operacional e atuar nas causas que reduzem a capacidade frente à meta.';
  }
  if(Number.isFinite(stability) && stability < 85){
    return 'Investigar causas de variação, padronizar o método e repetir a medição após estabilizar o processo.';
  }
  if(Number.isFinite(stability) && stability >= 95){
    return 'Manter o padrão atual e usar os dados como referência para capacidade, tempo padrão e acompanhamento operacional.';
  }
  return 'Confirmar meta e takt, revisar os ciclos de maior duração e ampliar a amostragem para validar a estabilidade.';
}
  function buildSummaryText(){
    var data = typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : {};
    var form = data.form || {};
    var stats = data.stats || {};
    var extras = data.extras || {};
    var impact = data.impact || {};
    var standardTime = data.standardTime || {};
    var unit = form.timeUnitLabel || (($('timeUnit') && $('timeUnit').value === '60') ? 'un/min' : 'un/h');
    var equip = clean(form.equipName || (($('equipName') && $('equipName').value) || ''), 'Operação não informada');
    var analyst = clean(form.analystName || (($('analystName') && $('analystName').value) || ''), 'Não informado');
    var samples = Array.isArray(data.laps) ? data.laps.length : 0;
    var mode = fieldValue('analysisMode', 'cycle') === 'interval' ? 'Produção por intervalo' : 'Tempo por ciclo';
    var takt = fieldValue('takt', 'Não definido');
    var target = impact.target ? (num(impact.target, 1) + ' ' + unit) : fieldValue('target', 'Não definido');

   return '📊 *Resumo Executivo da Cronoanálise Máquina*\n'
  + '━━━━━━━━━━━━━━━━━━━━\n\n'

  + '🏭 *Operação*\n'
  + '• Equipamento: ' + equip + '\n'
  + '• Analista: ' + analyst + '\n'
  + '• Linha/Turno/Produto: ' + clean(extras.lineName, '-') + ' / ' + clean(extras.shiftName, '-') + ' / ' + clean(extras.productName, '-') + '\n'
  + '• Data: ' + new Date().toLocaleDateString('pt-BR') + '\n'
  + '• Tipo: ' + mode + '\n'
  + '• Amostras: ' + samples + '\n\n'

  + '⏱️ *Indicadores de Ciclo*\n'
  + '• Médio: ' + num(stats.av, 2) + 's\n'
  + '• Último: ' + fieldValue('valLastCycle', '—') + '\n'
  + '• Mínimo: ' + num(stats.min, 2) + 's\n'
  + '• Máximo: ' + num(stats.max, 2) + 's\n'
  + '• Desvio: ' + num(stats.std, 2) + 's\n'
  + '• Estabilidade: ' + num(stats.stab, 1) + '%\n\n'

  + '🏁 *Capacidade*\n'
  + '• Produção: ' + num(stats.cap, 1) + ' ' + unit + '\n'
  + '• Meta: ' + target + '\n'
  + '• Gap: ' + (impact.target ? (num(impact.gap, 1) + ' (' + num(impact.gapPct, 1) + '%)') : '—') + '\n'
  + '• Perda/h: ' + (impact.target ? (num(impact.lossPerHour, 0) + ' un/h') : '—') + '\n'
  + '• Perda/turno: ' + (impact.target ? (num(impact.lossPerShift, 0) + ' un') : '—') + '\n\n'

  + '📐 *Referência de Processo*\n'
  + '• Tempo padrão: ' + (standardTime.standardSec ? (num(standardTime.standardSec, 2) + 's') : '—') + '\n'
  + '• Takt Time: ' + (takt === 'Não definido' || takt === '—' ? '—' : takt + 's') + '\n'
  + '• Peças/ciclo: ' + fieldValue('units', '1') + '\n\n'

  + '📌 *Conclusão*\n'
  + getConclusion(stats, impact) + '\n\n'

  + '🚀 *Ação recomendada*\n'
  + getAction(stats, impact) + '\n\n'

  + '━━━━━━━━━━━━━━━━━━━━\n'
  + '⚙️ Operix • Cronoanálise Máquina';
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
