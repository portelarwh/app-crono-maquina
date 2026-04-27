'use strict';

(function(){
  const EXTRA_KEY = 'operix_crono_maquina_extras_v4';
  const ANOMALY_KEY = 'operix_crono_maquina_anomalies_v1';
  const STUDIES_KEY = 'operix_crono_maquina_studies_v1';
  const SHIFT_HOURS = 8;

  const CAUSES = [
    'Normal',
    'Microparada',
    'Ajuste operador',
    'Falha de máquina',
    'Espera material',
    'Setup',
    'Interferência externa'
  ];

  function $(id){ return document.getElementById(id); }
  function parseNumber(value, fallback = 0){
    const parsed = parseFloat(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function round(value, digits = 2){
    const number = Number(value);
    if(!Number.isFinite(number)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(number * factor) / factor;
  }
  function readJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) || fallback) : fallback;
    }catch(error){
      return fallback;
    }
  }
  function writeJson(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(error){}
  }
  function slug(value){
    return String(value || 'crono-maquina')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'crono-maquina';
  }
  function timestamp(){
    const d = new Date();
    const p = value => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function getStoredExtras(){ return readJson(EXTRA_KEY, {}); }
  function getAnomalies(){ return readJson(ANOMALY_KEY, {}); }
  function getStudies(){ return readJson(STUDIES_KEY, []); }

  function getExtras(){
    const stored = getStoredExtras();
    return {
      lineName: $('lineName')?.value || stored.lineName || stored.line || '',
      shiftName: $('shiftName')?.value || stored.shiftName || stored.shift || '',
      productName: $('productName')?.value || stored.productName || stored.product || '',
      shiftHours: parseNumber($('shiftHours')?.value ?? stored.shiftHours, SHIFT_HOURS),
      tolerancePct: parseNumber($('tolerancePct')?.value ?? stored.tolerancePct ?? stored.tolerance, 10)
    };
  }

  function persistExtras(){ writeJson(EXTRA_KEY, getExtras()); }

  function injectFields(){
    const grid = document.querySelector('#configForm .config-grid');
    if(!grid || $('lineName')) return;

    const block = document.createElement('div');
    block.className = 'config-grid extra-config-grid full-width';
    block.style.gridColumn = 'span 2';
    block.innerHTML = `
      <div class="input-group">
        <label>Linha</label>
        <input id="lineName" type="text" placeholder="Ex: Linha 1">
      </div>
      <div class="input-group">
        <label>Turno</label>
        <input id="shiftName" type="text" placeholder="Ex: 1º turno">
      </div>
      <div class="input-group">
        <label>Produto</label>
        <input id="productName" type="text" placeholder="Ex: Produto / código">
      </div>
      <div class="input-group">
        <label>Horas/turno</label>
        <input id="shiftHours" type="number" value="8" min="0.1" step="0.1" inputmode="decimal">
      </div>
      <div class="input-group full-width">
        <label>Tolerância para tempo padrão (%)</label>
        <input id="tolerancePct" type="number" value="10" min="0" step="0.5" inputmode="decimal">
      </div>
    `;
    grid.appendChild(block);

    const stored = getStoredExtras();
    const mapping = {
      lineName: stored.lineName || stored.line,
      shiftName: stored.shiftName || stored.shift,
      productName: stored.productName || stored.product,
      shiftHours: stored.shiftHours,
      tolerancePct: stored.tolerancePct ?? stored.tolerance
    };
    Object.keys(mapping).forEach(id => {
      const el = $(id);
      if(el && mapping[id] !== undefined && mapping[id] !== null) el.value = mapping[id];
      if(el) el.addEventListener('input', persistExtras);
      if(el) el.addEventListener('change', persistExtras);
    });
  }

  function injectCauseOptions(){
    const select = $('lapCause');
    if(!select || select.dataset.operixReady === 'true') return;
    select.innerHTML = CAUSES.map(cause => `<option value="${cause}">${cause}</option>`).join('');
    select.dataset.operixReady = 'true';
  }

  function normalizeBaseData(base){
    const form = base.form || {};
    const stats = base.stats || {};
    const extras = getExtras();
    const anomalies = getAnomalies();

    const laps = Array.isArray(base.laps) ? base.laps.map((lap, index) => {
      const cause = anomalies[lap.id] || lap.cause || $('lapCause')?.value || 'Normal';
      return {
        index: Number(lap.index) || index + 1,
        id: lap.id || `lap_${index + 1}`,
        durationMs: Number(lap.durationMs) || 0,
        durationSec: Number(lap.durationSec) || (Number(lap.durationMs) || 0) / 1000,
        qty: Number.isFinite(Number(lap.qty)) ? Number(lap.qty) : null,
        rawQty: lap.rawQty ?? lap.qty ?? null,
        obs: lap.obs || '',
        cause,
        endedAt: lap.endedAt || null
      };
    }) : [];

    return {
      version: base.version || window.APP_VERSION || 'v2.4.11',
      running: !!base.running,
      totalElapsedMs: Number(base.totalElapsedMs) || 0,
      form: {
        equipName: form.equipName || '',
        analystName: form.analystName || '',
        analysisMode: form.analysisMode || 'cycle',
        analysisModeLabel: form.analysisModeLabel || (form.analysisMode === 'interval' ? 'Produção por intervalo' : 'Tempo por ciclo'),
        units: parseNumber(form.units, 1),
        defaultLapQty: parseNumber(form.defaultLapQty, 0),
        timeUnit: String(form.timeUnit || '3600'),
        timeUnitLabel: form.timeUnitLabel || (String(form.timeUnit || '3600') === '60' ? 'un/min' : 'un/h'),
        takt: parseNumber(form.takt, 0),
        target: parseNumber(form.target, 0),
        lapQtyMode: form.lapQtyMode || 'durante'
      },
      stats: {
        sec: Array.isArray(stats.sec) ? stats.sec.map(Number).filter(Number.isFinite) : laps.map(lap => lap.durationSec).filter(Number.isFinite),
        t: parseNumber(stats.t, laps.reduce((sum, lap) => sum + lap.durationSec, 0)),
        q: parseNumber(stats.q, laps.reduce((sum, lap) => sum + (Number(lap.qty) || 0), 0)),
        cap: parseNumber(stats.cap, 0),
        av: parseNumber(stats.av, 0),
        dev: parseNumber(stats.dev, 0),
        min: parseNumber(stats.min, 0),
        max: parseNumber(stats.max, 0),
        stab: parseNumber(stats.stab, 100),
        eff: stats.eff === null || stats.eff === undefined ? null : parseNumber(stats.eff, 0)
      },
      laps,
      extras
    };
  }

  function calculateImpact(data){
    const target = parseNumber(data.form.target, 0);
    const cap = parseNumber(data.stats.cap, 0);
    const gap = target > 0 ? cap - target : 0;
    const gapPct = target > 0 ? gap / target * 100 : null;
    const lossPerBase = Math.max(0, target - cap);
    const lossPerHour = data.form.timeUnit === '60' ? lossPerBase * 60 : lossPerBase;
    const lossPerShift = lossPerHour * data.extras.shiftHours;

    return {
      target,
      actual: cap,
      cap,
      gap,
      gapPct,
      lossPerBase,
      lossPerHour,
      lossPerShift,
      shiftHours: data.extras.shiftHours,
      unitLabel: data.form.timeUnitLabel
    };
  }

  function calculateStandardTime(data){
    const values = data.laps.map(lap => lap.durationSec).filter(value => Number.isFinite(value) && value > 0);
    const avg = parseNumber(data.stats.av, 0);
    const dev = parseNumber(data.stats.dev, 0);
    const lsc = avg + 3 * dev;
    const lic = Math.max(0, avg - 3 * dev);
    let cleanValues = values.filter(value => !dev || (value >= lic && value <= lsc));
    if(!cleanValues.length) cleanValues = values;
    const baseMean = cleanValues.length ? cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length : 0;
    const standardSec = baseMean * (1 + data.extras.tolerancePct / 100);

    return {
      baseMean,
      tolerancePct: data.extras.tolerancePct,
      standardSec,
      used: cleanValues.length,
      total: values.length,
      removed: Math.max(0, values.length - cleanValues.length),
      limits: { lsc, lic }
    };
  }

  function calculatePareto(data){
    const takt = data.form.takt || data.stats.av || 0;
    const grouped = {};
    data.laps.forEach(lap => {
      const cause = lap.cause || 'Normal';
      const lossSec = Math.max(0, lap.durationSec - takt);
      if(!grouped[cause]) grouped[cause] = { cause, lossSec: 0, count: 0 };
      grouped[cause].lossSec += lossSec;
      grouped[cause].count += 1;
    });
    const rows = Object.values(grouped).sort((a, b) => b.lossSec - a.lossSec);
    const totalLossSec = rows.reduce((sum, row) => sum + row.lossSec, 0);
    let cumulative = 0;
    return rows.map(row => {
      const percent = totalLossSec > 0 ? row.lossSec / totalLossSec * 100 : 0;
      cumulative += percent;
      return {
        cause: row.cause,
        lossSec: row.lossSec,
        count: row.count,
        percent,
        cumulativePct: cumulative
      };
    });
  }

  function classifyStability(stability){
    const value = parseNumber(stability, 0);
    if(value >= 85) return 'Alta estabilidade';
    if(value >= 70) return 'Estabilidade moderada';
    if(value >= 50) return 'Alta variabilidade';
    return 'Processo instável';
  }

  function buildConclusion(data, impact){
    const parts = [classifyStability(data.stats.stab) + '.'];
    if(data.form.takt > 0 && data.stats.av > 0){
      parts.push(data.stats.av > data.form.takt
        ? 'O ciclo médio está acima do Takt Time, indicando risco de não atendimento da demanda.'
        : 'O ciclo médio está abaixo do Takt Time, indicando capacidade de atendimento da demanda nas condições medidas.');
    }
    if(impact.target > 0){
      parts.push(impact.gap < 0
        ? 'Existe perda estimada de capacidade em relação à meta informada.'
        : 'A capacidade medida atende ou supera a meta informada.');
    }
    return parts.join(' ');
  }

  function getComparisonFromScreen(){
    const result = $('compareResult');
    const html = result ? result.innerHTML.trim() : '';
    const text = result ? result.textContent.trim() : '';
    const active = !!text && !/Nenhum comparativo|Selecione/i.test(text);
    return { active, html, text };
  }

  function enrichData(base){
    const data = normalizeBaseData(base);
    data.impact = calculateImpact(data);
    data.standardTime = calculateStandardTime(data);
    data.standard = data.standardTime;
    data.pareto = calculatePareto(data);
    data.comparison = getComparisonFromScreen();
    data.analysis = {
      stabilityClass: classifyStability(data.stats.stab),
      conclusion: buildConclusion(data, data.impact)
    };
    data.fileBaseName = `crono-maquina_${slug(data.form.equipName || data.extras.lineName || 'estudo')}_${timestamp()}`;
    return data;
  }

  function patchDataGetter(){
    const original = window.getCronoMachineData;
    if(typeof original !== 'function' || original.__operixDataLayer) return;
    const wrapped = function(){ return enrichData(original()); };
    wrapped.__operixDataLayer = true;
    window.getCronoMachineData = wrapped;
  }

  function init(){
    injectFields();
    injectCauseOptions();
    patchDataGetter();
    document.addEventListener('input', event => {
      if(event.target && ['lineName','shiftName','productName','shiftHours','tolerancePct'].includes(event.target.id)) persistExtras();
    });
    document.addEventListener('change', event => {
      if(event.target && ['lineName','shiftName','productName','shiftHours','tolerancePct'].includes(event.target.id)) persistExtras();
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
