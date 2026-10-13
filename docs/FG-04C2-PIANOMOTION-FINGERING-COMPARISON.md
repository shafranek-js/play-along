# FG-04C2 — Compare existing Play Along solver with PianoMotion outputs

## Why this is an implementation, not another PianoVAM audit

User priority is to improve the **actual fingering algorithm** and subsequently provide optional procedural IK hand styles, preserving the existing fourteen PNGs. The first safe step is to measure the *existing actual Play Along algorithm*, `proposeHybridScoreFingering`, against independently produced PianoMotion Studio candidates using precisely the **same source note IDs and musical events**. This is not a claim that the algorithm has already improved.

## Code

- `src/core/fingering-engine-comparison.mjs`
- `runExistingPlayAlongFingeringResearch(source,{handSize,beamWidth})`: invokes the **real** FG-02I Play Along research score router with explicit LH/RH, authorized source/user anchors and original pitch, onset, duration. Does not invoke or simulate PianoMotion.
- `compareFingeringEnginesResearch({source,playAlong,pianoMotion,truth,handSize})`: separately accepts independently calculated PianoMotion output as a set of candidate rows, validates canonical note IDs/hand/pitch/start/duration plus any supplied part/staff/voice/tied segment IDs, scores coverage and author/user preservation, detects independently audited concurrent finger, key and span conflicts. Returns aggregate-only comparison counts.
- `truth` is optional **post-inference withheld annotations**; no truth is ever passed into `runExistingPlayAlongFingeringResearch`. Only unanchored note IDs can have withheld reference answers. Scored coverage and accuracy denominators are explicit: eligible unanchored, proposed, withheld truth eligible, withheld truth proposed, correct, wrong and abstained. Passing synthetic truth proves engineering behavior, **not** real pianist accuracy.

## Identity contract

Use exact immutable `noteId`, `pitch`, `start` (seconds), `duration` (physical MIDI key release, not acoustic sustain), and source-confirmed `hand`. Optional `partId`, `staff`, `voice` and `sourceNoteIds` represent exact MusicXML structural/tie identity. Preserve original `authorFinger`; effective priority is `userFinger` (explicit user correction), then `authorFinger`, then experimental proposal. Never derive a hand from MIDI channel, pitch or staff. No temporal alignment by heuristic matching: a PianoMotion output whose IDs cannot be reliably matched must be reported as unavailable or rejected.

An output row must specify the exact source note identity plus physical event fields. If provided source-context fields differ, **reject**; if absent, count `sourceContextUnverified`, without silently fabricating structural verification. Missing unanchored candidate rows represent abstentions. Missing, changed or cleared author/user anchors invalidate the entire engine result. Every engine is scored separately; one invalid engine never contaminates the other's numbers.

Use the independently implemented `auditFingeringAssignments` to screen actual reported proposals for simultaneous physical-key and finger contradictions. This is a biomechanical heuristic gate, **not** musician/physiologist proof. Even an output with zero detected conflicts is not automatically a valid IK hand animation. A `null` PianoMotion result remains explicitly `not-run`, never treated as a zero-error success.

## Next real engine work

1. Export a permitted, version-pinned PianoMotion run from the owner's own application with a separately verified original-source-ID mapping. Do not install/copy the adapted `handthesia_core` into publicly distributed Play Along without confirming upstream rights.
2. Compare the same original hand-labelled scores at identical source clock times, musician sizes and source/user anchors. Record source-file hashes, numeric engine versions, abstention reasons and deterministic reruns **without** publishing copyrighted MIDI/music or external finger streams.
3. Use differences to target concrete Play Along cost-model changes such as figure-aware thumb crossings, alternative finger patterns for repeated notes, or hand-size-specific span penalties; run independent held-out expert comparisons **before** declaring an accuracy improvement.
4. Only after an accepted result, separately enable correctly labelled automatically proposed fingers to users under an explicit source/provenance choice. Current learner prompts remain author/user only. Do **not** couple proposed fingers to the optional IK renderer before accepting the accuracy gate.

## Automated evidence and limits

Tests: `node --test tests/fingering-engine-comparison.test.mjs`, also registered into full `npm test` through `tests/fingering-score-router.test.mjs`. Synthetic engineering controls cover actual Play Along solver invocation, two output aggregates, missed notes and denominators, no-data `not-run` status, exact source matching, author and user precedence, independently withheld annotations, same-held finger, cross-hand same-key contradiction, small hands and input immutability.

**No production player integration; no PianoMotion Python engine execution and no measured real-source comparison yet.** No user PNG, MIDI, audio, SoundFont, MAESTRO, MusicXML author notes, store or renderer changes. FG-04C2 does not justify increasing the Hand-thesia completion estimate above **35%**.

## FG-04C2b — actual PianoMotion analysis import (implemented)

`src/core/pianomotion-fingering-import.mjs` accepts **real** PianoMotion Studio `{rawBaseline,document,fingeringPlan}` response plus the **original MIDI bytes passed to that exact PianoMotion run**. First it checks PianoMotion's `rawBaseline.inputSha256` against SHA-256 of those original bytes and refuses repaired/lossy/ambiguous note identity. It next reuses Play Along's independent `alignNormalizedScoreToMidi` source-to-original-MIDI bridge, requiring an aligned canonical MusicXML score (explicit `xml:` note IDs, part/staff/voice, physical note onset/release). Finally, PianoMotion notes must have exact raw `sourceEvent` locators and consistent `identityMappings`/`sourceNotes`; only a **unique** same-track/channel/pitch/onset/release candidate may be mapped. The input MIDI is not rewritten and neither engine receives held-out reference fingers.

If PianoMotion omits provenance, repairs notes, cannot pair a same-pitch unison, rolls or changes source note time, uses a different MIDI SHA, or returns inconsistent plan/document assignments, conversion **abstains with a reason**. PianoMotion's computed hand and finger are **not** silently replaced by canonical Play Along information. The comparison rejects a changed score-author hand or any author/user anchor override. No PianoMotion source code, image assets, or Python WASM is copied into Play Along by this import.

**Run locally after exporting a PianoMotion analysis JSON for the same original MIDI:**

```bash
node scripts/fingering-engine-comparison.mjs /path/to/comparison.json /path/to/original-score.mid
```

The JSON contains `{"source":[...], "pianoMotionAnalysis":{"rawBaseline":{...},"document":{...},"fingeringPlan":{...}}}` with the score's original canonical notes including `noteId,partId,staff,voice,pitch,start,duration,hand`. Without `pianoMotionAnalysis`, the original CLI supports separately supplied already-mapped candidate rows, and requires no MIDI path. Both modes return *aggregate-only* scores: no actual notes, fingerings, piano user files or performer IDs in stdout. The local JSON/MIDI remain local; **no automatic user export is added**.

Important limitation: the two applications' note IDs are not semantically identical. Play Along's score-MIDI alignment is strictly unique ±2ms and already explicitly disclaims automatic repeat/tie/ornament validation. This bridge neither upgrades those claims nor aligns ambiguous raw MIDI. External real benchmark outcomes, performance gains and pianist acceptance remain unmeasured until a same-source PianoMotion analysis is provided and executed locally; synthetic JSON envelopes only test the implementation behavior.
