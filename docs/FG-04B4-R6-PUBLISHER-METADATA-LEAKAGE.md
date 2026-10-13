# FG-04B4-R6 — Publisher performer/work collision audit, not independent ground truth (v0.10.85)

## Why another gate is required

FG-04B4-R5 excluded **all eleven previously inspected** PianoVAM human-GT recordings from the pool of **95 automatic-pseudolabel-only** recordings. Eight bounded files contained 10,318 exactly verified MIDI-derived source events, including 8,567 automatic RH/LH+finger labels and 1,751 `Noinfo` unknowns. This was a **recording-filename exclusion only**; different files do not establish distinct piano players or unrelated repertoire.

The official publisher's [PianoVAM metadata.json](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1/blob/main/metadata.json) at exactly the same frozen source revision contains, for each original recording, `record_time`, `P1_name`, optional `P2_name`, `composer`, `piece`, `performance_method` and `split`. The dataset card calls this the canonical v1.1 split and explicitly notes source sync changes. Crucially, **publisher train/valid/test splits cannot be assumed independent of performers or compositions**. The dataset license remains **CC BY-NC-SA 4.0 — noncommercial research only**.

## Fixed original source and fail-closed procedure

Original pinned revision: `1f039ab9d6128626bff708faad6472d220b50eaa`. Reuse the existing FG-04B4-R5 three bounded directory listings (`TSV/`, automatic `Fingering/`, human-reviewed `Fingering_GT/`) and the immutable `EXPECTED_NAMES` of the previously studied 11 performers' recordings. Download only the **one bounded, pinned canonical `metadata.json`** (not video, audio, hand skeletons, performer images or fingering streams).

- Require the canonical metadata object to match the complete original source TSV census by **exact** `record_time` identity and multiplicity, with no missing, extra, repeated or malformed recording keys. Abort instead of guessing labels or filling blank source rows.
- Rebuild the *same* original 95 pseudo-only recording names and the *same* hash-ranked eight-record R5 pilot. Never use the metadata to **reselect** favorable examples or to change the manual-GT exclusion.
- Normalize performer strings and composer+work-title with Unicode NFKC, case folding and whitespace collapse only; no unsupported title/performer fuzzy equivalences. Include **both** P1 and P2 in every performer overlap check. Unknown second participants in explicitly multi-player sessions, unknown P1, unknown composer or unknown title cannot establish disjointness.
- Compare every pseudo-only original recording with **all eleven previously examined** manual-GT recording metadata. Categorize exact shared performer, exact shared composer+piece, both, neither, or missing/unknown, with complete separate full-95 and frozen eight-pilot summary tables. Split counts are separate source metadata evidence, **not** proof that training/test are distinct humans.
- If any human-reference performer/work metadata is missing, **withhold all no-overlap claims** for the full candidate pool. An empty exact-match result remains only "no known identical publisher metadata"; it is **not** independent verification of performer identity, composition edition, learner technique, or ground-truth accuracy.
- The report contains only aggregate category totals, total original-recording counts, canonical metadata SHA256, source manifest hashes and fixed source-split labels. **No performer name, composer or piece, source filename, per-recording collision, exact musical score, private metadata row, note/finger array or timestamp** is exported.

This is a provenance and **potential leakage detection** check, **not** a model-accuracy evaluation. It does not train or tune the hand separator, validate piano finger trajectories, alter source MIDI/MusicXML, or use these source-derived automatic labels as teacher GT. No publisher-name metadata is considered consent to commercial use.

## Verification and release conditions

`node --test tests/pianovam-metadata-leakage-gate.test.mjs` covers independently constructed 107-original/106-pseudo/11-reference source manifests, both-participant collisions, composition repetition, unknown/malformed GT, tampered canonical metadata, publisher split cross-over, privacy, and mocked exact pinned metadata download. `npm run research:fingering:publisher-metadata` performs a real noncommercial publisher-source read and writes aggregate JSON only when `FG04B4_R6_REPORT` is supplied.

The release test requires **exactly 107 source recordings, 106 original pseudolabel files, 11 previously studied manual-GT sources, 95 pseudo-only sources and 8 unchanged pilot sources** at the pinned revision. A failure blocks the research CI; do not switch silently to mutable `main`.

The original PianoVAM `Fingering/` hand/finger labels remain low-confidence **automatic pseudolabels**. They are not source composer notation, new independent musician GT or a verified source of RH/LH gestures. They must not flow to lesson hints, hand PNGs, or any commercial product. Separate performer-disjoint **human-labeled** source data, rights/consent for intended use and independent pianist UAT are still needed. **Hand-thesia progress remains 35%; production automatic fingering and hand assignment stay NO-GO.**

[FG-04B4-R5 immutable source cohort](FG-04B4-R5-DISJOINT-PSEUDO-COHORT.md) · [FG-04B4-R4 manual vs automatic notes](FG-04B4-R4-VIDEO-PSEUDOLABEL-AUDIT.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
