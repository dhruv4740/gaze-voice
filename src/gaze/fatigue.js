// Fatigue watch: blink rate per minute (from blendshapes, head/iris modes) against the
// user's own early baseline, plus selections getting slower. Dispatches
// window 'gaze:fatigue' { level: 'mild' | 'high' } and drives a gentle "Take a break?" tile.
const BASELINE_MS = 90000; // first 90 s of tracking = this user's normal blink rate
const RATE_WINDOW_MS = 60000;
const EVAL_EVERY_MS = 5000;
const MIN_BASELINE_BLINKS = 5;
const SNOOZE_MS = 300000;
const TILE_MS = 90000;
const ORDER = { none: 0, mild: 1, high: 2 };

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Pure decision, exported for tests. Blink rate +50% over baseline or selections 1.5x
// slower than at the start = mild; double = high.
export function evaluate({ baseline, rate, times }) {
  let level = 'none';
  const up = (l) => { if (ORDER[l] > ORDER[level]) level = l; };
  if (baseline && rate != null) {
    if (rate >= baseline * 2) up('high');
    else if (rate >= baseline * 1.5) up('mild');
  }
  if (times.length >= 10) {
    const ratio = mean(times.slice(-5)) / mean(times.slice(0, 5));
    if (ratio >= 2) up('high');
    else if (ratio >= 1.5) up('mild');
  }
  return level;
}

export function createFatigue({ root, onChange }) {
  const t0 = performance.now();
  const blinks = []; // timestamps (ms)
  const times = []; // time-to-select per selection (ms), capped
  let baseline = null;
  let closed = false;
  let level = 'none';
  let snoozeUntil = 0;
  let tileTimer = 0;

  const tile = document.createElement('div');
  tile.id = 'gaze-break';
  tile.dataset.gazeTarget = '';
  tile.hidden = true;
  tile.innerHTML = '<b>Take a break?</b><span>Look here to dismiss</span>';
  root.appendChild(tile);
  const hideTile = () => { tile.hidden = true; clearTimeout(tileTimer); };
  tile.addEventListener('gaze-select', (e) => {
    e.stopPropagation();
    snoozeUntil = performance.now() + SNOOZE_MS;
    set('none');
  });

  function set(next) {
    if (next === level) return;
    level = next;
    if (next === 'none') hideTile();
    else if (performance.now() >= snoozeUntil) {
      tile.hidden = false;
      clearTimeout(tileTimer);
      tileTimer = setTimeout(hideTile, TILE_MS);
      window.dispatchEvent(new CustomEvent('gaze:fatigue', { detail: { level: next } }));
    }
    onChange?.(next);
  }

  const rate = (now) => {
    if (now - t0 < RATE_WINDOW_MS) return null;
    return blinks.filter((b) => now - b <= RATE_WINDOW_MS).length;
  };

  setInterval(() => {
    const now = performance.now();
    if (!baseline && now - t0 >= BASELINE_MS && blinks.length >= MIN_BASELINE_BLINKS) {
      baseline = blinks.length / ((now - t0) / 60000);
    }
    set(evaluate({ baseline, rate: rate(now), times }));
  }, EVAL_EVERY_MS);

  return {
    // eye-closure scores each camera frame; counts a blink on each close edge
    blink(l, r) {
      const v = (l + r) / 2;
      if (!closed && v > 0.5) { closed = true; if (!baseline) blinks.push(performance.now()); }
      else if (closed && v < 0.3) closed = false;
    },
    // keep the first 5 as the 'start of session' baseline
    selected(ms) { times.push(ms); if (times.length > 200) times.splice(5, 1); },
    force(l) { snoozeUntil = 0; level = 'none'; set(l); },
    get level() { return level; },
    // longer dwell when tired (only for targets that use the default dwell)
    get dwellScale() { return level === 'high' ? 1.5 : level === 'mild' ? 1.25 : 1; },
    stats() {
      const now = performance.now();
      const r = rate(now);
      const recent = times.slice(-5);
      return {
        blinkRate: r, baseline, level,
        tts: recent.length ? mean(recent) : null,
        tts0: times.length >= 5 ? mean(times.slice(0, 5)) : null,
      };
    },
  };
}
