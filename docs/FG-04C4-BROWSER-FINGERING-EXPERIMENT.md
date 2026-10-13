# FG-04C4 — First in-browser Fingering AI experiment (v0.10.87)

## User outcome

Open an **original MusicXML** in Play Along → **Аппликатура** → expand **Рассчитать аппликатуру в браузере · эксперимент** → choose hand size, optionally opt into staff 1 = RH and staff 2 = LH **for the research only** → **Рассчитать и сравнить**.

All computation occurs in a **locally packaged browser Web Worker**, no Python installation, PianoMotion app, internet access, or remote musical upload. The panel shows aggregate counts for **Play Along's actual existing FG-02I legacy Beam Search** versus the experimentally improved **FG-04C3 pair-specific anatomical spans**, and up to thirty anatomical proposal fingers (source note/pitch/onset/hand for review). The original XML, MIDI note timings, score editing history, backed-up finger overrides and fourteen PNG hands remain untouched.

## Architecture

- `src/core/browser-fingering-research.mjs` invokes `proposeHybridScoreFingering` twice under matched verified inputs and uses `auditFingeringAssignments` for model-specific physical integrity. No hand guessing by pitch or track.
- `src/workers/fingering-research-worker.mjs` bundles into `dist/assets/fingering-research-worker.js` using current `esbuild` (IIFE classic Worker); loaded **only** when the user clicks Calculate. No new runtime packages, CDN, Pyodide, global variables or network operations.
- `src/legacy/parts/35-fingering-editor.js` builds a safe, immutable copy of original source events. Strict note IDs, timestamps, original hand/finger information and manual user overrides remain explicit; all suggestions are separate preview data.
- Some imported scores have no canonical hand ownership on unannotated notes. Default is **refuse**; the user may explicitly check the untrusted hypothesis `staff 1 → RH, staff 2 → LH` for this particular browser analysis. It does not save or apply, and is **not evidence** that the source composer designated a hand.
- Worker's active request is invalidated when source song, manual override, hand-size setting or opt-in changes. Old workers are terminated. A 15-second fail-closed timeout prevents unbounded UI wait; answer from stale source is discarded. Preview is capped at thirty displayed suggestions, rendering with `textContent` (never HTML), bounded scrolling.
- Other FG-04B research, imported MIDI, MAESTRO, SoundFont, Wait/Tempo/Listen, timing and file export are unaffected. `productionEligible:false`, `expertValidated:false`, no auto-adoption, and no learner-facing guidance with generated fingers.

## Tests and acceptance

- `tests/browser-fingering-research.test.mjs` (imported via standard unit suite) verifies deterministic legacy/anatomical runs, nine-note reach, hand-size refusal, original user/author priority, source event immutability, duplicate/unverified source refusal and total limits.
- `tests/browser-fingering.real.test.mjs` is in the full browser test suite and verifies a real in-app MusicXML score, initial refusal with unknown hands, explicit research-only staff assumption, offline Worker output, list preview, invalidation after changes, retained original MusicXML and zero saved manual overrides.
- Standard build test ensures the same original fourteen PNGs and audio packages are preserved; the new Worker is an additional tiny static output.
- Require green full unit/browser/soundfont/MAESTRO CI before merge. Research-only accuracy does not count as a piano-teacher validation.

## PianoMotion distinction and next slice

**This is not PianoMotion Studio's Python engine compiled into WebAssembly.** It is the first **user-visible, browser-native calculation of Play Along's actual JS solver** incorporating the PianoMotion-inspired, independently coded pair-specific span model. The PianoMotion Python original remains a comparison reference and optional offline tool under FG-04C2. Direct in-browser execution of the owner's Python/WASM would require a separately approved per-file provenance/licensing review, Pyodide footprint/offline bundle assessment, source-ID adaptation and real musical validation.

**Next**: evaluate against actual matched PianoMotion outputs, verify source-identity compatibility and measured improvement before offering a teacher-facing automatic fingering mode; then implement selectable procedural IK hand styles alongside existing classic PNGs.

Hand-thesia goal remains 35% until accepted user-visible browser functionality passes all CI and UAT.
