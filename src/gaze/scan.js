// Row-column scanning for users who can only blink or press one switch. Pure logic (no DOM)
// so it can be simulated in node. Rows = targets whose tops are within ROW_TOL px; the scan
// highlights each row in turn, a select enters it, then highlights its items one by one, and a
// second select fires the item. A row with one item fires on the first select.
export const ROW_TOL = 40;
export const DEFAULT_STEP_MS = 1200;
const ITEM_PASSES = 2; // full passes over a row's items before returning to the rows
const DEBOUNCE_MS = 300; // ignore a second signal this soon after the last (switch bounce, long blinks)
const AFTER_SELECT_MS = 1500; // pause on the first row after a pick

// rects: [{ el, left, top, right, bottom }] -> [[rect, ...] left to right, ...] top to bottom
export function groupRows(rects) {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const rows = [];
  let rowTop = -Infinity;
  for (const r of sorted) {
    if (!rows.length || r.top - rowTop > ROW_TOL) { rows.push([r]); rowTop = r.top; } else rows[rows.length - 1].push(r);
  }
  for (const row of rows) row.sort((a, b) => a.left - b.left);
  return rows;
}

export function createScanner({ stepMs = DEFAULT_STEP_MS } = {}) {
  let level = 'rows';
  let rowIdx = 0;
  let itemIdx = 0;
  let passes = 0;
  let stepStart = null;
  let lastSelect = -Infinity;
  let step = stepMs;
  let rows = [];

  const advance = (now) => {
    stepStart = now;
    if (level === 'rows') rowIdx = (rowIdx + 1) % rows.length;
    else if (++itemIdx >= rows[rowIdx].length) {
      itemIdx = 0;
      if (++passes >= ITEM_PASSES) { level = 'rows'; passes = 0; rowIdx = (rowIdx + 1) % rows.length; }
    }
  };

  return {
    setStep(ms) { step = ms; },
    get level() { return level; },
    // Advance the scan to time `now`. Returns { kind: 'row'|'item', els: [...], progress } or null.
    update(now, rects) {
      rows = groupRows(rects);
      if (!rows.length) { stepStart = null; return null; }
      if (rowIdx >= rows.length) { rowIdx = 0; level = 'rows'; }
      if (level === 'items' && itemIdx >= rows[rowIdx].length) { level = 'rows'; itemIdx = 0; }
      if (stepStart === null) stepStart = now;
      if (now - stepStart >= step) advance(now);
      const row = rows[rowIdx];
      const progress = Math.max(0, Math.min((now - stepStart) / step, 1));
      return level === 'rows'
        ? { kind: 'row', els: row.map((r) => r.el), progress }
        : { kind: 'item', els: [row[itemIdx].el], row: row.map((r) => r.el), progress };
    },
    // The select signal. Returns the element to fire, or null (entered a row / ignored).
    select(now) {
      if (!rows.length || now - lastSelect < DEBOUNCE_MS) return null;
      lastSelect = now;
      const row = rows[Math.min(rowIdx, rows.length - 1)];
      if (level === 'rows') {
        if (row.length === 1) return this.pick(now, row[0].el);
        level = 'items'; itemIdx = 0; passes = 0; stepStart = now;
        return null;
      }
      return this.pick(now, row[Math.min(itemIdx, row.length - 1)].el);
    },
    pick(now, el) {
      level = 'rows'; rowIdx = 0; itemIdx = 0; passes = 0; stepStart = now + AFTER_SELECT_MS - step;
      return el;
    },
  };
}
