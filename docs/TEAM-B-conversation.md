# Team B brief: Conversation (`src/conversation/**`)

**Paste this file and `docs/CONTRACT.md` into your AI assistant as the task.**
Run `npm install`, copy `.env.example` to `.env.local` with the Groq key, `npm run dev`,
open `/?mode=mouse`. Hovering a tile for 1.2 s "selects" it, exactly as eye gaze will.

## What you build
The screen the patient sees, and the AI that predicts what they want to say.

## Tasks, in order (about one commit each)
1. **Layout.** "Heard:" strip on top, 2x3 grid of big reply tiles, emergency tile in a
   corner (`data-gaze-dwell="2000"`), back tile. Every selectable thing has
   `data-gaze-target`. Filling ring from CSS var `--dwell` (0 -> 1).
2. **Listening.** `webkitSpeechRecognition`, continuous, `en-IN` with a `hi-IN` toggle.
   Final transcripts -> Heard strip + conversation history. Text box fallback.
3. **Reply prediction.** On each new utterance call Groq
   `https://api.groq.com/openai/v1/chat/completions`, model `import.meta.env.VITE_GROQ_MODEL`,
   key `import.meta.env.VITE_GROQ_API_KEY`, `response_format: {type: "json_object"}`,
   `reasoning_effort: "low"` (gpt-oss is a reasoning model; low keeps replies fast).
   Llama models are no longer on Groq's free tier; use `openai/gpt-oss-20b`.
   Send patient profile, last ~6 turns, time of day. Get 6 replies, each <= 8 words:
   yes / no / a need / a feeling / a question back / one surprise. Loading state; never
   block the UI.
4. **Speak.** On `gaze-select` of a reply tile, `speechSynthesis` speaks it (en-IN or
   hi-IN voice if available); add to history as the patient's turn.
5. **Categories.** Needs / Feelings / People / Pain -> sub-tiles of fixed phrases. Also the
   offline fallback when Groq fails.
6. **Patient profile.** Settings panel (name, family names, condition, usual needs) in
   localStorage, sent with every prediction.
7. **Spell mode.** 6 letter-group tiles -> letter tiles; after 2-3 letters, Groq word
   completions as tiles.
8. **Emergency.** 2 s dwell -> looping Web Audio alarm + full-screen "PATIENT NEEDS HELP";
   dismiss by dwell.

## Rules
- Touch only `src/conversation/**` (and `CREDITS.md` for libraries). Changes to
  `index.html`, `src/main.js`, `src/styles.css` -> ask Dhruv first.
- Never commit `.env.local` or the key.
- Branch `feat/conversation-*`, small commits (`feat(conversation): ...`), push often,
  PR to `main`; it gets reviewed before merge.
