# MAE-03A — exact MIDI key-release and pedal regression

**Release target:** Play Along v0.10.66. **Scope:** preserve original SMF rhythmic articulation and test the *existing* browser MIDI parser on the real MAESTRO v3 sample. No MusicXML score/fingering inference or production auto-finger control.

## Discovered timing problem and repair

`src/legacy/parts/80-midi-devices.js` previously assigned `Math.max(.025, originalDurationSeconds)` to **every** imported MIDI note, inflating performance notes shorter than 25 ms. This modifies the musical model itself. The fix retains `sec(endTick)-sec(startTick)` for each paired MIDI note, including very short staccato notes. The existing audio transport is free to apply an independent minimum for oscillator/synthesizer stability; display, Wait/Tempo grouping and held-time scoring must receive original authored key-release timing, not a fabricated 25-ms minimum.

This repair does **not** alter tick-to-second tempo map semantics, MIDI NoteOn/NoteOff pairing, hand guidance, SoundFont banks or persisted music.

## Independent oracle

`maestroReferenceEvents(raw)` in `scripts/maestro-midi-audit.mjs` is an **offline read-only research** decoder of MIDI ticks, tempo changes, per-track/channel/pitch FIFO paired NoteOn/NoteOff, velocity and MIDI CC64/CC66/CC67 events. It runs outside the application/browser production parser. It creates in-memory event lists only; no source files or note-by-note data are committed or uploaded.

`tests/maestro-engine-golden.real.test.mjs` launches actual Play Along in Chromium and compares its parser to this independent reference, using fixed-point 10-µs quantization for reproducibility. Every matched original note must agree in source track, channel, pitch, velocity, exact onset and key-release duration. Pedal messages must agree in channel, controller, value and event time. Deliberate short staccato, repeated note, tempo 120→240, cross-track unisons and CC64/66/67 are exercised on every PR with a generated fixture. **Official CI additionally compares all 24 pinned original MIDI files**, each verified by SHA256 against the immutable `research/maestro-v3-measured-qa-pins.json` manifest. Real dataset ZIP checksum, membership and CRC32 are verified before reading individual entries.

The report (a short-lived CI artifact) contains only source paths, SHA256 fingerprints of event tuples, total event counts and aggregates for short durations and dangling NoteOns. If source MIDI has a dangling NoteOn, the decoder records it separately; events with no corresponding NoteOff are not invented as valid musical notes.

## Scope limits and next acceptance

- Original MIDI **key-release interval** is not equal to acoustic note sounding interval while CC64 sustain is down. The CC timeline is verified, but audible sustain duration and synthesizer pedal-state restoration when seeking require further **MAE-03B** acceptance. Some source MIDI files may contain corrupted or ambiguous events; the gate must report and refuse without silent data loss.
- `WAIT` and `TEMPO` scoring remain driven by the preserved note model; the new test checks its imported event foundation, not pianist response accuracy or UI input latency. Those need MAE-03B real-browser simulated-key testing.
- Same-tick conflicting tempo messages and unsupported SMF devices/ports remain outside this gate. No hand/finger annotations can be inferred from MIDI.
- Do not distribute source MIDI, third-party audio or the derived complete event lists. Google LLC MAESTRO v3.0.0 is **CC BY-NC-SA 4.0**; the source corpus is research only.

Acceptance requires a complete original-source CI pass over all 24 recordings and the full existing Node/Chromium suite. Existing owner-provided 14 PNG poses and SoundFont banks are untouched.
