// Team A (Opus + Sonnet) owns everything in src/gaze/.
// Modes: mouse (placeholder), eyes (WebGazer). Contract: docs/CONTRACT.md.
import './gaze.css';
import { createPointSmoother, PRESETS } from './smoothing.js';
import { createTargeter, createDwell } from './select.js';
import { createBlinkDetector } from './blink.js';
import { createStats } from './stats.js';
import { createFatigue } from './fatigue.js';
import { startCaregiverLink } from '../caregiver/patient.js';

const DEFAULT_DWELL_MS = 1200;

export function startGaze({ mode = 'mouse', root }) {
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
  for (const m of ['mouse', 'eyes', 'iris', 'head']) sw.add(new Option(m, m, false, m === mode));
  sw.onchange = () => { params.set('mode', sw.value); location.search = params.toString(); };
  ui.appendChild(sw);

  const stats = createStats({ root });
  const fatigue = createFatigue();
  window.__gazeFatigue = fatigue; // demo: __gazeFatigue.force('mild')
  setInterval(() => stats.update(fatigue.stats()), 1000);
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
  if (mode === 'head' || mode === 'iris') ui.appendChild(blinkLabel);
  let blinkTarget = null; // what was hovered when the eyes closed
  const blink = createBlinkDetector({
    onChange: (closed) => {
      cursor.classList.toggle('closed', closed);
      if (closed) blinkTarget = dwell.el;
    },
    onLongBlink: () => {
      const el = dwell.el || (blinkTarget && blinkTarget.isConnected ? blinkTarget : null);
      if (el && blinkBox.checked) { dwell.select(); selectNow(el); }
    },
  });

  let point = { x: -1, y: -1 };
  let calibrating = false;
  const setPoint = (x, y) => { point = { x, y }; };
  const smoother = createPointSmoother(PRESETS[mode] || PRESETS.head);
  // raw tracker samples go through One Euro + dead zone; (-1,-1) means "no face"
  const setRaw = (x, y) => {
    if (x < 0) { smoother.reset(); setPoint(-1, -1); return; }
    const p = smoother.filter(x, y, performance.now());
    setPoint(p.x, p.y);
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

  if (mode === 'eyes' || mode === 'head' || mode === 'iris') {
    showStatus('starting camera…');
    // dynamic imports keep the TensorFlow / MediaPipe bundles out of mouse mode
    const load = mode === 'eyes'
      ? import('./eyes.js').then((m) => m.createEyesTracker)
      : mode === 'iris'
        ? import('./iris.js').then((m) => m.createIrisTracker)
        : import('./head.js').then((m) => m.createHeadTracker);
    const calibOpts = mode === 'eyes' ? {} : { clicksPerDot: 3 };
    load.then((createTracker) => {
      const tracker = createTracker({
        onPoint: setRaw,
        onBlink: (l, r, t) => { fatigue.blink(l, r); if (blinkBox.checked) blink.update(l, r, t); },
        onStatus: (s) => {
          showStatus(s, s === 'tracking' ? 'ok' : 'bad');
          // no face: park the pointer off-screen so dwell can't fire on a frozen point
          if (s === 'face lost') setRaw(-1, -1);
        },
      });
      return tracker.start().then(() => {
        learner = tracker.learn ? tracker.learn.bind(tracker) : null;
        const recal = document.createElement('button');
        recal.id = 'gaze-recal';
        recal.textContent = 'Recalibrate';
        ui.appendChild(recal);
        const calibrate = async () => {
          calibrating = true;
          const { runCalibration, HEAD_POINTS } = await import('./calibration.js');
          const opts = mode === 'head' ? { points: HEAD_POINTS, ...calibOpts } : calibOpts;
          opts.label = mode;
          await runCalibration({ root, tracker, getPoint: () => point, ...opts });
          calibrating = false;
        };
        recal.onclick = async () => { if (calibrating) return; await tracker.reset(); calibrate(); };
        return calibrate();
      });
    }).catch((err) => {
      console.warn('camera mode failed, falling back to mouse:', err);
      calibrating = false;
      mode = 'mouse';
      showStatus(`${err.message}: using mouse`, 'bad');
    });
  } else if (mode !== 'mouse') {
    console.warn(`gaze mode "${mode}" not built yet, using mouse`);
    mode = 'mouse';
  }

  const targeter = createTargeter();
  const dwell = createDwell();
  let hovered = null;
  let hoverEl = null;
  let hoverStart = 0;

  // Fire the contract's selection on el. The user must look away and back to select again.
  function selectNow(el) {
    // every confirmed selection is a calibration sample + one point on the accuracy sparkline
    if (!calibrating && !(mode === 'mouse' && !jitter) && point.x >= 0 && !el.hasAttribute('data-no-learn')) {
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

    let target = null;
    let rects = [];
    const plainMouse = mode === 'mouse' && !jitter; // exact hit-testing, no snapping
    if (!calibrating) {
      if (plainMouse) {
        const hit = document.elementFromPoint(point.x, point.y);
        target = hit && hit.closest('[data-gaze-target]');
      } else {
        rects = collectRects();
        target = targeter.update(point, rects, now);
      }
    }

    const r = dwell.update(target, now, (el) => (el.dataset.gazeDwell ? Number(el.dataset.gazeDwell) : 1200 * fatigue.dwellScale));
    if (r.el !== hoverEl) { hoverEl = r.el; hoverStart = now; }
    if (hovered && hovered !== r.el) { hovered.classList.remove('gaze-hover'); hovered.style.setProperty('--dwell', 0); hovered = null; }
    if (r.el) {
      hovered = r.el;
      r.el.classList.add('gaze-hover');
      r.el.style.setProperty('--dwell', r.progress);
    }
    if (r.fired) { fatigue.selected(now - hoverStart); selectNow(r.fired); }

    // cursor: centre of the snapped target for camera modes, else the pointer itself
    const c = !plainMouse && target ? targeter.center(target, rects) : null;
    const shown = c || point;
    cursor.style.left = `${shown.x}px`;
    cursor.style.top = `${shown.y}px`;
    rawDot.style.left = `${point.x}px`;
    rawDot.style.top = `${point.y}px`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
