# FG-02I — research-only two-hand polyphonic score router

**Not used in production / Play Along teaching. Automatic fingering remains NO-GO.**

## Goal and architecture

FG-02H made *monophonic* mixed-direction phrases compatible with fully fixed author fingers (148/148 accepted notes on the five Stage 3 repertoire excerpts) but cannot handle chords. FG-02B can propose independent simultaneous fingers for two hands and held voices, but its original beam search may reject reasonable author-pinned fast transitions. FG-02I combines those existing engines **without modifying either one**.

File: `src/core/fingering-score-router.mjs`. Pure research API:

```js
import {proposeHybridScoreFingering} from './src/core/fingering-score-router.mjs';

const result = proposeHybridScoreFingering({
  RH: [{pitch: 60, start: 0, duration: .4, finger: 1, noteId: 'RH-C4'},
       {pitch: 64, start: 0, duration: .4, finger: 3, noteId: 'RH-E4'}],
  LH: [{pitch: 48, start: 0, duration: .4, finger: 5, noteId: 'LH-C3'}]
}, {handSize: 'M', beamWidth: 40});
```

Input **must** have an explicit RH/LH group: the router **does not infer hand from MIDI pitch, MIDI channel or presumed left/right register**. Note-level `hand` must not contradict its assigned group. Supports a maximum of 2,500 total note events and the experimental XXS–XXL size ratios (not anatomically calibrated).

## Solver routing

1. Reject invalid pitches, durations, anchors, hand discrepancies and concurrent same-pitch RH/LH attacks. These are not guessed or silently redistributed.
2. If a hand has **every finger written by its author**, preserve them verbatim **if** independent physical audit accepts their simultaneous key/finger relationship. Do not force FG-02B’s same-finger motion heuristics on authored legato.
3. If not all fingers are fixed, split each hand at actual overlap-connected note groups:
   - Sequences of nonoverlapping individual notes go to **FG-02H** (mixed direction, rests, repeats, author constraints).
   - Connected groups of concurrently held notes go to **FG-02B** (polyphonic chord beam search), unless every group note is annotated, in which case direct physical audit preserves the author's choices.
4. Combine outputs in **original note order**, keep all pitch/onset/duration/note IDs, source ownership and original finger anchors unchanged, and run an **independent whole-hand physical audit** after recombination.
5. Output `SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED` for every isolated solver transition between mono/poly islands or sufficiently long rests. This is intentionally **not** a claim of smooth wrist/hand posture, and future work must model phrase continuity globally.
6. Unusually quick one-finger repositionings in a fully authored passage are tagged `AUTHOR_FAST_SAME_FINGER_UNVERIFIED`. They are accepted only **after** a prior physical key has been released, without asserting the gesture is ergonomic.

Outputs include separate `hands.RH`/`hands.LH`, `methods`, `segments` and `diagnostics.warnings`. Success always carries `expertValidated:false`, `productionEligible:false`, `confidence:null`. Failures carry a machine-readable reason and affected segment note IDs rather than filling missing fingers with invented values.

## Quality coverage and limitations

- The independent audit (FG-02C) approximates key spacing, order and reach for **simultaneously sounding** keys; it is not a biomechanical wrist/rotation simulator.
- Segment-by-segment optimization may be locally playable but **global hand continuity is unvalidated**. Warnings are mandatory and are not a proof of smooth passage fingering.
- The FG-02B solver remains limited on long/complex polyphonic voices, deliberate substitution, held-key re-attacks, and finger overlap. This router is not a solver for those notational situations.
- Cross-hand same-key overlap is reported as physically ambiguous. Do not infer a real fingertip from generic MIDI NoteOn events.
- Fully authored ≠ professionally or ergonomically validated. The router verifies that anchored fingers were **not changed**, not that every authored choice is good for every hand/tempo.
- Validation is **technical and synthetic for chord/polyphonic fixtures**, not independently expert-scored repertoire. No automatic switch in the player or change to owner-provided 14 transparent hand PNGs.

## Reproducible checks

- `npm test` runs `tests/fingering-score-router.test.mjs` and other regression suites, including 20+ score-level cases with chord overlaps, two hands, author anchors, hard conflicts, note ID preservation, rest boundaries, and research-only release gating.
- `npm run benchmark:fingering:score-router` downloads the same **five immutable, checksum-verified CC BY-SA Piano Protege** teaching excerpts used in FG-02G/H. The results are retrospective. The original source annotations are kept out of the **unannotated** solver call.
- CI saves `artifacts/fg02i-score-router.json` including SHA-256, per-note reference versus candidate, warnings and the separate fully pinned author pass.
- The five excerpts currently have monophonic RH/LH passages. They do **not** test real chord correctness. A genuinely independent, licensed, **polyphonic and expertly labelled** score corpus is required before claiming practical chord fingering accuracy.

## First CI and retrospective measurements — 12 October 2026

[PR #17 CI run](https://github.com/shafranek-js/play-along/actions/runs/38208755084) passed **203/203 unit tests**, browser regression suites for authored MusicXML, original owner-provided hand PNGs, next-note hints, Wait/Tempo, and dependency audit (0 detected vulnerabilities).

The same five source-pinned and SHA-256-verified CC BY-SA Stage 3 excerpts were used for a fair *retrospective* comparison:

| Measure (five excerpts, 148 notes) | FG-02H | FG-02I |
|---|---:|---:|
| Unannotated finger matches against source | 87/148 = 58.78% | **87/148 = 58.78%** |
| Accepted notes with every author finger fixed | 148/148 | **148/148** |
| Source-preservation warnings on fast same-finger changes | 11 | **11** |
| Independent modeled key/finger conflicts | 0 | **0** |

For this deliberately small corpus, all seven one-hand passages are monophonic. Consequently, FG-02I routes their unannotated notes through the unchanged FG-02H engine. The result is expected to be identical; **there is no measured polyphonic performance improvement to claim from these five files**.

The new evidence for polyp​honic coverage is synthetic and contract-driven: explicit RH/LH triads, simultaneous held voices, unison note ID retention, occupancy constraints, immutable authored chords, and boundary warnings. **No independently sourced pianist-adjudicated polyphonic score has yet been benchmarked.**

**Decision: research-only; production automatic fingering is NOT APPROVED.**

## Next approval gates

1. Independent pianist examination of explicitly fingered polyrhythmic and polyphonic fragments with key release and active holds; include different hand sizes and ambiguous hand-crossing.
2. New annotated test works selected **before** any further model tuning, with explicit license and note IDs; do not reuse previously seen stage3 references as a new holdout.
3. Global inter-island wrist and finger motion optimization and explicit UAT for warnings.
4. Only with source ownership/annotation precedence and musical accuracy verified: a separately reviewed **opt-in** learner-facing feature; never silently override MusicXML author annotations.

**Release verdict: research-only; automatic learner fingering must remain OFF.**
