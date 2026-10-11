# Play Along — Piano Practice App (v0.10.16)

Play Along is an independently hosted browser piano practice application with Web MIDI, Piano Roll, OpenSheetMusicDisplay (OSMD), MusicXML/MXL and MIDI import, optional online music catalogs, and Wait/Tempo/Listen practice modes.

**Live site:** https://shafranek-js.github.io/play-along/

## Quick start — Windows, macOS or Linux

Requirements: Node.js 22 or newer and a current Chrome/Edge browser. MicroLab mk3 and other MIDI keyboards require permission for Web MIDI.

```bash
git clone https://github.com/shafranek-js/play-along.git
cd play-along
npm ci
npm run build
npm run dev
```

Open **http://localhost:4173/**. For browser MIDI permission on an external host, use the published HTTPS site. Do not open `dist/index.html` through `file://` when testing Web MIDI.

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce pinned dependencies from `package-lock.json` |
| `npm run build` | Assemble 21 ordered source fragments into `dist/assets/app.js`, copy CSS, HTML and vendored OSMD 2.2.0 |
| `npm run dev` | Serve the built `dist/` folder over HTTP |
| `npm test` | Check deterministic output, syntax, DOM anchors and baseline integrity |
| `npm run test:browser` | Run real Chromium scenarios (requires `npx playwright install chromium`) |

## Deployment and third-party components

Pushes to `main` trigger `.github/workflows/pages.yml`. CI runs `npm ci`, compiles the site, executes Node tests and real Chromium regressions, and deploys `dist/` to GitHub Pages when all tests pass.

OSMD **2.2.0 is bundled locally** from the pinned npm package and loaded on demand from `./assets/vendor/opensheetmusicdisplay.min.js`, with CDN fallback. Catalog synchronization still requires external network access. The original music files are not uploaded to GitHub; local repertoire and full performance history are kept in browser IndexedDB, global preferences in localStorage.

**Backup:** use Library → Export library and settings. The backup contains imported works, settings, favorites, Smart Practice state and saved performances. Restore validates typed preferences, checksum-verified musical data and record limits, stages settings, and commits all IndexedDB changes atomically. This backup is user-managed, not cloud sync.

## Source and migration status

```text
src/index.html                    HTML and UI controls
src/styles/app.css                CSS
src/legacy/parts/                 21 ordered JavaScript source fragments
  00-runtime.js                   User preferences and shared state
  20-workspace-ui.js              Panels, layout, song selection
  30-sheet-music-osmd.js          OSMD renderer / notation cursor
  40-audio-transport.js           Audio scheduling and playback clock
  50-practice-scoring.js          Wait/Tempo scoring
  60-performance-review.js        Performance history
  80-midi-devices.js              Web MIDI, calibration and input
  140-library-musicxml.js         IndexedDB / MusicXML parsing
  175-backup-recovery.js          Backup export and recovery
  190-app-bootstrap.js            Initialization
scripts/build.mjs                 Deterministic bundler
scripts/manifest.json             Required source concatenation order
tests/                            Browser and unit regressions
package-lock.json                 Pinned 84-package install graph
.github/workflows/pages.yml       Build, tests and deployment
```

The original v0.9.1 single-script migration was intentionally structure-first. **This is not a collection of isolated ES modules.** Source fragments share lexical scope in one generated IIFE, and a few functions cross fragment boundaries; the manifest order remains critical. Replacing this with independent modules is a future architectural milestone, not a completed one.

## Music correctness and known limitations

Covered by regression fixtures: real OSMD rendering and cursor seeks, simple repeats, standard first/second voltas, shared measure timeline, 4/4→3/4, compound-meter dotted metronome, MusicXML timing offsets, notes/chords/ties/rests, Wait legato and Tempo unison scoring.

Unsupported forms are not silently claimed correct: complicated nested repeats, D.C./D.S./coda, irregular volta structures, grace-note realization, complex polymeter and ornament performance. Repeat passages that change divisions, meter or tempo within their repeated execution stay in written playback order with a warning until safe state restoration is implemented.

Real physical MIDI device behavior, sustain pedal/CC64, live service availability and long-duration stress scenarios require further UAT. Existing Playwright CI tests use synthetic MIDI input rather than a physical keyboard.

---
### Release history

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

## Polyphonic unison scoring (v0.10.11)

