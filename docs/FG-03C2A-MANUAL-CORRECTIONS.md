# FG-03C2A — manual per-note fingering corrections (v0.10.48)

**Scope:** first user-editable Finger Guidance increment. Overrides are confined to imported MusicXML scores, keyed to stable source IDs, and never mutate original notation, MIDI events, authored fingering or imported score files.

## Usage

1. In **Piano Roll**, click an imported MusicXML note; the right Practice panel displays **Аппликатура этой ноты**. It shows the original author finger and explicit RH/LH, or says if no finger/hand was supplied.
2. Choose **Палец 1–5**, then **Правая / Левая / Рука неизвестна**, and **Сохранить правку**. The corrected finger is displayed as an explicit *user* instruction in Numbers, Hands and Ghost modes, never labelled as MusicXML authorial information.
3. **Отменить правку** restores the previous state of that note (one step, in the active page); **Вернуть автора** removes the stored override entirely. The source field remains untouched throughout.
4. Valid corrections survive normal reload and re-import of the **same MusicXML content**, and are exported in the existing Play Along JSON backup. Corrupt backup records are rejected *before* any localStorage/IndexedDB writes. Untrusted or too-large locally cached overrides are sanitized on startup.

## Technical contract

- Pure `src/core/finger-overrides.mjs`: `fingerOverrideWorkKey(song)`, `fingerOverrideValidate(raw,{strict})`, `fingerOverrideEffective(note,record)`.
- Score key depends on the original playback MusicXML content, not `xml-${Date.now()}` or a volatile track selection. It uses two independent 32-bit *non-cryptographic* hashes with source length for accidental-collision resistance. Because this is not a cryptographic proof of identity, the editor also verifies that the selected canonical `noteId` maps to a note with the same pitch in the original score. **No claim of collision immunity or cryptographic source authentication.**
- Persist only user choices (`finger:1..5, hand:'RH'|'LH'|null`) in global settings `fingerOverrides[scoreKey][noteId]`. This data is distinct from MusicXML original author markings and original XML.
- Strict backup import rejects invalid score keys/notes, malformed fingerprints, noninteger finger values, invalid hand labels, extra fields, prototype poison keys and excessive correction maps. Legacy localStorage silently drops corrupt entries while retaining valid options.
- Save the prospective validated localStorage snapshot **before** swapping live state, to avoid a quota failure causing unsaved visual advice. The existing backup writes the settings object; no binary score mutation or IndexedDB schema migration is required.
- `fingerGuidanceTimeline` accepts a third trusted source type, `user`, **only after explicit validated selection**, alongside `musicxml` and identified `demo`. It still blocks generated/research fingers.
- Do not show an editable form for Midi-only, demos, adapted/transposed playback, or imported scores without authoritative `noteId`.

## Tests

- Pure Node: source key stability/change, strict typed validation, original author immutability, invalid finger/hand and malicious backup maps, bounds on work and note records.
- Real Chromium: select known author note, apply RH/LH correction, confirm source original is untouched, undo and revert to author, explicitly annotate previously unlabeled note, verify correct source classification in guidance, export backup and inspect corrections, reject invalid backup without overwriting live state, reload/reimport and verify persistence and a second successful reset.
- Standard build, OSMD, MIDI Wait, score-time, research benchmarks and audit remain mandatory gates.

## Deliberate limitations

This release introduces a **single-level per-note undo**, not a full edit-history timeline. Corrections are saved for the exact MusicXML source text; differently formatted/edited XML may legitimately have a different fingerprint, and author changes are never automatically merged across editions. MusicXML export of user fingering, fully explicit migration across content versions and multi-step undo/redo belong to a later FG-03C2B / FG-05 stage. The accepted FG-03B2B-2 pianist review is distinct: no physiological finger recognition is added.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [FG-03C1 stable note IDs](FG-03C1-SOURCE-IDENTITY.md)
