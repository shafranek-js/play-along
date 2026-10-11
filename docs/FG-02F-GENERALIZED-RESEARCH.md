# FG-02F — Key-agnostic melodic hypothesis engine

**Status:** research-only, **not used by the Play Along player or PNG hand guidance**. The v0.10.36 application, MusicXML authored fingering and 14 original hand pose images remain authoritative.

## Why

The FG-02E check exposed that FG-02D's apparently perfect 20/20 *in-sample development score* did not generalize to unfamiliar keys. On 34 frozen F/F♯/B♭/E♭/B/E/A♭ exercises, FG-02D made **zero** template proposals and fell back to FG-02A, which exactly matched 8/34 published examples, 8/30 of inter-provider consensus.

Rather than add a lookup table for those keys or retune against the newly exposed FG-02E answers, FG-02F tests a different **key-agnostic geometric hypothesis** in a new module.

## Model and source separation

`src/core/fingering-generalized.mjs` implements a bounded dynamic beam search with the following principles:

- Detect complete **monotonically rising or falling passages by intervals** (steps of 1–2 semitones and arpeggiated intervals 3–7 semitones), without naming tonics or importing any fingering reference table.
- Evaluate hand direction, physically approximated keyboard position, black versus white keys, the feasibility and timing of thumb-under/finger-over moves, re-centering cost, and soft phrase-start/phrase-end finger preferences.
- Preserve all explicitly authored finger anchors, hand labels, MIDI pitch, onset, duration and note IDs. Reject contradictory hands. Do not try to infer which hand the player used from Web MIDI.
- Only emit a hypothetical fingering after the independent FG-02C physical audit passes; fall back to the original FG-02A result if a phrase is outside scope or constraints cannot be met.
- Refuse chords and substantial overlapping voices exactly as FG-02A does. The research-only FG-02B polyphonic solver is not silently replaced.
- Keep the previous FG-02A and FG-02D implementations unchanged.

The estimated cost is an **engineering heuristic** with no human-calibrated force/motion or probability model. The output therefore says `expertValidated:false`, `confidence:null`, and `source:'proposed-generalized'` rather than claiming that a match is *optimal*. The scope is explicitly monophonic, monotonic scale/arpeggio-like phrases; it is **not** a universal solver for entire compositions.

## Evaluation, without holdout leakage

`research/fg02e-heldout-fingerings.json` is frozen. It is **never imported by the algorithm**, only by the separate diagnostic script.

- `npm run benchmark:fingering:generalized` compares unchanged FG-02A, FG-02D, and new FG-02F on the frozen FG-02E material; it writes `artifacts/fg02f-generalized-diagnostic.json` when `FG02F_REPORT` is set.
- The same diagnostic examines historical FG-02C development melodies and separately repeats FG-02E with explicit author anchors.
- `npm test` runs new property/metamorphic tests over all twelve MIDI pitch classes in both hands, ascending/descending diatonic scales and arpeggiated shapes, hand-size variants, conflicting hand claims, anchors and deterministic note identity.
- CI uploads JSON with **all** mismatches and the explicit release gate.

**Important:** FG-02E results were already inspected and motivated FG-02F. Even though the 34 rows are unmodified and no fingering answers are embedded in the new algorithm, FG-02F's comparison against them is a **post-exposure diagnostic**, not a new truly blind test of musical accuracy. Treat any improved metric as a candidate requiring a fresh independent corpus, not a validated success.

## First measured retrospective comparison (11 October 2026)

GitHub PR CI run: [38171482937](https://github.com/shafranek-js/play-along/actions/runs/38171482937).
The full JSON including all individual fingers is uploaded as
`fg02f-retrospective-generalized-diagnostic`.

| Measure on unchanged FG-02E references | FG-02A / FG-02D | FG-02F |
|---|---:|---:|
| Exact case matches, all 34 | 8/34 | **13/34** |
| Exact case matches, 30 source-consensus cases | 8/30 | **12/30** |
| Matching individual fingers vs primary publisher | 144/314 | **221/314** |
| Model-reported physical conflicts | 0 | 0 |
| Rejected cases | 0 | 0 |
| Full author anchors preserved | 314/314 | 314/314 |
| Key-agnostic general phrase candidates evaluated | 0 (FG-02D tonic list) | **34/34** |

For the 14 older FG-02C **development melody cases** (116 fingers),
FG-02F matches 10 cases exactly and 101 individual finger labels.
This secondary result also is *not independent*. The original 20-case
FG-02C total includes six chord examples, which this strictly monophonic
engine is deliberately **not** allowed to replace.

The improvement on already-exposed FG-02E data is useful engineering
feedback, but **does not support an unbiased accuracy claim**. Agreement
among the two published source providers is only 12/30 (40%) and remains
far below the earlier 90% exploratory criterion. No expert pianist has
adjudicated disagreements or approved these assignments for teaching.

**Decision: FG-02F remains NO-GO for production automatic finger prompts.**
The existing MusicXML authored finger hints and the original 14 PNG
hand images remain unchanged. Future algorithm revisions must use a
*new* prospective, locked, independently sourced evaluation set and
must not rewrite this FG-02E record.

## Release criteria

- Independently annotated full musical passages not used to choose model rules or penalties, with legato/repeated notes, actual chords, black-key thumb questions, complex inversions, non-major scales, and realistic tempos.
- Musician/pianist adjudication of *accepted alternatives* and actual physical comfort at several hand sizes.
- Author/user annotation supremacy, explicit provenance, and safe refusal without ever inventing MIDI-detected fingers.
- Verified performance in the real browser and real MIDI on desktop/mobile devices, not merely a Node CI timing sample.
- A separately approved opt-in UI PR with explainable "suggested" vs "author" styles and rollback.

**Automatic learner-facing fingering remains NO-GO** in FG-02F. Existing Wait/Tempo next-target guidance uses only original demo and MusicXML annotations.
