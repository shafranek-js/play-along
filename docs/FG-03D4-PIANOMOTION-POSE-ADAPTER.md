# FG-03D4 — PianoMotion Studio visual-pose buffer compatibility gate

## Purpose and provenance
Play Along has been explicitly authorized by the application owner to use [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio). Its own `apps/client/src/render/motionBuffer.ts` provides `MotionPose` shapes (left/right hand, `transportTimeSeconds`, tagged bones and joints) and explains how a procedural renderer can interpolate frames. This module is **independently written source-aware interchange and safety validation**, not a copy of PianoMotion's numerical Python engine, source-derived poses, animation renderer or any third-party Hand-thesia code/assets. Rights to derivatives of external Python source remain subject to per-file provenance review.

## Exact interface
`samplePianoMotionVerifiedPose({target,hand,frames,viewport,transport})` is a pure read-only evaluator. A frame has a `pose` compatible with PianoMotion's `MotionPose` (hand: `left/right`, `transportTimeSeconds`, `bones` containing unique `boneId/kind/a/b`, `joints` containing `kind/point`) and an added Play Along `binding:{sourceNoteIds,iteration,generation}`. The binding is essential: PianoMotion's generic pose alone cannot prove which canonical MusicXML notes were responsible for a hand position.

An entire canonical target group must have `isNextUnfinished:true`, original onset, explicit iteration, `totalNotes === notes.length`, and every note must carry an original or manually confirmed `noteId, pitch, hand, finger, source, verification`. Research-generated and unknown fingers, duplicate note IDs, incomplete or partly completed chords **abstain**. A hand's frame bindings must match precisely the source-note identities for that hand, same iteration and current transport generation. Source-verified fingers remain immutable. `transport.generation` must change on seek, new source load or loop reset, preventing delayed worker responses from animating the wrong song passage.

## Transport and bounded pose policy
- Listen/Tempo preview only in the selected 500–1000ms wall-clock lookahead; 50–200% playback speed is a **visual-time conversion**, not MIDI playback rewrite. Wait unfinished chords never receive animated secondary poses.
- Pause/Seek/reposition → static; missing/truncated range, incorrect hand, conflicting topology, non-finite 3D coordinates, stale worker result, insufficient frame coverage, unknown loop iteration → markers or refusal. Avoid extrapolation beyond the provided buffer.
- Max **128** frames, **10** source notes, **40** bones and **120** joints per frame, **4.01** seconds pose span; reject unbounded or malformed objects. Coordinate validation bounds each finite component to ±1000; no socket/network or storage access.
- Only interpolate matched `boneId/kind` and joint `kind` pairs. Return an immutable-by-convention new pose object, never alter input frames, score notes, MIDI NoteOn/NoteOff or hand PNG assets.
- The bridge **does not verify fingertip–key contact, anatomical joint realism, original pianist behaviour or score identity by itself**. It requires source-authenticated note inputs from Play Along before any proposed renderer activation.

## Verification
`node --test tests/pianomotion-pose-adapter.test.mjs` passed **10/10** locally on an independently generated synthetic fixture (not musician performance evidence). Test suite is also registered in the existing `npm test` entry via `tests/hand-motion-feasibility.test.mjs`. Verify full Node/Chromium/MAESTRO/SoundFont CI on the PR before integration.

**No production wiring in FG-03D4.** The default PNG renderer and all fourteen original hand assets stay intact. A later opt-in PixiJS experiment needs a separate source-safe renderer adapter, real browser performance/contact/Wait/Loop evidence, source rights approval and user acceptance. Automatic fingering remains **NO-GO**, and the 35% Hand-thesia goal completion estimate does not change.
