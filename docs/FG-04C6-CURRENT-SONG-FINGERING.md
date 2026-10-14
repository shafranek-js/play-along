# FG-04C6 — Calculate fingering on the current score

## User-visible result
MusicXML already open → Аппликатура → Рассчитать для текущего произведения. No second score file. Calculations run using the actual Play Along JS FG-02I/FG-04C3 Worker, not the PianoMotion Python engine. Source-author and user finger annotations are immutable anchors. Unlabeled two-staff hands require explicit research-only hypothesis approval.

## Preview and consent
Unverified proposals are purple/dashed on existing virtualized note blocks. They have no effect on the player, MIDI notes, Wait/Tempo, backup or guidance until explicitly accepted. Click notes / Ctrl+A to select; review finger numbers, check confirmation, press Принять выбранные предложения. The existing atomic validated batch edit history saves selected previously blank source notes only; Undo removes the entire accepted batch. Original annotations and previous manual edits cannot be overwritten. Скрыть предложения discards only transient overlay data. Changes to source song, corrected fingers or hand size invalidate stale predictions.

## Acceptance tests
Real Playwright Chromium regression loads MusicXML, starts from one primary button, checks a missing-hand warning, explicit research-only staff assumption, verified worker result, unsaved preview, required checkbox and selected notes, batch correction, single-step Undo, reject without changes and exact original score invariance. The existing finger editor suite and MAESTRO/SoundFont CI must also pass.

## Remaining PianoMotion work
This release does not run PianoMotion Python, and it cannot automatically calculate fingering for ordinary MIDI. The source is a private, not yet publicly deployed repo. Its license inventory has unresolved redistribution provenance for application sources and some bundled assets. Prioritize a pinned, license-cleared, actual Python browser runtime and true MIDI source-note identity; never silently replace the PianoMotion algorithm with Play Along's JS solver.
