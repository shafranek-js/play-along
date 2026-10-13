# FG-04C3 — Optional finger-pair-specific biomechanical spans

## Objective

Improve the **actual** Play Along research Beam Search by adding a Pianomotion-inspired, independently implemented model of finger-pair reach. Its previous span test assumed that every pair separated by the same finger count had the same physical range (e.g. 1–2 and 3–4, or 2–3 and 4–5). That is not realistic for human hands. The new model calculates a separate reach for each physical pair, scaled by the existing pianist hand-size configuration. This is a *candidate refinement*, not validated improvement in musician accuracy.

## Implementation

- `src/core/fingering-polyphonic.mjs` adds `costModel:'anatomical'`, preserving existing `costModel:'legacy'` as the default. The core search, held-note checking, author anchors, source-note IDs, beam width, deterministic tie-breakers, MIDI onset/release and output order remain unchanged.
- `src/core/fingering-audit.mjs` independently screens outputs against the selected pair-specific cap with `spanModel:'anatomical'`; default legacy audit remains identical.
- `src/core/fingering-score-router.mjs` threads the opt-in model through polyphonic islands and fully-author-annotated integrity checks, with source/user finger anchors still hard constraints. Contextual monophonic behavior is unchanged.
- A ten-case synthetic regression suite, `tests/fingering-anatomical-spans.test.mjs`, is registered with the full existing `npm test` path.

## Research anatomy thresholds

Relative maximum permitted hand distance, measured in existing Play Along white-key units and scaled by `handSize`:

| Pair | Units | Pair | Units |
| --- | ---: | --- | ---: |
| 1–2 | 5.5 | 1–3 | 6.5 |
| 1–4 | 7.2 | 1–5 | 8.3 |
| 2–3 | 2.7 | 2–4 | 4.6 |
| 2–5 | 6.0 | 3–4 | 2.4 |
| 3–5 | 4.3 | 4–5 | 2.6 |

Examples: RH simultaneous C4(1)–D5(5) spans a ninth (8 units), rejected by the old generic 1↔5 cap of 7.65 and admitted by the experimental 8.3 pair-specific cap at `handSize:'M'`. A smaller `XS` hand is still correctly refused. RH D4(2)–F#4(3), 2.5 units, changes from generic 2.25 refusal to pair-specific 2.7 acceptance, while D4(3)–F#4(4) remains rejected by the tighter 2.4 anatomical constraint. Equivalent mirrored LH chords are checked separately.

These are bounded heuristic parameters inspired by ergonomic concepts in the owner-provided PianoMotion Studio; they are not measured anatomy for an identified pianist. They were independently coded rather than copying PianoMotion's Python/IK source or assets. No medical/physiological certification or exact global Beam Search optimum is claimed.

## Acceptance and comparison

Run `node --test tests/fingering-anatomical-spans.test.mjs`, `npm test`, browser/MAESTRO and SoundFont CI. **No teaching auto-fingers** until independently evaluated on real musician-verified source data. Do not switch the default based on synthetic feasibility alone; use FG-04C2 for a paired real source comparison with PianoMotion, checked source provenance and proper no-leak reference answers. If the experimental model reduces independent accuracy or introduces conflicting paths, retain `legacy`.

Default Play Along behavior, MusicXML/MIDI, original fourteen hand PNGs, transport, tempo and audio are untouched. Current Hand-thesia progress stays **35%**.
