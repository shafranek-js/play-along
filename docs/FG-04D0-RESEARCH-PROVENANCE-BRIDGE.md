# FG-04D0 — Research hand/finger/motion provenance bridge (v0.10.72)

**Scope:** pure, isolated, bounded, **NO-GO for user-facing automatic guidance**. Source `src/core/finger-motion-research-bridge.mjs`. This code is **not imported by the player**. It coordinates existing FG-04B4 hand separation, FG-02I finger planning and FG-03D1 visual motion feasibility only for research.

## What the interface guarantees

1. It analyzes the *original* score event array, capped at 128 notes. Each note requires unique canonical `noteId`, MIDI pitch, positive duration and exact onset. Distinct authored onsets that would collide when rendered in one millisecond are refused instead of silently merged. This cap is a deliberate research bound, not a full-song feature.
2. The earliest incomplete source-onset group is derived from the entire source event array and an explicit caller-supplied, source-validated `completedNoteIds` set. A requested target outside that group refuses with `skipped-unfinished-onset`. Unknown notes and incomplete chords are never filtered from the target group.
3. **Author layers require BOTH `authorHand` and `authorFinger` on the same note. User override layers require BOTH `userHand` and `userFinger`.** Any partial override is unknown — the bridge does not silently borrow an author finger for a newly selected hand or vice versa. This is an intentionally conservative rule for a separate *research* adapter, not a change to existing user-edit behavior.
4. FG-04B4 `separateHandsResearch()` runs against original notes with original hand anchors; **only aggregate fixed/proposed/unknown counts** leave the bridge. Generated hand predictions are never inputs to visual planning.
5. FG-02I `proposeHybridScoreFingering()` runs when all hand owners are already independently anchored. It can generate finger candidates; the bridge exports **counts only, never generated finger values**. No solver result is promoted to `source-author` or `user-verified`. If any hand is unknown, finger proposal is skipped.
6. FG-03D1 `planAnticipatoryHandMotion()` receives only fully verified target and previous source-onset groups, original note start/duration/IDs, exact key geometry and caller-supplied transport. It will return `moving`, `static`, `markers` or `refuse` with the existing temporal/held-note/crossing gates. An unknown second-hand origin blocks inferred two-hand motion.
7. No code path modifies score, MIDI note-on/off, tempo, pedals, handwritten score labels, user overrides, SoundFont sound banks, MAESTRO or the original 14 transparent PNG poses. Outputs always include `researchOnly:true`, `productionEligible:false`, `expertValidated:false`.

## Trust boundary

The adapter **does not independently authenticate** that the caller's `authorHand`, `authorFinger`, user correction and completed IDs really originate from a trusted MusicXML parser / persisted manual override history / Wait state. Callers must establish those through existing source identity and user-override mechanisms; tests deliberately reject naive `hand`/`finger`/`source:'generated'` as proof of authored provenance. This is not yet a secure production bridge, a completed 3D/IK renderer or musical-performance expertise.

The adapter does not read or rewrite the player's existing score or display system. It cannot make inferred hands pedagogically correct. It also explicitly refuses scores longer than 128 events and scores requiring iteration-disambiguated repeated `noteId` values. Such support needs canonical repeat-instance IDs before authorization.

## Test and acceptance

- `node --test tests/finger-motion-research-bridge.test.mjs` — 21 deterministic positive/negative tests covering known author fingers, paired user overrides, refusal of generated/incomplete annotations, unplayed-onset gaps, partial chords, physically held notes, non-forward travel, two-hand verification, too-late travel, invalid identities and input immutability.
- `npm test`, `npm run build`, `npm run test:browser` and PR CI including original pinned ASAP/MAESTRO + both GM SoundFont banks must pass.
- External musician-labelled RH/LH ground truth, independent finger adjudication, authentic transport/completion adapters, browser GPU/frame timing and real keyboard validation **remain unverified**. Learner auto-guidance must remain **NO-GO**, even on a green CI.

This is a system integration research milestone, **not** an authorization to enable automatic fingering. See [development roadmap](ROADMAP-FINGER-GUIDANCE.md), [FG-03D1](FG-03D1-HAND-MOTION-FEASIBILITY.md), [FG-04B4](FG-HAND-SEPARATION-RESEARCH.md).
