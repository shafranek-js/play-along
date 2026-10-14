# FG-04C7 — Original PianoMotion MIDI fingering in a LOCAL Pyodide browser build

## Status and scope

**Executable integration research, not a deployed public release.** The owner authorized Play Along to use their private PianoMotion Studio repo. The actual original Python entrypoint `handthesia_core.api.analyze_midi` is invoked inside a browser Web Worker through the *original project's self-hosted Pyodide 314.0.7* environment. Play Along's JS Beam Search is **not** substituted for the PianoMotion engine. This is a real MIDI-input route: it reads the **already selected, saved original MIDI** from Play Along's IndexedDB and computes a separate, unverified PianoMotion fingering plan with no second upload.

The PianoMotion repo is private, without a hosted Pages runtime. Its own [license inventory](https://github.com/shafranek-js/pianomotion-studio/blob/main/docs/evidence/licenses-2026-10-13.md) flags unknown public redistribution terms for the Python code and a bundled unused SoundFont embedded in `pretty-midi`. **We therefore NEVER copy or publish those source files, wheels or sounds in the Play Along public source repository or normal `npm run build` / GitHub Pages CI.** Local developer-only staging is explicitly opt-in; a public release requires a rights/provenance decision and an asset-sanitization/build policy.

## Local-only end-to-end setup

On a developer machine already containing both repositories:

1. In the owner's PianoMotion checkout, install its pinned dependencies and run `npm run prepare:m1:assets` to prepare its own pinned local runtime and Python sources.
2. In Play Along, run `npm run build`.
3. Run `node scripts/stage-pianomotion-runtime.mjs --local-only ../pianomotion-studio`. The staging script validates each Python source/wheel/runtime asset with PianoMotion's original SHA-256 manifests and refuses missing, changed, unsafe or unpinned assets. It creates `dist/assets/pianomotion/staged-manifest.json` and exact copied local assets; it refuses overwriting an existing staged directory, any CI invocation, or a missing explicit `--local-only` flag. The staging artifacts are development-only: **do not deploy `dist` publicly** before inherited source rights are resolved.
4. Serve Play Along `dist` over local HTTP. Open a **MIDI** work already saved in **Моя коллекция**. Under **Практика**, the original PianoMotion panel appears **only because staged assets exist**. Click **Рассчитать MIDI в PianoMotion**.

The normal public build does not stage any private resources; the MIDI panel remains hidden. No Python installation is required on the **client** that receives a fully prepared local build, although staging the source checkout is a developer task.

## Integrity and UI contract

- The app retrieves the already-open saved source record using its content-addressed work key and `libraryMatchesContentId`. The original MIDI bytes are copied, not rewritten. Changing the selected work before results arrive invalidates them.
- Dedicated `src/workers/pianomotion-engine.worker.mjs` loads only **same-origin local** staged resources, verifies the original source manifest and Python-core digest, verifies source and wheel file SHA-256 before execution, checks local Pyodide version and package locks, and runs the actual `analyze_midi` entrypoint. No CDN/network fetch of arbitrary code.
- Input maximum 4 MiB; runtime non-concurrency, typed request ID, timeout 180 seconds, sanitized errors, no MIDI bytes in stdout or telemetry.
- The original engine's `rawBaseline.inputSha256` must equal the original MIDI hash; repaired or source-identity-loss cases fail closed.
- Results are **read-only research proposals**, capped to sixty displayed notes with hand, pitch, onset and suggested finger. No automatic source-note mapping yet, no writer into hand guidance, export, backups, or verified teacher labels. This avoids a false physical-key assumption until Play Along's MIDI event ordinals and PianoMotion's original `sourceEvent` mapping have independently passed a note-by-note uniqueness audit.
- Neither the existing 14 user PNG hand poses, the MusicXML editor, source playback, Wait/Tempo/Listen nor the ordinary JS fingering Worker are modified by runtime execution.

## Tests and next gates

`tests/pianomotion-runtime-staging.test.mjs` checks schema/source checksum digest, path traversal, ABI pin, missing boot files and dependency wheel pins. Included in `npm test`; standard browser/MAESTRO/SoundFont regressions must also remain green.

**Actual Pyodide browser output cannot be claimed verified by repository CI** because neither the private source checkout nor the local-only runtime assets are available to the public Play Along runner. Next perform a real same-source instrumented MIDI UAT on a local owner-authorized build; validate raw `midiTrackIndex`, channel, NoteOn/NoteOff ordinals, pitch/onset/release uniqueness, candidate physical feasibility and expert review before enabling note overlays or redistributable runtime. Future release should eliminate bundled questionable sample assets from `pretty-midi` and finalize all code license obligations. Until then this code is a meaningful executable development bridge, **not a released end-user MIDI feature**.

Hand-thesia project progress remains conservative; no measured musical accuracy improvement is claimed.
