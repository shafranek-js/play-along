# FG-04B3c — ASAP real-score refusal triage and cross-voice tie provenance

**Release target:** Play Along v0.10.64  
**Context:** MusicXML/MIDI comparison research on the **current SoundFont-enabled v0.10.63 main**, without changes to audio, loaded banks, playback clock, Score/Wait/Tempo/Listen modes or learner fingers.

## Evidence from the previous v0.10.61 audit

The upstream [ASAP real-score pair manifest](../research/fg04b1b-asap-score-manifest.json) includes 16 immutable MusicXML/MIDI pairs (CC BY-NC-SA 4.0; noncommercial research only). The [FG-04B3b workflow](https://github.com/shafranek-js/play-along/actions/runs/38291508054) and uploaded artifact `fg04b3b-asap-16-score-xml-midi-audit` measured **1 aligned / 15 rejected**:

| Status / exact refusal | Works | Count |
| --- | --- | ---: |
| Aligned | Bach Prelude BWV 846 | 1 |
| `MUSICXML_UNPAIRED_TIE_STOP` | Bach Fugue BWV 846 | 1 |
| `MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED` | Beethoven Sonata 17/I; Haydn Sonata 39/I; Schumann Arabeske; Kreisleriana I | 4 |
| `MUSICXML_GRACE_TIMING_UNSUPPORTED` | Beethoven Sonata 11/II; Chopin Études 10/3 and 25/1; Mozart Sonata 12/II; Schubert Impromptu 90/3; Liszt Étude S.145/1; Chopin Polonaise 53 | 7 |
| `SCORE_EVENT_UNMATCHED` | Chopin Étude Op. 10/1 | 1 |
| `MUSICXML_BACKUP_BEFORE_MEASURE` | Debussy Pour le piano I | 1 |
| `ZERO_LENGTH_MIDI_NOTE` | Schubert Moment musical No. 3 | 1 |

**This is a precise research audit, not 15 demonstrated errors in the compositions themselves.** It describes what the conservative FG-04B3b adapter could establish.

The aggregate baseline is frozen in [fg04b3c-asap-audit-baseline.json](../research/fg04b3c-asap-audit-baseline.json), with provenance of the exact CI workflow, source revision, case IDs, statuses and reasons. It contains **no copyright-protected note sequences, MIDI or XML bytes**.

## Targeted source-verified repair

Inspection of Bach's pinned Fugue score showed a genuine MusicXML notational voice reassignment: a G4 tie starts in voice 1 at the end of measure 15 and ends in voice 3 at the start of measure 16. The previous validator keyed the entire tie solely on voice + pitch and incorrectly rejected a valid notational transition.

FG-04B3c now attempts a **strictly unique** continuation if a tie stop lacks the original voice: the previous open tie must have the same source part index, staff and pitch, and its *exact* normalized release beat must equal the new onset beat. There is **no MIDI-derived identity, hand inference, guess, time tolerance relaxation or arbitrary voice reassignment**.

If two candidate ties qualify, reject `MUSICXML_AMBIGUOUS_TIE_STOP`; an impossible cross-staff or discontinuous tie remains rejected. Retain the original initial source ID and every linked note segment ID. The score MIDI matcher still requires all notes matched one to one, including exact note-off (fixed 2-ms export tolerance). Thus accepting a valid XML tie does **not** itself imply matching the MIDI file.

## Verified FG-04B3c result on original real scores

The [FG-04B3c PR CI run](https://github.com/shafranek-js/play-along/actions/runs/38357253297) passed the pinned network audit and all original baseline checks. The new audit still finds **1 aligned score (Bach Prelude BWV 846) and 15 refusals**, with **zero new full-score alignments**, **zero regressions**, and one changed refusal reason:

- **Bach Fugue BWV 846:** `MUSICXML_UNPAIRED_TIE_STOP` → `ZERO_LENGTH_MIDI_NOTE`. This demonstrates the crossed-voice tie was parsed, but the original MIDI contains an event that the strict FG-04B2 parser refuses. It is **not** evidence of complete XML↔MIDI correspondence.
- Other refusals unchanged: 7 grace-note timing, 4 repeat navigation, 1 score/MIDI event mismatch (Chopin Op. 10/1), 1 backup/voice timeline (Debussy), 1 original zero-duration MIDI note (Schubert Moment musical 3).
- Post-change refusal groups: **7 grace**, **4 repeat**, **2 MIDI source zero-length**, **1 score/MIDI divergence**, **1 voice-timeline refusal**.

Do not silently discard or extend a zero-duration note to raise the apparent success count. The next step is to inspect this source MIDI note's quantization and its source MusicXML event without rewriting either file.

## Baseline regression and actionable report

`src/core/asap-audit-triage.mjs` compares the current complete 16-case results to the frozen v0.10.61 baseline:

- Identify newly aligned works only when a full comparison returns `aligned`.
- Detect regressions when previously aligned scores become rejected; the actual network audit **fails CI** in this case.
- Keep changed *refusal reasons* distinct from new matches; moving from a tie refusal to a timing refusal **is not success**.
- Group remaining refusals by repeat navigation, grace realization, tie provenance, voice timeline, score/MIDI divergence, source MIDI problems and other unsupported conditions.
- Record safe per-piece IDs and refusal codes in stdout and the uploaded aggregate CI artifact, without exposing raw note pitches, source note IDs, musical fragments, MIDI data or finger assignments.

Run:

```bash
FG04B3C_REPORT=artifacts/fg04b3c-asap-xml-midi.json npm run research:fingering:asap:xml-midi
```

The research-only regression test suite covers unique cross-voice continuation, multiple plausible tie starts (mandatory refusal), invalid cross-staff and noncontiguous ties, exact baseline composition, changed refusal reasons, prior success regressions, scope tampering and safe reporting.

## Invariants and next musical step

- Keep the two original SoundFont banks (GeneralUser GS and MuseScore General), bank checksums, General MIDI routing, 14 transparent hand pose PNGs, source MusicXML, original tempo and note release semantics **unchanged**.
- **Do not** auto-correct grace notes, repetitions, ornaments or source MIDI zero-duration notes merely to obtain green metrics. Those must be investigated separately against the original edition and musical behavior.
- The 16-score audit is CC BY-NC-SA noncommercial **research only**. It does not ship third-party score files with the public app.
- The next FG-04B3d work is an evidence-backed plan for simple repeat traversal, grace-note timing and independent score tempo validation on **actual reference exports**. Distinguish an unsupported feature from wrong music.
- No Hand-thesia/MasterPiano candidate has been validated by an independent pianist, and `productionAutoFingeringAllowed` remains `false`.

[FG-04B3b](FG-04B3B-ASAP-XML-MIDI-AUDIT.md) · [Finger Guidance roadmap](ROADMAP-FINGER-GUIDANCE.md) · [SoundFont architecture](SOUNDFONT-ORCHESTRATION.md).
