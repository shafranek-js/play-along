# PianoMotion Studio → Play Along: reusable components and provenance gate (2026-10-13)

**Owner-provided repository:** [shafranek-js/pianomotion-studio](https://github.com/shafranek-js/pianomotion-studio) (private), inspected on `main`. The owner has expressly allowed reuse of their application in Play Along. This authorization covers only material the owner has rights to license; it is **not** proof that all third-party or adapted files may be republished.

## Confirmed architecture and candidate components

| PianoMotion Studio source | Capability | Play Along integration decision |
|---|---|---|
| `apps/client/src/render/motionBuffer.ts` | Timestamped `MotionPose` interpolation and contact checks | Highest-value candidate for an optional *visual-only* experimental hand motion adapter; verify note identity, frame budget and clock contract before any runtime wiring |
| `apps/client/src/render/handsView.ts`, `apps/client/src/render/skins/` | PixiJS articulated hands and skins | Optional future 3D-like procedural display; keep existing fourteen owner PNGs as default and preserve browser compatibility; not grounds to call anatomy pianist-verified |
| `packages/contracts/` | Typed plan/pose/result DTOs with validators | Adapt only the minimum score-source identity and motion DTO contract, with source and permission review |
| `apps/client/src/workers/`, `m1WorkerClient.ts` | Web Worker / Pyodide isolation | Research integration option; measure runtime and package weight before adding dependencies |
| `python-core/handthesia_core/{fingering,figures,hand_split,hands}.py` | Beam-style fingering, musical figures, separation and motion | **Provenance blocked for copying** pending derivation/license review; concepts can inform an independently implemented comparator, never automatically authoritative learner fingering |
| `apps/client/src/audio/`, `player/` | Playback, pedal-aware audio transport | **Do not replace Play Along's source MIDI timing, Wait/Tempo/Listen, SoundFont or MAESTRO pipelines** |
| `apps/client/src/editor/` | Piano Roll, corrections, history | Compare only after existing Play Along MusicXML source-ID, user correction and export contracts are preserved |

## Source-license and reuse gate

The PianoMotion repository is private and the owner permits Play Along use. Its own `docs/evidence/licenses-2026-10-13.md` reports *no root source LICENSE* and records adapted numerical core lineage (`python-core/handthesia_core/source_manifest.json` contains a desktop source commit). Original Hand-thesia upstream rights cannot be assumed solely from possession of a derivative repository. Verify author ownership, copied/adapted origin and third-party obligations **per file** before publishing anything in Play Along. Do not copy fonts, source MIDI, videos, poses, or dependencies absent verified permissions and required notices.

## Phased integration acceptance

1. **PIANO-MOTION-01 (design gate):** keep an adapter boundary around canonical `sourceNoteId`, onset/release, loop iteration, original author/user provenance and `transportTimeSeconds`. Never infer author finger from MIDI or mutate scores. Distinguish source performance and visual-only motion.
2. **PIANO-MOTION-02 (isolated proof):** use independently authored/cleared contracts to trial a motion buffer against Play Along's 25/49/61/88-key ranges with Pause/Seek/Loop/Wait and held-key refusal. Profile memory/CPU and record refusal counts, preserving 14 original PNGs byte-for-byte.
3. **PIANO-MOTION-03 (optional visualization):** on verified permissions and accepted browser tests, add a user-opt-in articulated renderer behind an explicit feature flag. Default remains the current 2D source-author guidance. No wrong hand, no premature skipping of unfinished chords.
4. **PIANO-MOTION-04 (fingering research):** compare fixed, permitted cost and beam candidates to the existing FG-04C evaluator. Independent musician validation required before any generated fingers reach lesson hints.

**NO-GO:** no unconditional copying of adapted Hand-thesia Python sources; no 3D/PixiJS replacement of the default renderer; no changes to canonical MIDI NoteOn/NoteOff, external NC dataset redistribution, or unverified auto-fingering promotion.

The owner originally deferred a wholly new 3D keyboard/hands experience under [issue #36](https://github.com/shafranek-js/play-along/issues/36). This new owner-provided codebase may shorten implementation after rights and compatibility review, but does not by itself close or advance that feature.

**Hand-thesia goal progress:** unchanged 35% until an accepted user-visible and source-safe capability passes CI and browser UAT.