- Tempo mode now recognizes multiple simultaneous notated voices at the same MIDI pitch with one physical NoteOn, like Wait mode already did. Every matched voice contributes to note accuracy, including when two notated hands/voices overlap on the same piano key.
- The matching NoteOff evaluates the hold duration of each voice independently, even when their written lengths differ. A later repeated same-pitch note still requires a fresh key press.
- Pure unisons no longer count as multi-key chords when computing chord timing; genuine different-pitch chords continue to be graded.
- Real Chromium test covers Tempo and Wait unisons, held-key suppression, individual duration scoring, a later repeated pitch and a chord sharing one unison pitch.

## Security and transactional backup recovery (v0.10.12)

- The persisted preferences are schema-validated: numeric panel sizes and speed, Boolean controls, enumerated modes/layouts, device calibration and per-song loop/bookmark fields are checked on both backup import **and** legacy localStorage startup. Invalid local legacy fields fall back safely; invalid backup settings are rejected without changing user data.
- Layout labels use DOM text nodes rather than interpolating saved settings into HTML.
- Backup recovery pre-stages all localStorage settings before committing the atomic IndexedDB transaction for works, metadata, favourites and full performance history. A localStorage quota error therefore cannot erase old IndexedDB performances. If IndexedDB fails, the localStorage cache is rolled back.
- Real Chromium security regression covers HTML injection in panel width, malicious saved localStorage, genuine localStorage quota saturation and preservation of pre-existing IndexedDB history on failed restore.
- The earlier unison scoring improvement in Tempo mode (one physical press for simultaneous same-pitch voices, independent NoteOff duration judgement) is included; its release was held until security and browser tests passed.

## Display hardening (v0.10.16)

Imported history records are treated as untrusted content. Summary values are inserted as DOM text and the metric table escapes its labels and dynamic values; malformed numeric-looking fields cannot inject active HTML into the Performance Review panel. The Chromium security suite checks backup settings injection, real localStorage quota failures and malicious performance result markup.

## Extracted musical-time core (v0.10.16)

- `src/core/music-time.mjs` is a genuine independent ES module, importable directly into Node unit tests without a DOM, browser storage or Web Audio.
- It canonicalizes tick/tempo events, calculates cumulative seconds, and converts ticks/quarter-beats/seconds; it handles simultaneous tempo changes, variable PPQ and changing tempo without mutating inputs.
- MusicXML, MIDI and OSMD now use the same temporal functions. The transitional `scripts/build.mjs` adapter includes this module as a source prelude in the existing IIFE so that current bootstrap order and browser permissions do not change. The module is not duplicated as a second runtime implementation.
- Dedicated Node tests check boundary accuracy, reversibility, event ordering and invalid inputs. The real Chromium music corpus continues to test MusicXML, MIDI and the OSMD cursor with the actual production bundle.
- The Piano Roll performed-note highlight now handles the array of simultaneously played unison voices introduced in the Tempo/Wait scoring fix; a browser assertion ensures both notated voices are highlighted and key-up removes only released notes.

This is an incremental extraction, **not** a claim that the rest of the 21 legacy parts are isolated ES modules.

## Pure musical measure grid (v0.10.16)

- `src/core/music-bars.mjs` is a standalone ES module that normalizes bar lengths for regular meters, incomplete measures, implicit pickups and overfull measures.
- Both the MusicXML importer's shared part timeline and OSMD measure navigation now consume `musicBarGrid()`, rather than keeping separate barline rules. The per-part fallback shares `musicMeasureSpan()`.
- Node unit tests cover 4/4, 3/4, 6/8, pickups, sparse notation, overfull bars and invalid inputs. A real Chromium timing fixture asserts a second measure begins at beat five in both MusicXML and OSMD when the preceding 4/4 measure contains five played beats.
- The build adapter now injects both genuine ESM sources into the legacy IIFE; neither module depends on the DOM, MIDI or storage.

## Hardened performance history (v0.10.17)

- Backup recovery rejects performance entries missing required scoring fields or with malformed nested sections, notes or statistics, before writing any local or IndexedDB data.
- Existing malformed IndexedDB or legacy localStorage entries are repaired or skipped safely at startup; one bad attempt no longer prevents the app from initializing.
- Smart Practice mastery records are validated on startup, backup import and export.
- Portable JSON backup export now fails explicitly rather than claiming success when full history exceeds the supported restore cap (5000 entries or 12 MiB). History is never silently truncated. A scalable streaming backup format remains required for larger collections.

