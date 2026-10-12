# FG-02J — Independent polyphonic fingering evidence gate

**Status:** offline and external-source discovery research. No learner-facing automatic finger assignments.

## Why this phase is needed

FG-02I v0.10.40 routes single-hand monophonic runs to FG-02H and overlapping/chord islands to FG-02B. Although 203 unit tests passed and the full set of 148 **previously seen** Piano Protege Stage 3 notes retained their authored numbers, the five previous scores had **no intra-hand chord islands**. They therefore provide **no independent evidence of polyphonic fingering accuracy**.

FG-02J begins a new *source qualification* stage rather than presenting synthetic chord tests as expert accuracy.

## Candidate independent source and legal constraints

Research candidate: [PianoVAM v1.1](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1) (Kim et al., ISMIR 2025). Unlike the previous manually authored Piano Protege exercises, PianoVAM is a multimodal performance collection. Its [associated tooling](https://github.com/yonghyunk1m/PianoVAM-Code) describes **11 manually annotated recordings** in the `Fingering_GT` directory.

**Data license: CC BY-NC-SA 4.0** — noncommercial use restriction and share-alike attribution. It is **not** interchangeable with the preceding Piano Protege CC BY-SA 4.0 license. Do not copy PianoVAM annotations, video, recordings or detailed performer records into the MIT/ordinary production code or GitHub Pages. The benchmark is separately marked as research; obtain additional permission if a future commercial or redistributive use is desired.

The [PianoVAM dataset card](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1) describes MIDI and TSV note labels:
`onset`, `key_offset`, `frame_offset`, `note`, `velocity`.
**Those five TSV columns do not contain finger number or hand identity.**
Audio/pedal offsets are different from key release; do not use `frame_offset` to assert a physically held key.
An independent manually annotated `Fingering_GT` stream must be inspected and accurately aligned to the performed note events. A string match on MIDI pitch is NOT an authoritative cross-hand or finger association.

## What this PR implements

`scripts/fingering-polyphony-source-discovery.mjs` performs a **bounded metadata-first check**:

1. Fetch dataset metadata, confirm source commit SHA and declared upstream license.
2. List files in `Fingering_GT` using the fixed revision; do not assume its presence based only on documentation.
3. Inspect at most one **small text file**, looking at field names and format, not full note contents. No audio/video or performer identifier is downloaded or reported.
4. If the source has moved, is unavailable, changes license, has unsupported format, or lacks verified event alignment, return `eligible:false` with a specific reason. Do not fabricate zero-error percentages.
5. `sourceReadinessGate` separately requires verified `RH/LH`, a valid 1..5 finger for the same note identity, an established count of matched notes, and confirmed simultaneous within-hand voices **before** research evaluation is permitted.
6. Even if the source passes this **structural** gate, `productionAllowed:false`: this is not expert pedagogical approval.

Run `npm run research:fingering:polyphony-source` to generate the report (requires source-site access). CI archives `artifacts/fg02j-polyphony-source.json`. Run `npm test` for offline licensing, movement, revision and failure-gate tests.

## First source discovery CI result and exact event alignment

First run: [PR #18 CI 38210752540](https://github.com/shafranek-js/play-along/actions/runs/38210752540). It confirmed:

- Actual **11** `Fingering_GT/*.tsv` files, distinct from the ordinary MIDI-derived `TSV/` files.
- Dataset commit pinned: `1f039ab9d6128626bff708faad6472d220b50eaa`.
- Manifest and license: `CC BY-NC-SA 4.0`.
- Annotated file schema: `onset, key_offset, frame_offset, note, velocity, hand, finger`.
- The initial status was **SCHEMA_ALIGNMENT_NOT_VERIFIED**: this correctly refused to report a musical accuracy percentage.

Follow-up `scripts/fingering-polyphony-alignment-probe.mjs` now downloads only these 11 bounded small text GT files and their corresponding MIDI-derived TSV tables at the **same exact commit**. It verifies all five event fields with six-decimal exact matching in a multiset, detects missing or duplicate events, stores **SHA-256 digests** and produces aggregate hand/finger value distributions. No raw notes or personal performance data are written into the report.

Until the value coding, hand-specific simultaneous note coverage, source-event bijection and independent human annotation validity are checked, `perNoteHandFingerReady` and `polyphonicCoverageVerified` remain false. This separation ensures a valid file *format* cannot be mistaken for validated per-note fingering data.

## Verified partial annotation and independent closed-island benchmark

The [first full alignment probe (CI 38211055099)](https://github.com/shafranek-js/play-along/actions/runs/38211055099) confirmed:

| Evidence | Count |
|---|---:|
| Recordings with external finger GT | **11** |
| Original MIDI-derived TSV note events | **32,525** |
| Source GT finger-annotated events | **1,800** |
| GT events exactly matching MIDI source | **1,800 / 1,800** |
| GT event records not in MIDI source | **0** |
| Original performance events without finger GT | **30,725** |
| Original source note coverage | **5.53%** |

Fingering GT codes are `L/R` and `1..5`. The annotation stream is a true **partially annotated subset** of MIDI, not a one-to-one annotation of the entire recording. Requiring a full 32,525-note GT would be incorrect; treating all unlabelled notes as absent from the score would be worse.

`scripts/fingering-independent-polyphony-benchmark.mjs` implements a strict, source-complete population:

1. Bind every annotated note to a **unique** original MIDI-derived TSV event using the five event columns and six-decimal equality.
2. Partition **all original source notes** into connected overlapping key-hold components using `onset` and `key_offset`, never `frame_offset` (pedal sustain is not an occupied finger).
3. If even one note in a component lacks a ground-truth hand/finger, exclude **the whole component** and count its annotated and nonannotated notes separately.
4. Select only complete components containing **two distinct simultaneously held keys in the same explicitly labelled hand**. An ordinary LH/RH duet does not by itself qualify as same-hand polyphony.
5. Run the unchanged FG-02I score router with **no source fingers injected** and separately with all author fingers fixed. Report exact source-note agreement, coverage, rejection, source conflicts, and full-island exact matching. No score or original source finger lists are written to the GitHub artifact.
6. Even if FG-02I matches the source, keep `automaticLearnerFingering:false` and `commercialDataUseApproved:false`.

This is independent of prior Piano Protege *source authors and recordings*, but the available GT may not represent a consensus of professional pianists and only a small fraction of each full performance is annotated. Accordingly, a high percentage on the narrow eligible population must never be presented as overall musical accuracy.

Run `npm run benchmark:fingering:independent-polyphony` for the source-complete count and aggregate comparisons, or `npm test` for offline tests of incomplete chords, held-key occupancy, cross-hand accompaniment and source-finger integrity.

## Publication / quality decisions

- A published file tree is **not** evidence of successfully aligned ground-truth fingers.
- Source metadata alone does **not** prove that held notes and chords are correctly attributed to RH/LH or that the piano fingerings are pedagogically ideal.
- Do not compute chord accuracy using GT labels whose MIDI event identity is ambiguous.
- All previous FG-02E locked scale data and FG-02G/H source evidence remain frozen.
- The current source evaluation is a discovery stage, **not** an independently validated polyphonic model benchmark.
- Source discovery status and missing properties must remain documented in README and CI.

**Release gate: NO-GO on production auto-fingering and training use until data eligibility, expert adjudication, full coverage, player UAT, and author-vs-suggested provenance have all passed.**

## Next engineering phase

After confirming a usable machine-readable fingering GT format and permissions:

1. Pin one source commit and individual file SHA-256s; establish exact MIDI-to-finger matching, note count coverage, hand ownership and intra-hand concurrent keys.
2. Define untouched evaluation splits before inspecting predicted fingers. Preserve refusals and ambiguities as explicit coverage failures.
3. Apply unchanged FG-02I to verified excerpts; report same-onset chord exact-match, sustained-key occupancy and author-anchor preservation separately.
4. Obtain independent piano-teacher adjudication before enabling any automatically chosen finger as a learner suggestion.

