// Demo stats overlay: selections, mean time-to-select and words/minute spoken via gaze.
// Everything comes from `gaze-select` events and from speechSynthesis.speak() calls
// (wrapped here, so it works with whatever Team B uses to talk).
const IDLE_CAP_MS = 60000; // gaps longer than this are breaks, not selection time

export function createStats({ root }) {
  const box = document.createElement('div');
  box.id = 'gaze-stats';
  box.hidden = true;
  root.appendChild(box);

  let selections = 0;
  let gapSum = 0;
  let gaps = 0;
  let words = 0;
  let lastAt = performance.now();
  let firstAt = null;
  let timer = null;

  window.addEventListener('gaze-select', () => {
    const now = performance.now();
    if (firstAt === null) firstAt = now;
    if (now - lastAt < IDLE_CAP_MS) { gapSum += now - lastAt; gaps++; }
    lastAt = now;
    selections++;
  });

  if (window.speechSynthesis && !window.speechSynthesis.__gazeStats) {
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      words += (u && u.text ? u.text.trim().split(/\s+/).filter(Boolean).length : 0);
      return orig(u);
    };
    window.speechSynthesis.__gazeStats = true;
  }

  function render() {
    const mean = gaps ? (gapSum / gaps / 1000).toFixed(1) : '–';
    const mins = firstAt === null ? 0 : (performance.now() - firstAt) / 60000;
    const wpm = mins > 0.05 ? (words / mins).toFixed(1) : '–';
    let err = '';
    try {
      const all = JSON.parse(localStorage.getItem('gaze-errors') || '{}');
      err = Object.entries(all).map(([k, e]) => `${k} ${e}px`).join(' · ');
    } catch { /* ignore */ }
    box.innerHTML = `<b>Gaze stats</b><div>Selections: ${selections}</div>`
      + `<div>Mean time to select: ${mean} s</div><div>Words spoken: ${words}</div>`
      + `<div>Words/min via gaze: ${wpm}</div>${err ? `<div>Calibration error: ${err}</div>` : ''}`;
  }

  return {
    get visible() { return !box.hidden; },
    toggle(on = box.hidden) {
      box.hidden = !on;
      clearInterval(timer);
      if (on) { render(); timer = setInterval(render, 500); }
    },
  };
}
