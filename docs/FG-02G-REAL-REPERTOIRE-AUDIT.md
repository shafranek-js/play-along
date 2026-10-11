# FG-02G — reproducible assessment on real-piece fingering excerpts

**Status:** research-only; **NOT activated in Play Along's Finger Guidance UI**.

## Corpus selected

Source: [Piano Protege Curriculum, stage3_pieces](https://huggingface.co/datasets/riyaranjan/piano-protege-curriculum/tree/main/stage3_pieces), compiled by Riya Ranjan, Sabbagh and De for the CS224R curriculum project.

**License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), attributed to the Piano Protege authors. All five source fingering files are downloaded at runtime from pinned Hugging Face revision `1b1ef9c1a17d3eb0ff73c701b6f4685955d4833c`. The license and original files remain with their publisher; **no source scores, MIDI, or source fingering files are checked into this repository**. The diagnostic output contains note-wise evaluation and the source SHA-256, with correct attribution.

| Original published file | Type | Expected note rows |
|---|---|---:|
| `piece_bach_minuet_g_major_100bpm.fingering.txt` | single-hand melody | 32 |
| `piece_fur_elise_theme_100bpm.fingering.txt` | paired-hand excerpt | 36 |
| `piece_au_clair_de_la_lune_100bpm.fingering.txt` | single-hand melody | 22 |
| `piece_frere_jacques_100bpm.fingering.txt` | single-hand melody | 32 |
| `piece_amazing_grace_100bpm.fingering.txt` | two-hand accompaniment | 26 |
| **Total** | **5 excerpts, one tempo per tune** | **148** |

No three-tempo duplication is counted as independent evidence.

The corpus description calls Stage 3 finger labels *hand-authored*. **There is no published independent pianist consensus for each note**, and these are simplified pedagogical arrangements, not authoritative fingering of full original works. Labels are reference choices, not proof that all alternatives are wrong.

### PIG format caveat

These specific files encode fingering **+1..+5 for RH, -1..-5 for LH**, even though the dataset's general description mentions a different 0..9 convention. For these five files we parse the **actual signed event column**, not infer hand from MIDI channel (channel 0 occurs for both hands in the published data) or from pitch.

Other 0–9 datasets and substitutions like `3_1` are *not* silently coerced. The parser rejects them until they have a separately documented format definition.

## Executable approach

`npm run benchmark:fingering:repertoire` (requires GitHub runner or host with internet):

1. Downloads each source file **by immutable source commit and fixed filename**. A changed event count, wrong version, malformed line, unexpected path, mismatched **SHA-256**, or broken network is a **hard failure**, not a test that gets silently skipped.
2. Parses original onset and offset seconds, MIDI pitches (scientific pitch notation), signed hand and finger, and stable source note IDs.
3. Separately examines RH and LH. Both overlapping notes in a **same-hand chord** are excluded from a *monophonic* test (and counted), as are tiny 1–2 note fragments. Independently sounding LH/RH voices are **not** misclassified as one-hand polyphony.
4. Removes all reference finger labels from algorithm input for the unannotated FG-02A/FG-02F comparison; source fingers are used only for scoring **after** prediction. A *separate* author-pinned run checks the source finger-annotation constraint.
5. Reports per-piece, per-hand, and overall **coverage, exact-finger agreement, full-run exact match, rejected runs, physical conflicts and original author-pinned coverage**. No coverage is implied for skipped/rejected notes.
6. Prints a trace and uploads a JSON report including each reference/actual finger sequence and SHA-256 of fetched source data.

Run `npm test` for the **offline** contract tests without downloading third-party files. Continuous integration executes the actual 5-piece benchmark separately and uploads `fg02g-real-piece-reference-report`.

## First measured CI result — 11 October 2026

First green [PR #14 CI run](https://github.com/shafranek-js/play-along/actions/runs/38172475599).
The report was produced from all **5 pinned third-party source files**, with
exactly **148 events**. Full original-source SHA-256 digests from this first run
are now included in `research/fg02g-repertoire-manifest.json`. Later runs
verify them before benchmarking; changed data must fail rather than silently
change the denominator.

| Piece | Total annotated notes | FG-02A matched | FG-02F matched |
|---|---:|---:|---:|
| Bach Minuet G (dataset label) | 32 | 22 | 22 |
| Für Elise theme | 36 (27 RH + 9 LH) | 19 | 19 |
| Au clair de la lune | 22 | 15 | 15 |
| Frère Jacques | 32 | 14 | 14 |
| Amazing Grace | 26 (18 RH + 8 LH) | 11 | 11 |
| **TOTAL** | **148** | **81 (54.73%)** | **81 (54.73%)** |

- **7/7 unannotated hand-specific monophonic runs scored**, no omitted notes
  for this deliberately simplified five-piece set and no independent
  physical-audit conflicts detected.
- **0/7 completely exact unannotated runs**.
- **0 generalized-monotonic run activations**: all melodies mix direction
  and/or intervals, so FG-02F falls back to FG-02A. The unchanged algorithm
  did not improve real-piece note-level agreement.
- **Critical author-compatibility finding:** 4/7 fully source-pinned runs
  (90 notes) return a *no-valid-path* error under the monophonic model's
  restrictive transitions; **3/7** runs (58 notes) are accepted exactly.
  Thus **author-compatibility coverage is only 58/148 = 39.19%**. Saying
  '100% author accuracy' without its low coverage would be **misleading**.
  In the accepted runs, anchors are correctly preserved; rejected runs do
  not override the author's fingers.
- The 14 offline parser and integrity tests passed in the initial run.
  Subsequent tests add strict checksum verification and explicit rejected
  note coverage. No source note was silently omitted in either run.

**Do not conclude that the original fingering is incorrect or that the model
is an expert tutor.** The failures identify where FG-02A's hard assumptions
(repeated finger on successive differing pitches, performance-time context)
reject some *hand-authored* source paths. This is precisely why production
automation remains disabled.

### No-go outcome and next research

The current model **does not support mixed-direction musical phrasing well**.
The next development stage should improve phrase segmentation and lead-in /
lead-out continuity across rests and direction changes, and separately test
polyphonic coordination. New models must preserve every author anchor, explicitly
refuse physically impossible assignments, and be evaluated against another
fresh score set before claiming a quality improvement.

**Release decision: NO-GO for automatic learner-facing fingering.**

## Validity and licensing boundaries

- The well-known research [PIG Dataset](https://beam.kisarazu.ac.jp/research/PianoFingeringDataset/) is subject to different, non-redistributable licensing. **It is not included in this work**.
- Published Stage 3 files are labelled hand-authored but not independently adjudicated. Agreement is an exact-to-editor metric, *not* professional playing quality or physical finger detection.
- Monophonic FG-02F cannot meaningfully assign entire polyphonic score passages: compare only individually playable runs, disclose **all omissions**. FG-02B chord research requires a separate polyphonic benchmark.
- Given the user already approved development from FG-02E/F, these real-piece examples were **selected prior to examining FG-02G model outputs**, but this is not a comprehensive randomized/unbiased repertory sample, and no pianist has validated it.
- Do not tune FG-02F against this data and then reuse the same five scores as a fresh test. Retain the snapshot and obtain an additional prospective sample.
- No UI, PNG assets, OSMD, Work/Wait/Tempo, MIDI transport or original author MusicXML parsing are modified.

**The release decision is hard NO-GO until a separately approved trial with independent pianists, a larger diverse work set, author-vs-suggestion labelling and reliable hand segmentation.**
