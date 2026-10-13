# FG-03C2B6 — Explicit manual reconciliation of ambiguous MusicXML editions (v0.10.75)

## Scope

An **expert-guided review workflow**, not automatic score matching or automatic fingering generation. The previous v0.10.74 safe migration still handles unique, unchanged measures. This milestone adds a separate route for its **unresolved or conflicting** old user corrections.

From **✍ Аппликатура → 🔁 Перенос ручной аппликатуры из другой редакции**, load the old *original* MusicXML/MXL associated with locally saved user corrections. After **Проверить перенос**, the UI shows both safe candidates and a **Ручное сопоставление** section. In the latter, each source edit has: source measure, MIDI pitch, voice/staff, hand/finger and ambiguity reason; a dropdown with individually distinguishable target **source note IDs** and measure/pitch/voice/staff; an initially unchecked per-row statement confirming the exact match; plus two independent unchecked acknowledgements for overwriting a target author's fingering and overwriting a target's already saved user correction.

**Nothing is preselected.** The button **Применить вручную выбранные ноты** remains disabled until at least one row has both a chosen destination and explicit individual consent. Overwrite flags are checked against the *selected option* by a pure validation function. Selection of the wrong target may still be musically wrong: matching pitch, staff and voice only reduces browsing noise; it is **not** evidence of true note equivalence. The responsible musician must decide whether the notes correspond.

## Protected invariants

1. The old file must have source-exact previously stored user edits in this browser. The new/current file must be a distinct imported original MusicXML edition. Existing metadata, part-index/order and XML/source-segment verification still apply through `fingerEditionReconcile` and `fingerEditionSnapshot`.
2. Manual candidates arise **only** for prior unresolved/conflicted corrections. The source and destination must have the same part index, MIDI pitch, voice and staff. No cross-part/cross-voice, transposition suggestion, nearest-time scoring, source guessing or generated finger numbers.
3. The candidate count is capped at **24 possible destinations per old note**, with at most **150 source rows**. Over-budget cases are excluded with a visible count; long scores are never shown as proof of a unique mapping.
4. Cross-measure tie chains, unsupported navigation, malformed/unsafe MusicXML, missing/duplicate original source correspondence and metadata-incompatible editions are rejected. A changed notation segment cannot be silently reused.
5. An existing user correction or incompatible author fingering/hand is never silently overwritten. The exact conflicting target requires its own separate acknowledgement; different source notes cannot be mapped into one target in a batch; unknown targets, duplicate sources, malformed or implicit consent all reject **the entire operation**.
6. Before applying, the browser checks exact current/old song, old corrections and new corrections against those inspected in the preview. Recomputed `fingerEditionManualBatch` validates every source→target choice against its own freshly constructed candidate list. The final changes go exclusively via the existing atomic `fingerOverrideCommit('batch')`, which records exact prior values and one Undo/Redo operation. Failed or stale storage means no partial commit.
7. Source MusicXML, original import, MIDI event timeline, user-owned 14 transparent PNG hand assets, all sound banks and research NO-GO auto-fingering remain untouched. No new remote services or libraries.

## Verification

- Node adversarial cases cover repeated measures, manually chosen alternative D note, changed measure with same pitch, source/target bounds, user and author overrides requiring separate acknowledgements, wrong target/source, implicit consent, target collisions, hand conflict, ties, no-op and no-mutation.
- A new real Chromium integration loads an old repeating score with local edits, a new score with an inserted bar, confirms two ambiguous old notes have unselected dropdowns, selects one exact target, explicitly consents, validates single Undo, and verifies *bit-for-bit original XML* and *identical MIDI events*.
- Normal Node/Chromium/MAESTRO/SoundFont/provenance tests remain required for deployment.

**Deferred:** interpreting tied passage segment correspondence across differing editions, automatic semantic equivalence of substantially rewritten phrases, and professional adjudication of hand/finger biomechanics. No release percentage increase for Hand-thesia without independent pianist review.

[FG-03C2B5 baseline](FG-03C2B5-CROSS-EDITION-RECONCILIATION.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md)
