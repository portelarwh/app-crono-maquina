'use strict';

(function(){
  const EXTRA_KEY = 'operix_crono_maquina_extras_v4';
  const ANOMALY_KEY = 'operix_crono_maquina_anomalies_v1';
  const STUDIES_KEY = 'operix_crono_maquina_studies_v1';
  const SHIFT_HOURS = 8;

  const CAUSES = [
    'Normal',
    'Microparada',
    'Ajuste',
    'Falha',
    'Manutenção',
    'Espera',
    'Ociosidade',
    'Externo',
    'Setup'
  ];

  function $(id){ return document.getElementById(id); }
  function parseNumber(value, fallback = 0){
    const parsed = parseFloat(String(value ?? '').replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function formatNumber(value, digits = 1){ return parseNumber(value, 0).toFixed(digits).replace('.', ','); }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]));
  }
  function readJson(key, fallback){
    try{ const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) || fallback) : fallback; }
    catch(error){ return fallback; }
  }
  function writeJson(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch(error){} }
  function slug(value){
    return String(value || 'crono-maquina').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'crono-maquina';
  }
  function timestamp(){
    const d = new Date(); const p = value => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function nowLabel(){ return new Date().toLocaleString('pt-BR'); }

  function getStoredExtras(){ return readJson(EXTRA_KEY, {}); }
  function getAnomalies(){ return readJson(ANOMALY_KEY, {}); }
  function setAnomalies(value){ writeJson(ANOMALY_KEY, value); }
  function getStudies(){ return readJson(STUDIES_KEY, []); }
  function setStudies(value){ writeJson(STUDIES_KEY, value); }

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

  function injectStyles(){
    if($('operix-improvements-style')) return;
    const style = document.createElement('style');
    style.id = 'operix-improvements-style';
    style.textContent = `
      .extra-config-grid{border-top:1px solid var(--border);padding-top:8px;margin-top:4px}
      .operix-mini-panel{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 8px;margin-top:8px;color:var(--text-main)}
      .operix-panel-title{font-size:.68rem;color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:.03em;margin-bottom:7px;text-align:center}
      .impact-grid,.advanced-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      .advanced-grid{grid-template-columns:1fr 1fr}
      .impact-grid div,.advanced-grid section{background:var(--card-bg);border:1px solid var(--border);border-radius:7px;padding:8px 6px;text-align:center}
      .impact-grid span,.mini-result span{display:block;font-size:.63rem;color:var(--text-muted);font-weight:700;text-transform:uppercase}
      .impact-grid strong,.mini-result strong{display:block;font-size:.92rem;color:var(--text-main);margin-top:3px}
      .impact-grid .bad{color:#ff5d6c}.impact-grid .good{color:#5bd47f}
      .btn-undo-lap{flex:1;padding:12px 2px;background:#6c757d;font-size:.82rem}
      .lap-cause-select-row{width:80px;font-size:.72rem;padding:4px;margin-left:4px;border-radius:6px;background:var(--card-bg);color:var(--text-main);border:1px solid var(--border)}
      .pareto-line{display:grid;grid-template-columns:92px 1fr 54px;gap:6px;align-items:center;font-size:.73rem;margin:4px 0}
      .pareto-track{height:9px;background:rgba(127,127,127,.18);border-radius:12px;overflow:hidden}.pareto-bar{height:100%;background:var(--blue)}
      .study-actions,.load-row,.compare-row{display:grid;grid-template-columns:1fr auto;gap:6px;margin:6px 0}
      .study-actions button,.load-row button,.compare-row button{background:var(--blue);color:#fff;padding:8px;border-radius:7px}
      .compare-result{font-size:.82rem;line-height:1.4;color:var(--text-main);background:var(--card-bg);border:1px solid var(--border);border-radius:7px;padding:8px;margin-top:6px}
      @media(max-width:560px){.advanced-grid,.load-row,.compare-row{grid-template-columns:1fr}.lap-cause-select-row{width:100%;margin:6px 0 0 0}}
    `;
    document.head.appendChild(style);
  }

  function injectFields(){
    const grid = document.querySelector('#configForm .config-grid');
    if(!grid || $('lineName')) return;
    const block = document.createElement('div');
    block.className = 'config-grid extra-config-grid full-width';
    block.style.gridColumn = 'span 2';
    block.innerHTML = `
      <div class="input-group"><label>Linha</label><input id="lineName" type="text" placeholder="Ex: Linha 1"></div>
      <div class="input-group"><label>Turno</label><input id="shiftName" type="text" placeholder="Ex: 1º turno"></div>
      <div class="input-group"><label>Produto</label><input id="productName" type="text" placeholder="Ex: Produto / código"></div>
      <div class="input-group"><label>Horas/turno</label><input id="shiftHours" type="number" value="8" min="0.1" step="0.1" inputmode="decimal"></div>
      <div class="input-group full-width"><label>Tolerância para tempo padrão (%)</label><input id="tolerancePct" type="number" value="10" min="0" step="0.5" inputmode="decimal"></div>
    `;
    grid.appendChild(block);
    const stored = getStoredExtras();
    const mapping = { lineName: stored.lineName || stored.line, shiftName: stored.shiftName || stored.shift, productName: stored.productName || stored.product, shiftHours: stored.shiftHours, tolerancePct: stored.tolerancePct ?? stored.tolerance };
    Object.keys(mapping).forEach(id => { const el = $(id); if(el && mapping[id] !== undefined && mapping[id] !== null) el.value = mapping[id]; if(el){ el.addEventListener('input', persistExtras); el.addEventListener('change', persistExtras); } });
  }

  function injectCauseButtons(){
    const grid = $('lapCauseGrid');
    if(!grid) return;
    const abnormal = CAUSES.filter(cause => cause !== 'Normal');
    const expected = abnormal.map(cause => escapeHtml(cause)).join('|');
    if(grid.dataset.operixReady === expected) return;
    grid.innerHTML = abnormal.map(cause =>
      `<button type="button" class="btn-cause" data-action="downtime" data-cause="${escapeHtml(cause)}" disabled>${escapeHtml(cause)}</button>`
    ).join('');
    grid.dataset.operixReady = expected;
  }

  function injectUndo(){
    if($('btnUndoLap')) return;
    const row = document.querySelector('.btn-row');
    if(!row) return;
    const btn = document.createElement('button');
    btn.id = 'btnUndoLap';
    btn.type = 'button';
    btn.className = 'btn-undo-lap';
    btn.textContent = '↩ Desfazer';
    row.appendChild(btn);
  }

  function injectPanels(){
    const results = document.querySelector('.results-grid');
    if(results && !$('impactPanel')){
      const panel = document.createElement('div');
      panel.id = 'impactPanel';
      panel.className = 'operix-mini-panel full-width';
      panel.innerHTML = `
        <div class="operix-panel-title">Gap de capacidade e perda estimada</div>
        <div class="impact-grid">
          <div><span>Gap</span><strong id="valCapacityGap">--</strong></div>
          <div><span>Perda/h</span><strong id="valLossHour">--</strong></div>
          <div><span>Perda/turno</span><strong id="valLossShift">--</strong></div>
        </div>`;
      results.appendChild(panel);
    }
    if(results && !$('oeePanel')){
      const panel = document.createElement('div');
      panel.id = 'oeePanel';
      panel.className = 'operix-mini-panel full-width';
      panel.innerHTML = `
        <div class="operix-panel-title">OEE — Disponibilidade · Performance · Qualidade</div>
        <div id="oeeSavedSummary" class="oee-saved-summary"><button class="btn-open-oee" type="button" data-action="openOee">📊 Calcular OEE</button></div>`;
      results.appendChild(panel);
    }

    const history = $('historyCard');
    if(history && !$('advancedPanel')){
      const panel = document.createElement('div');
      panel.id = 'advancedPanel';
      panel.className = 'operix-mini-panel';
      panel.innerHTML = `
        <div class="advanced-grid">
          <section><h3 class="operix-panel-title">Tempo padrão sugerido</h3><div id="stdTimeBox" class="mini-result">--</div></section>
          <section><h3 class="operix-panel-title">Pareto de perdas</h3><div id="paretoBox" class="mini-result">Sem dados</div></section>
        </div>
        <section class="studies-panel" style="margin-top:8px">
          <h3 class="operix-panel-title">Estudos salvos e comparação</h3>
          <div class="study-actions"><input id="studyName" placeholder="Nome do estudo: Ex. Antes da melhoria"><button id="btnSaveStudy" type="button">Salvar estudo</button></div>
          <div class="load-row"><select id="studyBase"></select><button id="btnLoadStudy" type="button">⬇ Carregar</button></div>
          <div class="compare-row"><select id="studyCompare"><option value="current">Medição atual</option></select><button id="btnCompareStudy" type="button">⇄ Comparar</button></div>
          <div id="compareResult" class="compare-result">Nenhum comparativo selecionado.</div>
        </section>`;
      history.appendChild(panel);
      renderStudyOptions();
    }
  }

  function normalizeBaseData(base){
    const form = base.form || {}; const stats = base.stats || {}; const extras = getExtras(); const anomalies = getAnomalies();
    const laps = Array.isArray(base.laps) ? base.laps.map((lap, index) => {
      const cause = anomalies[lap.id] || lap.cause || 'Normal';
      return { index: Number(lap.index) || index + 1, id: lap.id || `lap_${index + 1}`, durationMs: Number(lap.durationMs) || 0, durationSec: Number(lap.durationSec) || (Number(lap.durationMs) || 0) / 1000, qty: Number.isFinite(Number(lap.qty)) ? Number(lap.qty) : null, rawQty: lap.rawQty ?? lap.qty ?? null, obs: lap.obs || '', cause, endedAt: lap.endedAt || null };
    }) : [];
    return {
      version: base.version || window.APP_VERSION || 'v4.4.0', running: !!base.running, totalElapsedMs: Number(base.totalElapsedMs) || 0,
      form: { equipName: form.equipName || '', analystName: form.analystName || '', analysisMode: form.analysisMode || 'cycle', analysisModeLabel: form.analysisModeLabel || (form.analysisMode === 'interval' ? 'Produção por intervalo' : 'Tempo por ciclo'), units: parseNumber(form.units, 1), defaultLapQty: parseNumber(form.defaultLapQty, 0), timeUnit: String(form.timeUnit || '3600'), timeUnitLabel: form.timeUnitLabel || (String(form.timeUnit || '3600') === '60' ? 'un/min' : 'un/h'), takt: parseNumber(form.takt, 0), target: parseNumber(form.target, 0), lapQtyMode: form.lapQtyMode || 'durante' },
      stats: { sec: Array.isArray(stats.sec) ? stats.sec.map(Number).filter(Number.isFinite) : laps.map(lap => lap.durationSec).filter(Number.isFinite), t: parseNumber(stats.t, laps.reduce((sum, lap) => sum + lap.durationSec, 0)), q: parseNumber(stats.q, laps.reduce((sum, lap) => sum + (Number(lap.qty) || 0), 0)), cap: parseNumber(stats.cap, 0), av: parseNumber(stats.av, 0), dev: parseNumber(stats.dev, 0), min: parseNumber(stats.min, 0), max: parseNumber(stats.max, 0), stab: parseNumber(stats.stab, 100), eff: stats.eff === null || stats.eff === undefined ? null : parseNumber(stats.eff, 0) },
      laps, extras, oee: base.oee || null
    };
  }

  function calculateImpact(data){
    const target = parseNumber(data.form.target, 0), cap = parseNumber(data.stats.cap, 0), gap = target > 0 ? cap - target : 0, gapPct = target > 0 ? gap / target * 100 : null, lossPerBase = Math.max(0, target - cap), lossPerHour = data.form.timeUnit === '60' ? lossPerBase * 60 : lossPerBase, lossPerShift = lossPerHour * data.extras.shiftHours;
    return { target, actual: cap, cap, gap, gapPct, lossPerBase, lossPerHour, lossPerShift, shiftHours: data.extras.shiftHours, unitLabel: data.form.timeUnitLabel };
  }
  function calculateStandardTime(data){
    const values = data.laps.map(lap => lap.durationSec).filter(value => Number.isFinite(value) && value > 0), avg = parseNumber(data.stats.av, 0), dev = parseNumber(data.stats.dev, 0), lsc = avg + 3 * dev, lic = Math.max(0, avg - 3 * dev);
    let cleanValues = values.filter(value => !dev || (value >= lic && value <= lsc)); if(!cleanValues.length) cleanValues = values;
    const baseMean = cleanValues.length ? cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length : 0, standardSec = baseMean * (1 + data.extras.tolerancePct / 100);
    return { baseMean, tolerancePct: data.extras.tolerancePct, standardSec, used: cleanValues.length, total: values.length, removed: Math.max(0, values.length - cleanValues.length), limits: { lsc, lic } };
  }
  function calculatePareto(data){
    const takt = parseNumber(data.form.takt, 0), grouped = {};
    data.laps.forEach(lap => {
      const cause = lap.cause || 'Normal';
      const isCycle = (lap.type || 'cycle') === 'cycle';
      const refSec = isCycle ? (lap.productiveSec ?? lap.durationSec) : lap.durationSec;
      const lossSec = isCycle ? Math.max(0, (refSec || 0) - takt) : Math.max(0, refSec || 0);
      if(!grouped[cause]) grouped[cause] = { cause, lossSec: 0, count: 0 };
      grouped[cause].lossSec += lossSec;
      grouped[cause].count += 1;
    });
    const rows = Object.values(grouped).sort((a, b) => b.lossSec - a.lossSec), totalLossSec = rows.reduce((sum, row) => sum + row.lossSec, 0); let cumulative = 0;
    return rows.map(row => { const percent = totalLossSec > 0 ? row.lossSec / totalLossSec * 100 : 0; cumulative += percent; return { cause: row.cause, lossSec: row.lossSec, count: row.count, percent, cumulativePct: cumulative }; });
  }
  function classifyStability(stability){ const value = parseNumber(stability, 0); if(value >= 85) return 'Alta estabilidade'; if(value >= 70) return 'Estabilidade moderada'; if(value >= 50) return 'Alta variabilidade'; return 'Processo instável'; }
  function buildConclusion(data, impact){ const parts = [classifyStability(data.stats.stab) + '.']; if(data.form.takt > 0 && data.stats.av > 0){ parts.push(data.stats.av > data.form.takt ? 'O ciclo médio está acima do Takt Time, indicando risco de não atendimento da demanda.' : 'O ciclo médio está abaixo do Takt Time, indicando capacidade de atendimento da demanda nas condições medidas.'); } if(impact.target > 0){ parts.push(impact.gap < 0 ? 'Existe perda estimada de capacidade em relação à meta informada.' : 'A capacidade medida atende ou supera a meta informada.'); } return parts.join(' '); }
  function getComparisonFromScreen(){ const result = $('compareResult'), html = result ? result.innerHTML.trim() : '', text = result ? result.textContent.trim() : '', active = !!text && !/Nenhum comparativo|Selecione/i.test(text); return { active, html, text }; }
  function enrichData(base){ const data = normalizeBaseData(base); data.impact = calculateImpact(data); data.standardTime = calculateStandardTime(data); data.standard = data.standardTime; data.pareto = calculatePareto(data); data.comparison = getComparisonFromScreen(); data.analysis = { stabilityClass: classifyStability(data.stats.stab), conclusion: buildConclusion(data, data.impact) }; data.fileBaseName = `crono-maquina_${slug(data.form.equipName || data.extras.lineName || 'estudo')}_${timestamp()}`; return data; }
  function patchDataGetter(){ const original = window.getCronoMachineData; if(typeof original !== 'function' || original.__operixDataLayer) return; const wrapped = function(){ return enrichData(original()); }; wrapped.__operixDataLayer = true; window.getCronoMachineData = wrapped; }
  function getData(){ patchDataGetter(); return typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : null; }

  function renderImpact(data){ const i = data?.impact || {}; if($('valCapacityGap')) $('valCapacityGap').textContent = i.target ? `${formatNumber(i.gap,1)} ${i.unitLabel} (${formatNumber(i.gapPct,1)}%)` : '--'; if($('valLossHour')) $('valLossHour').textContent = i.target ? `${formatNumber(i.lossPerHour,0)} un/h` : '--'; if($('valLossShift')) $('valLossShift').textContent = i.target ? `${formatNumber(i.lossPerShift,0)} un/turno` : '--'; }
  function renderStandard(data){ const box = $('stdTimeBox'); if(!box) return; const s = data?.standardTime || {}; box.innerHTML = s.total ? `<strong>${formatNumber(s.standardSec,2)}s</strong><span>Base ${formatNumber(s.baseMean,2)}s + ${formatNumber(s.tolerancePct,1)}% | usadas ${s.used}/${s.total}</span>` : '<span>Sem amostras</span>'; }
  function renderPareto(data){ const box = $('paretoBox'); if(!box) return; const rows = (data?.pareto || []).slice(0,5); if(!rows.length){ box.innerHTML = 'Sem dados'; return; } box.innerHTML = rows.map((row, index) => `<div class="pareto-line"><b>${index+1}. ${escapeHtml(row.cause)}</b><div class="pareto-track"><div class="pareto-bar" style="width:${Math.max(2, row.percent)}%"></div></div><span>${formatNumber(row.lossSec,1)}s</span></div>`).join(''); }
  function renderStudyOptions(){ const base = $('studyBase'), compare = $('studyCompare'); if(!base || !compare) return; if(document.activeElement === base || document.activeElement === compare) return; const baseVal = base.value; const compareVal = compare.value; const list = getStudies(); const options = list.map(study => `<option value="${study.id}">${escapeHtml(study.savedAt)} — ${escapeHtml(study.name)}</option>`).join(''); base.innerHTML = options || '<option value="">Nenhum estudo salvo</option>'; compare.innerHTML = '<option value="current">Medição atual</option>' + options; if(baseVal) base.value = baseVal; if(compareVal) compare.value = compareVal; }
  function injectLapCauseSelectors(data){ const rows = Array.from(document.querySelectorAll('#historyListScreen .history-row')); const anomalies = getAnomalies(); rows.forEach((row, index) => { const lap = data?.laps?.[index]; if(!lap || row.querySelector('.lap-cause-select-row')) return; const select = document.createElement('select'); select.className = 'lap-cause-select-row'; select.dataset.lapId = lap.id; select.innerHTML = CAUSES.map(cause => `<option value="${escapeHtml(cause)}">${escapeHtml(cause)}</option>`).join(''); select.value = anomalies[lap.id] || lap.cause || 'Normal'; select.addEventListener('change', () => { const all = getAnomalies(); all[lap.id] = select.value; setAnomalies(all); updateAll(); }); row.appendChild(select); }); }
  function undoLastLap(){ const buttons = Array.from(document.querySelectorAll('#historyListScreen [data-action="deleteEvent"]')); const last = buttons[buttons.length - 1]; if(last) last.click(); }
  function saveStudy(){ const data = getData(); if(!data || !data.laps.length){ alert('Registre ao menos uma amostra antes de salvar o estudo.'); return; } const name = $('studyName')?.value || `${data.form.equipName || 'Estudo'} - ${nowLabel()}`; const study = { id: `study_${Date.now()}`, name, savedAt: nowLabel(), data }; const list = getStudies(); list.unshift(study); setStudies(list.slice(0,30)); if($('studyName')) $('studyName').value = ''; renderStudyOptions(); alert('Estudo salvo com sucesso.'); }
  function findStudy(id){ return getStudies().find(study => study.id === id); }
  function loadStudy(){
    const id = $('studyBase')?.value;
    const study = findStudy(id);
    if(!study){ alert('Selecione um estudo salvo para carregar.'); return; }
    if(!confirm(`Carregar o estudo "${study.name}"?\nA medição atual será substituída.`)) return;
    if(typeof window.loadStudyIntoState === 'function'){
      window.loadStudyIntoState(study);
      setTimeout(updateAll, 200);
    }
  }
  function compareStudies(){ const output = $('compareResult'); if(!output) return; const baseStudy = findStudy($('studyBase')?.value); if(!baseStudy){ output.textContent = 'Selecione um estudo base.'; return; } const selected = $('studyCompare')?.value; const comp = selected === 'current' ? { name: 'Medição atual', data: getData() } : findStudy(selected); if(!comp || !comp.data){ output.textContent = 'Selecione o estudo comparativo.'; return; } const a = baseStudy.data, b = comp.data, capGain = (b.stats?.cap || 0) - (a.stats?.cap || 0), cycleGain = (a.stats?.av || 0) - (b.stats?.av || 0), lossRed = (a.impact?.lossPerShift || 0) - (b.impact?.lossPerShift || 0); output.innerHTML = `<b>Comparativo:</b> ${escapeHtml(baseStudy.name)} × ${escapeHtml(comp.name || 'Medição atual')}<br>Ciclo médio: ${formatNumber(a.stats?.av,2)}s → ${formatNumber(b.stats?.av,2)}s | ganho: ${formatNumber(cycleGain,2)}s<br>Capacidade: ${formatNumber(a.stats?.cap,1)} → ${formatNumber(b.stats?.cap,1)} ${escapeHtml(b.form?.timeUnitLabel || 'un/h')} | ganho: ${formatNumber(capGain,1)}<br>Estabilidade: ${formatNumber(a.stats?.stab,1)}% → ${formatNumber(b.stats?.stab,1)}%<br>Redução de perda/turno: ${formatNumber(lossRed,0)} un/turno`; }
  function lockConfig(running){ ['analysisMode','units','defaultLapQty','timeUnit','takt','target','lapQtyMode','lineName','shiftName','productName','shiftHours','tolerancePct'].forEach(id => { const el = $(id); if(el) el.disabled = !!running; }); }
  function updateAll(){ patchDataGetter(); injectFields(); injectCauseButtons(); injectUndo(); injectPanels(); const data = getData(); renderImpact(data); renderStandard(data); renderPareto(data); injectLapCauseSelectors(data); renderStudyOptions(); lockConfig(!!data?.running); const undo = $('btnUndoLap'); if(undo) undo.disabled = !(data?.laps?.length); }

  function bindEvents(){
    document.addEventListener('click', event => { if(event.target?.id === 'btnUndoLap') undoLastLap(); if(event.target?.id === 'btnSaveStudy') saveStudy(); if(event.target?.id === 'btnLoadStudy') loadStudy(); if(event.target?.id === 'btnCompareStudy') compareStudies(); if(event.target?.id === 'studyBase' || event.target?.id === 'studyCompare') return; setTimeout(updateAll, 80); });
    document.addEventListener('input', event => { if(event.target && ['lineName','shiftName','productName','shiftHours','tolerancePct'].includes(event.target.id)) persistExtras(); setTimeout(updateAll, 80); });
    document.addEventListener('change', event => { if(event.target && ['lineName','shiftName','productName','shiftHours','tolerancePct'].includes(event.target.id)) persistExtras(); if(event.target?.id === 'studyBase' || event.target?.id === 'studyCompare') return; setTimeout(updateAll, 80); });
    setInterval(updateAll, 800);
  }

  function init(){ injectStyles(); injectFields(); injectCauseButtons(); injectUndo(); injectPanels(); patchDataGetter(); bindEvents(); updateAll(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
