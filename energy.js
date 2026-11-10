'use strict';

/* ============================================================
   Módulo de Energia (W / kW → kWh) + seletor de unidade de tempo
   ------------------------------------------------------------
   Modelo de cálculo (baseado nos eventos já medidos, sem medidor físico):
     E_operando = P_operando × Σ tempo produtivo dos ciclos
     E_parada   = P_parada   × Σ duração das paradas
     E_total    = E_operando + E_parada                       [kWh]
     Wh/peça    = E_total × 1000 / peças produzidas
     Wh/ciclo   = P_operando × ciclo médio (ideal, sem paradas)
     kWh/turno  = (E_total / horas medidas) × Horas/dia        (projeção)
     Custo      = kWh × tarifa (R$/kWh)

   Integridade:
   • Usa tempo PRODUTIVO do ciclo (paradas internas são eventos próprios),
     então não há dupla contagem de energia.
   • Potências ficam salvas em kW internamente, independente da unidade
     digitada (W ou kW).
   • Não altera nenhum indicador existente: só acrescenta `data.energy`
     em getCronoMachineData() (estudos salvos passam a carregar a energia).

   Carregado DEPOIS de general-improvements.js (precisa do grid de extras
   e encadeia o wrapper de getCronoMachineData).
   ============================================================ */
