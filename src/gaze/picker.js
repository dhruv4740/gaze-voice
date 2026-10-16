// First-load input picker: "How can you move?" Big tiles, chosen with the mouse, Tab/arrows
// plus Space/Enter, or the number keys. The choice is remembered in localStorage.
const KEY = 'gaze-input';
const CHOICES = [
  { mode: 'head', title: 'Eyes / head', sub: 'Turn your head or move your eyes' },
  { mode: 'hand', title: 'Hand', sub: 'Move a finger, pinch to select' },
  { mode: 'scan', title: 'Blink only', sub: 'Blink or press one switch' },
  { mode: 'mouse', title: 'Mouse / caregiver', sub: 'Click or touch' },
];
export const VALID = CHOICES.map((c) => c.mode);

export const savedInput = () => { const m = localStorage.getItem(KEY); return VALID.includes(m) ? m : null; };
export const saveInput = (m) => localStorage.setItem(KEY, m);
export const forgetInput = () => localStorage.removeItem(KEY);

export function pickInput(root) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'gaze-picker';
    box.innerHTML = '<h1>How can you move?</h1>';
    const grid = document.createElement('div');
    grid.className = 'picker-grid';
    box.appendChild(grid);
    const done = (m) => { saveInput(m); box.remove(); window.removeEventListener('keydown', onKey, true); resolve(m); };
    const btns = CHOICES.map((c, i) => {
      const b = document.createElement('button');
      b.dataset.mode = c.mode;
      b.innerHTML = `<b>${i + 1}. ${c.title}</b><span>${c.sub}</span>`;
      b.onclick = () => done(c.mode);
      grid.appendChild(b);
      return b;
    });
    const hint = document.createElement('p');
    hint.textContent = 'A helper can choose for you. Tab or arrows to move, Space to choose.';
    box.appendChild(hint);
    root.appendChild(box);
    btns[0].focus();
    function onKey(e) {
      const i = btns.indexOf(document.activeElement);
      if (e.key >= '1' && e.key <= String(btns.length)) { done(CHOICES[Number(e.key) - 1].mode); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { btns[(i + 1) % btns.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { btns[(i + btns.length - 1) % btns.length].focus(); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey, true);
  });
}
