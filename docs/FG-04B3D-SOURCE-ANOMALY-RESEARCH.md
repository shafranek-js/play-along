# FG-04B3d — Zero-duration MIDI and MusicXML ornament/repeat source diagnostics

**Target release:** v0.10.66 · **Research only.** Read-only evidence that preserves the original MIDI, MusicXML, SoundFont banks and musical clock.

## Context and initial observations

The immutable, integrity-verified [ASAP Dataset](https://github.com/fosfrancesco/asap-dataset) corpus contains 16 MusicXML + score-MIDI pairs, pinned to upstream commit `afc815c75c42e83a79c03feb6da8a35e77d4c6b8` and using **CC BY-NC-SA 4.0 strictly for noncommercial research**. FG-04B3c established **1 fully aligned / 15 refused** in real CI, with no regression of the Bach Prelude. The Bach Fugue passed the source tie-provenance check but still refused its original MIDI because it contains zero-duration note pairs. The previous independent inspection found **seven** such pairs in the Fugue and **three** in Schubert's Moment musical 3.

A zero-time `NoteOn` / `NoteOff` is an event in the source, **not proof that the note should be deleted**. It could result from engraving/export rounding, same-tick ordering, or another issue. Neither the source XML nor a third-party fingering generator establishes the correct repair in the absence of independent musical evidence.

## New, separately testable diagnostics

`src/core/asap-score-anomalies.mjs` adds:

- `inspectScoreMidiAnomalies(raw)`: bounded SMF 0/1 read-only scanner with 4 MB, 64-track, 500,000-event and 100-million-tick limits. Returns aggregate note-on/paired/zero-duration counts **per track**, along with same-channel overlap, unpaired NoteOff, unfinished note, PPQ, pedal controller and tempo-event counts. Handles running status, velocity-zero NoteOn as NoteOff, metadata and SysEx without changing any events. Ambiguous source events are **counted, never guessed**.
- `inspectScoreXmlNotationFeatures(xml)`: bounded non-executing **lexical inventory** of notation features: grace elements, forwards/backwards repeat markers, alternate endings, navigation tags, ornaments, tempo markings, backups and ties. It explicitly **does not parse the complete musical meaning** of these features, nor does it infer repeat unfolding or grace-note durations.
- `summarizeScoreAnomalies(cases)`: exactly 16 unique score records, with aggregate and safe per-score **counts only**. No event pitches, timestamps, note identifiers, XML/MIDI bytes, original notes or candidate fingerings leave the research analysis.

The existing `scripts/fingering-asap-xml-midi-audit.mjs` now runs these diagnostics against **both SHA-verified original files** for each score even when the conservative FG-04B3b/c source-MIDI matcher refuses it. The JSON report adds `fg04b3dSourceAnomalies` without modifying `aligned`, `rejected`, or the prior regression guard. Set `FG04B3D_REPORT=artifacts/fg04b3d-asap-source-diagnostics.json` to capture reproducible evidence in CI.

## Acceptance and guardrails

- Retain the original musical timing: **never delete, insert or extend a MIDI note**, silently reassign a source pitch, flatten chord voices, or fabricate grace-note time.
- A complete score match remains contingent on strict original pitch, onset and key-release identity. An anomaly inventory **is not** a successful match or pianist fingering adjudication.
- No changes to MAESTRO online library, GeneralUser GS / MuseScore General SoundFont assets, synthesis, player transport, Wait/Tempo/Listen, library originals, 14 transparent owner-supplied hand PNGs or manual fingering overrides.
- All original finger numbers and source provenance remain authoritative. No experimental Hand-thesia finger data reaches learners.
- Run existing unit + real Chromium and SoundFont GM 256-program regressions, MAESTRO tests and real 16-pair network audits before merging.
- The online corpus is noncommercial research only; raw scores are **not** bundled or redistributed.

## Next gate: FG-04B3e

Use the source anomaly report to select **independent MusicXML-to-MIDI references** for each class (simple repeats, grace-note realization, zero-tick note export), verify actual note mapping and source edition by evidence, and only then add controlled normalization with complete before/after provenance and 1:1 note identity. The current research comparator must continue to reject unexplained mismatches.

[FG-04B3c baseline](FG-04B3C-ASAP-REFUSAL-TRIAGE.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [SoundFont acceptance](SOUNDFONT-ORCHESTRATION.md).
