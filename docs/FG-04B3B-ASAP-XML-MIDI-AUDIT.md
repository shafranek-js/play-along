# FG-04B3b — Independent MusicXML-to-MIDI Score Audit

**Release:** v0.10.60 · **Status:** research implementation, no learner-facing fingering.

## Purpose

FG-04B1b froze **16 real piano works** as source-verified MusicXML + MIDI score pairs from [ASAP Dataset](https://github.com/fosfrancesco/asap-dataset). FG-04B3a could align already-normalized notes with score MIDI. This increment adds a **conservative independent interpretation of raw MusicXML note events** in `src/core/musicxml-score-midi-bridge.mjs`, and performs an actual corpus comparison through `scripts/fingering-asap-xml-midi-audit.mjs`.

We only analyze source files when they match the original ASAP Git commit `afc815c75c42e83a79c03feb6da8a35e77d4c6b8`, byte sizes and Git blob SHA-1. ASAP data is **CC BY-NC-SA 4.0 — noncommercial research only**, not included in the publicly distributed application. Downloaded score XML and MIDI are never persisted.

## Supported score normalization

The independent source-note parser covers ordinary MusicXML 3.x **score-partwise**, measures and divisions, pitched notes and rests, simultaneous chord elements, multiple voices through `backup` and `forward`, part/staff/voice IDs, accidentals, and explicitly connected ties. Structural source note IDs are computed using the existing `musicXmlSourceNoteId` convention. The source identity ordinal counts rest elements as well as sounding notes.

Source onset/release times originate in MusicXML **quarter-note durations** and are projected through the reference MIDI **tempo map**. This compares pitch/onset/note-off against the existing strict 2-ms FG-04B3a matcher. No pitch, duration or voice is derived from MIDI. The MIDI tempo supplies a reference score clock: **it does not independently verify MusicXML metronome directions**.

## Deliberate refusals

The parser stops on any unsupported repeat navigation, grace-note timing, missing divisions or invalid duration, unpitched instrument, ill-formed tag nesting, invalid pitch/voice/staff, orphan/noncontiguous/unfinished tie, and source/MIDI disagreement. It does **not** guess repeats, grace-note playback lengths, ornament realization, MIDI sustain-pedal interpretation or note identity from track/channel.

A matched event set does not establish independent accuracy of the source conversion or validate pedagogical fingerings. Not all valid MusicXML features are implemented; complex files can be refused while still being correct musical scores.

## Inspectable real-data report

Run `npm run research:fingering:asap:xml-midi` with network access. Use `FG04B3B_REPORT=artifacts/fg04b3b-asap-xml-midi.json` to save the **aggregate-only** JSON report, uploaded by PR GitHub Actions.

The report records every one of the sixteen score IDs as `aligned` or `rejected`, the exact rejection reason, aggregate aligned/refused counts and note-count coverage. A refusal is **not converted to a pass**, and only all-16 success permits `allPairsAligned=true`. The JSON contains **no raw XML, MIDI, individual note IDs, musical passages or finger assignments**. Network or source-hash corruption is a hard CI failure.

The companion offline tests check simple real XML parsing, chord timing, two independent voices, ties, tempo, malformed score and unsupported repeats, external entities, ambiguous unisons, raw note mismatch and no invented fingering. CI additionally runs the existing build, unit suite, other research audits, real browser regressions and dependency checks.

## Explicit unresolved gates

- Verify conversion independence and round-trip MusicXML musical semantics on real editions; current parser covers only a defined subset. Mark unavailable features as refusals, not missing fingers.
- Reconcile any score MIDI differences caused by editorial note duration, articulation, repeats, grace notes, tie splitting, voice overlap or performance export.
- Compare **actual, independently obtained** Hand-thesia/PianoPlayer fingering candidates against matched source IDs using FG-04A and FG-04B2; musician-review finger quality and hand size.
- Do not enable FG-04C/D learner auto-fingering until demonstrated safety and approval. Existing Wait/Tempo behavior, original MusicXML, manual correction layers and 14 owner PNG hand assets remain unchanged.

[Finger Guidance roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-04B1b original real score pairs](FG-04B1B-REAL-SCORE-CORPUS.md) · [FG-04B3a event matcher](FG-04B3A-EVENT-ALIGNMENT.md).
