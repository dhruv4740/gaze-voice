// Rest mode (the Midas-touch fix): while resting, dwell and blink selection are off everywhere
// except the big Wake target and elements marked data-gaze-always (emergency). The screen is
// dimmed. Enter: after a reply is spoken, after N s without a selection, when the face is lost
// for 2 s, from the HUD button or Shift+P. Leave: dwell on Wake for 2 s, a double long blink,
// a heard question ('aac:heard'), or selecting an always-on element. Dispatches
// window 'gaze:rest' { resting }.
const WAKE_DWELL_MS = 2000;
const SPOKEN_REST_DELAY_MS = 1000;
const FACE_LOST_REST_MS = 2000;
const DOUBLE_BLINK_MS = 2500;
const POST_WAKE_QUIET_MS = 800; // eyes are still up at the Wake target: don't dwell on tiles yet

export function createRest({ root, idleMs = 20000, auto = true, onChange }) {
  let resting = false;
  let lastActive = performance.now();
  let quietUntil = 0;
  let faceLostSince = null;
  let lastLongBlink = -Infinity;
  let spokenTimer = 0;
  const raised = []; // [el, previous inline position, z-index] for always-on elements lifted above the dim

  const overlay = document.createElement('div');
  overlay.id = 'gaze-rest';
  overlay.hidden = true;
  const wake = document.createElement('button');
  wake.id = 'gaze-wake';
  wake.setAttribute('data-gaze-target', '');
  wake.setAttribute('data-gaze-dwell', String(WAKE_DWELL_MS));
  wake.setAttribute('data-no-learn', '');
  wake.setAttribute('data-no-stats', '');
  wake.innerHTML = 'Wake<span>look here for 2 seconds</span>';
  const note = document.createElement('div');
  note.className = 'rest-note';
  note.textContent = 'Resting';
  overlay.append(wake, note);
  root.appendChild(overlay);

  const alwaysEls = () => [...document.querySelectorAll('[data-gaze-always]')];
  // a selectable element in rest: Wake, or anything flagged data-gaze-always
  const allowed = (el) => !!el && (el === wake || el.hasAttribute('data-gaze-always'));

  function set(next) {
    if (next === resting) return;
    resting = next;
    overlay.hidden = !next;
    document.body.classList.toggle('gaze-resting', next);
    if (next) {
      for (const el of alwaysEls()) { // lift above the dim without moving it
        raised.push([el, el.style.position, el.style.zIndex]);
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.zIndex = '1060';
      }
    } else {
      for (const [el, pos, z] of raised) { el.style.position = pos; el.style.zIndex = z; }
      raised.length = 0;
      quietUntil = performance.now() + POST_WAKE_QUIET_MS;
      lastActive = performance.now();
      faceLostSince = null;
    }
    window.dispatchEvent(new CustomEvent('gaze:rest', { detail: { resting: next } }));
    onChange?.(next);
  }

  wake.addEventListener('gaze-select', () => set(false));
  wake.addEventListener('click', () => set(false));
  // choosing an always-on element (emergency) also brings the app back
  window.addEventListener('gaze-select', (e) => { if (resting && allowed(e.target) && e.target !== wake) set(false); });

  // reply spoken -> rest ~1 s after the speech actually ends
  window.addEventListener('aac:spoken', () => {
    if (!auto) return;
    clearTimeout(spokenTimer);
    const wait = () => {
      if (window.speechSynthesis?.speaking) { spokenTimer = setTimeout(wait, 250); return; }
      spokenTimer = setTimeout(() => set(true), SPOKEN_REST_DELAY_MS);
    };
    spokenTimer = setTimeout(wait, 250);
  });
  window.addEventListener('aac:heard', () => { clearTimeout(spokenTimer); set(false); });
  // any selection or click counts as activity
  const touch = () => { lastActive = performance.now(); };
  window.addEventListener('gaze-select', touch);
  window.addEventListener('click', touch);

  return {
    get resting() { return resting; },
    get quiet() { return performance.now() < quietUntil; },
    set,
    toggle: () => set(!resting),
    allowed,
    wakeEl: wake,
    // elements that may be targeted right now
    filterRects(rects) { return resting ? rects.filter((r) => allowed(r.el)) : rects; },
    // call every frame; `faceMissing` = camera mode with no face/hand for the moment
    tick(now, { calibrating, faceMissing }) {
      if (!auto || resting) return;
      if (calibrating) { lastActive = now; faceLostSince = null; return; }
      if (faceMissing) {
        if (faceLostSince === null) faceLostSince = now;
        else if (now - faceLostSince > FACE_LOST_REST_MS) set(true);
      } else faceLostSince = null;
      if (now - lastActive > idleMs) set(true);
    },
    // a deliberate long blink; two within 2.5 s while resting wake the app
    longBlink(now) {
      if (!resting) return false;
      if (now - lastLongBlink < DOUBLE_BLINK_MS) { lastLongBlink = -Infinity; set(false); } else lastLongBlink = now;
      return true; // swallowed
    },
  };
}
