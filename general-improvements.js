'use strict';
(function(){
const EXTRA_KEY = 'operix_crono_maquina_extras_v3';
const SHIFT_HOURS = 8;

const causes = [
  'Normal',
  'Microparada',
  'Ajuste operador',
  'Falha de máquina',
  'Espera material',
  'Setup',
  'Interferência externa'
];

function $(id){ return document.getElementById(id); }
function n(v, fb){ const x = parseFloat(String(v ?? '').replace(',','.')); return isFinite(x) ? x : (fb || 0); }
function read(key, fb){ try { return JSON.parse(localStorage.getItem(key)) || fb; } catch { return fb; } }
function write(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// ========================= EXTRAS =========================
function getExtras(){
  return {
    line:       $('lineName')?.value  || '',
    shift:      $('shiftName')?.value || '',
    product:    $('productName')?.value || '',
    shiftHours: n($('shiftHours')?.value,  SHIFT_HOURS),
    tolerance:  n($('tolerancePct')?.value, 10)
  };
}

function injectFields(){
  const grid = document.querySelector('.config-grid');
  if (!grid || $('lineName')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="input-group">
      <label>Linha</label>
      <input id="lineName">
    </div>
    <div class="input-group">
      <label>Turno</label>
      <input id="shiftName">
    </div>
    <div class="input-group">
      <label>Produto</label>
      <input id="productName">
    </div>
    <div class="input-group">
      <label>Horas/turno</label>
      <input id="shiftHours" type="number" value="8">
    </div>
    <div class="input-group">
      <label>Tolerância (%)</label>
      <input id="tolerancePct" type="number" value="10">
    </div>
  `;
  grid.appendChild(div);
}

function injectCauseOptions(){
  const sel = $('lapCause');
  if (!sel || sel.options.length > 1) return;
  sel.innerHTML = '';
  causes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

// ========================= TEMPO PADRÃO =========================
function calcStandard(data){
  const vals = data.laps.map(l => l.durationSec).filter(x => x > 0);
  if (!vals.length) return { base: 0, standard: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const tol  = getExtras().tolerance;
  return { base: mean, standard: mean * (1 + tol / 100) };
}

// ========================= PARETO =========================
function calcPareto(data){
  const map  = {};
  const takt = data.form.takt || data.stats.av;
  data.laps.forEach(l => {
    const cause = l.cause || 'Normal';
    const loss  = Math.max(0, l.durationSec - takt);
    map[cause]  = (map[cause] || 0) + loss;
  });
  return Object.entries(map)
    .map(([cause, loss]) => ({ cause, loss }))
    .sort((a, b) => b.loss - a.loss);
}

// ========================= INTEGRAR COM APP =========================
function patch(){
  const original = window.getCronoMachineData;
  if (!original || original._patched) return;
  window.getCronoMachineData = function(){
    const d      = original();
    d.standard   = calcStandard(d);
    d.pareto     = calcPareto(d);
    d.extras     = getExtras();
    return d;
  };
  window.getCronoMachineData._patched = true;
}

// ========================= INIT =========================
function init(){
  injectFields();
  injectCauseOptions();
  patch();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
