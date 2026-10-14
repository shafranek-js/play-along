# FG-04C8 — Exact Play Along ↔ PianoMotion MIDI source note identity

## Why this matters

PianoMotion's original browser Python engine labels raw source events by *MIDI track, channel, NoteOn message ordinal and NoteOff message ordinal*. The Python `identity.py` counts each mido-decoded track message, **including meta messages**. Play Along's original MIDI parser labels its performed score notes `midi:<sourceTrack>:<noteOnSerial>`, where the serial counts NoteOn notes within each MIDI track. Merely comparing pitch and time can incorrectly assign a particular finger to another performed note or hand in a chord or unison.

## Independently implemented strict crosswalk

`src/core/pianomotion-midi-source-map.mjs` introduces two research-only functions:

- `originalMidiSourceEvents(originalBytes)` decodes original unmodified Standard MIDI File 0/1 timing and track-local message ordinals (including MIDI meta and SysEx), running status, notes and physical NoteOn/NoteOff pairing. The result carries both raw event ordinals and the Play Along stable `midi:track:serial` source identity.
- `matchPianoMotionMidiEvents(originalBytes,playAlongOriginalNotes,pianoMotionCandidates)` requires the **exact** original note count and IDs, sourceTrack/channel/pitch/velocity, original tick onset and physical release, and one unique valid PianoMotion sourceEvent for each note. No output gets to borrow guessed score metadata or rely on track-name/pitch/register heuristics. Simultaneously held duplicate physical keys, unpaired NoteOns, unavailable or altered ordinals, duplicate candidates, invented finger IDs and missing notes fail closed.

The input PianoMotion candidate must have passed the separate FG-04C7 original-runtime **SHA-256 of the identical source MIDI**, original engine source identity validation and sourceEvent evidence. This pure function is a second check; by itself it does not certify that a browser worker's claimed note source came from an authentic Python run. Output is **research-only**, never verified pedagogical ground truth.

## Acceptance

- Tests cover mido-counted meta messages versus Play Along NoteOn serials; actual expected track/ch/ordinal/NoteOff pairing; pitch/time/velocity/track/channel alteration; forged source ordinal; absence/invalid hand/finger; ambiguous same-key rearticulation, malformed MIDI and byte/input immutability.
- Registered in full Node `npm test` via `tests/fingering-hand-separation.test.mjs`. CI music and browser/audio suites must remain green.
- The adapter refuses more than 2500 source events, more than 4 MiB MIDI, unsupported SMPTE/type 2, and unsafe unclosed key pairs. This is a cautious screening gate, not a complete MIDI exporter or arbitrary hardware-finger recognizer.

## Next

Connect this independent matcher to the FG-04C7 local-only original PianoMotion Worker output **after** that research PR is accepted. Only then may rendered MIDI notes be given an unverified, source-specific suggested finger overlay. Retain every author/user anchor, opt-in editing workflow and the original PNG hand variants; no automatic promotion to tutorial cues. Run actual local Pyodide engine UAT and per-note timing/expert checks before any production rollout.
