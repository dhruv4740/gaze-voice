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

## Entry points (called from `src/main.js`)
- Team A: `startGaze({ mode, root })`, mode `'mouse' | 'eyes' | 'head'`.
- Team B: `startConversation(appElement)`.

## Ownership
| Path | Owner |
|---|---|
| `src/gaze/**` | Team A |
| `src/conversation/**` | Team B |
| `index.html`, `src/main.js`, `src/styles.css`, this file | Shared: ask Dhruv first |

Team B can build everything now with `/?mode=mouse`: hover = look, 1.2 s hover = select.
