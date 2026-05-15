/* =========================================================
   LIGHT TRIGGER v1.1 — captura flash luminoso via câmera
   Detecta pico de brilho (LED/sensor) e dispara lap.
   Configurável: nº de flashes por lap e sensibilidade.
   ========================================================= */
(function () {
    'use strict';

    // ---------- configuração (persistida em localStorage) ----------
    const STORAGE_KEY = 'lightTriggerCfg';
    // threshold por nível 1–5 (delta de luminância 0–255)
    const SENS_THRESHOLDS = [40, 28, 18, 10, 5];
    const CFG_DEFAULT = { flashesPerLap: 1, sensLevel: 3, cooldownMs: 1100 };

    let cfg = Object.assign({}, CFG_DEFAULT);
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        cfg = Object.assign(cfg, saved);
        // migração: versões antigas guardavam threshold direto
        if (!cfg.sensLevel && cfg.threshold) {
            const idx = SENS_THRESHOLDS.reduce((best, t, i) =>
                Math.abs(t - cfg.threshold) < Math.abs(SENS_THRESHOLDS[best] - cfg.threshold) ? i : best, 0);
            cfg.sensLevel = idx + 1;
            delete cfg.threshold;
        }
    } catch (_) {}

    function saveCfg() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
    }

    // ---------- estado interno ----------
    const SAMPLE_W = 16;
    const SAMPLE_H = 16;

    let stream     = null;
    let video      = null;
    let cvs        = null;
    let ctx        = null;
    let rafId      = null;
    let prevLum    = -1;
    let onCooldown = false;
    let isActive   = false;
    let flashCount = 0; // flashes detectados no ciclo atual

    // ---------- elementos DOM ----------
    let btnSensor, sensorIndicator, sensorBarFill;
    let sensorCountEl, sensorFplEl, btnFplMinus, btnFplPlus;
    let sensBtns = []; // 5 botões de sensibilidade
    let btnLap;

    // ---------- análise de luminância média (luma perceptual) ----------
    function avgLuminance() {
        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const d = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) {
            s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        }
        return s / (SAMPLE_W * SAMPLE_H);
    }

    // ---------- atualiza display do contador de flashes ----------
    function updateCountDisplay() {
        if (!sensorCountEl || !sensorFplEl) return;
        sensorCountEl.textContent = flashCount;
        sensorFplEl.textContent   = cfg.flashesPerLap;
        // colorir progresso
        const pct = cfg.flashesPerLap > 1 ? flashCount / cfg.flashesPerLap : 0;
        sensorCountEl.style.color = pct > 0 ? 'var(--yellow)' : 'var(--text-muted)';
    }

    // ---------- loop de análise frame-a-frame ----------
    function analyseFrame() {
        if (!isActive) return;
        rafId = requestAnimationFrame(analyseFrame);
        if (!video || video.readyState < 2) return;

        const lum   = avgLuminance();
        const delta = prevLum < 0 ? 0 : lum - prevLum;
        prevLum     = lum;

        // barra de nível de brilho
        if (sensorBarFill) {
            sensorBarFill.style.width = Math.min(100, (lum / 255) * 100).toFixed(1) + '%';
        }

        const threshold = SENS_THRESHOLDS[(cfg.sensLevel || 3) - 1];
        if (delta >= threshold && !onCooldown) {
            onCooldown = true;
            flashCount++;
            updateCountDisplay();

            // flash visual no indicador
            if (sensorIndicator) {
                sensorIndicator.classList.add('sensor-flash');
                setTimeout(() => sensorIndicator.classList.remove('sensor-flash'), 220);
            }

            if (flashCount >= cfg.flashesPerLap) {
                flashCount = 0;
                updateCountDisplay();
                if (btnLap && !btnLap.disabled) btnLap.click();
            }

            setTimeout(() => { onCooldown = false; }, cfg.cooldownMs);
        }
    }

    // ---------- iniciar câmera ----------
    async function startSensor() {
        if (isActive) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            alert('Câmera não suportada neste dispositivo.\nUtilize HTTPS e um navegador moderno.');
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width:  { ideal: 64 },
                    height: { ideal: 64 },
                    frameRate: { ideal: 30, max: 60 }
                }
            });
            video             = document.createElement('video');
            video.srcObject   = stream;
            video.playsInline = true;
            video.muted       = true;
            await video.play();

            cvs        = document.createElement('canvas');
            cvs.width  = SAMPLE_W;
            cvs.height = SAMPLE_H;
            ctx        = cvs.getContext('2d', { willReadFrequently: true });

            isActive   = true;
            prevLum    = -1;
            flashCount = 0;
            updateCountDisplay();
            analyseFrame();
            updateUI(true);

        } catch (err) {
            const msg = err.name === 'NotAllowedError'
                ? 'Permissão negada.\nLibere o acesso à câmera nas configurações do navegador.'
                : 'Não foi possível acessar a câmera:\n' + (err.message || String(err));
            alert(msg);
        }
    }

    // ---------- parar câmera ----------
    function stopSensor() {
        isActive   = false;
        flashCount = 0;
        if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        video = cvs = ctx = null;
        prevLum = -1;
        updateUI(false);
        if (sensorBarFill) sensorBarFill.style.width = '0%';
        updateCountDisplay();
    }

    // ---------- atualiza UI ----------
    function updateUI(active) {
        if (btnSensor) {
            btnSensor.classList.toggle('sensor-active', active);
            btnSensor.setAttribute('aria-pressed', String(active));
            btnSensor.title = active
                ? 'Sensor luminoso ativo — toque para desativar'
                : 'Ativar sensor luminoso (câmera traseira)';
        }
        if (sensorIndicator) {
            sensorIndicator.style.display = active ? 'flex' : 'none';
        }
    }

    // ---------- controles de configuração ----------
    function applyFplButtons() {
        if (!btnFplMinus || !btnFplPlus) return;
        btnFplMinus.disabled = cfg.flashesPerLap <= 1;
        btnFplPlus.disabled  = cfg.flashesPerLap >= 10;
    }

    // preenche dots 1..sensLevel (acumulativo)
    function applySensButtons(previewLevel) {
        const level = previewLevel ?? cfg.sensLevel ?? 3;
        sensBtns.forEach((btn, i) => {
            const dotLevel = i + 1;
            btn.classList.toggle('active', dotLevel <= cfg.sensLevel && previewLevel === undefined);
            btn.classList.toggle('hover-preview', previewLevel !== undefined && dotLevel <= level);
        });
    }

    // ---------- inicialização ----------
    function init() {
        btnSensor       = document.getElementById('btnSensor');
        sensorIndicator = document.getElementById('sensorIndicator');
        sensorBarFill   = document.getElementById('sensorBarFill');
        sensorCountEl   = document.getElementById('sensorFlashCount');
        sensorFplEl     = document.getElementById('sensorFpl');
        btnFplMinus     = document.getElementById('btnFplMinus');
        btnFplPlus      = document.getElementById('btnFplPlus');
        sensBtns        = Array.from(document.querySelectorAll('.sensor-sens-btn'));
        btnLap          = document.getElementById('btnLap');

        if (!btnSensor) return;

        // liga/desliga sensor
        btnSensor.addEventListener('click', () => {
            if (isActive) stopSensor(); else startSensor();
        });

        // flashes por lap
        btnFplMinus?.addEventListener('click', () => {
            cfg.flashesPerLap = Math.max(1, cfg.flashesPerLap - 1);
            flashCount = Math.min(flashCount, cfg.flashesPerLap - 1);
            saveCfg(); updateCountDisplay(); applyFplButtons();
        });
        btnFplPlus?.addEventListener('click', () => {
            cfg.flashesPerLap = Math.min(10, cfg.flashesPerLap + 1);
            saveCfg(); updateCountDisplay(); applyFplButtons();
        });

        // sensibilidade: 5 níveis com preenchimento acumulativo
        sensBtns.forEach(btn => {
            const level = parseInt(btn.dataset.sens, 10);
            btn.addEventListener('click', () => {
                cfg.sensLevel = level;
                saveCfg();
                applySensButtons();
            });
            btn.addEventListener('mouseenter', () => applySensButtons(level));
            btn.addEventListener('mouseleave', () => applySensButtons());
            // touch: preview no touchstart, confirma no touchend
            btn.addEventListener('touchstart', () => applySensButtons(level), { passive: true });
            btn.addEventListener('touchend',   () => {
                cfg.sensLevel = level;
                saveCfg();
                applySensButtons();
            }, { passive: true });
        });

        // para ao zerar o cronômetro
        document.addEventListener('click', e => {
            const action = e.target?.closest('[data-action]')?.dataset?.action;
            if (action === 'reset' && isActive) stopSensor();
        }, true);

        // estado inicial dos botões de config
        applyFplButtons();
        applySensButtons();
        updateCountDisplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
