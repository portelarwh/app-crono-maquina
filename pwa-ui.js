'use strict';

window.APP_VERSION = 'v3.0.3';

const CRONO_MAQUINA_VERSION = window.APP_VERSION || 'v3.0.3';
const CRONO_SPLASH_KEY = 'crono_maquina_splash_seen_'+CRONO_MAQUINA_VERSION.replace(/[^0-9]/g,'');

let cronoRefreshing = false;
let cronoWaitingWorker = null;

function injectSplashStyles(){
  if(document.getElementById('crono-splash-styles')) return;
  const style=document.createElement('style');
  style.id='crono-splash-styles';
  style.textContent=`
    #splashScreen.crono-splash-custom{
      position:fixed!important;
      inset:0!important;
      z-index:9999!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      background:#0d1117!important;
      color:#ffffff!important;
      opacity:1!important;
      transition:opacity .25s ease!important;
    }
    #splashScreen.crono-splash-hidden{opacity:0!important;pointer-events:none!important;}
    #splashScreen.crono-splash-none{display:none!important;}
  `;
  document.head.appendChild(style);
}

function injectUpdateStyles(){
  if(document.getElementById('crono-update-styles')) return;
  const style=document.createElement('style');
  style.id='crono-update-styles';
  style.textContent=`
    .crono-update-toast{
      position:fixed;
      left:12px;
      right:12px;
      bottom:calc(84px + env(safe-area-inset-bottom, 0px));
      z-index:10000;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:12px 14px;
      border:1px solid rgba(17,139,238,.45);
      border-radius:14px;
      background:rgba(13,17,23,.96);
      color:#ffffff;
      box-shadow:0 12px 32px rgba(0,0,0,.35);
      font-family:inherit;
    }
    .crono-update-toast strong{display:block;font-size:.92rem;margin-bottom:2px;}
    .crono-update-toast span{display:block;font-size:.78rem;color:#aeb8c6;line-height:1.25;}
    .crono-update-toast button{
      border:0;
      border-radius:10px;
      padding:9px 12px;
      background:#118bee;
      color:#fff;
      font-weight:800;
      white-space:nowrap;
      cursor:pointer;
    }
  `;
  document.head.appendChild(style);
}

function setupSplash(){
  const splash=document.getElementById('splashScreen');
  const splashVersion=document.getElementById('splashVersion');
  if(splashVersion) splashVersion.textContent=CRONO_MAQUINA_VERSION;
  if(!splash) return;

  let alreadySeen=false;
  try{alreadySeen=sessionStorage.getItem(CRONO_SPLASH_KEY)==='true';}catch(e){}

  if(alreadySeen){
    splash.classList.add('crono-splash-none');
    splash.style.display='none';
    return;
  }

  injectSplashStyles();
  splash.className='crono-splash-custom';

  try{sessionStorage.setItem(CRONO_SPLASH_KEY,'true');}catch(e){}

  window.setTimeout(()=>{
    splash.classList.add('crono-splash-hidden');
    window.setTimeout(()=>{
      splash.classList.add('crono-splash-none');
      splash.style.display='none';
    },260);
  },2000);
}

function showUpdateToast(worker){
  cronoWaitingWorker = worker || cronoWaitingWorker;
  if(document.getElementById('cronoUpdateToast')) return;

  injectUpdateStyles();

  const toast=document.createElement('div');
  toast.id='cronoUpdateToast';
  toast.className='crono-update-toast';
  toast.innerHTML=`
    <div>
      <strong>Nova versão disponível</strong>
      <span>Toque em atualizar para carregar a versão mais recente do app.</span>
    </div>
    <button type="button" id="cronoUpdateNow">Atualizar</button>
  `;

  document.body.appendChild(toast);

  const button=document.getElementById('cronoUpdateNow');
  if(button){
    button.addEventListener('click', function(){
      button.disabled=true;
      button.textContent='Atualizando...';
      if(cronoWaitingWorker){
        cronoWaitingWorker.postMessage({type:'SKIP_WAITING'});
      }else{
        window.location.reload();
      }
    });
  }
}

function watchInstallingWorker(worker){
  if(!worker) return;
  worker.addEventListener('statechange', function(){
    if(worker.state === 'installed' && navigator.serviceWorker.controller){
      showUpdateToast(worker);
    }
  });
}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(cronoRefreshing) return;
    cronoRefreshing=true;
    window.location.reload();
  });

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').then(function(registration){
      if(registration.waiting && navigator.serviceWorker.controller){
        showUpdateToast(registration.waiting);
      }

      if(registration.installing){
        watchInstallingWorker(registration.installing);
      }

      registration.addEventListener('updatefound', function(){
        watchInstallingWorker(registration.installing);
      });

      registration.update().catch(function(err){
        console.warn('[Crono] Verificação de atualização falhou:', err);
      });
    }).catch(function(err){
      console.warn('[Crono] Service Worker falhou:', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', function(){
  setupSplash();
  registerServiceWorker();
});
