// Night mode: a patient alone in a dark room, where webcam tracking fails.
//  1. darkness detection: mean luminance of a tiny downscaled copy of the camera frame, ~1/s.
//  2. screen light: a thick warm-white border lights the face; offered by a banner (auto-accepts).
//  3. fallback: still no tracking after FALLBACK_MS in night mode -> single-switch scanning
//     (Space / any key / click) over the tiles, Emergency first. Returns when light returns.
// Frames never leave the browser; the 32x24 canvas is read and discarded.
export const DARK_LUM = 40; // 0..255 mean; below this for DARK_MS = dark
export const BRIGHT_LUM = 70; // above this = enough light (hysteresis)
export const DARK_MS = 3000;
export const ACCEPT_MS = 5000;
export const FALLBACK_MS = 8000;
const SCAN_STEP_MS = 1500;

export function createNight({ root, lost, select, status, forceDark }) {
  // lost(): tracking has no pointer right now. select(el): fire gaze-select on a tile.
  const c = document.createElement('canvas'); c.width = 32; c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  let lum = null; let darkSince = 0; let brightSince = 0; let on = false; let scanning = false;
  let nightAt = 0; let lostSince = 0; let bannerTimer = 0; let scanTimer = 0; let lit = null; let idx = 0; let last = 0;
  let litNoted = false; let override = forceDark ? 10 : null;

  const frame = document.createElement('div'); frame.id = 'gaze-night-frame'; frame.hidden = true; root.appendChild(frame);
  const banner = document.createElement('button');
  banner.id = 'gaze-night-banner'; banner.hidden = true; banner.setAttribute('data-gaze-target', ''); banner.setAttribute('data-gaze-dwell', '1200');
  banner.textContent = 'It is dark. Night mode: light the screen so the camera can see you'; root.appendChild(banner);
  const hint = document.createElement('div'); hint.id = 'gaze-night-hint'; hint.hidden = true;
  hint.textContent = 'Too dark to track: tap any button to choose'; root.appendChild(hint);
  const btn = document.createElement('button'); btn.id = 'gaze-night-btn'; btn.textContent = 'Night'; btn.onclick = () => toggle();
  document.getElementById('gaze-ui')?.appendChild(btn);

  const hideBanner = () => { banner.hidden = true; clearTimeout(bannerTimer); bannerTimer = 0; };
  function showBanner() {
    if (!banner.hidden || on) return;
    banner.hidden = false;
    bannerTimer = setTimeout(() => toggle(true), ACCEPT_MS);
  }
  banner.addEventListener('gaze-select', () => toggle(true));
  banner.addEventListener('click', () => toggle(true));

  function toggle(force) {
    on = force === undefined ? !on : !!force;
    hideBanner();
    document.body.classList.toggle('night', on);
    frame.hidden = !on; btn.classList.toggle('on', on);
    nightAt = performance.now(); lostSince = 0;
    if (!on) stopScan();
    status(on ? 'night mode: screen lights your face' : 'night mode off', on ? 'ok' : '');
    return on;
  }

  // ---- scan fallback ----
  const tiles = () => [...document.querySelectorAll('[data-gaze-target]')].filter((el) => {
    if (el === banner || el.closest('#gaze-ui, #gaze-picker') || el.hidden) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }).sort((a, b) => (b.hasAttribute('data-gaze-always') ? 1 : 0) - (a.hasAttribute('data-gaze-always') ? 1 : 0));
  const unlit = () => { lit?.classList.remove('gaze-night-lit'); lit = null; };
  function step() {
    unlit();
    const list = tiles(); if (!list.length) return;
    idx = (idx + 1) % list.length; lit = list[idx]; lit.classList.add('gaze-night-lit');
  }
  const pick = (e) => {
    if (!scanning || !lit || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.type === 'keydown' && (e.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))) return;
    if (e.type === 'click' && e.target.closest?.('#gaze-ui, #gaze-night-banner, [data-gaze-target]')) return; // a real click on a tile already works
    const el = lit; unlit(); select(el); idx = -1; e.preventDefault?.();
  };
  window.addEventListener('keydown', pick); window.addEventListener('click', pick);
  function startScan() {
    if (scanning) return; scanning = true; idx = -1; hint.hidden = false; step();
    scanTimer = setInterval(step, SCAN_STEP_MS);
    document.body.classList.add('night-scan');
  }
  function stopScan() {
    if (!scanning) return; scanning = false; clearInterval(scanTimer); unlit(); hint.hidden = true;
    document.body.classList.remove('night-scan');
  }

  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable) { toggle(); e.preventDefault(); }
  });

  function sample() {
    if (override !== null) return override;
    const v = document.querySelector('video.gaze-head-preview');
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    ctx.drawImage(v, 0, 0, 32, 24);
    const d = ctx.getImageData(0, 0, 32, 24).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }

  return {
    get on() { return on; }, get scanning() { return scanning; }, get lum() { return lum; }, toggle,
    setLum(v) { override = v; },
    // call every animation frame; does work about once a second
    tick(now) {
      if (now - last < 1000) return; last = now;
      lum = sample();
      if (lum === null) return;
      const isLost = lost();
      if (lum < DARK_LUM) { brightSince = 0; darkSince ||= now; } else if (lum > BRIGHT_LUM) { darkSince = 0; brightSince ||= now; }
      const dark = darkSince && (now - darkSince >= DARK_MS || (isLost && lum < DARK_LUM));
      if (dark && !on && banner.hidden) showBanner();
      if (on && lum > BRIGHT_LUM && !litNoted) { litNoted = true; status('bright enough: tracking resumes', 'ok'); }
      if (lum < DARK_LUM) litNoted = false;
      if (lum > BRIGHT_LUM) { // light returned: leave the fallback, say so, hide a stale banner
        if (scanning) { stopScan(); status('light is back: tracking resumed', 'ok'); }
        hideBanner();
      }
      if (on) {
        if (isLost) lostSince ||= now; else { lostSince = 0; if (scanning) { stopScan(); status('tracking resumed', 'ok'); } }
        if (lostSince && now - lostSince >= FALLBACK_MS && lum < BRIGHT_LUM && !scanning) startScan();
      }
    },
  };
}
