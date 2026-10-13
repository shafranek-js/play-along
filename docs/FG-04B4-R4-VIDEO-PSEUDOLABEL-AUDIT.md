# FG-04B4-R4 — Verify upstream automatic PianoVAM hand pseudolabels vs manual GT (v0.10.83)

## Goal and strict provenance

PianoVAM v1.2 provides two distinct kinds of annotation: `Fingering/` contains **automatically video-derived** hand/finger labels (including `Noinfo` when unsupported), while `Fingering_GT/` contains a sparse **human-annotated evaluation subset** (1,800 notes from 11 performances). Dataset authors report 99.2% hand agreement **among automatically labeled notes** on that manually annotated sample; this is an upstream self-evaluation, **not** independent data for Play Along. [Official dataset description](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1). License: **CC BY-NC-SA 4.0**, **noncommercial research only**.

FG-04B4-R4 independently reconstructs the comparison against exactly the **same existing** 11 human-reviewed performances as FG-04B4-R1/R2, using the frozen repository revision `1f039ab9d6128626bff708faad6472d220b50eaa`. It does **not** download all 106 `Fingering/` recordings and does **not** claim new real held-out musician labels, physically verified joints, or a novel accuracy measurement on independent source data. It verifies whether automatic source-hand labels are sufficiently reliable for **future exploratory research** before considering larger-scale expansion.

## Original MIDI and label identity

For every one of the 11 names already pinned in `scripts/fingering-polyphony-alignment-probe.mjs`, fetch three small originals at exact revision:

1. `TSV/<name>.tsv` — original performance events, *no hand or finger*.
2. `Fingering/<name>.tsv` — **automatic video-derived pseudolabels**, never author or teacher notation.
3. `Fingering_GT/<name>.tsv` — original **human-annotated** hand+finger GT, sparse.

Every automatic label must have **exact same row count AND exact same original ordered MIDI event** across five independent fields: onset, key_offset, frame_offset, pitch, velocity (numbers normalized to six decimal places). A reorder, source event modification, duplicate or missing row fails the entire research audit. Human labels must map to original 5-field identities with GT count <= source multiplicity. If multiple original events share an indistinguishable 5-field identity, **quarantine every such ambiguous human label**, never assign it based on source array order. Duplicate/invalid human labels and unsupported automatic codes fail.

Allowed pseudolabels: `hand L/R` and `finger 1–5`, or `Noinfo` unknown. A missing automatic hand is **abstention**, not left/right by pitch. An automatic hand with no finger is hand-only evidence, **not** successful fingering. Any `Noinfo` hand paired with a numeric finger fails. No source finger labels may be fed into the current Play Along hand-splitter by this tool.

## Interpret denominators correctly

The aggregate-only report distinguishes:
- Automatic **hand coverage** of all original notes (11 source performances), versus **hand coverage on uniquely matched manual GT events**.
- Human-labeled events that receive an auto hand, and correct/incorrect hands **only among these proposed**. Incorrect hand directions are counted separately.
- Full **hand AND finger** agreement only among automatic numeric finger proposals, a stricter metric. Missing finger is an unknown finger, not a wrong numeric finger.
- All original manual GT event counts, number of quarantined ambiguous note identities, wrong/unknown labels. Percentages with zero denominators are `null`, not 0% or 100%.

Because the same 1,800 human notes have already been used to inspect FG-04B4-R1/R2 outcomes, neither pseudo vs GT agreement nor any future model tuned using them can be presented as **new blind hand-separation accuracy**. An automatically labeled note is never treated as source composer fingering, user-verified hand, independent ground truth, or a learner-visible hint.

The 11 source files and their three SHA256 hashes may appear in CI artifacts; **no raw performer event sequence, pitch/timestamp arrays, per-recording mistake profiles, numeric labels or video/audio** are stored. Project-owned generated code is independent of upstream algorithms.

## Measured, source-matched result (13 October 2026)

From [PR #84 initial full green CI](https://github.com/shafranek-js/play-along/actions/runs/38438624340) on pinned original PianoVAM v1.2: **11** recordings, all **32,525** original MIDI-derived TSV events matched automatically generated `Fingering/` rows **in exact order**, and **1,800** independent manual GT note records matched original event identities with **no indistinguishable-duplicate GT rows**.

| Measured population | Count / calculation |
| --- | ---: |
| All original notes in 11 recordings | **32,525** |
| All automatically assigned hands | **26,879 / 32,525 = 82.64%** |
| Original notes marked automatic `Noinfo` | **5,646** |
| Human-annotated benchmark notes | **1,800** |
| Auto-label hands present within manually annotated subset | **1,588 / 1,800 = 88.22%** |
| Auto-label hands missing within manually annotated subset | **212 / 1,800 = 11.78%** |
| Hands correct among **1,588** automatically labeled manual notes | **1,576 / 1,588 = 99.24%** |
| Hands incorrect among automatically labeled manual notes | **12 / 1,588 = 0.76%** |
| Combined hand **and finger** correct among automatically labeled manual notes | **1,520 / 1,588 = 95.72%** |
| Combined hand/finger wrong among automatically labeled manual notes | **68 / 1,588** |
| Correct hand of **all** original human-annotated notes (unknown included) | **1,576 / 1,800 = 87.56%** |

The 12 wrong hands comprised **4 automatic LH where human GT indicated RH** and **8 automatic RH where human GT indicated LH**. Among the reviewed subset, `Fingering/` returned no separate hand-only annotations: all 1,588 identified hands also supplied numeric fingers. The measured 99.24% agrees closely with the dataset publisher's own approximate 99.2% hand agreement, but this is **a reconstruction of the publisher's automatic pseudo-label validation on the same human benchmark**, **not** independent predictive validation of Play Along or all 106 video performances. The earlier Play Along result (0 unanchored hands; 325 proposed with seeded external anchors and 53 errors) is from a **different algorithm and different eligible subset** and cannot be compared as a matched head-to-head result.

**Safety decision:** even at 99.24% conditional agreement, 212 of 1,800 human-reviewed original events have no automatic hand label and **12 automatically labeled hands are explicitly wrong**. Automatically suggested labels must never be silently converted to teacher-approved source fingers, used to authorize animations, or included in user-facing Play Along hand hints. Keep **NO-GO** and Hand-thesia **35%** until verified independent/pianist tests outside this already-inspected GT subset.

## Tests, releases, boundaries

Run `node --test tests/hand-pseudolabel-evidence.test.mjs` and `npm run research:fingering:pseudo-hand-audit`. PR CI fetches original source TSV/automatic TSV/human GT for all 11 pinned recordings, verifies exactly **32,525** original source rows and **1,800** original GT rows, and emits an aggregate-only JSON report. A failure to fetch `Fingering/` at the pinned revision or any source mismatch **blocks the release**; it must not silently use mutable main or alternative web pseudolabels. MAESTRO, full Node, Chromium, SoundFonts and GitHub Pages must remain green.

**Production automatic hand separation/fingering remains NO-GO.** No changed learner hints, original 14 PNG images, MusicXML, MIDI, tempo, loop, pedal or playback. Hand-thesia progress stays **35%**.

**Next criterion for any actual improvement:** either additional independently hand-annotated and rights-cleared real performances outside the inspected 11, or full consented pianist UAT. Automatic PianoVAM finger labels may be used only as low-confidence **pseudolabels** in separately documented noncommercial exploratory hypotheses, with real human GT and train/test partitions kept distinct.

[FG-04B4-R1](FG-04B4-R1-REAL-HAND-GT.md) · [FG-04B4-R2](FG-04B4-R2-FAILURE-STRATIFICATION.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
