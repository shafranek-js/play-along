# FG-04C9 — Original PianoMotion Python in Play Along browser (v0.10.90)

## What the user can do

Open a song already available in Play Along. In **Практика**, click **«Рассчитать для открытого произведения»**. This starts the original PianoMotion Studio `handthesia_core.api.analyze_midi` Python implementation in a background **Pyodide 314.0.7 WebAssembly Web Worker** in the user's browser. There is **no Python installation and no additional music file upload**.

- **Original MIDI (.mid/.midi)**: use a defensive copy of the exact original bytes captured when selecting the song (FG-04C8), never export MIDI from Play Along's parsed model to pretend it was original.
- **MusicXML, .mxl, and MuseScore .mscx/.mscz**: use Play Along's existing score parser and a deterministic, **analysis-only** MIDI serialization of its notes, preserving pitches/onsets/note-off times to ≤0.5ms. This temporary MIDI never replaces score source. Unsupported ambiguous overlapping same-channel or impossible note times refuse explicitly rather than deleting/requantizing events.
- **Computed fingers**: verify the original MIDI SHA-256 against PianoMotion's `rawBaseline`; check *exact* raw identity mappings, note-on/off, source music notes, and LH/RH hand before allowing any note to be annotated. Show result counts and fingers in the Practice panel and on original piano-roll note blocks; the MusicXML fingering editor can preview verified candidates, then explicitly accept selected notes as reversible user corrections. No untouched authored finger is automatically overwritten.

## Exactly what runs

The following unchanged PianoMotion Studio Python files are copied from the owner-supplied `shafranek-js/pianomotion-studio` repository to `src/pianomotion/python-core/handthesia_core`: `__init__.py`, `api.py`, `figures.py`, `fingering.py`, `geometry.py`, `glissando.py`, `hand_split.py`, `hands.py`, `identity.py`, `midi_loader.py`, `pianist.py`, `progress.py`. `source_manifest.json` contains their exact per-file SHA-256 and fingerprint engine version. The build validates **every byte** and stages them under `dist/assets/pianomotion/python-core/`.

The Worker, `src/workers/pianomotion-engine.worker.mjs`, loads the version-pinned Pyodide 314.0.7 runtime from `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/` and exact pinned NumPy/Python dependency manifests, SHA-validates `pretty-midi`, `mido`, `importlib-resources` wheels before installation, then loads the verified owner's modules into the in-browser Python FS and invokes `analyze_midi` on the original bytes. The computation is **entirely in-browser**, not a server-side API. Network access is needed for the *first runtime download* and dependency wheels; this is not yet an offline-bundled Python runtime.

Source/provenance checks are separated from the Python engine in `src/core/browser-pianomotion-analysis.mjs`. The translated score MIDI encoder `src/core/song-to-pianomotion-midi.mjs` never touches live transport, SoundFont, user PNG sprites, or MusicXML XML source.

## Explicit limits and safety

- MIDI track note identity can be ambiguous: the converter and gate reject ambiguous notes instead of inventing source IDs. This may yield a refusal for complex MIDI files (e.g., overlapping identical pitches, unsupported source event metadata) and needs future safe expansion.
- PianoMotion auto-generated fingers remain **unverified pedagogical suggestions** until a pianist reviews them; only user-confirmed fingers may enter author/user teaching guidance. Some PianoMotion-supplied hands may conflict with source-verified MusicXML hands and will fail closed.
- User hand calibration `fingerBrowserHandSize` is not yet automatically mapped into PianoMotion's detailed biometric profile. The existing custom JS model uses that setting; the Python engine uses its source defaults. This distinction is exposed rather than falsely claiming identical ergonomics.
- Only the original 14 PNG hand assets are unchanged and remain default. Procedural IK skin selector is an independent next stage.
- License/provenance: the user expressly authorized incorporation of **their PianoMotion Studio source**. The upstream package also reports an unknown project-root license and possibly adapted Hand-thesia-derived components; before any broader redistribution, confirm that those third-party-derived components are licensed or separately authorized. The dependency manifest marks an *unused* SoundFont packed in pretty_midi as license-unresolved; runtime downloads it from its upstream distribution rather than committing a duplicate into Play Along. Do not assume the owner's authorization conveys rights to every dependency.
- No extra source file uploaded, no remote musical analysis server, and no anonymous cloud telemetry added.

## Acceptance

Full Play Along GitHub unit, production build and browser regressions; isolated browser unit tests for exact score-to-MIDI preservation, original MIDI SHA, author hands, identity mismatches and determinism; MAESTRO remains unchanged. An actual-browser Python/WASM smoke test with network access is required before declaring runtime accuracy independently verified on real original PianoMotion references. The existing Play Along JS Beam Search comparison remains available as a separate research feature.

Hand-thesia completion progress **35%** pending accepted UAT and actual Python browser smoke; this code does not validate real pianist accuracy or deployed Pages freshness.
