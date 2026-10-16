# Plan: Renaissance 2026, 16 Oct

Coding 10:15-4:00 · submission opens 3:45 · judging 4:00-5:45.

## Teams
| Team | Who | Owns | Branches |
|---|---|---|---|
| A: Gaze engine | Dhruv + Claude (Sonnet codes, Opus reviews) | `src/gaze/**` | `feat/gaze-*` |
| B: Conversation | Teammate + their AI tools | `src/conversation/**` | `feat/conversation-*` |
| Review | Opus | Reviews every PR from both teams before merge | - |

Briefs: [TEAM-A-gaze.md](TEAM-A-gaze.md), [TEAM-B-conversation.md](TEAM-B-conversation.md).
Interface: [CONTRACT.md](CONTRACT.md).

## Workflow
1. Pull `main`, create a `feat/...` branch, work only in your folder.
2. Small commits, push at least every ~45 min (judges read history; big last-minute
   commits can be flagged).
3. Open a PR to `main`; Opus reviews; fix; merge; pull `main` before the next piece.
4. Never commit `.env.local` or any key. Credit every library in the README Credits section.

## Milestones
| By | Team A (gaze) | Team B (conversation) |
|---|---|---|
| 11:45 | WebGazer + 9-dot calibration, live gaze dot | Layout, speech-to-text "Heard" strip |
| 12:45 | Smoothing, dwell on real gaze (`?mode=eyes`) | Groq reply prediction, speech out |
| 1:45 | MediaPipe head pointer (`?mode=head`) | Categories, patient profile |
| 2:45 | Stretch: own iris-regression gaze model | Spell mode, emergency |
| 3:30 | Lighting test, polish | Hindi, offline fallback phrases |
| 3:45 | **Freeze: merge, rehearse, submit** | |

## Demo (2 min)
Story -> calibrate in 20 s -> judge asks "Did you sleep well?" -> answer by gaze ->
follow-up shows context-aware replies -> spell mode -> emergency -> judge tries it.

## Fallbacks
Bad light/glasses -> `?mode=head`. Noisy hall -> phone mic or typed question.
Groq down -> fixed phrases per category.
