# QA-02 — Independent Hand Separation Validation (v0.10.68)

**Date:** 2026-10-13. **QA owner:** issue #61. **Reviewed implementation PR:** #64, merged commit 03ce831a173eaff83e0c88111d484637a4e0ebec.  
**Source file Git blob:** src/core/fingering-hand-separation.mjs = 9f257898ad0d9c3cdde6092c999f83e82be028f4 (8,336 bytes). An isolated Node v22.16.0 working copy was checked against this exact Git blob SHA-1.  
**Test file:** tests/qa02-hand-separation.test.mjs. **Command:** node --test tests/qa02-hand-separation.test.mjs.  
**Scope:** Independent, synthetic hand-assignment and nonmutation testing only. No production module, player, audio, XML, SoundFont, MAESTRO, PNG, README, shared roadmap, CI or version edits.

## Decision

- **Research integration: PASS WITH LIMITATIONS.** Research-only pure module, preserved source provenance, explicit refusal, productionEligible:false and expertValidated:false; original PR #64 CI completed successfully. The following coverage and identifiability weaknesses block using the proposals as verified physical hand truth. This judgement is about isolation/integration, NOT measured real-world assignment accuracy.
- **Learner-facing automatic RH/LH hints: FAIL / NO-GO.** No run of real independently player-adjudicated hand-note labels against this module; ambiguous crossed hands can be assigned with a definitive proposed RH/LH even without source proof. No auto-fingering integration may be enabled.
- **Hand Animation input: CONDITIONAL only.** It may consume fixed user/author source hands and explicitly labeled research guesses for exploratory visualization. Do not convert proposed into verified or force an actionable learner hint. Preserve noteId, source, status, reason, and complete refusal handling. Hand Animation should not infer physical finger ID from a predicted hand alone.

## Actual independent Node results

In an isolated Node.js **v22.16.0** execution of a local copy of the exact source bytes:

- New independent suite: **17 tests, 17 passed, 0 failed, 0 skipped**. This is *contract/behavior characterization*. Tests deliberately pin unwanted behavior so that reproducing a bug is also a passing characterization; do not interpret green tests as musician acceptance.
- Tests cover authored/user priority, immutable note identity/fingering, monophonic unknown, two-hand voice continuity, three/five/nine/ten-note chords, held notes, very fast/slow shifts, crossings, same-key overlap and adjacent reattacks, shuffled input, invalid inputs, metrics and scaling.
- No application-side XML/MIDI, browser hands, WebAudio or actual MAESTRO files were loaded into this standalone Node run. These are covered separately by the original PR CI below.

### Synthetic quantitative fixture audit — NOT actual piano hand accuracy

Eight independent constructed scenarios with explicit hypothetical RH/LH answers and **6 fixed anchors excluded**:

| Subset | Eligible | Proposed | Unknown | Correct | Wrong |
| --- | ---: | ---: | ---: | ---: | ---: |
| Source-anchored two-hand duet | 2 | 2 | 0 | 2 | 0 |
| Held left + moving right | 2 | 2 | 0 | 2 | 0 |
| Nine-note 5+4 chord | 9 | 9 | 0 | 9 | 0 |
| Ten-note 5+5 chord | 10 | 0 | 10 | 0 | 0 |
| Unanchored monophonic line | 3 | 0 | 3 | 0 | 0 |
| Source-confirmed crossing continuation | 2 | 0 | 2 | 0 | 0 |
| *Adversarial hypothetical crossed-hand two-note duet* | 2 | 2 | 0 | 0 | 2 |
| Normal two-note duet | 2 | 2 | 0 | 2 | 0 |
| **Synthetic total** | **32** | **17** | **15** | **15** | **2** |

