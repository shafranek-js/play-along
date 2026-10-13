# FG-03C2B5 — Conservative manual fingering migration across MusicXML editions (v0.10.74)

## User workflow

In **✍ Аппликатура**, expand **🔁 Перенос ручной аппликатуры из другой редакции**, while the **new** MusicXML score is open. Choose the old original `.musicxml` / `.mxl` file, previously edited in the **same browser**, and select **Проверить перенос**. The old XML is imported *in memory* solely for comparison; it does not replace the currently loaded work.

The tool locates the **existing local corrections for the exact old XML content fingerprint**, and compares original note provenance and unique unchanged measures. Every safe candidate appears **unchecked**. The owner individually checks the notes to transfer and then explicitly selects **Применить выбранные**. Selected corrections enter the existing atomic group-history operation: **one Undo** can roll back the transfer. No edits are made to either original XML source, source note timing or MIDI audio events.

The result displays counts for candidates, conflicts and unresolved notes. Conflicting original author fingers, existing different manual corrections, tied-note chains, duplicate passages or altered measures are **not** silently adopted. Such cases require individual manual editing; this phase does not offer speculative interactive conflict remapping.

## Source and safety contract

1. Only original, untransposed imported MusicXML in the dedicated editor is eligible. The previous **exact XML** file must be available, with previously persisted local user edits. MusicXML obtained from an external source without those exact local edits cannot recover them.
2. `fingerEditionSnapshot` independently re-parses source `score-partwise`, checks every playable source-segment ID / part index / measure index / ordinal, sounding pitch including source transposition, voice and staff against the existing importer. It rejects missing/duplicate identities, unsupported navigation, any grace or unpitched notes, an expanded-repeat origin, invalid XML, DTD/ENTITY, over-budget or ambiguous source.
3. `fingerEditionReconcile` requires identical work title/composer and ordered part identity. Within each corresponding part, an individual corrected note may match only when the **entire original MusicXML measure**, ignoring ONLY `<fingering>` and its empty wrappers and the displayed measure number, is structurally identical and **appears exactly once in each edition**. An inserted measure can shift the canonical source-note ID; matching never uses nearest MIDI pitch/time, a guessed hand, or a probabilistic score.
4. Linked ties and changed/multiply occurring measures remain unresolved. Target author-finger disagreements and existing different user overrides become conflicts. The app gives *zero default consent* and does not transfer conflicts. Generated candidate fingering never becomes trusted author/user input.
5. Before commit, the app checks that the current song and exact correction state still match the preview. The existing `fingerOverrideCommit(action:'batch')` strictly validates and writes all selected notes **atomically**, with single Undo/Redo and rollback if storage fails. No background or automatic migration.
6. The UI only derives visible text through DOM `textContent` and does not introduce external services, databases or libraries. All 14 hand PNGs, original music, SoundFont and MAESTRO are unchanged.

## Test coverage and restrictions

- Node suite: structural XML/source correspondence, inserted measures, unique matching, duplicate measure ambiguity in source/target, changed-note refusal, author/user conflicts, same-finger preservation, hand-only changes, suspicious metadata, wrong pitch, malformed corrections, no mutation.
- Chromium suite: old edition corrected in editor, new edition loaded, opt-in comparison and checkbox approval, one target saved in a single Undo transaction; original new XML and entire MIDI audio event timeline identical.
- Full CI Node/Chromium, SoundFont 256 GM program and MAESTRO pinned-source regression required.

This is **conservative data portability**, not automatic physical fingering validation. The remaining limitation is optional manual reconciliation of ambiguous bars, genuine changed-note mapping and tied-segment identities with full adjudication. Do not infer from the number of migrated corrections that the proposed fingers are musically correct.

See [previous MusicXML export](FG-03C2B4-CORRECTED-MUSICXML-EXPORT.md), [roadmap](ROADMAP-FINGER-GUIDANCE.md).
