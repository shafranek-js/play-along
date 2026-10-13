# FG — Source-aware Hand Separation (research-only)

**Status: NO-GO for learner-facing hands and fingers.** No player integration, automatic fingering, source rewrite, or edits to user corrections. This is a hand-attribution research candidate, not a replacement of the FG-02I/FG-02B finger-planning engines.

## Audit of current main

- FG-02B (fingering-polyphonic.mjs) and FG-02I (fingering-score-router.mjs) **require known hands** before finger planning. Neither predicts RH/LH from unlabeled notes.
- FG-02J's externally aligned PianoVAM benchmark measured **644/1,467 = 43.90% eligible-note finger agreement** with only 5.53% of original recording events annotated. Those figures are NOT this splitter's hand-attribution results.
- FG-04B Hand-thesia review documents the inspiration and upstream license gap. Our code is independently implemented, with no third-party source or assets copied.
- Base main commit on 2026-10-13: 8f4946987de1eaa74b99ea71a59df2b923adbdb5. The parallel-development contract was examined from open PR #57, since the file was not yet in main.

## API and provenance

Import separateHandsResearch from src/core/fingering-hand-separation.mjs.

~~~js
const notes = [
 {noteId:'xml:P1:0:0:0',pitch:48,start:0,duration:.25,authorHand:'LH'},
 {noteId:'xml:P1:0:0:1',pitch:72,start:0,duration:.25,authorHand:'RH'},
 {noteId:'xml:P1:0:1:0',pitch:50,start:.4,duration:.25},
 {noteId:'xml:P1:0:1:1',pitch:74,start:.4,duration:.25}
];
const result = separateHandsResearch(notes);
~~~

All input notes require distinct canonical source noteId, integer MIDI pitch (0–127), nonnegative start in seconds, and positive duration. Optional partId, staff and voice are metadata for continuity; staff alone never implies RH/LH. The optional hand field is accepted **only** as an independently trusted score-hand label, never a guessed MIDI channel or track label.

Effective attribution precedence: userHand > authorHand > hand. Input is never mutated; source author labels, original XML, original finger annotations and stored user corrections survive untouched. Output follows input note order, with a read-only hand (RH/LH/null), status (fixed/proposed/unknown), source, reason and confidence:null. NO finger numbers are inferred or written.

The chronological onset-group beam search (48 paths by default, bounded 2–128) enumerates possible binary assignments for each onset. Constraints: at most five distinct sounding keys per hand, held-note occupancy, model-sized chord width, limited hand-centre movement and original fixed hand anchors. Costs: prior voice continuity, hand travel and relative hand ordering. Crossings are penalized but allowed; **no fixed C4 pitch split** or implicit assignment from score staff. Overlapping same-key events refuse the passage because physical source identity is ambiguous. Ambiguity between nearly equal candidates, including meaningful beam pruning, produces unknown rather than false certainty.

This is a **hand-level envelope heuristic**, not anatomical finger, thumb-under, wrist, arm, speed or pedal simulation. Fixed source hands on an impossible passage remain fixed, with an explicit NO_FEASIBLE_HAND_PATH diagnostic instead of fabricated correction. The returned productionEligible and expertValidated flags remain false.

Limits: at most 2,500 notes and nine notes per onset; malformed note IDs or events are rejected. Principal refusal/abstention codes: SAME_KEY_OVERLAP, ONSET_SEARCH_CAP, NO_FEASIBLE_HAND_PATH, AMBIGUOUS_HAND and BEAM_TRUNCATED_AMBIGUOUS. Whole-passage refusal is conservative and reduces coverage. These are failure categories, not verified performance abilities.

## Observed evidence (2026-10-13)

Run: node --test tests/fingering-hand-separation.test.mjs on Node v22.16.0.

- **17/17 pure Node tests PASS**. Includes source override priority, source finger preservation, no mutation, same-onset groups, held keys, crossings, hand reach, oversized onsets, invalid inputs and determinism.
- **Five synthetic pre-labelled reference patterns** adapted from the earlier FG-02I two-hand/chord testing conventions: 14 labelled notes total, 2 fixed note labels excluded from prediction, 12 unanchored eligible note labels.
- **6 / 12 = 50% proposal coverage**; **6 / 6 = 100% agreement on proposed notes**; **6 / 12 = 50% agreement with abstentions in the denominator**; **6 unknown**, **0 wrong hand labels in these fixtures**. The small, deliberately simple synthetic sample is NOT real musician-validated accuracy.
- Refusals exercised: overlapping same physical key, held same-key reattack, unsatisfiable fixed hand spans, and an onset exceeding the search cap.
- One local 1,000-note monophonic performance probe took 112 ms; all 1,000 labels were unknown. Not a benchmark SLA.

**Independent real-score evidence still missing:** zero externally pianist-adjudicated score/performance hand assignments have been run through this new algorithm. External PianoVAM and ASAP datasets already qualify as research materials for other modules, not as new evidence for hand separation. Hand-thesia code was not executed or compared numerically. Do not claim independent production accuracy.

No production, SoundFont, MAESTRO, playback, hand PNG, README, version or package files were touched. Full repository unit suite, Chromium tests and CI should be independently verified by the lead before any merge.

## Acceptance gate before integration

Run strict source-note-identity hand-label comparison on a version-pinned, rights-reviewed independent corpus including actual held chords, crossings, ties and nontrivial voice changes. Report coverage, correct/incorrect proposed labels over all eligible notes and precise abstention reasons. Seek musician review and validate reach/tempo separately. Maintain learner-facing NO-GO until accepted.
