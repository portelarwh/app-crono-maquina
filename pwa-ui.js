'use strict';

var APP_VERSION = 'v4.4.0';
window.APP_VERSION = APP_VERSION;

let refreshing = false;
let started = false;

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

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing) return;
    refreshing=true;
    location.reload();
  });

  window.addEventListener('load',()=>{
    if(started) return;
    started=true;

    toast('Buscando atualização...');

    navigator.serviceWorker.register('sw.js?v=4.4.0',{updateViaCache:'none'})
      .then(reg=>{
        if(reg.installing) watch(reg.installing);
        reg.addEventListener('updatefound',()=>watch(reg.installing));
        return reg.update();
      })
      .catch(()=>{});
  });
}

document.addEventListener('DOMContentLoaded', registerServiceWorker);
