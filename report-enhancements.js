'use strict';

(function(){
  var LIMIT = 20;

  function $(id){ return document.getElementById(id); }
  function esc(x){ return String(x == null ? '' : x).replace(/[&<>\"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }
  function f(n,d){ return (isFinite(Number(n)) ? Number(n) : 0).toFixed(d == null ? 2 : d).replace('.',','); }
  function fs(n){ return f(n,2) + 's'; }
  function fallbackUnit(){ return $('timeUnit') && $('timeUnit').value === '60' ? 'un/min' : 'un/h'; }

  function data(){
    if (typeof window.getCronoMachineData === 'function') return window.getCronoMachineData();
    return {
      version: window.APP_VERSION || 'v4.9.1',
      form: {equipName:'—',analystName:'—',analysisModeLabel:'—',units:1,timeUnitLabel:fallbackUnit(),takt:0,target:0},
      stats: {}, laps: [], extras: {}, impact: {}, standardTime: {}, pareto: [], comparison: {}, analysis: {}
    };
  }

  function samples(){
    var d = data();
    return (d.laps || []).map(function(lap,i){
      return {
        idx: lap.index || i + 1,
        time: Number(lap.durationSec) || 0,
        qty: lap.qty,
        obs: lap.obs || '',
        cause: lap.cause || 'Normal',
        id: lap.id
      };
    }).filter(function(x){ return x.time > 0; });
  }

  function st(s){
    var d = data(), ds = d.stats || {}, vals = s.map(function(x){ return x.time; });
    var sum = vals.reduce(function(a,b){ return a + b; },0);
    var m = Number.isFinite(ds.av) ? ds.av : (vals.length ? sum / vals.length : 0);
    var sd = Number.isFinite(ds.dev) ? ds.dev : 0;
    return {
      n: s.length,
      mean: m,
      sd: sd,
      min: Number.isFinite(ds.min) ? ds.min : (vals.length ? Math.min.apply(null,vals) : 0),
      max: Number.isFinite(ds.max) ? ds.max : (vals.length ? Math.max.apply(null,vals) : 0),
      lsc: m + 3 * sd,
      lic: Math.max(0,m - 3 * sd),
      stab: Number.isFinite(ds.stab) ? ds.stab : (m ? Math.max(0,100 - sd / m * 100) : 100),
      takt: Number(d.form && d.form.takt) || 0,
      eff: ds.eff == null ? null : Number(ds.eff),
      cap: Number.isFinite(ds.cap) ? ds.cap : 0,
      q: Number.isFinite(ds.q) ? ds.q : 0
    };
  }

  function unit(){ return (data().form && data().form.timeUnitLabel) || fallbackUnit(); }
  function slug(s){ return String(s || 'crono-maquina').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'crono-maquina'; }
  function stamp(){ var d = new Date(), p = function(x){ return String(x).padStart(2,'0'); }; return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); }
  function fileName(ext){ var d = data(); return (d.fileBaseName || ('crono-maquina_' + slug(d.form && d.form.equipName) + '_' + stamp())) + ext; }
  function dl(blob,n){ var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = n; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },1000); }
  function toBlob(c){ return new Promise(function(ok,er){ c.toBlob(function(b){ b ? ok(b) : er(new Error('Falha ao gerar imagem.')); },'image/png',0.95); }); }
  function btn(id,lab){ var b = $(id); if(!b) return function(){}; var old = b.textContent; b.disabled = true; b.textContent = lab; return function(){ b.textContent = old; b.disabled = !(samples().length > 0); }; }

  function kpi(title,value,unitText,kind,note){
    return '<div class="kpi '+(kind||'')+'"><div class="kpiTitle">'+esc(title)+'</div><div class="kpiValue">'+esc(value)+'<span>'+esc(unitText||'')+'</span></div>'+(note?'<div class="kpiNote">'+esc(note)+'</div>':'')+'</div>';
  }

  function kpis(s){
    var x = st(s), eff = x.eff == null ? '--' : f(x.eff,1);
    var d = data(), oeeO = d.oee, hasOee = oeeO && Number.isFinite(Number(oeeO.oee));
    return '<section class="kpiGrid">'
      + kpi('Takt Time',x.takt ? f(x.takt,2) : '—',x.takt ? 's' : '')
      + kpi('Ciclo Médio',fs(x.mean),'')
      + kpi('Eficiência',eff,eff === '--' ? '' : '%',x.eff > 110 ? 'alert' : '')
      + kpi('Capacidade',f(x.cap,1),unit())
      + kpi('Estabilidade',f(x.stab,1),'%','','Estabilidade: percentual de ciclos dentro da faixa esperada de controle.')
      + (hasOee ? kpi('OEE',f(Number(oeeO.oee)*100,1),'%',Number(oeeO.oee) < 0.60 ? 'alert' : '') : '')
      + '</section>';
  }

  function aux(title,value){ return '<div class="aux"><div class="auxTitle">'+esc(title)+'</div><div class="auxValue">'+esc(value)+'</div></div>'; }
  function auxiliary(s){ var x = st(s); return '<section class="auxBlock"><div class="sectionLabel">Indicadores auxiliares</div><div class="auxGrid">'+aux('Amostras (N)',x.n)+aux('Último ciclo',s.length?fs(s[s.length-1].time):'0,00s')+aux('Mínimo',fs(x.min))+aux('Máximo',fs(x.max))+aux('Desvio padrão',fs(x.sd))+'</div></section>'; }

  function criticalSampleIndexes(){
    var s = samples(), x = st(s), threshold = x.takt > 0 ? x.takt : x.mean;
    return s.filter(function(a){ return a.time > threshold; }).sort(function(a,b){ return b.time - a.time; }).slice(0,3).map(function(a){ return a.idx; });
  }

  function executiveConclusion(){
    var d = data(), analysis = d.analysis || {}, base = String(analysis.conclusion || '').trim(), picks = criticalSampleIndexes();
    var action = 'Recomenda-se investigar os picos de ciclo acima do Takt Time e classificar as causas das perdas para direcionar ações de melhoria.';
    if(!base){
      var x = st(samples()), risk = x.takt > 0 && x.mean > x.takt;
      base = 'Conclusão: ' + (risk ? 'O ciclo médio está acima do Takt Time, indicando risco de não atendimento da demanda.' : 'O ciclo médio está dentro do Takt Time nas condições medidas.');
    } else if(!/^Conclus[aã]o:/i.test(base)) {
      base = 'Conclusão: ' + base;
    }
    if(picks.length) return base + ' Recomenda-se investigar os picos das amostras ' + picks.join(', ') + ' e classificar as causas das perdas para direcionar ações de melhoria.';
    return base + ' ' + action;
  }

  function impactBlock(){
    var d = data(), i = d.impact || {}, std = d.standardTime || {}, an = d.analysis || {}, ex = d.extras || {};
    var action = 'Ação recomendada: investigar os maiores picos de ciclo acima do Takt Time e classificar corretamente as causas dos eventos registrados. Priorizar as amostras com maior impacto sobre a perda de capacidade e sobre a instabilidade do processo.';
    return '<section class="panel diagnostic"><h2>Diagnóstico executivo</h2><div class="diagGrid">'
      + '<div><b>Meta</b><strong>'+esc(i.target?f(i.target,1):'—')+' '+esc(i.unitLabel||unit())+'</strong></div>'
      + '<div><b>Real</b><strong>'+esc((i.actual||i.cap)?f(i.actual||i.cap,1):'—')+' '+esc(i.unitLabel||unit())+'</strong></div>'
      + '<div><b>Gap</b><strong class="'+(i.gap<0?'bad':'good')+'">'+(i.target?f(i.gap,1)+' ('+f(i.gapPct,1)+'%)':'—')+'</strong></div>'
      + '<div><b>Perda/h</b><strong>'+esc(i.target?f(i.lossPerHour,0):'—')+' un/h</strong></div>'
      + '<div><b>Perda/turno</b><strong>'+esc(i.target?f(i.lossPerShift,0):'—')+' un</strong></div>'
      + '<div><b>Tempo padrão</b><strong>'+esc(std.standardSec?f(std.standardSec,2):'—')+'s</strong></div></div>'
      + '<p><b>Classificação:</b> '+esc(an.stabilityClass||'—')+'</p>'
      + '<p><b>Conclusão:</b> '+esc(executiveConclusion())+'</p>'
      + '<p><b>Ação recomendada:</b> '+esc(action.replace(/^Ação recomendada:\s*/,''))+'</p>'
      + '<p class="small"><b>Linha:</b> '+esc(ex.lineName||'—')+' | <b>Turno:</b> '+esc(ex.shiftName||'—')+' | <b>Produto:</b> '+esc(ex.productName||'—')+' | <b>Horas/turno:</b> '+esc(ex.shiftHours||'—')+'</p>'
      + '<p class="small"><b>Tempo padrão:</b> base '+esc(std.baseMean?f(std.baseMean,2):'—')+'s + '+esc(std.tolerancePct||0)+'% | amostras usadas '+esc(std.used||0)+'/'+esc(std.total||0)+' | removidas '+esc(std.removed||0)+'</p></section>';
  }

  function chart(s){
    var x = st(s), mx = Math.max.apply(null,s.map(function(a){ return a.time; }).concat([x.mean,x.lsc,x.takt,1]));
    var step = s.length > 20 ? 5 : (s.length > 10 ? 2 : 1);
    var grid = [0,25,50,75,100].map(function(v){ return '<div class="gridLine" style="bottom:'+v+'%"></div>'; }).join('');
    var bars = s.map(function(a){
      var h = Math.max(3,Math.min(100,a.time / mx * 100));
      var out = a.time > x.lsc || a.time < x.lic;
      var col = out ? '#6b35a8' : (x.takt && a.time > x.takt ? '#ef334a' : '#2da84e');
      var lab = (a.idx === 1 || a.idx === s.length || a.idx % step === 0) ? a.idx : '';
      return '<div class="barWrap"><div class="bar" style="height:'+h+'%;background:'+col+'"></div><div class="xLabel">'+lab+'</div></div>';
    }).join('');
    var refs = [{c:'avg',v:x.mean,l:'Média '+fs(x.mean)},{c:'lsc',v:x.lsc,l:'LSC '+fs(x.lsc)},{c:'lic',v:x.lic,l:'LIC '+fs(x.lic)}];
    if(x.takt) refs.push({c:'takt',v:x.takt,l:'Takt '+fs(x.takt)});
    refs = refs.map(function(r){ return {c:r.c,v:r.v,l:r.l,b:Math.min(100,Math.max(0,r.v/mx*100)),labelB:0}; }).sort(function(a,b){ return b.b - a.b; });
    refs.forEach(function(r,i){ if(i === 0){ r.labelB = r.b; return; } var prev = refs[i-1]; r.labelB = Math.min(r.b,prev.labelB - 8); });
    for(var i = refs.length - 2; i >= 0; i--){ if(refs[i].labelB < 6) refs[i].labelB = 6; }
    var lines = refs.map(function(r){ return '<div class="refLine '+r.c+'" style="bottom:'+r.b+'%"></div>'; }).join('');
    var tags = refs.map(function(r){ return '<div class="refTag '+r.c+'" style="bottom:'+r.labelB+'%">'+esc(r.l)+'</div>'; }).join('');
    return '<section class="panel chartPanel control"><h2>Curva de Controle</h2><div class="yLabel">Tempo (s)</div><div class="chartBox">'+grid+lines+'<div class="bars">'+bars+'</div><div class="refTags">'+tags+'</div></div><div class="legend"><span class="g"></span> dentro takt <span class="r"></span> acima takt <span class="p"></span> fora controle</div></section>';
  }

  function hist(s){
    if(!s.length) return '';
    var vals = s.map(function(x){ return x.time; }), mn = Math.min.apply(null,vals), mx = Math.max.apply(null,vals), bins = 5, w = Math.max(.01,(mx-mn)/bins), cnt = [0,0,0,0,0];
    vals.forEach(function(v){ var ix = Math.floor((v-mn)/w); if(ix >= bins) ix = bins - 1; if(ix < 0) ix = 0; cnt[ix]++; });
    var hi = Math.max.apply(null,cnt.concat([1]));
    var bars = cnt.map(function(c,i){ return '<div class="hWrap"><div class="hBar" style="height:'+Math.max(3,c/hi*100)+'%"><span>'+c+'</span></div><div class="hLabel">'+f(mn+w*i,1)+'-'+f(mn+w*(i+1),1)+'</div></div>'; }).join('');
    return '<section class="panel chartPanel hist"><h2>Histograma</h2><div class="chartBox"><div class="hBars">'+bars+'</div></div></section>';
  }

  function fmtMtMsRpt(ms){
    if(!isFinite(Number(ms)))return'--';
    var s=Math.max(0,Math.floor(Number(ms)/1000)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
    if(h>0)return h+'h '+(m<10?'0':'')+m+'m';
    if(m>0)return m+'m '+(ss<10?'0':'')+ss+'s';
    return ss+'s';
  }
  function gaugeOee(label, value) {
    var v = Number(value), valid = Number.isFinite(v);
    var pct = valid ? Math.max(0, Math.min(1, v)) : 0;
    var arcLen = Math.PI * 40; // 125.66
    var dash = (pct * arcLen).toFixed(2);
    var color = !valid ? '#aaa' : v >= 0.75 ? '#1e9a44' : v >= 0.60 ? '#e09a00' : '#df1f2d';
    var txt = valid ? Math.round(v * 100) + '%' : '—';
    var path = 'M 10,52 A 40,40 0 0 0 90,52';
    return '<div style="text-align:center">'
      + '<svg viewBox="0 0 100 66" style="width:100%;max-width:140px;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="'+path+'" fill="none" stroke="#e2e8f0" stroke-width="9" stroke-linecap="round"/>'
      + '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+dash+' '+arcLen.toFixed(2)+'"/>'
      + '<text x="50" y="50" text-anchor="middle" font-size="16" font-weight="900" fill="'+color+'" font-family="Arial,Helvetica,sans-serif">'+esc(txt)+'</text>'
      + '<text x="50" y="63" text-anchor="middle" font-size="8.5" fill="#58677d" font-family="Arial,Helvetica,sans-serif" font-weight="700">'+esc(label)+'</text>'
      + '</svg></div>';
  }

  function oeeBlock(){
    var o = data().oee;
    if(!o || !isFinite(Number(o.oee))) return '';
    var pct = function(v){ return isFinite(Number(v)) ? f(Number(v) * 100, 1) + '%' : '—'; };
    var oeeVal = Number(o.oee), cls = oeeVal >= 0.75 ? 'oeeGood' : oeeVal >= 0.60 ? 'oeeWarn' : 'oeeBad';
    return '<section class="panel diagnostic oeePanel '+cls+'">'
      + '<h2>OEE — Disponibilidade · Performance · Qualidade</h2>'
      + '<div class="oeeGaugeRow">'
      + gaugeOee('OEE', o.oee)
      + gaugeOee('Disponib.', o.availability)
      + gaugeOee('Performance', o.performance)
      + gaugeOee('Qualidade', o.quality)
      + '</div>'
      + '<div class="diagGrid" style="grid-template-columns:repeat(4,1fr)">'
      + '<div><b>MTBF</b><strong>'+esc(fmtMtMsRpt(o.mtbfMs))+'</strong></div>'
      + '<div><b>MTTR</b><strong>'+esc(fmtMtMsRpt(o.mttrMs))+'</strong></div>'
      + '<div><b>Falhas</b><strong>'+esc(String(o.failureCount||0))+'</strong></div>'
      + '<div><b>Qtd. real</b><strong>'+esc(f(o.actualQty,1))+'</strong></div>'
      + '</div>'
      + (o.diagnosis ? '<p class="small"><b>Diagnóstico:</b> '+esc(String(o.diagnosis).replace(/<[^>]+>/g,''))+'</p>' : '')
      + '</section>';
  }
  function paretoBlock(){
    var s = samples(), groups = {}, total = s.length;
    s.forEach(function(x){ var c = x.cause || 'Normal'; if(!groups[c]) groups[c] = {cause:c,count:0}; groups[c].count += 1; });
    var rows = Object.keys(groups).map(function(k){ return groups[k]; }).sort(function(a,b){ return b.count - a.count; });
    if(!rows.length) return '<section class="panel paretoPanel"><h2>Pareto de eventos</h2><p>Sem eventos classificados.</p></section>';
    var nonNormal = rows.filter(function(r){ return String(r.cause).toLowerCase() !== 'normal'; });
    var normals = rows.filter(function(r){ return String(r.cause).toLowerCase() === 'normal'; });
    var selected = nonNormal.concat(normals).slice(0,6), cum = 0;
    var note = !nonNormal.length ? '<p class="paretoNote">Sem causas de perda classificadas. As perdas atuais estão associadas à variação natural dos ciclos medidos.</p>' : '';
    return '<section class="panel paretoPanel"><h2>Pareto de eventos</h2>'+note+selected.map(function(x,i){
      var isNormal = String(x.cause).toLowerCase() === 'normal', pct = total ? x.count / total * 100 : 0;
      cum += pct;
      return '<div class="paretoRow '+(isNormal?'isNormal':'isAttention')+'"><div class="paretoLabel">'+(i+1)+'. '+esc(x.cause)+'<small>'+esc(x.count)+' evento(s)</small></div><div class="paretoTrack"><div class="paretoBar" style="width:'+Math.max(2,Math.min(100,pct))+'%"></div></div><div class="paretoVal">'+f(pct,1)+'% | '+f(cum,1)+'%</div></div>';
    }).join('')+'</section>';
  }

  function comparisonBlock(){ var c = data().comparison || {}; if(!c.active) return ''; return '<section class="panel comparisonPanel"><h2>Comparativo selecionado</h2><div>'+c.html+'</div></section>'; }

  /* ── Comparison PDF ──────────────────────────────────────────── */
  function stEx(s, dOverride){
    var ds = (dOverride && dOverride.stats) || {}, form = (dOverride && dOverride.form) || {};
    var vals = s.map(function(x){ return x.time; });
    var sum = vals.reduce(function(a,b){ return a+b; },0);
    var m = Number.isFinite(ds.av) ? ds.av : (vals.length ? sum/vals.length : 0);
    var sd = Number.isFinite(ds.dev) ? ds.dev : 0;
    return { n:s.length, mean:m, sd:sd,
      min: Number.isFinite(ds.min)?ds.min:(vals.length?Math.min.apply(null,vals):0),
      max: Number.isFinite(ds.max)?ds.max:(vals.length?Math.max.apply(null,vals):0),
      lsc: m+3*sd, lic: Math.max(0,m-3*sd),
      stab: Number.isFinite(ds.stab)?ds.stab:(m?Math.max(0,100-sd/m*100):100),
      takt: Number(form.takt||0)||0,
      eff: ds.eff==null?null:Number(ds.eff),
      cap: Number.isFinite(ds.cap)?ds.cap:0 };
  }
  function chartEx(s, x, titleText, sharedMx){
    if(!s.length) return '<section class="panel chartPanel control"><h2>'+esc(titleText||'')+'</h2><p style="padding:8px;font-size:9px">Sem amostras</p></section>';
    var mx = sharedMx || Math.max.apply(null, s.map(function(a){ return a.time; }).concat([x.mean,x.lsc,x.takt,1]));
    var step = s.length > 20 ? 5 : (s.length > 10 ? 2 : 1);
    var grid = [0,25,50,75,100].map(function(v){ return '<div class="gridLine" style="bottom:'+v+'%"></div>'; }).join('');
    var bars = s.map(function(a){
      var h = Math.max(3,Math.min(100,a.time/mx*100));
      var out = a.time > x.lsc || a.time < x.lic;
      var col = out ? '#6b35a8' : (x.takt&&a.time>x.takt ? '#ef334a' : '#2da84e');
      var lab = (a.idx===1||a.idx===s.length||a.idx%step===0) ? a.idx : '';
      return '<div class="barWrap"><div class="bar" style="height:'+h+'%;background:'+col+'"></div><div class="xLabel">'+lab+'</div></div>';
    }).join('');
    var refs = [{c:'avg',v:x.mean,l:'Média '+fs(x.mean)},{c:'lsc',v:x.lsc,l:'LSC '+fs(x.lsc)},{c:'lic',v:x.lic,l:'LIC '+fs(x.lic)}];
    if(x.takt) refs.push({c:'takt',v:x.takt,l:'Takt '+fs(x.takt)});
    refs = refs.map(function(r){ return {c:r.c,v:r.v,l:r.l,b:Math.min(100,Math.max(0,r.v/mx*100)),labelB:0}; }).sort(function(a,b){ return b.b-a.b; });
    refs.forEach(function(r,i){ if(i===0){r.labelB=r.b;return;} var prev=refs[i-1]; r.labelB=Math.min(r.b,prev.labelB-8); });
    for(var i=refs.length-2;i>=0;i--){ if(refs[i].labelB<6) refs[i].labelB=6; }
    var lines = refs.map(function(r){ return '<div class="refLine '+r.c+'" style="bottom:'+r.b+'%"></div>'; }).join('');
    var tags = refs.map(function(r){ return '<div class="refTag '+r.c+'" style="bottom:'+r.labelB+'%">'+esc(r.l)+'</div>'; }).join('');
    return '<section class="panel chartPanel control"><h2>'+esc(titleText||'Curva de Controle')+'</h2><div class="yLabel">Tempo (s)</div><div class="chartBox">'+grid+lines+'<div class="bars">'+bars+'</div><div class="refTags">'+tags+'</div></div><div class="legend"><span class="g"></span> dentro takt <span class="r"></span> acima takt <span class="p"></span> fora controle</div></section>';
  }
  var COMP_CSS = '.compKpi{padding:7px 9px;margin:6px 0}.compKpi h2,.compSum h2{font-size:13px;margin:0 0 6px}'
    + '.ckt{width:100%;border-collapse:collapse;font-size:9.5px}'
    + '.ckt th{background:#f3f6fa;font-weight:900;padding:5px 7px;border:1px solid #d5dce8;text-align:center}'
    + '.ckt td{border:1px solid #d5dce8;padding:5px 7px;text-align:center}'
    + '.ckt td:first-child{text-align:left}'
    + '.ckt .cg{color:#1e9a44;font-weight:900}.ckt .cb{color:#df1f2d;font-weight:900}'
    + '.chartDuo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}'
    + '.compSum{padding:8px 10px;margin:6px 0;background:#f7faff;border:1px solid #d5dce8;border-radius:7px}'
    + '.compSum p{font-size:10px;margin:4px 0;line-height:1.4}';
  function compKpiTable(dA, nameA, dB, nameB){
    var sA=dA.stats||{}, sB=dB.stats||{}, ul=(dA.form&&dA.form.timeUnitLabel)||'un/h', iA=dA.impact||{}, iB=dB.impact||{};
    function crow(label,dA,dB,unit,lower){
      var na=parseFloat(String(dA).replace(',','.'))||0, nb=parseFloat(String(dB).replace(',','.'))||0;
      var d=nb-na, pct=na?d/Math.abs(na)*100:0, better=lower?d<0:d>0;
      var cls=Math.abs(d)<0.001?'':(better?'cg':'cb'), sign=d>0?'+':'';
      var dt=Math.abs(d)<0.001?'=':(sign+f(d,2)+(unit||'')+' ('+sign+f(pct,1)+'%)');
      return '<tr><td><b>'+esc(label)+'</b></td><td>'+esc(String(dA))+'</td><td>'+esc(String(dB))+'</td><td class="'+cls+'">'+dt+'</td></tr>';
    }
    return '<section class="panel compKpi"><h2>Comparativo de desempenho</h2>'
      +'<table class="ckt"><thead><tr><th>Indicador</th><th>'+esc(nameA)+'</th><th>'+esc(nameB)+'</th><th>Variação</th></tr></thead><tbody>'
      +crow('Ciclo médio',f(sA.av,2)+'s',f(sB.av,2)+'s','s',true)
      +crow('Capacidade',f(sA.cap,0),f(sB.cap,0),' '+ul,false)
      +crow('Estabilidade',f(sA.stab,1)+'%',f(sB.stab,1)+'%','pp',false)
      +crow('N° ciclos',String(sA.n||0),String(sB.n||0),'',false)
      +(sA.eff!=null||sB.eff!=null ? crow('Eficiência',(sA.eff!=null?f(Number(sA.eff),1)+'%':'—'),(sB.eff!=null?f(Number(sB.eff),1)+'%':'—'),'%',false) : '')
      +(iA.target ? crow('Perda/turno',f(iA.lossPerShift,0),f(iB.lossPerShift,0),' un',true) : '')
      +'</tbody></table></section>';
  }
  function compExecSummary(dA, nameA, dB, nameB){
    var sA=dA.stats||{}, sB=dB.stats||{}, ul=(dA.form&&dA.form.timeUnitLabel)||'un/h';
    var avA=Number(sA.av)||0, avB=Number(sB.av)||0, capA=Number(sA.cap)||0, capB=Number(sB.cap)||0, stabA=Number(sA.stab)||0, stabB=Number(sB.stab)||0;
    var iA=dA.impact||{}, iB=dB.impact||{}, parts=[];
    if(avA>0&&avB>0){ var cg=avA-avB, cp=avA?Math.abs(cg)/avA*100:0; if(Math.abs(cg)>0.05) parts.push(cg>0?'O ciclo médio reduziu de '+fs(avA)+' para '+fs(avB)+', ganho de '+f(cg,2)+'s ('+f(cp,1)+'%).':'O ciclo médio aumentou de '+fs(avA)+' para '+fs(avB)+', variação de '+f(-cg,2)+'s ('+f(cp,1)+'%).'); }
    if(capA>0&&capB>0){ var kg=capB-capA, kp=capA?Math.abs(kg)/capA*100:0; if(Math.abs(kg)>0.5) parts.push(kg>0?'Capacidade aumentou +'+f(kg,0)+' '+ul+' (+'+f(kp,1)+'%).':'Capacidade reduziu '+f(kg,0)+' '+ul+' (-'+f(kp,1)+'%).'); }
    if(stabA>0){ var sg=stabB-stabA; if(Math.abs(sg)>1) parts.push(sg>0?'Estabilidade melhorou '+f(sg,1)+'pp ('+f(stabA,1)+'% → '+f(stabB,1)+'%).':'Estabilidade piorou '+f(-sg,1)+'pp ('+f(stabA,1)+'% → '+f(stabB,1)+'%).'); }
    if(iA.target){ var lg=(iA.lossPerShift||0)-(iB.lossPerShift||0); if(Math.abs(lg)>0.5) parts.push(lg>0?'Redução de perda/turno de '+f(lg,0)+' un.':'Aumento de perda/turno de '+f(-lg,0)+' un.'); }
    if(!parts.length) parts.push('Dados insuficientes para conclusão automática.');
    return '<section class="panel compSum"><h2>Resumo executivo</h2>'
      +'<p>'+parts.join(' ')+'</p>'
      +'<p class="small"><b>'+esc(nameA)+'</b>: '+f(sA.n||0,0)+' ciclos · média '+f(avA,2)+'s · cap. '+f(capA,0)+' '+ul+' · estab. '+f(stabA,1)+'%</p>'
      +'<p class="small"><b>'+esc(nameB)+'</b>: '+f(sB.n||0,0)+' ciclos · média '+f(avB,2)+'s · cap. '+f(capB,0)+' '+ul+' · estab. '+f(stabB,1)+'%</p>'
      +'</section>';
  }
  function comparisonReport(doc, compData){
    var nameA=compData.a.name||'Estudo A', nameB=compData.b.name||'Estudo B';
    var dA=compData.a.data, dB=compData.b.data;
    var lA=Array.isArray(dA.laps)?dA.laps:[], lB=Array.isArray(dB.laps)?dB.laps:[];
    var sA=lA.filter(function(l){ return Number(l.durationSec)>0; }).map(function(l,i){ return {idx:Number(l.index)||i+1,time:Number(l.durationSec)||0}; });
    var sB=lB.filter(function(l){ return Number(l.durationSec)>0; }).map(function(l,i){ return {idx:Number(l.index)||i+1,time:Number(l.durationSec)||0}; });
    var xA=stEx(sA,dA), xB=stEx(sB,dB);
    var sharedMx=Math.max.apply(null, sA.concat(sB).map(function(a){ return a.time; }).concat([xA.mean,xA.lsc,xB.mean,xB.lsc,xA.takt,xB.takt,1]));
    var fA=dA.form||{};
    var el=doc.createElement('div'); el.className='reportA4';
    el.innerHTML=css(COMP_CSS)
      +'<header class="top"><div class="title">Comparativo — '+esc(nameA)+' × '+esc(nameB)+'</div>'
      +'<div class="subtitle">Análise comparativa de desempenho produtivo</div>'
      +'<div class="metaLine"><b>Data:</b> '+new Date().toLocaleDateString('pt-BR')
      +(fA.analystName?' | <b>Analista:</b> '+esc(fA.analystName):'')
      +' | <b>Versão:</b> '+esc(window.APP_VERSION||'—')+'</div></header>'
      +'<div class="sectionLabel">Indicadores comparativos</div>'
      +compKpiTable(dA,nameA,dB,nameB)
      +'<div class="sectionLabel">Curvas de desempenho — mesma escala</div>'
      +'<div class="chartDuo">'+chartEx(sA,xA,nameA,sharedMx)+chartEx(sB,xB,nameB,sharedMx)+'</div>'
      +compExecSummary(dA,nameA,dB,nameB)
      +foot();
    return el;
  }
  async function exportComparisonPDF(compData){
    var r=btn('btnComparisonPDF','⏳...');
    try{
      if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');
      var sb=sandbox();
      var page=comparisonReport(sb.doc,compData);
      sb.doc.body.appendChild(page);
      await new Promise(function(ok){ setTimeout(ok,150); });
      var canvas=await cap(page);
      var PDF=window.jspdf.jsPDF, pdf=new PDF('p','mm','a4');
      addCanvasPage(pdf,canvas);
      sb.iframe.remove();
      pdf.save('comparativo_'+slug(compData.a.name||'A')+'_'+slug(compData.b.name||'B')+'_'+stamp()+'.pdf');
    }catch(e){ console.error(e); alert(e.message||'Erro ao gerar PDF comparativo.'); }
    finally{ r(); }
  }
  window.generateComparisonPDF = exportComparisonPDF;
  function table(s,title){ var x = st(s), rows = s.map(function(a){ var over = x.takt > 0 && a.time > x.takt; return '<tr><td><b>'+a.idx+'</b></td><td class="'+(over?'overTakt':'')+'">'+f(a.time,2)+'</td><td>'+(a.qty!=null?esc(f(Number(a.qty),2)):'—')+'</td><td>'+esc(a.cause||'Normal')+'</td><td>'+esc(a.obs||'—')+'</td></tr>'; }).join(''); return '<section class="panel samples"><h3>'+esc(title||'Amostras coletadas')+'</h3><table><thead><tr><th>#</th><th>Tempo (s)</th><th>Qtd</th><th>Causa</th><th>Observação</th></tr></thead><tbody>'+rows+'</tbody></table><p>Valores acima do Takt Time em vermelho.</p></section>'; }

  function css(extra){
    return '<style>*{box-sizing:border-box}body{margin:0;background:#fff}.reportA4{width:794px;min-height:1123px;background:#fff;color:#07183a;padding:10px 10px 10px;font-family:Arial,Helvetica,sans-serif;line-height:1.16}.top{border-bottom:2px solid #07183a;padding-bottom:6px;margin-bottom:6px}.title{font-size:23px;font-weight:900;letter-spacing:-.035em}.subtitle{font-size:11px;color:#58677d}.metaLine{margin-top:5px;font-size:9.5px;color:#33445c}.sectionLabel{font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#58677d;margin:5px 0 3px}.panel{border:1px solid #d5dce8;border-radius:8px;background:#fff;box-shadow:0 1px 5px rgba(7,24,58,.05)}.kpiGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:6px;margin:4px 0}.oeeGaugeRow{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0;align-items:start}.kpi{border:1px solid #cbd5e4;border-radius:8px;background:#f8fbff;min-height:56px;padding:5px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center}.kpiTitle{font-size:8px;font-weight:900;text-transform:uppercase;color:#58677d}.kpiValue{font-size:18px;font-weight:900}.kpiValue span{font-size:9px;margin-left:3px;color:#58677d}.kpiNote{margin-top:2px;font-size:7px;line-height:1.2;color:#4d5f7b;font-weight:700}.kpi.alert{border-color:#f26b00;background:#fff7ef}.kpi.alert .kpiValue{color:#f26b00}.diagnostic{padding:6px 8px;margin-bottom:6px}.diagnostic h2,.chartPanel h2,.paretoPanel h2,.comparisonPanel h2{font-size:13px;margin:0 0 5px}.diagGrid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.diagGrid div{background:#f7faff;border:1px solid #d5dce8;border-radius:6px;padding:4px 5px;text-align:center}.diagGrid b{display:block;font-size:7.5px;color:#58677d;text-transform:uppercase}.diagGrid strong{display:block;font-size:12px}.bad{color:#df1f2d}.good{color:#1e9a44}.small{font-size:9.5px;color:#33445c;margin:4px 0}.main{display:grid;grid-template-columns:61% 39%;gap:10px;align-items:start}.chartPanel{padding:6px 8px;margin-bottom:8px}.chartBox{height:195px;border-left:2px solid #07183a;border-bottom:2px solid #07183a;position:relative;margin-left:8px;padding-right:82px}.hist{margin-bottom:10px}.hist .chartBox{height:108px;padding-right:0;margin-bottom:8px}.gridLine{position:absolute;left:0;right:0;border-top:1px dashed #d6deea}.bars,.hBars{position:absolute;inset:0 88px 0 20px;display:flex;align-items:flex-end;gap:4px}.hist .hBars{inset:18px 8px 0 20px}.barWrap{flex:1;height:100%;display:flex;align-items:flex-end;position:relative}.bar{width:100%;border-radius:4px 4px 0 0;border:1px solid rgba(7,24,58,.2)}.xLabel{position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);font-size:7.5px;font-weight:800}.yLabel{font-size:8px;color:#58677d}.refLine{position:absolute;left:0;right:82px;z-index:2}.avg{border-top:2px dashed #8d99a8}.takt{border-top:2px dashed #f26b00}.lsc{border-top:1.5px dashed #df1f2d}.lic{border-top:1.5px dashed #6b35a8}.refTags{position:absolute;inset:0 4px 0 auto;width:74px;z-index:4;pointer-events:none}.refTag{position:absolute;right:0;transform:translateY(50%);background:#fff;padding:1px 4px;border:1px solid #d5dce8;border-radius:10px;font-size:6.8px;font-weight:900;white-space:nowrap}.refTag.avg{color:#44576f}.refTag.takt{color:#b25a00}.refTag.lsc{color:#b51c29}.refTag.lic{color:#5f2f92}.legend{font-size:8px;color:#58677d;margin-top:8px}.legend span{display:inline-block;width:9px;height:9px;border-radius:2px;margin-left:6px}.legend .g{background:#2da84e}.legend .r{background:#ef334a}.legend .p{background:#6b35a8}.hWrap{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative}.hBar{width:82%;background:#118bee;border-radius:4px 4px 0 0;position:relative}.hBar span{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:900}.hLabel{position:absolute;bottom:-19px;font-size:6.6px;font-weight:800;white-space:nowrap}.auxGrid{display:grid;grid-template-columns:1fr;gap:5px}.aux{border:1px solid #d5dce8;border-radius:7px;padding:6px 7px;display:flex;justify-content:space-between;background:#fbfcfe}.auxTitle{font-size:7.5px;font-weight:900;text-transform:uppercase;color:#58677d}.auxValue{font-size:12px;font-weight:900}.time{margin-top:6px;padding:7px;border:1px solid #d5dce8;border-radius:7px;text-align:center;font-weight:900}.time small{display:block;font-size:7.5px;color:#58677d}.time span{font-size:19px;color:#0879e9;font-family:monospace}.paretoPanel,.comparisonPanel{padding:7px 9px;margin:10px 0 6px}.paretoPanel p{font-size:8.8px;color:#33445c;margin:0 0 6px}.paretoRow{display:grid;grid-template-columns:120px 1fr 75px;gap:8px;align-items:center;font-size:9px;margin:4px 0}.paretoLabel{font-weight:900}.paretoLabel small{display:block;color:#58677d;font-weight:400}.paretoTrack{height:16px;background:#eef3f9;border:1px solid #d5dce8;border-radius:8px;overflow:hidden}.paretoBar{height:100%;min-width:2px;border-radius:8px}.paretoRow.isNormal .paretoBar{background:#2da84e}.paretoRow.isAttention .paretoBar{background:#ef334a}.paretoRow.isAttention .paretoLabel{color:#b6202d}.paretoVal{text-align:right;font-weight:900}.comparisonPanel{font-size:10px;line-height:1.35}.samples{margin-top:10px;padding:10px}.samples h3{font-size:12px;margin:0 0 7px}.samples table{width:100%;border-collapse:collapse;font-size:9.5px}.samples th{background:#f3f6fa;font-weight:900}.samples td,.samples th{border:1px solid #d5dce8;padding:4px;text-align:center}.samples .overTakt{color:#df1f2d;font-weight:900}.samples p{font-size:8.5px;color:#58677d;margin:6px 0 0}.foot{margin-top:10px;border-top:2px solid #07183a;padding-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:9px;color:#33445c}.foot b{display:block;font-size:10px}.sig{border-top:1px solid #07183a;text-align:center;padding-top:6px}.note{padding:10px;background:#f7faff;font-size:10px}'+(extra||'')+'</style>';
  }

  function header(sub){ var d = data(), form = d.form || {}, ex = d.extras || {}, equip = form.equipName || 'Sem identificação'; return '<header class="top"><div class="title">Cronoanálise — '+esc(equip)+'</div><div class="subtitle">'+esc(sub)+'</div><div class="metaLine"><b>Data:</b> '+new Date().toLocaleDateString('pt-BR')+' | <b>Analista:</b> '+esc(form.analystName||'—')+' | <b>Tipo:</b> '+esc(form.analysisModeLabel||'—')+' | <b>Peças/ciclo:</b> '+esc(form.units||'—')+' | <b>Linha:</b> '+esc(ex.lineName||'—')+' | <b>Produto:</b> '+esc(ex.productName||'—')+' | <b>Versão:</b> '+esc(window.APP_VERSION||d.version||'—')+'</div></header>'; }
  function foot(){ return '<footer class="foot"><div><b>Crono Máquina</b>Sistema de cronoanálise e tempo padrão</div><div><b>Operix</b>Base para decisão operacional</div><div class="sig">Assinatura do Analista</div></footer>'; }

  function report(doc,opt){
    opt = opt || {};
    var s = samples(), el = doc.createElement('div');
    var showSamples = opt.includeSamples === true;
    var showSamplesNote = opt.includeSamplesNote === true;
    var showFooter = opt.footer !== false;
    el.className = 'reportA4';
    el.innerHTML = css(opt.extraCss || '')
      + header('Documento de controle de estabilidade, tempo padrão e capacidade produtiva')
      + '<div class="sectionLabel">Visão executiva</div>'
      + kpis(s)
      + impactBlock()
      + oeeBlock()
      + '<main class="main"><section>'+chart(s)+hist(s)+'</section><aside>'+auxiliary(s)+'<div class="time"><small>Tempo total de medição</small><span>'+esc(($('totalTimer') && $('totalTimer').textContent) || '00:00')+'</span></div></aside></main>'
      + paretoBlock()
      + comparisonBlock()
      + (showSamples ? table(s,'Amostras coletadas') : (showSamplesNote ? '<section class="panel samples"><h3>Amostras coletadas</h3><div class="note">Este estudo possui '+s.length+' amostras. A tabela completa foi direcionada para a página 2 para preservar a leitura executiva da primeira página.</div></section>' : ''))
      + (showFooter ? foot() : '');
    return el;
  }

  function samplePage(doc,s){
    var el = doc.createElement('div');
    el.className = 'reportA4';
    el.innerHTML = css('.samples table{font-size:10px}.samples td,.samples th{padding:4px}.foot{margin-top:22px}')
      + header('Tabela completa de tempos coletados durante a cronoanálise')
      + '<div class="sectionLabel">Detalhamento técnico</div>'
      + kpis(s)
      + table(s,'Tabela completa de amostras')
      + foot();
    return el;
  }

  function sandbox(){ var i = document.createElement('iframe'); i.style.cssText = 'position:fixed;left:-1200px;top:0;width:900px;height:1300px;border:0;visibility:hidden'; document.body.appendChild(i); var d = i.contentDocument; d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); d.close(); return {iframe:i,doc:d}; }
  async function cap(el){ return await html2canvas(el,{scale:2,backgroundColor:'#fff',logging:false,useCORS:true}); }

  function addCanvasPage(pdf,canvas){
    var pageW = 210, pageH = 297;
    var imgW = pageW;
    var imgH = canvas.height * imgW / canvas.width;
    if(imgH <= pageH + 0.5){
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,imgW,imgH,undefined,'FAST');
      return;
    }
    var totalPages = Math.ceil(imgH / pageH);
    var dataUrl = canvas.toDataURL('image/png');
    for(var i = 0; i < totalPages; i++){
      if(i > 0) pdf.addPage('a4','p');
      pdf.addImage(dataUrl,'PNG',0,-i * pageH,imgW,imgH,undefined,'FAST');
    }
  }

  async function buildPNGBlob(){
    var sb = sandbox();
    try{
      var el = report(sb.doc,{includeSamples:true,footer:true});
      sb.doc.body.appendChild(el);
      await new Promise(function(ok){ setTimeout(ok,120); });
      var c = await cap(el);
      return await toBlob(c);
    }finally{
      if(sb && sb.iframe) sb.iframe.remove();
    }
  }

  async function exportPNG(){
    var r = btn('btnPNG','⏳ Gerando...');
    try{
      var blob = await buildPNGBlob();
      dl(blob,fileName('.png'));
    }catch(e){ console.error(e); alert(e.message || 'Erro ao gerar PNG.'); }
    finally{ r(); }
  }

  async function exportPDF(){
    var r = btn('btnPDF','⏳ Gerando...');
    try{
      if(!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF não carregado.');
      var s = samples(), sb = sandbox();
      var p1 = report(sb.doc,{includeSamples:false,includeSamplesNote:false,footer:false});
      sb.doc.body.appendChild(p1);
      await new Promise(function(ok){ setTimeout(ok,120); });
      var c1 = await cap(p1), PDF = window.jspdf.jsPDF, pdf = new PDF('p','mm','a4');
      addCanvasPage(pdf,c1);

      var p2 = samplePage(sb.doc,s);
      p1.remove();
      sb.doc.body.appendChild(p2);
      await new Promise(function(ok){ setTimeout(ok,120); });
      var c2 = await cap(p2);
      pdf.addPage('a4','p');
      addCanvasPage(pdf,c2);

      sb.iframe.remove();
      pdf.save(fileName('.pdf'));
    }catch(e){ console.error(e); alert(e.message || 'Erro ao gerar PDF.'); }
    finally{ r(); }
  }

  window.generatePNG = exportPNG;
  window.buildCronoMachinePNGBlob = buildPNGBlob;
  window.getCronoMachinePNGFileName = function(){ return fileName('.png'); };
  window.generateRealPDF = exportPDF;
})();
