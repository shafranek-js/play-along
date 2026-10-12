# Play Along — Piano Practice App (v0.10.45)

Play Along is an independently hosted browser piano practice application with Web MIDI, Piano Roll, OpenSheetMusicDisplay (OSMD), MusicXML/MXL and MIDI import, optional online music catalogs, and Wait/Tempo/Listen practice modes.

**Live site:** https://shafranek-js.github.io/play-along/


## Current status — v0.10.45

**Finger Guidance in the published player:** Optional Off / Numbers / 2D Hands / Ghost modes use the **14 original transparent PNG images supplied by the project owner** (seven poses for each hand). Guidance targets the **next note to be played**, not a key that is already sounding. In **Wait**, it stays on an unfinished group and removes already accepted chord keys; after a complete chord it advances to the next target.

In normal repertoire, finger numbers and hand attribution come from explicit **MusicXML author notation**; a source without trustworthy fingering does **not** receive fabricated instructional fingers. Built-in exercises can use clearly identified demonstration fingering. Web MIDI supplies key events, not anatomical finger identification.

**Experimental automatic fingering is NOT enabled in learner guidance.** FG-02I introduces a research-only two-hand score router: monophonic mixed-direction passages use FG-02H, overlapping chord islands use FG-02B, and fully authored notes are preserved after an independent simultaneous-key audit. Segments are not guaranteed to have smooth wrist continuity; explicit warnings identify such transitions. Research modules under src/core and their benchmark scripts do not replace author MusicXML labels or control the original 14 PNG poses.

Most recent research measurement (FG-02H) on five CC BY-SA hand-annotated excerpts, **148 notes in seven one-hand runs**:

| Metric | Previous FG-02G | Experimental FG-02H |
| --- | ---: | ---: |
| Finger agreement without source anchors | 81/148 (54.73%) | 87/148 (58.78%) |
| Notes accepted with every author finger fixed | 58/148 (39.19%) | 148/148 (100%) |
| Entirely matching unannotated runs | 0/7 | 1/7 |
| Modeled physical conflicts | 0 | 0 |

