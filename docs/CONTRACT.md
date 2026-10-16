# Contract: Team A (gaze) <-> Team B (conversation)

The only coupling between the two halves. Change it only by agreement, and edit this
file in the same commit.

## Team B makes things selectable
- Add `data-gaze-target` to anything the user can select (tiles, keys, emergency).
- Optional `data-gaze-dwell="2000"` overrides dwell time in ms (use for emergency).
  Default 1200 ms.
- Targets must be big: at least ~200x150 px. Webcam gaze is rough.

## Team A reports selections
- On a completed dwell, Team A dispatches a bubbling `CustomEvent('gaze-select')` on the
  element. Listen on the element or any parent.
- While dwelling, the element has class `gaze-hover` and CSS var `--dwell` rising 0 -> 1
  (draw a filling ring with it). Base styles are in `src/styles.css`.
- `window` gets `CustomEvent('gaze:point', { detail: { x, y } })` every frame.
- After a selection the user must look away and back to select again.

## Team B announces things for the caregiver phone (Team A relays them)
Dispatch on `window`; Team A forwards them over the WebSocket relay to `caregiver.html`.
- `new CustomEvent('aac:spoken', { detail: { text, lang } })` whenever the app speaks.
- `new CustomEvent('aac:emergency')` when emergency fires.
- `new CustomEvent('aac:request', { detail: { kind, label } })` for requests such as
  `{ kind: 'lights', label: 'Lights' }` or `{ kind: 'nurse', label: 'Nurse' }`.
- Team A also dispatches `new CustomEvent('gaze:fatigue', { detail: { level } })` (level
  `'mild' | 'high'`); Team B may react (for example a "Take a break?" tile).

## Scan mode (`?mode=scan`, Team A)
Row-column scanning for blink-only or one-switch users. The scan highlights `[data-gaze-target]` elements row by row (tops within 40 px), then items in the chosen row, using the same `gaze-hover` + `--dwell` visuals (rows also get `gaze-scan-row`). Select = long blink, Space/Enter, or a click (clicks are swallowed in scan mode, except inside `#gaze-ui` or `[data-scan-ignore]`). It respects rest mode and `data-gaze-always`.

## Selection safety (Team A)
Dwell starts only after the snapped target has been stable for 300 ms and the pointer is slow (< ~400 px/s), so sweeping across the screen never selects. While the pointer is fast, snapping is frozen (stay on the current target or none) and the raw pointer is shown. After any selection (dwell, pinch, blink) nothing else is selected for a refractory period (default 1.5 s; tiles dim meanwhile), except `data-gaze-always` elements. Pinch selects only when locked on. Per-patient HUD sliders: dwell time (0.6-3 s, per input mode, default 1.2 s, hand 1.0 s) and the refractory pause (0.5-3 s). Selection events are unchanged.

## Rest mode (Midas-touch fix, Team A)
While resting, dwell and blink selection are off everywhere and the screen is dimmed with one big Wake target.
- `gaze:rest` `{ resting: true|false }` is dispatched on `window` when rest starts/ends. Stop listening or speaking while `resting`.
- `aac:remote-question` `{ text, from }` (window): a question typed or dictated on the caregiver phone (`caregiver.html`), relayed as `{type:'question', text, from:'caregiver', speak?, t}` (text trimmed, max 300 chars; messages older than 30 s are ignored). Team B treats it like a heard question: show it in the Heard strip with a "from phone" badge and generate replies. `patient.js` also dispatches `aac:heard` so a manual rest wakes. The patient's next `aac:spoken` is threaded under the question on the phone.
- Team B dispatches `new CustomEvent('aac:heard', { detail: { text } })` when a new question is heard: it wakes the app.
- Rest is **manual only**: the app never enters it by itself (no rest after `aac:spoken`, on idle, or on face lost; `?rest=` / `?restafter=` are gone). Enter via the HUD Pause button or Shift+P. Wake: dwell 2 s on the Wake target, a double long blink, `aac:heard` (a heard question wakes a manual rest), or selecting an always-on element.
- Put `data-gaze-always="1"` on a `data-gaze-target` that must stay selectable in rest (the emergency tile). Selecting it also wakes the app.
- Stats, fatigue and learning are frozen while resting.

## Entry points (called from `src/main.js`)
- Team A: `startGaze({ mode, root })`, mode `'mouse' | 'eyes' | 'iris' | 'head' | 'hand' | 'scan'`, or omitted: then the saved input choice is used, or the input picker is shown first (Team A). `src/main.js` passes `?mode=` or nothing.
- Team B: `startConversation(appElement)`.

## Ownership
| Path | Owner |
|---|---|
| `src/gaze/**` | Team A |
| `src/conversation/**` | Team B |
| `index.html`, `src/main.js`, `src/styles.css`, this file | Shared: ask Dhruv first |

Team B can build everything now with `/?mode=mouse`: hover = look, 1.2 s hover = select.
