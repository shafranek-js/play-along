# FG-04B3a — Strict Normalized Score ↔ MIDI Event Identity

**Version:** v0.10.59 · **Type:** independent research-only module; NO-GO for automatic teaching.

The original FG-04B1b [ASAP pairs](FG-04B1B-REAL-SCORE-CORPUS.md) contain MusicXML and MIDI score files. They are **separate sources**, and a shared filename/dataset entry **does not** prove that their note events correspond. This increment implements the *pure event matching portion* of FG-04B3, without claiming that full MusicXML semantics have been independently parsed or all 16 real pairs verified.

## New module

`src/core/score-midi-event-alignment.mjs` exports `alignNormalizedScoreToMidi(sourceEvents, midiBytes)`.

- Accepts canonical **source-derived** playback notes — each with original `xml:` source note ID, part, staff, voice, MIDI pitch, onset and duration in seconds and optional merged tie segment IDs. These input events **must originate from parsing MusicXML**, never by reconstructing them from the reference MIDI (that would be circular validation).
- Reuses the independent, bounded FG-04B2 Standard MIDI File parser for original score MIDI. Converts ticks through the exact MIDI tempo map (including tempo changes) with a prefix timeline and binary search.
- Compares exact pitch, start time and **note release time**. The only permitted fixed numeric tolerance is **2 milliseconds** between source-derived event time and original MIDI time. There is no adjustable fuzzy mode, nearest pitch fallback, octave substitution or heuristic staff/hand boundary.
- Requires **one-to-one globally unambiguous correspondence**: all source and MIDI notes must participate exactly once. A MIDI note matching two source IDs or two MIDI notes matching one source note causes refusal regardless of traversal order. Tied source segment identities must not be duplicated or borrowed across notes.
- Returns a bounded `aligned` report with source ID, part/staff/voice, matched MIDI note index/ticks/channel/track and maximum onset/release errors. Neither velocity nor MIDI track/channel are used to **infer** MusicXML note identity; they are provenance/audit data only.
- Refusal is explicit for count mismatches, unpaired notes, malformed MIDI, changed rhythm, wrong pitch, extra notes, overlap/unison ambiguity, invalid IDs, shared tie segment IDs, unknown staff or voice and time discrepancies.
- The function is **pure and read-only**. It never mutates XML, MIDI, original finger numbers, manual overrides, player state or stored user files. It does not fetch from the web or execute the upstream Hand-thesia Python code.

## Test protocol

`tests/score-midi-event-alignment.test.mjs` includes **15 synthetic regression scenarios**, spanning simultaneous voices, tempo changes, mixed-order events, repeated pitches, 2-ms boundaries, ambiguous unisons, duplicate score claims, source segment collisions, missing events, invalid metadata and corrupt bytes. Run with `npm test` (part of PR CI, alongside build, old browser tests and independent research checks).

## What this does NOT validate

- **Not the complete XML→MIDI bridge yet.** It accepts *normalized source events*, not raw MusicXML; actual XML parsing, tie merging, grace notes, ornament timing, repeat unfolding, score editions/transpositions and MusicXML-to-MIDI performance duration semantics are **unverified**. A binary `aligned` result on user-provided normalized events is evidence about those events, not proof their underlying XML was processed correctly.
- **No full-corpus scores have been event-mapped** in this release. The ASAP dataset is CC BY-NC-SA 4.0, and its source pairs remain outside the repository; they are **not** part of production guidance.
- **Not yet wired into FG-04B2 candidate scorer**. Next milestone is FG-04B3b: a rigorous source-normalization bridge on real licensed MusicXML (part/voice/repeat/tie provenance), plus source-MIDI notes and validated one-to-one IDs. External hand/finger candidate comparison cannot be promoted before that gate.
- No independent musician has assessed finger quality or anatomically verified any gesture. All outcomes retain `productionAutoFingeringAllowed: false`; author numbers stay authoritative and next-target PNG guidance remains unchanged.

**Acceptance threshold:** Failures must be obvious, score-note event identity must be stable, original MusicXML and user-supplied 14 PNG assets must be bit-for-bit untouched, all Node/Chromium regressions must pass, and README/roadmap must accurately identify this as **FG-04B3a**, not completed FG-04B3.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-04B1b corpus](FG-04B1B-REAL-SCORE-CORPUS.md) · [FG-04B2 comparator](FG-04B2-MIDI-ALIGNMENT.md).
