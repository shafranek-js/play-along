# MAESTRO v3.0.0 integration — MAE-01/MAE-02

**Status (2026-10-12):** MAE-01/02A metadata selection implemented; MAE-02B archive-membership and MIDI event profiler added in v0.10.59. The official dataset must pass its independently downloaded, checksum-verified CI run before any claim of real-data coverage. **Still not** a user-facing catalog, not score/fingering ground truth, and not a teaching-difficulty ranking.

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

## MAE-02B — actual ZIP/MIDI quality profiling (v0.10.59)

**Prerequisites:** official MAESTRO v3.0.0 CSV and MIDI-only ZIP, Node 22. Keep raw files outside the repo. MAE-02B does not require installing Python, external MIDI libraries or a new browser dependency.

```bash
npm run research:maestro:audit -- --csv "/path/maestro-v3.0.0.csv" --zip "/path/maestro-v3.0.0-midi.zip" --out "/path/maestro-real-audit.json"
npm run test:maestro
```

The independent `MAESTRO v3.0.0 Real MIDI Research Audit` GitHub Actions workflow downloads the official CSV and ~56 MB MIDI-only ZIP on PR and on manual invocation. A separate SHA256 verification precedes parsing. The resulting 24-performance **derived metadata-only JSON report** is uploaded as a short-lived CI artifact; the original MIDI ZIP and individual song bytes are never published as artifacts or committed.

The audit rejects a non-official archive by SHA256, checks all **1,276 MIDI file paths** against the official CSV without duplicates, reads selected entries using bounded central-directory and local-header checks, verifies per-file CRC32, and runs a read-only SMF 0/1 parser. It reports: actual note-on count, PPQ, track/tempo count, note density against metadata duration, pitch range, max concurrently held notes, velocity min/P10/median/P90/max, repeated same-pitch attacks within 250 ms, CC64/66/67 counts and integrity anomalies. Each selected file receives a SHA256; the report retains only metadata and aggregate note statistics — no raw performance note arrays.

This is a **performance-complexity profile**, not a calibrated teaching level. It does not infer left/right hand or fingers, prove that a MIDI trace matches an independently notated score, calculate musical difficulty, or verify physical pedal technique. Simultaneous held-note count is a key-hold approximation (pedal sounding voices differ); tempo processing is for offline measurement only.

**Fail closed:** invalid MIDI status/VLQ, unsupported SMPTE timing, excessive tracks/notes, corrupt or traversing ZIP paths, CRC mismatches, bad counts or data inconsistencies fail CI rather than silently labelling them valid. The selected 24 recordings remain the original MAE-02A metadata sample. Measured metrics are now available to refine actual musical coverage in a separate deliberate MAE-02C review.

**Evidence:** `tests/maestro-midi-audit.test.mjs` uses synthetic stored and DEFLATE archives with 1,276 path entries plus deliberately corrupt data; the GitHub Action is the authoritative real-file validation. Do not claim real recordings were verified until the Action has completed successfully.

## Selection contract

The selected 24 records use **16 train / 4 validation / 4 test**, rotating duration quartiles (shorter/longer/lower-middle/upper-middle) and preferring composer and title diversity. Selection is deterministic for the same metadata regardless of row ordering. Metadata only is written to the JSON manifest, with per-record relative MIDI path, duration, year, split, selection bucket and dataset attribution.

This is a reproducible **metadata-diverse candidate corpus**, not yet a verified complexity-balanced musical benchmark. Metadata does **not** establish hand identity, finger identity, polyphony, velocity distribution, pedal usage, music notation, or pedagogical difficulty. The `archive_sha256_verified`, `individual_midi_verified`, and `performance_complexity_profiled` flags must never be conflated.

## Isolation and release gates

1. **MAE-01 — implemented:** Strict official CSV validation and optional streamed archive SHA256 verification; no original MIDI files committed. Synthetic negative/positive test fixtures.
2. **MAE-02A — implemented:** Deterministic metadata-diverse 24-record candidate manifest; split-specific quotas and provenance.
3. **MAE-02B — v0.10.59 implementation and CI validation:** Offline archive membership/CRC checks and 24 real MIDI performance profiles. Results valid only after successful official-dataset CI run. MAE-02C may revise the candidate selection to improve measured complexity coverage.
4. **MAE-03 — pending:** Golden-event/regression corpus for tempo, pedal, concurrent notes, MIDI format/timebase and memory/performance safety, with explicit acceptance against Play Along's Wait/Tempo/Listen invariants.
5. **MAE-04/05 — conditional:** A curated catalog or practice excerpts only after rights review, provenance labels, and a supported lazy-loading/storage path.
6. **MAE-06/07 — research:** Expressive performance comparison and source-independent RH/LH inference. MIDI does **not** indicate anatomical fingers. Do not promote inferred fingering to FG-04 learner guidance without pianist-validated author/hand annotations.

The existing `FG-04B` source-authorized fingering corpus remains separate. Source MusicXML annotations retain authority; external MIDI performances are **never** used to fabricate next-finger hints, rewrite user corrections, change the 14 approved PNG poses, or perturb Wait/Tempo clocks.

## Test evidence and limitations

`tests/maestro-corpus.test.mjs` covers malformed CSV, quoted CSV content, exact official counts, rejection of changed splits, duplicate/unsafe paths, invalid durations/splits, deterministic selection, provenance claims and sparse selection pools. Locally, 9/9 synthetic Node tests passed before the GitHub PR. The real Google CSV and ZIP were not available inside the code execution environment and therefore **real-data output and ZIP validation are not yet claimed**.

No application/runtime code, network integrations, learner-facing tabs, or generated scores are changed in this phase. Each release also updates `README.md`; production gates must still run standard build/Node/Chromium CI.
