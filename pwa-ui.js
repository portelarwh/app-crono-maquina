'use strict';

const OPERIX_PWA_VERSION = 'v2.4.2';

function loadExportFixes(){
  if(document.getElementById('export-fixes-script')) return;
  const s=document.createElement('script');
  s.src='export-fixes.js';
  s.id='export-fixes-script';
  s.defer=true;
  document.body.appendChild(s);
}

function initPwaUi(){
  loadExportFixes();
}

document.addEventListener('DOMContentLoaded', initPwaUi);
