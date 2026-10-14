# Play Along — launch readiness without a piano expert panel

**Product-owner decision (2026-10-14):** Play Along is intended to launch **before** a professional pianist/reviewer panel is available. Independent adjudication of optimal fingering is a **post-launch research enhancement**, never a prerequisite for a functional public beta. This supersedes any roadmap wording implying that hiring a reviewer panel is mandatory to release Play Along.

## Separate three different decisions

| Decision | Prelaunch requirement | Rationale |
|---|---|---|
| Publish functional browser piano practice app / public beta | **Yes, after engineering and legal release gates** | User can import/choose scores, listen/practise, calculate suggestions, inspect/change/undo and export their own work without professional review |
| Claim the automatic fingering is pianist-validated, ergonomically optimal, or uniquely correct | **No claim permitted without independent evidence** | P0-A2 single-publisher finger agreement and physical-consistency heuristics do not establish optimal fingering |
| Recruit reviewers, collect complex held-out expert judgements, tune weights using confirmed improvements | **Post-launch, optional depending on resources** | P0-A2b study infrastructure can stay in the repo; it must not block the normal player or automatic suggestion UI |

**Terminology for launch:** use *automatic fingering suggestion* / *user-reviewed applied fingering*, not *pianist-approved*, *guaranteed correct*, *infallible anatomical hand movement* or *AI-certified teacher*. A selected and explicitly applied suggestion may drive an opt-in fingering display but remains an unverified suggestion; merely importing generated MusicXML must never elevate its provenance to author input or user-approved hints.

## Prelaunch gates — no external expert panel required

- **F0 — rights and attribution:** assess whether the original PianoMotion Python/adapted Hand-thesia files and any other third-party dependencies, datasets, music, and sound fonts can legally be redistributed in the planned public beta (and separately for any future commercial use). Attribution alone cannot create redistribution rights. This is a real blocker if unresolved.
- **F1 — complete import-to-export flow:** verify representative *actual* MIDI and MusicXML/MXL fixtures, including multi-track piano, optional guitar single-track fallback, short/repeated notes, chords, simultaneous releases, empty/corrupted input and incompatible instrument/drum tracks. Never silently mutate source notes or hide failed source-identity mapping.
- **F2 — playable transport:** verify audio events, tempo, long holds, Pause/Resume, Seek/Loop, Wait mode, actual MIDI keyboard connect/disconnect, recovery, sound font selection and resource limits on desktop Chromium and supported mobile browsers.
- **F3 — fingering trust and control:** auto suggestions are opt-in; clearly show hand/finger, physical conflicts, unresolved notes and confidence limitations; protect imported author annotation and user edits. Selectively Apply, Undo/Redo and MusicXML export; then independently reimport. The independent structural audit prevents detected hard contradictions but never certifies piano technique.
- **F4 — operational robustness:** deterministic unit suite and real-browser regression jobs green on release commit, GitHub Pages actually serves the target version and refreshed JS/CSS, no fatal console errors, keyboard navigation and safe failure if Pyodide/offline runtime does not load.
- **F5 — honest public communication:** disclose the status of auto-generated fingering and physical-hand rendering, data handling/privacy, known limitations, supported imports, and license/provenance constraints. A public beta can be released with documented quality gaps if core play/import/export remain usable and no critical safety/security/legal blocker remains.

## What is deliberately NOT a prelaunch gate

- Hiring two pianists and a third adjudicator; obtaining an independent consensus label for all complex score notes.
- Raising the fixed Hand-thesia *research completion estimate* from 35% or reaching full IK/3D parity. Completion of that research is not the same as general app launch readiness.
- PianoMotion beating FG-02I on the 148-note Piano Protege comparison; measured 58.78% single-annotation agreement is neither sufficient nor required evidence for an optional beta suggestion tool.
- Full 3D piano/hand display, computer-vision tracking, and per-user hand size optimized by experts.

## LAUNCH-01 UAT snapshot — 2026-10-14, v0.10.101

Real original Bach/Schubert source-file Chromium import now passes for 1,607 notes in each format (actual source MIDI and MusicXML individually pinned and read). PianoMotion pending inference can be cancelled and safely retried, with late callback rejection. **Not certified:** exact XML↔MIDI event parity, the two XML parser warnings, live Pyodide on those sources, speaker/MicroLab/other real hardware testing or rights to redistribute derived third-party source. [Evidence and exact pass/fail matrix](LAUNCH-01-UAT-RESULTS.md). These remain engineering/legal checks, **not** a demand for a nonexistent expert team.

## LAUNCH-01 F1 follow-up · v0.10.102

Chromium has now diagnosed and **fixed both false MIDI-port warnings** (single port-1 inputs) and independently verified original raw MIDI physical note-offs for **1,607 pinned piano notes**. All 1,607 XML↔MIDI pitches/onsets align within 20 ms; **579 Schubert MIDI releases have genuinely different durations from MusicXML score notes** (already present in original MIDI, no Play Along truncation). Three same-pitch contacts remain source-identity ambiguous. See [full event parity and legal/QA caveats](LAUNCH-01-UAT-RESULTS.md). Remaining public-beta blockers are unchanged: genuine in-browser Pyodide, real MIDI/hardware playback/transport, broader corruption/MXL QA and verified redistribution rights. Reviewer recruitment remains post-launch.

## Recommended near-term development queue

1. **LAUNCH-01 — targeted end-to-end UAT and bug fixes.** Test the actual built Pages app with real representative MIDI/MusicXML, external hardware MIDI where possible, resource failure, deliberate source edits, invalid files and an actual download/reimport. Document pass/fail with reproducible cases and console errors.
2. **LAUNCH-02 — preview versus accepted suggestions.** Improve clarity: calculated fingers are editable predictions, not source annotations. Never apply automatically. Display detected hard conflicts, user corrections and the limits of supported hand-size assumptions.
3. **LAUNCH-03 — user-facing experience.** Clear player/reviewer instructions, error recovery, progress feedback on loading Python, fast track selection, keyboard-only interactions, mobile/responsive QA and startup/worker download performance.
4. **LAUNCH-04 — beta release checklist.** Confirm license/rights status (F0), GitHub Actions, Pages version, browser smoke tests, update README, change log and known limitations. Publish only after green checks. Reserve a simple feedback route for users' musical disagreements, with no claim of external expert verification.
5. **POST-LAUNCH — P0-A2b pianist review and controlled improvements.** When independent reviewers become available, complete the already implemented blind-reviews/heldout procedure and improve solver weights only after reproducible gains. FG-03D5/03D6 procedural-hand IK can progress as **optional visuals** in parallel if they meet source/transport/animation engineering gates, not as pianist-certified guidance.

The normal app's PianoMotion Apply/Export path is **not** gated on the research engine's `expertValidated` or `productionEligible` reporting flags. Those flags apply to promotion of research claims/results, not to whether a user may inspect and explicitly accept uncertain fingering proposals in a beta.
