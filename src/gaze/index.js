// Team A (Opus + Sonnet) owns everything in src/gaze/.
// Placeholder: mouse-driven pointer so Team B can build against the contract now.
// Eye (WebGazer / MediaPipe) and head modes replace getPoint() below.

const DEFAULT_DWELL_MS = 1200;

export function startGaze({ mode = 'mouse', root }) {
  const cursor = document.createElement('div');
  cursor.id = 'gaze-cursor';
  root.appendChild(cursor);

  let point = { x: -1, y: -1 };
  if (mode !== 'mouse') console.warn(`gaze mode "${mode}" not built yet, using mouse`);
  window.addEventListener('mousemove', (e) => { point = { x: e.clientX, y: e.clientY }; });

  let current = null;
  let dwellStart = 0;

  function tick(now) {
    cursor.style.left = `${point.x}px`;
    cursor.style.top = `${point.y}px`;
    window.dispatchEvent(new CustomEvent('gaze:point', { detail: point }));

    const hit = document.elementFromPoint(point.x, point.y);
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
