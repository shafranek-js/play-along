# FG-03A — Source-complete visual guidance timeline (v0.10.42)

**Scope:** the production visual preview only. **Explicitly excluded:** any experimental FG-02 generated fingers, anatomical finger-detection claims, video/camera analysis or modification of the original PNG hands.

## Problem and musical reason

FG-01 groups only source notes that already have `finger` and `fingeringSource` set. In a partly annotated MusicXML score, note C can have an author finger while D has no fingering and E has one. The old timeline included C and E but dropped D: in Listen/Tempo it could imply that E was the immediate next motor task even before D had been played. On a chord with only some annotated notes, the old sprite visually suggested a complete hand configuration despite missing evidence.

An author notation gap is **unknown**, not permission to advance to the next annotated note and not evidence for an automatically calculated finger.

## Implementation

- `src/core/finger-guidance-timeline.mjs`: a pure deterministic `fingerGuidanceTimeline(events)` that buckets **every valid score note** by millisecond onset. Invalid score events fail closed. Each resulting group carries `totalNotes`, only legitimately annotated `notes`, and a Boolean `complete`.
- Only `source === 'musicxml'` or identified `source === 'demo'`, with finger 1–5 and explicitly known RH/LH or `null`, can yield a numeric instruction. Research-origin proposals, invalid finger values and invented hands never become player hints.
- `src/legacy/parts/70-piano-roll.js`: pass both annotated and unannotated events to the shared timeline. An empty group is a **silent target**. An incomplete group may display its known numeric badges but may not render a falsely complete hand pose. Ghost preview of the following group is withheld unless that group is complete.
- `scripts/build.mjs` and `tests/build.test.mjs`: include the core module in the ordered prelude of the existing 21-fragment bundle, without duplicate mathematical logic or new runtime dependencies.
- The fourteen original user-supplied PNGs are never modified. Wait mode still considers only unfinished keys in the current practice group; Seek/Loop remains timeline driven.

## Tested acceptance

- Seven Node unit cases: complete authored chord, unannotated intermediate event, partially marked chord, disallowed research source and invalid hand, same-pitch score voices, millisecond ordering and malformed notes.
- Existing Chromium `finger-guidance.musicxml.real.test.mjs` extended to require silent boundaries for unmarked score notes and to mark those groups `complete:false`.
- Existing browser coverage remains required for live MIDI Wait chord completion, anticipatory next note, Loop, PNG image registration, mobile sizing and normal MusicXML import.
- Run: `npm run build`, `npm test`, `npm run test:browser`. PR CI includes these steps; unit test success alone is not production approval.

## Limits / next phase

This phase does not synthesize motion or calculate new fingers. A missing annotation will deliberately show **no finger recommendation** at that onset. User interface controls for configurable 500–1000 ms preparation time and smoother movement between hands are scoped to FG-03B. Work on source-pinned correction profiles, size-aware manual alternatives, annotation exports or Web Workers comes later, subject to the [evidence-gated roadmap](ROADMAP-FINGER-GUIDANCE.md).

**Important release gate:** FG-02J independent PianoVAM polyphonic results remain a **NO-GO** for any automatic learner finger labels; only source-confirmed MusicXML and identified bundled demonstration guidance is production eligible.
