'use strict';

/* ⚠ VERSÃO: fonte única em app-version.js (APP_VERSION / APP_RELEASE_DATE).
   A cada publicação rode ./bump-version.sh X.Y.Z — ele atualiza app-version.js,
   version.json, o CACHE_NAME do sw.js e as queries ?v= do index.html. */
var APP_VERSION = window.APP_VERSION || 'v5.2.6';

var LAST_CHECK_KEY = 'tc_ultima_verificacao';

let refreshing = false;
let started = false;

function setSplashVersion(){
  var v = document.getElementById('splashVersion');
  if(v) v.textContent = APP_VERSION;
}

function setSplashStatus(text, sub){
  var sp = document.getElementById('splashScreen');
  if(!sp) return;
  var status = sp.querySelector('.splash-status');
  if(!status){
    var bar = sp.querySelector('.splash-progress');
    status = document.createElement('div');
    status.className = 'splash-status';
    status.style.cssText = 'margin-top:14px;font-family:IBM Plex Sans,sans-serif;font-size:11px;color:rgba(255,255,255,.6);text-align:center;letter-spacing:.4px;min-height:28px;line-height:1.4';
    if(bar && bar.parentNode) bar.parentNode.insertBefore(status, bar.nextSibling);
    else sp.appendChild(status);
  }
  status.innerHTML = (text||'') + (sub ? '<br><span style="font-size:9.5px;opacity:.7">'+sub+'</span>' : '');
}

function toast(msg){
  var el=document.createElement('div');
  el.style.cssText='position:fixed;bottom:90px;left:12px;right:12px;padding:10px 12px;background:#0d1117;color:#fff;border-radius:12px;z-index:99999;font-size:12px;opacity:.9';
  el.innerText=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1200);
}

/* ---------- verificação de atualização (registro + timestamp) ---------- */
function marcarVerificacao(){
  try{ localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString()); }catch(e){}
}

function checarAtualizacao(){
  marcarVerificacao();
  if(window._swReg && typeof window._swReg.update === 'function'){
    window._swReg.update().catch(function(){});
  }
  renderLastCheck();
}

/* ---------- aplicação do novo SW ---------- */
// Um modal aberto significa que o usuário está no meio de algo (informando
// quantidade, configurando OEE...) — nesse caso não recarrega sozinho.
function anyBlockingModalOpen(){
  var ids = ['qtyModal','confirmModal','oeeModal','guideModal','infoModal'];
  for(var i=0;i<ids.length;i++){
    var el = document.getElementById(ids[i]);
    if(el && el.style.display === 'flex') return true;
  }
  if(document.getElementById('exportChoiceModal')) return true;
  return false;
}

function showUpdateBanner(worker){
  if(document.getElementById('pwaUpdateBanner')) return;
  var bar = document.createElement('div');
  bar.id = 'pwaUpdateBanner';
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:99998;background:#0d1117;color:#fff;border:1px solid #0879e9;border-radius:12px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;box-shadow:0 4px 18px rgba(0,0,0,.45)';
  var txt = document.createElement('span');
  txt.textContent = 'Nova versão disponível.';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Atualizar';
  btn.style.cssText = 'background:#0879e9;border:none;color:#fff;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12.5px';
  btn.addEventListener('click', function(){
    try{ worker.postMessage({type:'SKIP_WAITING'}); }catch(e){}
    bar.remove();
  });
  bar.appendChild(txt);
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

function applyOrOffer(worker){
  if(anyBlockingModalOpen()){ showUpdateBanner(worker); return; }
  toast('Atualizando...');
  setTimeout(function(){ worker.postMessage({type:'SKIP_WAITING'}); }, 300);
}

function watch(worker){
  worker.addEventListener('statechange', function(){
    if(worker.state === 'installed' && navigator.serviceWorker.controller){
      applyOrOffer(worker);
    }
  });
}

async function clearAllCachesAndUnregister(){
  try{
    if('caches' in window){
      var keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }catch(e){}
  try{
    if('serviceWorker' in navigator){
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  }catch(e){}
}

async function checkForUpdate(){
  // Guarda anti-loop: se acabamos de recarregar por atualização, não verifica de novo.
  if(sessionStorage.getItem('lt-just-updated')){
    sessionStorage.removeItem('lt-just-updated');
    return false;
  }
  setSplashStatus('Verificando atualizações...', APP_VERSION);
  marcarVerificacao();
  try{
    var ctrl = new AbortController();
    var to = setTimeout(()=>ctrl.abort(), 5000);
    var res = await fetch('version.json?t='+Date.now(), {cache:'no-store', signal: ctrl.signal});
    clearTimeout(to);
    if(!res.ok) return false;
    var data = await res.json();
    if(data && data.version && data.version !== APP_VERSION){
      setSplashStatus('Atualizando para ' + data.version, APP_VERSION + ' → ' + data.version);
      sessionStorage.setItem('lt-just-updated', '1');
      // Limpa apenas os caches (não desregistra o SW — evita reinstalação e segundo reload)
      if('caches' in window){
        try{ var keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }catch(e){}
      }
      await new Promise(r=>setTimeout(r,500));
      location.reload();
      return true;
    }
  }catch(e){}
  return false;
}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing) return;
    refreshing=true;
    location.reload();
  });

  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'})
    .then(reg=>{
      window._swReg = reg;
      // SW novo já esperando de uma visita anterior — aplica (ou oferece)
      if(reg.waiting && navigator.serviceWorker.controller) applyOrOffer(reg.waiting);
      if(reg.installing) watch(reg.installing);
      reg.addEventListener('updatefound',()=>{ if(reg.installing) watch(reg.installing); });
      marcarVerificacao();
      return reg.update();
    })
    .catch(()=>{});
}

