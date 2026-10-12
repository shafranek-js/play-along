# FG-04A — External fingering candidate evaluation (v0.10.54)

**Status:** research-only candidate evaluation. **Automatic teaching remains NO-GO.** This is an integrity and provenance tool, not a claim of algorithmic correctness.

## Usage: read-only, entirely local

1. Import and select a MusicXML source score in Play Along. Go to **✍ Аппликатура** in the original (untransposed) playback mode.
2. Expand **🔬 Сравнение внешней аппликатуры (исследование)**. Run MasterPiano, PianoPlayer or another third-party tool **outside Play Along** on the same source score and save its resulting `.musicxml`, `.xml` or `.mxl`.
3. Select the matching engine, choose the external result, and click **Проверить кандидата**. This parses the chosen file locally in your browser, compares it to the current source, and displays preserved author numbers, newly proposed fingers, conflicts, gaps and undefined hands.
4. Use **Экспорт отчёта JSON** to download inspectable source note IDs, pitches, starts, part/staff/voice, original finger, candidate finger, candidate hand and classification for all supported notes.

No upload is performed by this Play Along feature; selecting a remote third-party service directly is not implemented. Playing the score, library storage, original MusicXML, previously confirmed manual corrections, Undo/Redo history and learner finger hints **are not changed**. The external sites may have different privacy terms; users who submit files to them should check those independently.

## Exact matching gate

`externalFingeringStructuralKey()` parses each `score-partwise` MusicXML into a canonical semantic tree. Whitespace-only formatting and XML attribute order do not affect its comparison. **Only** `<fingering>` annotations and empty wrapper `<technical>` / `<notations>` caused solely by those additions are ignored. Changes to note pitch, duration, rests, voice, staff, musical structure, titles, part names or any other XML data fail the whole comparison. Declared DOCTYPE/ENTITY, invalid XML, unsupported alternates/substitution, multiple finger numbers per note and unusual/misplaced fingering also fail closed.

After exact structural equivalence, every playable note is matched by its original canonical note ID and tie source segments, and checked for equal sounding pitch, part, staff, voice, onset and duration. Any missing or duplicate ID rejects the entire candidate. This deliberately strict contract may reject harmless metadata changes by external tools. A false rejection is safer than silently aligning the wrong note in a teaching application.

Each note is classified:
- **preserved** — originally printed author's finger still matches.
- **generated** — previously unlabeled note now has a 1–5 candidate finger.
- **conflict** — the candidate changes a printed author's finger.
- **removed-author** — the generator deleted an original author finger.
- **missing** — neither source nor candidate contains a supported finger.

A score may pass structural matching yet be flagged **conflicts** because an algorithm changed/removed authoritative fingers. This is never auto-approved. Even a `compatible` score is **only structurally compatible**; no fingering has been adjudicated by a pianist. `generated` does **not** mean `user-corrected` or `author-verified`. The library's existing full/partial/none coverage reports are unaffected by these research proposals.

## Roadmap and evidence required before FG-04B / FG-04C

- Collect a **licensed, reproducible set of 10–20** real piano MusicXML scores across beginner melodies, hand shifts, scales, chord inversions, two-hand chords, single-staff voice splitting, crossings, ties, polyphony and grace notes. A repository fixture set is not fabricated from these requirements: this stage provides the evaluator, **not** external provider results.
- Obtain MasterPiano and PianoPlayer outputs for the *same score*, plus PineappleMusicLab as a separate comparison if the files can be legally/exportably accessed. No public MasterPiano API is assumed. Pinned PianoPlayer source and setup must be noted in the next research record.
- Measure candidate coverage, original-anchor preservation, conflicts, refused candidates, unknown hands, physical conflicts, and expert-judged alternatives. Use held-out author/pianist passages and report disagreements without calling all nonmatches errors.
- Keep noncommercial research data (e.g. PianoVAM CC BY-NC-SA) out of production benchmarks/files; cite license and revision of every included excerpt.
- **FG-04C / FG-04D remain conditional NO-GO** until an independent pianist accepts each required category and the system clearly separates candidate predictions from approved manual/user-author sources.

## CI and safety

`tests/external-fingering-evaluation.real.test.mjs` exercises a real Chromium browser: valid source, new candidate fingering, unchanged author labels, downloadable JSON evidence, author conflict refusal, changed pitch, changed part name, alternate and invalid finger codes, immutable source and reset on song switch. The CI build also runs all previous music, OSMD, source identity, backup/XSS and research-only benchmark gates.

Release notes and architecture are required to be updated; original fourteen owner PNG hand pose assets are never touched.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [Dedicated fingering editor](FG-03C2B3-FINGERING-EDITOR.md).
