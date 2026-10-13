# FG-04B4-R5 — Original-source disjoint pseudo-only corpus gate (v0.10.84)

## Why this exists

FG-04B4-R4 verified **26,879 automatic video-derived hands of 32,525 original notes** in eleven previously studied PianoVAM performances; on the same human-reviewed 1,800-note subset, 1,588 had automatic labels, 1,576 hands matched human GT, 12 were wrong and 212 had no hand. Conditional **99.24% agreement** belongs to the upstream PianoVAM *pseudolabel generator*, **not** Play Along's hand separator and **not** an unseen independent performer holdout. The previous eleven performances have already shaped our research hypotheses (FG-04B4-R1/R2); using them for pseudo-label training and calling them a blind validation set would be leakage.

This stage establishes the **recording-level exclusion boundary before any possible training**. It does not train a solver, evaluate accuracy on unknown manual labels, or generate teaching finger suggestions.

## Pinned source census and split rules

Source dataset: [PianoVAM](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1), **CC BY-NC-SA 4.0 (NONCOMMERCIAL research only)**. The audit reads only text manifest listings for directories `TSV/` (original MIDI-derived note events), `Fingering/` (automatically video-derived pseudo hands/fingers) and `Fingering_GT/` (human-annotated sparse GT) from one immutable revision:

`1f039ab9d6128626bff708faad6472d220b50eaa`.

The driver does not request audio, video, 3D handskeletons, or licensed raw label files for export. Exact release gates are:
- All three independently fetched directory trees are bounded and use strictly validated TSV filenames; pagination, duplicate or unsafe names, missing source TSV/pseudolabel correspondence, or incomplete manifest refuse.
- The `Fingering_GT/` filename set must **exactly match** the eleven previously inspected, independently specified `EXPECTED_NAMES` from FG-02J; **no extra or missing human recording can be treated as a pseudo-only candidate**.
- **Pilot size gate (measured source-safety rule):** the existing common FG-02J fetch/parse boundary is **350,000 characters** per source. Some valid original performances exceed it. The pilot therefore selects only pseudo-only recordings whose BOTH original `TSV/` and automatic `Fingering/` file sizes are independently reported as **1–350,000 bytes** by the immutable upstream tree metadata. Anything oversized or lacking source size is **still counted in the full disjoint pool**, but excluded from this lightweight pilot and reported in a separate bounded-size exclusion count. This choice depends ONLY on upstream source file size, **not** an automatic hand label, finger, music composition or agreement. The eight fixed hash-ranked pilot cases are selected AFTER this restriction. No global source-size validation is weakened; no claims about the skipped large performances.
- A pseudo-only eligible recording must have original TSV **and** automatic Fingering text, and must **NOT** have appeared anywhere in `Fingering_GT/`. The eleven original manual-GT recordings are **removed from the entire candidate pool**, not merely removed from sample output.
- The full cohort is deterministic at a pinned revision. Fixed SHA256 cohort digest and no raw filenames are emitted in CI evidence. An exact deterministic eight-record research pilot is selected by hashed original filename rank, with zero overlap with GT. Pilot names are *internal to the tool* and are never exported in the report.
- The **pilot's eight pairs** are fetched as bounded noncommercial research TSVs, every row checked against original MIDI-derived note `onset,key_offset,frame_offset,pitch,velocity` in **exact original order**. Unknown `Noinfo` is an abstention; invalid hands/finger codes and mismatched rows refuse. Original indistinguishable note-event duplicates are **counted as an identity ambiguity**, not hand/finger authority.
- The report contains only the full-cohort counts, SHA256 manifest fingerprints, **aggregate** eight-record pilot numbers (exact events checked, hand-known, Noinfo, finger-known, hand-only and duplicate event groups) and eight source file content SHA256 pairs. No original notes, pitch/timing sequences, finger labels, timestamped filenames, individual recording coverage/errors, photos or performer identifiers are exported.

## Very important scope distinctions

1. Filename-level disjointness is necessary, but **does not establish pianist-level or musical composition-level independence**: identical pianists/compositions could be present in other source recordings. The dataset's metadata splits are not blindly trusted as independent participants. Therefore this pilot is **not a sealed external test set** and cannot certify anything about autonomous RH/LH accuracy.
2. These recordings have **no independently checked manual GT** in the pilot. "Hand coverage" is simply the proportion of non-`Noinfo` *automatic labels*, **not hand correctness**. Do not attribute R4's 99.24% conditional manual agreement to this new pool.
3. The automatic labels **remain low-confidence pseudolabels**; we never combine them with composer `musicxml` provenance, source/user authenticated hand/finger pairs, FG-04D1 identity gates or the student UI. The research solver remains frozen and disconnected from the pilot.
4. Strictly **no commercial reuse** of the PianoVAM source, no training pipeline, model fitting, hyperparameter tuning, learner auto fingers or learner hand-motion upgrade. The original 14 owner-supplied PNGs, MIDI note times/pedal/tempo, MusicXML, SoundFont and MAESTRO are unchanged.

## How to reproduce and verify

`node --test tests/pianovam-pseudo-cohort-gate.test.mjs` exercises fourteen adversarial tests, including altered/missing source and GT directory entries, filename escape, pilot overlap, synthetic original event mismatch, forged `Noinfo` + finger, and eleven-recording exclusion invariants. `npm run research:fingering:pseudo-disjoint-pilot` downloads only three pinned manifest pages and the original/automatic TSV pairs of the deterministic eight recording pilot. PR CI archives only `artifacts/fg04b4-r5-disjoint-pseudo-pilot.json`; full other Node, Chromium, source provenance, MAESTRO and SoundFont gates must pass.

**Acceptance:** correct strict real pinned manifest census and aggregate pilot source-event integrity. This stage establishes **NO** real musician label reliability on pseudo-only cases and remains **NO-GO** for production or experimental training without a separately licensed research decision. Hand-thesia progress remains **35%**.

Next scientific gate: verify allowed research use and pianist/composition partition via independently checked upstream metadata, obtain an actually **unseen performer-annotated** source separate from original 11 and assign training/evaluation populations *before* changing the solver.

[FG-04B4-R4 original video pseudolabel audit](FG-04B4-R4-VIDEO-PSEUDOLABEL-AUDIT.md) · [FG-04B4-R2 source error strata](FG-04B4-R2-FAILURE-STRATIFICATION.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
