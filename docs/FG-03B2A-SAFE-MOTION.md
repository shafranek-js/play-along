# FG-03B2A — Safe two-dimensional Ghost hand repositioning (v0.10.44)

**Scope:** a testable transitional 2D PNG-translation preview. This is **not** a complete musician-reviewed hand-motion model, not physical-finger identification and not automatically generated fingering.

## Problem

FG-03B1 accurately limited the second Ghost cue to the selected 500–1000 ms window, but instantly placed its static silhouette at the next key. It did not communicate **how far** a hand needs to relocate. An attempt to visually interpolate both hands through each other could also teach an anatomically misleading route during a crossing.

## Delivered

- Pure `fingerGuidanceMotionPlan()` in `src/core/finger-guidance-timeline.mjs` computes a cubic smoothstep for the **secondary**, translucent, source-verified future PNG pose: from the current hand's **visual center** to the next pose's visual center as the transport advances into the Ghost window. The source and destination geometry is already derived from exact `pianoKeyGeometry()` and authored finger data.
- `fingerGuidanceHandsCross()` detects reordered or dangerously coincident visual hand centers when **both hands have valid current and next placements**. In these cases the future **key-centered numeric badges** remain, but the simulated moving silhouettes are suppressed; the tool does not invent a physical arm-over-arm path.
- The transparent author-provided PNG pixels remain **bit-for-bit unchanged**. Only the sprite translation is interpolated; its internal joints and finger contact shape are not animated. The **destination note badges stay fixed to the exact piano keys**, never dragged in transit or inferred from MIDI.
- If the target image would be predominantly outside the visible piano range, the current sprite cannot provide a safe start, or the movement is too small to warrant a second hand pose, the planner degrades to a static exact target (where safe) or badges-only.
- **Pause and Seek** are stateless and deterministic. The paused preview is anchored to the future note, while playback uses the smooth intermediate position. The existing FG-03B1 Loop clock and Wait gate continue to decide whether a second Ghost is allowed at all.
- The primary next-unfinished note guidance is untouched and remains separate from the secondary repositioning cue. Existing 14 source PNG files, Web MIDI scoring and experimental FG-02 research are unchanged.

## Acceptance and reproducible evidence

Five new unit tests assert initial/mid/final interpolation, input immutability, crossing and proximity refusal, clipped/mobile-space safety, immediate pause/seek recalculation, and clean refusal of invalid geometry. Browser tests load deterministic artificial scores with **explicit hand+finger metadata** rather than source-inferred fingers, then check the actual built player:

- Author-labelled **large RH jump** gives a moving Ghost while playing and a precise stationary target while paused. Seek removes obsolete movement cues.
- Narrow viewport preserves source-authorized target badges; a clipped sprite is never clamped to an incorrect piano key.
- **Both hands crossing** yields badge-only previews for LH and RH, with explicit author labels retained.
- Wait prevents the secondary image entirely while the current task is unresolved.
- Chromium stores desktop, moving, narrow and crossing screenshots in `artifacts/finger-png/`. The PR Actions run uploads that directory for manual visual inspection.

Run `npm run build`, `npm test`, `npm run test:browser`. The PR must also pass the existing security, import, OSMD, recovery and music timing tests before merge.

## Not yet accepted / follow-up FG-03B2B

**No independent pianist has approved the implied arm/wrist trajectory.** For fixed anatomical correctness we still need musician-reviewed cases for hand-over-hand crossing, thumb-under, black keys, octave stretches and rapidly changing chords. Before calling FG-03B complete, review actual PNG screenshots across 25/49/61/88-key layouts, landscape mobile, paused Seek/Loop and complex two-hand scores. Pure canvas translation must not be called exact fingering technique. Unreviewed auto-fingering remains disabled for learners.

[Living roadmap](ROADMAP-FINGER-GUIDANCE.md) · [Previous tempo-aware window](FG-03B1-LOOKAHEAD.md) · [Research NO-GO](FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md)
