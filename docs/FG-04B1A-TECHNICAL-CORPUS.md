# FG-04B1a — Pinned MusicXML Technical Corpus (v0.10.56)

**Status:** technical fixture acquisition and integrity verification only.
**Scope:** 16 MusicXML notation-engine edge cases; **0 independent repertoire pieces**, **0 externally adjudicated fingering labels**, and **0 Hand-thesia-generated candidate pairs**. This stage is a support tool for FG-04B, not completion of the planned 10–20 **real musical works** corpus.

## Source and permission

The fixtures are published in [w3c-cg/musicxmlTestSuite](https://github.com/w3c-cg/musicxmlTestSuite) under the **MIT license**, with attribution to Reinhold Kainhofer / GNU LilyPond and Michael Scott Asato Cuthbert. Source revision is pinned to `77c19f7e819154c70ca1a1992e80dcda8ff82fea`; the original source contains 182 MusicXML files. The 16 selected fixtures are referenced, **not redistributed**, in `research/fg04b1a-musicxml-corpus.json`. The manifest contains the exact Git blob SHA-1 and byte length of each file; the CLI fetches each file using a commit-pinned raw URL and computes the Git blob hash locally.

## 16 fixture categories

| Category | Count | What is exercised |
|---|---:|---|
| Chords | 1 | A short Schubert-based chord example |
| Pickup | 1 | Chords in pickup measures |
| Polyphony | 3 | Different voices, multiple voices and mid-measure clef changes |
| Arpeggios | 2 | Regular and crossed arpeggios |
| Ties | 1 | Tie source segments |
| Glissando | 1 | Glissando notation |
| Multi-staff | 2 | Grand staff and chords across staves |
| Cross-staff | 1 | Staff reassignment |
| Repeats | 2 | Ordinary repeat and alternate ending |
| Tuplets | 1 | Nested rhythmic subdivisions |
| Grace | 1 | Grace notes |
| **Total** | **16** | Structural and notational regressions |

Most are **tiny synthetic tests**, and the Schubert-derived example is not a full musical performance. They cannot be counted as sixteen real compositions or proof of fingering accuracy. Some intentionally exercise notation that Play Along may not support. The current CLI verifies *source integrity* and text-level MusicXML envelope only; it **does not** claim importer correctness, performance correctness, teacher-approved fingering or successful use of the FG-04B2 MIDI comparator on these samples.

## Usage and checks

Run `npm test` for **offline mocked** manifest, SHA-1 and failure-path tests.

Run `npm run research:fingering:corpus:technical` with network access to fetch and verify all 16 committed-version sources. No source files are saved; the command emits only fixture IDs, category and counts. To retain an inspectable report use:

```bash
FG04B1A_REPORT=artifacts/fg04b1a-technical-corpus.json npm run research:fingering:corpus:technical
```

Pull-request CI runs this acquisition and uploads its report. A network error, source mismatch, SHA-1 mismatch, wrong byte count, malformed manifest or inappropriate redirect is an **explicit failure**, not a silent skip.

## Next real-data milestone: FG-04B1b

Freeze 10–20 **licensed, actual music pieces** (not technical test snippets) as MusicXML with exact content hashes, publisher/source/license/edition links, known instrument/hand/voice and original note IDs. Include beginner scales, inversions, repeated notes, shift passages, chords, polyphonic overlap, tied notes and crossings; separate works with verified author fingering from those without. Compare MasterPiano/PianoPlayer candidates through FG-04A; use Hand-thesia output only through the source-MIDI reference integrity probe FG-04B2. Preserve exact tempo, onset and offset and report unmatched mappings, author conflicts and refusals. Have an independent pianist assess candidate technique before opening FG-04C/D learner auto guidance.

### Hand-thesia code reuse gate

The user reported that upstream was created using Claude Opus. That does not constitute an explicit grant to copy or redistribute source. At this date, the upstream repository does not declare a source-code license. Continue independent implementation and protocol interoperability; revisit direct copying only if a license or explicit permission from a rights-holder appears. Neither this technical corpus nor FG-04B2 imports Hand-thesia Python.
