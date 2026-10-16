// 3x3 click calibration + 3 s accuracy check. WebGazer learns from each click at the
// dot's centre while the user looks at it.
const CLICKS_PER_DOT = 5;
const CHECK_MS = 3000;
const SETTLE_MS = 500;
const MARGIN = 0.08;
const AXIS = [MARGIN, 0.5, 1 - MARGIN];

export function dotPositions() {
  const pts = [];
  for (const fy of AXIS) for (const fx of AXIS) pts.push({ fx, fy });
  return pts;
}

// Resolves { meanError } once the user accepts the result.
export function runCalibration({ root, tracker, getPoint, points = dotPositions(), clicksPerDot = CLICKS_PER_DOT }) {
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

    function showDot() {
      place(points[i]);
      dot.textContent = clicksPerDot - clicks;
      msg.textContent = `Look at the dot and click it (${i + 1}/${points.length})`;
    }

    dot.addEventListener('click', () => {
      const r = dot.getBoundingClientRect();
      tracker.record(r.left + r.width / 2, r.top + r.height / 2);
      dot.classList.remove('calib-pulse'); void dot.offsetWidth; dot.classList.add('calib-pulse');
      if (++clicks < clicksPerDot) { dot.textContent = clicksPerDot - clicks; return; }
      clicks = 0;
      if (++i < points.length) showDot(); else accuracyCheck();
    });

    function accuracyCheck() {
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
      msg.append(h, v, again, done);
      again.onclick = async () => { await tracker.reset(); overlay.remove(); resolve(runCalibration({ root, tracker, getPoint, points, clicksPerDot })); };
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
