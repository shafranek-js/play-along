# FG-04B reference audit — V9011N / Hand-thesia (pygame-piano-animator)

**Reviewed:** 2026-10-12 · **Upstream:** https://github.com/V9011N/pygame-piano-animator · **Main examined:** upstream merge `f8189c021d9235005fb35faa2c8cfbc09a3768a0` · **Upstream release:** v26.1.20 (2026-10-12).

**Decision: research reference, not an integration dependency.** No third-party code is copied into Play Along. Do not activate auto-fingering or anatomically inferred hands for learners based on this reference.

## What Hand-thesia actually is

Hand-thesia is a **Python / pygame-ce desktop MIDI** falling-notes player, not an online MusicXML fingering API. `README.md` and `requirements.txt` declare `pretty_midi`, `pygame-ce`, and `imageio-ffmpeg`. It visualizes procedurally articulated overhead hands; generates a split between RH/LH for unlabelled MIDI, proposes finger assignments, and provides a DAW-like manual fingering editor. It can export a new **MIDI with custom text fingering markers** (`R1..R5`, `L1..L5`, `F1..F5`, `R`, `L`) and separate hand channels or export PIG `.txt`. It does **not** document direct export of a fingering-annotated MusicXML score. PIG/MAESTRO research files are not bundled; only three small project MIDI fixtures are committed.

## Functional architecture worth studying