FG-02H flags **11 quick same-finger changes** requiring musician review. Preserving all original anchors is a data-integrity result, **not** evidence that every transition is a good teaching recommendation. The five excerpts were already known during development: this is *retrospective* evaluation, not a new blind trial. See [FG-02H research](docs/FG-02H-MIXED-PHRASING-RESEARCH.md) and [PR #15](https://github.com/shafranek-js/play-along/pull/15).

**FG-03A update:** Author-verified guidance now retains unannotated score onsets as explicit empty preview boundaries. The player no longer jumps from a still-unlabelled note to a later labelled one. A partially annotated chord displays individually confirmed **numeric** fingers rather than an unverified full hand silhouette. This adds no automatically predicted fingers. See the [updated roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

**FG-03B1 update:** The **secondary** translucent Ghost hand now appears only within a configurable **500–1000 ms** wall-clock preparation window (default **750 ms**), adjusted for playback speed. Wait never presents a premature second-hand position; a wrapped Loop counts the next cycle forward. The actionable first/next pending hand hint remains available as before. No automatically generated fingers are presented to learners. See [the implementation note](docs/FG-03B1-LOOKAHEAD.md) and [roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

**FG-03B2A update:** Ghost Hands now offers a stateless smooth translation of a **secondary verified future-hand PNG** toward its next source-authorized position. Actual next-key circles always stay fixed to piano geometry. A two-hand crossing, largely clipped sprite or ambiguous movement falls back to exact source finger-number markers, not a fabricated physical gesture. This does **not** animate finger joints or generate new fingering. See [technical details](docs/FG-03B2A-SAFE-MOTION.md).

**v0.10.45 live-version fix:** The visible “Standalone · v0.10.41” banner, browser tab title and startup score placeholder had remained hardcoded in `src/index.html` even after successful deployments of application versions v0.10.42–v0.10.44. Starting with this release, all three labels and the JS/CSS cache-busting URLs are stamped at build time from the single `package.json` version. The deterministic build and real Chromium tests now require the HTML branding, JavaScript release stamp and package version to agree; obsolete hardcoded version text must never be deployed. The original fourteen hand PNG assets and MIDI musical/scoring logic are unchanged; subsequent crossing safety has been hardened before deployment.

### Release documentation rule

**Every Play Along feature, fix and version update must update README.md in the same pull request**, with user-visible behavior, technical limitations, reproducible checks and links to supporting documentation. The unit test suite verifies that the README heading and a version-specific release-history section match package.json. This automated check is a minimum safeguard, not a replacement for meaningful release notes. Never mark a version as complete while its README is stale.

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
| npm run benchmark:fingering:repertoire | Reproduce FG-02G on five pinned, checksum-verified licensed musical excerpts (requires network) |
| npm run benchmark:fingering:contextual | Compare FG-02H with FG-02G, including author-anchor acceptance and movement warnings |
| npm run benchmark:fingering:heldout | Reproduce FG-02E locked, 34-case educational scale evaluation |
| `npm run research:fingering:polyphony-source` | FG-02J metadata-only external polyphonic fingering source qualification (requires network, noncommercial research scope) |
| `npm run research:fingering:polyphony-align` | Compare 11 source-fingered PianoVAM records to corresponding MIDI-derived TSV note events at a pinned dataset commit; explicit mismatch report (noncommercial research only) |
| `npm run benchmark:fingering:independent-polyphony` | Compare FG-02I on only *fully source-annotated same-hand chord/overlap islands*, excluding incomplete partial-ground-truth source groups; noncommercial research only |


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


## Finger Guidance: original owner-provided PNG hands (v0.10.29)

Fourteen original transparent PNG hand poses (seven for LH, seven for RH: thumb, index, middle, ring, pinky, rest, spread) are packaged unchanged. They are the authoritative 2D hand assets; neither the build nor automatic-fingering experiments regenerate or recolor them. Node build tests verify intact RGBA asset bytes.

## Authored MusicXML fingering import (v0.10.30)

MusicXML fingering values 1–5 are preserved through import alongside note identity, staff and voice. When hand ownership is known from the score, the 2D hand can show that author-assigned finger. Unknown-hand annotations use a neutral numeric marker rather than an invented hand. MIDI pitch alone is insufficient evidence of an anatomical finger. Browser regression: tests/finger-guidance.musicxml.real.test.mjs.

## Anticipatory next-note guidance (v0.10.31)

The teaching hand points to the **next note**, not the one currently sounding. Wait follows the incomplete PracticeSession group, removing accepted keys from a partially performed chord without skipping the remaining ones. Seek and Loop preview behavior is tested in Chromium by tests/finger-guidance.next.real.test.mjs.

## FG-02A: monophonic dynamic-programming prototype (v0.10.32)

The isolated, deterministic research solver accepts explicitly attributed LH/RH lines, respects fixed author fingers, and rejects unsupported overlapping parts. It is not a validated PianoPlayer port or a production teaching engine. [Details](docs/FG-02A-RESEARCH-PROTOTYPE.md).

## FG-02B: experimental chords and held voices (v0.10.33)

A separate research-only beam search proposes distinct fingers for simultaneously held keys, tests close-position chord inversions and separately attributed two-hand parts, and refuses physical finger conflicts. Uncalibrated ergonomic penalties must not be treated as verified teaching advice. [Details](docs/FG-02B-POLYPHONIC-RESEARCH.md).

## FG-02C: reference evaluation and independent physical audit (v0.10.34)

Twenty specific educational fingering patterns cover C/G major scales, C arpeggios, root-position chords and inversions. FG-02A/B initially matched **15/20** whole patterns (**119/134** note fingers), while fully pinned author fingers were preserved. Different published fingerings may both be legitimate depending on context. [Details](docs/FG-02C-REFERENCE-VALIDATION.md).

## FG-02D: phrase-based hypotheses (v0.10.35)

Narrow, guarded two-octave scale/arpeggio and chord-inversion templates improved exact agreement to **20/20 of their own development cases**, with explicit fallback and anchor safeguards. Because the templates were designed against those same examples, this is *in-sample*, not independent accuracy evidence. [Details](docs/FG-02D-PHRASE-RESEARCH.md).

## FG-02E: previously unused educational scale cases (v0.10.36)

A frozen test set of **34 cases / 314 notes** across seven other keys exposed limited generalization of FG-02D: **8/34** exact whole-pattern matches, **144/314** individual finger matches. Published method variations were marked separately; fully pinned author fingers remained intact. **Automatic tutoring: NO-GO.** [Details](docs/FG-02E-HELDOUT-MUSICAL-AUDIT.md).

## FG-02F: key-agnostic research solver (v0.10.37)

An independent research algorithm evaluates melodic direction, approximate key geometry, black-key ergonomics and thumb turns without a fixed tonic list. Against the already-examined FG-02E cases, it reached **13/34** exact examples and **221/314** individual finger matches. This is a *post-exposure diagnostic*, not a newly blinded evaluation. [Details](docs/FG-02F-GENERALIZED-RESEARCH.md).

## FG-02G: licensed real-piece benchmarking (v0.10.38)

Five short, source-pinned, checksum-verified CC BY-SA Piano Protege Curriculum files were evaluated without vendoring their scores. Signed source fingers distinguish LH/RH independently of MIDI channel. FG-02A and FG-02F each agreed with the published author choices on **81/148** notes, while strict FG-02A author-pin constraints accepted only **58/148** notes. These results measure agreement with reference choices, not complete expert-calibrated playing quality. [Methods, attribution and limitations](docs/FG-02G-REAL-REPERTOIRE-AUDIT.md).

## FG-02H: mixed-direction and author-annotation compatibility (v0.10.39)

The research-only contextual monophonic module handles turns, note repetition, rests and softer repositioning after key release. Source finger anchors, hand, pitch, timing and note IDs remain immutable; true overlapping distinct keys still require the separate polyphonic model.

In retrospective comparison with the **same five FG-02G excerpts**, unannotated source-finger agreement increased to **87/148 (58.78%)** from 81/148; accepted full-author-anchor coverage rose to **148/148** from 58/148. **Eleven** rapid same-finger changes were flagged for musician review. There is no independent pianist acceptance or learner-facing automatic fingering. [Methods](docs/FG-02H-MIXED-PHRASING-RESEARCH.md) · [PR #15](https://github.com/shafranek-js/play-along/pull/15).


## FG-02I: two-hand score and polyphonic routing research (v0.10.40)

- New **research-only** module `src/core/fingering-score-router.mjs` evaluates RH and LH **only when explicitly attributed by the input score**. It sends monophonic mixed-direction passages to FG-02H, overlapping/held-note islands to FG-02B, and fully author-annotated passages to an independent physical invariant audit that does **not rewrite source fingers**.
- Original `noteId`, pitch, timing, hand and fixed author-finger provenance are preserved. Simultaneous-key conflicts, missing hand information, impossible finger reuse and unsupported re-articulations produce **explicit rejections**, never invented assignments.
- Splitting a musical work into locally solved segments is **not a globally optimized wrist motion model**. `SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED` warns about each unvalidated transition. Author fast same-finger changes receive a separate review warning.
- Run `npm test` for score routing, simultaneous notes, chords, two hands, author constraints and deterministic data integrity. Run `npm run benchmark:fingering:score-router` for a **retrospective** five-piece comparison against the SHA-verified CC BY-SA Piano Protege corpus. The latter does **not** supply independent, professionally annotated polyphonic chord accuracy.
- **Measured first CI:** 203/203 unit tests; the five-source retrospective comparison retains **87/148** reference-finger matches and **148/148** authored-finger acceptance with **11 rapid author-slide warnings**, without modeled physical conflicts. These short source works have no same-hand chord islands; score-polyphony correctness remains checked using synthetic invariants, not independent expert adjudication.
- **No change in the player interface:** all 14 original owner-supplied PNG hand poses and anticipatory next-note hints still use the existing MusicXML/demo assignments. Experimental generated fingering remains **OFF**.

[Technical scope, test evidence and limitations](docs/FG-02I-POLYPHONIC-SCORE-ROUTING.md). A separate expert-adjudicated, genuinely unseen polyphonic score study and a review of inter-segment motion are required before an opt-in learner feature.

## FG-02J: independent polyphonic source qualification (v0.10.41)

FG-02I's chord/held-voice router passes technical tests, but the five previous Piano Protege teaching excerpts have **no intra-hand chord islands**. They do not demonstrate independent musical accuracy for actual polyphony.

FG-02J identifies a *candidate* independent resource: [PianoVAM v1.1](https://huggingface.co/datasets/PianoVAM/PianoVAM_v1), which describes real piano performances with source annotations and separately reported manually annotated fingering. **Its license is CC BY-NC-SA 4.0 (noncommercial, attribution and share-alike)**, distinct from the previous CC BY-SA teaching corpus. No source audio/video, hand data or fingering annotations are copied into Play Along.

A new research-only discovery script inspects source metadata, verifies revision and license, checks for a real `Fingering_GT` directory, and examines the schema of at most one small source file. **Initial CI confirmed 11 small ground-truth TSV files containing `onset`, `key_offset`, `frame_offset`, `note`, `velocity`, `hand`, and `finger`.** The separate pinned source-alignment probe checks that each annotated event matches its corresponding original MIDI-derived TSV event without copying source rows into the report. Source schema discovery is not sufficient to claim musical correctness. Crucially, normal `onset/key_offset/frame_offset/note/velocity` TSV labels are **not a fingering source**. Exact RH/LH and 1..5 finger alignment to the original MIDI note events must be independently demonstrated before any percentage agreement or polyphonic "accuracy" can be calculated.

**First verified external evidence:** 11 source files contain 1,800 finger-labelled events, all of which match the original MIDI-derived TSV by onset, physical key release, frame offset, pitch and velocity. The full performances contain 32,525 source notes: therefore coverage is only **5.53%**, not 100%. `hand` uses `L/R` and `finger` uses `1–5`. New FG-02J scoring checks **entire transitive held-key overlap components** against the original source; any component with missing finger labels is excluded and counted. The research report publishes aggregate counts and source SHA-256 only, never performer notes or raw finger records. Any measured chord agreement is agreement with this source's manual labels, **not independent pianist-certified teaching quality**.

`npm test` checks fail-closed license/revision/file-availability and note-coverage gates. Run `npm run research:fingering:polyphony-source` to produce a structured qualification report, archived in PR CI. Discovery is **not** a score-level validation, does not improve the FG-02I algorithm or the five-piece 87/148 baseline, and does not license commercial use.


**First independent real-polyphony measurement (FG-02J):** at the pinned PianoVAM revision, 11 manually annotated recordings provide **1,800 / 32,525** ground-truth note events (**5.53%** source coverage), and all 1,800 GT events match the original MIDI-derived TSV events exactly. After discarding any held-key component that contains an unannotated note, the new research benchmark identified **242 fully annotated same-hand overlapping-note islands (1,467 notes)**. The unchanged FG-02I research router returned proposals for **1,210/1,467 (82.48%)** eligible notes and matched the source labels on **644/1,467 (43.90%)**, or 53.22% of accepted proposals. It rejected 22/242 chord islands. Fully source-pinned evaluation accepted **543/1,467** notes (**37.01%**); 104 islands were rejected without overriding a single written finger. All 22 unannotated refusals were `NO_VALID_PATH`. The 104 source-pinned island refusals were `AUTHOR_PHYSICAL_CONFLICT`; the independent audit registered **148 modeled stretch violations**, **16 modeled held-finger-order crossings** and **11 concurrent finger reuses** (these are individual violations, not 175 distinct rejected islands). These findings require biomechanical and score-alignment review; they do **not** establish that human performers used impossible fingers. These numbers are measured on actual independent-source performances but represent agreement with the source's manual labels, **not** expert-adjudicated tutoring accuracy. See [FG-02J research report](docs/FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md).

**Release decision: automatic learner-facing fingering remains NO-GO**, irrespective of source discovery status. The original 14 PNG hand images, authoritative MusicXML finger notation and next-key preview are unchanged.

[FG-02J source, methodology, licensing and next steps](docs/FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md).

## FG-03A: score-complete, source-safe Finger Guidance timeline (v0.10.42)

The pure `src/core/finger-guidance-timeline.mjs` is now used by the built player to group **all valid score-note onsets**, not only those with known fingering. This prevents misleading lookahead in MusicXML passages containing missing author labels. Unannotated onsets remain silent guidance boundaries; they are not allocated an invented finger and never permit guidance to skip visually to a later note. Partially annotated chords show only verified individual numeric badges; a full PNG hand pose and next full Ghost preview require complete annotation at that onset. Explicit demonstration fingering still works. The original fourteen PNG assets, piano-key geometry, transport and physical MIDI handling are unchanged.

**Checks:** Seven new Node unit tests cover trustworthy source/hand constraints, retained note IDs, missing-label boundaries, partial chords, simultaneous duplicate pitches, millisecond score ordering and invalid inputs. The real Chromium MusicXML acceptance test checks that the player retains silent boundaries for unannotated notes. Run `npm run build`, `npm test`, then `npm run test:browser`. CI must pass before merge. **Limitations:** This improves source fidelity and preview correctness; it is neither auto-fingering nor an anatomical motion model. All experimental auto-generated fingerings remain disabled for learners.

References: [updated development roadmap](docs/ROADMAP-FINGER-GUIDANCE.md), [FG-03A design and acceptance](docs/FG-03A-SCORE-GUIDANCE.md), and the independent [FG-02J NO-GO evidence](docs/FG-02J-INDEPENDENT-POLYPHONY-EVIDENCE.md).

## FG-03B1: configurable tempo-aware Ghost lookahead (v0.10.43)

A second (preview-only) hand pose is now gated by the actual distance to its next onset, measured in **wall-clock milliseconds** after applying playback speed, with the selected 500 / 600 / 750 / 900 / 1000 ms preview window. The default is 750 ms. Ghost opacity increases as the next position approaches; known actionable finger numbers remain visually separate. The preview is disabled while **Wait** has an unfinished group and does not incorrectly treat a prior note from a Loop iteration as imminent. The setting persists in validated global browser preferences and is available only with **Руки + следующая позиция / Ghost** enabled. A source-incomplete next chord cannot receive a fully posed hand preview.

**Verification:** Five new deterministic unit cases verify relative tempo, invalid inputs, Wait and Loop wrapping; real Chromium regression checks selected time, 150% speed, Wait, Loop and persistence across page reload. GitHub Actions runs build + Node + browser acceptance. **Not in scope:** image replacement, true articulation of physical fingers, computed source-agnostic fingering, learned-motion accuracy or continuous motion tweening. The original 14 owner-provided PNGs remain intact; any automatic finger selection remains a research-only NO-GO. See [FG-03B1 technical details](docs/FG-03B1-LOOKAHEAD.md) and the [updated roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

## FG-03B2A: conservative Ghost repositioning (v0.10.44)

Inside the v0.10.43 tempo-aware 500–1000 ms Ghost window, the additional semitransparent PNG may now move smoothly along the horizontal piano axis from the **current authored hand location** toward the **next authored hand location**. This is a time-driven cubic easing, computed from the existing key geometry in the live player; it is not a change to Web MIDI scoring and not an attempt to render articulated anatomy. Destination **finger-number badges remain on the correct future physical key** throughout the preview. Seek and Pause derive the image position directly from the current transport state, without persisted animation history.

A detected **LH/RH crossing** or near-collision never interpolates two entire hand images through one another; only the verified destination key badges are shown. Very short shifts suppress redundant duplicate hands. Strongly clipped or unknown start/end placements fall back to a static target image or badge-only preview without falsely sliding fingers to different keys. No movement is presented in Wait until the current task is satisfied, consistent with FG-03B1.

**Verification:** New Node tests cover starting, midway and final easing, input immutability, clipping, crossings, pause/seek, and conservative marker fallbacks. The Chromium suite now exercises a wide authored right-hand jump in playback versus pause, mobile viewport, both hands crossing, Wait and screenshot capture in the existing PNG test. PR CI also re-runs music timing, OSMD, backup/security and all published fingering research audits. The original 14 owner PNGs are unchanged.

**Limitations / next FG-03B2B:** static-finger PNG translation is not physically faithful full-hand animation, and no independent pianist review has yet approved crossings or thumb-under biomechanics. Screenshot artifacts are available for visual UAT, but musician sign-off on 25/49/61/88-key layouts and representative real music remains pending. Research-only auto fingering remains **NO-GO** for teaching. [Detailed methods, checks and exceptions](docs/FG-03B2A-SAFE-MOTION.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

## FG-03B2A hotfix: deployed version labels synchronized (v0.10.45)

**Issue reproduced:** The release displayed to users was stuck at `Standalone · v0.10.41` even though the `main` branch and GitHub Pages deployment held v0.10.44. The three outdated strings were in the **static HTML template**, not evidence that the current app executable had rolled back.

**Fix:** `src/index.html` now uses a mandatory `__PLAY_ALONG_VERSION__` placeholder for title, banner, startup score label and cache-busting query arguments on `app.js` and `app.css`. The build resolves all five occurrences from `package.json`, rejects missing/extra tokens and stale old release text, and writes the stamped `dist/index.html`. `tests/build.test.mjs` verifies the complete stamped HTML and `tests/finger-guidance.real.test.mjs` checks the actual rendered `Standalone` banner, browser tab title and `window.__playAlongVersion` in Chromium.

**FG-03B2A crossing safety fix:** The main Pages deployment exposed a real ambiguity: a two-hand, author-labelled crossing could have an unplaceable/clipped PNG sprite; the pure geometry classifier then returned false (because one of four positions was missing), allowing the other hand to display a static silhouette. The renderer now **fails closed for BOTH hands** whenever the source event and following event each contain RH and LH but any current/next sprite placement is unknown. Both hands show **fixed source-verified target-key badges**, never ambiguous motion. The real Chromium test requires the fail-closed crossing state and both markers-only plans; existing pure crossing tests remain. The release remains v0.10.45; this change adjusts only visual safety on ambiguous crossings, not MIDI scoring or original PNG assets.

**Verification:** Run `npm run build && npm test && npm run test:browser`; a green pull request plus a successful `main` deployment are required to consider the issue closed. A user already viewing an old browser page may need to reload the page once to fetch the new `index.html`; the new versioned asset URLs then ensure the matching JS and CSS are used. No source finger guidance, research benchmark data or original hand PNG assets were altered.
