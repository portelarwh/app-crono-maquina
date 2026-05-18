/* =========================================================
   LIGHT TRIGGER v2.1 — câmera + auto-start + descartar 1ª
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
    const CFG_DEFAULT = { flashesPerLap: 1, sensLevel: 3, cooldownMs: 1100, mode: 'flash', autoStart: false, discardFirst: false };

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

    let stream      = null;
    let video       = null;
    let cvs         = null;
    let ctx         = null;
    let rafId       = null;
    let prevLum     = -1;
    let prevPixels  = null;  // motion mode: frame anterior
    let prevZone    = null;  // color mode: zona anterior ('red'|'green')
    let onCooldown  = false;
    let isActive    = false;
    let flashCount  = 0;
    let isArmed     = false;   // aguardando 1º evento para iniciar o cronômetro (autoStart)
    let discardNext = false;   // próxima detecção descartada sem registrar lap (discardFirst)
    let fromSensor  = false;   // clique programático em btnStart originado pelo sensor

    // preview ao vivo
    let previewVideo = null;
    let previewWrap  = null;
    let previewOpen  = true;

    // lanterna
    let torchOn        = false;
    let torchSupported = false;

    // região de interesse (ROI) — valores normalizados 0–1
    let roi         = { x: 0, y: 0, w: 1, h: 1 };
    let roiDragging = false;
    let roiStart    = null;

    // ---------- elementos DOM ----------
    let btnSensor, sensorIndicator, sensorBarFill;
    let sensorCountEl, sensorFplEl, sensorFplLabel;
    let btnFplMinus, btnFplPlus;
    let sensBtns = [];
    let modeBtns = [];
    let btnLap, btnStart;
    let btnAutoStart, btnDiscardFirst, armedLabel;

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

    // ---------- atualiza UI de armado ----------
    function updateArmedUI() {
        if (!sensorIndicator) return;
        sensorIndicator.classList.toggle('sensor-armed', isArmed);
        if (armedLabel) armedLabel.style.display = isArmed ? 'inline' : 'none';
    }

    // ---------- aplica estado dos botões de opção ----------
    function applyOptionButtons() {
        if (btnAutoStart)    btnAutoStart.classList.toggle('active', cfg.autoStart);
        if (btnDiscardFirst) btnDiscardFirst.classList.toggle('active', cfg.discardFirst);
    }

    // ---------- dispara evento detectado ----------
    function triggerEvent() {
        // modo armado: primeiro evento inicia o cronômetro em vez de registrar lap
        if (isArmed) {
            isArmed = false;
            prevLum = -1; prevPixels = null; prevZone = null; flashCount = 0;
            updateArmedUI();
            updateCountDisplay();
            if (btnStart && !btnStart.disabled) {
                if (cfg.discardFirst) discardNext = true;
                fromSensor = true;
                btnStart.click();
                fromSensor = false;
            }
            return;
        }

        // primeiro lap após iniciar: descartar se configurado
        if (discardNext) {
            discardNext = false;
            flashCount  = 0;
            updateCountDisplay();
            if (sensorIndicator) {
                sensorIndicator.classList.add('sensor-flash');
                setTimeout(() => sensorIndicator.classList.remove('sensor-flash'), 220);
            }
            return;
        }

        // contagem normal
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

        const vW = video.videoWidth  || SAMPLE_W;
        const vH = video.videoHeight || SAMPLE_H;
        ctx.drawImage(video,
            Math.round(roi.x * vW), Math.round(roi.y * vH),
            Math.max(1, Math.round(roi.w * vW)), Math.max(1, Math.round(roi.h * vH)),
            0, 0, SAMPLE_W, SAMPLE_H);
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
        updatePreviewCanvas();
    }

    // ---------- lanterna ----------
    // ---------- ROI — overlay e drag ----------
    function drawRoiOverlay() {
        const oc = document.getElementById('ltRoiOverlay');
        if (!oc) return;
        // sincroniza tamanho do canvas com o tamanho real em pixels
        if (oc.width !== oc.offsetWidth || oc.height !== oc.offsetHeight) {
            oc.width  = oc.offsetWidth  || 1;
            oc.height = oc.offsetHeight || 1;
        }
        const W = oc.width, H = oc.height;
        const cx = oc.getContext('2d');
        cx.clearRect(0, 0, W, H);
        const full = roi.x === 0 && roi.y === 0 && roi.w === 1 && roi.h === 1;
        if (!full) {
            cx.fillStyle = 'rgba(0,0,0,0.52)';
            cx.fillRect(0, 0, W, H);
            cx.clearRect(roi.x * W, roi.y * H, roi.w * W, roi.h * H);
        }
        cx.strokeStyle = full ? 'rgba(0,229,255,0.25)' : '#00e5ff';
        cx.lineWidth   = 2;
        cx.strokeRect(roi.x * W + 1, roi.y * H + 1, roi.w * W - 2, roi.h * H - 2);
        // alças nos cantos
        if (!full) {
            cx.fillStyle = '#00e5ff';
            const hs = 7;
            [ [roi.x*W, roi.y*H], [roi.x*W + roi.w*W, roi.y*H],
              [roi.x*W, roi.y*H + roi.h*H], [roi.x*W + roi.w*W, roi.y*H + roi.h*H] ]
            .forEach(([cx2, cy2]) => cx.fillRect(cx2 - hs/2, cy2 - hs/2, hs, hs));
        }
        // rótulo de instrução se quadro completo
        if (full) {
            cx.fillStyle = 'rgba(255,255,255,0.55)';
            cx.font = 'bold 9px sans-serif';
            cx.textAlign = 'center';
            cx.fillText('arraste para definir alvo', W / 2, H - 6);
        }
        // atualiza botão reset
        const btn = document.getElementById('btnLtRoiReset');
        if (btn) btn.style.display = full ? 'none' : '';
    }

    function setupRoiDrag(overlayCanvas) {
        function pos(e) {
            const r = overlayCanvas.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return {
                x: Math.max(0, Math.min(1, (p.clientX - r.left)  / r.width)),
                y: Math.max(0, Math.min(1, (p.clientY - r.top)   / r.height))
            };
        }
        overlayCanvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            roiStart    = pos(e);
            roiDragging = true;
            overlayCanvas.setPointerCapture(e.pointerId);
        });
        overlayCanvas.addEventListener('pointermove', e => {
            if (!roiDragging || !roiStart) return;
            const cur = pos(e);
            roi.x = Math.min(roiStart.x, cur.x);
            roi.y = Math.min(roiStart.y, cur.y);
            roi.w = Math.abs(cur.x - roiStart.x);
            roi.h = Math.abs(cur.y - roiStart.y);
            drawRoiOverlay();
        });
        overlayCanvas.addEventListener('pointerup', () => {
            roiDragging = false;
            if (roi.w < 0.06 || roi.h < 0.06) roi = { x: 0, y: 0, w: 1, h: 1 };
            roiStart = null;
            drawRoiOverlay();
        });
    }

    async function setTorch(on) {
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        try {
            await track.applyConstraints({ advanced: [{ torch: on }] });
            torchOn = on;
            const btn = document.getElementById('btnLtTorch');
            if (btn) {
                btn.classList.toggle('lt-torch-on', on);
                btn.title = on ? 'Desligar lanterna' : 'Ligar lanterna';
                btn.textContent = on ? '🔦 acesa' : '🔦 apagada';
            }
        } catch (_) {}
    }

    function checkTorchSupport() {
        if (!stream) return false;
        const track = stream.getVideoTracks()[0];
        const caps  = track?.getCapabilities?.() ?? {};
        return caps.torch === true;
    }

    // ---------- preview ao vivo ----------
    function injectPreviewStyles() {
        if (document.getElementById('lt-preview-style')) return;
        const s = document.createElement('style');
        s.id = 'lt-preview-style';
        s.textContent = `
          .lt-preview{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:8px;margin-top:8px;box-shadow:var(--shadow-card)}
          .lt-preview-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
          .lt-preview-title{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);display:flex;align-items:center;gap:5px}
          .lt-preview-dot{width:6px;height:6px;border-radius:50%;background:#e74c3c;animation:lt-blink 1s infinite}
          @keyframes lt-blink{0%,100%{opacity:1}50%{opacity:.3}}
          .lt-preview-toggle{background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--text-muted);font-size:.75rem;padding:2px 7px;cursor:pointer;line-height:1.4}
          .lt-torch-btn{background:var(--surface);border:1px solid var(--border);border-radius:5px;color:var(--text-muted);font-size:.75rem;padding:2px 7px;cursor:pointer;line-height:1.4;transition:background .15s,color .15s}
          .lt-torch-btn.lt-torch-on{background:#f39c12;border-color:#e67e22;color:#fff}
          .lt-preview-body{display:flex;gap:8px;align-items:flex-start}
          .lt-preview-body.lt-collapsed{display:none}
          .lt-vfeed{flex:1;background:#000;border-radius:6px;overflow:hidden;aspect-ratio:4/3;min-width:0;position:relative}
          .lt-vfeed video{width:100%;height:100%;object-fit:cover;display:block}
          .lt-vfeed-label{position:absolute;bottom:4px;left:5px;font-size:.52rem;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;pointer-events:none}
          .lt-roi-overlay{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none;display:block}
          .lt-roi-reset{position:absolute;top:4px;right:4px;background:rgba(0,229,255,.18);border:1px solid #00e5ff;border-radius:4px;color:#00e5ff;font-size:.58rem;font-weight:700;padding:2px 6px;cursor:pointer;line-height:1.4;display:none}
          .lt-vsample{width:72px;flex:none}
          .lt-vsample-canvas{width:72px;height:72px;border-radius:6px;border:1px solid var(--border);display:block;image-rendering:pixelated;image-rendering:crisp-edges;background:#000}
          .lt-vsample-label{font-size:.52rem;color:var(--text-muted);text-align:center;margin-top:3px;font-weight:700;text-transform:uppercase}
        `;
        document.head.appendChild(s);
    }

    function showPreview(liveStream) {
        injectPreviewStyles();
        hidePreview();

        torchSupported = checkTorchSupport();
        torchOn        = false;

        previewVideo           = document.createElement('video');
        previewVideo.srcObject = liveStream;
        previewVideo.playsInline = true;
        previewVideo.muted     = true;
        previewVideo.autoplay  = true;

        const torchBtn = torchSupported
            ? `<button class="lt-torch-btn" id="btnLtTorch" type="button" title="Ligar lanterna">🔦 apagada</button>`
            : '';

        previewWrap = document.createElement('div');
        previewWrap.className = 'lt-preview';
        previewWrap.innerHTML = `
          <div class="lt-preview-head">
            <span class="lt-preview-title">
              <span class="lt-preview-dot"></span>Câmera ao vivo
            </span>
            <span style="display:flex;gap:5px;align-items:center">
              ${torchBtn}
              <button class="lt-preview-toggle" id="btnLtPreviewToggle" type="button">${previewOpen ? '▲ ocultar' : '▼ mostrar'}</button>
            </span>
          </div>
          <div class="lt-preview-body${previewOpen ? '' : ' lt-collapsed'}" id="ltPreviewBody">
            <div class="lt-vfeed" id="ltVfeed">
              <canvas class="lt-roi-overlay" id="ltRoiOverlay"></canvas>
              <button class="lt-roi-reset" id="btnLtRoiReset" type="button" title="Resetar alvo para quadro completo">✕ alvo</button>
              <span class="lt-vfeed-label">vídeo · arraste para definir alvo</span>
            </div>
            <div class="lt-vsample">
              <canvas class="lt-vsample-canvas" id="ltSampleCanvas" width="16" height="16"></canvas>
              <div class="lt-vsample-label">sensor 16×16</div>
            </div>
          </div>
        `;

        const anchor = sensorIndicator || btnSensor;
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(previewWrap, anchor.nextSibling);
        }

        const vfeed = document.getElementById('ltVfeed');
        vfeed.insertBefore(previewVideo, document.getElementById('ltRoiOverlay'));

        // ROI: drag no overlay
        const overlay = document.getElementById('ltRoiOverlay');
        if (overlay) {
            setupRoiDrag(overlay);
            requestAnimationFrame(() => drawRoiOverlay());
        }

        // Botão reset ROI
        document.getElementById('btnLtRoiReset')?.addEventListener('click', () => {
            roi = { x: 0, y: 0, w: 1, h: 1 };
            drawRoiOverlay();
        });

        document.getElementById('btnLtPreviewToggle')?.addEventListener('click', () => {
            previewOpen = !previewOpen;
            const body = document.getElementById('ltPreviewBody');
            const btn  = document.getElementById('btnLtPreviewToggle');
            if (body) body.classList.toggle('lt-collapsed', !previewOpen);
            if (btn)  btn.textContent = previewOpen ? '▲ ocultar' : '▼ mostrar';
            if (previewOpen) requestAnimationFrame(() => drawRoiOverlay());
        });

        document.getElementById('btnLtTorch')?.addEventListener('click', () => setTorch(!torchOn));
    }

    function hidePreview() {
        if (torchOn) setTorch(false);
        if (previewVideo) { previewVideo.srcObject = null; previewVideo = null; }
        if (previewWrap)  { previewWrap.remove(); previewWrap = null; }
    }

    // copia o canvas de análise para o canvas de preview a cada frame
    function updatePreviewCanvas() {
        if (!previewOpen) return;
        const dest = document.getElementById('ltSampleCanvas');
        if (dest && cvs) { const dCtx = dest.getContext('2d'); if (dCtx) dCtx.drawImage(cvs, 0, 0); }
        if (!roiDragging) drawRoiOverlay();
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

            isActive    = true;
            isArmed     = false;
            discardNext = false;
            prevLum     = -1;
            prevPixels  = null;
            prevZone    = null;
            flashCount  = 0;
            updateCountDisplay();
            analyseFrame();
            updateUI(true);
            showPreview(stream);

        } catch (err) {
            const msg = err.name === 'NotAllowedError'
                ? 'Permissão negada.\nLibere o acesso à câmera nas configurações do navegador.'
                : 'Não foi possível acessar a câmera:\n' + (err.message || String(err));
            alert(msg);
        }
    }

    // ---------- parar câmera ----------
    function stopSensor() {
        isActive    = false;
        isArmed     = false;
        discardNext = false;
        flashCount  = 0;
        prevPixels  = null;
        prevZone    = null;
        if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
        hidePreview();                                          // apaga lanterna antes de parar a track
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        torchOn = false; torchSupported = false;
        roi = { x: 0, y: 0, w: 1, h: 1 }; roiDragging = false; roiStart = null;
        video = cvs = ctx = null;
        prevLum = -1;
        updateUI(false);
        updateArmedUI();
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
        btnSensor       = document.getElementById('btnSensor');
        sensorIndicator = document.getElementById('sensorIndicator');
        sensorBarFill   = document.getElementById('sensorBarFill');
        sensorCountEl   = document.getElementById('sensorFlashCount');
        sensorFplEl     = document.getElementById('sensorFpl');
        sensorFplLabel  = document.getElementById('sensorFplLabel');
        btnFplMinus     = document.getElementById('btnFplMinus');
        btnFplPlus      = document.getElementById('btnFplPlus');
        sensBtns        = Array.from(document.querySelectorAll('.sensor-sens-btn'));
        modeBtns        = Array.from(document.querySelectorAll('.sensor-mode-btn'));
        btnLap          = document.getElementById('btnLap');
        btnStart        = document.getElementById('btnStart');
        btnAutoStart    = document.getElementById('btnAutoStart');
        btnDiscardFirst = document.getElementById('btnDiscardFirst');
        armedLabel      = document.getElementById('sensorArmedLabel');

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

        // opções de acionamento
        btnAutoStart?.addEventListener('click', () => {
            cfg.autoStart = !cfg.autoStart;
            saveCfg();
            applyOptionButtons();
        });
        btnDiscardFirst?.addEventListener('click', () => {
            cfg.discardFirst = !cfg.discardFirst;
            saveCfg();
            applyOptionButtons();
        });

        // intercepta ações de sistema (capture phase)
        document.addEventListener('click', e => {
            const action = e.target?.closest('[data-action]')?.dataset?.action;

            if (action === 'reset' && isActive) stopSensor();

            if (action === 'start' && !fromSensor && isActive) {
                if (cfg.autoStart && !isArmed) {
                    // bloqueia o clique e arma o sensor — timer só inicia no 1º evento
                    e.stopPropagation();
                    isArmed = true;
                    updateArmedUI();
                } else if (!cfg.autoStart && cfg.discardFirst) {
                    // timer inicia normalmente, mas 1ª detecção será descartada
                    discardNext = true;
                }
            }
        }, true);

        applyFplButtons();
        applySensButtons();
        applyModeButtons();
        applyOptionButtons();
        updateCountDisplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