/* ---------- pop-up "Sobre a versão" ---------- */
function fmtReleaseDate(iso){ // 'AAAA-MM-DD' → 'DD/MM/AAAA'
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
  return m ? (m[3]+'/'+m[2]+'/'+m[1]) : (iso || '—');
}

function renderLastCheck(){
  var el = document.getElementById('vmLastCheck');
  if(!el) return;
  var iso = null;
  try{ iso = localStorage.getItem(LAST_CHECK_KEY); }catch(e){}
  var d = iso ? new Date(iso) : null;
  el.textContent = (d && !isNaN(d)) ? d.toLocaleString('pt-BR') : 'nunca';
}

function setVmStatus(msg){
  var s = document.getElementById('vmStatus');
  if(s){ s.textContent = msg || ''; s.style.display = msg ? 'block' : 'none'; }
}

function openVersionModal(){
  var m = document.getElementById('versionModal');
  if(!m) return;
  var v = document.getElementById('vmVersion');
  if(v) v.textContent = window.APP_VERSION || APP_VERSION;
  var r = document.getElementById('vmReleased');
  if(r) r.textContent = fmtReleaseDate(window.APP_RELEASE_DATE);
  renderLastCheck();
  setVmStatus('');
  m.style.display = 'flex';
}

function closeVersionModal(){
  var m = document.getElementById('versionModal');
  if(m) m.style.display = 'none';
}

async function verificarAgoraClick(){
  marcarVerificacao();
  renderLastCheck();
  var reg = window._swReg;
  if(!reg){ setVmStatus('Service Worker indisponível neste navegador.'); return; }
  setVmStatus('Verificando…');
  try{ await reg.update(); }catch(e){}
  // pequena espera para o updatefound ter tempo de iniciar a instalação
  await new Promise(r=>setTimeout(r, 800));
  if(reg.waiting || reg.installing){
    setVmStatus('Nova versão encontrada! Aplicando...');
    if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    // se ainda estiver instalando, watch() aplica assim que terminar
  }else{
    setVmStatus('Você já está na versão mais recente disponível no servidor.');
  }
}

function wireVersionUI(){
  var open = function(e){ e.preventDefault(); openVersionModal(); };
  var av = document.getElementById('appVersion');
  if(av){
    av.style.cursor = 'pointer';
    av.title = 'Ver detalhes da versão';
    av.setAttribute('role','button');
    av.addEventListener('click', open);
  }
  var sv = document.getElementById('splashVersion');
  if(sv){ sv.style.cursor = 'pointer'; sv.addEventListener('click', open); }
  var modal = document.getElementById('versionModal');
  if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) closeVersionModal(); });
  var bClose = document.getElementById('btnVersionClose');
  if(bClose) bClose.addEventListener('click', closeVersionModal);
  var bCheck = document.getElementById('btnVersionCheck');
  if(bCheck) bCheck.addEventListener('click', verificarAgoraClick);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeVersionModal(); });
}

async function bootstrap(){
  if(started) return;
  started = true;
  setSplashVersion();
  wireVersionUI();
  var updating = await checkForUpdate();
  if(updating) return;
  setSplashStatus('Versão atualizada', APP_VERSION);
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', bootstrap);

// re-verifica quando a aba volta a ficar visível e a cada 30 minutos
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && started) checarAtualizacao();
});
setInterval(function(){ if(started) checarAtualizacao(); }, 30*60*1000);

// --- Screen Wake Lock: mantém tela acesa enquanto o app estiver aberto ---
(function () {
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', requestWakeLock);
  } else {
    requestWakeLock();
  }
})();
