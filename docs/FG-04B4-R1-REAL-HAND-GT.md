# FG-04B4-R1 — Independent REAL performer hand-label benchmark (v0.10.80)

## Evidence and provenance

The four real ASAP MusicXML scores in FG-03D2/D3 had **zero complete original author hand+finger pairs**, so they could establish parser/refusal integrity but *not* measure correctness of hand separation. The project already has a better, externally sourced, independently collected **PianoVAM v1.1** subset: 11 recordings, **32,525 source MIDI-derived TSV events**, **1,800 matching annotated hand+finger rows** (5.53%). Source revision is locked to `1f039ab9d6128626bff708faad6472d220b50eaa`; each GT row must match its source note exactly on pitch, onset, physical **key_offset**, frame_offset and velocity (six decimal places). This is a partially annotated source; unknown GT notes are not treated as absent or labeled LH/RH by convention.

**Rights:** [PianoVAM dataset](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1), **CC BY-NC-SA 4.0**, noncommercial research only. Do not bundle recordings, TSVs or annotations in the app or redistribute original notes through benchmark reports. GitHub Actions downloads only bounded GT and original TSV source text from the pinned revision to ephemeral runner memory. The CI artifact contains aggregates and content hashes, never per-note pitches, timestamps, velocities, finger labels, hand sequences or MIDI audio/video.

## Strict independent test population

Reuse the previously validated FG-02J functions `bindGTToSource` and `closedPolyphonicIslands`, without changing either. Each original performance is partitioned into complete connected components of physically held overlapping keys, using **key_offset**, not pedal/recorded frame offset. Entire components with any unannotated original note are excluded. Only components with at least two distinct concurrently sounding physical keys of the same externally labeled hand qualify. This source population had **242 components / 1,467 complete notes** in FG-02J; FG-04B4-R1 additionally refuses GT/source identity ambiguity when two or more original rows share exactly the same five-field source key, rather than assigning their hand labels by arbitrary file order. Eligibility counts may therefore decrease; report the exact new denominators.

The research `separateHandsResearch` routine receives new minimal arrays of `noteId,pitch,start,duration`, with **no finger metadata and no GT hand data for any held-out note**. Two distinct protocols make leakage and inference limits explicit:

1. **Unanchored (MIDI only):** every source hand withheld; the intentionally conservative FG-04B4 algorithm normally abstains rather than choosing lower pitch as LH. Count correct, incorrect, proposed and unknown using **all** eligible notes.
2. **Oracle-seeded, source-assisted:** expose only the **earliest externally labeled note per hand** in each complete component as a fixed `authorHand` *research anchor*. Every other note's hand and every note's finger remain held out. The algorithm may use those actual anchor labels, and this condition **must not** be called autonomous hand separation. The anchor notes are **removed from the scoring denominator**, and the reported coverage and agreement use ONLY held-out notes. Not every eligible component has a held-out note.

Independently compare each proposed RH/LH to the original external performer GT. Never count fixed anchors as correct predictions. Report **coverage** (proposed/held-out), **conditional agreement** (correct/proposed), **false assignment rate** (incorrect/proposed), **abstention** (unknown/held-out) and conservative correct-among-all-held-out. Null rather than 0% is required when the denominator is zero. Keep individual refusal reasons and unresolved diagnoses as aggregate counts, not raw notes or per-performance fingering.

## Exclusions / quality limits

- One person's externally labeled hands/fingers are **performance annotations**, not universal pianist-approved pedagogical solutions, not original MusicXML composer notation and not a wrist-joint motion recording.
- This is a **selective, sparse benchmark** of fully GT-covered polyphonic held-key components. Never generalize agreement percentages to all 32,525 notes; present 1,800/32,525 (5.53%) source annotation coverage and the strictly eligible portion.
- Seeded results depend explicitly on one original GT hand per hand **inside each evaluated island**; this is not data available to a learner on an arbitrary MIDI file. Unanchored results must be reported alongside assisted results.
- FG-02J source-pinned finger benchmark remains frozen; no tuning candidate weights on these 11 performances. This stage evaluates **only hand labels**, never the quality of fingering, fingering substitutions during held notes, clinical hand physiology or generated joint trajectories.
- No raw performer source records, original finger/hand labels or personal media are committed or uploaded. No source-MusicXML, MIDI timing/velocity, pedal or audio changes. Existing 14 original PNG hand images stay byte-identical. All research functions remain disconnected from learner hints; **NO-GO** for automatic hand ownership, fingering and movement instruction until independent pianist UAT, locked holdout validation and licensing acceptance.

## Reproduction and acceptance

`node --test tests/hand-separation-external-evaluation.test.mjs` covers fully unanchored abstention, exact withheld denominators, no finger labels in solver inputs, oracle-seed identity immutability, masked ambiguous identical source MIDI rows, refusals on forged hand/finger coding, all 11 pinned file names in a bounded synthetic network mock, zero raw GT data in report, and deterministic local run.

`npm run research:fingering:real-hand-gt` runs the real 11-pair pinned PianoVAM research benchmark. `FG04B4_REAL_HAND_REPORT=artifacts/fg04b4-real-hand-gt.json` writes a **metrics-only** JSON artifact. In PR CI it runs after source integrity checks and uploads only these metrics; full Node, browser, SoundFont and MAESTRO CI must be green before integrating.

**Release decision:** regardless of measured numbers, FG-04B4 production automatic RH/LH assignment remains **NO-GO**. Overall Hand-thesia development benchmark stays **35%**, because this is external research measurement, not improvement of source-verified learner movements.

[FG-02J source alignment evidence](FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md) · [FG-04B4 research](FG-HAND-SEPARATION-RESEARCH.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