- **Coverage = 17/32 = 53.13%.**
- **Abstention = 15/32 = 46.88%.**
- **Agreement among proposed = 15/17 = 88.24%.**
- **False-assignment rate among proposed = 2/17 = 11.76%**, on **adversarial synthetically declared labels only**. This is NOT an estimated population error.
- **Physically impossible proposed outputs observed = 0** in these tested cases under the limited coarse hand-span model; this is not proof the solver always respects piano anatomy or finger/arm biomechanics. Nontrivial pitches, source hand assignments and physically realistic crossings still require expert review.
- Authored/user fixed anchors are neither predictions nor part of eligible accuracy denominator. Old author-reported 6/12 synthetic benchmark is distinct; do not combine denominators or claim a better real accuracy.

### Timings of four synthetic 100% unknown sequential sequences

Measured one-run wall times under the isolated Node 22.16.0 environment:

| Source events | Time | Proposed | Unknown |
| ---: | ---: | ---: | ---: |
| 20 | 4.04 ms | 0 | 20 |
| 200 | 46.91 ms | 0 | 200 |
| 1,000 | 122.83 ms | 0 | 1,000 |
| 2,500 (limit) | 243.27 ms | 0 | 2,500 |

Single measurements do not establish P95, frame budget, or meaningful production throughput. A 2,501-event input returns INVALID_LENGTH. Search onset fan-out depends on chord width/beamWidth and may have very different latency. Do not execute inside a per-frame animation loop.

## Findings

**QA02-01 — P1, overconfident underdetermined crossing.** Input containing simultaneous pitches 72 and 96, both unannotated, returns [LH,RH], proposed=2, unknown=0. The *identical* pitches and timings can also be physically performed as RH playing the lower and LH the upper tone (crossed hands). The algorithm never receives a performer-hand observation. Its preference for ordinary relative ordering is plausible as a guess but is **not certain**. The artificially crossed ground-truth counterexample produces 2/2 wrong proposals; no claim of actual pianist error or universal feasibility under all hand sizes. **Action:** do not expose this as verified. Require explicit uncertainty policy and pianist-labelled corpus; consider outputting unknown where crossed alternative is physically plausible, or keep low-confidence research-only proposals with calibrated evidence. The current output sets confidence:null even for proposed.

**QA02-02 — P2, refusal at exactly ten simultaneously sounding feasible keys.** Nine-note example [48,50,52,53,55] + [72,74,76,77] proposes all nine; extend with 79 to make a plausible five-left/five-right chord and the entire event refuses with ONSET_SEARCH_CAP, 10 unknown. Code checks if k > 9 before beam search; not evidence that a 10-key chord is physically unplayable. **Action:** devise bounded 10-note partition with a strict hand-cap and refusal as needed; add test, measure beam/path explosion. No request to change QA branch's algorithm.

**QA02-03 — P2, overbroad rejection caused by an isolated same-key overlap.** Source notes (60,0–1s), (60,0.2–0.4s), and unrelated (84,1–1.2s) trigger SAME_KEY_OVERLAP and unknown for the entire passage, including unrelated note. Conservative source safety is correct, but localizing ambiguous regions could preserve usable coverage. **Action:** segment around an invalid overlap without fabricating note identity, only after proving independent local event provenance.

**QA02-04 — P1 integration prerequisite, tempo/physical clock provenance unspecified.** The API receives start/duration as seconds, and trajectory feasibility uses delta seconds and a heuristic fixed speed bound (2.25 + 28 * delta). It does not read MusicXML tempo or MIDI tempo maps. This is not an independently reproduced wrong-time output; the integration layer MUST supply performance-time seconds, not raw score beats, and test acceleration/ritardando before trusting any physical shift classification. A tempo-map mismatch could cause wrong confidence/refusal. **Status: NOT VERIFIED as production defect**; blocking interface contract, not counted as observed false assignment.

**QA02-05 — P1 research acceptance evidence gap.** Beam pruning is heuristic, conditional confidence is null, proposed RH/LH labels have no held-out musician-labeled hand accuracy. No safe per-note reliability calibration, proof of source-confirmed crossings, or anatomical multi-finger reach model. The module explicitly states expertValidated:false, so this is an existing NO-GO research limitation, not a new implementation regression.

