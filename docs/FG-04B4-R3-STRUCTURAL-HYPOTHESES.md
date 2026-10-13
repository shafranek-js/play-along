# FG-04B4-R3 — Frozen hand-search hypothesis controls (v0.10.82)

## Why this stage is deliberately not a new real-GT accuracy claim

The prior PianoVAM external performer study (FG-04B4-R1/R2, 11 recordings) measured 0 / 1,467 autonomous hand labels (100% abstention). When given 404 **oracle** LH/RH hand labels as seeds, the frozen algorithm proposed 325 / 1,063 held-out labels (30.57% coverage); **53 were wrong** and **738 abstained**. Of those 53 errors, 32 appeared in islands where only one hand was seeded. Of the 738 abstentions, 583 carried solver diagnosis `NO_FEASIBLE_HAND_PATH`. These strata are *associations*, not mathematical proof that single-hand anchoring caused an error or that human hands physically cannot execute those passages.

PianoVAM is held out from model changes; do not tune to its GT labels and then call the same notes an independent evaluation. The next appropriate truly independent **real performer** corpus is not yet licensed/qualified for this project: [PIG (Piano Fingering Dataset)](https://beam.kisarazu.ac.jp/research/PianoFingeringDataset/index.html) explicitly limits use to noncommercial academic research and requires separate downloading/registration; [ThumbSet](https://zenodo.org/records/6433702) is request-gated, noncommercial academic-only, and its editors warn that annotation provenance is uncertain. Neither has been downloaded, used as a hidden test, or treated as verified professional physical-hand motion.

Instead this stage supplies **15 original CC0-1.0 synthetic piano-note controls**, independently authored for Play Along, with explicitly declared LH/RH *fictional* truth. They are **not** real performer ground truth, clinician-reviewed hand motion, measured hand trajectories, or evidence of pianist-approved fingering. They are a separate test input, created without copying the PianoVAM recordings or scores, for **falsifying** engineering assumptions only.

## Research-only, fully pinned contract

Original source:
- `research/fg04b4-r3-independent-structural-challenges.json`, exact Git blob `3487f76fbd8f3a34a8164a76d54316826fedfd01`.
- **Frozen** `src/core/fingering-hand-separation.mjs`, exact Git blob `e563972a92dc319fc15c412ec5d202b679bb728f`. If the experimental splitter has changed, the research audit **must refuse to run** until the hypothesis protocol is independently re-approved; it must not silently use altered candidate weights.
- No PianoVAM, PIG, ThumbSet, licensed audio or annotated real-performance note arrays inside the new fixture; no copied material is packaged in the player or GitHub Pages.

Research case families and falsification questions:

| Group | Controls | Intended purpose |
| --- | --- | --- |
| Single exposed hand only | RH melody, LH bass, RH going into low register, RH seed followed by unseen LH notes, extreme quick RH leap | Can a single RH/LH known note safely prove all future hand identities? No; pitch is not identity evidence |
| Two explicitly anchored hands | Standard duet, held LH with moving RH, crossed hands, ten-key two-hand chord | Are independently supplied hand anchors preserved; does the research algorithm still abstain if ambiguous? |
| Structural-source conflicts | Different voice notes on one physical key, simultaneous unison, 11 distinct held keys, six separately source-anchored LH keys | Test elementary ten-/five-finger model capacity and physical-key identity contradictions without silently repairing MIDI |
| Unanchored | RH triad and an ordinary two-hand duet with no explicit RH/LH labels | No source hand identity should be invented from register position |

## Structural witness vs algorithmic rejection

The *separate* `structuralHandModelWitness` independently inspects original pitch/onset/duration and **only** exposed anchors. It reports necessary contradictions within an elementary two-hand/ten-finger note-per-finger model: **more than ten concurrent distinct source events, more than five keys simultaneously assigned to a single source-anchored hand, and overlapping independently notated notes requiring the same physical piano key**. The latter often represents valid multivoice notation; it is a note-identity ambiguity, not a claim that the score is corrupt.

Crucially, **absence of these structural contradictions never proves biomechanical feasibility**. If the frozen beam solver rejects `NO_FEASIBLE_HAND_PATH` without an independently established witness, the report says `modelNoFeasibleWithoutStructuralCertificate`, not "pianist can't reach it". Separate fixed `beamWidth=128` and `handSize=XXL` *sensitivity* passes indicate whether a rejection depends on solver search width or its heuristic hand-size envelope; they do **not** pick an "optimal" candidate, retune the algorithm, or promote alternate predictions.

For every original case, the code copies only `noteId,pitch,start,duration` and **explicitly exposed** `authorHand` into the candidate input. Fictional withheld `truthHand` exists only in the scoring comparator after the original solver returns. Swapping held-out fictional truth with identical original notes/anchors must yield unchanged source structural witnesses, solver verdicts and proposal/abstention totals. Reports contain only per-scenario **aggregate** counts and reason codes, with no raw fictional note IDs, pitches, start/end arrays or individual truth labels.

## Verification and release

Run:
- `node --test tests/hand-separation-structural-challenges.test.mjs`
- `npm run research:fingering:structural-challenges`

The CI job executes both on Node, verifies both exact Git blob pins and, optionally, uploads `artifacts/fg04b4-r3-independent-structural-challenges.json` (aggregate-only). It must pass existing whole-app Node tests, Chromium browser tests, SoundFonts and original 1,276 MAESTRO performance audit unchanged. Research output remains explicitly labeled `groundTruthKind:ENGINEERING_CONSTRUCTED_NOT_REAL_PERFORMER`.

**Acceptance of automatic learner RH/LH remains NO-GO.** This stage does not establish independent accuracy on an unrelated real performer corpus and does not prove physical hand/finger motion, so Hand-thesia progress remains **35%**.

**Future real-data gate:** acquire rights/academic eligibility first, verify exact original source–hand–finger–time identity in a genuinely independent corpus with permitted research use, set aside a sealed evaluation split before any new solver changes, and obtain pianist UAT before any user-facing promotion.

[FG-04B4-R2 real error strata](FG-04B4-R2-FAILURE-STRATIFICATION.md) · [Hand separation research](FG-HAND-SEPARATION-RESEARCH.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
