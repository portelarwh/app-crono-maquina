/* =========================================================
   LIGHT TRIGGER v2.0 — 3 modos de detecção via câmera
   • flash  — pico de luminância (LED, estroboscópio)
   • motion — diferença entre frames (peça passando, visor)
   • color  — alternância de zona de cor (verde ↔ vermelho)
   ========================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'lightTriggerCfg';

    // Limiares por nível 1–5 para cada modo
    const SENS_FLASH  = [40, 28, 18, 10, 5];              // delta de luminância (0–255)
    const SENS_MOTION = [0.20, 0.12, 0.06, 0.03, 0.015]; // fração de pixels alterados (0–1)
    const SENS_COLOR  = [60, 40, 24, 12, 6];              // gap R−G ou G−R para classificar zona

    const MODES = ['flash', 'motion', 'color'];
    const CFG_DEFAULT = { flashesPerLap: 1, sensLevel: 3, cooldownMs: 1100, mode: 'flash' };

    let cfg = Object.assign({}, CFG_DEFAULT);
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        cfg = Object.assign(cfg, saved);
        // migração: versões antigas guardavam threshold direto
        if (!cfg.sensLevel && cfg.threshold) {
            const idx = SENS_FLASH.reduce((best, t, i) =>
                Math.abs(t - cfg.threshold) < Math.abs(SENS_FLASH[best] - cfg.threshold) ? i : best, 0);
            cfg.sensLevel = idx + 1;
            delete cfg.threshold;
        }
        if (!MODES.includes(cfg.mode)) cfg.mode = 'flash';
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
    let prevPixels = null;  // motion mode: frame anterior
    let prevZone   = null;  // color mode: zona anterior ('red'|'green')
    let onCooldown = false;
    let isActive   = false;
    let flashCount = 0;

    // ---------- elementos DOM ----------
    let btnSensor, sensorIndicator, sensorBarFill;
    let sensorCountEl, sensorFplEl, sensorFplLabel;
    let btnFplMinus, btnFplPlus;
    let sensBtns = [];
    let modeBtns = [];
    let btnLap;

    // ---------- análise de luminância média (luma perceptual) ----------
    function avgLuminance(d) {
        let s = 0;
        for (let i = 0; i < d.length; i += 4) {
            s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        }
        return s / (SAMPLE_W * SAMPLE_H);
    }

    // ---------- fração de pixels que mudaram vs frame anterior ----------
    function motionFraction(d) {
        if (!prevPixels) return 0;
        let changed = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - prevPixels[i]) + Math.abs(d[i + 1] - prevPixels[i + 1]) + Math.abs(d[i + 2] - prevPixels[i + 2]) > 30) {
                changed++;
            }
        }
        return changed / (SAMPLE_W * SAMPLE_H);
    }

    // ---------- classifica zona de cor dominante ----------
    function detectColorZone(d) {
        let rSum = 0, gSum = 0;
        const n = SAMPLE_W * SAMPLE_H;
        for (let i = 0; i < d.length; i += 4) { rSum += d[i]; gSum += d[i + 1]; }
        const gap  = SENS_COLOR[(cfg.sensLevel || 3) - 1];
        const rAvg = rSum / n, gAvg = gSum / n;
        if (rAvg - gAvg > gap) return 'red';
        if (gAvg - rAvg > gap) return 'green';
        return 'neutral';
    }

    // ---------- atualiza display do contador ----------
    function updateCountDisplay() {
        if (!sensorCountEl || !sensorFplEl) return;
        sensorCountEl.textContent = flashCount;
        sensorFplEl.textContent   = cfg.flashesPerLap;
        const pct = cfg.flashesPerLap > 1 ? flashCount / cfg.flashesPerLap : 0;
        sensorCountEl.style.color = pct > 0 ? 'var(--yellow)' : 'var(--text-muted)';
    }

    // ---------- dispara evento detectado ----------
    function triggerEvent() {
        flashCount++;
        updateCountDisplay();
        if (sensorIndicator) {
            sensorIndicator.classList.add('sensor-flash');
            setTimeout(() => sensorIndicator.classList.remove('sensor-flash'), 220);
        }
        if (flashCount >= cfg.flashesPerLap) {
            flashCount = 0;
            updateCountDisplay();
            if (btnLap && !btnLap.disabled) btnLap.click();
        }
    }

    // ---------- loop de análise frame-a-frame ----------
    function analyseFrame() {
        if (!isActive) return;
        rafId = requestAnimationFrame(analyseFrame);
        if (!video || video.readyState < 2) return;

        ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
        const d   = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
        const lum = avgLuminance(d);

        // barra de nível — varia conforme modo
        if (sensorBarFill) {
            if (cfg.mode === 'motion') {
                const score = motionFraction(d);
                sensorBarFill.style.width = Math.min(100, score * 500).toFixed(1) + '%';
                sensorBarFill.dataset.zone = '';
            } else if (cfg.mode === 'color') {
                const zone = detectColorZone(d);
                sensorBarFill.style.width = zone !== 'neutral' ? '100%' : '30%';
                sensorBarFill.dataset.zone = zone;
            } else {
                sensorBarFill.style.width = Math.min(100, (lum / 255) * 100).toFixed(1) + '%';
                sensorBarFill.dataset.zone = '';
            }
        }

        if (!onCooldown) {
            let detected = false;
            const sens = (cfg.sensLevel || 3) - 1;

            if (cfg.mode === 'flash') {
                const delta = prevLum < 0 ? 0 : lum - prevLum;
                if (prevLum >= 0 && delta >= SENS_FLASH[sens]) detected = true;

            } else if (cfg.mode === 'motion') {
                const score = motionFraction(d);
                if (prevPixels && score >= SENS_MOTION[sens]) detected = true;

            } else if (cfg.mode === 'color') {
                const zone = detectColorZone(d);
                if (zone !== 'neutral' && prevZone && zone !== prevZone) detected = true;
                if (zone !== 'neutral') prevZone = zone;
            }

            if (detected) {
                onCooldown = true;
                triggerEvent();
                setTimeout(() => { onCooldown = false; }, cfg.cooldownMs);
            }
        }

        prevLum    = lum;
        prevPixels = new Uint8ClampedArray(d);
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
            prevPixels = null;
            prevZone   = null;
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
        prevPixels = null;
        prevZone   = null;
        if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        video = cvs = ctx = null;
        prevLum = -1;
        updateUI(false);
        if (sensorBarFill) { sensorBarFill.style.width = '0%'; sensorBarFill.dataset.zone = ''; }
        updateCountDisplay();
    }

    // ---------- atualiza UI ----------
    function updateUI(active) {
        if (btnSensor) {
            btnSensor.classList.toggle('sensor-active', active);
            btnSensor.setAttribute('aria-pressed', String(active));
            btnSensor.title = active
                ? 'Sensor ativo — toque para desativar'
                : 'Ativar sensor de câmera';
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

    function applyModeButtons() {
        modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === cfg.mode));
        if (sensorFplLabel) {
            sensorFplLabel.textContent =
                cfg.mode === 'color'  ? 'troca/lap'  :
                cfg.mode === 'motion' ? 'evento/lap' : 'flash/lap';
        }
        // reseta estado de detecção ao trocar de modo sem parar câmera
        if (isActive) {
            prevPixels = null;
            prevZone   = null;
            prevLum    = -1;
            flashCount = 0;
            updateCountDisplay();
            if (sensorBarFill) { sensorBarFill.style.width = '0%'; sensorBarFill.dataset.zone = ''; }
        }
    }

    // ---------- inicialização ----------
    function init() {
        btnSensor      = document.getElementById('btnSensor');
        sensorIndicator= document.getElementById('sensorIndicator');
        sensorBarFill  = document.getElementById('sensorBarFill');
        sensorCountEl  = document.getElementById('sensorFlashCount');
        sensorFplEl    = document.getElementById('sensorFpl');
        sensorFplLabel = document.getElementById('sensorFplLabel');
        btnFplMinus    = document.getElementById('btnFplMinus');
        btnFplPlus     = document.getElementById('btnFplPlus');
        sensBtns       = Array.from(document.querySelectorAll('.sensor-sens-btn'));
        modeBtns       = Array.from(document.querySelectorAll('.sensor-mode-btn'));
        btnLap         = document.getElementById('btnLap');

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
            btn.addEventListener('click', () => { cfg.sensLevel = level; saveCfg(); applySensButtons(); });
            btn.addEventListener('mouseenter', () => applySensButtons(level));
            btn.addEventListener('mouseleave', () => applySensButtons());
            btn.addEventListener('touchstart', () => applySensButtons(level), { passive: true });
            btn.addEventListener('touchend',   () => { cfg.sensLevel = level; saveCfg(); applySensButtons(); }, { passive: true });
        });

        // modo de detecção
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => { cfg.mode = btn.dataset.mode; saveCfg(); applyModeButtons(); });
        });

        // para ao zerar o cronômetro
        document.addEventListener('click', e => {
            const action = e.target?.closest('[data-action]')?.dataset?.action;
            if (action === 'reset' && isActive) stopSensor();
        }, true);

        applyFplButtons();
        applySensButtons();
        applyModeButtons();
        updateCountDisplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
