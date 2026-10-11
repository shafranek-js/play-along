# FG-02A — Research-only fingering DP prototype

**Status:** experimental, **not connected to the Play Along UI or audio transport**.

This standalone, original ES module evaluates a *single monophonic line* for an **explicitly chosen** hand (RH/LH). It is **not** a port or certified implementation of PianoPlayer/Parncutt, nor evidence of optimal fingering in all repertoires.

## Scope

- Deterministic dynamic programming with five finger states and finger-dependent hand-position movement penalties.
- Hand-size presets XXS–XXL are **heuristic relative multipliers**, not calibrated anatomical measurements.
- Fixed author/user finger anchors 1–5 are non-negotiable. Conflicting constraints return `NO_VALID_PATH`.
- Single-handed, strictly monophonic melody only; concurrent notes and significant legato overlap return `POLYPHONY_UNSUPPORTED`.
- Black-key, thumb-under, cross-over, rearticulation and hand-shift costs are tunable research hypotheses.
- Never detects the player's real finger from Web MIDI and never assigns a hand solely from pitch.
- Pure data output; neither modifies imported MusicXML nor replaces the Play Along v0.10.31 next-target renderer.

## Run

`npm test` includes `tests/fingering-dp.test.mjs`. The module can also be called from Node with `import {proposeMonophonicFingering} from './src/core/fingering-dp.mjs'`.

Example input: `[{pitch:60,start:0,duration:.45,finger:1},{pitch:62,start:.5,duration:.45}]`; options: `{hand:'RH',handSize:'M'}`.

Each successful output note has `pitch`, `start`, `duration`, `finger`, `hand` and source `anchor` or `proposed`. Rejections use a machine-readable `reason` and never fabricate unknown assignments.

## Acceptance gate before any UI integration

1. Compare candidate output against independently curated notation by a competent pianist: diatonic/chromatic scales, arpeggios, inversions, leaps, repeated notes, two voices and chords (later algorithm), LH/RH.
2. Confirm authorial MusicXML finger annotations and manually edited overrides survive calculation and Seek/Loop.
3. Profile latency on 2500 notes in realistic browsers/devices, not solely a Node CI run. Target **<150 ms** is research-only until measured.
4. Add multi-voice segmentation / chord optimization, avoid anatomically impossible stretches and collect error cases from user testing.
5. Add an off-main-thread worker **only after** the standalone model reaches quality gates. Avoid assigning approximate fingers as authoritative in the meantime.

## Research references and qualifications

The user-provided report `research_report_spa.html` advocates the Balanced Option and an experimental 2500-note benchmark, but its comparison matrix and timing claims are not fully reproducible from that HTML alone.

- PianoPlayer project: https://github.com/marcomusy/pianoplayer (MIT as recorded 2026-10). It describes effort- and velocity-based search with fixed author anchors. Our module does **not** copy this code or claim equivalence.
- Original literature: Parncutt et al. principles are background inspiration; this is an independent simplified heuristic prototype.

Release rule: **this module must never be imported into the current player as a default fingering engine without a separately approved and tested feature PR**.
