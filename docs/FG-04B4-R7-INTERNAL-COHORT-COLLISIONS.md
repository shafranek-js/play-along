# FG-04B4-R7 — Internal collisions inside the reference-disjoint pseudo cohort

## Scope
R6 showed that 80/95 original automatic-only performances collide by exact performer or work metadata with eleven prior human-ground-truth sources. The remaining 15 lacked these **specific reference collisions**; this does not make the 15 independent of **each other**.

R7 adds a read-only pairwise comparison inside only the fully-known, exact-reference-nonoverlapping records. It counts the number of candidate pairs that share either publisher P1/P2 performer identity or exact normalized composer and work title. It also counts collisions across publisher-defined split labels. The output is aggregate only, without names, composition titles, timestamps, filenames, per-recording rows, or hashable identities.

### Machine contract
- Full reference cohort metadata must be complete before a candidate may enter the pairwise comparison. Unknown candidates are excluded from the denominator, **not** treated as independent.
- Every unordered candidate pair is compared once. Both P1 and P2 are taken into account using the existing R6 normalized source metadata. Exact comparison only; **no** fuzzy matching and **no** proof of actual performer distinctness.
- Result fields: candidate and pair counts; performer-sharing pairs, work-sharing pairs, both, cross-publisher-split collisions, number of candidates involved in at least one collision and remaining candidates without any detected exact internal collision.
- Never include candidate identities in a report. All output retains `verifiedIndependentPerformers: 0` and `eligibleForLearnerUse: false`. Automatic pseudo finger/hand annotations remain **not ground truth**, including when collision counts are zero.
- No source XML/MIDI, audio, hand PNG assets, production hints, version or README changed in this research branch.

## Verification
Run `node --test tests/pianovam-metadata-leakage-gate.test.mjs`. Added synthetic controls with one internally repeated pianist across three previously reference-disjoint sources and repeated exact work across two sources, plus a deliberately incomplete reference preventing all candidate comparison.

**Pending real-source observation:** R6's 15 is a known earlier reference-nonoverlap count, **not** an R7 internal-disjoint count. R7's live pinned-source pair totals require the existing noncommercial publisher-metadata workflow to run successfully; do not assert a numeric reduction without this evidence.

The study is noncommercial source research (PianoVAM CC BY-NC-SA 4.0), not a validated teaching dataset. Independent verified performer labels, independent human hand/finger annotations and pianist evaluation are still absent. Automatic fingering remains NO-GO; Hand-thesia progress remains 35%.
