# P0-A2b — MusicXML source intake and candidate triage

## What is implemented

The P0-A2b reviewer protocol now has **real MusicXML input preparation**, separate from source author fingering and separate from the original PianoMotion solver. Nothing in this tool establishes that a pianist has approved the source or the calculated hand/finger choices.

- `src/core/p0a2b-source-intake.mjs` checks original MusicXML notes against the app's original MIDI key-down and physical key-up event identity. Notes with missing/duplicate IDs, changed end times, percussion or lossy unsupported parser features are **refused**, never matched by nearest pitch. Author fingering is stripped from candidate packets, and hand assignments are deliberately omitted (`blind-hands`). A source SHA-256 is mandatory.
- `scripts/p0a2b-import-musicxml.mjs` uses the **actual production MusicXML browser parser in headless Chromium**. It takes an explicitly rights-confirmed, local uncompressed `.musicxml`/`.xml` file and writes a no-overwrite, mode-0600 private blind packet. `DOCTYPE` is accepted **only** for the known standard Recordare MusicXML Partwise PUBLIC declaration with no internal subset; it is stripped before parsing. Arbitrary `DOCTYPE`/all `ENTITY` declarations are refused.
- The importer marks only machine-verifiable **co-onset chord candidates**, overlapping held-voice candidates, and same-pitch repeated-note candidates. Co-onset does not imply a *same-hand* chord. **Inversions, arpeggios, thumb crossings, hand crossing and ergonomic wide spans are NOT automatically labelled**: musicological/hand attribution belongs to an independent pianist.
- `scripts/p0a2b-mit-candidate-qualification.mjs` separately checks six already version-pinned **MIT-licensed MusicXML Test Suite engineering examples**: Schubert chord, interleaved voices, single/crossed arpeggios, grand staff and multi-staff chords. Every XML is rechecked against its immutable upstream **git blob SHA-1** before local private import. It prints **aggregate-only** technical readiness and explicit refusal reasons. These are synthetic notation fixtures — **NOT real performed/independently fingered piano works or ground truth**. No XML, packet, MIDI or finger list is committed.

## Run locally on an authorized score

Prerequisites: Node.js 22, `npm ci`, `npx playwright install chromium`, `npm run build`. Keep source music files and resulting private packets outside the public repository.

```bash
node scripts/p0a2b-import-musicxml.mjs \
  --file /private/licensed-piano-score.musicxml \
  --id study01-piece01 --group composer01-arrangement01 \
  --split development --rights-confirmed \
  --output /private/piece01-blind-packet.json
```

`--rights-confirmed` is the operator's confirmation that reuse is permitted. It is **not a machine-produced license approval**. The operator must retain documentary permissions and reviewer qualifications outside GitHub; this flag can never establish consent, ownership or rights on its own. Use `--split heldout` only after the independent pre-registered split; do not move a work/composer group after inspecting model predictions.

Next, produce independent blank reviewer templates:

```bash
node scripts/p0a2b-review-workflow.mjs template \
  /private/piece01-blind-packet.json /private/reviewer-A.json reviewer-A independent
node scripts/p0a2b-review-workflow.mjs template \
  /private/piece01-blind-packet.json /private/reviewer-B.json reviewer-B independent
node scripts/p0a2b-review-workflow.mjs study \
  /private/piece01-blind-packet.json /private/piece02-blind-packet.json
```

Obtain genuinely independent blind reviews and third-party adjudication for disputed choices *before* running the candidate evaluation. Follow [P0-A2b review protocol](P0-A2B-REVIEW-PROTOCOL.md). Machine-generated fingering, historical author/editor labels and the two algorithms' predictions are **not** substitutes for those reviews.

## Verify the technical tooling

```bash
node --test tests/p0a2b-source-intake.test.mjs
node tests/p0a2b-source-intake.real.test.mjs
node scripts/p0a2b-mit-candidate-qualification.mjs
```

The standalone [candidate intake GitHub Actions workflow](../.github/workflows/p0a2b-candidate-intake.yml) runs the same checks with a production build and a real Chromium browser. Its output is a source-compatibility report, not a piano-learning model benchmark. A source refused for missing identity, unsupported ornaments/repeats, or unsafe XML is intentionally **not eligible** for expert-performance evaluation.

## Research status and next acceptance gate

- Engineering verification is a prerequisite, **not** a substitute for independent pianist ratings.
- Real source author finger labels, if present, are deliberately removed before reviewers receive the packet and are not used to declare expert consensus.
- True MIDI/MusicXML score-to-solver identity must be proven separately for **each** resulting FG-02I and PianoMotion output before applying P0-A2b accuracy metrics. This candidate intake does not execute either fingering engine.
- The private review stage must still collect authorized complex polyphonic works and two independent professional pianist assessments plus dispute adjudication. Until then `expertValidated=false`, `productionEligible=false`, no measured P0-A2b accuracy gain and no increase to Hand-thesia's 35% completion estimate.
