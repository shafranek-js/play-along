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

