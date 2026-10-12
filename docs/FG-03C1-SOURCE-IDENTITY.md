# FG-03C1 — Stable MusicXML source-note identity (v0.10.47)

**Status:** engineering implementation and automated acceptance, first increment of FG-03C. Does not yet enable user-edited fingering.

## Problem solved

The imported MusicXML `noteId` previously used only the declared `part id`, `measureIndex` and a source ordinal. Real-world XML can contain missing, repeated or nonconforming `part id` values. Two parts called `P1` with the same measure and ordinal could therefore produce identical `noteId`, leading future manual corrections to attach to the wrong performance event. Simultaneous unisons also demand separate identities even if onset and pitch coincide.

A continued note across a MusicXML tie is combined into one sounding note by the player. Before this phase, the source identifiers of the later written segments were discarded, losing the ability to track the original source markings without rereading the MusicXML.

## Implementation

- New pure function `musicXmlSourceNoteId(partId,partIndex,measureIndex,ordinal)` in `src/core/musicxml-note-identity.mjs`, included once in the existing browser bundle. It encodes declared part IDs so delimiters cannot collide; document-order **part index** differentiates duplicate part declarations; measure and source ordinal differentiate voices, repeated passages, and same-pitch unisons. It rejects nonsensical values and assigns no randomized identifiers.
- Imported playable note `noteId` now uses this deterministic identity. The assigned string does **not depend** on the random/time-based imported song record ID, second-based tempos or layout track index. The ID is stable when importing the same (expanded) XML again.
- All parsed playable MusicXML notes expose `sourceNoteIds`. Untied notes have one source ID; for valid tied continuations the player keeps the originating `noteId` while appending the identity of each later written segment to `sourceNoteIds`. MusicXML author's first fixed finger remains authoritative where multiple tied segments disagree; the original warning about finger substitution stays.
- The importer still retains original `notationXML`, `partId`, `staff`, `voice`, actual pitch and `fingeringSource: 'musicxml'`. Transpose/adaptation creates copies via spread and does not rewrite source objects. Finger Guidance's source-only learner gate remains unchanged.
- **Compatibility:** existing imported songs may still carry the previous `xml:P1:0:1` note ID form. They remain usable; this stage does not silently remap saved user corrections or migrate stored books because user fingering overrides do not yet exist. A newly imported work gets the new `xml:P1:0:0:1` form. Cross-import persistence will require a score fingerprint and explicit migration in FG-03C2.

## Acceptance

- Five pure Node cases test repeat imports, omitted/duplicate part identifiers, source ordinals, separator escaping, repeated measures and invalid IDs.
- Real Chromium imports author-annotated grand staff and tied score, deliberate duplicate `P1` parts with simultaneous same-pitch voices, and a repeated passage. It asserts no collisions, strict preservation of source fingers, two tie-segment IDs under one playable sound, and identical event IDs across re-imports.
- Complete original app CI (deterministic bundle, security, OSMD, backup and MIDI, research benchmarks) required before merge. No alteration to the original fourteen owner PNGs.

## Boundaries and next phase

FG-03C1 is **identity and provenance only**; no editable hand/finger UI and no persisted overrides. FG-03C2 will add override records keyed by validated source fingerprint and event ID, source-versus-user badge states, undo/reset, backup/restore and atomic error handling. Experimental auto-generated fingering remains NO-GO for teaching.

**Related acceptance:** on 2026-10-12 the project owner confirmed FG-03B2B-2 as accepted by a pianist. This human milestone and the source-identity release are separate. Review case files were not provided with the confirmation and no wider biomechanical certification is implied.

[Finger Guidance roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-03B2B geometry QA](FG-03B2B-RANGE-QA.md)
