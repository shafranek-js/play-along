# FG-04C7 — Source-verified ORIGINAL MIDI finger assignments from PianoMotion

**Priority:** support original MIDI, not only MusicXML, with the *real* PianoMotion Studio engine. This PR adds the first strict original-MIDI result adapter; it **does not bundle or run the PianoMotion Python engine in the browser**.

## Architecture and contract

`src/core/pianomotion-midi-fingering-bridge.mjs` provides `importPianoMotionMidiFingeringResearch({midiBytes,analysis})`, where `analysis` is a **separately calculated genuine PianoMotion** `analyze_midi` envelope (`rawBaseline`, `document`, `fingeringPlan`). This handles the MIDI-only path without falsely fabricating a MusicXML author identity.

The importer confirms exact SHA-256 equality of the **original, unmodified MIDI**, a loaded and non-repaired PianoMotion baseline, no identity losses/merge/split, exact source-event locator mapping, complete consistent fingering assignments, stable pitch/physical NoteOff times (±2 ms maximum), track/channel/time uniqueness and source-event ordinals. PianoMotion hands are preserved (never replaced by naive pitch segmentation); `unplayable`/gliss notes explicitly retain `null` finger. Every imported proposal remains `researchOnly:true,productionEligible:false`; it cannot enter learner guidance by inference.

The exported note DTO includes `midiIndex`, physical `pitch,start,duration,track,channel`, `hand` and `finger`. Those indices refer to the independently parsed **original MIDI** in `inspectFingeredMidi`; later integration must map those indices to the actual in-app MIDI source identity and preserve source bytes across library reloads. Do **not** use `midiIndex` as a globally stable score identifier.

This is intentionally separate from the existing FG-04C2 MusicXML + score/MIDI alignment importer; plain MIDI has no MusicXML part/staff/voice or authoritative author fingers. **Do not claim automatic teaching-ready fingering** merely because the note events match.

## Follow-on: actual in-browser execution of PianoMotion

1. Review provenance and redistribution rights for owner PianoMotion `handthesia_core` adapted Python sources and packaging (see the source manifest and license inventory in the private owner repo). Owner permission does not automatically cover adapted third-party sources.
2. Package a version-pinned, integrity-verified optional Python/Pyodide WASM engine worker with its `pretty_midi`, `mido`, `numpy` dependencies, or port demonstrably equivalent core behavior to a browser-supported language with independent golden tests. Do not silently pull an unreviewed CDN copy or ship Python packages by assumption.
3. In the *already selected MIDI* workflow, make the exact same source bytes available to the engine and this importer. Preserve the existing MIDI parser, audio transport, pedal and score identities. Reject incompatible or ambiguous sources instead of guessing.
4. Add browser tests for a user-selected original MIDI, a genuine engine result, lifecycle and cancellation, 25/49/61/88 keyboard, Wait/Tempo/Seek/Loop and independently scored musician labels. Only then consider optional adoption with explicit review, undo and provenance labels.
5. Keep the existing FG-04C6 MusicXML calculation and 14 owner PNG hands intact as the default.

**No third-party source, binary, dependencies, music, or PNGs copied; no player/UI changes.** Full CI and tests cover exact identity/refusal only, not musical accuracy. Roadmap percentage remains unchanged.
