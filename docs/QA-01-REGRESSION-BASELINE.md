# QA-01: independent regression baseline and integration acceptance

**Owner:** QA & Integration, issue #61. **Snapshot:** 2026-10-13.  
**Pinned initial main:** c41241b28edd90103b703222f2990f1de5205a50, package version 0.10.67.  
**New main observed after Lead PR #63 merge:** 0cd2c5cb1579d51dff06345c910258ae1f224cae. Every PR review must capture fresh base + PR head SHA.  
**QA file ownership:** only docs/QA-*.md and tests/qa-*.test.mjs. No app, README, roadmap, version, workflow, third-party corpus or asset edits. No merges.

## Status language and execution limitations

PASS = actually executed on pinned SHA with output; FAIL = executed assertion failed; BLOCKED = a dependency or policy prevents execution; NOT RUN = no execution evidence; SKIP = candidate absent on this QA-only branch and must NEVER be treated as PASS; INSPECTED = source/config read but not executed.

GitHub connector provided source and PR/CI metadata. Attempting direct GitHub clone in the isolated runner failed: Could not resolve host: github.com. CodexPro local workspace failed: Connection failed. At authoring **no full Node/browser test run is claimed**. CI is necessary but the existing npm scripts do not include new QA files; run QA tests explicitly.

## Cross-stream regression acceptance matrix

| ID | Acceptance oracle | Priority | Initial status |
| --- | --- | --- | --- |
| MUS-01 | MIDI pitch, onset, release/NoteOff, velocity, exact note counts | P0 | NOT RUN |
| MUS-02 | Durations/rests, no early cutoffs, repeated attacks and short articulations | P0 | NOT RUN |
| MUS-03 | Tempo map remains musical-clock accurate; do not claim independent XML tempo validation from MIDI | P1 | NOT RUN |
| MUS-04 | Repeat/ending/grace/ornament either independently supported or explicitly refused | P1 | NOT RUN |
| MUS-05 | Chords, cross-voice ties, ambiguous unisons and repeated-measure IDs preserve source provenance | P0 | NOT RUN |
| MUS-06 | Original score and MIDI byte preservation; research never edits source to improve alignment | P0 | NOT RUN |
| FIN-01 | Author fingers/hand and explicit user overrides retained with correct precedence | P0 | NOT RUN |
| FIN-02 | Held keys, five-finger bound, impossible spans, duplicate-key occupancy, collisions | P1 | SKIP pending candidate integration |
| FIN-03 | Physical crossings, hand displacement and voice continuity; no false forced inference | P1 | NOT RUN |
| FIN-04 | Unknown/ambiguous/refused case counts, denominator and expert independently labeled accuracy | P1 | BLOCKED for expert GT |
| FIN-05 | Source/user/generated/unknown attribution and research production flag remains false | P0 | SKIP pending candidate integration |
| HAND-01 | Next unfinished note rather than currently sounding note; no incomplete chord skip | P0 | NOT RUN |
| HAND-02 | Wait prevents premature hint; Tempo speed/onsets; Listen lookahead timing | P1 | NOT RUN |
| HAND-03 | Seek, Loop, Pause, resize recalculation, no stale positions | P1 | NOT RUN |
| HAND-04 | Crossings, 25/49/61/88 piano range, cropped keys safely refuse interpolation | P1 | NOT RUN |
| ASSET-01 | All 14 owner-provided pose PNGs exact Git SHA-1 from main | P0 | NOT RUN |
| SF-01 | Both SoundFont bank SHA-256s, manifest and 128 GM presets per bank unchanged | P0 | NOT RUN |
| SF-02 | Real finite non-zero PCM with complete NoteOn/Off coverage for **all 256 GM programs** | P0 | NOT RUN |
| SF-03 | Bank switching, event schedule, sound cutoff, velocity and playback stability | P1 | NOT RUN |
| MAE-01 | 1276-source metadata, catalog and license/provenance unchanged | P0 | NOT RUN |
| MAE-02 | MAESTRO original events, repeated notes, short releases, articulation and pedals | P0 | NOT RUN |
| ISO-01 | Scope and diff ownership, unchanged restricted samples/scores/banks/PNG and no teaching auto-activation | P0 | NOT RUN per PR |
| RIGHTS-01 | External Hand-thesia and ASAP corpus license/NC constraints and source-byte restrictions | P1 | INSPECTED baseline |
| PERF-01 | Search budget, worst-case polyphony, p95 time and frame time measured | P1 | NOT RUN |

**Byte-integrity != sound validation.** The new read-only QA file hashes actual working-tree bytes for all 14 hand PNGs, both bank SHA-256s, SoundFont manifest and MAESTRO catalog/audit scripts. Existing tests/audio-gm.real.test.mjs remains required for real 128+128 program PCM. Existing tests/maestro-engine-golden.real.test.mjs remains required for musical timing.

## New independent automated QA checks

Run with Node 22 in a full repository checkout:

1. node --test tests/qa-baseline-integrity.test.mjs — four tests: 14 PNG pins, two SHA-256 bank pins, GM inventory declarations and six protected MAESTRO/manifest files.
2. node --test tests/qa-musical-contracts.test.mjs — six tests: two-note tempo + MIDI/source immutability, wrong pitch/duration/onset refusal, tie source ID continuity, duplicate unison and unsupported repeat/grace refusal, source/user versus generated annotation, Wait/Loop/Pause/Seek/crossing motion.
3. node --test tests/qa-fingering-candidate.test.mjs — four conditional tests: source/user precedence, same-key held-note refusal, impossible anchored hand span, identity and deterministic two-hand phrase. Intentional SKIP on QA-only branch because Fingering AI module is not on main.
4. node --test tests/qa-*.test.mjs — execute all above; inspect pass/fail/skip counts, NOT just shell exit code.

