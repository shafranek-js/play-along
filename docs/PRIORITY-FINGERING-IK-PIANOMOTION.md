# Play Along — owner priority: Fingering AI and PianoMotion IK (2026-10-13)

**Project-owner decision:** The two highest priorities are (1) improving automatic piano fingering using the already available PianoMotion Studio algorithm and (2) an optional procedural hand renderer based on PianoMotion Studio's IK, **alongside—not instead of—the existing fourteen owner PNG hand poses**. Historical dataset audits are not a current feature priority. This supersedes the previous ordering of discretionary FG-04B research and 3D-only future work, but does not waive correctness, rights or UAT gates.

## Launch scope decision (2026-10-14)

The project owner does **not** have access to an expert piano evaluation team before release. Ship an honest **optional beta fingering suggestion workflow** using the existing algorithms and user correction capabilities after software UAT and legal/rights review. P0-A2b expert-review recruitment, independent consensus and held-out pianist-accuracy claims are **post-launch, optional improvements**, not blockers to publishing the app. No model may claim expert certification without evidence. See [Launch readiness](LAUNCH-READINESS.md) and the current [roadmap](ROADMAP-FINGER-GUIDANCE.md).

## P0-A — compare and improve the fingering algorithm

**Owned reference:** private [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio), `python-core/handthesia_core/{fingering,figures,hand_split,pianist}.py`, `python-core/handthesia_core/source_manifest.json`, and its Python/WebAssembly bridge. Owner permits reuse of their application in Play Along, subject to rights inherited from third-party/adapted sources.

### Architectural decision
Treat the PianoMotion algorithm as a **candidate engine and comparison baseline**, not as proof of universally optimal or pianist-approved fingering. Its context detectors for scales, chromatic patterns, arpeggios, octaves, thirds and repetitions, search beam, personalized hand spans, thumb crossing, exact held-finger occupation, black/white-key geometry and travel-speed constraints are concrete candidates.

Reuse the existing Play Along modules `fingering-dp.mjs`, `fingering-polyphonic.mjs`, `fingering-contextual.mjs`, `fingering-score-router.mjs`, `fingering-hand-separation.mjs` and new `fingering-cost-research.mjs` (FG-04C1). **Do not add a second parallel teaching engine without a common interchange contract.**

### First implementation slice: FG-04C2
1. Freeze a side-by-side *score identity* interface: immutable `sourceNoteId`, onset and physical key release, hand provenance, finger provenance, score part/staff/voice and trusted author/user anchor priority. Preserve MusicXML ties, repeated notes, and multi-voice same-pitch identities. Each engine must be evaluated against identical original events.
2. Build bounded comparative fixtures for at least scales, arpeggios, repeated notes, thumb crossings, inversions, wide chords, held voices, RH/LH crossing and small/large hands. First establish parity/refusal and performance without changing solver parameters or consuming withheld truth. Independent author fingers, where available, are scored **after** predictions.
3. Record explicit numbers: valid group coverage, finger agreement among proposed notes, agreement over all eligible notes, physical conflicts, abstentions/reasons, deterministic repeatability and runtime cost. Keep ground truth separate from tuning. No unsupported claims of global beam-search optimality or of human anatomical validation.
4. Consider integration only when comparison supports real improvement; a generated candidate must never overwrite score-author `<fingering>`, manually corrected user finger, or the original source. Research-generated fingers remain visibly marked and not silently used to instruct learners; expert validation is still the rollout gate.

### Non-negotiable distinctions
- MusicXML explicit author fingering is authoritative; raw MIDI track/channel or pitch alone is not reliable RH/LH provenance.
- Sustain acoustics is not the same as finger holding a physical key; NoteOff and pedal CC64/66 must be distinguished.
- Unplayable or unresolvable chords **abstain** rather than changing timing, inserting arpeggios, falsely completing Wait, or relabeling a source note.
- The private owner application is available for reuse, but the lineage of adapted `handthesia_core` sources must be reviewed file-by-file before copying into a publicly distributed Play Along build. An independent interface/algorithm comparison is permitted without copying its source.

## P0-B — switchable PianoMotion IK hand visualization

**Source:** `apps/client/src/render/{handsView.ts,motionBuffer.ts,skins/}`, `python-core/handthesia_core/hands.py` (IK reference), `packages/contracts/` and source-verified Play Along visual research `hand-motion-feasibility.mjs` (FG-03D1), `pianomotion-pose-adapter.mjs` (FG-03D4, pending acceptance).

### Target user experience
A **Hand display** selector in the practice settings, independent of fingering algorithm and Off/Numbers/Hands/Ghost guidance modes:
- `Classic PNG (Play Along)` — existing fourteen supplied PNGs, the default forever unless the user changes it; bytes, framing and placement unmodified.
- `PianoMotion · Cartoon`
- `PianoMotion · Gloves`
- `PianoMotion · Robot`
- `PianoMotion · Skeleton`

Four PianoMotion styles share one IK/motion pipeline. The selected style is a presentation preference, not a new source of fingering truth. If procedural animation fails, loses a verified note binding, times out or lacks a trustworthy pose, fall back to safe badges/classic display **without silent guessing**. Do not offer enabled selections in production before an actual renderer exists.

### Development sequence: FG-03D5 → FG-03D6
1. Resolve and accept the FG-03D4 **visual-only pose adapter** and its source-note/iteration/generation strict matching. Validate held keys, chord completion, lookahead and original foot-pedal/release semantics.
2. Implement an opt-in, lazily loaded renderer based on owner-cleared PianoMotion PixiJS skins/geometry (or independently authored equivalent if source provenance is uncertain). **Do not bundle its entire React/Vite application or replace Play Along audio/transport.**
3. Wire a persisted, strictly validated `handDisplayStyle` preference through Play Along's existing backup settings and UI. Keep the current PNG renderer as the default and exact fallback. Independently persist finger guidance mode and procedural appearance.
4. Run Playwright screenshot/behaviour QA at 25/49/61/88 keys and desktop/mobile, at varied tempo, Wait incomplete chord, Seek, Loop wrap, pause, page/layout resizing and hand crossings. Verify hands prepare the **next unfinished note/chord**, not already sounded keys; no stale poses.
5. Verify contact against actual keyboard geometry (no mislabeled fingertip or false physical press), profile-dependent reach, browser frame cost and graceful fallback. Artistic pose interpolation is not evidence of real pianist-approved anatomy. A musician reviews the final representation before default/teaching promotion.

## Release and progress rules
- Product changes update README, package versions and full CI. Research-only isolated PRs may use dedicated FG documentation, but update README on integration.
- Do not replace or redraw the original 14 PNG assets, modify MIDI/score duration, or disturb SoundFont/MAESTRO.
- **Existing Hand-thesia objective stays 35% until an implemented, CI-tested, user-visible outcome is accepted.**
- Focus engineering effort on these two P0 tracks; no additional PianoVAM metadata research unless a specific blocker requires it.

See [PianoMotion integration review](PIANOMOTION-STUDIO-INTEGRATION.md), [FG-04C1](FG-04C1-FINGERING-COST-RESEARCH.md), and [FG-03D4](FG-03D4-PIANOMOTION-POSE-ADAPTER.md).
