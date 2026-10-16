// X-ray mode (Shift+X or the HUD button): draws the whole pipeline live on ONE canvas, throttled to
// ~30 fps. Camera preview enlarged bottom-left with the landmarks on it; on the page the raw point
// (red), the smoothed point (yellow), the snapped target outline (green), plus bars for speed, lock-on,
// dwell and the refractory timer, and a small panel of numbers. Nothing here changes behaviour; when
// off it costs one boolean check per frame.
import { PRESETS, MEDIAN_N } from './smoothing.js';
import { SPEED_MAX, LOCK_MS } from './interaction.js';
import { CONNECTIONS } from './hand.js';

const FRAME_MS = 1000 / 30;
const SPEED_SCALE = 1200; // px/s at the right end of the speed bar
const IRIS = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
const CORNERS = [33, 133, 362, 263];

export function createXray({ root }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'gaze-xray';
  canvas.hidden = true;
  root.appendChild(canvas);
  const c = canvas.getContext('2d');
  let on = false;
  let last = 0;
  let fpsT = 0; let fpsN = 0; let drawFps = 0;

  const size = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  window.addEventListener('resize', () => { if (on) size(); });

  const dot = (x, y, r, color) => { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const bar = (x, y, w, label, frac, color, mark, text) => {
    c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(x, y, w, 10);
    c.fillStyle = color; c.fillRect(x, y, w * Math.min(1, Math.max(0, frac)), 10);
    if (mark !== undefined) { c.fillStyle = '#fff'; c.fillRect(x + w * mark - 1, y - 3, 2, 16); }
    c.fillStyle = '#ddd'; c.font = '12px monospace'; c.textAlign = 'left';
    c.fillText(`${label} ${text}`, x, y - 5);
  };

  function drawLandmarks(dbg) {
    const v = document.querySelector('video.gaze-head-preview');
    if (!v || !dbg) return;
    const r = v.getBoundingClientRect();
    const X = (p) => r.left + (1 - p.x) * r.width; // the preview is mirrored
    const Y = (p) => r.top + p.y * r.height;
    if (dbg.lms) {
      const lm = dbg.lms;
      for (let i = 0; i < lm.length; i += 6) dot(X(lm[i]), Y(lm[i]), 1, 'rgba(255,255,255,.35)');
      for (const i of CORNERS) if (lm[i]) dot(X(lm[i]), Y(lm[i]), 2.5, '#ffb74d');
      if (lm.length >= 478) for (const i of IRIS) dot(X(lm[i]), Y(lm[i]), 2, '#4dd0e1');
      dot(X(lm[1]), Y(lm[1]), 5, '#66bb6a'); // nose tip
    }
    if (dbg.hand) {
      const h = dbg.hand;
      c.strokeStyle = '#81c784'; c.lineWidth = 2;
      for (const [a, b] of CONNECTIONS) { c.beginPath(); c.moveTo(X(h[a]), Y(h[a])); c.lineTo(X(h[b]), Y(h[b])); c.stroke(); }
      dot(X(h[8]), Y(h[8]), 5, '#ef5350');
      dot(X(h[4]), Y(h[4]), 4, '#ffee58');
    }
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.strokeRect(r.left, r.top, r.width, r.height);
    c.fillStyle = '#fff'; c.font = '12px monospace'; c.textAlign = 'left';
    c.fillText('camera + landmarks (frames stay in the browser)', r.left + 4, r.top - 6);
  }

  return {
    get on() { return on; },
    toggle(force) {
      on = force === undefined ? !on : !!force;
      canvas.hidden = !on;
      document.body.classList.toggle('xray', on);
      if (on) size(); else c.clearRect(0, 0, canvas.width, canvas.height);
      return on;
    },
    // called every animation frame; `get()` builds the state only when a frame is actually drawn
    frame(now, get) {
      if (!on || now - last < FRAME_MS) return;
      fpsN++;
      if (now - fpsT >= 1000) { drawFps = fpsN; fpsN = 0; fpsT = now; }
      last = now;
      const s = get();
      c.clearRect(0, 0, canvas.width, canvas.height);
      drawLandmarks(s.dbg);

      // snapped target (green); thick = locked on, dashed = still settling
      if (s.target) {
        const t = s.target;
        c.lineWidth = s.locked ? 5 : 2; c.strokeStyle = '#00e676'; c.setLineDash(s.locked ? [] : [8, 6]);
        c.strokeRect(t.left, t.top, t.right - t.left, t.bottom - t.top);
        c.setLineDash([]);
        c.fillStyle = '#00e676'; c.font = 'bold 14px monospace'; c.textAlign = 'left';
        c.fillText(s.fast ? 'snap frozen (fast)' : s.locked ? 'LOCKED' : 'locking…', t.left + 6, t.top + 18);
      }
      // raw (red) per source -> smoothed (yellow)
      for (const k of Object.keys(s.raw)) {
        const raw = s.raw[k]; const sm = s.smooth[k] || raw;
        if (!raw) continue;
        c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(raw.x, raw.y); c.lineTo(sm.x, sm.y); c.stroke();
        dot(raw.x, raw.y, 5, '#ff1744');
      }
      if (s.point.x >= 0) {
        dot(s.point.x, s.point.y, 7, '#ffeb3b');
        c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(s.point.x, s.point.y, 7, 0, 7); c.stroke();
      }

      // panel
      const x = 12; let y = 14;
      c.fillStyle = 'rgba(8,10,16,.82)'; c.fillRect(x - 6, y - 6, 372, 292);
      c.font = 'bold 13px monospace'; c.fillStyle = '#fff'; c.textAlign = 'left';
      c.fillText('X-RAY  (Shift+X to close)', x, y + 8);
      c.font = '11px monospace'; c.fillStyle = '#9fb3c8';
      c.fillText('camera > landmarks > features > regression > median+OneEuro+deadzone', x, y + 24);
      c.fillText('> snap+hysteresis > lock-on+speed gate > dwell/blink/pinch > refractory', x, y + 37);
      c.fillStyle = '#ff1744'; c.fillText('● raw', x, y + 54);
      c.fillStyle = '#ffeb3b'; c.fillText('● smoothed', x + 60, y + 54);
      c.fillStyle = '#00e676'; c.fillText('□ snapped target', x + 160, y + 54);
      y += 74;
      bar(x, y, 340, 'speed', s.speed / SPEED_SCALE, s.fast ? '#ff9100' : '#4fc3f7', SPEED_MAX / SPEED_SCALE, `${Math.round(s.speed)} px/s (gate ${SPEED_MAX})`);
      y += 30;
      bar(x, y, 340, 'lock-on', s.heldMs / LOCK_MS, s.locked ? '#00e676' : '#8d99ae', undefined, s.locked ? 'locked' : `${Math.round(Math.min(s.heldMs, LOCK_MS))}/${LOCK_MS} ms stable+slow`);
      y += 30;
      bar(x, y, 340, 'dwell', s.progress, '#ab47bc', undefined, `${Math.round(s.progress * 100)}% of ${(s.dwellMs / 1000).toFixed(1)} s`);
      y += 30;
      bar(x, y, 340, 'refractory', s.coolLeft / s.refractoryMs, '#ef5350', undefined, s.coolLeft > 0 ? `${Math.round(s.coolLeft)} ms left` : 'ready');
      y += 22;
      c.fillStyle = '#e0e0e0'; c.font = '12px monospace';
      for (const line of s.lines(drawFps)) { c.fillText(line, x, y += 16); }
    },
    // numbers for the panel that need no per-frame work
    params(presetKey, gain) {
      const p = PRESETS[presetKey];
      return p ? `One Euro minCut ${p.minCutoff} beta ${p.beta}, deadzone ${p.deadZone}px, median ${p.median ?? MEDIAN_N}, gain ${gain.toFixed(2)}` : 'no smoothing preset';
    },
  };
}