Existing full acceptance (without modifying package/CI):
- npm ci --ignore-scripts --no-audit --no-fund
- npm run build
- npm test
- node --test tests/qa-*.test.mjs
- npm run test:browser (Playwright Chromium, including all 256 real GM programs and MAESTRO golden)
- npm run test:maestro
- Independently inspect PR diff and prohibited-file SHA pins, copyright, source-note identity and explicit refusal metrics.

**Existing npm test and browser scripts DO NOT include new QA-*.test.mjs**. No edit to CI/package is allowed here; Lead may explicitly add these to integration CI later. A green existing CI run alone is not proof these added tests ran.

## Existing musical evidence: context, NOT newly executed PASS

- FG-02J: 1,800 of 32,525 external notes aligned to hand/finger GT (5.53%); 1,467 strictly eligible notes, 1,210 proposals; only 644 matched (43.90% of all eligible). Generated learner-facing guidance stays **NO-GO**.
- FG-04B3d ASAP audit: 16 pinned real score/MIDI pairs; historical strict result 1 aligned/15 refused. Existing diagnostics count 38,267 original MIDI pairs and 1,060 zero-tick events in 14 scores; these must not be auto-repaired without independent oracle.
- FG-03B2B-2: owner-reported pianist acceptance of limited 2D PNG/range scope, not of novel algorithmic fingering, articulated 3D hands or anticipatory trajectories.
- SF05 repository test covers real WebAudio PCM for two banks x 128 = 256 GM programs. Presence of that test is INSPECTED, no fresh execution has yet been verified here.
- MAESTRO v3 has no labeled ground-truth fingering; do not reuse its MIDI data as author hand/finger annotations.

## PR reviews at initial snapshot

| PR | Inspected SHA | Finding | Verdict |
| --- | --- | --- | --- |
| [#62 Fingering AI](https://github.com/shafranek-js/play-along/pull/62) | dd24c3e8c1a3636bd562222dde00807113529f7d | Scoped exactly to one source core module, its 17-test file, its research document. Worker reports 17 synthetic passes but these are not independent real pianist validation. GitHub run 38367943397 FAILED at prior README-required policy; later unit, PCM and MAESTRO gates not executed. | BLOCKED pending fresh CI and independent review |
| [#54 historical FG-04B3d](https://github.com/shafranek-js/play-along/pull/54) | 89f4a212186c996a619865dc9374af7be80e4c89 | Historical release PR based on older main, reported mergeable=false; not a new Music Engine #60 delivery. | BLOCKED |
| [#63 Lead CI coordination](https://github.com/shafranek-js/play-along/pull/63) | a3e22c87c1d895cb5527797a1b282666e84967fc | Lead corrected conflict between required README and dedicated research/QA ownership; subsequently merged. Verify the new actual policy on latest main. | Policy conflict mitigated; musical coverage NOT RUN |

No separate Hand Animation #59 or newly delivered Music Engine #60 implementation PR appeared in open-PR snapshot. Re-check live open PRs before each integration review.

## Severity, limitations and Lead handoff

**P0:** mutated music timing/pitches/source IDs, source user/author finger override, wrong current-vs-next teaching target, learner-facing unsafe generated labels, changed 14 PNG, changed SF banks, silent GM program, MAESTRO event loss.  
**P1:** unsafe ambiguous hand or note refusal, broken Seek/Loop/Wait/Pause, unvalidated parser semantic change, performance/coverage regression, missing full regression evidence. Old README gate was a *process blocker*, not proof of product defect.  
**P2:** visual smoothness and cosmetic/reporting gaps with stable correct key positions; escalate any misleading musical hint to P0/P1.

**No new product defect has yet been reproduced by executing the new QA suite.** Do not report SKIP as passing or synthetic agreement as pianist acceptance.

For each new PR: record current main/PR SHAs, diff paths, branch boundaries, source hashes, actual Node/Chromium/256 GM/MAESTRO outputs, note onset/release error and mismatches, candidate fixed/proposed/unknown/incorrect denominators, exact P0/P1/P2 findings, performance and licensing. Post findings to PR and inform Lead Architect. QA never merges.


## Lead Architect integration v0.10.69 (2026-10-13)

This document preserves the **original QA-01 initial snapshot** above, including its historically accurate NOT RUN and SKIP states before integration. The Lead integrated the three `tests/qa-*.test.mjs` files into the **actual** root `npm test` command in the separate versioned integration branch together with the already-present experimental Fingering AI module (v0.10.68) and the corrected FG-03D1 research planner. Consequently the four conditional hand-separation tests are now **mandatory** rather than skipped. A successful CI run is necessary to promote their runtime results to PASS; do not treat this paragraph as proof of runtime success.

The earlier CI README conflict was resolved on main by PR #63; draft PR #66 remained intentionally limited to four QA-owned files. Integration continues to preserve all 14 original PNG hashes, both full 128 GM program SoundFont banks and their manifest SHA-256, MAESTRO catalog and source events, source author/user finger precedence and auto-generated teacher hints OFF. These immutable-source tests complement — do not replace — actual browser-rendered SoundFont PCM/MAESTRO timing suites.

FG-03D1 includes two Lead-detected P1 fixes: late first-call movement must respect remaining note time; other-hand clearance requires the same performed target onset and repeat iteration. The future UI adapter is not enabled, and professional pianist/physical MIDI acceptance remain NOT RUN.
