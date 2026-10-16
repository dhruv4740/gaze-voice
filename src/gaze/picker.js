// Start-screen input picker: two checkbox groups (Pointer, Select by), a scan switch and Start.
// A caregiver sets it up with the mouse or Tab + Space; the choice is remembered in localStorage.
import { parseMode, parseSelect, defaultSelect, selectorBlocked, configProblem } from './inputs.js';

const KEY = 'gaze-input';
const SEL_KEY = 'gaze-select';
const POINTER_OPTS = [
  { id: 'head', label: 'Head (nose)', sub: 'Turn your head' },
  { id: 'iris', label: 'Eyes (iris)', sub: 'Move your eyes' },
  { id: 'hand', label: 'Hand (fingertip)', sub: 'Point with a finger' },
  { id: 'mouse', label: 'Mouse / touch', sub: 'Caregiver or touch' },
];
const SELECT_OPTS = [
  { id: 'dwell', label: 'Dwell', sub: 'Hold the pointer on a tile' },
  { id: 'blink', label: 'Long blink', sub: 'Close both eyes briefly' },
  { id: 'pinch', label: 'Pinch', sub: 'Thumb and finger together' },
  { id: 'key', label: 'Switch / Space', sub: 'Space, Enter or any switch' },
];

export const savedInput = () => {
  const cfg = parseMode(localStorage.getItem(KEY));
  return cfg ? { mode: cfg.mode, select: parseSelect(localStorage.getItem(SEL_KEY), cfg).join('+') } : null;
};
export const saveInput = (mode, select) => { localStorage.setItem(KEY, mode); localStorage.setItem(SEL_KEY, select); };
export const forgetInput = () => { localStorage.removeItem(KEY); localStorage.removeItem(SEL_KEY); };

// initial: { mode, select } to pre-tick (the saved or current choice); resolves { mode, select }.
export function pickInput(root, initial) {
  return new Promise((resolve) => {
    const start = parseMode(initial?.mode) || parseMode('head');
    const startSel = new Set(parseSelect(initial?.select, start));
    const box = document.createElement('div');
    box.id = 'gaze-picker';
    box.innerHTML = '<h1>How will you use it?</h1>';
    const groups = document.createElement('div');
    groups.className = 'picker-groups';
    box.appendChild(groups);

    const inputs = {}; const notes = {}; const rows = {};
    const makeGroup = (title, opts, on) => {
      const g = document.createElement('fieldset');
      g.innerHTML = `<legend>${title}</legend>`;
      for (const o of opts) {
        const row = document.createElement('label');
        row.className = 'picker-opt';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = o.id; cb.checked = on(o.id);
        const text = document.createElement('span');
        text.innerHTML = `<b>${o.label}</b><small>${o.sub}</small>`;
        const note = document.createElement('em');
        row.append(cb, text, note);
        g.appendChild(row);
        inputs[o.id] = cb; notes[o.id] = note; rows[o.id] = row;
      }
      groups.appendChild(g);
    };
    makeGroup('Pointer (choose any)', POINTER_OPTS, (id) => start.parts.includes(id));
    makeGroup('Select by (choose any)', SELECT_OPTS, (id) => startSel.has(id));

    const scanRow = document.createElement('label');
    scanRow.className = 'picker-opt picker-scan';
    const scanCb = document.createElement('input');
    scanCb.type = 'checkbox'; scanCb.value = 'scan'; scanCb.checked = start.scan;
    const scanText = document.createElement('span');
    scanText.innerHTML = '<b>Blink-only scanning</b><small>No pointer: rows light up in turn; blink or press a switch</small>';
    scanRow.append(scanCb, scanText);
    box.appendChild(scanRow);

    const startBtn = document.createElement('button');
    startBtn.id = 'gaze-picker-start';
    startBtn.textContent = 'Start';
    const problem = document.createElement('p');
    problem.className = 'picker-problem';
    const hint = document.createElement('p');
    hint.textContent = 'A helper can set this up. Tab to move, Space to tick, then Start.';
    box.append(startBtn, problem, hint);

    const selected = () => SELECT_OPTS.filter((o) => inputs[o.id].checked).map((o) => o.id);
    const config = () => (scanCb.checked ? parseMode('scan') : parseMode(POINTER_OPTS.filter((o) => inputs[o.id].checked).map((o) => o.id).join('+')));
    function refresh() {
      const scan = scanCb.checked;
      for (const o of POINTER_OPTS) {
        inputs[o.id].disabled = scan;
        notes[o.id].textContent = scan ? 'Not used while scanning' : '';
        rows[o.id].classList.toggle('off', scan);
      }
      const cfg = config();
      for (const o of SELECT_OPTS) {
        const why = cfg ? selectorBlocked(o.id, cfg) : (o.id === 'dwell' || o.id === 'key' ? null : 'Choose a pointer first');
        inputs[o.id].disabled = !!why;
        if (why) inputs[o.id].checked = false;
        notes[o.id].textContent = why || '';
        rows[o.id].classList.toggle('off', !!why);
      }
      const why = configProblem(cfg, selected());
      startBtn.disabled = !!why;
      problem.textContent = why || '';
    }
    for (const o of POINTER_OPTS) {
      inputs[o.id].addEventListener('change', () => {
        // head and iris both come from the face: one at a time (the latest tick wins)
        if (inputs[o.id].checked && o.id === 'head') inputs.iris.checked = false;
        if (inputs[o.id].checked && o.id === 'iris') inputs.head.checked = false;
        const cfg = config();
        // a selector this pointer makes possible (blink, pinch) is ticked for convenience
        if (cfg && inputs[o.id].checked) {
          if (o.id === 'hand') inputs.pinch.checked = true;
          if (o.id === 'head' || o.id === 'iris') inputs.blink.checked = true;
        }
        if (cfg && !selected().length) inputs.dwell.checked = true;
        refresh();
      });
    }
    scanCb.addEventListener('change', () => {
      if (scanCb.checked) { inputs.blink.checked = true; inputs.key.checked = true; } else inputs.dwell.checked = true;
      refresh();
    });
    for (const o of SELECT_OPTS) inputs[o.id].addEventListener('change', refresh);

    startBtn.onclick = () => {
      const cfg = config();
      if (!cfg || configProblem(cfg, selected())) return;
      const select = selected().join('+');
      saveInput(cfg.mode, select);
      box.remove();
      resolve({ mode: cfg.mode, select });
    };
    root.appendChild(box);
    refresh();
    startBtn.focus();
  });
}
