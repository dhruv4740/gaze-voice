# Team A: gaze engine

Own only `src/gaze/**`, README.md, CREDITS.md, this file. Contract: [CONTRACT.md](CONTRACT.md).

- [x] 1. `?mode=eyes` with WebGazer.js feeding `point`; hide default overlays, optional small preview
- [x] 2. Calibration overlay: 3x3 dots, ~5 clicks each, 3 s accuracy check (mean px error), recalibrate; ~20-30 s
- [x] 3. Smoothing module: One Euro filter + dead zone, reliable on a 200x150 tile
- [x] 4. `?mode=head`: MediaPipe Face Landmarker nose tip, 5-point calibration, same smoothing
- [x] 5. Corner UI: mode switcher, recalibrate, status (tracking / face lost)
- [x] 6. Stretch: own iris regression model, compare vs WebGazer, `?mode=iris`

Rules: camera frames never leave the browser; credit libraries in CREDITS.md; small commits.
