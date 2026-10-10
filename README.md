# Play Along — Modular Project v0.10.0

Standalone browser piano practice application. This is a **structure-first migration** of Play Along v0.9.1, not a rewrite.

## Quick start (Windows 11)

1. Install [Node.js LTS](https://nodejs.org/) if it is not installed.
2. Extract the ZIP archive, open the `Play_Along_Project_v0_10_0` folder in VS Code / Terminal.
3. Run `npm run dev`.
4. Open **http://localhost:4173/** in Chrome or Edge and grant browser MIDI permission the first time.

The project ZIP **already includes `dist/`**, so building is optional. To run the prebuilt version with a web server, execute `npm run dev`. `dist/index.html` also opens directly, but Web MIDI and filesystem access depend on browser security restrictions, so localhost is recommended.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve the prebuilt `dist/` on localhost:4173; reflects changes after `npm run build` |
| `npm run build` | Rebuild `dist/index.html`, `dist/assets/app.css` and `dist/assets/app.js` from `src/` |
| `npm test` | Check deterministic build, source integrity, JS syntax, HTML structure and key feature entry points |
| `python tests/browser_smoke.py` | Optional Chromium regression (needs Python Playwright and Chromium) |

No npm dependencies are required for building or serving. Development can proceed entirely offline, though online music catalogs and OSMD (currently fetched from CDN) need network access.


## GitHub Pages — public test environment

The app can be published at **https://shafranek-js.github.io/play-along/** after the repository exists, the files are pushed, and Pages is enabled. **This URL is not claimed live until verified.**

The repository contains `.github/workflows/pages.yml`: each push to `main` rebuilds the static site, runs `npm test`, and publishes `dist/` with GitHub Actions. No npm dependencies and no secrets are required.

**One-time setup (repository owner):**

1. Create a public repository named `play-along` under account `shafranek-js`. Create it **empty** (no README, license, or .gitignore) if pushing this project directly.
2. Push the entire project to the `main` branch. Do not upload the ZIP itself as the sole repository file.
3. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. Visit **Actions → Test and deploy Play Along** to check the first deployment, and then open the Pages URL.

Local development remains `npm run dev` (127.0.0.1:4173). GitHub Pages serves the same built HTML/CSS/JS over HTTPS so Web MIDI permissions can work in Chrome/Edge. MIDI input must still be explicitly authorized by the browser if not previously allowed. Actual hardware behavior cannot be fully validated in CI.

**Important:** moving to GitHub Pages creates a new browser origin, so IndexedDB/localStorage from `file://` or localhost will not automatically appear on the published site. The published repository and built JS are publicly visible; don't add private files or tokens. OSMD is currently loaded from an external CDN, and music catalogs need internet access.

## Structure

```text
Play_Along_Project_v0_10_0/
├── src/
│   ├── index.html                  # HTML markup only
│   ├── styles/app.css              # Application styling
│   └── legacy/parts/              # Feature-oriented source files
│       ├── 00-runtime.js           # Settings, app state and shared utilities
│       ├── 10-keyboard-adaptation.js
│       ├── 20-workspace-ui.js
│       ├── 30-sheet-music-osmd.js
│       ├── 40-audio-transport.js
│       ├── 50-practice-scoring.js
│       ├── 60-performance-review.js
│       ├── 70-piano-roll.js
│       ├── 80-midi-devices.js
│       ├── 90-smart-practice.js
│       ├── 100-folder-browser.js
│       ├── 110-mutopia-catalog.js
│       ├── 120-musetrainer-catalog.js
│       ├── 130-asap-catalog.js
│       ├── 140-library-musicxml.js
│       ├── 150-musescore-reader.js
│       ├── 160-library-import.js
│       ├── 170-mutopia-downloads.js
│       ├── 180-library-ui.js
│       └── 190-app-bootstrap.js
├── scripts/
│   ├── build.mjs                   # Deterministic, dependency-free builder
│   ├── dev-server.mjs              # Static local HTTP server
│   └── manifest.json               # Ordered feature list
├── tests/build.test.mjs            # Migration integrity tests
├── dist/                           # Runnable application
├── package.json
└── LICENSES.md
```

## Migration guarantees and current architecture caveat

**Guaranteed:** JavaScript feature source concatenated in manifest order recreates the v0.9.1 IIFE **byte for byte** before applying the app version stamp (`0.10.0`). CSS and HTML DOM contents come directly from v0.9.1. Original Web MIDI, Web Audio, OSMD, Piano Roll, Wait mode, local import, library and online catalogs remain unchanged.

**Not yet complete ES module isolation:** The feature files deliberately share the old lexical scope when bundled. They are not individually importable ES modules. This intermediate approach avoids breaking cross-feature global state and call order. Follow-up work should progressively move to explicit dependency-injected modules (`audio/`, `midi/`, `score/`, `library/`) with tests, ideally in small independently reviewable changes.

**OSMD is not bundled locally yet:** The genuine OSMD renderer is requested from CDN on demand, exactly as in v0.9.1. A truly offline notation view will require vendoring and verifying a particular OSMD distribution, followed by real-browser rendering tests. No license-restricted third-party files were copied into the ZIP.

**Version migration:** Browser storage keys/IDB schemas and user settings are not changed; the app retains existing library and MIDI preferences in the same browser origin. Moving from `file://` to `http://localhost:4173/` changes the browser's origin, however, so the browser may not automatically show files/data previously saved under `file://`.

## Testing limits

The automatic browser smoke test uses a simulated OSMD renderer and simulated ASAP HTTP responses. The actual OSMD code path and live MicroLab mk3 remain to be verified in an unrestricted Chrome/Edge session. This CI environment denies `page.goto()` to every URL, including localhost. The browser smoke therefore validates the HTTP files via Python first and injects the same built JS/CSS into a Chromium document instead of claiming real browser network navigation passed.

## Persistent library & preferences (v0.10.1)

- Imported MIDI, MusicXML/MXL and MuseScore files are stored in **IndexedDB** under `Моя коллекция` and the last active saved work is automatically restored after reload.
- Each composition has its own selected track, Wait/Tempo mode, speed, view (Piano Roll or Sheet Music), zoom, accompaniment, adaptation, repeat region, bookmarks and last position.
- Global settings such as MIDI device preferences, keyboard calibration, volume, labels, and window layout are remembered in browser localStorage.
- These preferences belong to the browser profile and web **origin** (`https://shafranek-js.github.io`): private browsing, clearing site data, switching browser/device or storage eviction can remove local records. Files are **not uploaded to GitHub**.
- `npm run test:browser` verifies real OSMD and persistence across browser reloads with two distinct imported scores.

## Reliability and recovery (v0.10.2)

The Library contains **Export library and settings** and **Restore backup** commands. The exported versioned JSON file includes imported pieces (MIDI/MusicXML/MXL/MuseScore), per-piece and global preferences, favourites, the existing performance-history snapshot and Smart Practice mastery. The file is downloaded locally; no user content is uploaded to GitHub. Restore validates IDs and content hashes, merges compositions without deleting existing entries, then replaces settings after user confirmation and reloads. Keep a copy somewhere safe; the backup is not automatically synchronized.

This release also preserves pre-v0.10.1 global practice preferences for the active work, makes Reset Layout leave musical preferences unchanged, navigates actual MusicXML bar lengths (including 3/4), and bounds inflation of MXL/MSCZ/Mutopia ZIP entries while decoding. GitHub Actions verifies backup export/recovery after clearing browser storage, 3/4 score navigation, OSMD, and per-song settings.

Limitations: JSON backup export is capped at 96 MiB of raw repertoire data; large collections will need a streaming backup format. Browser data is local to its origin. Deep music-engine refactoring and long-term performance-history storage are planned separately.

## Wait legato and full performance history (v0.10.4)

- Wait accepts each fresh expected NoteOn even if an older pitch is still held: legato and slightly early correct notes are valid. Repeated notes with the same MIDI pitch still require NoteOff followed by a fresh NoteOn. Existing chord recognition and held-key debounce are preserved.
- MIDI device permission and physically missed MIDI messages remain browser/hardware-dependent; open the MIDI monitor to distinguish a missing event from a scoring issue.
- The IndexedDB schema is upgraded to version 2 with a `performances` store indexed by profile. Legacy localStorage history is migrated automatically, and the 30-attempt truncation has been removed. The legacy 30-record localStorage cache is only a fallback; the full history resides in IndexedDB.
- Portable backup now includes the full performance history. Recovery writes the complete history transactionally to IndexedDB, while restoring only a small compatibility cache to localStorage.
- Browser CI covers legato, early inputs, repeat articulation, chord transitions, more than 30 saved performances, browser reload, and full-history backup export.

Remaining Reliability work: load collection metadata independently from musical binary files, add corrupted-archive stress fixtures, and review very large libraries. Full polyphonic rhythm correctness requires a later Music Engine phase.

## IndexedDB lazy repertoire loading (v0.10.5)

- Database schema v3 adds a small `workIndex` metadata store. A transactional upgrade migrates existing v1/v2 user files without rewriting their binary payloads.
- Library listing reads only `workIndex`. Actual MIDI/MXL/MusicXML bytes are read from `works` when the chosen piece is opened. Saving, deleting, and restoring backups update both stores atomically.
- Large libraries should no longer load all audio/score bytes merely to display the collection. Backups deliberately read every binary for explicit full export; the 96 MiB backup limit still applies.
- Real-browser regression tests cover v2-to-v3 migration, selecting saved scores, reload, binary preservation, corrupt/oversized MXL and backup restoration.

## Music timing correctness (v0.10.6)

MusicXML metronome directions now apply dotted beat units correctly (for example, dotted-quarter = 60 in 6/8 corresponds to quarter = 90), including compound-time playback, note durations and the OSMD timeline. The CI musical regression corpus validates notes/rests, chords, ties across tempo boundaries, separate left/right parts, 4/4 → 3/4, MIDI tempo changes and 6/8 dotted metronome marks. Complex MusicXML repeats, multi-measure navigation and ornaments remain separate planned features.

## Simple MusicXML repeats (v0.10.7)

- Standard non-nested forward/backward MusicXML barline repeats are expanded to a common execution-order score for all parts. Missing forward markers mean repeat from the beginning; repeat counts are bounded to 2–4 passes. Unrolled notation is used by both the musical event parser and the real OSMD cursor; the original score XML remains available in the song object.
- MusicXML with alternate endings (voltas), nested/malformed repeats, D.C./D.S., coda navigation, or inconsistent parts is **not** unfolded; it retains the original written playback order and shows an explicit warning. Do not assume these complex forms play as written yet.
- CI includes timing assertions for multi-part repeat execution and real OSMD SVG/cursor synchronization through the repeat boundary.

## MusicXML sparse measures and synchronization (v0.10.8)

- Normal measures now advance by their written meter even if a voice omits a final explicit rest. A sparse measure in one hand can no longer shift subsequent bars earlier relative to a fully notated other hand.
- A measure explicitly marked `implicit="yes"` may retain its actual shorter pickup duration; overfull measures are preserved for safe playback.
- Browser timing tests compare both hands and check a legitimate one-eighth-note pickup.
- Limitations: mixed polymeter, complex cross-part mismatched implicit pickups and sophisticated repeat/navigation structures still require additional validation against real scores.

## Standard first and second endings (v0.10.9)

- MusicXML notation with one non-nested forward/backward repeat, precisely two passes, and complete separate first/second ending markers is unfolded into the performance order for all staves and the OSMD score. The original MusicXML remains available within the parsed song.
- Example: a four-bar written score with a first ending in bar 2 and a second ending in bar 3 plays bars 1–2–1–3–4. Notes and the OSMD cursor share this expanded timeline.
- Malformed or ambiguous ending syntax, nested/extra repeats, multiple volta numbers, inconsistent secondary parts, D.C./D.S., coda and untested navigation remain guarded: no silent incorrect unfolding; Play Along displays a warning.
- Chromium CI verifies note pitches, onsets, repeat markers removed in the expanded score, real OSMD SVG and cursor position on the second pass, and rejection of malformed endings.

## Cross-part measure synchronization (v0.10.10)

- Score-partwise MusicXML pieces with equal measure counts now derive a shared measure-start timeline from the first part. A meter change or an implicit rest omitted from other parts can no longer silently move their following measures out of phase.
- The authoritative timeline respects meter changes, `<divisions>`, `<backup>`, `<forward>`, chord onsets and implicit pickups. Secondary parts preserve their note durations and use the common downbeats. Potential polymeter/overlong voices are warned about rather than assumed fully supported.
- When parts have different measure counts, the legacy independent-grid behavior is preserved with a warning.
- The browser regression corpus checks two-hand alignment across 4/4→3/4 where the changed time signature is encoded only in the right-hand part.
