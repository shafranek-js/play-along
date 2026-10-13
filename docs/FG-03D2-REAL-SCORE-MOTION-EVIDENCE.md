# FG-03D2 — Pinned real-score hand-motion source evidence (v0.10.78)

**Status:** research-only, **NO-GO** for production auto fingering, pianist-approved hand motion, or 3D anatomical realism.

## What this stage actually measures

The existing FG-03D1 pure planner had only synthetic note/chord tests. The new independently source-pinned research audit runs **four distinct real MusicXML scores** from the *ASAP Dataset* through the **actual Play Along Chromium MusicXML importer**, then counts strictly authenticated original (source-author) hand+finger *pairs* and passes only completely verified adjacent score-onset groups into the existing hand-motion feasibility screening. It does **not** infer fingers from pitch or staff, take suggestions from FG-04B4/FG-02I, or claim anything about biomechanical correctness.

The four fixed representative scores are:
- Bach WTC I Prelude BWV 846 (arpeggios)
- Bach WTC I Fugue BWV 846 (polyphonic voices)
- Chopin Etude Op. 10 No. 1 (wide leaps)
- Mozart Sonata No. 12, movement II (classical phrasing)

The four files are selected **only** from \`research/fg04b1b-asap-score-manifest.json\`, pinned to exact ASAP revision \`afc815c75c42e83a79c03feb6da8a35e77d4c6b8\`. SHA-1 Git blob IDs and byte sizes are verified before any browser import. **License CC BY-NC-SA 4.0; noncommercial research only.** Neither licensed raw score bytes nor per-note arrays are stored in reports/artifacts, committed to the repo, or published to GitHub Pages. This is *not* a substitute for verifying the licence suitability of future products.

## Real-score screening boundaries

1. The source must be an original score-partwise MusicXML imported by the actual app, with unique playable \`noteId\` and ordered \`sourceNoteIds\`, valid pitch/start/duration, and one authentic \`noteOn\` plus \`noteOff\` at the expected original source times. All score note identities are verified before attempting motion.
2. An expanded repeat, reimported Play Along user-edited export, impossible duplicate note/segment identities, overlapping identical physical keys, and submillisecond onset collisions are **explicit refusals**. MusicXML that the importer cannot play is reported as refused, not synthesized from a theoretical score.
3. Author hand+finger exists only when imported \`fingeringSource==='musicxml'\`, hand \`LH/RH\` and finger 1–5 **on the same original source note**. A staff alone, user-edit export, inferred hand, missing hand, and generated finger are never accepted.
4. Each assessed note group uses the exact original onset and the complete original notes. The origin must be the **immediately previous original onset** and all source labels in both groups must be complete. Unknown / incomplete earlier chords are not filtered away. The hand's original notes must have been released before motion; opposite-hand clearance uses a bounded, indexed scan of **all physical notes that may still be sounding**, not a guessed "opposite clear" flag.
5. For eligible hand transitions, FG-03D1 screens source-derived keyboard geometry, held keys, chords, travel speed and crossings. Results are limited to counts of \`moving/static/markers/refuse\` and reason codes. **A \`moving\` count means an unvalidated engineering heuristic did not reject the transition; it does NOT mean a pianist can execute the move or that the fingers are correct.** Unlabelled and incompatible passages remain abstentions.
6. Score MIDI timings, velocity, pedal/CC events, MusicXML, MAESTRO, SoundFont, visual hand assets and live player/Wait/Tempo/Ghost controls are **never modified**. No solver result is fed back into learner UI.

## Evaluation and honest limitations

\`node --test tests/real-hand-motion-evidence.test.mjs\` checks canonical IDs, authored-only gates, unknown groups, held-key overlap, same-onset ambiguity, cross-hands, physically infeasible leaps, audio-event identity, full-source immutability and absence of score-note exports.

\`npm run research:hand-motion:real\` requires Node 22, installed Chromium, network for immutable pinned ASAP source, and a built \`dist/index.html\`. It audits the four original real scores and optionally writes **aggregate-only** JSON when \`FG03D2_REPORT=artifacts/fg03d2-real-hand-motion-evidence.json\` is set. A hard source hash mismatch, unsafe/unpinned redirect or failure of *all* four browser imports fails the research step; an individually unsupported source is recorded as refusal instead of quietly replaced. The PR CI executes the audit separately after pinned ASAP validation and uploads the metrics-only artifact.

Even a verified source score may have **zero** independently paired author fingers. Such a case reports \`NO_AUTHORED_FINGER_AND_HAND_PAIRS\`; a green CI does **not** prove fingering coverage. There is no independently licensed pianist-annotated hand trajectory, 3D joint dataset or hidden-case educator review attached to ASAP. Therefore report fields \`pianistJudgedAccuracy\` and \`labeledGroundTruthAccuracy\` are always \`null\`, not 0% or 100%. Overall Hand-thesia goal remains **35%**, unchanged by provenance and benchmarking infrastructure.

**Next gate:** locate an independent rights-cleared set of labeled hand movements and trained-pianist adjudications covering hand crossings, thumb-under, substitutions during ties, large leaps and both-hand sustained chords. Compare physically measurable outcomes *before* enabling automated motion instructions.

[FG-03D1 heuristic feasibility](FG-03D1-HAND-MOTION-FEASIBILITY.md) · [FG-04D1 original trust gate](FG-04D1-IMPORT-PROVENANCE-GATE.md) · [ASAP manifest and licence](FG-04B1B-REAL-SCORE-CORPUS.md)
