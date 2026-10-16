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
  const errs = []; // pointer offset (px) at each selection: raw point vs target centre
  let fatigue = null; // latest fatigue snapshot, set via update()

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

  // accuracy over time: lower is better, so a falling line means the model is learning
  function sparkline() {
    if (errs.length < 2) return '';
    const W = 180; const H = 36;
    const max = Math.max(...errs, 1);
    const pts = errs.map((e, i) => `${(i / (errs.length - 1) * W).toFixed(1)},${(H - (e / max) * (H - 4) - 2).toFixed(1)}`).join(' ');
    const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    const k = Math.min(5, errs.length >> 1);
    return `<div>Pointer error per selection: ${avg(errs.slice(0, k))} → ${avg(errs.slice(-k))} px</div>`
      + `<svg width="${W}" height="${H}"><polyline points="${pts}" fill="none" stroke="#4fc3f7" stroke-width="2"/></svg>`;
  }

  function fatigueHtml() {
    if (!fatigue) return '';
    const f = fatigue;
    const parts = [];
    if (f.blinkRate != null) parts.push(`blinks ${f.blinkRate}/min${f.baseline ? ` (baseline ${f.baseline.toFixed(0)})` : ''}`);
    if (f.tts != null) parts.push(`time to select ${(f.tts / 1000).toFixed(1)} s${f.tts0 ? ` (start ${(f.tts0 / 1000).toFixed(1)})` : ''}`);
    return `<div>Fatigue: ${f.level}${parts.length ? ` · ${parts.join(' · ')}` : ''}</div>`;
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
      + `<div>Words/min via gaze: ${wpm}</div>${err ? `<div>Calibration error: ${err}</div>` : ''}`
      + sparkline() + fatigueHtml();
  }

  return {
    reset() { selections = 0; gapSum = 0; gaps = 0; words = 0; errs.length = 0; firstAt = null; lastAt = performance.now(); fatigue = null; },
    addError(px) { errs.push(px); if (errs.length > 40) errs.shift(); },
    update(f) { fatigue = f; },
    get visible() { return !box.hidden; },
    toggle(on = box.hidden) {
      box.hidden = !on;
      clearInterval(timer);
      if (on) { render(); timer = setInterval(render, 500); }
    },
  };
}
