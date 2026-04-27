'use strict';

const CRONO_MAQUINA_VERSION = 'v2.4.9';
const CRONO_SPLASH_KEY = 'crono_maquina_splash_seen_v249';

function loadA4ExportEngine(){
  const old=document.getElementById('export-fixes-script');
  if(old) old.remove();

  const script=document.createElement('script');
  script.id='export-fixes-script';
  script.src='export-fixes.js?v=249-a4-final-2';
  script.async=false;
  document.body.appendChild(script);

  const enhanced=document.createElement('script');
  enhanced.src='report-enhancements.js?v=249-enhanced-2';
  enhanced.async=false;
  document.body.appendChild(enhanced);
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