(function(){
  var KEY = 'operix_crono_maquina_energy_v1';
  var OT = window.OperixTime;

  function $(id){ return document.getElementById(id); }
  function num(v){ var x = parseFloat(String(v == null ? '' : v).replace(',', '.').trim()); return Number.isFinite(x) ? x : NaN; }
  function fc(v, d){ return Number.isFinite(Number(v)) ? Number(v).toFixed(d).replace('.', ',') : '—'; }
  function readCfg(){ try{ return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }catch(_){ return {}; } }
  function writeCfg(c){ try{ localStorage.setItem(KEY, JSON.stringify(c)); }catch(_){} }

  /* ---------- configuração (lida da tela, com fallback no storage) ---------- */
  function getConfig(){
    var st = readCfg();
    var unit = ($('energyPowerUnit') && $('energyPowerUnit').value) || st.powerUnit || 'kW';
    var k = unit === 'W' ? 0.001 : 1;
    var run = $('energyPowerRun') ? num($('energyPowerRun').value) : num(st.powerRun);
    var idle = $('energyPowerIdle') ? num($('energyPowerIdle').value) : num(st.powerIdle);
    var tariff = $('energyTariff') ? num($('energyTariff').value) : num(st.tariff);
    return {
      powerUnit: unit,
      powerRunKw: Number.isFinite(run) && run > 0 ? run * k : 0,
      powerIdleKw: Number.isFinite(idle) && idle > 0 ? idle * k : 0,
      tariff: Number.isFinite(tariff) && tariff > 0 ? tariff : 0
    };
  }
  function persist(){
    writeCfg({
      powerUnit: $('energyPowerUnit') ? $('energyPowerUnit').value : 'kW',
      powerRun: $('energyPowerRun') ? $('energyPowerRun').value : '',
      powerIdle: $('energyPowerIdle') ? $('energyPowerIdle').value : '',
      tariff: $('energyTariff') ? $('energyTariff').value : ''
    });
  }

  /* ---------- cálculo puro (testável, sem DOM) ---------- */
  function calculate(data, cfg){
    var laps = (data && data.laps) || [];
    var prodSec = 0, downSec = 0;
    laps.forEach(function(l){
      if(l.type === 'downtime') downSec += Math.max(0, Number(l.durationSec) || 0);
      else {
        var p = Number.isFinite(Number(l.productiveSec)) && l.productiveSec !== null ? Number(l.productiveSec) : Number(l.durationSec);
        prodSec += Math.max(0, p || 0);
      }
    });
    var stats = (data && data.stats) || {}, extras = (data && data.extras) || {};
    var q = Number(stats.q) || 0, av = Number(stats.av) || 0;
    var shiftHours = Number(extras.shiftHours) > 0 ? Number(extras.shiftHours) : 8;
    var runKwh = cfg.powerRunKw * prodSec / 3600;
    var idleKwh = cfg.powerIdleKw * downSec / 3600;
    var totalKwh = runKwh + idleKwh;
    var measuredH = (prodSec + downSec) / 3600;
    var avgKw = measuredH > 0 ? totalKwh / measuredH : 0;
    var kwhPerShift = avgKw * shiftHours;
    var idlePerShift = measuredH > 0 ? idleKwh / measuredH * shiftHours : 0;
    var whPerPiece = q > 0 ? totalKwh * 1000 / q : NaN;
    return {
      configured: cfg.powerRunKw > 0,
      powerUnit: cfg.powerUnit, powerRunKw: cfg.powerRunKw, powerIdleKw: cfg.powerIdleKw, tariff: cfg.tariff,
      productiveSec: prodSec, downtimeSec: downSec, pieces: q,
      runKwh: runKwh, idleKwh: idleKwh, totalKwh: totalKwh,
      idlePct: totalKwh > 0 ? idleKwh / totalKwh * 100 : 0,
      avgKw: avgKw,
      whPerCycle: cfg.powerRunKw * 1000 * av / 3600,
      whPerPiece: whPerPiece,
      kwhPerShift: kwhPerShift, shiftHours: shiftHours,
      costPerPiece: cfg.tariff > 0 && Number.isFinite(whPerPiece) ? whPerPiece / 1000 * cfg.tariff : NaN,
      costPerShift: kwhPerShift * cfg.tariff,
      idleCostPerShift: idlePerShift * cfg.tariff
    };
  }

  /* ---------- UI: campos no setup ---------- */
  function injectFields(){
    var grid = document.querySelector('#configForm .config-grid');
    if(!grid || $('energyConfigBlock')) return;
    var st = readCfg();
    var unitOpts = Object.keys(OT ? OT.UNITS : { s: { label: 'Segundos (s)' } }).map(function(k){
      return '<option value="'+k+'">'+(OT ? OT.UNITS[k].label : 'Segundos (s)')+'</option>';
    }).join('');
    var block = document.createElement('div');
    block.id = 'energyConfigBlock';
    block.className = 'extra-config-grid full-width energy-config-grid';
    block.innerHTML =
        '<div class="input-group full-width"><label>Unidade de tempo (exibição)</label>'
      + '<select id="timeDisplayUnit">'+unitOpts+'</select>'
      + '<small class="energy-help">Só muda a exibição. Os dados continuam gravados em segundos.</small></div>'
      + '<div class="input-group"><label>⚡ Potência operando</label><input id="energyPowerRun" type="number" min="0" step="any" inputmode="decimal" placeholder="Opcional"></div>'
      + '<div class="input-group"><label>Potência em parada</label><input id="energyPowerIdle" type="number" min="0" step="any" inputmode="decimal" placeholder="Standby (opcional)"></div>'
      + '<div class="input-group"><label>Unidade de potência</label><select id="energyPowerUnit"><option value="kW">kW</option><option value="W">W (watts)</option></select></div>'
      + '<div class="input-group"><label>Tarifa (R$/kWh)</label><input id="energyTariff" type="number" min="0" step="any" inputmode="decimal" placeholder="Opcional"></div>';
    grid.appendChild(block);
    if(OT) $('timeDisplayUnit').value = OT.getUnit();
    $('energyPowerUnit').value = st.powerUnit === 'W' ? 'W' : 'kW';
    if(st.powerRun != null) $('energyPowerRun').value = st.powerRun;
    if(st.powerIdle != null) $('energyPowerIdle').value = st.powerIdle;
    if(st.tariff != null) $('energyTariff').value = st.tariff;

    // dica de conversão abaixo do Takt (input continua em segundos)
    var takt = $('takt');
    if(takt && !$('taktDecimalHint')){
      var h = document.createElement('small');
      h.id = 'taktDecimalHint';
      h.className = 'energy-help';
      takt.parentNode.appendChild(h);
    }
  }

  function renderTaktHint(){
    var h = $('taktDecimalHint'); if(!h || !OT) return;
    var t = num($('takt') && $('takt').value);
    var txt = OT.isDecimal() && t > 0 ? '= ' + OT.fmt(t, { comma: true }) : '';
    if(h.textContent !== txt) h.textContent = txt;
  }

  /* ---------- UI: painel de resultados ---------- */
  function injectPanel(){
    var results = document.querySelector('.results-grid');
    if(!results || $('energyPanel')) return;
    var panel = document.createElement('div');
    panel.id = 'energyPanel';
    panel.className = 'operix-mini-panel full-width';
    panel.innerHTML = '<div class="operix-panel-title">⚡ Energia — consumo estimado</div><div id="energyBox" class="energy-grid"></div>';
    // logo após o painel de impacto (antes do OEE), se existir
    var oee = $('oeePanel');
    if(oee && oee.parentNode === results) results.insertBefore(panel, oee); else results.appendChild(panel);
  }

  function card(label, value, cls){ return '<div class="'+(cls||'')+'"><span>'+label+'</span><strong>'+value+'</strong></div>'; }
  function whOrKwh(wh){ return !Number.isFinite(wh) ? '—' : (wh >= 1000 ? fc(wh/1000, 3) + ' kWh' : fc(wh, wh < 10 ? 2 : 1) + ' Wh'); }

  var lastHtml = '';
  function renderPanel(en){
    var box = $('energyBox'); if(!box) return;
    var html;
    if(!en || !en.configured){
      html = '<div class="energy-empty">Informe a potência da máquina no Setup (W ou kW) para estimar kWh/peça e custo por turno.</div>';
    } else {
      html = card('Energia/peça', whOrKwh(en.whPerPiece))
        + card('Energia/ciclo', whOrKwh(en.whPerCycle))
        + card('Medido', fc(en.totalKwh, en.totalKwh < 1 ? 3 : 2) + ' kWh')
        + card('Em paradas', fc(en.idlePct, 1) + '%', en.idlePct > 15 ? 'cardBad' : '')
        + card('kWh/turno', fc(en.kwhPerShift, 1))
        + (en.tariff > 0
            ? card('R$/turno', fc(en.costPerShift, 2))
            : card('Potência média', fc(en.avgKw, 2) + ' kW'));
    }
    if(html !== lastHtml){ box.innerHTML = html; lastHtml = html; }
  }

  /* ---------- camada de dados ---------- */
  function patchDataGetter(){
    var original = window.getCronoMachineData;
    if(typeof original !== 'function' || original.__operixEnergy) return;
    var wrapped = function(){
      var d = original.apply(this, arguments);
      try{ if(d) d.energy = calculate(d, getConfig()); }catch(e){ console.error('[Energia]', e); }
      return d;
    };
    wrapped.__operixEnergy = true;
    // preserva a marca do general-improvements p/ ele não re-embrulhar (evita dupla normalização)
    if(original.__operixDataLayer) wrapped.__operixDataLayer = true;
    window.getCronoMachineData = wrapped;
  }

  function update(){
    injectFields(); injectPanel(); patchDataGetter(); renderTaktHint();
    var d = null;
    try{ d = typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : null; }catch(_){}
    renderPanel(d && d.energy);
  }

  function injectStyles(){
    if($('operix-energy-style')) return;
    var st = document.createElement('style');
    st.id = 'operix-energy-style';
    st.textContent = ''
      + '.energy-config-grid{margin-top:8px}'
      + '.energy-help{display:block;font-size:.66rem;color:var(--text-muted);margin-top:3px;min-height:0}'
      + '.energy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}'
      + '.energy-grid div{background:var(--card-bg);border:1px solid var(--border);border-radius:7px;padding:8px 6px;text-align:center}'
      + '.energy-grid span{display:block;font-size:.63rem;color:var(--text-muted);font-weight:700;text-transform:uppercase}'
      + '.energy-grid strong{display:block;font-size:.92rem;color:var(--text-main);margin-top:3px}'
      + '.energy-grid div.cardBad{background:rgba(255,93,108,.16);border-color:#ff5d6c}'
      + '.energy-grid div.cardBad strong{color:#df1f2d}'
      + '.energy-grid .energy-empty{grid-column:1/-1;font-size:.75rem;color:var(--text-muted);font-weight:500;text-align:center}'
      + '.live-timer.live-timer-decimal{font-variant-numeric:tabular-nums}';
    document.head.appendChild(st);
  }

  function bind(){
    document.addEventListener('change', function(e){
      var id = e.target && e.target.id;
      if(id === 'timeDisplayUnit' && OT){ OT.setUnit(e.target.value); }
      if(id === 'energyPowerRun' || id === 'energyPowerIdle' || id === 'energyPowerUnit' || id === 'energyTariff') persist();
      setTimeout(update, 60);
    });
    document.addEventListener('input', function(e){
      var id = e.target && e.target.id;
      if(id === 'energyPowerRun' || id === 'energyPowerIdle' || id === 'energyTariff'){ persist(); }
      if(id === 'takt') renderTaktHint();
      if(/^energy/.test(id || '')) setTimeout(update, 60);
    });
    // troca de unidade de tempo (inclusive via preset) → sincroniza o select
    document.addEventListener('operix:timeunit', function(){ var s = $('timeDisplayUnit'); if(s && OT && s.value !== OT.getUnit()) s.value = OT.getUnit(); update(); });
    setInterval(function(){ if(!document.hidden) update(); }, 1000);
  }

  window.OperixEnergy = { calculate: calculate, getConfig: getConfig };

  function init(){ injectStyles(); bind(); update(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
