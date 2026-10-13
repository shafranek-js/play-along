# FG-03C2B3 — Dedicated fingering editor and verified Sheet Music annotations (v0.10.53)

## Dedicated ✍ Аппликатура view

Three switchable practice views: **Piano Roll**, **Sheet Music**, and **Аппликатура**. The third mode is an actual, continuously scrollable score-wide editor, not a dialog or single-note property panel. It opens a horizontally scrollable timeline of **all source MusicXML note events**, with one row per pitch, note durations along the time axis and a color-coded block for each sounding note. Each block shows its verified finger number 1–5 or `?` and RH/LH when known. A bright yellow outline denotes selection; an amber outline denotes an explicit user correction. Author markings remain visually separate.

The editor's top toolbar **stays visible while scrolling** and provides: whole-score Select All, Clear, independent optional finger 1–5 / RH-LH hand assignment, **Применить**, group reset to author, Undo, Redo, and timeline zoom. It displays selected/total note counts and effective known-finger coverage. A width-spacer and *viewport-only* Canvas redraw mean long compositions can be navigated horizontally without a multi-megapixel scroll-sized Canvas. Wheel/trackpad and horizontal scrollbar navigate the timeline. Four zoom increments are available.

Existing Piano Roll gestures work in the dedicated view: click selects one, Ctrl/Cmd+click toggles noncontiguous notes, Shift+click chooses a canonical onset-ordered range, drag marquee selects visible notes, and Ctrl/Cmd+A selects **all notes in the entire score**, including off-screen measures. The toolbar also includes Select All and Clear for touch users. Shortcuts don't intercept editable input controls. Selection is transient and resets on score changes.

**Musical integrity:** choosing only a hand preserves every individual author/user finger. For a note with no original finger, a hand-only override carries `finger:null` rather than inventing a number. Choosing finger 1–5 explicitly applies it to the selected notes. Each operation, including reset, remains a single atomic Undo/Redo step with strict source-ID validation; author XML is not modified and original 14 hand PNGs are untouched. MIDI (which lacks fingers) is offered in other practice modes but gets a clear no-source notation message in the editor.

## Sheet Music shows user finger corrections

When switching to Sheet Music, Play Along temporarily **clones** the original imported MusicXML for *display only*. The pure `sheetFingeringOverlay()` checks **every playable written note** against canonical source-note IDs, pitch, part index, voice, staff, and tie segments. The original immutable XML and playback notes must match the entire reconstructed score. If *any* note/voice/part check fails or a correction targets an unknown source ID, it shows the untouched original and a warning — never a guessed finger.

Verified numeric user corrections replace the copy's visible `<notations><technical><fingering>` value (with amber visual styling on corrected noteheads). A banner distinguishes authored markings from user changes and reports hand-only overrides. Hand-only overrides **do not introduce digits**. Simple ties keep exact segment source identities; only the first sounding segment receives the corrected fingering, avoiding false duplication. Notation repaint is triggered by successful Undo, Redo, single-note or group saves, and source changes. If OSMD is not available, the existing sheet error and Piano Roll fallback remain operational.

**Original FG-03C2B3 release had no MusicXML export.** An opt-in, separately validated export was later implemented in **v0.10.73**: [FG-03C2B4](FG-03C2B4-CORRECTED-MUSICXML-EXPORT.md). The annotated XML is an ephemeral renderer payload, never written to the downloaded original, library IndexedDB, user source, or backup as a new work. OSMD SVG rendering may support colors differently across browsers; source-vs-user provenance is always explicit in the banner. Full external MusicXML export, score edits across editions, and direct notehead selection in OSMD require separate musician-reviewed milestones.

## Engineering & acceptance

- New `src/core/finger-editor-geometry.mjs`: pure viewport geometry and end-to-end scroll extent. New `src/legacy/parts/35-fingering-editor.js`: full-score virtualized timeline, gestures, bulk toolbar, independent viewport repaint, and read-only browser diagnostics.
- New `src/core/sheet-fingering-overlay.mjs`: fail-closed original-aware cloning of exact MusicXML note identity and no mutation on any integrity failure.
- Existing `fingerOverrideCommitGroup` and `fingerHistoryTransition('batch')` provide one atomic transaction per group.
- Node checks for scrolling culling, stable note pitch rows, and click targets. Chromium end-to-end test verifies 64-note score, Ctrl+A across hidden measures, hand-only changes with authored fingers preserved, Undo/Redo, explicit bulk finger assignment, horizontal zoom/scroll to final note, actual OSMD SVG rendering, correct sheet overlay status, and hostile unknown-note fail-closed behavior.
- Entire existing MIDI/Wait/OSMD/security/backup/hand asset suites and fingering research benchmark remain mandatory.
- README, architecture, roadmap, versioned HTML/assets and verified GitHub Pages deployment required.

[FG-03C2B2](FG-03C2B2-MULTI-SELECT.md) · [Roadmap](ROADMAP-FINGER-GUIDANCE.md).