| Component | Source | Relevant mechanics | Potential Play Along use |
| --- | --- | --- | --- |
| **Hand separation** | [hand_split.py](https://github.com/V9011N/pygame-piano-animator/blob/main/hand_split.py) | Beam width 32 across onset groups. Optimizes held keys, chord width, travel-time bound, hand crowding and track/voice continuity; prefers labelled hands but can reassign where a performance is physically impossible. Unlike fixed C4 pitch threshold, models actual interleaving. | FG-04B research-only hand-assignment comparator, report unknown/conflicting hand rather than asserting fingers. |
| **Finger planning** | [fingering.py](https://github.com/V9011N/pygame-piano-animator/blob/main/fingering.py), [figures.py](https://github.com/V9011N/pygame-piano-animator/blob/main/figures.py) | Beam width 32 on chord groups; finger pair reach, simultaneous held-note occupancy, fixed input labels, thumb-under, leaps, repeated-note alternation and figure patterns (scales, arpeggios, octaves, trills). Cost model can be tuned for each pianist. | Independent benchmark / physical-conflict checks; NOT trusted educational finger labels without pianist adjudication. |
| **Personal hand model** | [pianist.py](https://github.com/V9011N/pygame-piano-animator/blob/main/pianist.py), [hand_editor.py](https://github.com/V9011N/pygame-piano-animator/blob/main/hand_editor.py) | Configurable 19-bone proportions, wrist span, posture, motion limits, learned/textbook fingering preference and tuneable weights. | Possible *future* hand-size-aware proposals, not a reason to modify existing author fingering. |
| **Animation** | [hands.py](https://github.com/V9011N/pygame-piano-animator/blob/main/hands.py), [skins.py](https://github.com/V9011N/pygame-piano-animator/blob/main/skins.py) | Procedural articulated per-finger IK, joint constraints, key contacts, thumb-under, hand-over-hand crossing, wrist rotations, smooth motion and occlusion. The 2026-10-12 release improves crossing layers and supports MP4 export. | Future separately reviewed animation design. Keep 14 owner PNG poses intact and the next-unfinished-note/Wait contract intact. |
| **Editor and provenance** | [editor.py](https://github.com/V9011N/pygame-piano-animator/blob/main/editor.py), [midi_loader.py](https://github.com/V9011N/pygame-piano-animator/blob/main/midi_loader.py) | Marquee/multiselect, individual finger changes, batch re-hand/re-plan, single-note keyboard stepping, undo/redo, difficulty heatmap; source MIDI hand/finger text markers for round-trip. | UX reference for Play Along's already released full-score fingering editor; possible **explicitly opt-in** sequential mode and a read-only candidate difficulty layer. |
| **Benchmarking** | [pig_eval.py](https://github.com/V9011N/pygame-piano-animator/blob/main/pig_eval.py), [learn_weights.py](https://github.com/V9011N/pygame-piano-animator/blob/main/learn_weights.py), [study](https://github.com/V9011N/pygame-piano-animator/blob/main/docs/pianoplayer_study.md) | Learned finger weights from PIG pieces 031–150; reported evaluation on held-out PIG 001–030; human annotators can disagree. | Reproduce with permitted input data and frozen splits rather than treating published scores as independently verified. |

### Benchmark claims and their limits

Upstream `docs/pianoplayer_study.md` reports held-out PIG **general agreement** of **RH 62.3%, LH 69.8%** (learned) vs **RH 60.1%, LH 65.0%** (textbook), and reported inter-human general agreement RH **70.2%**, LH **73.1%**. Its `docs/ARCHITECTURE.md` also describes near-textbook Hanon results. **These figures are upstream self-reports**, not benchmarks we have rerun; the licensed PIG and Hanon source material is not distributed in the repository. Exact agreement is not the same as demonstrably comfortable or uniquely correct technique. Upstream explicitly warns that later figure changes were *not remeasured* on those external sets as of 2026-10-02.

### Important incompatibility: sound timing

Hand-thesia's `HandAnimator.performance` may **release keys early or strike chords late** to satisfy its configurable physical hand-speed limit (upstream `docs/ARCHITECTURE.md`, “Top travel speed”). Its own synth and illuminated keyboard intentionally follow this **altered** executed performance instead of the raw MIDI. Play Along's pedagogical transport and Wait/Tempo validation must **not** silently shift original note times, truncate held notes or change target groups. A research animation must read the immutable authored playback clock and fall back to numeric hints/poses when motion cannot be physically completed. Separate visual motion from musical timing.

### Important incompatibility: source and license

- **License:** On 2026-10-12, upstream's GitHub repository exposes **no root LICENSE file and no declared repository license**. The SIL OFL file in its bundled fonts licenses only those fonts, not the project's Python source. Public visibility is **not** permission to redistribute, port, or bundle code/assets. Obtain explicit license/permission before reuse; otherwise clean-room design using general musical/technical principles only.
- **Input/output:** Hand-thesia's official importer is **MIDI**, not score-source-stable MusicXML. Its `R1..R5 / L1..L5` text events plus per-hand channel split have no guaranteed correspondence to Play Along's MusicXML `xml:<part>:<part-index>:<measure>:<source-ordinal>` IDs, ties, voices or written repeats.
- **Strict current FG-04A comparator:** It accepts **MusicXML vs MusicXML** structural invariance except the fingering tags. Hand-thesia's output MIDI cannot be passed directly to that comparator. Any future compatibility adapter is a separately validated research gate with event/tie/voice/tempo/repeat matching, ambiguity refusal, source-identity checks, and no auto-approval.
- **Target semantics:** Hand-thesia renders simulated fingers striking sounding notes; Play Along's actionable hands and ghost hints point to the **next unfinished note**, including waiting for an incomplete chord. Do not substitute a render of the already-pressed hand for the learning target.
- **Runtime:** Python/pygame-ce and desktop soundfont/audio/video tooling are not deployable as-is in Play Along's zero-backend GitHub Pages app. A future *independently written* JS/Canvas/WebGL prototype must be opt-in, bounded, hardware-aware, cancellable and tested on desktop/mobile.

## Proposed follow-up research (NOT approved to teach)

1. **FG-04B1** — Freeze 10–20 permitted source-score fixtures, and gather Hand-thesia MIDI outputs on those same source-derived MIDI files *as an independent comparator*, alongside MasterPiano and PianoPlayer MusicXML. Track exact versions, hand-size/pianist profiles, generated vs author provenance and data licenses. No runtime dependency or API assumption.
2. **FG-04B2** — Design (no automatic import yet) a **read-only Hand-thesia MIDI marker alignment probe**: compare tempo map, note-on/note-off onset/duration, pitch, repetitions, unisons and track/channel identities against canonical MusicXML; report unmatched and ambiguous mappings separately. Reject altered performance timings or ambiguous source IDs. Mark RH/LH and fingers as generated, never source-authored.
3. **FG-03D1** — Standalone animation feasibility prototype using **original independently designed** hand geometry only after license decision and review of motion/timing contracts. Compare existing PNG poses vs IK for crossings, chords, thumb-under and lookahead, with pixel/latency/performance metrics and next-target invariants. Do not remove the fourteen supplied PNG assets.
4. **Evidence gate** — Professional pianist checks held-out fingering and physical reachability separately from pixel-perfect animation; benchmark refused notes and timing deltas; unchanged original MusicXML, exact Wait/Tempo notes and reproducible screenshot evidence.

## Source links reviewed

- [Upstream repository and README](https://github.com/V9011N/pygame-piano-animator)
- [Detailed architecture](https://github.com/V9011N/pygame-piano-animator/blob/main/docs/ARCHITECTURE.md)
- [PianoPlayer comparison and PIG scores](https://github.com/V9011N/pygame-piano-animator/blob/main/docs/pianoplayer_study.md)
- [v26.1.20 release](https://github.com/V9011N/pygame-piano-animator/releases/tag/v26.1.20)

This is a documentary code audit, **not** execution of upstream pygame code or reproduction of benchmark numbers.
