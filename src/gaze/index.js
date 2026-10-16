// Team A (Opus + Sonnet) owns everything in src/gaze/.
// Modes: mouse (placeholder), eyes (WebGazer). Contract: docs/CONTRACT.md.
import './gaze.css';
import { createPointSmoother, PRESETS } from './smoothing.js';
import { createTargeter, createDwell } from './select.js';
import { createBlinkDetector } from './blink.js';
import { createStats } from './stats.js';
import { createFatigue } from './fatigue.js';
import { createRest } from './rest.js';
import { createScanner, DEFAULT_STEP_MS } from './scan.js';
import { pickInput, savedInput, forgetInput } from './picker.js';
import { startCaregiverLink } from '../caregiver/patient.js';

const DEFAULT_DWELL_MS = 1200;

// No mode given: use the saved input choice, or ask with the input picker.
export function startGaze({ mode, root }) {
  if (mode) return run(mode, root);
  const saved = savedInput();
  if (saved) return run(saved, root);
  return pickInput(root).then((m) => run(m, root));
}

function run(mode, root) {
  // combined input: 'head+hand' / 'iris+hand' (any order); anything else with a '+' falls back to head
  let parts = String(mode).split('+');
  if (parts.length > 1) {
    const face = parts.find((p) => p === 'head' || p === 'iris');
    if (parts.length === 2 && parts.includes('hand') && face) mode = `${face}+hand`;
    else mode = 'head';
    parts = mode.split('+');
  }
  const isCombo = parts.length > 1;
  const faceMode = isCombo ? parts.find((p) => p !== 'hand') : mode;
  const cursor = document.createElement('div');
  cursor.id = 'gaze-cursor';
  root.appendChild(cursor);
  // faint dot at the smoothed (unsnapped) gaze point
  const rawDot = document.createElement('div');
  rawDot.id = 'gaze-raw';
  root.appendChild(rawDot);

  // corner control stack: status, mode switcher, recalibrate, blink toggle, stats toggle
  const ui = document.createElement('div');
  ui.id = 'gaze-ui';
  root.appendChild(ui);
  const statusEl = document.createElement('div');
  statusEl.id = 'gaze-status';
  ui.appendChild(statusEl);
  const showStatus = (text, cls = '') => { statusEl.textContent = text; statusEl.className = cls; };

  const params = new URLSearchParams(location.search);
  const sw = document.createElement('select');
  sw.id = 'gaze-mode';
  for (const m of ['mouse', 'eyes', 'iris', 'head', 'hand', 'head+hand', 'scan']) sw.add(new Option(m, m, false, m === mode));
  sw.onchange = () => { params.set('mode', sw.value); location.search = params.toString(); };
  ui.appendChild(sw);
  const changeBtn = document.createElement('button');
  changeBtn.id = 'gaze-change-input';
  changeBtn.textContent = 'Change input';
  changeBtn.onclick = () => { forgetInput(); params.delete('mode'); location.search = params.toString(); };
  ui.appendChild(changeBtn);
  if (mode === 'scan') document.body.classList.add('gaze-scan');

  const stats = createStats({ root });
  const fatigue = createFatigue();
  const restBtn = document.createElement('button');
  restBtn.id = 'gaze-rest-btn';
  const rest = createRest({
    root,
    idleMs: (Number(params.get('restafter')) || 20) * 1000,
    auto: params.get('rest') !== '0',
    onChange: (r) => { stats.setPaused(r); restBtn.textContent = r ? 'Wake' : 'Rest'; },
  });
  restBtn.textContent = 'Rest';
  restBtn.onclick = () => rest.toggle();
  ui.appendChild(restBtn);
  window.__gazeFatigue = fatigue; // demo: __gazeFatigue.force('mild')
  setInterval(() => stats.update(fatigue.stats()), 1000);
  const pageStart = performance.now();
  let resetLearning = null; // camera tracker's resetLearning(), keeps the calibration
  let quickRecal = null;
  let learner = null; // camera tracker's learn(x, y), set once tracking starts
  startCaregiverLink({ ui });
  const statsBtn = document.createElement('button');
  statsBtn.textContent = 'Stats';
  statsBtn.onclick = () => stats.toggle();
  ui.appendChild(statsBtn);

  // blink-to-select needs face blendshapes: head and iris modes only
  const blinkLabel = document.createElement('label');
  blinkLabel.id = 'gaze-blink';
  const blinkBox = document.createElement('input');
  blinkBox.type = 'checkbox';
  blinkBox.checked = localStorage.getItem('gaze-blink') !== '0';
  blinkBox.onchange = () => localStorage.setItem('gaze-blink', blinkBox.checked ? '1' : '0');
  blinkLabel.append(blinkBox, ' blink select');
  if (mode === 'head' || mode === 'iris' || mode === 'scan' || isCombo) ui.appendChild(blinkLabel);
  let blinkTarget = null; // what was hovered when the eyes closed
  const blink = createBlinkDetector({
    onChange: (closed) => {
      cursor.classList.toggle('closed', closed);
      if (closed) blinkTarget = dwell.el;
    },
    onLongBlink: () => {
      if (mode === 'scan') { if (blinkBox.checked) scanSelect(); return; } // blink is the scan switch
      if (rest.longBlink(performance.now())) return; // resting: two long blinks wake, nothing else
      const el = dwell.el || (blinkTarget && blinkTarget.isConnected ? blinkTarget : null);
      if (el && blinkBox.checked) { dwell.select(); selectNow(el); }
    },
  });

  // ---- scan mode: row-column scanning driven by one switch (long blink, Space/Enter, click) ----
  const scanner = createScanner({ stepMs: Number(localStorage.getItem('gaze-scan-ms')) || DEFAULT_STEP_MS });
  let scanLit = []; // elements currently highlighted by the scan
  let lastScanPick = performance.now();
  const clearScan = () => {
    for (const el of scanLit) { el.classList.remove('gaze-hover', 'gaze-scan-row'); el.style.setProperty('--dwell', 0); }
    scanLit = [];
  };
  if (mode === 'scan') {
    const stepLabel = document.createElement('label');
    stepLabel.id = 'gaze-step-label';
    const stepSlider = document.createElement('input');
    stepSlider.type = 'range'; stepSlider.min = '600'; stepSlider.max = '3000'; stepSlider.step = '100';
    stepSlider.value = String(Number(localStorage.getItem('gaze-scan-ms')) || DEFAULT_STEP_MS);
    const stepText = document.createElement('span');
    const setStep = (ms) => { scanner.setStep(ms); stepText.textContent = ` step ${(ms / 1000).toFixed(1)}s`; localStorage.setItem('gaze-scan-ms', String(ms)); };
    stepSlider.oninput = () => setStep(Number(stepSlider.value));
    stepLabel.append(stepSlider, stepText);
    setStep(Number(stepSlider.value));
    ui.appendChild(stepLabel);
  }
  const isTypingTarget = (t) => /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable;
  function scanSelect() {
    const el = scanner.select(performance.now());
    if (el && el.isConnected) { fatigue.selected(performance.now() - lastScanPick); lastScanPick = performance.now(); clearScan(); selectNow(el); }
  }
  if (mode === 'scan') {
    // any USB switch shows up as Space/Enter or a click; clicks are swallowed so a tile under
    // the pointer is not also activated directly (Team B listens to click as well as gaze-select)
    window.addEventListener('keydown', (e) => {
      if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || e.shiftKey || isTypingTarget(e.target)) return;
      e.preventDefault(); e.stopPropagation(); scanSelect();
    }, true);
    window.addEventListener('click', (e) => {
      if (e.target.closest?.('#gaze-ui, #gaze-picker, [data-scan-ignore]') || isTypingTarget(e.target)) return;
      e.preventDefault(); e.stopPropagation(); scanSelect();
    }, true);
  }

  let point = { x: -1, y: -1 };
  let calibrating = false;
  let everTracked = false;
  const setPoint = (x, y) => { point = { x, y }; if (x >= 0) everTracked = true; };
  const faceSm = createPointSmoother(PRESETS[faceMode] || PRESETS.head);
  const handSm = createPointSmoother(PRESETS.hand);
  // raw tracker samples go through One Euro + dead zone; (-1,-1) means "no face"
  // sensitivity (0.5-2.0) scales the pointer's distance from the screen centre, so lower = a
  // bigger head/eye movement per screen distance. Persisted. Not applied to mouse or hand.
  let gain = Math.min(2, Math.max(0.5, Number(localStorage.getItem('gaze-gain')) || 1));
  const gainOn = mode === 'head' || mode === 'iris' || mode === 'eyes' || isCombo; // face points only
  const gainBox = document.createElement('label');
  gainBox.id = 'gaze-gain-label';
  const gainSlider = document.createElement('input');
  gainSlider.type = 'range'; gainSlider.id = 'gaze-gain'; gainSlider.min = '0.5'; gainSlider.max = '2'; gainSlider.step = '0.05';
  gainSlider.value = String(gain);
  const gainText = document.createElement('span');
  const setGain = (g) => {
    gain = Math.min(2, Math.max(0.5, Math.round(g * 20) / 20));
    gainSlider.value = String(gain);
    gainText.textContent = ` sens ${gain.toFixed(2)}`;
    localStorage.setItem('gaze-gain', String(gain));
  };
  gainSlider.oninput = () => setGain(Number(gainSlider.value));
  gainBox.append(gainSlider, gainText);
  setGain(gain);
  if (gainOn) ui.appendChild(gainBox);
  // Pointer sources. Each is smoothed on its own; the hand wins while it is visible (a ~120 ms
  // crossfade), otherwise the face. Single modes just have one source.
  const src = { face: null, hand: null };
  let handT = 0; let blendW = 0; let blendT = performance.now();
  const HAND_HOLD_MS = 500;
  const handLead = () => mode === 'hand' || (isCombo && blendW > 0.5);
  const merge = () => {
    const now = performance.now();
    const target = src.hand && now - handT < HAND_HOLD_MS ? 1 : 0;
    blendW += (target - blendW) * Math.min(1, (now - blendT) / 120);
    blendT = now;
    const f = src.face; const h = src.hand;
    if (!f && !h) setPoint(-1, -1);
    else if (!h) setPoint(f.x, f.y);
    else if (!f) setPoint(h.x, h.y);
    else setPoint(f.x + (h.x - f.x) * blendW, f.y + (h.y - f.y) * blendW);
  };
  const setRaw = (x, y, from) => {
    const s = mode === 'hand' || from === 'hand' ? 'hand' : 'face';
    const sm = s === 'hand' ? handSm : faceSm;
    if (x < 0) { sm.reset(); src[s] = null; merge(); return; }
    if (s === 'face' && gainOn && gain !== 1) {
      const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
      x = Math.min(window.innerWidth, Math.max(0, cx + (x - cx) * gain));
      y = Math.min(window.innerHeight, Math.max(0, cy + (y - cy) * gain));
    }
    const p = sm.filter(x, y, performance.now());
    src[s] = { x: p.x, y: p.y };
    if (s === 'hand') handT = performance.now();
    merge();
  };

  // ?jitter=1 (mouse mode): fake a noisy camera tracker (gaussian noise + outlier jumps)
  // through the real smoothing + snapping path, to test that targets hold.
  const jitter = params.get('jitter') === '1';
  let mouse = { x: -1, y: -1 };
  window.addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    if (mode === 'mouse' && !jitter) setPoint(mouse.x, mouse.y);
  });
  if (jitter && mode === 'mouse') {
    const g = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    setInterval(() => {
      if (mouse.x < 0) return;
      const out = Math.random() < 0.05;
      setRaw(mouse.x + g() * 50 + (out ? (Math.random() - 0.5) * 500 : 0),
        mouse.y + g() * 50 + (out ? (Math.random() - 0.5) * 500 : 0));
    }, 33);
  }

  if (mode === 'scan') {
    showStatus('scan: Space / Enter / click / long blink');
    import('./head.js').then((m) => m.createBlinkTracker({
      onPoint: () => {},
      onBlink: (l, r, t) => { if (!rest.resting) fatigue.blink(l, r); if (blinkBox.checked) blink.update(l, r, t); },
      onStatus: () => {},
    }).start()).then(() => showStatus('scan: blink, Space, Enter or click', 'ok'))
      .catch(() => showStatus('no camera: use Space, Enter or click', 'bad'));
  } else if (mode === 'eyes' || mode === 'head' || mode === 'iris' || mode === 'hand' || isCombo) {
    showStatus('starting camera…');
    // dynamic imports keep the TensorFlow / MediaPipe bundles out of mouse mode
    const load = isCombo
      ? import('./combo.js').then((m) => (o) => m.createComboTracker({ ...o, face: faceMode }))
      : mode === 'eyes'
      ? import('./eyes.js').then((m) => m.createEyesTracker)
      : mode === 'iris'
        ? import('./iris.js').then((m) => m.createIrisTracker)
        : mode === 'hand'
          ? import('./hand.js').then((m) => m.createHandTracker)
          : import('./head.js').then((m) => m.createHeadTracker);
    const st = { face: '', hand: '' };
    const calibOpts = mode === 'eyes' ? {} : { clicksPerDot: 3 };
    load.then((createTracker) => {
      const tracker = createTracker({
        onPoint: setRaw,
        onPinch: () => { const el = dwell.el; if (el) { dwell.select(); selectNow(el); } }, // hand mode: pinch = instant select
        onBlink: (l, r, t) => { if (!rest.resting) fatigue.blink(l, r); if (blinkBox.checked) blink.update(l, r, t); },
        onStatus: (s, from) => {
          if (isCombo) {
            st[from] = s;
            const live = [st.face === 'tracking' && faceMode, st.hand === 'tracking' && 'hand'].filter(Boolean);
            showStatus(live.length ? `tracking: ${live.join(' + ')}` : s, live.length ? 'ok' : 'bad');
            if (/ lost$/.test(s)) setRaw(-1, -1, from);
            return;
          }
          showStatus(s, s === 'tracking' ? 'ok' : 'bad');
          // no face: park the pointer off-screen so dwell can't fire on a frozen point
          if (/ lost$/.test(s)) setRaw(-1, -1);
        },
      });
      return tracker.start().then(() => {
        const ready = Math.round(performance.now() - pageStart);
        console.info(`[gaze] camera + model ready ${ready} ms after page load`);
        window.__gazeReadyMs = ready;
        resetLearning = tracker.resetLearning ? tracker.resetLearning.bind(tracker) : null;
        learner = tracker.learn ? tracker.learn.bind(tracker) : null;
        if (mode === 'hand') return null; // hand mode needs no calibration
        const recal = document.createElement('button');
        recal.id = 'gaze-recal';
        recal.textContent = 'Recalibrate';
        ui.appendChild(recal);
        const calibrate = async () => {
          calibrating = true;
          const { runCalibration, HEAD_POINTS } = await import('./calibration.js');
          const opts = faceMode === 'head' ? { points: HEAD_POINTS, ...calibOpts } : { ...calibOpts };
          opts.label = faceMode;
          await runCalibration({ root, tracker, getPoint: () => point, ...opts });
          calibrating = false;
        };
        recal.onclick = async () => { if (calibrating) return; await tracker.reset(); calibrate(); };
        quickRecal = () => recal.click();
        return calibrate();
      });
    }).catch((err) => {
      console.warn('camera mode failed, falling back to mouse:', err);
      calibrating = false;
      mode = 'mouse';
      showStatus(`${err.message}: using mouse. Allow the camera, then reload`, 'bad');
    });
  } else if (mode !== 'mouse') {
    console.warn(`gaze mode "${mode}" not built yet, using mouse`);
    mode = 'mouse';
  }

  // caregiver shortcuts: Shift+R demo reset, Shift+C recalibrate, Shift+H clean projector view
  window.addEventListener('keydown', (e) => {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === '{' || e.key === '}' || e.code === 'BracketLeft' || e.code === 'BracketRight') {
      if (gainOn) { setGain(gain + (e.code === 'BracketRight' || e.key === '}' ? 0.1 : -0.1)); showStatus(`sensitivity ${gain.toFixed(2)}`, 'ok'); e.preventDefault(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'p') { rest.toggle(); e.preventDefault(); return; }
    if (k === 'r') {
      stats.reset(); fatigue.reset(); if (resetLearning) resetLearning();
      showStatus('demo reset', 'ok');
    } else if (k === 'c') { if (quickRecal) quickRecal(); }
    else if (k === 'h') document.body.classList.toggle('gaze-clean');
    else return;
    e.preventDefault();
  });

  // combined input: Space / Enter selects the hovered tile too (a helper's switch, or a free hand)
  if (isCombo) {
    window.addEventListener('keydown', (e) => {
      if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || e.shiftKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName)) return;
      const el = dwell.el;
      if (el && el.isConnected && !rest.resting) { e.preventDefault(); dwell.select(); selectNow(el); }
    }, true);
  }

  const targeter = createTargeter();
  const dwell = createDwell();
  let hovered = null;
  let hoverEl = null;
  let hoverStart = 0;

  // Fire the contract's selection on el. The user must look away and back to select again.
  function selectNow(el) {
    // every confirmed selection is a calibration sample + one point on the accuracy sparkline
    if (!calibrating && !rest.resting && !(mode === 'mouse' && !jitter) && !handLead() && point.x >= 0 && !el.hasAttribute('data-no-learn')) {
      const b = el.getBoundingClientRect();
      const cx = (b.left + b.right) / 2; const cy = (b.top + b.bottom) / 2;
      stats.addError(Math.hypot(point.x - cx, point.y - cy));
      if (learner) learner(cx, cy);
    }
    el.dispatchEvent(new CustomEvent('gaze-select', { bubbles: true }));
    el.classList.remove('gaze-hover');
    el.style.setProperty('--dwell', 0);
    if (hovered === el) hovered = null;
  }

  function collectRects() {
    const rects = [];
    for (const el of document.querySelectorAll('[data-gaze-target]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push({ el, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return rects;
  }

  function tick(now) {
    window.dispatchEvent(new CustomEvent('gaze:point', { detail: point }));

    if (mode === 'scan') {
      if (rest.quiet) { clearScan(); requestAnimationFrame(tick); return; }
      const lit = scanner.update(now, rest.filterRects(collectRects()));
      const keep = new Set(lit ? lit.els : []);
      for (const el of scanLit) if (!keep.has(el)) { el.classList.remove('gaze-hover', 'gaze-scan-row'); el.style.setProperty('--dwell', 0); }
      scanLit = [];
      if (lit) {
        for (const el of lit.els) {
          el.classList.add('gaze-hover');
          el.classList.toggle('gaze-scan-row', lit.kind === 'row');
          el.style.setProperty('--dwell', lit.progress);
          scanLit.push(el);
        }
        if (lit.kind === 'item') lit.els[0].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      requestAnimationFrame(tick);
      return;
    }

    let target = null;
    let rects = [];
    const plainMouse = mode === 'mouse' && !jitter; // exact hit-testing, no snapping
    if (!calibrating) {
      if (plainMouse) {
        const hit = document.elementFromPoint(point.x, point.y);
        target = hit && hit.closest('[data-gaze-target]');
        if (rest.resting && !rest.allowed(target)) target = null;
      } else {
        rects = rest.filterRects(collectRects());
        target = targeter.update(point, rects, now);
      }
    }

    if (rest.quiet) target = null;
    rest.tick(now, { calibrating, faceMissing: mode !== 'mouse' && everTracked && point.x < 0 });
    const r = dwell.update(target, now, (el) => (el.dataset.gazeDwell ? Number(el.dataset.gazeDwell) : 1200 * fatigue.dwellScale));
    if (r.el !== hoverEl) { hoverEl = r.el; hoverStart = now; }
    if (hovered && hovered !== r.el) { hovered.classList.remove('gaze-hover'); hovered.style.setProperty('--dwell', 0); hovered = null; }
    if (r.el) {
      hovered = r.el;
      r.el.classList.add('gaze-hover');
      r.el.style.setProperty('--dwell', r.progress);
    }
    if (r.fired) { if (!rest.resting) fatigue.selected(now - hoverStart); selectNow(r.fired); }

    // cursor: centre of the snapped target for camera modes, else the pointer itself
    const c = !plainMouse && target ? targeter.center(target, rects) : null;
    const shown = c && !handLead() ? c : point; // the hand's cursor follows the raw pointer; snapping still picks the target
    cursor.style.left = `${shown.x}px`;
    cursor.style.top = `${shown.y}px`;
    rawDot.style.left = `${point.x}px`;
    rawDot.style.top = `${point.y}px`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
