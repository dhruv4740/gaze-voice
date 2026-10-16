// Hands-free calibration: each dot records automatically while the user looks at it
// (settle, then sample), then advances. Clicking a dot is a caregiver shortcut that records
// immediately. Ends with a 3 s accuracy check.
const CLICKS_PER_DOT = 5;
const CHECK_MS = 3000;
const SETTLE_MS = 500;
const DOT_SETTLE_MS = 600; // let the eyes land on a new dot before sampling
const DOT_SAMPLE_MS = 1200;
const SAMPLE_EVERY_MS = 200;
const MARGIN = 0.08;
const AXIS = [MARGIN, 0.5, 1 - MARGIN];

export function dotPositions() {
  const pts = [];
  for (const fy of AXIS) for (const fx of AXIS) pts.push({ fx, fy });
  return pts;
}

// Resolves { meanError } once the user accepts the result.
export function runCalibration({ root, tracker, getPoint, points = dotPositions(), clicksPerDot = CLICKS_PER_DOT, label = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'gaze-calib';
    root.appendChild(overlay);

    const msg = document.createElement('div');
    msg.className = 'calib-msg';
    overlay.appendChild(msg);

    const dot = document.createElement('button');
    dot.className = 'calib-dot';
    overlay.appendChild(dot);

    const place = (p) => { dot.style.left = `${p.fx * 100}%`; dot.style.top = `${p.fy * 100}%`; };
    const center = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    let i = 0;
    let clicks = 0;
    let timers = [];
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    const dotCenter = () => {
      const r = dot.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };

    function showDot() {
      clearTimers();
      clicks = 0;
      place(points[i]);
      dot.textContent = '';
      msg.textContent = `Look at the dot (${i + 1}/${points.length}). A helper can also click it.`;
      // restart the shrinking-ring animation that shows the dot is being read
      dot.style.setProperty('--ring-ms', `${DOT_SETTLE_MS + DOT_SAMPLE_MS}ms`);
      dot.classList.remove('calib-auto'); void dot.offsetWidth; dot.classList.add('calib-auto');
      for (let t = DOT_SETTLE_MS; t < DOT_SETTLE_MS + DOT_SAMPLE_MS; t += SAMPLE_EVERY_MS) {
        timers.push(setTimeout(() => tracker.record(...dotCenter()), t));
      }
      timers.push(setTimeout(next, DOT_SETTLE_MS + DOT_SAMPLE_MS));
    }

    function next() {
      clearTimers();
      if (++i < points.length) showDot(); else accuracyCheck();
    }

    dot.addEventListener('click', () => {
      tracker.record(...dotCenter());
      dot.classList.remove('calib-pulse'); void dot.offsetWidth; dot.classList.add('calib-pulse');
      if (++clicks >= clicksPerDot) next();
    });

    function accuracyCheck() {
      clearTimers();
      tracker.fit?.();
      dot.disabled = true;
      dot.textContent = '';
      place({ fx: 0.5, fy: 0.5 });
      msg.textContent = 'Hold your gaze on the centre dot…';
      const start = performance.now();
      let sum = 0; let n = 0;
      (function sample(now) {
        const t = now - start;
        const p = getPoint();
        if (t > SETTLE_MS && p.x >= 0) {
          const c = center();
          sum += Math.hypot(p.x - c.x, p.y - c.y); n++;
        }
        if (t < CHECK_MS) { requestAnimationFrame(sample); return; }
        finish(n ? Math.round(sum / n) : null);
      })(start);
    }

    function finish(meanError) {
      dot.style.display = 'none';
      const verdict = meanError === null ? 'No gaze detected: check lighting and face position.'
        : meanError < 100 ? 'Good: tiles will be easy to hit.'
        : meanError < 200 ? 'OK: usable with large tiles.'
        : 'Poor: recalibrate, face the light, keep your head still.';
      msg.innerHTML = '';
      const h = document.createElement('div');
      h.textContent = meanError === null ? 'Accuracy: no data' : `Mean error: ${meanError} px`;
      h.className = 'calib-result';
      const v = document.createElement('div');
      v.textContent = verdict;
      const again = document.createElement('button');
      again.textContent = 'Recalibrate';
      const done = document.createElement('button');
      done.textContent = 'Done';
      const cmp = document.createElement('div');
      cmp.className = 'calib-cmp';
      if (label && meanError !== null) {
        // keep the last result per mode so eyes (WebGazer) vs iris (own model) can be compared
        let all = {};
        try { all = JSON.parse(localStorage.getItem('gaze-errors') || '{}'); } catch { /* ignore */ }
        all[label] = meanError;
        try { localStorage.setItem('gaze-errors', JSON.stringify(all)); } catch { /* ignore */ }
        cmp.textContent = Object.entries(all).map(([k, e]) => `${k}: ${e}px`).join(' | ');
      }
      msg.append(h, v, cmp, again, done);
      again.onclick = async () => { clearTimers(); await tracker.reset(); overlay.remove(); resolve(runCalibration({ root, tracker, getPoint, points, clicksPerDot, label })); };
      done.onclick = () => { overlay.remove(); resolve({ meanError }); };
    }

    showDot();
  });
}

// Centre first, then the four corners.
export const HEAD_POINTS = [
  { fx: 0.5, fy: 0.5 }, { fx: 0.1, fy: 0.12 }, { fx: 0.9, fy: 0.12 },
  { fx: 0.9, fy: 0.88 }, { fx: 0.1, fy: 0.88 },
];
