// Team A (Opus + Sonnet) owns everything in src/gaze/.
// Modes: mouse (placeholder), eyes (WebGazer). Contract: docs/CONTRACT.md.
import './gaze.css';

const DEFAULT_DWELL_MS = 1200;

export function startGaze({ mode = 'mouse', root }) {
  const cursor = document.createElement('div');
  cursor.id = 'gaze-cursor';
  root.appendChild(cursor);

  const statusEl = document.createElement('div');
  statusEl.id = 'gaze-status';
  root.appendChild(statusEl);
  const showStatus = (text, cls = '') => { statusEl.textContent = text; statusEl.className = cls; };

  let point = { x: -1, y: -1 };
  let calibrating = false;
  const setPoint = (x, y) => { point = { x, y }; };

  window.addEventListener('mousemove', (e) => {
    if (mode === 'mouse') setPoint(e.clientX, e.clientY);
  });

  if (mode === 'eyes') {
    showStatus('starting camera…');
    // dynamic import keeps the TensorFlow bundle out of mouse mode
    import('./eyes.js').then(({ createEyesTracker }) => {
      const tracker = createEyesTracker({
        onPoint: setPoint,
        onStatus: (s) => {
          showStatus(s, s === 'tracking' ? 'ok' : 'bad');
          // no face: park the pointer off-screen so dwell can't fire on a frozen point
          if (s === 'face lost') setPoint(-1, -1);
        },
      });
      return tracker.start().then(() => {
        const recal = document.createElement('button');
        recal.id = 'gaze-recal';
        recal.textContent = 'Recalibrate';
        root.appendChild(recal);
        const calibrate = async () => {
          calibrating = true;
          const { runCalibration } = await import('./calibration.js');
          await runCalibration({ root, tracker, getPoint: () => point });
          calibrating = false;
        };
        recal.onclick = async () => { if (calibrating) return; await tracker.reset(); calibrate(); };
        return calibrate();
      });
    }).catch((err) => {
      console.warn('eyes mode failed, falling back to mouse:', err);
      mode = 'mouse';
      showStatus(`${err.message}: using mouse`, 'bad');
    });
  } else if (mode !== 'mouse') {
    console.warn(`gaze mode "${mode}" not built yet, using mouse`);
    mode = 'mouse';
  }

  let current = null;
  let dwellStart = 0;

  function tick(now) {
    cursor.style.left = `${point.x}px`;
    cursor.style.top = `${point.y}px`;
    window.dispatchEvent(new CustomEvent('gaze:point', { detail: point }));

    const hit = calibrating ? null : document.elementFromPoint(point.x, point.y);
    const target = hit && hit.closest('[data-gaze-target]');

    if (target !== current) {
      if (current) { current.classList.remove('gaze-hover'); current.style.setProperty('--dwell', 0); }
      current = target;
      dwellStart = now;
      if (current) current.classList.add('gaze-hover');
    } else if (current) {
      const dwellMs = Number(current.dataset.gazeDwell) || DEFAULT_DWELL_MS;
      const progress = Math.min((now - dwellStart) / dwellMs, 1);
      current.style.setProperty('--dwell', progress);
      if (progress >= 1) {
        current.dispatchEvent(new CustomEvent('gaze-select', { bubbles: true }));
        current.classList.remove('gaze-hover');
        current.style.setProperty('--dwell', 0);
        current = null; // must look away and back to select again
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
