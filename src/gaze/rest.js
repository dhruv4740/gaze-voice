// Rest mode (the Midas-touch fix): while resting, dwell and blink selection are off everywhere
// except the big Wake target and elements marked data-gaze-always (emergency). The screen is
// dimmed. Enter: manual only, from the HUD Pause button or Shift+P. Leave: dwell on Wake for 2 s, a double long blink,
// a heard question ('aac:heard'), or selecting an always-on element. Dispatches
// window 'gaze:rest' { resting }.
const WAKE_DWELL_MS = 2000;
const DOUBLE_BLINK_MS = 2500;
const POST_WAKE_QUIET_MS = 800; // eyes are still up at the Wake target: don't dwell on tiles yet

export function createRest({ root, onChange }) {
  let resting = false;
  let quietUntil = 0;
  let lastLongBlink = -Infinity;
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
    }
    window.dispatchEvent(new CustomEvent('gaze:rest', { detail: { resting: next } }));
    onChange?.(next);
  }

  wake.addEventListener('gaze-select', () => set(false));
  wake.addEventListener('click', () => set(false));
  // choosing an always-on element (emergency) also brings the app back
  window.addEventListener('gaze-select', (e) => { if (resting && allowed(e.target) && e.target !== wake) set(false); });

  window.addEventListener('aac:heard', () => set(false)); // a heard question wakes a manual rest

  return {
    get resting() { return resting; },
    get quiet() { return performance.now() < quietUntil; },
    set,
    toggle: () => set(!resting),
    allowed,
    wakeEl: wake,
    // elements that may be targeted right now
    filterRects(rects) { return resting ? rects.filter((r) => allowed(r.el)) : rects; },
    // a deliberate long blink; two within 2.5 s while resting wake the app
    longBlink(now) {
      if (!resting) return false;
      if (now - lastLongBlink < DOUBLE_BLINK_MS) { lastLongBlink = -Infinity; set(false); } else lastLongBlink = now;
      return true; // swallowed
    },
  };
}
