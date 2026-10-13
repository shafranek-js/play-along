# FG-04C1 — Independent source-authority fingering cost feasibility

## Purpose
This is the first **research-only** cost model accompanying the existing source-aware hand separator, not a rewritten beam search and not a learning feature. The core function `evaluateFingeringCostResearch` accepts fully author-verified MusicXML or explicitly user-verified note/finger/hand identities. No automatic labels are promoted to trusted input.

## Contract
- `previous` and `next`: each complete, single-onset source group containing unique `noteId`, MIDI pitch, hand LH/RH, finger 1–5, immutable original onset/duration, and trusted source/verification metadata.
- Reject duplicate IDs, duplicate simultaneously occupied physical keys, simultaneous reuse of one finger, finger order contradictions, unsupported finger spans, reuse of fingers whose previous NoteOff has not occurred, and trajectories that cannot complete inside original timing.
- Separate additive diagnostic costs for weak/black-key placement (`unary`), chord geometry (`shape`) and travel (`transition`). Report refusals distinctly; invalid shapes **do not** become allowed by an expensive penalty.
- White-key-width positions, span thresholds, 23.5 mm white-key approximation and 3m/s reference speed are **screening heuristics** independently written from the conceptual research model, not measured pianist-specific physiology.
- `at` is a source clock in seconds, not wall time. The evaluator never delays NoteOn/NoteOff or changes playback, MusicXML, user overrides, hand images or SoundFont.
- Conservative limits: maximum ten notes in a group, 0.65–1.35 hand size scalar; no sampling, no production wiring, no automatic fingering, no teacher certification.
- MusicXML ties, incomplete original notation, pedal-induced acoustic sustain and unknown hand/finger explicitly require higher-level adjudication; this standalone evaluator cannot assign anatomical fingers or prove the best global fingering.

## Evidence
Run `node --test tests/fingering-cost-research.test.mjs`. Eight deterministic independent engineering controls cover positive chord scoring, nonmutation, occupied finger, same-key conflict, duplicate source ID, missing provenance, large span and too-fast travel.

The new evaluator is **not** connected to the existing beam solver; no accuracy improvement is claimed. Validation on independent real author-reviewed finger ground truth and later integration with bounded search remain separate. Upstream Hand-thesia/pygame-piano-animator informs the conceptual cost categories only; **no upstream code or assets copied**. No additional noncommercial PianoVAM source data is used.

Hand-thesia goal progress stays 35%; learner-facing automated hand/finger instructions remain NO-GO.
