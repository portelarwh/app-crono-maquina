'use strict';

var APP_VERSION = 'v4.9.0';
window.APP_VERSION = APP_VERSION;

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

function watch(worker){
  worker.addEventListener('statechange',()=>{
    if(worker.state==='installed' && navigator.serviceWorker.controller){
      toast('Atualizando...');
      setTimeout(()=>worker.postMessage({type:'SKIP_WAITING'}),300);
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
  setSplashStatus('Verificando atualizações...', APP_VERSION);
  try{
    var ctrl = new AbortController();
    var to = setTimeout(()=>ctrl.abort(), 5000);
    var res = await fetch('version.json?t='+Date.now(), {cache:'no-store', signal: ctrl.signal});
    clearTimeout(to);
    if(!res.ok) return false;
    var data = await res.json();
    if(data && data.version && data.version !== APP_VERSION){
      setSplashStatus('Atualizando para ' + data.version, APP_VERSION + ' → ' + data.version);
      await clearAllCachesAndUnregister();
      await new Promise(r => setTimeout(r, 700));
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

  navigator.serviceWorker.register('sw.js?v=4.9.0',{updateViaCache:'none'})
    .then(reg=>{
      if(reg.installing) watch(reg.installing);
      reg.addEventListener('updatefound',()=>watch(reg.installing));
      return reg.update();
    })
    .catch(()=>{});
}

async function bootstrap(){
  if(started) return;
  started = true;
  setSplashVersion();
  var updating = await checkForUpdate();
  if(updating) return;
  setSplashStatus('Versão atualizada', APP_VERSION);
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', bootstrap);
