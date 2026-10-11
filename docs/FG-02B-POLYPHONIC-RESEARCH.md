# FG-02B — polyphonic fingering research engine

**Status: experimental and isolated. Not enabled in the Play Along interface.**

FG-02B adds `src/core/fingering-polyphonic.mjs` on top of the separate FG-02A monophonic experiment. This is an independent, simplified biomechanical **beam-search** implementation, **not** a port of PianoPlayer or a pedagogically validated Parncutt engine. There is no detection of the actual playing finger over Web MIDI.

## Mathematical model

A note's MIDI pitch maps to an approximate *horizontal key coordinate* in white-key units. Every onset introduces a chord group; notes from distinct voices with identical pitch/onset are treated as **one physical key** while retaining their individual note IDs. Held notes remain assigned to their earlier finger until their own key is released.

A search candidate binds each pitch to one of the five fingers under hard constraints:

- Each separately held key needs a distinct finger.
- The ordering of simultaneously sounding pitches must match physical finger order (RH low-to-high 1→5, LH low-to-high 5→1), without unmodeled crossing.
- Inter-finger distances cannot exceed simplified pairwise reach thresholds scaled by `handSize` (XXS–XXL).
- Original MusicXML/user `finger` anchors are immutable.
- A second attack on a still-held pitch is explicitly unsupported.
- Five distinct keys are the maximum simultaneous span of one hand.
- An unknown hand, conflicting anchor, impossible span, or invalid input returns a reason code, not invented notes.

Among valid candidates, the bounded search minimizes an illustrative ergonomic score: squared deviation from a consistent palm center, relative finger stretch, hand relocation between onsets, black-key thumb/little-finger penalties, and rapid same-finger rearticulation. This model is an engineering approximation, **not a human biomechanics measurement**.

The default beam width is 40. Search is deterministic with explicit tie ordering and is bounded to 2500 note events per call.

## Public research-only functions

- `proposePolyphonicFingering(notes,{hand:'RH'|'LH',handSize:'M',beamWidth:40})`
- `proposeTwoHandFingering({RH:[...],LH:[...]},{handSize:'M',beamWidth:40})`

Success returns `ok:true` and items preserving caller note order, pitch, onset, duration, optional `noteId`, the proposed or anchor finger, and explicit hand. For multi-part output, `hands.RH` and `hands.LH` remain separate. Failures return `ok:false` plus `reason`.

## Acceptance caveats

1. All `finger` assignments are *proposals*. Only source-marked anchors have author/user authority.
2. Ordering and hand reach simplify wrist rotation and do not cover deliberate finger substitution, redistribution between hands, thumb-over/under multi-voice crossings, and physical simultaneous unisons across both hands.
3. Overlap of the same pitch across different onsets is unsupported. The two-hand API rejects overlapping same-pitch targets across RH and LH because a physical key does not identify two separate pressing fingers.
4. No automatic hand splitting by pitch: imported MIDI tracks, MusicXML staves, and actual note ownership need a reliable separate semantic mapping.
5. Evaluate against annotated score ground truth and expert pianist reviews before enabling player/UI/OSMD overlay. See also `docs/FG-02A-RESEARCH-PROTOTYPE.md`.
6. Hand-size presets are uncalibrated relative multipliers. Test with a real instrument and different hand sizes before releasing them.
7. Browser Web Worker execution and performance on mobile hardware are **future** work; a Node CI timing sample is not a general performance guarantee.

## Development and reproducibility

Run `npm test` to execute `tests/fingering-polyphonic.test.mjs` alongside the existing unit suite. Unlike the research core, the full Play Along GUI is separately regression-tested with Chromium for audio/Wait/Tempo/MusicXML/hand PNG behavior.

**No production auto-fingering is activated in this PR.** The project remains on the user's original 14 PNGs, authoritative MusicXML finger tags and current next-note guidance.

## Methodology

The user-provided report `research_report_spa.html` motivates the step from monophonic passages to chord/inversion/polyphony quality gates, but its results are not themselves an independently reproducible algorithm benchmark. The search cost coefficients and reach thresholds here are original provisional engineering estimates, not copied from an external library.
