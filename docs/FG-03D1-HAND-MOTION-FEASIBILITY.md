# FG-03D1 — Next-unfinished-note hand-motion feasibility

**Issue:** #59. **Base:** live main c41241b28edd90103b703222f2990f1de5205a50 (2026-10-13). **Branch:** research/hand-motion-fg03d1-feasibility. **Status:** research-only, NO-GO for learner UI.

## Previously implemented versus missing

FG-03B1 already offers a 500–1000 ms secondary Ghost preview window. FG-03B2A already offers smooth 2D PNG translation and crossing/clipping safety. This patch does **not** replace either feature: it introduces a separate, missing feasibility/provenance gate. Hand-thesia is an architectural reference only; no upstream source or assets were copied.

## Contract

src/core/hand-motion-feasibility.mjs exports a pure function:

    planAnticipatoryHandMotion({hand,target,origin,geometry,viewport,transport,opposite})

Target is the **FULL canonical next unfinished onset group**, including completed or unannotated notes, with isNextUnfinished=true and totalNotes exactly equal to notes.length. The caller must independently validate that it really is next; the boolean is an adapter assertion, not a verified proof. Every note requires a unique original noteId, pitch, verified hand RH/LH, finger 1–5 and exactly one authorized source/verification pair:

- MusicXML / source-author
- user / user-verified

MIDI hand inference, external candidates, demo fingers, partially annotated chords, unverified note identities, duplicate note IDs, and conflicting simultaneous finger positions are refused. Completed keys are removed from the presented pending target only on authoritative Wait/task completion.

Origin supplies full verified hand group and original note duration. Geometry uses the actual pianoKeyGeometry contract (byPitch Map, whites[].w, key x/w/center) with viewport in the identical keyboard coordinate space. Transport supplies original score clock, Listen/Tempo/Wait mode, playback state, speed 50–200%, Ghost lead 500–1000 ms and optional Seek, physically held key IDs, oppositeHandClear, and Loop explicit nextCycle flag. Two-hand motion clearance requires independently verified opposite.origin and opposite.target. Never guess an absent second hand.

## Returned decisions

| Kind | Action |
| --- | --- |
| moving | Visual-only 2D key-centroid smoothstep, immutable per-finger target key positions, distance/progress/time metrics and explicit screened-only confidence |
| static | Accurate next target without motion in Wait, Pause, Seek, outside lookahead, before previous key release, missing previous hand, or negligible shift |
| markers | Numeric key badges only for partial Wait chord, clipping, crossing/crowding, physical held keys, impossible leap, unknown other hand or invalid loop cycle |
| refuse | Unverified/incomplete/invalid/completed group; never skip ahead |

Research feasibility heuristic: 12-semitone max simultaneous chord width, consistent per-hand finger ordering, unique pitch/finger assignments, 18 semitones/second travel, 90 ms startup and 80 ms arrival buffer. These are coarse engineering safeguards, **not musician-certified biomechanics**. A source-held key must be released before motion begins. Speed changes visual available time, not original score onset/release. Wrapped Loop notes use an explicitly confirmed future cycle. No code can modify note-on/off, pedal, tempo, velocity, score data or the original 14 PNG files.

## Reproduction

    node --test tests/hand-motion-feasibility.test.mjs
    node --expose-gc scripts/hand-motion-benchmark.mjs 200000

Local Node v22.16.0: **35/35 deterministic tests passed**. Synthetic tests cover 25/49/61/88-key ranges, exact black keys, viewport clipping, both hands and crossing, chord conflicts, held original and physical keys, Wait incomplete chord, missing/candidate provenance, Pause/Seek, Loop wrapping, 500/600/750/900/1000 ms Ghost windows, 50/100/200% speed, immutability, and bounded work with a large external song array.

Local microbenchmark: **200,000 pure planner calls in 354.49 ms**, mean **1.772 microseconds** after warm-up. Balanced classifications: 40,000 moving, 40,000 infeasible, 40,000 Wait-static, 40,000 held, 40,000 unverified. With explicit GC, retained heap delta **+22,856 bytes**. Separate 20,000-call V8 allocation sampling (512-byte interval) recorded **8,448 sampled bytes**; it is statistical, **not** an exact total allocation count. Measurements are one-run, one-machine and exclude rendering, browser frames, PNG decoding and audio. Input scan is bounded at 16 notes/group rather than scanning a full song.

## NO-GO conditions and exclusions

1. No integration with learner-facing Ghost/Piano Roll until Lead independently verifies canonical next-target and original tie/voice/repeat metadata, hand-idle clearance, Wait/Seek/Loop lifecycle and provenance adapter. Inputs are explicit but not independently authenticated by this module.
2. No claims of anatomical finger joints, wrist positions, arm-over-arm crossing, thumb-under technique, hand-size fit, black-key depth or IK simulation. Heuristics require pianist review and hidden-case trials.
3. No Chromium screenshot, instrument hardware, full SoundFont/MAESTRO regression or browser performance approval from synthetic tests. This independent module is not installed in the production bundle.
4. Do not change original musical timing to complete an animation. The module has no write path and all trajectories are visual-only.
5. Existing 14 PNG files remain bit-for-bit untouched. README, shared roadmap, package/lock, CI, release version, music engine, SoundFont and MAESTRO are reserved for Lead and other workstreams.

Related: FG-03B1-LOOKAHEAD.md, FG-03B2A-SAFE-MOTION.md, FG-04B-HAND-THESIA-REVIEW.md, PARALLEL-CHAT-DEV.md.
