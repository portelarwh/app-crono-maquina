/* =========================================================
   LIGHT TRIGGER v2.2 — câmera + auto-start + descartar 1ª
   • flash  — pico de luminância (LED, estroboscópio)
   • motion — diferença entre frames (peça passando, visor)
   • color  — alternância de zona de cor (verde ↔ vermelho)
   • change — variação de cor/brilho vs baseline (contador)
   ========================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'lightTriggerCfg';

    // Limiares por nível 1–10 para cada modo
    const SENS_FLASH     = [55, 42, 32, 24, 18, 13, 9, 6, 3, 1];
    const SENS_MOTION    = [0.18, 0.14, 0.10, 0.075, 0.055, 0.04, 0.025, 0.015, 0.008, 0.004];
    const SENS_COLOR     = [80, 62, 48, 36, 26, 18, 12, 8, 5, 2];
    const SENS_CHANGE    = [60, 45, 33, 23, 16, 11, 7, 4, 2.5, 1.5];
    // Limiar Manhattan por pixel no modo motion — escala com sensibilidade para detectar
    // bordas sutis na entrada do ROI: sens=1→50 (exige mudança grande), sens=10→12 (detecta 4 unid/canal)
    const SENS_PIXEL_THR = [50, 45, 40, 35, 30, 25, 20, 18, 15, 12];

    const MODES = ['flash', 'motion', 'color', 'change'];
    // Defaults por modo — motion sobe (7) porque a faixa de cruzamento é estreita; color e change ficam neutros (5).
    const SENS_BY_MODE_DEFAULT = { flash: 5, motion: 7, color: 5, change: 5 };
    const CFG_DEFAULT = { flashesPerLap: 1, sensLevel: 5, cooldownMs: 1100, mode: 'flash', autoStart: false, discardFirst: false, grayscale: false, minCycleMs: 0, zoom: 1, sensByMode: Object.assign({}, SENS_BY_MODE_DEFAULT) };

    let cfg = Object.assign({}, CFG_DEFAULT);
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        cfg = Object.assign(cfg, saved);
        if (!cfg.sensLevel && cfg.threshold) {
            const idx = SENS_FLASH.reduce((best, t, i) =>
                Math.abs(t - cfg.threshold) < Math.abs(SENS_FLASH[best] - cfg.threshold) ? i : best, 0);
            cfg.sensLevel = idx + 1;
            delete cfg.threshold;
        }
        if (cfg.sensLevel >= 1 && cfg.sensLevel <= 5 && Number.isInteger(cfg.sensLevel)) {
            cfg.sensLevel = cfg.sensLevel * 2 - 1;
        }
        if (!MODES.includes(cfg.mode)) cfg.mode = 'flash';
        if (!Number.isInteger(cfg.zoom) || cfg.zoom < 1 || cfg.zoom > 3) cfg.zoom = 1;
        // Migração: garante sensByMode populado e consistente com sensLevel atual.
        cfg.sensByMode = Object.assign({}, SENS_BY_MODE_DEFAULT, cfg.sensByMode || {});
        MODES.forEach(m => {
            const v = cfg.sensByMode[m];
            if (!Number.isInteger(v) || v < 1 || v > 10) cfg.sensByMode[m] = SENS_BY_MODE_DEFAULT[m];
        });
        cfg.sensByMode[cfg.mode] = cfg.sensLevel;
    } catch (_) {}

    function saveCfg() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
    }

    // ---------- estado interno ----------
    const SAMPLE_W = 32;
    const SAMPLE_H = 32;

    let stream         = null;
    let video          = null;
    let cvs            = null;
    let ctx            = null;
    let rafId          = null;
    let prevLum        = -1;
    let lumHistory     = [];
    let changeBaseline = null;
    let prevPixels     = null;
    let prevZone       = null;
    let onCooldown     = false;
    let isActive       = false;
    let flashCount     = 0;
    let lastLapTs      = 0;
    let isArmed        = false;
    let discardNext    = false;
    let fromSensor     = false;

    // preview ao vivo
    let previewVideo = null;
    let previewWrap  = null;
    let previewOpen  = true;

    // lanterna
    let torchOn        = false;
    let torchSupported = false;

    // foco
    let focusLocked    = false;
    let focusSupported = false;

    // zoom (nativo da câmera quando suportado, com fallback digital via CSS+crop)
    let digitalZoomActive = false;

    // ROI — modo retângulo
    let roi       = { x: 0, y: 0, w: 1, h: 1 };
    let roiMode   = 'idle';   // 'idle'|'drawing'|'moving'|'resize-tl'|'resize-tr'|'resize-bl'|'resize-br'
    let roiStart  = null;
    let roiAnchor = null;
    let roiSnap   = null;

    // ROI — modo linha
    let roiType       = 'rect';   // 'rect' | 'line'
    let roiLine       = { pos: 0.5, dir: 'vertical', activeSide: 'right' };
    let lineMode      = 'idle';   // 'idle' | 'dragging' | 'flip'
    let lineDragStart = null;

    // ---------- elementos DOM ----------
    let btnSensor, sensorIndicator, sensorBarFill;
    let sensorCountEl, sensorFplEl, sensorFplLabel;
    let btnFplMinus, btnFplPlus;
    let btnSensMinus, btnSensPlus, sensorSensLabel;
    let sensorOutlierInput;
    let modeBtns = [];
    let btnLap, btnStart;
    let btnAutoStart, btnDiscardFirst, armedLabel;

    // Faixa estreita centrada na linha: somente pixels DENTRO desta faixa contam para a detecção.
    // Largura total ~6 px (3 de cada lado) em frame 32×32 ≈ 19% — só motion que atravessa a linha dispara.
    const LINE_BAND_HALF = 3;

    // ---------- contagem de pixels ativos (consistência entre os 3 modos de ROI) ----------
    function getActivePixelCount() {
        if (roiType !== 'line') return SAMPLE_W * SAMPLE_H;
        const isVert = roiLine.dir === 'vertical';
        const len    = isVert ? SAMPLE_W : SAMPLE_H;
        const cut    = Math.round(roiLine.pos * len);
        const lo     = Math.max(0, cut - LINE_BAND_HALF);
        const hi     = Math.min(len, cut + LINE_BAND_HALF);
        const bandW  = Math.max(1, hi - lo);
        return isVert ? bandW * SAMPLE_H : SAMPLE_W * bandW;
    }

    // ---------- análise de luminância média (dividida por pixels ativos) ----------
    function avgLuminance(d, n) {
        let s = 0;
        for (let i = 0; i < d.length; i += 4) {
            s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        }
        return s / n;
    }

    // ---------- média RGB por canal ----------
    function avgRGB(d, n) {
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
        return { r: r/n, g: g/n, b: b/n };
    }
    function rgbDist(a, b) {
        const dr = a.r-b.r, dg = a.g-b.g, db = a.b-b.b;
        return Math.sqrt(dr*dr + dg*dg + db*db);
    }

    // ---------- fração de pixels ativos que mudaram vs frame anterior ----------
    function motionFraction(d, n) {
        if (!prevPixels) return 0;
        const pixThr = SENS_PIXEL_THR[(cfg.sensLevel || 5) - 1];
        let changed = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - prevPixels[i]) + Math.abs(d[i+1] - prevPixels[i+1]) + Math.abs(d[i+2] - prevPixels[i+2]) > pixThr) {
                changed++;
            }
        }
        return changed / n;
    }

    // ---------- classifica zona de cor dominante ----------
    function detectColorZone(d, n) {
        let rSum = 0, gSum = 0;
        for (let i = 0; i < d.length; i += 4) { rSum += d[i]; gSum += d[i+1]; }
        const gap  = SENS_COLOR[(cfg.sensLevel || 5) - 1];
        const rAvg = rSum / n, gAvg = gSum / n;
        if (rAvg - gAvg > gap) return 'red';
        if (gAvg - rAvg > gap) return 'green';
        return 'neutral';
    }

    // ---------- máscara de linha: mantém SOMENTE pixels da faixa ao redor da linha ----------
    // Tudo fora da faixa é zerado — atividade longe da linha é ignorada. Só conta cruzamento.
    function applyLineMask(d) {
        const isVert = roiLine.dir === 'vertical';
        const len    = isVert ? SAMPLE_W : SAMPLE_H;
        const cut    = Math.round(roiLine.pos * len);
        const lo     = Math.max(0, cut - LINE_BAND_HALF);
        const hi     = Math.min(len, cut + LINE_BAND_HALF);
        for (let row = 0; row < SAMPLE_H; row++) {
            for (let col = 0; col < SAMPLE_W; col++) {
                const coord  = isVert ? col : row;
                const inBand = coord >= lo && coord < hi;
                if (!inBand) {
                    const i = (row * SAMPLE_W + col) * 4;
                    d[i] = d[i+1] = d[i+2] = 0;
                }
            }
        }
    }

    // ---------- converte frame para escala de cinza ----------
    function applyGrayscale(d) {
        for (let i = 0; i < d.length; i += 4) {
            const g = Math.round(d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
            d[i] = d[i+1] = d[i+2] = g;
        }
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
        // bloqueia ao vivo qualquer disparo abaixo do Outlier (cronômetro segue rodando)
        if (cfg.minCycleMs > 0 && lastLapTs > 0 && Date.now() - lastLapTs < cfg.minCycleMs) return;

        if (isArmed) {
            isArmed = false;
            prevLum = -1; lumHistory = []; prevPixels = null; prevZone = null; flashCount = 0;
            lastLapTs = Date.now();
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

        if (discardNext) {
            discardNext = false;
            flashCount  = 0;
            lastLapTs   = Date.now();
            updateCountDisplay();
            if (sensorIndicator) {
                sensorIndicator.classList.add('sensor-flash');
                setTimeout(() => sensorIndicator.classList.remove('sensor-flash'), 220);
            }
            return;
        }

        flashCount++;
        updateCountDisplay();
        if (sensorIndicator) {
            sensorIndicator.classList.add('sensor-flash');
            setTimeout(() => sensorIndicator.classList.remove('sensor-flash'), 220);
        }
        if (flashCount >= cfg.flashesPerLap) {
            flashCount = 0;
            lastLapTs  = Date.now();
            updateCountDisplay();
            if (typeof window.recordLapFromSensor === 'function') window.recordLapFromSensor();
        }
    }

    // ---------- loop de análise frame-a-frame ----------
    function analyseFrame() {
        if (!isActive) return;
        rafId = requestAnimationFrame(analyseFrame);
        if (!video || video.readyState < 2) return;

        const vW = video.videoWidth  || SAMPLE_W;
        const vH = video.videoHeight || SAMPLE_H;

        const z     = digitalZoomActive ? (cfg.zoom || 1) : 1;
        const cropW = vW / z;
        const cropH = vH / z;
        const cropX = (vW - cropW) / 2;
        const cropY = (vH - cropH) / 2;

        if (roiType === 'rect') {
            ctx.drawImage(video,
                Math.round(cropX + roi.x * cropW), Math.round(cropY + roi.y * cropH),
                Math.max(1, Math.round(roi.w * cropW)), Math.max(1, Math.round(roi.h * cropH)),
                0, 0, SAMPLE_W, SAMPLE_H);
        } else {
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, SAMPLE_W, SAMPLE_H);
        }

        const imgData = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
        const d       = imgData.data;

        // pré-processamento: linha e escala de cinza
        if (roiType === 'line') applyLineMask(d);
        if (cfg.grayscale)      applyGrayscale(d);

        // devolve os pixels processados ao canvas (para preview)
        ctx.putImageData(imgData, 0, 0);

        const n    = getActivePixelCount();
        const lum  = avgLuminance(d, n);
        const sens = (cfg.sensLevel || 5) - 1;

        let changeRGB = null;
        if (cfg.mode === 'flash') {
            lumHistory.push(lum);
            if (lumHistory.length > 8) lumHistory.shift();
        } else if (cfg.mode === 'change') {
            changeRGB = avgRGB(d, n);
            if (changeBaseline === null) {
                changeBaseline = { ...changeRGB };
            } else {
                const alpha = onCooldown ? 0.25 : 0.03;
                changeBaseline.r += (changeRGB.r - changeBaseline.r) * alpha;
                changeBaseline.g += (changeRGB.g - changeBaseline.g) * alpha;
                changeBaseline.b += (changeRGB.b - changeBaseline.b) * alpha;
            }
        }

        if (sensorBarFill) {
            if (cfg.mode === 'motion') {
                sensorBarFill.style.width = Math.min(100, motionFraction(d, n) * 500).toFixed(1) + '%';
                sensorBarFill.dataset.zone = '';
            } else if (cfg.mode === 'color') {
                const zone = detectColorZone(d, n);
                sensorBarFill.style.width = zone !== 'neutral' ? '100%' : '30%';
                sensorBarFill.dataset.zone = zone;
            } else if (cfg.mode === 'change') {
                const dist = (changeRGB && changeBaseline) ? rgbDist(changeRGB, changeBaseline) : 0;
                sensorBarFill.style.width = Math.min(100, (dist / (SENS_CHANGE[sens] || 1)) * 100).toFixed(1) + '%';
                sensorBarFill.dataset.zone = '';
            } else {
                const hist  = lumHistory.length > 1 ? lumHistory.slice(0, -1) : [lum];
                const delta = Math.max(0, lum - Math.min(...hist));
                sensorBarFill.style.width = Math.min(100, (delta / (SENS_FLASH[sens] || 1)) * 100).toFixed(1) + '%';
                sensorBarFill.dataset.zone = '';
            }
        }

        if (!onCooldown) {
            let detected = false;

            if (cfg.mode === 'flash') {
                const hist     = lumHistory.length > 1 ? lumHistory.slice(0, -1) : [lum];
                const baseline = Math.min(...hist);
                if (prevLum >= 0 && lum - baseline >= SENS_FLASH[sens]) detected = true;

            } else if (cfg.mode === 'motion') {
                if (prevPixels && motionFraction(d, n) >= SENS_MOTION[sens]) detected = true;

            } else if (cfg.mode === 'color') {
                const zone = detectColorZone(d, n);
                if (zone !== 'neutral' && prevZone && zone !== prevZone) detected = true;
                if (zone !== 'neutral') prevZone = zone;

            } else if (cfg.mode === 'change') {
                if (changeRGB && changeBaseline && rgbDist(changeRGB, changeBaseline) >= SENS_CHANGE[sens]) detected = true;
            }

            if (detected) {
                if (cfg.mode === 'flash')  lumHistory = [lum];
                if (cfg.mode === 'change') changeBaseline = null;
                onCooldown = true;
                triggerEvent();
                setTimeout(() => { onCooldown = false; }, cfg.cooldownMs);
            }
        }

        prevLum    = lum;
        prevPixels = new Uint8ClampedArray(d);
        updatePreviewCanvas();
    }

    // ---------- ROI overlay e drag ----------
    const HANDLE_R  = 10;
    const HANDLE_SZ = 9;
    const CURSORS   = { 'idle':'crosshair', 'drawing':'crosshair', 'moving':'move',
                        'resize-tl':'nwse-resize', 'resize-br':'nwse-resize',
                        'resize-tr':'nesw-resize',  'resize-bl':'nesw-resize' };

    function roiHitTest(nx, ny, W, H) {
        const full = roi.x === 0 && roi.y === 0 && roi.w === 1 && roi.h === 1;
        if (full) return 'drawing';
        const hx = HANDLE_R / W, hy = HANDLE_R / H;
        const corners = [
            ['resize-tl', roi.x,         roi.y        ],
            ['resize-tr', roi.x + roi.w, roi.y        ],
            ['resize-bl', roi.x,         roi.y + roi.h],
            ['resize-br', roi.x + roi.w, roi.y + roi.h],
        ];
        for (const [name, cx, cy] of corners) {
            if (Math.abs(nx - cx) < hx && Math.abs(ny - cy) < hy) return name;
        }
        if (nx > roi.x && nx < roi.x + roi.w && ny > roi.y && ny < roi.y + roi.h) return 'moving';
        return 'drawing';
    }

    function drawLineOverlay(cx, W, H) {
        const isVert = roiLine.dir === 'vertical';
        const lp     = roiLine.pos;
        const active = roiLine.activeSide;

        // shade fora da faixa de cruzamento (apenas a faixa fica "ativa")
        const sampleLen = isVert ? SAMPLE_W : SAMPLE_H;
        const bandFrac  = LINE_BAND_HALF / sampleLen;
        cx.fillStyle = 'rgba(0,0,0,0.42)';
        if (isVert) {
            const bandLo = Math.max(0, (lp - bandFrac) * W);
            const bandHi = Math.min(W, (lp + bandFrac) * W);
            cx.fillRect(0, 0, bandLo, H);
            cx.fillRect(bandHi, 0, W - bandHi, H);
        } else {
            const bandLo = Math.max(0, (lp - bandFrac) * H);
            const bandHi = Math.min(H, (lp + bandFrac) * H);
            cx.fillRect(0, 0, W, bandLo);
            cx.fillRect(0, bandHi, W, H - bandHi);
        }

        // dashed red line
        cx.strokeStyle = '#ff4444';
        cx.lineWidth   = 2;
        cx.setLineDash([6, 4]);
        cx.beginPath();
        if (isVert) { cx.moveTo(lp * W, 0); cx.lineTo(lp * W, H); }
        else        { cx.moveTo(0, lp * H); cx.lineTo(W, lp * H); }
        cx.stroke();
        cx.setLineDash([]);

        // arrow indicando o lado "preferido" (orientação) — apenas dica visual
        cx.fillStyle    = 'rgba(255,100,100,0.9)';
        cx.font         = 'bold 13px sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'middle';
        if (isVert) {
            const ax = active === 'right' ? lp * W + (1 - lp) * W * 0.55 : lp * W * 0.45;
            cx.fillText(active === 'right' ? '►' : '◄', ax, H / 2);
        } else {
            const ay = active === 'bottom' ? lp * H + (1 - lp) * H * 0.55 : lp * H * 0.45;
            cx.fillText(active === 'bottom' ? '▼' : '▲', W / 2, ay);
        }

        // hint
        cx.fillStyle    = 'rgba(255,255,255,0.45)';
        cx.font         = 'bold 8px sans-serif';
        cx.textAlign    = 'center';
        cx.textBaseline = 'alphabetic';
        cx.fillText('arraste a linha · só conta o que cruzar', W / 2, H - 5);
    }

    function drawRoiOverlay() {
        const oc = document.getElementById('ltRoiOverlay');
        if (!oc) return;
        if (oc.width !== oc.offsetWidth || oc.height !== oc.offsetHeight) {
            oc.width  = oc.offsetWidth  || 1;
            oc.height = oc.offsetHeight || 1;
        }
        const W = oc.width, H = oc.height;
        const cx = oc.getContext('2d');
        cx.clearRect(0, 0, W, H);

        if (roiType === 'line') {
            drawLineOverlay(cx, W, H);
            const btn = document.getElementById('btnLtRoiReset');
            if (btn) btn.style.display = '';
            return;
        }

        // rect mode
        const full = roi.x === 0 && roi.y === 0 && roi.w === 1 && roi.h === 1;

        if (!full) {
            cx.fillStyle = 'rgba(0,0,0,0.52)';
            cx.fillRect(0, 0, W, H);
            cx.clearRect(roi.x * W, roi.y * H, roi.w * W, roi.h * H);
        }

        cx.strokeStyle = full ? 'rgba(0,229,255,0.22)' : '#00e5ff';
        cx.lineWidth   = 2;
        cx.strokeRect(roi.x * W + 1, roi.y * H + 1, roi.w * W - 2, roi.h * H - 2);

        if (!full) {
            const hs = HANDLE_SZ;
            cx.fillStyle   = '#00e5ff';
            cx.shadowColor = 'rgba(0,0,0,0.6)'; cx.shadowBlur = 3;
            [ [roi.x * W,              roi.y * H             ],
              [roi.x * W + roi.w * W,  roi.y * H             ],
              [roi.x * W,              roi.y * H + roi.h * H ],
              [roi.x * W + roi.w * W,  roi.y * H + roi.h * H] ]
            .forEach(([px, py]) => cx.fillRect(px - hs/2, py - hs/2, hs, hs));
            cx.shadowBlur = 0;

            cx.fillStyle    = 'rgba(0,229,255,0.35)';
            cx.font         = `${Math.max(10, Math.min(16, roi.w * W * 0.25))}px sans-serif`;
            cx.textAlign    = 'center'; cx.textBaseline = 'middle';
            cx.fillText('✥', (roi.x + roi.w / 2) * W, (roi.y + roi.h / 2) * H);

            if (roi.w > 0.08 && roi.h > 0.05) {
                const rRaw      = roi.w / roi.h;
                const ratioText = rRaw >= 1 ? `${rRaw.toFixed(1)}:1` : `1:${(1/rRaw).toFixed(1)}`;
                cx.fillStyle    = 'rgba(0,229,255,0.75)';
                cx.font         = 'bold 9px monospace';
                cx.textAlign    = 'right'; cx.textBaseline = 'top';
                cx.fillText(ratioText, (roi.x + roi.w) * W - 4, roi.y * H + 4);
            }
        }

        if (full) {
            cx.fillStyle    = 'rgba(255,255,255,0.52)';
            cx.font         = 'bold 9px sans-serif';
            cx.textAlign    = 'center'; cx.textBaseline = 'alphabetic';
            cx.fillText('arraste para definir alvo', W / 2, H - 6);
        }

        const btn = document.getElementById('btnLtRoiReset');
        if (btn) btn.style.display = full ? 'none' : '';
    }

    function setupRoiDrag(overlayCanvas) {
        function pos(e) {
            const r = overlayCanvas.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return {
                x: Math.max(0, Math.min(1, (p.clientX - r.left) / r.width)),
                y: Math.max(0, Math.min(1, (p.clientY - r.top)  / r.height))
            };
        }
        function setCursor(mode) {
            overlayCanvas.style.cursor = CURSORS[mode] || 'crosshair';
        }

        overlayCanvas.addEventListener('pointermove', e => {
            const cur = pos(e);

            if (roiType === 'line') {
                if (lineMode === 'dragging') {
                    roiLine.pos = roiLine.dir === 'vertical'
                        ? Math.max(0.05, Math.min(0.95, cur.x))
                        : Math.max(0.05, Math.min(0.95, cur.y));
                    drawRoiOverlay();
                }
                return;
            }

            if (roiMode === 'idle') {
                setCursor(roiHitTest(cur.x, cur.y, overlayCanvas.offsetWidth, overlayCanvas.offsetHeight));
                return;
            }
            if (roiMode === 'drawing') {
                roi.x = Math.min(roiStart.x, cur.x);
                roi.y = Math.min(roiStart.y, cur.y);
                roi.w = Math.abs(cur.x - roiStart.x);
                roi.h = Math.abs(cur.y - roiStart.y);
            } else if (roiMode === 'moving') {
                const dx = cur.x - roiStart.x, dy = cur.y - roiStart.y;
                roi.x = Math.max(0, Math.min(1 - roiSnap.w, roiSnap.x + dx));
                roi.y = Math.max(0, Math.min(1 - roiSnap.h, roiSnap.y + dy));
                roi.w = roiSnap.w; roi.h = roiSnap.h;
            } else if (roiMode.startsWith('resize-')) {
                const dxRaw = cur.x - roiAnchor.x;
                const dyRaw = cur.y - roiAnchor.y;
                const AR    = (roiSnap && roiSnap.h > 0.001) ? roiSnap.w / roiSnap.h : 1;
                const wByX  = Math.abs(dxRaw);
                const wByY  = Math.abs(dyRaw) * AR;
                const newW  = Math.max(0.04, wByX > wByY ? wByX : wByY);
                const newH  = newW / AR;
                const x1    = dxRaw >= 0 ? roiAnchor.x : roiAnchor.x - newW;
                const y1    = dyRaw >= 0 ? roiAnchor.y : roiAnchor.y - newH;
                roi.x = Math.max(0, Math.min(1 - 0.04, x1));
                roi.y = Math.max(0, Math.min(1 - 0.04, y1));
                roi.w = Math.min(newW, 1 - roi.x);
                roi.h = roi.w / AR;
            }
            drawRoiOverlay();
        });

        overlayCanvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            const p = pos(e);

            if (roiType === 'line') {
                const isVert     = roiLine.dir === 'vertical';
                const linePixPos = isVert
                    ? roiLine.pos * overlayCanvas.offsetWidth
                    : roiLine.pos * overlayCanvas.offsetHeight;
                const pointerPix = isVert
                    ? p.x * overlayCanvas.offsetWidth
                    : p.y * overlayCanvas.offsetHeight;
                lineMode      = Math.abs(pointerPix - linePixPos) < HANDLE_R * 2.5 ? 'dragging' : 'flip';
                lineDragStart = p;
                overlayCanvas.style.cursor = lineMode === 'dragging'
                    ? (isVert ? 'ew-resize' : 'ns-resize')
                    : 'pointer';
                overlayCanvas.setPointerCapture(e.pointerId);
                return;
            }

            const hit = roiHitTest(p.x, p.y, overlayCanvas.offsetWidth, overlayCanvas.offsetHeight);
            roiMode  = hit;
            roiStart = p;
            roiSnap  = { ...roi };
            if (hit.startsWith('resize-')) {
                const ox = { tl: roi.x+roi.w, tr: roi.x, bl: roi.x+roi.w, br: roi.x };
                const oy = { tl: roi.y+roi.h, tr: roi.y+roi.h, bl: roi.y, br: roi.y };
                const k  = hit.slice(7);
                roiAnchor = { x: ox[k], y: oy[k] };
            }
            setCursor(hit);
            overlayCanvas.setPointerCapture(e.pointerId);
        });

        overlayCanvas.addEventListener('pointerup', () => {
            if (roiType === 'line') {
                if (lineMode === 'flip' && lineDragStart) {
                    // set active side to the side that was tapped
                    if (roiLine.dir === 'vertical') {
                        roiLine.activeSide = lineDragStart.x >= roiLine.pos ? 'right' : 'left';
                    } else {
                        roiLine.activeSide = lineDragStart.y >= roiLine.pos ? 'bottom' : 'top';
                    }
                }
                lineMode = 'idle'; lineDragStart = null;
                overlayCanvas.style.cursor = 'crosshair';
                drawRoiOverlay();
                return;
            }

            if (roiMode === 'drawing' && (roi.w < 0.06 || roi.h < 0.06)) {
                roi = { x: 0, y: 0, w: 1, h: 1 };
            }
            roiMode = 'idle'; roiStart = null; roiAnchor = null; roiSnap = null;
            drawRoiOverlay();
            setCursor(roiHitTest(0.5, 0.5, overlayCanvas.offsetWidth, overlayCanvas.offsetHeight));
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
                btn.title       = on ? 'Desligar lanterna' : 'Ligar lanterna';
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

    function checkFocusSupport() {
        if (!stream) return false;
        const track = stream.getVideoTracks()[0];
        const caps  = track?.getCapabilities?.() ?? {};
        return Array.isArray(caps.focusMode) && caps.focusMode.includes('manual');
    }

    async function setFocusLock(lock) {
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (!track) return;
        try {
            if (lock) {
                const dist = track.getSettings?.().focusDistance;
                const adv  = { focusMode: 'manual' };
                if (Number.isFinite(dist)) adv.focusDistance = dist;
                await track.applyConstraints({ advanced: [adv] });
            } else {
                await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            }
            focusLocked = lock;
            const btn = document.getElementById('btnLtFocus');
            if (btn) {
                btn.classList.toggle('lt-focus-on', lock);
                btn.title       = lock ? 'Desbloquear foco' : 'Travar foco (evita reajuste ao passar objeto)';
                btn.textContent = lock ? '🔒 foco' : '🔓 foco';
            }
        } catch (_) {}
    }

    // ---------- zoom (nativo da câmera, com fallback digital) ----------
    function updateZoomBtn() {
        const btn = document.getElementById('btnRoiZoom');
        if (!btn) return;
        btn.textContent = `🔍${cfg.zoom || 1}x`;
        btn.classList.toggle('active', (cfg.zoom || 1) > 1);
    }

    async function applyZoom(level) {
        cfg.zoom = level;
        saveCfg();
        digitalZoomActive = false;
        if (previewVideo) previewVideo.style.transform = '';

        let nativeOk = false;
        const track = stream?.getVideoTracks?.()[0];
        const caps  = track?.getCapabilities?.();
        if (track && caps?.zoom) {
            const zMin = caps.zoom.min || 1;
            const zMax = caps.zoom.max || 1;
            const target = level === 1 ? zMin : Math.min(zMax, Math.max(zMin, level));
            try {
                await track.applyConstraints({ advanced: [{ zoom: target }] });
                nativeOk = (level === 1) || (target >= level * 0.9);
            } catch (_) {}
        }

        if (!nativeOk && level > 1) {
            digitalZoomActive = true;
            if (previewVideo) {
                previewVideo.style.transformOrigin = 'center center';
                previewVideo.style.transform = `scale(${level})`;
            }
        }
        updateZoomBtn();
        drawRoiOverlay();
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
          .lt-torch-btn.lt-focus-on{background:#2980b9;border-color:#3498db;color:#fff}
          .lt-preview-body{display:flex;gap:8px;align-items:flex-start}
          .lt-preview-body.lt-collapsed{display:none}
          .lt-vfeed{flex:1;background:#000;border-radius:6px;overflow:hidden;aspect-ratio:4/3;min-width:0;position:relative}
          .lt-vfeed video{width:100%;height:100%;object-fit:cover;display:block}
          .lt-vfeed-label{position:absolute;bottom:4px;left:5px;font-size:.52rem;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;pointer-events:none}
          .lt-roi-overlay{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none;display:block;user-select:none}
          .lt-roi-reset{position:absolute;top:4px;right:4px;background:rgba(0,229,255,.18);border:1px solid #00e5ff;border-radius:4px;color:#00e5ff;font-size:.58rem;font-weight:700;padding:2px 6px;cursor:pointer;line-height:1.4;display:none}
          .lt-vsample{width:72px;flex:none}
          .lt-vsample-canvas{width:72px;height:72px;border-radius:6px;border:1px solid var(--border);display:block;image-rendering:pixelated;image-rendering:crisp-edges;background:#000}
          .lt-vsample-label{font-size:.52rem;color:var(--text-muted);text-align:center;margin-top:3px;font-weight:700;text-transform:uppercase}
          .lt-roi-type-ctrl{position:absolute;top:4px;left:4px;display:flex;gap:3px;z-index:5}
          .lt-roi-type-btn{background:rgba(0,0,0,0.62);border:1px solid rgba(255,255,255,0.22);border-radius:4px;color:rgba(255,255,255,0.82);font-size:.72rem;font-weight:700;padding:3px 6px;cursor:pointer;line-height:1;transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent}
          .lt-roi-type-btn.active{background:rgba(0,180,220,0.75);border-color:#00b4dc;color:#fff}
          .lt-roi-type-btn.lt-line-active{background:rgba(220,60,60,0.75);border-color:#ff4444;color:#fff}
          .lt-roi-type-btn.lt-bw-on{background:rgba(220,220,220,0.82);border-color:#bbb;color:#111}
          .lt-cam-timer{position:absolute;bottom:24px;right:5px;background:rgba(0,0,0,.55);color:#fff;font-family:monospace;font-size:.7rem;font-weight:bold;padding:3px 7px;border-radius:4px;pointer-events:none;line-height:1.4;text-align:right;white-space:nowrap}
        `;
        document.head.appendChild(s);
    }

    function applyRoiTypeBtns() {
        const btnRect = document.getElementById('btnRoiRect');
        const btnLine = document.getElementById('btnRoiLine');
        const btnDir  = document.getElementById('btnLineDir');
        const btnBw   = document.getElementById('btnRoiBw');
        const btnSA   = document.getElementById('btnLineSideA');
        const btnSB   = document.getElementById('btnLineSideB');
        if (btnRect) btnRect.classList.toggle('active', roiType === 'rect');
        if (btnLine) btnLine.classList.toggle('lt-line-active', roiType === 'line');
        if (btnDir)  { btnDir.style.display = roiType === 'line' ? '' : 'none'; btnDir.textContent = roiLine.dir === 'vertical' ? '↕' : '↔'; }
        if (btnBw)   btnBw.classList.toggle('lt-bw-on', !!cfg.grayscale);
        const isLine = roiType === 'line';
        const isVert = roiLine.dir === 'vertical';
        if (btnSA) {
            btnSA.style.display = isLine ? '' : 'none';
            btnSA.textContent   = isVert ? '◄' : '▲';
            btnSA.title         = isVert ? 'Entrada pela esquerda' : 'Entrada por cima';
            btnSA.classList.toggle('active', isLine && (isVert ? roiLine.activeSide === 'left' : roiLine.activeSide === 'top'));
        }
        if (btnSB) {
            btnSB.style.display = isLine ? '' : 'none';
            btnSB.textContent   = isVert ? '►' : '▼';
            btnSB.title         = isVert ? 'Entrada pela direita' : 'Entrada por baixo';
            btnSB.classList.toggle('active', isLine && (isVert ? roiLine.activeSide === 'right' : roiLine.activeSide === 'bottom'));
        }
    }

    function showPreview(liveStream) {
        injectPreviewStyles();
        hidePreview();

        torchSupported = checkTorchSupport();
        torchOn        = false;
        focusSupported = checkFocusSupport();
        focusLocked    = false;

        previewVideo           = document.createElement('video');
        previewVideo.srcObject = liveStream;
        previewVideo.playsInline = true;
        previewVideo.muted     = true;
        previewVideo.autoplay  = true;

        const torchBtn = torchSupported
            ? `<button class="lt-torch-btn" id="btnLtTorch" type="button" title="Ligar lanterna">🔦 apagada</button>`
            : '';
        const focusBtn = focusSupported
            ? `<button class="lt-torch-btn" id="btnLtFocus" type="button" title="Travar foco (evita reajuste ao passar objeto)">🔓 foco</button>`
            : '';

        previewWrap = document.createElement('div');
        previewWrap.className = 'lt-preview';
        previewWrap.innerHTML = `
          <div class="lt-preview-head">
            <span class="lt-preview-title">
              <span class="lt-preview-dot"></span>Câmera ao vivo
            </span>
            <span style="display:flex;gap:5px;align-items:center">
              ${focusBtn}
              ${torchBtn}
              <button class="lt-preview-toggle" id="btnLtPreviewToggle" type="button">${previewOpen ? '▲ ocultar' : '▼ mostrar'}</button>
            </span>
          </div>
          <div class="lt-preview-body${previewOpen ? '' : ' lt-collapsed'}" id="ltPreviewBody">
            <div class="lt-vfeed" id="ltVfeed">
              <canvas class="lt-roi-overlay" id="ltRoiOverlay"></canvas>
              <div class="lt-roi-type-ctrl" id="ltRoiTypeCtrl">
                <button class="lt-roi-type-btn" id="btnRoiRect" type="button" title="Retângulo de interesse">⬚</button>
                <button class="lt-roi-type-btn" id="btnRoiLine" type="button" title="Linha de gatilho">⊟</button>
                <button class="lt-roi-type-btn" id="btnLineDir" type="button" title="Girar linha 90°" style="display:none">↕</button>
                <button class="lt-roi-type-btn" id="btnLineSideA" type="button" title="Entrada pela esquerda" style="display:none">◄</button>
                <button class="lt-roi-type-btn" id="btnLineSideB" type="button" title="Entrada pela direita" style="display:none">►</button>
                <button class="lt-roi-type-btn${(cfg.zoom||1)>1?' active':''}" id="btnRoiZoom" type="button" title="Zoom (1x → 2x → 3x)">🔍${cfg.zoom||1}x</button>
                <button class="lt-roi-type-btn" id="btnRoiBw"   type="button" title="Escala de cinza / Cor">BW</button>
              </div>
              <button class="lt-roi-reset" id="btnLtRoiReset" type="button" title="Resetar alvo">✕ alvo</button>
              <span class="lt-vfeed-label" id="ltVfeedLabel">vídeo · arraste para definir alvo</span>
              <div class="lt-cam-timer" id="ltCameraTimer"></div>
            </div>
            <div class="lt-vsample">
              <canvas class="lt-vsample-canvas" id="ltSampleCanvas" width="${SAMPLE_W}" height="${SAMPLE_H}"></canvas>
              <div class="lt-vsample-label">sensor ${SAMPLE_W}×${SAMPLE_H}</div>
            </div>
          </div>
        `;

        const anchor = sensorIndicator || btnSensor;
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(previewWrap, anchor.nextSibling);
        }

        const vfeed = document.getElementById('ltVfeed');
        vfeed.insertBefore(previewVideo, document.getElementById('ltRoiOverlay'));

        const overlay = document.getElementById('ltRoiOverlay');
        if (overlay) {
            setupRoiDrag(overlay);
            requestAnimationFrame(() => drawRoiOverlay());
        }

        // aplicar estado inicial dos botões
        applyRoiTypeBtns();

        // rect mode
        document.getElementById('btnRoiRect')?.addEventListener('click', () => {
            roiType = 'rect';
            roi = { x: 0.35, y: 0.35, w: 0.30, h: 0.30 }; // centered 30% por padrão
            applyRoiTypeBtns();
            const lbl = document.getElementById('ltVfeedLabel');
            if (lbl) lbl.textContent = 'vídeo · arraste para definir alvo';
            drawRoiOverlay();
        });

        // line mode
        document.getElementById('btnRoiLine')?.addEventListener('click', () => {
            roiType = 'line';
            roiLine = { pos: 0.5, dir: 'vertical', activeSide: 'right' };
            applyRoiTypeBtns();
            const lbl = document.getElementById('ltVfeedLabel');
            if (lbl) lbl.textContent = 'linha · arraste · toque p/ trocar lado';
            prevPixels = null; prevZone = null; prevLum = -1; changeBaseline = null;
            drawRoiOverlay();
        });

        // rotate line direction
        document.getElementById('btnLineDir')?.addEventListener('click', () => {
            if (roiLine.dir === 'vertical') {
                roiLine.dir = 'horizontal';
                roiLine.activeSide = 'bottom';
            } else {
                roiLine.dir = 'vertical';
                roiLine.activeSide = 'right';
            }
            applyRoiTypeBtns();
            drawRoiOverlay();
        });

        // orientation buttons — set active side explicitly
        document.getElementById('btnLineSideA')?.addEventListener('click', () => {
            if (roiType !== 'line') return;
            roiLine.activeSide = roiLine.dir === 'vertical' ? 'left' : 'top';
            applyRoiTypeBtns();
            drawRoiOverlay();
        });
        document.getElementById('btnLineSideB')?.addEventListener('click', () => {
            if (roiType !== 'line') return;
            roiLine.activeSide = roiLine.dir === 'vertical' ? 'right' : 'bottom';
            applyRoiTypeBtns();
            drawRoiOverlay();
        });

        // BW toggle
        document.getElementById('btnRoiBw')?.addEventListener('click', () => {
            cfg.grayscale = !cfg.grayscale;
            saveCfg();
            applyRoiTypeBtns();
        });

        // Zoom cycle: 1x → 2x → 3x → 1x
        document.getElementById('btnRoiZoom')?.addEventListener('click', () => {
            const next = ((cfg.zoom || 1) % 3) + 1;
            applyZoom(next);
        });

        // reset
        document.getElementById('btnLtRoiReset')?.addEventListener('click', () => {
            if (roiType === 'line') {
                roiLine.pos = 0.5;
            } else {
                roi = { x: 0, y: 0, w: 1, h: 1 };
            }
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
        document.getElementById('btnLtFocus')?.addEventListener('click', () => setFocusLock(!focusLocked));
    }

    function hidePreview() {
        if (torchOn) setTorch(false);
        if (previewVideo) { previewVideo.srcObject = null; previewVideo = null; }
        if (previewWrap)  { previewWrap.remove(); previewWrap = null; }
    }

    function updatePreviewCanvas() {
        if (!previewOpen) return;
        const dest = document.getElementById('ltSampleCanvas');
        if (dest && cvs) { const dCtx = dest.getContext('2d'); if (dCtx) dCtx.drawImage(cvs, 0, 0); }
        if (roiMode === 'idle' && lineMode === 'idle') drawRoiOverlay();
        const camTimer = document.getElementById('ltCameraTimer');
        if (camTimer) {
            const live = document.getElementById('liveTimer');
            const total = document.getElementById('totalTimer');
            camTimer.textContent = (live ? live.textContent : '00:00.00') + ' · ' + (total ? total.textContent : '00:00');
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
                    width:  { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30, max: 60 }
                }
            });
            video              = document.createElement('video');
            video.srcObject    = stream;
            video.playsInline  = true;
            video.muted        = true;
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
            if ((cfg.zoom || 1) > 1) applyZoom(cfg.zoom);

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
        lastLapTs   = 0;
        prevPixels  = null;
        prevZone    = null;
        digitalZoomActive = false;
        if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
        hidePreview();
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        torchOn = false; torchSupported = false;
        if (focusLocked) setFocusLock(false);
        focusLocked = false; focusSupported = false;
        roi = { x: 0, y: 0, w: 1, h: 1 }; roiMode = 'idle'; roiStart = null; roiAnchor = null; roiSnap = null;
        roiType = 'rect'; roiLine = { pos: 0.5, dir: 'vertical', activeSide: 'right' };
        lineMode = 'idle'; lineDragStart = null;
        video = cvs = ctx = null;
        prevLum = -1;
        lumHistory = [];
        changeBaseline = null;
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
        if (typeof window.renderAppControls === 'function') window.renderAppControls();
    }

    // ---------- controles de configuração ----------
    function applyFplButtons() {
        if (!btnFplMinus || !btnFplPlus) return;
        btnFplMinus.disabled = cfg.flashesPerLap <= 1;
        btnFplPlus.disabled  = cfg.flashesPerLap >= 10;
    }

    function applySensButtons() {
        const lvl = cfg.sensLevel ?? 5;
        if (sensorSensLabel) sensorSensLabel.textContent = 'Sensibilidade - ' + lvl + ' (' + (cfg.mode || 'flash') + ')';
        if (btnSensMinus) btnSensMinus.disabled = lvl <= 1;
        if (btnSensPlus)  btnSensPlus.disabled  = lvl >= 10;
    }

    function applyOutlierUI() {
        const ms = cfg.minCycleMs ?? 0;
        if (sensorOutlierInput) {
            sensorOutlierInput.value = ms > 0 ? (ms / 1000).toFixed(1) : '';
        }
        if (typeof window.renderAppControls === 'function') window.renderAppControls();
    }

    function applyModeButtons() {
        modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === cfg.mode));
        if (sensorFplLabel) {
            sensorFplLabel.textContent =
                cfg.mode === 'color'  ? 'troca/lap'  :
                cfg.mode === 'motion' ? 'evento/lap' : 'flash/lap';
        }
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
        btnSensMinus       = document.getElementById('btnSensMinus');
        btnSensPlus        = document.getElementById('btnSensPlus');
        sensorSensLabel    = document.getElementById('sensorSensLabel');
        sensorOutlierInput = document.getElementById('sensorOutlierInput');
        modeBtns           = Array.from(document.querySelectorAll('.sensor-mode-btn'));
        btnLap          = document.getElementById('btnLap');
        btnStart        = document.getElementById('btnStart');
        btnAutoStart    = document.getElementById('btnAutoStart');
        btnDiscardFirst = document.getElementById('btnDiscardFirst');
        armedLabel      = document.getElementById('sensorArmedLabel');

        if (!btnSensor) return;

        btnSensor.addEventListener('click', () => {
            if (isActive) stopSensor(); else startSensor();
        });

        btnFplMinus?.addEventListener('click', () => {
            cfg.flashesPerLap = Math.max(1, cfg.flashesPerLap - 1);
            flashCount = Math.min(flashCount, cfg.flashesPerLap - 1);
            saveCfg(); updateCountDisplay(); applyFplButtons();
        });
        btnFplPlus?.addEventListener('click', () => {
            cfg.flashesPerLap = Math.min(10, cfg.flashesPerLap + 1);
            saveCfg(); updateCountDisplay(); applyFplButtons();
        });

        btnSensMinus?.addEventListener('click', () => {
            cfg.sensLevel = Math.max(1, (cfg.sensLevel ?? 5) - 1);
            cfg.sensByMode[cfg.mode] = cfg.sensLevel;
            saveCfg(); applySensButtons();
        });
        btnSensPlus?.addEventListener('click', () => {
            cfg.sensLevel = Math.min(10, (cfg.sensLevel ?? 5) + 1);
            cfg.sensByMode[cfg.mode] = cfg.sensLevel;
            saveCfg(); applySensButtons();
        });

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                cfg.mode = btn.dataset.mode;
                const saved = cfg.sensByMode && cfg.sensByMode[cfg.mode];
                if (Number.isInteger(saved) && saved >= 1 && saved <= 10) cfg.sensLevel = saved;
                saveCfg(); applyModeButtons(); applySensButtons();
            });
        });

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

        document.addEventListener('click', e => {
            const action = e.target?.closest('[data-action]')?.dataset?.action;

            if (action === 'reset' && isActive) stopSensor();

            if (action === 'start' && !fromSensor && isActive) {
                if (cfg.autoStart && !isArmed) {
                    e.stopPropagation();
                    isArmed = true;
                    updateArmedUI();
                } else if (!cfg.autoStart && cfg.discardFirst) {
                    discardNext = true;
                }
            }
        }, true);

        function commitOutlierInput() {
            const raw = parseFloat(sensorOutlierInput?.value ?? '');
            const val = Number.isFinite(raw) && raw > 0
                ? Math.min(300, Math.max(0, Math.round(raw * 10) / 10))
                : 0;
            cfg.minCycleMs = Math.round(val * 1000);
            saveCfg(); applyOutlierUI();
        }
        sensorOutlierInput?.addEventListener('change', commitOutlierInput);
        sensorOutlierInput?.addEventListener('blur',   commitOutlierInput);

        applyFplButtons();
        applySensButtons();
        applyOutlierUI();
        applyModeButtons();
        applyOptionButtons();
        updateCountDisplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.resetSensorCount = function () { flashCount = 0; lastLapTs = 0; updateCountDisplay(); };
    window.getSensorMinMs   = function () { return cfg.minCycleMs ?? 0; };
})();