## SHA-256 music identity and legacy compatibility (v0.10.18)

New imports use a full SHA-256 content ID, while files already stored under the legacy FNV-1a+length identifier retain that identifier on re-import. A legacy hash collision cannot overwrite a different work: writing the same ID with different bytes aborts the IndexedDB transaction. Restore accepts both old and new ID formats, verifies the matching digest and atomically aborts on an existing ID with different music. No mass renaming or reset of existing per-song settings is performed.

## MusicXML audit guards (v0.10.19)

- First-ending voltas now check every measure crossed by a backward jump, even if the first ending itself plays only once. An in-loop divisions/meter/tempo change is left in original written order with a warning, rather than silently corrupting durations.
- `<sound tempo="…"/>` directly inside a MusicXML measure is recognized; it shares tempo offset rules with `<direction><sound>` and maintains the same shared beat/second timeline.
- Chromium regression fixtures exercise both an unsafe first ending and direct measure-level tempo changes, including a nested offset.

## Additive meters and mid-bar divisions (v0.10.20)

- `musicParseMeterGroups()` in the pure music-bars module parses additive numerators (such as `3+2/8`) and multiple beats/beat-type groups into a common quarter-note measure span.
- The MusicXML note parser and shared bar-grid adapter use this normalized meter. Unrecognized time signatures produce an explicit warning rather than silently inheriting a plausible but incorrect meter in the note parser.
- OSMD bar navigation now calls the same ordered MusicXML bar adapter used by the importer; a `divisions` attribute inside a measure takes effect at its written location, not retroactively.
- Browser regressions verify 3+2/8 begins the next bar at 1.25 seconds (120 BPM), and that a mid-bar divisions change with five total quarter beats starts the next bar at 2.5 seconds.

## Pause / MIDI NoteOff lifecycle (v0.10.21)

When transport is paused, all active practice NoteOn duration measurements are closed at the frozen musical position. The subsequent physical NoteOff is safe even while paused; it cannot leave a stale held voice to contaminate the next note of the same pitch. A real Chromium regression verifies key-on → pause → key-off → next note against the production bundle. This fixes audit A08 while retaining Wait legato and unison behavior.

## Wait accompaniment and transport resumption (v0.10.22)

- When the player performs an expected Wait note/chord, accompaniment notes starting on the same beat are scheduled immediately and exactly once, independently of waiting for the physical key release. The next group works when the player changes keys legato. This resolves audit A09.
- Play/resume after a seek restores any note already started but still sounding at the seek position, for its **remaining** time only. This applies to Listen melodies and scheduled accompaniment. Ended notes are not replayed. Loop end truncates recovered notes. This resolves audit A10.
- Real Chromium tests simulate a Wait melody/accompaniment pair at shared beats and a 10-second sustained note resumed at 5 seconds, plus pause/resume and ended-note guards.

## Cancel ZIP import dialog (v0.10.23)

The asynchronous multi-part MIDI ZIP selection now has a single idempotent completion path for the Cancel button, backdrop and global Escape key. Escape dispatches a cancellable dialog lifecycle event rather than hiding the dialog and leaving the online loader permanently busy. A Chromium test uses a real two-entry MIDI ZIP to verify Escape unblocks loading and a second download succeeds without reloading the page. Resolves audit A12.

## Transpose plan/UI consistency (v0.10.24)

Corrects audit A11: an out-of-range chosen transpose shift is replaced by the best feasible candidate before the arrangement is analyzed again and committed to `adaptPlan`. The UI choice, adapted notes, practice scoring and Play gating now share one calculated result. Real Chromium covers a C2 note placed in preview25 (C3–C5), requiring shift +12 to play C3 and allowing Tempo to start.

## Seek and loop session accounting (v0.10.25)

Audit A07: `PracticeSession.seek()` now assigns an explicit `skipped` state to notes outside the current assessable range; it no longer marks them `hit`. Wait-group progress, Tempo miss handling, completed percentage, UI total, saved performance summary and detailed notes are limited to genuinely assessable material. Notes before a seek or outside an enabled Loop remain visible in the score but do not inflate hits or completion. Toggling/adjusting Loop starts a new assessment interval. Real Chromium tests verify seeking to the third note of a three-note melody and an interior Loop segment, including exported performance record contents.
