# FG-03C2B7 — Source-verified tied note migration (v0.10.76)

## Why a tied note needs a separate identity gate

A MusicXML continuation `<tie type="stop"/>` is **not** an independent MIDI note. Play Along's existing importer merges compatible sequential written notes into one held playable event. Its `noteId` is the *first written source segment*, and `sourceNoteIds` lists **all** the original written segments. FG-03C2B5/6 intentionally excluded these notes from the cross-edition editor, because comparing the first segment alone could transfer user fingering to an unrelated sustained note.

FG-03C2B7 adds a **source-verified, user-decided** path for chains of two to sixteen written segments. No generated or inferred fingering. Real browser import remains unmodified.

## Verification contract

- Independently reparse both editions' original MusicXML. Every playable original segment must still match the importer-provided canonical source identifier, pitch (including transposition), voice, staff, part, and first-segment playable identity. Reject extra/missing/duplicated segment IDs, unsafe XML and navigation, expanded-repetition source, and unsupported grace/unpitched notation.
- For a merged held note, the original XML must show **exactly** `start` on the first segment, `stop` + `start` on each middle segment, and `stop` on the last segment. Reject malformed, repeated, orphaned or incomplete ties, unsupported chain lengths, and changes to pitch/voice/staff inside the held note.
- Compare the entire non-fingering XML signature of every written segment **in order**, including pitch, duration, source tie elements, staff, voice and other notation. The only ignored tags are validated source `<fingering>` annotations in `note/notations/technical`. This allows an inserted unrelated measure before a chain while refusing changed segment duration, different tie topology, changed musical notation or a 2-vs-3 segment mismatch.
- Manual candidates retain same part/pitch/voice/staff and exact segment profile and never propose a tied target for an untied source or vice versa. A duplicated tied passage shows multiple options with **no default selection**; each must be reviewed individually. Existing 24-options-per-source and 150 source-row bounds remain.
- Already-authored or saved user finger/hand conflicts require separate user acknowledgements. The requested destination is recomputed from verified source snapshots before any commit; duplicate target selection or stale saved corrections are rejected. All accepted edits go through one validated atomic Undo/Redo batch.
- Import/export, stored original MusicXML, 14 source PNGs, original MIDI event timing, MAESTRO/SoundFont, Wait/Tempo/Listen and generated finger NO-GO remain unchanged. This is data portability, not proof that fingers are correct.

## Acceptance

Seven additional pure Node tests cover verified 2/3-segment ties, shifted measure indexes, wrong stop note duration, orphan or malformed markers, tied→plain refusal, ambiguous duplicate chain, author-notation overwrite. A Chromium integration test imports a real old two-measure tie (one merged held playable note), applies local fingering, imports a new edition with an inserted unrelated measure, explicitly chooses the tied target, verifies source XML and MIDI audio event timelines unchanged, and rolls back the edit with Undo. Run the existing full CI, pinned source, MAESTRO and SoundFont gates before deployment.

## Unsupported

- Manual transfers **across a changed tie segmentation**, e.g. `quarter+quarter` rewritten as one half-note, or different written durations.
- Finger substitutions *while a held note is physically depressed*: the player currently tracks one finger for the entire held MIDI event.
- Unlinked/slur-only `<tied>` notation without actual musical `<tie>` events, orphan source ties, unverified repeats, more than 16 tie segments, and genuine semantic reinterpretations across editions.

[FG-03C2B6 manual review](FG-03C2B6-MANUAL-REVIEW.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
