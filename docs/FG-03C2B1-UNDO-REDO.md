# FG-03C2B1 — multi-step fingering Undo / Redo (v0.10.51)

## What was delivered

The original v0.10.48 single-note, one-step undo becomes a bounded **40-step, per-MusicXML-score** history. From the Piano Roll note inspector choose **Сохранить правку**, **Вернуть автора**, **Отменить правку**, or **Повторить правку**. Undo and redo operate in actual edit order **across multiple score notes**, regardless of which note is currently selected. Redo is cleared by a new user edit after an undo. A source reset (remove override) itself is an undoable edit. The form displays the number of available undo and redo operations and disables unavailable actions.

The separate author-supplied fingering, musical notes, timing, score file and original hand images are never modified. The new `finger-override-history.mjs` core provides pure `fingerHistoryTransition` and `fingerHistorySame` with a bounded stack. Up to 12 active score histories are cached in the page; the same unchanged MusicXML source can be revisited without leaking operations across scores.

## Integrity and recovery

The persistent source of truth remains the validated `fingerOverrides` map, **not** the edit history. A requested edit or Undo/Redo computes its prospective history and settings but commits neither until `fingerOverrideValidate(...,{strict:true})` and the localStorage write succeed. When the existing value differs from the expected history state — for example after a backup restore or external state replacement — replay is refused and that score's stale stack is discarded. This comparison protects in-memory changes; it is **not a cross-tab transactional lock**. Same source ID and canonical note ID must still exist.

Undo/Redo stacks are deliberately **session-only** and excluded from JSON backups: persistent edits survive browser reload/reimport, but the history starts fresh after reload to avoid applying old operations to restored state. The bound of 40 covers the latest 40 edit actions, not an unlimited revision archive. This release does not implement cross-edition score migration, author-accurate visual annotations directly on sheet notation or MusicXML-with-user-fingering export.

## Acceptance

- Pure Node tests: repeated sequential edits across multiple notes, reverse-order undo/redo, redo branch invalidation, reset undoability, no-op elimination, invalid choices, copied value immutability and 40-step cap.
- Real Chromium: three-note MusicXML score, undo/redo across selected notes, reset and rollback, unchanged author data, persistent overrides after reload, ephemeral bounded history.
- Full existing browser regression suite, security/backup checks, musical source benchmarks and deterministic v0.10.51 release branding must pass before merge.
- No research-only auto-fingering is promoted into learner guidance.

Next step: **FG-03C2B2** — source-vs-user annotations in sheet score and guarded, optional MusicXML export after explicit validation of note/voice mapping. Cross-edition alignment is a separate high-risk design gate.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-03C2A](FG-03C2A-MANUAL-CORRECTIONS.md).
