'use strict';

const OPERIX_PWA_VERSION = 'v2.4.2';
let deferredInstallPrompt = null;

function injectPwaStyles() {
  if (document.getElementById('operix-pwa-styles')) return;

  const style = document.createElement('style');
  style.id = 'operix-pwa-styles';
  style.textContent = `
    @keyframes operixSplashPulse { from { transform:scale(.7); opacity:0; } to { transform:scale(1); opacity:1; } }
    @keyframes operixSplashFade { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes operixSlideUp { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }

    #splashScreen {
      position: fixed !important;
      inset: 0 !important;
      z-index: 9999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-height: 100vh !important;
      background: #0d1117 !important;
      color: #fff !important;
    }
    #splashScreen.operix-splash-hidden { display: none !important; }
    #splashScreen .splash-content {
      display:flex !important;
      flex-direction:column !important;
      align-items:center !important;
      gap:16px !important;
      text-align:center !important;
    }
    #splashScreen .splash-brand-row,
    #splashScreen .splash-icon-wrap,
    #splashScreen .splash-title-block,
    #splashScreen .splash-progress { display:none !important; }
    #splashScreen .operix-splash-icon {
      width:128px;
      height:128px;
      border-radius:28px;
      object-fit:cover;
      animation:operixSplashPulse .6s ease-out;
      box-shadow:0 18px 50px rgba(0,0,0,.35);
    }
    #splashScreen .operix-splash-brand {
      font-size:.75rem;
      color:#5f6b7a;
      font-weight:800;
      text-transform:uppercase;
      letter-spacing:.18em;
      animation:operixSplashFade .8s ease-out;
    }
    #splashScreen .operix-splash-title {
      font-size:1.85rem;
      line-height:1;
      font-weight:800;
      color:#fff;
      letter-spacing:-.02em;
      animation:operixSplashFade .8s ease-out;
    }
    #splashScreen .operix-splash-subtitle {
      font-size:.86rem;
      color:#7b8794;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.08em;
      animation:operixSplashFade .8s ease-out;
    }
    #splashScreen .operix-splash-version {
      font-size:.8rem;
      color:#555;
      animation:operixSplashFade .8s ease-out;
    }

    .operix-update-banner {
      display:none;
      position:fixed;
      bottom:16px;
      left:12px;
      right:12px;
      background:#1a3a5c;
      border:1px solid #007bff;
      border-radius:12px;
      padding:12px 16px;
      z-index:2000;
      flex-direction:row;
      align-items:center;
      gap:12px;
      box-shadow:0 4px 20px rgba(0,0,0,.5);
      animation:operixSlideUp .3s ease-out;
    }
    .operix-update-banner.visible { display:flex; }
    .operix-update-banner-text { flex:1; font-size:.82rem; color:#fff; line-height:1.4; }
    .operix-update-banner-text b { color:#4dabf7; }
    .operix-update-button {
      background:#007bff;
      border:none;
      border-radius:8px;
      color:white;
      font-size:.78rem;
      font-weight:700;
      padding:8px 14px;
      cursor:pointer;
      text-transform:uppercase;
      white-space:nowrap;
      flex-shrink:0;
    }

    .operix-install-button {
      display:none;
      width:100%;
      margin:10px 0 0;
      padding:13px 16px;
      background:linear-gradient(135deg,#1a3a5c,#0d2a45);
      border:1px solid #007bff;
      border-radius:14px;
      color:white;
      font-size:.88rem;
      font-weight:700;
      cursor:pointer;
      text-transform:uppercase;
      letter-spacing:.04em;
      text-align:center;
    }
    .operix-install-button.visible { display:block; }

    .branding { display:none !important; }
    .app-footer {
      padding:16px 10px 28px;
      text-align:center;
      font-size:13px;
      color:#9ca3af;
    }
    .footer-content {
      display:inline-flex;
      align-items:center;
      gap:6px;
      flex-wrap:wrap;
      justify-content:center;
    }
    .footer-link {
      display:inline-flex;
      align-items:center;
      gap:6px;
      text-decoration:none;
      font-weight:500;
      transition:opacity .2s ease;
    }
    .footer-link:hover { opacity:.85; }
    .footer-link.linkedin { color:#0A66C2; }
    .footer-link.whatsapp { color:#25D366; }
    .footer-separator { margin:0 6px; opacity:.6; }
    .footer-icon { width:16px; height:16px; display:inline-flex; }
    .footer-icon svg { width:100%; height:100%; fill:currentColor; }

    body.export-mode .app-footer,
    body.export-mode .operix-update-banner,
    body.export-mode .operix-install-button { display:none !important; }
  `;
  document.head.appendChild(style);
}

function setupVoltFuelStyleSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  splash.innerHTML = `
    <div class="splash-content">
      <img class="operix-splash-icon" src="assets/icon-192.png" alt="Cronoanálise Máquina">
      <div class="operix-splash-brand">OPERIX</div>
      <div class="operix-splash-title">Cronoanálise</div>
      <div class="operix-splash-subtitle">Máquina</div>
      <div class="operix-splash-version">${OPERIX_PWA_VERSION}</div>
    </div>
  `;

  setTimeout(() => {
    splash.classList.add('operix-splash-hidden');
  }, 1800);
}

function injectUpdateBanner() {
  if (document.getElementById('operix-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'operix-update-banner';
  banner.className = 'operix-update-banner';
  banner.innerHTML = `
    <div class="operix-update-banner-text">
      <b>&#128260; Nova versão disponível!</b><br>
      Toque em Atualizar para aplicar.
    </div>
    <button class="operix-update-button" type="button">Atualizar</button>
  `;
  banner.querySelector('button').addEventListener('click', aplicarAtualizacao);
  document.body.appendChild(banner);
}

function injectInstallButton() {
  if (document.getElementById('btn-instalar-pwa')) return;

  const button = document.createElement('button');
  button.id = 'btn-instalar-pwa';
  button.className = 'operix-install-button';
  button.type = 'button';
  button.textContent = '📲 Instalar Crono Máquina no celular';
  button.addEventListener('click', instalarPWA);

  const historyCard = document.getElementById('historyCard');
  if (historyCard) {
    historyCard.appendChild(button);
  } else {
    document.body.appendChild(button);
  }
}

function replaceFooterWithVoltFuelStyle() {
  if (document.querySelector('.app-footer')) return;

  const oldFooter = document.querySelector('footer.branding');
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.setAttribute('role', 'contentinfo');
  footer.innerHTML = `
    <span class="footer-content">
      Desenvolvido por
      <a class="footer-link linkedin" href="https://www.linkedin.com/in/pedro-ag-portela" target="_blank" rel="noopener noreferrer">
        <span class="footer-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.27c-.97 0-1.75-.8-1.75-1.77s.78-1.77 1.75-1.77 1.75.8 1.75 1.77-.78 1.77-1.75 1.77zm13.5 12.27h-3v-5.6c0-3.37-4-3.12-4 0v5.6h-3v-11h3v1.77c1.4-2.59 7-2.78 7 2.48v6.75z"/></svg></span>
        Pedro Portela
      </a>
      <span class="footer-separator">·</span>
      <a class="footer-link whatsapp" href="https://wa.me/5541991771410?text=Ol%C3%A1%20tudo%20bem%3F%20Vim%20pelo%20aplicativo%20Cronoan%C3%A1lise%20M%C3%A1quina." target="_blank" rel="noopener noreferrer">
        <span class="footer-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span>
        Fale comigo
      </a>
    </span>
  `;

  if (oldFooter) {
    oldFooter.insertAdjacentElement('afterend', footer);
  } else {
    document.body.appendChild(footer);
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = document.getElementById('btn-instalar-pwa');
  if (button) button.classList.add('visible');
});

function instalarPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    const button = document.getElementById('btn-instalar-pwa');
    if (button) button.classList.remove('visible');
  });
}

function aplicarAtualizacao() {
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          const banner = document.getElementById('operix-update-banner');
          if (banner) banner.classList.add('visible');
        }
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

function ensurePwaHeadTags() {
  const head = document.head;
  const addMeta = (name, content) => {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    head.appendChild(meta);
  };

  addMeta('theme-color', '#121212');
  addMeta('apple-mobile-web-app-capable', 'yes');
  addMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  addMeta('apple-mobile-web-app-title', 'Crono Máquina');

  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = 'manifest.json';
    head.appendChild(manifest);
  }

  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement('link');
    icon.rel = 'apple-touch-icon';
    icon.href = 'assets/icon-192.png';
    head.appendChild(icon);
  }
}

function initPwaUi() {
  ensurePwaHeadTags();
  injectPwaStyles();
  setupVoltFuelStyleSplash();
  injectUpdateBanner();
  injectInstallButton();
  replaceFooterWithVoltFuelStyle();
  registerServiceWorker();

  const appVersion = document.getElementById('appVersion');
  if (appVersion) appVersion.textContent = OPERIX_PWA_VERSION;
}

document.addEventListener('DOMContentLoaded', initPwaUi);
window.instalarPWA = instalarPWA;
window.aplicarAtualizacao = aplicarAtualizacao;
