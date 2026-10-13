# FG-04B3e — bounded MusicXML repeat traversal research

**Workstream:** Music Engine · **Issue:** #60 · **Branch:** `research/music-engine-fg04b3e-repeat-traversal`  
**Starting main HEAD:** `c41241b28edd90103b703222f2990f1de5205a50` · **Release impact:** none (research-only).  
**Status:** conservative prototype / **NO-GO** for automatic learner fingering and production playback.

## Problem and scope

The current `musicxml-score-midi-bridge.mjs` correctly refuses MusicXML `<repeat>`
and `<ending>`; FG-04B3d already inventories notation markers and source-MIDI
zero-length events, but **does not** unfold or match repeats. This task adds a
separate research module, `src/core/musicxml-repeat-traversal.mjs`. It leaves
the existing FG-04B3a strict note matcher, source note normalizer, all MIDI/audio
transport code, raw musical files and all fingerprints untouched.

The reference [MusicXML 4.0 tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/)
and [repeat](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/repeat/) /
[ending](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/ending/)
definitions identify `forward` as the repeat-start barline,
`backward` as its end, and `ending type="start"` / `stop` /
`discontinue` as first/second volta boundaries. Only that **explicit,
bounded subset** is included; multi-number endings and unknown counts refuse.

## Pure APIs and identity

1. `parseMusicXmlRepeatControls(xml)` returns independently specified
   measure indexes/numbers, part IDs, and left/right **barline-boundary**
   controls. It refuses different part control maps, malformed navigation,
   external-entity definitions, Dal Segno/Coda/Da Capo, non-2 `times`,
   unsupported locations, unpaired endings and after-jump navigation.
   Ordinary external MusicXML DTD declarations are **not resolved**.
   The parser returns only boolean **blockers** for unresolved grace and
   ornaments rather than duplicating FG-04B3d counting diagnostics.
2. `planMusicXmlRepeatTraversal({...controls, durations})` takes
   independently supplied **written-measure durations in quarter notes**.
   No duration is inferred from the reference MIDI. It returns a finite array
   of visits with `measureIndex`, original `measureNumber`, `iteration`,
   `repeatGroupId`, `startBeat`, and `durationBeats`. A pickup can
   have a fractional length; zero/invalid durations refuse.
3. `expandMusicXmlRepeatNotes(plan, writtenNotes)` requires canonical,
   unique `sourceNoteId`, part, staff, voice, pitch, written-measure index,
   onset and duration in quarter notes. It copies each event **unchanged**
   apart from explicit playback metadata (`playbackId`, `iteration`,
   `repeatGroupId`, absolute performed beats); the original
   `sourceNoteId` stays intact in every iteration, with tie markers preserved.
   `(sourceNoteId, iteration)` is unique in the supported traversal;
   `playbackId` is separately unique and never written into source XML.
4. `matchRepeatExpansionToMidi(expansion, midiBytes)` adapts the **separate
   playbackId** for the pre-existing `alignNormalizedScoreToMidi` matcher.
   It requires **all actual pitches, NoteOn times and NoteOff times** to pass
   the existing 2 ms tolerance. It refuses unresolved ties, zero-length
   MIDI source notes, missing notes, wrong pitches and timing disagreements.
   A match can validate event correspondence, **not** MusicXML editorial
   equivalence, independent score tempo, or author fingering suitability.

No public app/player invocation was added. All results remain research-only
and `productionAutoFingeringAllowed=false`.

## Traversal behavior and complexity

- Explicit forward/backward repeats (exactly two passes); **one** initial
  implicit repeat-start at movement beginning; consecutive disjoint groups
  whose backward/forward signs share a boundary.
- Explicit **paired** first and second endings. The first ending must
  terminate at its backward repeat; the second starts immediately after it.
  The first ending is skipped on the second pass; the second is played in
  the second iteration. Discontinue is accepted as an ending close.
- Reject nested/overlapping/ambiguous repeats, incomplete or overlapping
  endings, non-2/unspecified unknown navigation, duplicate controls and
  grace/ornament timing without a defensible independent event realization.
- Hard caps: 4 MB raw XML, 5,000 written measures, 12,000 performed visits,
  25,000 written and expanded notes, positive finite measure durations,
  and 86,400 performed quarter beats. The planner uses finite group
  construction instead of executing jump commands; recursion or indefinite
  repeat loops cannot occur. Limits **refuse**, never silently truncate.
- Multi-part repeat-control identity is required. The *rhythmic synchronization*
  of independent voices and parts still needs a trusted per-measure MusicXML
  normalizer before this can audit real notes. The planner does not invent it.

## Synthetic evidence

