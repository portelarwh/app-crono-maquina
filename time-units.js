'use strict';

/* ============================================================
   OperixTime — unidade de EXIBIÇÃO do tempo (cronômetro decimal)
   ------------------------------------------------------------
   Regra de integridade: TODOS os dados continuam armazenados em
   milissegundos/segundos (eventos, takt, estudos salvos, presets).
   Este módulo só converte na hora de mostrar/exportar, então trocar
   a unidade nunca altera cálculos de capacidade, OEE ou tempo padrão.

   Unidades:
     s    → segundos, 1/100 s (padrão)           12,35 s
     cmin → minutos centesimais, 1/100 min       20,58 cmin
     min  → minutos decimais, 1/1.000 min        0,206 min
     h    → horas decimais, 1/100.000 h          0,00343 h

   Carregado ANTES do app.js (o app usa OperixTime nos renders).
   ============================================================ */
(function(){
  var KEY = 'operix_crono_maquina_timefmt_v1';
  var UNITS = {
    s:    { factor: 1,       digits: 2, suffix: 's',    label: 'Segundos — 1/100 s' },
    cmin: { factor: 100/60,  digits: 2, suffix: 'cmin', label: 'Minutos centesimais — 1/100 min (cmin)' },
    min:  { factor: 1/60,    digits: 3, suffix: 'min',  label: 'Minutos decimais — 1/1.000 min' },
    h:    { factor: 1/3600,  digits: 5, suffix: 'h',    label: 'Horas decimais — 1/100.000 h' }
  };

  function read(){
    try{ var v = localStorage.getItem(KEY); return UNITS[v] ? v : 's'; }catch(_){ return 's'; }
  }
  var current = read();

  function getUnit(){ return current; }
  function setUnit(u){
    if(!UNITS[u] || u === current) return;
    current = u;
    try{ localStorage.setItem(KEY, u); }catch(_){}
    try{ document.dispatchEvent(new CustomEvent('operix:timeunit', { detail: { unit: u } })); }catch(_){}
  }
  function isDecimal(){ return current !== 's'; }
  function suffix(u){ return UNITS[u || current].suffix; }
  /** converte segundos → valor na unidade escolhida */
  function conv(sec, u){ var x = Number(sec); return Number.isFinite(x) ? x * UNITS[u || current].factor : 0; }
  /** casas decimais padrão da unidade, com ajuste relativo (ex.: -1 p/ rótulos de gráfico) */
  function digits(delta, u){ return Math.max(0, UNITS[u || current].digits + (delta || 0)); }

  /**
   * Formata segundos na unidade ativa.
   * opts.comma  → usa vírgula (relatórios/CSV); default ponto (UI legado)
   * opts.delta  → ajuste de casas decimais relativo ao padrão da unidade
   * opts.digits → casas fixas (sobrepõe delta)
   * opts.space  → espaço entre número e sufixo (default: só p/ cmin/min)
   * opts.bare   → sem sufixo
   */
  function fmt(sec, opts){
    opts = opts || {};
    var u = opts.unit || current;
    var d = Number.isFinite(opts.digits) ? opts.digits : digits(opts.delta, u);
    var txt = conv(sec, u).toFixed(d);
    if(opts.comma) txt = txt.replace('.', ',');
    if(opts.bare) return txt;
    var sp = opts.space != null ? opts.space : (u !== 's');
    // espaço não-quebrável: evita '1.20' e 'cmin' em linhas separadas
    return txt + (sp ? '\u00a0' : '') + UNITS[u].suffix;
  }

  /** Cronômetro ao vivo (lap): mm:ss.cc em segundos, valor decimal nas demais */
  function clockLap(ms){
    ms = Math.max(0, Math.floor(ms || 0));
    if(current === 's') return null; // o app usa o relógio tradicional
    return fmt(ms / 1000);
  }
  /** Tempo total (leitura contínua): mesma unidade e resolução do modo decimal */
  function clockTotal(ms){
    if(current === 's') return null;
    return fmt(Math.max(0, ms || 0) / 1000);
  }

  window.OperixTime = {
    UNITS: UNITS, getUnit: getUnit, setUnit: setUnit, isDecimal: isDecimal,
    suffix: suffix, conv: conv, digits: digits, fmt: fmt,
    clockLap: clockLap, clockTotal: clockTotal
  };
})();
