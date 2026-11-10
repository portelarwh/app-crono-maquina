'use strict';

/* ============================================================
   Calibração de velocidade de esteira (ajuste → m/min)
   ------------------------------------------------------------
   Problema de chão de fábrica: o acionamento mostra só o AJUSTE
   (W, Hz, % ou rpm), nunca a velocidade real. Aqui o analista:
     1. informa uma distância de referência (ex.: 1 m entre duas marcas);
     2. cronometra a marca passando, em 2+ ajustes diferentes;
     3. o app ajusta a reta  v[m/min] = a · ajuste + b  (mínimos quadrados, R²)
     4. converte nos dois sentidos e calcula o ajuste necessário pelo TAKT:
          v_takt = passo entre peças / takt × 60
   Cuidados de engenharia (exibidos na tela):
   • Watt é POTÊNCIA, não velocidade: a relação W→m/min muda com a carga.
     A curva só vale na mesma condição de carga em que foi medida.
   • Fora da faixa medida = extrapolação (alerta).
   • R² < 0,95 → relação não linear ou medição instável (alerta).
   Persistência: localStorage próprio; não interfere no estudo de ciclos.
   ============================================================ */
(function(){
  var KEY = 'operix_crono_maquina_conveyor_v1';
  var UNITS = ['W', 'Hz', '%', 'rpm'];

  function $(id){ return document.getElementById(id); }
  function num(v){ var x = parseFloat(String(v == null ? '' : v).replace(',', '.').trim()); return Number.isFinite(x) ? x : NaN; }
  function fc(v, d){ return Number.isFinite(Number(v)) ? Number(v).toFixed(d).replace('.', ',') : '—'; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function tfmt(sec){ var OT = window.OperixTime; return OT ? OT.fmt(sec, { comma: true }) : fc(sec, 2) + ' s'; }

  /* ---------- estado ---------- */
  function load(){
    try{
      var s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      return {
        distance: num(s.distance) > 0 ? num(s.distance) : 1,
        unit: UNITS.indexOf(s.unit) >= 0 ? s.unit : 'W',
        setpoint: Number.isFinite(num(s.setpoint)) ? num(s.setpoint) : NaN,
        pitch: num(s.pitch) > 0 ? num(s.pitch) : NaN,
        points: Array.isArray(s.points) ? s.points.filter(function(p){ return Number.isFinite(p.sp) && p.sec > 0 && p.dist > 0; }).slice(0, 60) : []
      };
    }catch(_){ return { distance: 1, unit: 'W', setpoint: NaN, pitch: NaN, points: [] }; }
  }
  var st = load();
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(_){} }

  /* ---------- cálculo puro ---------- */
  function speedOf(p){ return p.dist / p.sec * 60; } // m/min
  function regression(points){
    var pts = points.map(function(p){ return { x: p.sp, y: speedOf(p) }; });
    var xs = pts.map(function(p){ return p.x; });
    var distinct = xs.filter(function(x, i){ return xs.indexOf(x) === i; }).length;
    if(pts.length < 2 || distinct < 2) return null;
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function(p){ sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    var den = n * sxx - sx * sx; if(!den) return null;
    var a = (n * sxy - sx * sy) / den, b = (sy - a * sx) / n, my = sy / n, ssr = 0, sst = 0;
    pts.forEach(function(p){ var e = p.y - (a * p.x + b); ssr += e * e; sst += (p.y - my) * (p.y - my); });
    return { a: a, b: b, r2: sst > 0 ? 1 - ssr / sst : 1, n: n, distinct: distinct,
             xmin: Math.min.apply(null, xs), xmax: Math.max.apply(null, xs) };
  }
  function speedFor(reg, sp){ return reg ? reg.a * sp + reg.b : NaN; }
  function setpointFor(reg, v){ return reg && reg.a ? (v - reg.b) / reg.a : NaN; }
  // fora da faixa calibrada (com tolerância p/ arredondamento de ponto flutuante)
  function outside(reg, x){ if(!reg || !Number.isFinite(x)) return false; var eps = Math.max(1e-9, (reg.xmax - reg.xmin) * 1e-6); return x < reg.xmin - eps || x > reg.xmax + eps; }
  function taktSpeed(){ var t = num($('takt') && $('takt').value); return st.pitch > 0 && t > 0 ? st.pitch / t * 60 : NaN; }

  function summary(){
    var reg = regression(st.points), vt = taktSpeed();
    var cur = Number.isFinite(st.setpoint) ? speedFor(reg, st.setpoint) : NaN;
    return {
      unit: st.unit, distance: st.distance, pitch: st.pitch, setpoint: st.setpoint,
      points: st.points.map(function(p){ return { setpoint: p.sp, sec: p.sec, dist: p.dist, speed: speedOf(p), ts: p.ts }; }),
      regression: reg, currentSpeed: cur,
      currentPiecesPerMin: st.pitch > 0 && cur > 0 ? cur / st.pitch : NaN,
      taktSpeed: vt, taktSetpoint: setpointFor(reg, vt)
    };
  }

  /* ---------- cronômetro próprio (independente do estudo principal) ---------- */
  var run = { t0: 0, raf: 0 };
  function tickTimer(){
    var el = $('cvTimer'); if(!el || !run.t0) return;
    el.textContent = tfmt((performance.now() - run.t0) / 1000);
    run.raf = requestAnimationFrame(tickTimer);
  }
  function startStop(){
    var btn = $('cvStartStop');
    if(!run.t0){
      if(!Number.isFinite(st.setpoint)){ alert('Informe o ajuste atual do acionamento (' + st.unit + ') antes de medir.'); return; }
      run.t0 = performance.now(); btn.textContent = '⏹ Marca chegou ao fim'; btn.classList.add('cv-running');
      tickTimer();
    } else {
      var sec = (performance.now() - run.t0) / 1000;
      cancelAnimationFrame(run.raf); run.t0 = 0; btn.textContent = '▶ Marca passou no início'; btn.classList.remove('cv-running');
      addPoint(sec);
    }
  }
  function addPoint(sec){
    if(!(sec > 0.05)){ alert('Tempo muito curto — repita a medição.'); return; }
    st.points.push({ sp: st.setpoint, sec: sec, dist: st.distance, ts: Date.now() });
    st.points = st.points.slice(-60); save(); render();
  }
  function useAvgCycle(){
    var d = typeof window.getCronoMachineData === 'function' ? window.getCronoMachineData() : null;
    var av = d && d.stats ? Number(d.stats.av) : NaN;
    if(!(av > 0)){ alert('Sem ciclo médio no estudo atual. Meça a passagem da marca com o cronômetro principal (ou o sensor de câmera) e tente de novo.'); return; }
    if(!Number.isFinite(st.setpoint)){ alert('Informe o ajuste atual do acionamento (' + st.unit + ').'); return; }
    if(!confirm('Registrar o ciclo médio (' + tfmt(av) + ') como tempo para percorrer ' + fc(st.distance, 2) + ' m no ajuste ' + fc(st.setpoint, 1) + ' ' + st.unit + '?')) return;
    addPoint(av);
  }

  /* ---------- UI ---------- */
  function inject(){
    if($('conveyorCard')) return;
    var anchor = $('historyCard'); if(!anchor) return;
    var card = document.createElement('div');
    card.className = 'card'; card.id = 'conveyorCard';
    card.innerHTML =
      '<details class="cv-details"><summary class="chart-title cv-summary">📏 Velocidade de esteira — calibração <span id="cvSummaryTag" class="cv-tag"></span></summary>'
      + '<p class="cv-help">O acionamento mostra só o ajuste (W, Hz, %, rpm)? Marque duas referências na esteira, cronometre a passagem em 2 ou mais ajustes e o app monta a curva <b>ajuste → m/min</b>.</p>'
      + '<div class="cv-grid">'
      +   '<div class="input-group"><label>Distância entre marcas (m)</label><input id="cvDistance" type="number" min="0" step="any" inputmode="decimal"></div>'
      +   '<div class="input-group"><label>Unidade do ajuste</label><select id="cvUnit">' + UNITS.map(function(u){ return '<option value="'+u+'">'+u+'</option>'; }).join('') + '</select></div>'
      +   '<div class="input-group"><label>Ajuste atual (<span class="cvU"></span>)</label><input id="cvSetpoint" type="number" step="any" inputmode="decimal" placeholder="Ex: 60"></div>'
      +   '<div class="input-group"><label>Passo entre peças (m)</label><input id="cvPitch" type="number" min="0" step="any" inputmode="decimal" placeholder="Opcional"></div>'
      + '</div>'
      + '<div class="cv-timer-row"><div id="cvTimer" class="cv-timer">0,00 s</div>'
      +   '<button type="button" id="cvStartStop" class="cv-btn cv-btn-main">▶ Marca passou no início</button>'
      +   '<button type="button" id="cvUseAvg" class="cv-btn" title="Usa o ciclo médio do estudo atual (ex.: medido com o sensor de câmera)">⇣ Usar ciclo médio</button></div>'
      + '<div id="cvWarn" class="cv-warn"></div>'
      + '<div id="cvResult"></div>'
      + '<div id="cvPoints"></div>'
      + '<div class="cv-conv"><div class="input-group"><label>Converter: velocidade desejada (m/min)</label><input id="cvWantSpeed" type="number" min="0" step="any" inputmode="decimal"></div><div id="cvWantOut" class="cv-conv-out">—</div></div>'
      + '</details>';
    anchor.parentNode.insertBefore(card, anchor);
    $('cvDistance').value = st.distance;
    $('cvUnit').value = st.unit;
    if(Number.isFinite(st.setpoint)) $('cvSetpoint').value = st.setpoint;
    if(st.pitch > 0) $('cvPitch').value = st.pitch;
  }

  function chart(reg){
    var pts = st.points; if(!pts.length) return '';
    var W = 300, H = 120, pl = 30, pr = 8, pt = 8, pb = 18;
    var xs = pts.map(function(p){ return p.sp; }), ys = pts.map(speedOf);
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    if(xmax === xmin){ xmin -= 1; xmax += 1; }
    var pad = (xmax - xmin) * 0.1; xmin -= pad; xmax += pad;
    var ymax = Math.max.apply(null, ys) * 1.15 || 1;
    var X = function(x){ return pl + (x - xmin) / (xmax - xmin) * (W - pl - pr); };
    var Y = function(y){ return H - pb - Math.max(0, y) / ymax * (H - pt - pb); };
    var line = reg ? '<line x1="'+X(xmin).toFixed(1)+'" y1="'+Y(speedFor(reg, xmin)).toFixed(1)+'" x2="'+X(xmax).toFixed(1)+'" y2="'+Y(speedFor(reg, xmax)).toFixed(1)+'" class="cv-fit"/>' : '';
    var dots = pts.map(function(p){ return '<circle cx="'+X(p.sp).toFixed(1)+'" cy="'+Y(speedOf(p)).toFixed(1)+'" r="3.5" class="cv-dot"/>'; }).join('');
    return '<svg class="cv-chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Curva ajuste por velocidade">'
      + '<line x1="'+pl+'" y1="'+(H-pb)+'" x2="'+(W-pr)+'" y2="'+(H-pb)+'" class="cv-axis"/><line x1="'+pl+'" y1="'+pt+'" x2="'+pl+'" y2="'+(H-pb)+'" class="cv-axis"/>'
      + '<text x="'+(pl-3)+'" y="'+(pt+8)+'" text-anchor="end" class="cv-lbl">'+fc(ymax,1)+'</text><text x="'+(pl-3)+'" y="'+(H-pb)+'" text-anchor="end" class="cv-lbl">0</text>'
      + '<text x="'+pl+'" y="'+(H-4)+'" class="cv-lbl">'+fc(xmin,1)+'</text><text x="'+(W-pr)+'" y="'+(H-4)+'" text-anchor="end" class="cv-lbl">'+fc(xmax,1)+' '+esc(st.unit)+'</text>'
      + line + dots + '</svg>';
  }

  function card(label, value, cls){ return '<div class="'+(cls||'')+'"><span>'+label+'</span><strong>'+value+'</strong></div>'; }

  function render(){
    inject();
    var res = $('cvResult'); if(!res) return;
    document.querySelectorAll('#conveyorCard .cvU').forEach(function(e){ e.textContent = st.unit; });
    var s = summary(), reg = s.regression, u = esc(st.unit), warns = [];
    if(st.unit === 'W') warns.push('Watt é potência, não velocidade: a curva só vale com a mesma carga na esteira em que foi medida. Se o inversor mostrar Hz, prefira Hz.');
    if(reg && reg.distinct === 2) warns.push('Com só 2 ajustes o R² é sempre 1. Meça um 3º ajuste para confirmar se a relação é linear.');
    if(reg && reg.r2 < 0.95) warns.push('R² = ' + fc(reg.r2, 3) + ': relação pouco linear ou leituras instáveis. Repita as medições ou meça mais ajustes.');
    if(reg && reg.a <= 0) warns.push('Velocidade não aumenta com o ajuste — verifique as leituras.');
    var outOf = function(x){ return outside(reg, x); };
    if(outOf(st.setpoint)) warns.push('Ajuste atual fora da faixa medida (' + fc(reg.xmin,1) + '–' + fc(reg.xmax,1) + ' ' + st.unit + '): valor extrapolado.');
    if(outOf(s.taktSetpoint)) warns.push('Ajuste exigido pelo takt fica fora da faixa medida: confirme com uma medição nesse ajuste.');
    $('cvWarn').innerHTML = warns.map(function(w){ return '<div>⚠ ' + esc(w) + '</div>'; }).join('');

    var last = st.points.length ? speedOf(st.points[st.points.length - 1]) : NaN;
    var html = '<div class="cv-cards">'
      + card('Última leitura', Number.isFinite(last) ? fc(last, 2) + ' m/min' : '—')
      + card('Vel. no ajuste atual', Number.isFinite(s.currentSpeed) ? fc(s.currentSpeed, 2) + ' m/min' : (reg ? '—' : 'mín. 2 ajustes'))
      + card('Curva', reg ? 'v = ' + fc(reg.a, 4) + '·' + u + (reg.b >= 0 ? ' + ' : ' − ') + fc(Math.abs(reg.b), 3) : '—', reg && reg.r2 < 0.95 ? 'cv-bad' : '')
      + card('R²', reg ? fc(reg.r2, 3) : '—', reg ? (reg.r2 >= 0.95 ? 'cv-good' : 'cv-bad') : '')
      + (st.pitch > 0 ? card('Peças/min no ajuste', fc(s.currentPiecesPerMin, 2)) : '')
      + (Number.isFinite(s.taktSpeed) ? card('Vel. exigida pelo takt', fc(s.taktSpeed, 2) + ' m/min') : '')
      + (Number.isFinite(s.taktSpeed) ? card('Ajuste p/ o takt', Number.isFinite(s.taktSetpoint) ? fc(s.taktSetpoint, 1) + ' ' + u : '—', 'cv-key') : '')
      + '</div>' + chart(reg);
    if(res.innerHTML !== html) res.innerHTML = html;

    var tag = $('cvSummaryTag');
    if(tag) tag.textContent = reg ? (Number.isFinite(s.currentSpeed) ? fc(s.currentSpeed, 2) + ' m/min @ ' + fc(st.setpoint, 1) + ' ' + st.unit : 'R² ' + fc(reg.r2, 3)) : (st.points.length ? st.points.length + ' leitura(s)' : '');

    var pl = $('cvPoints');
    if(pl){
      var rows = st.points.map(function(p, i){
        return '<tr><td>'+(i+1)+'</td><td>'+fc(p.sp,1)+' '+u+'</td><td>'+esc(tfmt(p.sec))+'</td><td>'+fc(p.dist,2)+' m</td><td><b>'+fc(speedOf(p),2)+'</b></td><td><button type="button" class="cv-del" data-cv-del="'+i+'" aria-label="Remover leitura '+(i+1)+'">×</button></td></tr>';
      }).join('');
      var ph = st.points.length ? '<table class="cv-table"><thead><tr><th>#</th><th>Ajuste</th><th>Tempo</th><th>Dist.</th><th>m/min</th><th></th></tr></thead><tbody>'+rows+'</tbody></table><button type="button" id="cvClear" class="cv-btn cv-btn-ghost">Limpar leituras</button>' : '';
      if(pl.innerHTML !== ph) pl.innerHTML = ph;
    }
    renderConvert(reg);
  }
  function renderConvert(reg){
    var out = $('cvWantOut'); if(!out) return;
    var v = num($('cvWantSpeed') && $('cvWantSpeed').value);
    out.textContent = reg && v > 0 ? '→ ajuste ' + fc(setpointFor(reg, v), 1) + ' ' + st.unit + (outside(reg, setpointFor(reg, v)) ? ' (extrapolado)' : '') : (reg ? '—' : 'calibre com 2+ ajustes');
  }

  function injectStyles(){
    if($('operix-conveyor-style')) return;
    var s = document.createElement('style'); s.id = 'operix-conveyor-style';
    s.textContent = ''
      + '.cv-summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.cv-summary::-webkit-details-marker{display:none}'
      + '.cv-summary::before{content:"\\25B8";color:var(--text-muted)}.cv-details[open] .cv-summary::before{content:"\\25BE"}'
      + '.cv-tag{font-size:.7rem;color:var(--blue);font-weight:700;text-transform:none;letter-spacing:0}'
      + '.cv-help{font-size:.74rem;color:var(--text-muted);margin:4px 0 8px;line-height:1.35}'
      + '.cv-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(min-width:768px){.cv-grid{grid-template-columns:repeat(4,1fr)}}'
      + '.cv-timer-row{display:grid;grid-template-columns:1fr;gap:6px;margin:10px 0 6px}@media(min-width:560px){.cv-timer-row{grid-template-columns:1fr 1.3fr 1fr;align-items:center}}'
      + '.cv-timer{font-family:var(--font-mono);font-size:1.6rem;font-weight:800;text-align:center;color:var(--text-main);font-variant-numeric:tabular-nums}'
      + '.cv-btn{padding:12px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-main);font-weight:700;font-size:.82rem;cursor:pointer}'
      + '.cv-btn-main{background:var(--green);border-color:var(--green);color:#fff}.cv-btn-main.cv-running{background:var(--red);border-color:var(--red)}'
      + '.cv-btn-ghost{background:transparent;color:var(--text-muted);font-weight:500;padding:6px 8px;margin-top:6px;font-size:.72rem}'
      + '.cv-warn div{font-size:.7rem;color:var(--text-main);background:rgba(255,193,7,.12);border-left:3px solid var(--yellow);border-radius:6px;padding:6px 8px;margin:4px 0;line-height:1.35}'
      + '.cv-cards{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:8px 0}@media(min-width:560px){.cv-cards{grid-template-columns:repeat(4,1fr)}}'
      + '.cv-cards div{background:var(--card-bg);border:1px solid var(--border);border-radius:7px;padding:7px 6px;text-align:center;min-width:0}'
      + '.cv-cards span{display:block;font-size:.6rem;color:var(--text-muted);font-weight:700;text-transform:uppercase}'
      + '.cv-cards strong{display:block;font-size:.86rem;color:var(--text-main);margin-top:3px;overflow-wrap:anywhere}'
      + '.cv-cards .cv-good strong{color:var(--green)}.cv-cards .cv-bad strong{color:var(--red)}.cv-cards .cv-key{border-color:var(--blue)}.cv-cards .cv-key strong{color:var(--blue)}'
      + '.cv-chart{width:100%;max-width:480px;height:auto;display:block;margin:4px auto}'
      + '.cv-axis{stroke:var(--border);stroke-width:1}.cv-fit{stroke:var(--blue);stroke-width:2;stroke-dasharray:5 3}.cv-dot{fill:var(--yellow);stroke:var(--text-main);stroke-width:.6}'
      + '.cv-lbl{font-size:8px;fill:var(--text-muted)}'
      + '.cv-table{width:100%;border-collapse:collapse;font-size:.74rem;margin-top:6px;color:var(--text-main)}'
      + '.cv-table th,.cv-table td{padding:5px 4px;border-bottom:1px solid var(--border);text-align:center}.cv-table th{font-size:.62rem;color:var(--text-muted);text-transform:uppercase}'
      + '.cv-del{background:transparent;border:none;color:var(--red);font-size:1rem;cursor:pointer;padding:0 6px}'
      + '.cv-conv{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-top:10px;border-top:1px solid var(--border);padding-top:8px}'
      + '.cv-conv-out{font-weight:800;color:var(--blue);font-size:.9rem;padding-bottom:8px}';
    document.head.appendChild(s);
  }

  function bind(){
    document.addEventListener('click', function(e){
      var t = e.target; if(!t || !t.closest) return;
      if(t.id === 'cvStartStop') startStop();
      else if(t.id === 'cvUseAvg') useAvgCycle();
      else if(t.id === 'cvClear'){ if(confirm('Apagar todas as leituras de velocidade?')){ st.points = []; save(); render(); } }
      else if(t.dataset && t.dataset.cvDel != null){ st.points.splice(Number(t.dataset.cvDel), 1); save(); render(); }
    });
    document.addEventListener('input', function(e){
      var id = e.target && e.target.id;
      if(id === 'cvDistance'){ var d = num(e.target.value); if(d > 0){ st.distance = d; save(); } }
      else if(id === 'cvSetpoint'){ st.setpoint = num(e.target.value); save(); render(); }
      else if(id === 'cvPitch'){ var p = num(e.target.value); st.pitch = p > 0 ? p : NaN; save(); render(); }
      else if(id === 'cvWantSpeed') renderConvert(regression(st.points));
      else if(id === 'takt') render();
    });
    document.addEventListener('change', function(e){
      if(e.target && e.target.id === 'cvUnit'){
        if(st.points.length && !confirm('Trocar a unidade do ajuste apaga as leituras atuais (feitas em ' + st.unit + '). Continuar?')){ e.target.value = st.unit; return; }
        st.unit = e.target.value; st.points = []; save(); render();
      }
    });
    document.addEventListener('operix:timeunit', render);
  }

  /* ---------- camada de dados (CSV/relatório) ---------- */
  function patchDataGetter(){
    var original = window.getCronoMachineData;
    if(typeof original !== 'function' || original.__operixConveyor) return;
    var wrapped = function(){
      var d = original.apply(this, arguments);
      try{ if(d) d.conveyor = st.points.length ? summary() : null; }catch(e){ console.error('[Esteira]', e); }
      return d;
    };
    wrapped.__operixConveyor = true;
    if(original.__operixDataLayer) wrapped.__operixDataLayer = true;
    if(original.__operixEnergy) wrapped.__operixEnergy = true;
    window.getCronoMachineData = wrapped;
  }

  window.OperixConveyor = { regression: regression, speedFor: speedFor, setpointFor: setpointFor, summary: summary };

  function init(){ injectStyles(); inject(); bind(); patchDataGetter(); render(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
