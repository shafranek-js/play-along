# MAESTRO v3.0.0 integration — MAE-01/MAE-02

**Status (2026-10-12):** first research-only, local/offline metadata gate and deterministic 24-record QA selection. **Not** a production library integration, MIDI-event profiling, hand/finger ground truth, or a completed real-data validation.

## Source and permitted use

- Official reference: https://magenta.tensorflow.org/datasets/maestro
- Dataset owner: **Google LLC**. Release: **MAESTRO v3.0.0**.
- License: **Creative Commons Attribution-NonCommercial-ShareAlike 4.0** (CC BY-NC-SA 4.0). Attribute the dataset and document modifications if sharing derivatives; respect NonCommercial and ShareAlike requirements. Public repertoire distribution requires separate compliance review.
- Metadata: `maestro-v3.0.0.csv`; official MIDI archive: `maestro-v3.0.0-midi.zip` (56 MB compressed).
- Official MIDI ZIP SHA256: `70470ee253295c8d2c71e6d9d4a815189e35c89624b76d22fce5a019d5dde12c`.
- Official count: **1,276 recordings**, **962 train**, **137 validation**, **177 test**, about **198.7 h**. Version 3 excludes six recordings with accompanying string quartet; do not mix v2/v3 split metadata.

## How to reproduce (Node 22+)

Download the official CSV and optionally the MIDI-only ZIP **outside the repository**. Do not commit MAESTRO source music, recordings or license-restricted derivatives to the code repository.

```bash
npm run research:maestro:plan -- --csv /path/to/maestro-v3.0.0.csv --out /tmp/maestro-qa-manifest.json
# Verify the official ZIP bytes as well:
npm run research:maestro:plan -- --csv /path/to/maestro-v3.0.0.csv --zip /path/to/maestro-v3.0.0-midi.zip --out /tmp/maestro-qa-manifest.json
npm run test:maestro
```

On Windows use quoted local paths such as `--csv "C:\data\maestro-v3.0.0.csv"`. Without `--out` the manifest is printed to stdout. No download, archive decompression, MIDI parsing, browser storage, server or network request occurs.

The script validates CSV quoting/structure; required metadata columns; safe relative MIDI/WAV paths; uniqueness; finite positive durations; official row and split totals. If supplied, the ZIP hash is streamed and checked against Google's published digest. A hash check authenticates the **archive bytes**, not an individual MIDI-to-metadata mapping.

## Selection contract

The selected 24 records use **16 train / 4 validation / 4 test**, rotating duration quartiles (shorter/longer/lower-middle/upper-middle) and preferring composer and title diversity. Selection is deterministic for the same metadata regardless of row ordering. Metadata only is written to the JSON manifest, with per-record relative MIDI path, duration, year, split, selection bucket and dataset attribution.

This is a reproducible **metadata-diverse candidate corpus**, not yet a verified complexity-balanced musical benchmark. Metadata does **not** establish hand identity, finger identity, polyphony, velocity distribution, pedal usage, music notation, or pedagogical difficulty. The `archive_sha256_verified`, `individual_midi_verified`, and `performance_complexity_profiled` flags must never be conflated.

## Isolation and release gates

1. **MAE-01 — implemented:** Strict official CSV validation and optional streamed archive SHA256 verification; no original MIDI files committed. Synthetic negative/positive test fixtures.
2. **MAE-02A — implemented:** Deterministic metadata-diverse 24-record candidate manifest; split-specific quotas and provenance.
3. **MAE-02B — pending real-data execution:** Obtain/verify the official archive, check that every selected path exists in it, parse each selected MIDI locally, record polyphony, note density, pitch range, velocity distribution, repeated pitches and CC64/66/67 coverage; freeze exact per-file SHA256 and refine sampling. No empirical coverage claims before this.
4. **MAE-03 — pending:** Golden-event/regression corpus for tempo, pedal, concurrent notes, MIDI format/timebase and memory/performance safety, with explicit acceptance against Play Along's Wait/Tempo/Listen invariants.
5. **MAE-04/05 — conditional:** A curated catalog or practice excerpts only after rights review, provenance labels, and a supported lazy-loading/storage path.
6. **MAE-06/07 — research:** Expressive performance comparison and source-independent RH/LH inference. MIDI does **not** indicate anatomical fingers. Do not promote inferred fingering to FG-04 learner guidance without pianist-validated author/hand annotations.

The existing `FG-04B` source-authorized fingering corpus remains separate. Source MusicXML annotations retain authority; external MIDI performances are **never** used to fabricate next-finger hints, rewrite user corrections, change the 14 approved PNG poses, or perturb Wait/Tempo clocks.

## Test evidence and limitations

`tests/maestro-corpus.test.mjs` covers malformed CSV, quoted CSV content, exact official counts, rejection of changed splits, duplicate/unsafe paths, invalid durations/splits, deterministic selection, provenance claims and sparse selection pools. Locally, 9/9 synthetic Node tests passed before the GitHub PR. The real Google CSV and ZIP were not available inside the code execution environment and therefore **real-data output and ZIP validation are not yet claimed**.

No application/runtime code, network integrations, learner-facing tabs, or generated scores are changed in this phase. Each release also updates `README.md`; production gates must still run standard build/Node/Chromium CI.
