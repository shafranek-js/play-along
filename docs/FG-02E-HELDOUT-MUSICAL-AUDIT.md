# FG-02E — frozen external scale reference benchmark

**Status: RESEARCH ONLY.** No automatic app guidance, worker inference, or visible hand PNG fingering is changed by this pull request.

## Why this exists

FG-02C tested 20 development references. FG-02D introduced narrow, phrase-shaped hypotheses that reached 20/20 exact matches **on the very references used to design the hypotheses**. That result is in-sample and cannot be an independent performance claim.

To prevent inadvertent data leakage, this FG-02E patch captures **34 previously unused scale sequences (314 notes)** before evaluating the unchanged FG-02D code.

The frozen engine baseline is Play Along `v0.10.35`, commit `9f492fafaf05c50d136a4c7835ab9214543a6e04`. Its algorithm modules **must not be modified in this evaluation patch**.

## Source records and sampling

File: `research/fg02e-heldout-fingerings.json`. It contains concrete MIDI note numbers, exact pedagogical finger sequences, direction, hand, octave scope, and source page for every case.

| New key | One octave ascending | One octave descending | Two octaves ascending |
|---|---|---|---|
| F major | RH / LH | RH / LH | — |
| F♯ major | RH / LH | RH / LH | RH / LH |
| B♭ major | RH / LH | RH / LH | RH / LH |
| E♭ major | RH / LH | RH / LH | — |
| B major | RH / LH | RH / LH | — |
| E major | RH / LH | RH / LH | — |
| A♭ major | RH / LH | RH / LH | RH / LH |

Primary scale fingerings are taken from individually linked pages at **[piano.org](https://piano.org/scales/major/)**.
A separate publisher **[PianoScales.org](https://pianoscales.org/major.html)** provides a cross-check.

### Crucial published disagreements

The two publishers generally agree, but:

- **B♭ major, RH**: piano.org begins with **4**, PianoScales.org begins with **2**. These are valid pedagogical variants; neither is declared automatically wrong. The database represents both and places these cases outside the strict consensus denominator.
- **F♯ major, LH, two octaves**: piano.org ends on finger **4**; PianoScales.org provides an ending **3**. Both variants are stored; no arbitrary correction of the first source is made.

Four affected test cases in all (B♭ RH upward, downward, two octaves, and F♯ LH two octaves). **30 reference cases have published inter-source agreement**.

### Important limits to the term "held-out"

The new 34 sequences were not in the FG-02C/FG-02D test fixtures and do not correspond to FG-02D's qualified tonic recognition (C/D/G). The second publisher supplies a distinct editorial perspective.

However, this is **not** an independently adjudicated sample of real compositions. One provider family (`piano.org`) was already used for FG-02C development and is again used as the primary source. The results are best described as an **out-of-development-keys educational-reference test**, not a scientifically blinded test of all piano music.

There is no cherry-picking after reading the optimizer output. This pull request must preserve all 34 entries; adjustments to finger references must cite a new primary source and report both before and after comparisons.

## Reproducible comparison

- `npm run benchmark:fingering:heldout`: prints separate **unchanged FG-02A** and **unchanged FG-02D** evaluations and a pinned-author-anchor run; prints each unmatched reference sequence and full proposed sequence.
- Set `FG02E_REPORT=artifacts/fg02e-heldout.json` to write machine-readable evidence. CI publishes the file as a PR artifact.
- `npm test` includes data-provenance assertions, source-disagreement checks, deterministic comparison, fail-closed hand ownership and author-anchor preservation.

Outputs distinguish `EXACT_PUBLISHED`, `DIFFERENT`, `REJECTED`, `PHYSICAL_CONFLICT` and label each as concordant or publisher-disputed. A result matching **either published version** is accepted within a disputed case. That does **not** imply a fingering is comfortable or optimal.

## First measured holdout result — 11 October 2026

Frozen input: 34 unseen key / hand / direction cases (314 notes). Data and
optimizer code were not adjusted after looking at the outputs.

GitHub Actions baseline: [PR #12 CI run 38170530595](https://github.com/shafranek-js/play-along/actions/runs/38170530595).
The complete original proposed sequences and pinned-author runs are in the
`fg02e-frozen-heldout-34-cases` JSON artifact.

| Measure | FG-02A baseline | FG-02D phrase-aware |
|---|---:|---:|
| Exact-match cases among all 34 (any published variant) | 8/34 | 8/34 |
| Exact matches among 30 source-agreed cases | 8/30 = **26.67%** | 8/30 = **26.67%** |
| Correct note-level finger labels (primary source) | 144/314 = **45.86%** | 144/314 = **45.86%** |
| Proposed labels matching primary across source-agreed cases | 130/268 = **48.51%** | 130/268 = **48.51%** |
| Cases rejected / physical conflicts flagged | 0 / 0 | 0 / 0 |
| Previously hardcoded phrase candidates activated | — | **0** |
| With all author fingers fixed | 34/34, 314/314 preserved | 34/34, 314/314 preserved |

**Interpretation:** FG-02D's excellent 20/20 *development-reference* score
does not generalize to these held-out keys. Outside its hardcoded C/D/G phrase
templates it selects the old FG-02A answer, so its result on this test is
identical to FG-02A. The original FG-02A covers all examples mechanically but
only matches 8 of the 34 published variants exactly.

These results **do not imply every nonmatching proposal is physically
unplayable**; the audit found no modeled conflicts. They demonstrate poor
agreement with standard published methods. One must not market the hand-size
or local penalty model as an empirically validated fingering teacher.

The previous 90%-case-consensus engineering target **fails**: 26.67% is
below 90%, and expert-repertoire validation is missing. The release decision
is **NO-GO for learner-facing automatic fingering**. The original authoritative
MusicXML fingering and current 14 hand PNG assets are not affected.

Next work should revise the *general musical model* using different
design/evaluation datasets (contextual phrase planning, key-dependent
black-key constraints, multi-octave crossing, alternative fingerings and
hand size). **Do not fit FG-02E fixtures and then call the same fixtures a
new independent test.** Retain these data as a locked regression set and
acquire a separate future holdout.

## Go / no-go criteria

All conditions would be needed before *considering* separate learner-facing opt-in implementation:

1. At least 90% exact-case agreement on the **30 inter-source-consensus** cases (developmental engineering threshold, not a validated musical standard).
2. No independently detected physically conflicting proposals.
3. Author/user fingers preserved 100%; no case may silently override pinned annotations; all rejections listed.
4. No hand ownership guessing from register, no accidental MIDI finger-detection claims.
5. Independent pianist assessment of disagreements and trial on actual repertoire (tempo, phrasing, fatigue, size of hand, separate voices) using data not used to develop templates.

The first four conditions can be computed and are reported separately. **Condition five is unsatisfied. Therefore `productionAutoFingeringAllowed` is deliberately hard-disabled even if an engineering metric happens to pass.**

## Out of scope

No UI switch, no algorithm retuning, no new keyboard-hand sprite, no MusicXML rewrite, no live MIDI alteration, and no claim that scale drills measure polyphonic/expressive fingering in a full piece.

The next research phase should use legitimately independent annotated compositions, not tune templates to this newly seen holdout set and immediately call them validated.
