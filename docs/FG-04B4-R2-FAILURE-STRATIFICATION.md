# FG-04B4-R2 — Error/abstention stratification on unchanged external RH/LH ground truth (v0.10.81)

## Purpose

FG-04B4-R1 independently evaluated the source-pinned 11-performance PianoVAM (CC BY-NC-SA 4.0, **noncommercial research only**) annotated subset. The observed two-condition results on **242 complete same-hand polyphonic islands** (1,467 eligible notes) are:

- **MIDI-only, 0 anchor hands:** 1,467 held-out notes, **0** proposed, **1,467** abstained. This establishes zero *coverage*, **not** a measured predictive accuracy.
- **Oracle-seeded:** 404 ground-truth hands exposed as at most one seed from each present hand **per island**. Of the remaining **1,063** held-out notes, **325** proposed (30.57% coverage); **272 correct / 53 incorrect** (83.69% agreement **among proposals only**, 16.31% error); **738** held out without hand prediction (69.43%).
- **1,800/32,525** source notes carry any aligned GT annotation (5.53%). No consent to commercial redistribution, production auto hand attribution, pianist-reviewed motion, verified 3D joints, or automatic fingering was established.

R2 creates a reproducible analysis of **where** these 53 wrong responses and 738 abstentions arise, without viewing or hand-tuning the predictor after seeing external answers. All categories are pre-registered in code before running the real GT audit; the frozen splitter implementation and all FG-02J ground truth alignment logic remain unchanged. **This is NOT a new algorithm that improves RH/LH accuracy.**

## Five intentionally coarse, non-label-leaking views

Each original held-out event is grouped into a fixed, coarse bucket using only MIDI event geometry and the **explicitly exposed oracle hand-anchor positions**; it may never consult the held-out target hand or finger until after candidate prediction. The axes are separate marginal views over the **same** population, *not* disjoint populations to be summed across axes:

1. **Attack texture:** at least two exact-source events at the same onset vs staggered-onset note.
2. **Island size:** 2–3, 4–7, or 8+ source events in a complete original key-hold-connected component.
3. **Number of exposed hands:** no independent hand seed, one source hand, or both original hands externally seeded. All unanchored source notes fall into "none"; this MUST NOT be interpreted as the algorithm inferring 2-hand identity.
4. **Distance to nearest exposed original seed (pitch only):** none, 0–4, 5–12, or 13+ semitones. Anchor proximity is only an inspection bin, not evidence of physical piano hand reach or a source of novel hand labels.
5. **Identical physical key held concurrently:** overlap with another original same-pitch event (not an independent executable hand identity) vs no such overlap.

Each bucket contains **heldout, proposed, correct, incorrect, abstained**. Extra, strictly post-score direction totals **predicted RH / actual LH** and **predicted LH / actual RH** distinguish misassignment direction; these never enter algorithm inputs. Existing explicit refusal and abstention reasons (including NO_FEASIBLE_HAND_PATH, ambiguous path, beam pruning and missing identity) are preserved. Classifiers are fixed prior to external data inspection, and note-by-note classifications never appear in GitHub reports.

## Provenance and release gates

- For *each* of five axes, the sum of all category denominators must equal the original R1 frozen counts exactly: held-out = proposed + abstained; proposed = correct + incorrect; category totals = protocol totals. Incorrect direction counts must sum to original incorrect total. Any inconsistency fails the audit.
- If the solver rejects an entire island, **all held-out original events** are counted as abstained in every axis. Exposed oracle seed events remain **excluded** from diagnostics scoring.
- GT labels are hidden from the predictor and from pre-score bins. Tests flip held-out GT while preserving the same geometry and exposed seeds and require **identical feature category denominators, proposal/abstention counts**. Correct/incorrect scores may change only after predictions.
- Only aggregates for the **full eleven recording population** are emitted for these new diagnostic bins and wrong direction totals; they are deliberately omitted from individual recording-level reports because small cells may expose sensitive annotation detail. No raw source note MIDI, pitch, original timestamps, finger numbers, external hand label streams, or per-note prediction arrays are published.
- The source itself remains at exact pin \`1f039ab9d6128626bff708faad6472d220b50eaa\`. FG-02J correspondence, source note/GT count checks, exact original events and complete same-hand polyphonic population are unchanged.
- The offline simulator, music XML/MIDI import, tempo, score, SoundFont/MAESTRO, user edits, learner guide and all fourteen owner PNG hand assets remain unaffected. Research logic is not imported by the browser player.
- Model parameters are **not tuned on the external evaluator**. No new automatic learner RH/LH/finger hints, no production motion, no claim of physical or teaching correctness; Hand-thesia completion remains **35%**.

## Reproduction

Run \`node --test tests/hand-separation-external-evaluation.test.mjs\` and \`npm run research:fingering:real-hand-gt\`. PR CI independently re-downloads exact revision-pinned, bounded PianoVAM source TSV plus GT, re-runs the research audit, and archives only aggregate JSON under \`fg04b4-r1-real-performer-hand-labels\` (schema extended with R2 diagnostic fields). Full Node tests, Chromium regression, SoundFont checks, MAESTRO and Pages release gates are required.

The R2 follow-up is to use these refusal categories to formulate **new hypotheses**, then lock a **separate, independent future performer/teacher dataset** before modifying beam search, ambiguity policy or physical constraints. Error slices from the same source cannot serve as independent post-tuning acceptance.

[FG-04B4-R1 measured evidence](FG-04B4-R1-REAL-HAND-GT.md) · [FG-04B4 research](FG-HAND-SEPARATION-RESEARCH.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
