// Pure input-configuration rules (no DOM): which pointers and selectors can be combined.
// URL form: ?mode=head+hand&select=dwell+blink+pinch   ('+' joins; order does not matter)
//   pointers : head, iris (both from the face: iris wins if both), hand, mouse; eyes (WebGazer) is URL-only, alone
//   scan     : exclusive row-column scanning, selected by blink and/or the switch key
//   selectors: dwell, blink (long blink), pinch (needs hand), key (Space / Enter switch)
export const SELECTORS = ['dwell', 'blink', 'pinch', 'key'];
const KNOWN = ['head', 'iris', 'eyes', 'hand', 'mouse', 'scan'];

// "head+hand" -> { mode: 'head+hand', parts: ['head','hand'], scan, face, hand, mouse, eyes, cam } or null
export function parseMode(str) {
  const raw = [...new Set(String(str || '').toLowerCase().split(/[+\s,]+/).filter((p) => KNOWN.includes(p)))];
  if (!raw.length) return null;
  let parts;
  if (raw.includes('scan')) parts = ['scan'];
  else if (raw.includes('eyes') && raw.length > 1) parts = raw.filter((p) => p !== 'eyes');
  else if (raw.includes('eyes')) parts = ['eyes'];
  else {
    parts = [];
    if (raw.includes('iris')) parts.push('iris'); else if (raw.includes('head')) parts.push('head');
    if (raw.includes('hand')) parts.push('hand');
    if (raw.includes('mouse')) parts.push('mouse');
  }
  const has = (p) => parts.includes(p);
  const face = has('iris') ? 'iris' : has('head') ? 'head' : null;
  return {
    mode: parts.join('+'), parts, face, scan: has('scan'), hand: has('hand'), mouse: has('mouse'), eyes: has('eyes'),
    cam: parts.filter((p) => p !== 'mouse' && p !== 'scan').length, // camera pointer sources
  };
}

// Why a selector cannot be used with this configuration (null = fine).
export function selectorBlocked(sel, cfg) {
  if (sel === 'dwell' && cfg.scan) return 'Scanning selects with a blink or the switch';
  if (sel === 'blink' && !cfg.face && !cfg.scan && !cfg.eyes) return 'Needs Head or Iris, or Blink-only scanning';
  if (sel === 'pinch' && (!cfg.hand || cfg.scan)) return 'Needs Hand';
  return null;
}

export function defaultSelect(cfg) {
  const out = [];
  if (!cfg.scan) out.push('dwell');
  if (cfg.face || cfg.scan) out.push('blink');
  if (cfg.hand) out.push('pinch');
  if (cfg.scan || cfg.cam + (cfg.mouse ? 1 : 0) > 1) out.push('key');
  return out;
}

// "dwell+blink" -> allowed selectors only; falls back to the defaults when empty or missing.
export function parseSelect(str, cfg) {
  const asked = String(str || '').toLowerCase().split(/[+\s,]+/).filter((s) => SELECTORS.includes(s));
  const ok = [...new Set(asked)].filter((s) => !selectorBlocked(s, cfg));
  return ok.length ? ok : defaultSelect(cfg);
}

// Configuration problems that stop Start (null = valid).
export function configProblem(cfg, select) {
  if (!cfg) return 'Choose how to point, or Blink-only scanning';
  if (cfg.scan && !select.some((s) => s === 'blink' || s === 'key')) return 'Scanning needs Long blink or Switch';
  if (!cfg.scan && !select.length) return 'Choose at least one way to select';
  return null;
}
