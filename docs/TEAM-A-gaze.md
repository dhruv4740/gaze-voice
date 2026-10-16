# Team A: gaze engine

Own only `src/gaze/**`, README.md, this file. Contract: [CONTRACT.md](CONTRACT.md).

- [x] 1. `?mode=eyes` with WebGazer.js feeding `point`; hide default overlays, optional small preview
- [x] 2. Calibration overlay: 3x3 dots, ~5 clicks each, 3 s accuracy check (mean px error), recalibrate; ~20-30 s
- [x] 3. Smoothing module: One Euro filter + dead zone, reliable on a 200x150 tile
- [x] 4. `?mode=head`: MediaPipe Face Landmarker nose tip, 5-point calibration, same smoothing
- [x] 5. Corner UI: mode switcher, recalibrate, status (tracking / face lost)
- [x] 6. Stretch: own iris regression model, compare vs WebGazer, `?mode=iris`

Rules: camera frames never leave the browser; credit libraries in the README Credits section; small commits.

## Round 2 (feat/gaze-handsfree)
- [x] Hands-free calibration: dots auto-record (600 ms settle, 1.2 s sample) and advance; click is a caregiver shortcut
- [x] Blink-to-select (head/iris): both eyes closed > 400 ms selects the hovered target; toggle in corner UI
- [x] Stats overlay (Stats button): selections, mean time-to-select, words/min via gaze