## Regression and isolation verification

- GitHub PR #64 merge compared against its previous main: only README, docs/FG-HAND-SEPARATION-RESEARCH.md, docs/ROADMAP-FINGER-GUIDANCE.md, package.json, package-lock.json, src/core/fingering-hand-separation.mjs and tests/fingering-hand-separation.test.mjs changed. No playback, transport, authored score, original PNG or audio source files were changed.
- On the merged main tree, original fourteen hand pose PNG Git blob SHA-1 values match the QA-01 pinned baseline. Both SoundFont source assets still have the same Git blob SHA-1 pins: GeneralUser GS SF2 298b552d2e9d1307e03e5c5c99d2c046aaed9ec3; MuseScore General SF3 9f7d18d1b3db5e920d6d430c099d527a6b4d763b.
- Original integration PR workflow runs 38369323820 (Play Along PR suite) and 38369323921 (real MAESTRO audit) both **SUCCESS**. First run's actual logs: **436 Node tests passed, 0 failed**; build and browser regressions success; actual **GM real PCM 128/128 in each of two SoundFont banks PASS**; MAESTRO browser metadata 1,276 entries, MAESTRO engine golden 5 synthetic source notes, 0 dangling, 6 pedal CC, 2 notes under 25 ms. Second run real MAESTRO separate job success.
- These are integration CI outcomes, **not** a newly executed isolated hand accuracy benchmark. MAESTRO does NOT have manually adjudicated RH/LH labels.
- Pure algorithm doesn't import or change XML, MIDI, Wait/Tempo/Listen/Loop, audio, settings, user corrections or art files. It is research-only, not wired to production learner-facing hints by PR #64. No actual stage-to-stage Hand Animation integration was independently executed here.

## Independent real-performance reference candidates, provenance and rights

- **PianoVAM:** its published code repository reports **manually annotated Fingering_GT for 11 recordings** and a dedicated annotation GUI, although the surrounding dataset also includes automatically pre-labeled examples. The maintained Hugging Face dataset card explicitly shows **CC BY-NC-SA 4.0**, suitable for rights-reviewed noncommercial offline research. Earlier FG-02J work aligned 1,800 of 32,525 recording events with external finger/hand labels; those are a separate finger benchmark. The QA02 splitter has **not** been measured on a new held-out subset. Do not copy restricted note bytes into the public PR/application. Ensure truly hand-adjudicated labels and exact onset/pitch/release/source identity match before scoring.
- **PIG (Piano Fingering Dataset):** hand-specific finger signs and annotations are known to exist, but Google's RoboPianist documentation warns it cannot redistribute PIG due to licensing restrictions and requires registration. Seek terms and authorized copy; do not assume full-performance hand ground truth or redistribute files.
- **MAESTRO:** exact performance MIDI events and pedals, but **no labelled performer hand attribution**. Upper staff or MIDI channel are not ground truth; never use them as automatic RH/LH truth.
- **No independently aligned, rights-verified new real hand-label test was run** for QA-02. Genuine hand accuracy/false assignment rate remain **NOT MEASURED**.

## Developer recommendations and Lead decision gates

1. Treat source user/author hand as authoritative, experimental assignments only as soft proposals; do not activate learner hints or label a crossing guess as certain.
2. Document timestamp timebase (performance-time seconds), clearly distinguish score beats/tempo maps and add tests for tempo changes and repeated/unfolded measure note IDs on integration.
3. Expand 10-key chord search safely and address global refusal localization; benchmark specifically plausible 5+5, chords, true held unisons, and crossings.
4. Pin PianoVAM reference recordings (rights, original blob SHA, specific expert labels), align with exact source IDs without guessing, then produce a per-category coverage/error report and genuine pianist adjudication.
5. Run QA-01 pins, every proposed future research module, full 256 GM PCM and MAESTRO suites after changes. The current PR #64 is already merged: never silently change production as QA.

**Files:** Only this dedicated report and tests/qa02-hand-separation.test.mjs. **No merge authority.**
