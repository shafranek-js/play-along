# FG-04C9 — Original PianoMotion Studio Python directly in Play Along

## What is implemented

**Actual source copy, not the JS Play Along Beam Search relabeled:** The owner-authorized PianoMotion repository's exact `python-core/handthesia_core/*.py` Python sources (including `fingering.py`, `figures.py`, `hand_split.py`, `hands.py`, `api.py`, `midi_loader.py`) are included under `src/pianomotion-python/python-core/handthesia_core` together with the original `source_manifest.json`. The browser build copies these files into `assets/pianomotion/python-core/`. The module Worker runs **`from handthesia_core.api import analyze_midi`** using Python 3.14 / Pyodide 314.0.7 and independently verifies each packaged Python file's SHA-256 and the original engine-manifest digest.

The first invocation loads Pyodide from the pinned official CDN `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`, loads `micropip,numpy,packaging,six`, and installs pinned `pretty-midi`, `mido` and `importlib-resources` wheel versions through micropip. Calculations then run on the client in the Worker. **Python and wheels do not require the user to install anything**, but the first run requires an internet connection and may download tens of MB. The existing previously implemented local SHA-staged runtime variant is no longer the default; the Python sources are part of the Play Along build. There is no server-side inference or upload of MIDI contents.

In the right **Практика** sidebar, select any piece already loaded from Play Along's library and click **«🧠 Рассчитать пальцы текущей мелодии»**. Source format paths:
- **Original `.mid/.midi`**: pass the exact in-memory copy preserved in FG-04C8, maintaining its original tracks, channels, tempo events and NoteOn/NoteOff bytes. Do not ask for a second file.
- **MusicXML `.musicxml/.xml/.mxl`, MuseScore `.mscx/.mscz` and other formats that Play Along has ALREADY parsed into finite track-note events**: serialize an ephemeral standard MIDI containing their pitch, actual physical note onset and release (millisecond quantization); do not overwrite the selected song. This converts to a temporary fixed 60-BPM MIDI solely as a container for the same elapsed note times, **not** a faithful preservation of source tempo changes, pedals, ornaments, note-staff provenance or all expressive controls. The original score remains authoritative.
- File formats without parsable note tracks reject with a visible message rather than fabricating notes.

The Python engine returns `RH/LH`, fingers `1–5`, explicit unresolved notes and source MIDI SHA. A read-only ordered preview in Practice shows suggestions for the first 120 notes; counters cover the whole result. The Worker prevents changed source objects from adopting stale output; suggestions are never marked author-verified or silently written into user corrections or the notation. The original fourteen PNG hand sprites are unchanged.

## Acceptance and remaining limitations

1. Unit tests verify original Python file hash equality, original manifest engine version, nonmutating input conversion and physical MIDI timing. Build must include source files and the worker.
2. Full browser Playwright/UI/audio regression and source integrity CI must pass before merging. **A browser run that actually loads Pyodide and executes PianoMotion must additionally be tested online under a capable browser**; a successful JS unit test is not evidence of this, nor of superior pianist fingering quality.
3. Current UI is a **read-only** PianoMotion suggestion list, not full score-note overlay/teacher-authorized adoption. A separate source-locked matching step for any generated temporary MIDI is needed before applying suggestions to source XML; time/pitch-only guessed matches are not acceptable for polyphonic/unison MIDI.
4. The original source derives in part from the third-party Hand-thesia/pygame-piano-animator project. This repository's README/manifest do not establish the upstream redistribution license. **The user owns the PianoMotion application and explicitly authorized code use, but that does not resolve third-party copyright for a public Play Along deploy.** Review and record relevant third-party rights before public rollout or wider distribution; retain the source manifest and provenance. Wheel licenses and the font/SoundFont license also require explicit distribution review. The existing Play Along code makes no broad license assertion.

Version prepared: **v0.10.90**, pending successful CI, browser runtime acceptance and rights audit.