`tests/musicxml-repeat-traversal.test.mjs` contains **28** deterministic
scenarios with hand-authored expected measure orders, onset/release times,
IDs and explicitly expected refusals. Cases include normal and implicit
repeats, first/second volta, multi-measure ending, adjacent repeat sections,
fractional pickup, rest/chord, simultaneous polyphony, multi-part control
agreement and disagreement, XML comments/DTD, invalid repeat counts,
navigation, limits, grace/ornaments and strict pitch/on/off mismatches.
Two positive synthetic comparisons use real MIDI bytes assembled by the
test fixture and the existing strict matcher; negative comparison cases
include pitch changes, incomplete note counts and a changed release.

**Execution evidence:** 28/28 cases passed when the exact committed module
sources and test bodies were executed in an isolated V8 JavaScript harness
with lightweight Node `Buffer`/`TextDecoder` adapters, using the existing
FG-04B2 MIDI inspector and FG-04B3a matcher code. This is **not** a claim
that `node --test` or the full production/browser suite has run; run
`node --test tests/musicxml-repeat-traversal.test.mjs` in a complete checkout
for the authoritative Node result.

## Pinned real ASAP research (no invented full matches)

Four previously refused works were inspected from exact immutable Git blob
SHA identities at ASAP revision
`afc815c75c42e83a79c03feb6da8a35e77d4c6b8`.
ASAP is **CC BY-NC-SA 4.0 / noncommercial research only**. Neither score
nor MIDI bytes are committed to this PR or included in published artifacts.

| Pinned piece | Control structure | Full note alignment | Reason |
| --- | --- | --- | --- |
| Beethoven Sonata 17/I | Parsed (232 measures; 5 controls) | Not attempted | Unresolved grace timing and ornaments |
| Haydn Sonata 39/I | Parsed (114 measures; 11 controls) | Not attempted | Unresolved grace timing and ornaments |
| Schumann Arabeske | Parsed (231 measures; 6 controls) | Not attempted | Unresolved grace timing |
| Schumann Kreisleriana I | Parsed (78 measures; 15 controls) | Not attempted | Unresolved grace timing |

**Real-work outcomes:** `aligned=0`, `unsupported=4`,
`ambiguous=0`, `score_midi_mismatch=0` **among these four repeat probes**.
The zero mismatch count does **not** mean scores matched: none reached the
note matcher after grace refusal. **0/4 new full matches**, no full MIDI
score match attempted. Existing verified 16-piece baseline remains
**1 aligned / 15 refused**; the prior successful Bach Prelude is not
reclassified.

To repeat this control-only real-work probe using the existing SHA/length
verified original source loader (requires network):

```sh
node scripts/fg04b3e-asap-repeat-probe.mjs
```

The probe prints only score IDs, structural control counts and conservative
refusal categories. It does not invent measure durations or compare MIDI
note times. The unchanged main audit remains authoritative.

## CI and integration

The existing `.github/workflows/pr-tests.yml` has a global PR gate requiring
`README.md` in **every PR**. The newer `docs/PARALLEL-CHAT-DEV.md` and
issue #60 explicitly reserve README/roadmap/version updates for Lead Architect.
This research PR therefore **must not alter README to satisfy that gate**.
The Lead should waive that gate for scoped research PRs or run the Node test
manually, then carry out full Node, browser, SoundFont and MAESTRO regression
before merging. A red README gate is **not** evidence that the research
tests failed, but neither is it evidence they passed.

**Explicitly unchanged:** original source XML/MIDI, `package.json`,
`README.md`, shared roadmap, GitHub workflows, application version,
production MusicXML import and playback, Web MIDI/Wait/Tempo/Listen,
both SoundFont banks, MAESTRO, owner-provided 14 PNG hands, Fingering AI
and Hand Animation modules.

**Next research gate:** independently validated performed measure lengths
and per-note tie/grace timing for real works, followed by actual
onset/release verification against each original MIDI source and a musician's
review of any successful, non-ambiguous alignments. Current automatic learner
fingering remains **NO-GO**.


## Lead Architect integration v0.10.71

This original research document preserves its earlier GitHub README-gate observation as historical context. That conflict was resolved on main by PR #63 before integration. The Lead now includes this original source module, tests, research probe and documentation in a full versioned v0.10.71 release branch, **registering all 28 repeat-traversal tests in standard `npm test`** and updating the shared README/roadmap/package. Only a fully green PR CI (including real Chromium, both 128-program SoundFont banks and MAESTRO) permits merge. Original source score/MIDI remains byte-identical. The four externally licensed ASAP repeat works remain 4 refused / 0 new full alignments due to unresolved grace/ornament timing. No production-player repeat execution or automatic learner-facing fingering is enabled.
