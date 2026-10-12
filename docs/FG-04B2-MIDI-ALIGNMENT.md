# FG-04B2 — safe MIDI fingering-marker alignment (research only)

**Date:** 2026-10-12. **Stage:** standalone read-only prototype, not a learner feature.
**Reference:** [Hand-thesia code audit](FG-04B-HAND-THESIA-REVIEW.md).
**License:** Independently written parser; no third-party Hand-thesia code, image, weight set, or binary bundled.

## Purpose and scope

Hand-thesia accepts and exports Standard MIDI Files with short text-meta events immediately before a note-on on that track: R1–R5, L1–L5, F1–F5, or bare R / L. MusicXML has different note, tie, part, staff and voice identity semantics, so no direct import from MIDI markers into authoritative fingering is permitted.

The new module src/core/handthesia-midi-alignment.mjs exports:

- **inspectFingeredMidi(bytes)**: parse a bounded SMF format 0/1 file (up to 4 MB, 64 tracks and 25,000 played notes), with PPQ timing, tempo events and note-on/note-off pairing. Reject malformed markers, unexpected dangling notes, conflicting tempos, overlapping same-channel/pitch notes and ambiguous structure.
- **compareHandthesiaMidi(referenceBytes, candidateBytes, sourceNotes)**: require **three independently provided inputs** — original unmodified source-derived MIDI, external finger-annotated MIDI, and a separate array of canonical source MusicXML notes (noteId, pitch, start, duration, optional partId, voice, staff, finger, fingeringSource). The source manifest is not inferred from the candidate MIDI.

Candidate channel and track number may differ because the external program redistributes hands. **Source note pitch, MIDI ticks for onset and release, velocity, PPQ division and exact normalized tempo map must not differ.** The original MIDI is the immutability anchor. A source-note identity must uniquely align with exactly one original MIDI event in pitch/onset/release (source-to-export tolerance 2 ms); duplicated unisons with indistinguishable positions are rejected. No fuzzy sequential fallback or automatic matching of an unknown voice is permitted.

Returned objects include status (compatible, conflicts, rejected), reason, note-level external proposals, provenance external-generated, summary counts and **productionAutoFingeringAllowed: false in every outcome**. A matching candidate is *data aligned*, **not** musically correct or approved by a pianist. Original MusicXML author finger conflicts are reported and never applied.

## Limitations / fail-closed behavior

- No user-facing integration, no rewriting source notation, local overrides, backups, browser preferences, timing or 14 hand PNGs.
- No MXL/MusicXML-to-MIDI conversion is provided; a faithful **reference** MIDI plus canonical source IDs must first be produced and reviewed. A lossy conversion, difficult unison, tie-folding mismatch, nonstandard timebase or tempo difference must be refused.
- Does not compare MIDI pedal CCs, track programs, key signatures, phrasing, soundfonts or altered physical performance beyond note pitch/on/off/velocity and tempo. It cannot certify sonic equality.
- Text meta markers Rg/Lg and nonstandard labels are not treated as finger numbers. Bare R/L indicate hand only.
- Synthetic tests do not substitute for independent evaluation of actual Hand-thesia exports or expert fingering quality; no 10–20 piece licensed corpus has yet been frozen.
- The core does not execute external Python, open the network or trust annotations as score authority. Any future UI needs separate review, perf limits and explicit source provenance.

## Reproduce the automated acceptance

Run **npm test** (including tests/handthesia-midi-alignment.test.mjs) on Node 22. Tests cover synthetic valid MIDI tags, hand-only uncertainty, original source immutability, author conflict, channel reallocation, strict tempo/velocity/note-length refusals, ambiguous same-time unisons, identity gaps and malformed bytes.

Next stage is **FG-04B1**: acquire licensed score corpus and exact reference-MIDI/output pairs for a real-world blind test, then music-expert review. FG-04C / FG-04D are still **NO-GO**.
