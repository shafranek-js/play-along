# FG-03B1 — Tempo-aware predictive Ghost window (v0.10.43)

**Release scope:** time-gate the **secondary**, semitransparent future hand position in Ghost mode. The normal next-unfinished-note guidance remains visible throughout the practice task, including Wait. This stage does **not** generate or predict any new finger number.

## Problem

Before FG-03B1, the secondary ghost hand for the following marked onset could be drawn even several seconds ahead. This falsely implied that the learner should begin the **second** position immediately instead of completing the nearest upcoming target. The old rendering had no relationship to transport tempo.

## Implementation

- `src/core/finger-guidance-timeline.mjs`: exported pure `fingerGuidanceGhostWindow()` with a deterministic lead window in **wall-clock milliseconds**, converted from score time by playback `speedPercent`. Returns `visible`, rounded `remainingMs`, and bounded `alpha` for controlled fade-in.
- Validated, globally persisted preference `fingerLookaheadMs` defaults to **750 ms**; the UI exposes **500 / 600 / 750 / 900 / 1000 ms** in Ghost mode only. Sanitation of localStorage and backup restores rejects unsupported values in strict backup mode.
- In **Listen/Tempo**, the second ghost is shown only when its onset is within the selected lead window. In **Wait**, it is hidden until the current chord is complete; the main actionable/current pending position is unchanged.
- For an enabled Loop, a wrapped onset earlier than the current transport position is scheduled in the **next** loop cycle (`loop.end - now + next.start - loop.start`), not treated as already overdue.
- Future position is displayed only if the next step is source-complete. Original transparent 14 PNG hand assets are unchanged; MIDI does not identify actual physical fingers.
- The opacity of the secondary ghost and dotted motion trajectory grows as the note approaches, while primary actionable markers retain their existing styling.

## Regression evidence

Five additional Node unit tests cover tempo conversion, lead boundary, disabled Wait preview, loop wrap and invalid time/state. Real Chromium tests add default/persistent selector behavior, 500 versus 1000 ms, 150% tempo, Wait blocking, and next-cycle loop semantics.

Run `npm run build`, `npm test`, and `npm run test:browser` (GitHub Actions PR gate). A successful build is **not** proof of correctness of the physical hand movement or automatically generated fingering.

## Remaining FG-03B work

The real PNG still represents a **static hand pose**, not articulated physical joints. Future increments: visibly communicating impending movement even for a far lateral hand shift; frame-interpolated positioning that does not obscure target keyboard keys; challenging tempo/pause/seek/loop browser screenshot audit; responsive 25/49/61/88-key display study; test against a musician-reviewed set of hand crossings, rests and thumb-under cases. These require separate QA and must never assert anatomical accuracy without evaluation.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [Source-safe FG-03A predecessor](FG-03A-SCORE-GUIDANCE.md) · [Research-only FG-02J NO-GO](FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md)
