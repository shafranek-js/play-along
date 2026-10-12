# Play Along — development roadmap: Finger Guidance and musical reliability

**Decision date:** 2026-10-12. **Baseline:** v0.10.41 on main. **Implemented:** FG-03A / v0.10.42; FG-03B1 / v0.10.43; FG-03B2A / v0.10.44. This is a living engineering plan, not a promise that experimental fingers are safe for learners.

## Non-negotiable product principles

1. **Score authority before inference.** Preserve original MusicXML `<notations><technical><fingering>` values, note identity, explicit staff/hand and provenance. Do not infer fingers from MIDI NoteOn/NoteOff.
2. **Next action rather than current sound.** Hands prepare the **next unfinished task**. Wait must not silently skip outstanding chord notes. Seek and Loop must be deterministic.
3. **No anatomically invented fingers.** Original fourteen owner-supplied transparent PNG poses are preserved bit-for-bit; painted fingertips are never evidence of which physical finger the learner pressed.
4. **No implied chord completeness.** An incomplete author-annotated chord may display known **numeric** labels but must not present a complete hand position; an intervening completely unannotated onset blocks jumping ahead to a later annotated one.
5. **Keep production and research separate.** All FG-02A…FG-02J auto-fingering is research-only, and neither its predictions nor benchmark weights enter learner-facing hints.
6. **Privacy, licensing and maintainability.** Continue GitHub Pages without a backend. Respect PianoVAM CC BY-NC-SA research restrictions, keep source pinned and report only aggregate metrics. Update README with every PR, and run build + unit + real browser regression before merge.

## Current capabilities already implemented (do not reinvent)

- **FG-01:** Off / Numbers / Hands / Ghost, 14 owner PNG poses (7 each hand), MusicXML author fingering and hand attribution, next target in Listen/Tempo, Wait incomplete-chord handling, Seek/Loop and demo exercises.
- **FG-02A–I:** Experimental deterministic monophonic, polyphonic, phrase and score routing; fixed author anchors, independent physical audits and explicit refusals.
- **FG-02J:** New external evidence gate. Only 1,800 of 32,525 external performance notes carry aligned hand/finger ground truth (5.53%). Of 1,467 strictly eligible notes in 242 complete same-hand chord islands, 1,210 received an experimental proposal; 644 matched the external fingering (43.90% of all eligible notes). These values show **NO-GO** for automatically instructed learner fingering; they are not teacher-reviewed accuracy.

## Prioritized implementation

| Stage | Priority | Scope | Acceptance / release gate |
| --- | --- | --- | --- |
| **FG-03A: score-complete visual timeline** | P0 — v0.10.42 | Shared pure source-aware grouping. Preserve empty/unannotated score onsets. Flag partial chords and show only independently supported numbers. Wire into original PNG renderer without replacing images. | Unit tests for gaps, same-pitch voices, source validity, original note IDs, deterministic onset ordering; real Chromium check that unannotated positions are never silently omitted. No automatic fingering. |
| **FG-03B1: configurable Ghost preparation window** | P0 — v0.10.43 implemented | Gate only the secondary Ghost hand to the selected 500/600/750/900/1000 ms of wall time, scaled by playback speed; gradual preview opacity. No second-hand preview before finishing Wait; count wrapped Loop notes in the next cycle. | Pure timing tests + real Chromium tempo, Wait, Loop and persisted selector checks. MusicXML author/demo fingering only; no teaching auto-fingers. |
| **FG-03B2A: guarded PNG repositioning** | P0 — v0.10.44 implemented | Pure deterministic 2D translation for a source-confirmed *secondary* Ghost pose; keep target finger badges anchored on piano geometry; refuse full-sprite interpolation at hand crossings, near-coincident hands, clipped ranges and tiny shifts; recalibrate on Seek/Pause/viewport. | Unit and real Chromium geometry/motion tests, desktop/mobile/crossing screenshots uploaded in PR CI; source-note and 14 hand-asset integrity retained. Not anatomical approval. |
| **FG-03B2B: musician-reviewed movements** | P0 next | Review screenshots and real repertoire on 25/49/61/88-key ranges, real LH/RH crossings, thumb-under and black-key techniques. Improve hand transition guidance only with verified ergonomics; retain badge-only refusal for uncertain routes. | Expert pianist approval and responsive screenshot UAT required before claiming physically accurate motion. |
| **FG-03C: canonical provenance and user overrides** | P1 | Stable note-event ID with collision-safe voice/unison treatment; typed source/lock/finger/hand metadata, inspectable user corrections and explicit hand assignment. Keep original author data read-only and store overrides separately. | No collisions after imported MusicXML, transpose, ties and repeats; undo/reset, backup/restore and local data migrations tested; unknown hand remains unknown. |
| **FG-03D: musician-reviewed technique guides** | P1 | UI explanation of hand moves, thumb-under, hand shift, rotation in repeated notes, inversions and short chord sequences. Size profile only where meaningful and validated. | Reference passages approved by a pianist; explain limits when PNG sprites cannot represent physically exact joint motion. |
| **FG-04: experimental fingering engine** | P2 conditional | Compare/port Parncutt/PianoPlayer ideas in a Worker with cancellation/versioned replies and bounded computation. Separate hand splitter for ambiguous MIDI; refuse unclear passages. Never use a fixed C4 hand boundary as ground truth. | Frozen unseen evaluation splits, external expert adjudication, explicit unknown/refusal coverage, performance/memory benchmarks and positive acceptance gate. Until then keep learner auto-fingering disabled. |
| **FG-05: adaptive teaching and export** | P2 conditional | Export user-approved annotated MusicXML; practice fewer hints over time; supervised alternatives for different hand sizes; optional preview style controls. | Source author fingers preserved; no fabricated source metadata; actual end-user UAT of skill retention. |
| **FG-06: optional camera verification** | P3 exploratory | MediaPipe Hands feasibility on low-power clients; only explicit permission; privacy-by-default and fallbacks. | Independent latency, consent, calibration and occlusion acceptance before product consideration. |

## Dependencies and constraints

- `ARCHITECTURE.md` documents the transitional **21 ordered legacy fragments** and the shared-lexical-scope bundle; modifying one fragment or the build prelude requires deterministic build checks.
- `src/core/finger-guidance-timeline.mjs` is the first score-complete guidance adapter. It is **not** an automatic fingering algorithm or an anatomical hand model.
- Use the unchanged PNG assets and exact `pianoKeyGeometry()` for positional registration; fall back to numeric markers when a hand pose or all chord fingers cannot be safely represented.
- Recording MIDI input can judge pitch/onset/release, not physical finger identity. Keep camera-based judgement distinct and optional.
- PianoVAM is noncommercial licensed external research. Its annotations cannot be distributed in ordinary production artifacts.
- The separate musical-time correctness, backup/recovery, OSMD, catalogs, MIDI and browser acceptance milestones in `ARCHITECTURE.md` remain active.

## Definition of done per stage

Feature works in the existing Play Along build; regression suite and musical invariants remain green; failure states are explicit; README release history and this roadmap are updated; the developer documents what was and was **not** validated. Only a reviewed PR may merge to `main`.
