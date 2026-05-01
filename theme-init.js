'use strict';
(function () {
  var STORAGE_KEY_THEME = 'operix_theme_v1';
  function applyTheme(theme) {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }
  function renderToggleIcon() {
    var btn = document.getElementById('op-theme-btn');
    if (!btn) return;
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.textContent = isLight ? '🌙' : '☀️';
    btn.setAttribute('aria-label', isLight ? 'Ativar tema escuro' : 'Ativar tema claro');
  }
  function detectInitialTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY_THEME);
      if (saved === 'light' || saved === 'dark') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    } catch (e) {}
    return 'dark';
  }

  function scheduleSplashFallback() {
    var hide = function () {
      var splash = document.getElementById('splashScreen');
      if (!splash) return;
      splash.classList.add('sp-out');
      setTimeout(function () { splash.style.display = 'none'; }, 700);
    };
    setTimeout(hide, 4500);
    window.addEventListener('load', function () { setTimeout(hide, 1200); }, { once: true });
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY_THEME, next); } catch (e) {}
    renderToggleIcon();
  }
  try { applyTheme(detectInitialTheme()); } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('op-theme-btn');
    if (btn) btn.addEventListener('click', toggleTheme);
    renderToggleIcon();
    scheduleSplashFallback();
  });
})();
