# FG-04B1b — Frozen Real Piano MusicXML + MIDI Score Pairs

**Release:** v0.10.58 · **Scope:** research data acquisition only · **Status:** pending CI.  
**Dataset:** [ASAP: Aligned Scores and Performances](https://github.com/fosfrancesco/asap-dataset), Foscarin, McLeod, Rigaux, Jacquemard & Sakai, ISMIR 2020.  
**Source revision:** `afc815c75c42e83a79c03feb6da8a35e77d4c6b8` · **License:** CC BY-NC-SA 4.0, explicitly **noncommercial research only**. Do not copy this repertoire to the GitHub Pages public library, resell the dataset or package score bytes with a commercial release.

## What is now frozen

`research/fg04b1b-asap-score-manifest.json` records **16 distinct real piano-score entries**, each with source composer, repertoire title, musical focus, immutable repository revision, and BOTH `xml_score.musicxml` and `midi_score.mid` with exact upstream Git blob hash and size. Repeated movements may share a collection or opus; the number 16 counts **score entries**, not sixteen independent composers, opinions or pianist-reviewed annotations.

The corpus includes:

| Group | Actual repertoire entries | Intended source coverage |
|---|---|---|
| Bach | WTC I BWV 846 prelude and fugue | pattern/arpeggiation, multi-voice continuity |
| Beethoven | Sonatas No. 17/I and No. 11/II | extended sonata texture, repeats |
| Chopin | Etudes Op. 10/1, 10/3, Op. 25/1; Polonaise Op. 53 | large leaps, arpeggios, sustained melody, chords/octaves |
| Mozart & Haydn | Mozart Sonata No. 12/II, Haydn Sonata No. 39/I | classical phrasing and rhythmic articulation |
| Schumann | Arabeske; Kreisleriana I | overlapping voices, faster movement |
| Schubert | Impromptu Op. 90/3; Moment musical No. 3 | melody with accompaniment, changing chord positions |
| Liszt & Debussy | Liszt Concert Etude S.145/1; Debussy Pour le piano I | leaps, broad/chromatic figuration |

These categories are **research sampling intentions**, not evidence that a particular fingering technique was successfully recognized.

## Integrity protocol

`scripts/fingering-asap-real-score-audit.mjs` checks the manifest (16 unique IDs, file paths, SHA-1 Git blob hashes, byte sizes, CC-NC-SA licensing, minimum composer and category diversity), downloads both source files from commit-pinned URLs, and refuses any mismatch. MusicXML receives a minimal score-partwise envelope check, **not semantic MusicXML parsing**. MIDI receives a header check and a best-effort inspection using the existing strict FG-04B2 research parser. A strict parser refusal is recorded as `NEEDS_ADAPTER_REVIEW`, not hidden or claimed to be a valid musical match.

Raw XML and MIDI bytes are **not written** into the repository, test reports or production build. The JSON report contains file paths, aggregated tag counts, size, hashes and parser eligibility only. Third-party scores remain with ASAP Dataset.

Run locally with network:

```bash
npm run research:fingering:corpus:asap
```

For inspectable artifact:

```bash
FG04B1B_REPORT=artifacts/fg04b1b-asap-scores.json npm run research:fingering:corpus:asap
```

Offline Node tests are included in `npm test`. PR CI runs both the actual pinned online audit and existing Node/Chromium regression suite and uploads a JSON evidence artifact.

**FG-04B3a update:** A pure normalized-score-events ↔ reference-MIDI one-to-one matcher is available in [FG-04B3a](FG-04B3A-EVENT-ALIGNMENT.md), with exact temporal checks and conservative refusals. It has **not yet** been connected to an independently audited MusicXML parser for the 16 ASAP files; do not call the frozen source pairs semantically aligned until FG-04B3b.

**FG-04B3b progress:** A conservative, independently implemented raw MusicXML 3.x notation-to-score-event adapter is now available; the [FG-04B3b real 16-score audit](FG-04B3B-ASAP-XML-MIDI-AUDIT.md) records both definitive matches and explicit unsupported/refusal reasons on the pinned ASAP pairs. Event matches use the original MIDI score tempo clock; source tempo, repeats/ornaments and finger correctness are not independently proven.

## Precise limits / next gate

- **Paired source availability** does not establish exact MusicXML-to-MIDI note identity, ties, repeat unfolding or onset/release equality. These must be compared in a later independently validated, source-aware adapter before running FG-04B2 note alignment.
- The ASAP score files are **not an independent set of known correct finger numbers**. Composer scores, nominally aligned score MIDI and expressive performance MIDI are three different information layers. Performance deviations must never be treated as source note edits, nor as physical finger measurements.
- No verified Hand-thesia, MasterPiano or PianoPlayer candidate outputs are bundled or scored yet. Finger quality, exact agreement, ambiguous refusal coverage, expert validation and physical playability remain **not evaluated**.
- This stage makes **no** changes to playable notes, Wait/Tempo clock, 14 original owner-provided PNG hands, manual edits or learner guidance.
- There is still no declared Hand-thesia source-code license despite the user report that the code was produced with Claude. Continue protocol interoperability and independently implemented algorithms; direct source reuse requires appropriate authorization.
- **Next:** FG-04B3 source MusicXML ↔ score MIDI identity and timing gate, followed by actual external candidate import and pianist-reviewed accuracy. FG-04C/D learner automatic fingering remains NO-GO.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-04B1a Technical Test Corpus](FG-04B1A-TECHNICAL-CORPUS.md) · [FG-04B2 MIDI Marker Alignment](FG-04B2-MIDI-ALIGNMENT.md).
