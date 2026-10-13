# FG-04B3d — Source MIDI zero-duration and MusicXML notation diagnostics

**Release:** Play Along v0.10.66 · **Research-only**, no learner-facing fingering or transport changes.

## Why this stage exists

The pinned ASAP 16-work research audit is **1 fully aligned / 15 refused** after FG-04B3c, not 16/16. In the original source MIDI of Bach Fugue BWV 846, several `NoteOn`/`NoteOff` pairs have identical absolute tick times. The strict FG-04B2 MIDI parser **correctly refuses these as `ZERO_LENGTH_MIDI_NOTE`**, preventing a false implication that those notes were held and sounded as scored. Original Schubert Moment musical No. 3 also has zero-tick notes.

FG-04B3d introduces a separate, bounded **read-only** structural scanner:

- `inspectSourceMidiAnomalies` reads the *original* Standard MIDI File 0/1 byte stream, preserving raw tick durations and track/channel boundaries. It accepts a zero-tick pair **for diagnosis only**, reports how many such pairs exist, and exposes track/tick/pitch details only as ephemeral local return values. Overlapping identical keys, unsupported track formats, malformed VLQs, truncated chunks and orphan notes refuse.
- `inspectMusicXmlNotationMarkers` counts literal MusicXML grace markings, explicit grace timing attributes, repeat forwards/backwards, endings and score-navigation sound commands. It does **not** assign grace-note durations, unfold repeats or identify score/MIDI equivalence. Markup in XML comments is excluded. Entities/CDATA and unsupported score-timewise format refuse.
- `summarizeSourceDiagnostics` returns safe **aggregate and per-score counts** (no notes, pitches, ticks, raw MusicXML/MIDI, or candidate finger numbers). This is appended as `fg04b3dSourceConstructs` to the existing pinned 16-score audit, alongside previous alignment and regression gates.

The source MusicXML/MIDI files are fetched only transiently after exact Git SHA-1 and byte-length checks against the existing immutable ASAP manifest. ASAP is **CC BY-NC-SA 4.0, for noncommercial research only**. No third-party corpus scores enter the public application, package or GitHub Pages artifact.

## Run and review

```bash
FG04B3D_REPORT=artifacts/fg04b3d-asap-source-diagnostics.json npm run research:fingering:asap:xml-midi
```

The PR pipeline produces a JSON artifact with safe per-work counts of original source MIDI zero notes, XML grace/repeat/ending markers, and previous alignment refusal reasons. Previous successful source alignments remain protected against regression. Network or source-integrity failure makes the CI step fail; an unsupported/zero event does not become an invented success.

The original FG-04B3b strict note matching, exact 2-ms time comparison, FG-04B2 candidate evaluation and *production* MIDI playback are unchanged. The diagnostic scanner **never supplies timings or notes back to the matcher**.

## Musical interpretation and next development

A zero-tick `NoteOn`/`NoteOff` pair is a fact about the MIDI encoding, **not** proof that an original score note should be deleted, stretched or played with a particular finger. The MusicXML score may be a separate edition or contain grace notes, articulation, repeat expansions, ornamental performance choices or exporter artifacts. The lexical counts indicate where to investigate, but **do not prove** how those constructs sound.

Next musical validation must perform exact source-event/adjudicated score comparisons before choosing any safe repeat/grace playback realization. A corrected MIDI file could be created only as an **explicit, reversible, source-traceable candidate**, never as a silent modification of the pinned score. Until an independent pianist reviews candidates and original notation, **production automatic fingering remains NO-GO**.

## Non-negotiable regression scope

- Preserve **GeneralUser GS 2.0.3 (SF2)** and **MuseScore General (SF3)** banks, their exact hashes and licenses, all audio DSP and PCM worklets, and the 256-program real-audio GM test.
- Preserve MAESTRO searchable catalog and original MIDI downloads, Web MIDI/Wait/Tempo/Listen timing, original 14 transparent owner hand PNGs, original MusicXML note identities and user corrections.
- Require all existing Node, actual Chromium, SoundFont and MAESTRO tests and the new independent diagnostic tests to pass. Update README in this same release.

[FG-04B3c evidence](FG-04B3C-ASAP-REFUSAL-TRIAGE.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [SoundFont acceptance](SOUNDFONT-ORCHESTRATION.md).
