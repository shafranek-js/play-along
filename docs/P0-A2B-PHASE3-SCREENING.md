# P0-A2b Phase 3 — actual piano repertoire screening and handoff

**Status:** source-catalogue pre-registration only. Eight authentic piano works, zero verified excerpt windows, zero qualified human reference decisions. This is not a benchmark or an authorization to change model weights. Hand-thesia stays 35%.

## 1. Source and usage boundary

The existing `research/fg04b1b-asap-score-manifest.json` already records 16 real ASAP score pairs with precise upstream revision and Git blob SHA-1 for MusicXML and MIDI. This Phase 3 selection uses that manifest **without redistributing files**. Upstream ASAP is CC BY-NC-SA 4.0, so **only private noncommercial research** is eligible and original attribution and license notices must be retained by a curator. An upstream license record is not proof that external use/redistribution rights, recorded performance rights or the professional reviewers' authorization have been cleared. No score bytes, audio, author finger annotations or expert submissions are shipped.

## 2. Pre-registered screening queue

| Split | Actual pinned work | Initial *screening hypotheses* (not verified) |
| --- | --- | --- |
| development | Bach — WTC I Prelude in C, BWV 846 | arpeggio; thumb-under |
| development | Beethoven — Piano Sonata No. 17, I | chords; overlapping held voices |
| development | Schubert — Moment musical No. 3 | chord inversions |
| development | Schumann — Kreisleriana I | repeated notes; overlapping voices |
| heldout | Chopin — Étude Op. 10 No. 1 | wide arpeggios; thumb-under |
| heldout | Liszt — Concert Étude S.145 No. 1 | crossing; wide leaps |
| heldout | Mozart — Sonata No. 12, II | chords; inversions |
| heldout | Debussy — Pour le piano, I | held voices; possible hand crossing |

Every tag above is a **candidate search target**, not a verified property of any specific passage. Some hypotheses may be false. The curator must select precise measure windows, check technique with a qualified pianist, and substitute legitimate development material if necessary. Do not change the heldout split or move the same composer, transposition, arrangement or near-duplicate across partitions after running algorithms.

## 3. Reproduction and no-leak gate

From the project root with Node.js 22:

```bash
npm run research:fingering:p0a2b-phase3
node --test tests/p0a2b-phase3-cohort.test.mjs
node scripts/p0a2b-phase3-screening.mjs --verify-sources
```

The offline audit checks the existing 16-case upstream manifest against the frozen eight-work screening selection, grouping by actual composer regardless of caller-chosen group IDs. It refuses duplicate works, changed source license/revision, missing technique **screening targets**, arbitrary instrument substitutions, or fabricated statements of human review/score alignment. The optional `--verify-sources` check fetches the eight real pinned MusicXML/MIDI pairs transiently, verifies **actual git blob hashes and byte lengths** with the existing ASAP source-pair checker, and reports only source-readiness counts. It does **not** claim MusicXML-to-MIDI note identity or pianist quality and does not write downloaded materials. Both audits run in the dedicated GitHub Actions research workflow.

## 4. Manual dependent gates — remain closed

1. **Rights and source curator:** Record a genuinely permitted purpose; provenance, attribution, license evidence, copyright and performance/arrangement conditions. Limit this noncommercial ASAP shortlist to appropriate research.
2. **Choose small playable excerpt windows:** A curator/qualified pianist selects exact measures after inspecting *the real score*, ensures required categories genuinely occur, records hand-size, repeats, voice overlaps and manual variants. Never invent measures or tag source events as verified without inspection.
3. **Verify event-level identity:** Preserve original score bytes; separately SHA-bind derived windows. Check every `noteId`, pitch, onset, physical NoteOff, tie/repeated onset/overlap and source-event order when converting from MusicXML to a piano MIDI input. If the score MIDI is independently quantized and cannot map one-to-one, **quarantine** it. Do not force nearest-pitch/time heuristics or fill missing events.
4. **Freeze development/heldout:** Use work/composer/arrangement grouping and a near-duplicate audit. Heldout cases are unseen by solver tuners and never used to tune penalty weights or select a favorable algorithm.
5. **Human review:** Using the existing private blind packet importer and `p0a2b-review-workflow.mjs`, recruit two independently qualified pianists and a distinct third adjudicator for disagreements. Confirm credentials and rights *outside JSON*. Blind all reviewers to Python/FG-02I predictions and other reviews until submission.
6. **Actual two-engine comparison:** Run the unchanged original Python PianoMotion and actual Play Along FG-02I against the *same* event-verified, finger-free source (separately score supplied-hands and blind-hands). Atomically reject all differing note IDs/onset/NoteOff. Aggregate agreement, coverage, abstentions, physical contradictions, by-hand/by-technique denominators and uncertainties. Only an independently verified heldout advantage could justify a later weight change.

**No-go at this stage:** No selected fragment windows, no confirmed MusicXML/MIDI semantic alignment, no independent experts, no accepted expert finger reference set, and no new measured P0-A2b accuracy. Preserve all source score/MIDI, manual fingering, existing review packets and the original fourteen PNG hand assets. `productionEligible=false` by design.

Existing instructions: [P0-A2b MusicXML intake](P0-A2B-MUSICXML-SOURCE-INTAKE.md) and [blind pianist review protocol](P0-A2B-REVIEW-PROTOCOL.md).
