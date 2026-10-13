# FG-03D3 — Real-score same-pitch overlap refusal triage (v0.10.79)

## Measured root cause

FG-03D2, [PR #79](https://github.com/shafranek-js/play-along/pull/79), verified four immutable ASAP source scores with the actual Play Along Chromium importer. Original CI [run 38394225466](https://github.com/shafranek-js/play-along/actions/runs/38394225466), artifact **fg03d2-real-score-motion-source-evidence**, ID **11810804177**, showed:

| Score | Importer | Motion-audit verdict | Source notes |
| --- | --- | --- | ---: |
| Bach Prelude BWV 846 | IMPORTED | NO_AUTHORED_FINGER_AND_HAND_PAIRS | 549 |
| Bach Fugue BWV 846 | IMPORTED | REFUSED: OVERLAPPING_IDENTICAL_PHYSICAL_KEY | 752 |
| Chopin Etude Op. 10/1 | IMPORTED | REFUSED: OVERLAPPING_IDENTICAL_PHYSICAL_KEY | 1,337 |
| Mozart Sonata No. 12/II | IMPORTED | REFUSED: OVERLAPPING_IDENTICAL_PHYSICAL_KEY | 1,201 |

Totals: **4/4** pinned sources imported, **1/4** reached score analysis, **0** source-verified author hand+finger pairs, **0** attempted hand transitions, **0** independent pianist ratings. An overlapping pitch in multiple notation voices is not itself proof of a broken MusicXML score.

## Corrected engineering contract

FG-03D2 rejected an **entire score** on encountering two simultaneously active, independently notated same-pitch note IDs. In real polyphony, repeated voices and sustained/retriggered notes such overlap can legitimately be represented in the written score. Yet two independent finger presses of one physically held piano key **cannot be safely instructed**. FG-03D3 separates these concerns:

- Preserve every original source ID, tied source segment and original note-on/off, pitch, onset/duration and audio-event timeline. Any malformed or duplicated source IDs, mismatched original note/audio events or submillisecond onset collision **still rejects the entire original score**.
- Group contiguous/transitively overlapping original notes **per physical pitch**. An overlap marks the *whole transitive group* ambiguous; the algorithm assigns **no fingering, hand or motion** to its notes.
- Unite ambiguous time intervals across pitches into disjoint quarantine windows. Every adjacent source-onset transition intersecting one of these windows abstains with reason **ambiguous-physical-key-interval**. Source groups are never skipped or silently repaired; clean, consecutive onset transitions outside these windows may still pass the existing research-only FG-03D1 screening if they have independent complete composer-provided hand+finger pairs.
- Report only aggregate totals: **physicallyAmbiguousSamePitchClusters**, **physicallyAmbiguousSourceNotes**, **physicallyAmbiguousTimeWindows**, and skipped source transitions. No raw note arrays, pitches or identifying source note IDs appear in evidence artifacts.
- Construction cost is bounded: O(N) per-pitch collision groups, O(N log N) sorted interval union and binary search per transition. The original score, all MIDI events, user corrections, 14 PNGs, SoundFonts, MAESTRO, Wait and Tempo are untouched.

## Tests and honest interpretation

Adversarial Node tests include an exact positive control with two clean note transitions separated by a same-key overlap, transitive voice overlaps, simultaneous LH/RH attempts on one physical key, sequential non-overlapping repeated pitches, source immutability and deterministic aggregate reports. Existing source ID, audio-event and timing mismatch cases still refuse. The real CI research audit still uses four immutable ASAP sources, complete Git blob hashes, actual Chromium MusicXML import, **CC BY-NC-SA 4.0 (research noncommercial only)** and metrics-only reports.

**Moving** remains a coarse screened trajectory, not biomechanical validity. The ASAP sources currently provide zero independent complete author hand+finger pairs, so even with successful local overlap classification, **zero real transitions qualified for expert motion assessment** is the expected honest outcome. No real pianist-labelled trajectory dataset is introduced; eligibility and accuracy must not be conflated. Research and automatic fingering stay **NO-GO** for learner guidance. Hand-thesia progress remains **35%**.

**Next:** rights-cleared pianist-annotated original note/pitch/hand/finger and judged motion references, especially tied substitutions, true hand crossings, key-restrike and two-hand held chords.

[FG-03D2 audit](FG-03D2-REAL-SCORE-MOTION-EVIDENCE.md) · [FG-03D1 feasibility](FG-03D1-HAND-MOTION-FEASIBILITY.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
