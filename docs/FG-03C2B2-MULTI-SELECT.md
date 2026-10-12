# FG-03C2B2 — Multi-note selection and bulk fingering editor (v0.10.52)

## User-facing operation

In **Piano Roll**, import/select an original MusicXML work, with `Adaptation = original`. Select notes with:

| Action | Result |
| --- | --- |
| Click | Replace the selection with one note |
| Ctrl+click (Cmd+click on macOS) | Toggle a note anywhere in the score |
| Shift+click | Select every canonical source note between the anchor and the clicked note, in score onset / track / voice order |
| Click and drag in the note lanes | Select visible note rectangles intersecting the dragged area |
| Ctrl+drag or Shift+drag | Add intersected visible notes to the existing selection |
| Ctrl+A / Cmd+A while Piano Roll is focused | Select **all** MusicXML notes in the work, including off-screen measures |
| Click the virtual keyboard area | Continue to play its MIDI key, **without** starting selection |

Keyboard shortcuts are scoped to the active Piano Roll editor, not regular text fields or unrelated pages. The selected score events have high-contrast yellow outlines; a translucent marquee shows the drag area. On a multi-selection the inspector in the right Practice panel changes to **Аппликатура: выбрано N нот**.

## Safe bulk assignment

The group editor provides **two independent operations** in a single form:

- **Finger:** `Палец: не менять` (default), or assign an explicit finger 1–5 to every selected note.
- **Hand:** `Рука: не менять` (default), or assign RH, LH or explicitly *unknown* to every selected note.

Changing only a hand **preserves each note's current authored/user finger**. For an unannotated note there is no invented finger: the override keeps `finger:null,hand:'LH'|'RH'`. These hand-only records are not counted as known fingering in the library coverage meter and do not activate a finger-number/image hint. Conversely, changing only a finger keeps the current hand independently. The form never silently invents a uniform fingering for all selected notes.

**Применить ко всем** commits only real changes to source-ID-keyed user overrides; a group operation is one Undo/Redo step, including reset via **Вернуть автора для выбранных**. All target IDs/values are checked against the current original score. The entire group is validated and written to localStorage **before** any in-memory or history change. A storage error, invalid note ID or malformed override rejects the entire operation without partially modifying the score. Bounded capacity is 30,000 per score/overall, subject to available browser localStorage; attempting an oversized set fails atomically.

Source XML and original author finger, hand, MIDI pitches, duration and Note events are never modified. Only explicit manual user corrections can add fingering; research-only automatic proposals remain disabled.

## Architecture and limits

- `src/core/finger-note-selection.mjs`: pure canonical per-work note order, ctrl/shift selection, rectangle intersection on actual Piano Roll hitboxes and optional-field-safe bulk proposals.
- `src/core/finger-override-history.mjs`: accepts grouped history steps (`entries`) while keeping existing single-note steps backward compatible. Multi-note edits/reversions always count as **one** of 40 session-history steps.
- `src/core/finger-overrides.mjs`: typed optional `finger:null` for **hand-only** overrides (explicit hand required). Strict backup validation and reimport persistence remain active.
- The mutable selection is ephemeral. It resets on score switches; it does **not** enter backups, so a previous score's selection is never accidentally applied to a new score.
- Drag rectangle only reaches notes currently painted/visible in the roll; Ctrl+A and Shift ranges use **all** canonical source events, irrespective of visibility.
- The Sheet Music score remains read-only for this release; multiple note selection currently operates on Piano Roll. Native editor-level score fingering annotations, optional MusicXML export, and cross-edition migrations are separate roadmap gates, not silently claimed here.

## QA gate

- Node: pure order/ctrl/shift/rectangle/bulk-proposal cases, source preservation, atomic one-step batch Undo/Redo and hand-only typed backup acceptance.
- Real Chromium: mouse Ctrl/Shift, Ctrl+A scope, marquee rectangle, group RH/LH assignment without finger invention, explicit uniform finger, one-step Undo/Redo, group author-reset and unchanged original MusicXML. Existing note, keyboard, backups, music, security and fingering research regressions remain mandatory.
- Release version stamped in HTML/JS/CSS from package.json. README and architecture updated; no owner-supplied transparent PNG hand assets changed.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [Prior multi-step history](FG-03C2B1-UNDO-REDO.md).
