'use strict';

const CRONO_MAQUINA_VERSION = 'v2.4.9';
const CRONO_SPLASH_KEY = 'crono_maquina_splash_seen_v249';

function loadA4ExportEngine(){
  const old=document.getElementById('export-fixes-script');
  if(old) old.remove();
  const script=document.createElement('script');
  script.id='export-fixes-script';
  script.src='export-fixes.js?v=249-a4-2';
  script.async=false;
  document.body.appendChild(script);
}

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
    .crono-splash-content{width:min(86vw,360px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;padding:28px 20px;}
    .crono-splash-logo{width:116px;height:116px;object-fit:contain;border-radius:24px;filter:drop-shadow(0 18px 38px rgba(0,0,0,.45));}
    .crono-splash-title{margin-top:2px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:1.85rem;line-height:1.05;font-weight:800;letter-spacing:-.03em;}
    .crono-splash-version{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:.86rem;font-weight:700;color:#8b98a8;letter-spacing:.08em;text-transform:uppercase;}
    .crono-splash-loading{width:170px;height:5px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.12);margin-top:6px;}
    .crono-splash-loading span{display:block;width:100%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2f81f7,#58a6ff);transform-origin:left center;animation:cronoSplashLoad 2s ease forwards;}
    @keyframes cronoSplashLoad{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  `;
  document.head.appendChild(style);
}

function setupSplash(){
  const splash=document.getElementById('splashScreen');
  const appVersion=document.getElementById('appVersion');
  if(appVersion) appVersion.textContent=CRONO_MAQUINA_VERSION;
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
  splash.removeAttribute('style');
  splash.innerHTML=`
    <div class="crono-splash-content">
      <img class="crono-splash-logo" src="assets/Crono-maquina.png" alt="Crono Máquina">
      <div class="crono-splash-title">Crono Máquina</div>
      <div class="crono-splash-version">${CRONO_MAQUINA_VERSION}</div>
      <div class="crono-splash-loading" aria-hidden="true"><span></span></div>
    </div>
  `;

  try{sessionStorage.setItem(CRONO_SPLASH_KEY,'true');}catch(e){}

  window.setTimeout(()=>{
    splash.classList.add('crono-splash-hidden');
    window.setTimeout(()=>{
      splash.classList.add('crono-splash-none');
      splash.style.display='none';
    },260);
  },2000);
}

document.addEventListener('DOMContentLoaded', function(){
  setupSplash();
  loadA4ExportEngine();
});
