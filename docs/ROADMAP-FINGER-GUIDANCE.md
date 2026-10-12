# Play Along — development roadmap: Finger Guidance and musical reliability

**Decision date:** 2026-10-12. **Baseline:** v0.10.41 on main. **Implemented:** FG-03A / v0.10.42; FG-03B1 / v0.10.43; FG-03B2A / v0.10.44; FG-03B2B-1 / v0.10.46 (engineering QA); FG-03B2B-2 accepted by pianist per project-owner confirmation on 2026-10-12. FG-03C1 / v0.10.47 implemented; FG-03C2A / v0.10.48 implemented; library fingering coverage and movable UI / v0.10.49 implemented. This is a living engineering plan, not a promise that experimental fingers are safe for learners.

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
| **FG-03B2B-1: piano-range and pose coverage** | P0 — v0.10.46 engineering QA | Real Chromium screenshot/JSON matrix of 25/49/61/88-key virtual keyboards on desktop/mobile; correct black-key targeting; no physical MIDI calibration required for virtual preview; no fitting a full PNG pose to cropped author-annotated chords. | Eight browser screenshots and machine-checkable geometry report in PR artifacts; original MusicXML finger data preserved and no auto-fingering. This is **not pianist approval**. |
| **FG-03B2B-2: pianist acceptance** | P0 — accepted 2026-10-12 (owner-reported) | The project owner confirmed the pianist accepted this phase. Record this as an accepted milestone for the reviewed 2D hand-guidance scope; do not expand it into a claim that automatic fingering or anatomical joint simulation is independently validated. | Approval is confirmed by the owner. No individual review sheets, repertoire list or annotated case report are attached yet; attach them if supplied, without reopening the accepted stage. |
| **FG-03C1: MusicXML identity and tie provenance** | P1 — v0.10.47 implementation | Use documented deterministic part-index/measure/ordinal IDs even for duplicate XML part declarations or simultaneous unisons. Preserve all source segment IDs across linked notes; do not edit author fingers. | Pure ID collision tests and real Chromium unison, repeat, duplicated-part and tie checks. No user edits introduced in this increment. |
| **FG-03C2A: source-preserving manual correction** | P1 — v0.10.48 | Edit finger 1–5 and hand of canonical MusicXML note in right Practice panel; preserve author data; bounded undo and source reset. Validate local settings and backup restore; stable exact-source reimport identity. | Node and real Chromium checks of editor, provenance, undo, persistence, strict corrupt-backup rejection and unchanged original. |
| **FG-03C2B1: multi-note Undo/Redo** | P1 — v0.10.51 implemented | Bounded 40-edit history across source-identified score notes, redo and undoable reset, per-source memory isolation, atomic persist-before-state commit and stale-history refusal. | Pure model and real Chromium checks, original fingering unchanged, no history exposed to untrusted backup. |
| **FG-03C2B2: sheet annotations and cautious export** | P1 next | Distinguish user vs author fingering directly on rendered notation; optionally export explicit corrected MusicXML with authenticated note/voice correspondence. | OSMD score provenance, stable source note matching across repeat/ties, and musician-reviewed MusicXML export fixtures; no silent user-source confusion. |
| **FG-03C2B3: cross-edition migrations** | P1 research/design gate | Map user corrections across edited score revisions only on demonstrable note/voice/measure identity, with opt-in reconciliation rather than blind hashes. | Collision and misalignment tests plus manual conflict resolution and rollback. |
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
## Library v0.10.49 — companion UX milestone

- **Delivered:** Show **Есть / Частично / Нет / Не проверено** per catalog row with exact percent for verified scores, provide the corresponding filter, preserve source-only authorship + explicitly corrected notes, background index existing saved files.
- **Delivered:** Five independent collapsible, drag/keyboard/touch-reorderable library panels with persistent, backup-validated layout. Backup becomes a peer panel; search stays accessible outside the reorderable stack.
- **Acceptance:** Node validation + Chromium filters, legacy index, finger edits and DnD/persistence; update README, CI and actual Pages release.
- **Not enabled:** research-only automatic fingering, unrequested bulk fetching of online scores, or incorrectly treating unread scores as unannotated. [Technical protocol](LIBRARY-COVERAGE-AND-LAYOUT.md).
