# Play Along — Piano Practice App (v0.10.68)

Play Along is an independently hosted browser piano practice application with Web MIDI, Piano Roll, OpenSheetMusicDisplay (OSMD), MusicXML/MXL and MIDI import, optional online music catalogs, and Wait/Tempo/Listen practice modes.

**Live site:** https://shafranek-js.github.io/play-along/

**Parallel-PR CI policy (coordination update; no application release):** Research-only branches `research/fingering-ai-*`, `research/hand-motion-*`, `research/music-engine-*` and `qa/*` must provide dedicated `docs/FG-*.md` / `docs/QA-*.md` and are limited to research modules/tests/scripts/docs/data manifests; they cannot change production player, SoundFont/MAESTRO, shared README, package versions or CI. All **other** application/integration PRs still must update README and pass full existing tests. The Lead Architect merges compatible work, updates release docs/version and verifies deployment. This change does not itself increase Hand-thesia completion or enable auto-fingering.

**Parallel development coordination:** Work on Fingering AI, Hand Animation, Music Engine and QA is organized into independent ChatGPT threads and isolated PR branches. Only the coordinating Lead Architect integrates and merges tested work, updates release versions and checks SoundFont/MAESTRO non-regression. See [parallel-chat development protocol](docs/PARALLEL-CHAT-DEV.md). This is a documentation/workflow change, not a new player version or automatic fingering feature.


## SoundFont playback (v0.10.63)

**SoundFont playback:** This release includes GeneralUser GS 2.0.3 (SF2) and MuseScore General 0.2.0 (SF3), each with all 128 General MIDI programs, original licenses and checksum-verified catalogs. GeneralUser is the default; the MIDI settings panel switches banks and live instruments. File programs, isolated live input, Wait/Tempo/Listen transport, retry/Panic and settings/backup restoration are integrated. The functional regression passed all 25 browser scripts and 395 unit tests; all 256 GM programs produced finite nonzero central-note PCM. Firefox loading and focused PCM checks also passed. Higher memory use and GeneralUser clipping in the dense 128-note fixture are explicitly deferred follow-up work. Physical MIDI and Safari/iOS acceptance remain separate; the tested Windows Playwright WebKit lacks Web Audio APIs. See [SoundFont execution and acceptance](docs/SOUNDFONT-ORCHESTRATION.md).

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

**FG-03B2B-1 v0.10.46:** Virtual 25/49/61/88-key piano ranges now work without a physical MIDI profile, and changing the visible range forces a fresh keyboard geometry redraw. Complete hand PNG poses are suppressed when **any authored chord note of that hand is outside the selected range**; visible source-approved numeric finger targets remain. New eight-case desktop/mobile Chromium screenshot QA and JSON evidence are captured in PR artifacts. This is technical viewport acceptance, **not** physical hand-movement approval by a pianist. See [FG-03B2B keyboard-range QA](docs/FG-03B2B-RANGE-QA.md).

**FG-03C2A v0.10.48:** Select a source-backed MusicXML note on Piano Roll to choose an explicit finger (1–5) and RH/LH or unknown hand. Manual corrections are layered over — never written into — original author notation, can be undone once or reset to author, and are persisted for reimports of identical MusicXML content. User-derived guidance is identified separately from authored fingering. Existing backup export includes corrections; strict backup restore rejects malicious or invalid overrides before touching stored data. See [FG-03C2A implementation](docs/FG-03C2A-MANUAL-CORRECTIONS.md). This is not automatically predicted fingering.

**Library v0.10.49:** Every catalog row now shows **Аппликатура: Есть / Частично / Нет / Не проверено**, including a percentage and note count for verified files; a new selector filters by status alongside search/source/favorites. Offline saved XML scores are progressively indexed without re-downloading; manual user edits refresh coverage. The left library now has **five independent, collapsible and reorderable sections** (Каталог, Моя коллекция, Резервная копия, Подключённая папка, Онлайн-библиотеки), movable by drag handle, ↑/↓ controls or Alt + arrows. Order/open state is preserved and validated during backup recovery. [Technical details](docs/LIBRARY-COVERAGE-AND-LAYOUT.md).

**Library v0.10.50:** **Быстрые действия** is now the **sixth independent collapsible/reorderable library section**, with exactly the same ⠿ drag, ↑/↓ buttons, Alt+arrows and persistent collapsed state as the original five. Its calibration and layout-reset actions are unchanged. Previously saved five-section layouts and JSON backups migrate without resetting custom order; Quick Actions is appended open by default. See [library layout contract](docs/LIBRARY-COVERAGE-AND-LAYOUT.md).

**FG-03C2B1 v0.10.51:** A score-wide, 40-operation **Undo/Redo** history for manual fingering edits now replaces the one-note undo. Edit several notes, undo in chronological order, redo removed edits, or undo a return-to-author reset. New edits after Undo clear redo. The separate, source-preserving corrections remain persistent; the stack is session-only and is excluded from backups to avoid stale playback of operations. See [FG-03C2B1](docs/FG-03C2B1-UNDO-REDO.md).

**FG-03C2B2 v0.10.52:** The Piano Roll fingering editor now supports **Ctrl+A** (all source notes, including outside the viewport), **Shift+click** (contiguous score-order range), **Ctrl/Cmd+click** (arbitrary toggle selection) and **drag-marquee** of visible notes. Selected notes can receive **one bulk hand assignment without changing or inventing their individual fingers**, an optional explicit common finger, or a group reset to author. Each group operation is atomic and a single Undo/Redo step. The virtual keyboard remains playable independently. See [Multi-note selection and bulk editing](docs/FG-03C2B2-MULTI-SELECT.md).

**FG-03C2B3 v0.10.53:** A separate **✍ Аппликатура** practice view now provides a horizontally scrollable full-song timeline with note-level verified fingers/hand markers, zoom, Ctrl/Cmd+A, Ctrl/Cmd/Shift+click, drag-marquee, always-visible independent group finger/hand controls, and group Undo/Redo. Long works render only the viewport; all imported MusicXML notes remain scroll-reachable. In **Sheet Music**, verified user finger corrections are shown by composing a temporary MusicXML display clone with amber source-labelled annotations and a provenance legend. Unmatched note identities fail closed. The original MusicXML, playable notes and hand PNG assets remain unchanged; no annotated-file export is implied. [Detailed contract](docs/FG-03C2B3-FINGERING-EDITOR.md).

**FG-04A v0.10.54 — External candidate research gate:** The dedicated fingering editor now has a collapsed **🔬 Сравнение внешней аппликатуры** panel for inspecting locally selected MusicXML/MXL outputs from MasterPiano, PianoPlayer, PineappleMusicLab and others. An exact source/voice/timing/part/notation comparison accepts differences **only in finger annotations**; original author markers, generated additions, conflicts, removals, unknown hands and gaps are reported. Download a per-note JSON evidence report. **Nothing is applied to learner hints, source notes, user overrides, playback or storage.** Updated roadmap separates FG-04A integrity gate, FG-04B frozen 10–20 score corpus, and conditional FG-04C/D expert-validated auto suggestions (currently NO-GO). [Detailed contract](docs/FG-04A-EXTERNAL-CANDIDATE-EVALUATION.md).

**FG-04B research update (2026-10-12, documentation-only):** Reviewed [Hand-thesia / pygame-piano-animator](https://github.com/V9011N/pygame-piano-animator), a Python MIDI player with source-independent RH/LH separation, beam-search fingering, animated per-finger IK, ergonomic hand profiles, a fingering editor and embedded-MIDI finger tags. It **does not document MusicXML export** and has **no declared repository code license** (fonts are separately OFL-licensed). Its renderer may adjust strike/release timing to match simulated hands — forbidden for Play Along's source playback and Wait/Tempo contracts. Roadmap now treats it only as a separate **licensed-access-first MIDI/animation research comparator**; no third-party code, model, automatically generated instructional fingers or hand images were incorporated. [Review and evidence gates](docs/FG-04B-HAND-THESIA-REVIEW.md).


**FG-04B2 v0.10.55 (research only):** Added an independently written, bounded read-only Standard MIDI File parser and source-identity comparison for Hand-thesia-style R1–R5/L1–L5/F1–F5 markers. It requires original source-derived MIDI, candidate MIDI and original MusicXML note IDs. It rejects different tempo, pitch, note length, velocity or ambiguous unisons; author-finger conflicts are reported, never applied. **No learner auto-fingering, no player changes, no Python dependency, no copied upstream code.** Nine synthetic Node regression tests passed locally. The licensed real-score corpus and independent pianist review are still pending. [FG-04B2 contract](docs/FG-04B2-MIDI-ALIGNMENT.md).

**FG-04B1a v0.10.56 (technical corpus preparation):** Freeze **16 MIT-licensed MusicXML test-suite sources** across chord, voice, arpeggio, tie, cross-staff, repeat, tuplet, grace and related notation cases, each with pinned upstream commit, source byte length and Git blob SHA-1. A read-only Node research command validates actual online files; **8 offline unit tests** catch mutable or malformed manifests, mismatched content, wrong sources and missing provenance. **These 16 tests are not 16 real piano compositions or validated fingerings**: the planned 10–20-score *real repertoire* corpus and external candidate pairs remain outstanding. No new player behavior or automatic hand/finger hints. See [FG-04B1a corpus](docs/FG-04B1A-TECHNICAL-CORPUS.md) and [roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

**MAE-01/02A research-only v0.10.57:** Added an offline MAESTRO v3.0.0 metadata validator and deterministic 24-performance QA candidate selector (16 train / 4 validation / 4 test). Optional official MIDI ZIP SHA256 check; CSV row/split/path integrity validation; generated JSON manifest explicitly marks MIDI byte checks and complexity profiling unverified. **No dataset MIDI, learner catalog, auto-fingering, playback change, or external network fetching is included.** Real archive access, note/polyphony/pedal profiling and representative corpus freeze remain pending. See [MAESTRO integration and reproducibility](docs/MAESTRO-INTEGRATION.md).

**FG-04B1b v0.10.58 — real repertoire source corpus:** Freeze 16 actual classical piano score entries (9 composers), each paired with source MusicXML and quantized score MIDI from ASAP Dataset, pinned to an immutable commit and individual Git SHA-1/byte-length. A research-only acquisition script checks both files, reports music envelope and strict MIDI parser readiness without publishing source bytes; PR CI runs the network audit and saves an evidence report. **CC BY-NC-SA 4.0 research only** — these sources are NOT shipped to the public player. Note-level XML↔MIDI matching, independent authored finger references, Hand-thesia candidate outputs and pianist validation are still **unverified**, so automatic teaching is disabled. [Detailed corpus and limits](docs/FG-04B1B-REAL-SCORE-CORPUS.md).

**FG-04B3a v0.10.59 (research only):** Add deterministic matching of **independently normalized MusicXML playback note events** to original MIDI-score note-on/release events, requiring unique source IDs, pitch, start/end times and a bounded 2-ms absolute tolerance. It refuses ambiguous unisons, changed rhythm, missing events, invalid tie-source identities, shared MIDI events and corrupt source data. A pure research report retains voice, staff, part and MIDI provenance but **never invents finger numbers**. New **15 synthetic regression tests** cover tempo changes and fail-closed edge cases. **This is not yet raw MusicXML interpretation or validation of 16 real ASAP pairs.** Original 14 owner PNG hands, lesson transport, user overrides and stored sources are unchanged. [FG-04B3a contract](docs/FG-04B3A-EVENT-ALIGNMENT.md).

**MAE-02B research v0.10.60:** Offline archive-to-CSV membership checker and selected-real-MIDI event profiler for MAESTRO v3.0.0. It measures note count, velocity, held-note polyphony, repeated attacks and sustain/sostenuto/una-corda MIDI CCs from 24 candidate performances. GitHub Actions verifies official ZIP SHA256 before producing a derived JSON audit artifact; no original MAESTRO MIDI is bundled or distributed, and no fingers, score truth or difficulty are inferred. See [MAESTRO audit contract](docs/MAESTRO-INTEGRATION.md). Real dataset verification requires the dedicated CI workflow.

**FG-04B3b v0.10.61 (research only):** Added independently parsed **raw MusicXML 3.x score-partwise → normalized musical note events → MIDI-score pitch/onset/release alignment**. Handles divisions, rests, chords, multiple voices via backup/forward, staff/part/voice identities and explicit connected ties. Unsupported repeats, grace-note realizations, ambiguous unisons, unrelated XML/MIDI note times and unsupported scores refuse rather than fabricate note identities. Research CI checks all **16 immutable CC BY-NC-SA ASAP real-score pairs** and reports exact aligned/refused counts and reasons, with **no original XML/MIDI bytes, notes or fingerings in the report**. Uses the original score MIDI tempo clock; independent MusicXML tempo, repeat/ornament semantics and pianist fingering remain unverified. No changes to player, 14 owner PNG hands, Wait/Tempo, original XML or manual corrections. [FG-04B3b contract](docs/FG-04B3B-ASAP-XML-MIDI-AUDIT.md).

**MAE-02C research v0.10.62:** The independent offline MAESTRO pipeline now checks all 1,276 original MIDI files, computes reproducible performance complexity metrics and selects 24 recordings for coverage of polyphony, note density, repeated attacks, velocity spread and CC64/66/67 variation. Train/validation/test remain separate (16/4/4). Original metadata-only sampling is retained in any split where it covers more predefined feature categories. The result is **QA diversity, not representative statistics, musical difficulty or verified fingering**. The research-only GitHub Action archives only derived metadata; original MIDI/audio and 14 approved hand PNGs remain untouched. See [MAESTRO MAE-02C](docs/MAESTRO-INTEGRATION.md).

**MAE-04A Online Library v0.10.64:** MAESTRO v3.0.0 is now a selectable source in **Библиотека → Онлайн-библиотеки**. Search the 1,276 officially indexed piano performances by title/composer. On selecting one MIDI, Play Along downloads the official ~56 MB MIDI-only ZIP once per tab (or accepts the exact official local ZIP), validates its SHA256 and extracts only the requested MIDI with CRC checks. The performance opens in Piano Roll / Wait / Tempo and can be saved into the local collection with Google LLC CC BY-NC-SA 4.0 attribution. No third-party MIDI data is bundled on GitHub Pages, and no MusicXML score, difficulty classification or reliable anatomical fingering is inferred. The full ZIP does not go to IndexedDB/backups. [MAESTRO Online Catalog](docs/MAESTRO-ONLINE-CATALOG.md).

**FG-04B3c v0.10.65 — pinned ASAP refusal triage (research only):** Previous pinned 16-score MusicXML/MIDI audit measured **1 aligned (Bach Prelude BWV 846), 15 refused**: 7 grace-note realizations, 4 repeat/navigation cases, 1 ambiguous cross-voice tie provenance, 1 unmatched event, 1 backing-up voice timeline and 1 MIDI zero-length note. Freeze exact per-score outcomes in a separate research manifest and add a fail-closed classifier/CI regression gate: previously aligned scores must not silently become rejected; changed rejection codes do not count as improvements. Independently inspect the Bach Fugue and accept cross-voice continuation of an explicitly tied note **only when the same part, staff, pitch and adjacent beat give exactly one candidate**; otherwise refuse. Add 11 new unit checks. **SoundFont SF05 CI stability:** The SoundFont-enabled browser suite intermittently failed at GeneralUser GS program 0 because an asynchronous PCM capture window did not fully contain the scheduled note. The SF05 GM regression test now provides a longer capture window and at most three **coverage-only** attempts. It still requires finite, nonzero PCM for **all 128 programs in each of both banks** and rejects any program without a complete note-on/off capture. **No SoundFont files, DSP code, audio timing or instrument behavior were modified.**

**Actual FG-04B3c CI result:** still **1/16 fully aligned**, **15/16 rejected**; Bach Fugue now reaches a separate `ZERO_LENGTH_MIDI_NOTE` refusal instead of the earlier orphan tie. No newly aligned scores and no previously aligned regressions. **Player playback, GeneralUser GS/MuseScore General SoundFont banks, original XML, original 14 hand PNGs and finger guidance remain unchanged.** Automatic fingering remains NO-GO. [FG-04B3c audit](docs/FG-04B3C-ASAP-REFUSAL-TRIAGE.md).

**FG-04B3d v0.10.67 (source diagnostics, research only):** The original ASAP MusicXML/MIDI comparison remains **1 fully aligned / 15 refused**. Added a separate strict MIDI 0/1 structural anomaly scanner which counts original zero-tick NoteOn/NoteOff pairs **without changing their duration, replaying them or treating them as valid teaching events**. A lexical MusicXML inventory counts grace/author timing attributes, repeats, endings and score-navigation markings without inventing the performed notes. The existing 16 immutable CC BY-NC-SA ASAP pairs now have a hash-verified per-score aggregate diagnostic report with no copied musical passages, pitches or generated fingers, while the FG-04B3c regression guard and main FG-04B2/FG-04B3b refusal behavior remain unchanged. Added 13 source-integrity/refusal tests. **SoundFont SF2/SF3 banks, 256-program audio checks, original MAESTRO catalog, Web MIDI/Wait/Tempo, 14 transparent hand images and original MusicXML remain unchanged.** [FG-04B3d evidence](docs/FG-04B3D-ZERO-EVENT-SCORE-DIAGNOSTICS.md).

**Measured FG-04B3d original-data results (16 pinned ASAP scores):** 38,267 original MIDI note-on/off pairs were examined, including **1,060 zero-tick pairs in 14 scores** (about **2.77%**). The MusicXML files contain **340 lexical grace markers, 25 repeat markers and 12 ending markers**; none of the 340 grace markers contains an explicit MusicXML `steal-time-previous`, `steal-time-following` or `make-time` attribute. This establishes source-data inventory, **not** an algorithmic correction of grace-note timing. The full-score matching gate stays **1/16** with zero new matches and zero regressions. [Research method and per-work findings](docs/FG-04B3D-ZERO-EVENT-SCORE-DIAGNOSTICS.md).

**FG-04B4 v0.10.68 — source-aware RH/LH hand separation research (NO-GO for learner hints):** Added an independent pure candidate `separateHandsResearch` with a bounded onset-group beam search; evaluates simultaneous notes, held-key occupancy, reachable hand spans, movement, voice continuity and crossings **without a fixed middle-C split**. It accepts trusted source/author hand anchors and user overrides without changing them; ambiguous or impossible inference returns `unknown` or a diagnostic. This release **registers 17 new Node tests for full CI**, but the five reference patterns are synthetic: 6/12 unanchored predictions proposed, 6/6 match the synthetic labels, 6 unknown. **Independent real-repertoire hand attribution, pianist review and safe auto-fingering have NOT been established.** The research module is not imported into playback, lessons or hand hints; all 14 user PNGs, SoundFont banks, MAESTRO, user corrections and original MusicXML/MIDI timing remain unchanged. [FG-04B4 research](docs/FG-HAND-SEPARATION-RESEARCH.md). This research-only change does **not** raise the provisional 35% Hand-thesia completion estimate.

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
| `npm run build` | Assemble 22 source fragments, bundle the audio ESM/worklets, verify and copy both SoundFonts and notices, CSS, HTML and OSMD 2.2.0 |
| `npm run dev` | Serve the built `dist/` folder over HTTP |
| `npm test` | Check deterministic output, syntax, DOM anchors and baseline integrity |
| `npm run test:maestro` | Run MAESTRO metadata, ZIP integrity and MIDI-event regression tests |
| `npm run research:maestro:plan -- --csv PATH [--zip ZIP] [--out JSON]` | Offline 24-piece QA candidate manifest from official v3 CSV; optional ZIP hash verification |
| `npm run research:maestro:audit -- --csv CSV --zip ZIP --out JSON` | Verify official ZIP, 1,276 file memberships and 24 MIDI event profiles (offline research) |
| `npm run research:maestro:diversity -- --csv CSV --zip ZIP --out JSON` | Profile all 1,276 MIDI files and select 24 measured-diversity QA performances |
| `npm run test:browser` | Run real Chromium scenarios (requires `npx playwright install chromium`) |
| `npm run test:audio` | Check both production banks with actual AudioWorklet PCM and prefix-relative asset loading |
| npm run benchmark:fingering:repertoire | Reproduce FG-02G on five pinned, checksum-verified licensed musical excerpts (requires network) |
| npm run benchmark:fingering:contextual | Compare FG-02H with FG-02G, including author-anchor acceptance and movement warnings |
| npm run benchmark:fingering:heldout | Reproduce FG-02E locked, 34-case educational scale evaluation |
| `npm run research:fingering:polyphony-source` | FG-02J metadata-only external polyphonic fingering source qualification (requires network, noncommercial research scope) |
| `npm run research:fingering:polyphony-align` | Compare 11 source-fingered PianoVAM records to corresponding MIDI-derived TSV note events at a pinned dataset commit; explicit mismatch report (noncommercial research only) |
| `npm run benchmark:fingering:independent-polyphony` | Compare FG-02I on only *fully source-annotated same-hand chord/overlap islands*, excluding incomplete partial-ground-truth source groups; noncommercial research only |


## Deployment and third-party components

Pushes to `main` trigger `.github/workflows/pages.yml`. CI runs `npm ci`, compiles the site, executes Node tests and real Chromium regressions, and deploys `dist/` to GitHub Pages when all tests pass.

OSMD **2.2.0 is bundled locally** from the pinned npm package and loaded on demand from `./assets/vendor/opensheetmusicdisplay.min.js`, with CDN fallback. Catalog synchronization still requires external network access. The original music files are not uploaded to GitHub; local repertoire and full performance history are kept in browser IndexedDB, global preferences in localStorage.

The local SoundFont build uses pinned **spessasynth_core 4.3.22** through a separate AudioWorklet adapter. The two bank files total **68.87 MiB**; static audio delivery has an explicitly agreed **80 MiB** budget. Runtime fetches only the selected bank and caches it by content hash. GeneralUser's custom license and MuseScore's MIT/inherited contributor notices are preserved under `dist/assets/audio/`, alongside core/decoder licenses. The preliminary **160 MiB additional-memory target remains unmet**; synthetic PCM tests do not establish physical MIDI latency or listening quality. These limitations remain visible in the execution record.

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
scripts/audio-assets.mjs          Binary SoundFont/catalog/license verification
src/audio/                       Production ESM loader and AudioWorklet adapter
src/assets/audio/                Pinned banks, preset catalogs and original notices
scripts/manifest.json             Required source concatenation order
tests/                            Browser and unit regressions
package-lock.json                 Pinned dependency graph
.github/workflows/pages.yml       Build, tests and deployment
```

The original v0.9.1 single-script migration was intentionally structure-first. **This is not a collection of isolated ES modules.** Source fragments share lexical scope in one generated IIFE, and a few functions cross fragment boundaries; the manifest order remains critical. Replacing this with independent modules is a future architectural milestone, not a completed one.

## Music correctness and known limitations

Covered by regression fixtures: real OSMD rendering and cursor seeks, simple repeats, standard first/second voltas, shared measure timeline, 4/4→3/4, compound-meter dotted metronome, MusicXML timing offsets, notes/chords/ties/rests, Wait legato and Tempo unison scoring.

Unsupported forms are not silently claimed correct: complicated nested repeats, D.C./D.S./coda, irregular volta structures, grace-note realization, complex polymeter and ornament performance. Repeat passages that change divisions, meter or tempo within their repeated execution stay in written playback order with a warning until safe state restoration is implemented.

Real physical MIDI device behavior, sustain pedal/CC64, live service availability and long-duration stress scenarios require further UAT. Existing Playwright CI tests use synthetic MIDI input rather than a physical keyboard.

---
### Release history

## Experimental RH/LH Hand Separation (v0.10.68)

- Integrate research-only Fingering AI PR #62 as a **pure, separately versioned module**; bounded beam search respects held-key/simultaneous-note constraints and author/user hand labels with no middle-C hard split. Ambiguous hypotheses abstain, not confidently assign. No generated finger numbers.
- Register 17 new synthetic/refusal/immutability tests in the main `npm test` suite. Five synthetic mini-fixtures (12 unlabeled notes) produced 6 proposed, 6 unknown and 6 synthetic-agreement matches. **Not** an independently pianist-scored real-corpus benchmark or proof of safe teaching guidance.
- Preserve production MusicXML/MIDI, Wait/Tempo/Listen, SoundFont GM 256-program checks, MAESTRO catalog and both existing sets of seven original transparent PNG hand poses. Auto-applicative hand hints remain disabled. [FG-04B4 details](docs/FG-HAND-SEPARATION-RESEARCH.md).


## Original MIDI and notation anomaly inventory (v0.10.67)

- FG-04B3d scans all 16 immutable ASAP score MIDI files for actual zero-tick note pair counts in a read-only diagnostic parser. These events remain fatal to real source-MIDI matching; no invented note durations, altered music or false passing repertoire metrics.
- Introduces independent lexical inventory of MusicXML grace marks (including explicit time-steal or make-time attributes), repeats, first/second endings and score navigation; report only safe per-piece counts and clear musical uncertainty rather than modifying playback.
- New 13-case offline suite plus online hash-verified audit; preserve previous ASAP **1/16** alignment baseline, player/piano, original hand PNGs, the MAESTRO 1,276-record catalog and the two installed SoundFont banks. See [method and next FG-04B3e gate](docs/FG-04B3D-ZERO-EVENT-SCORE-DIAGNOSTICS.md).


### GitHub Pages release publication integrity (deployment hotfix)

- Publishing from `main` now runs the production build and Node tests, then uploads and deploys the generated site without **repeating the full Chromium browser suite**. The full browser, research, and SoundFont acceptance suite still runs in PR CI before merging. Repeating a long/occasionally timing-sensitive audio test after merging had been delaying Pages publication, leaving the former `Standalone` version visible.
- Deployment verifies the generated HTML, cache-busting asset URLs, and JavaScript version stamp match `package.json`. After `actions/deploy-pages` it also probes the **public GitHub Pages URL** (cache-busting query, with retries) and requires that both live HTML and JS report the expected version. Thus a successful deploy run provides **actual published-version evidence**, not just a successful Git merge.
- If the GitHub Pages workflow reports success but the browser remains stale, refresh without cache (`Ctrl+Shift+R`) or open `https://shafranek-js.github.io/play-along/?release=latest`. This change does not modify the application's playback, MIDI source handling, SoundFonts, or the 14 approved PNG hand images.



## MAE-03A — original MIDI articulation and golden real-performance clock (v0.10.66)

- Removed the importer’s artificial **25 ms minimum MIDI note duration**: genuine sub-25-ms NoteOn→NoteOff intervals now remain intact in Piano Roll/Wait/Tempo note models, preserving fast staccato and repeated-key articulation. Playback backends can retain independent sound-safety minima; this change does not alter SoundFonts, tempo mapping, original user scores or fingering hands.
- Added a fully separate offline SMF note+tempo+pedal oracle and reproducible **Chromium comparison** against the Play Along browser parser. Synthetic tests cover a 1-tick staccato, tempo switch, same-pitch repeated attacks, cross-track unison and CC64/66/67.
- Dedicated official MAESTRO CI verifies the original MIDI-only ZIP and each of the **24 permanent sample SHA256 identities**, then compares exact note pitch/onset/release/channel/velocity and sustain-controller timing in the actual app; outputs derived source signatures only, without publishing original MIDI or note events. Passing CI evidence is required before stating real-corpus compatibility. The audible pedal/seek and learner scoring workflows remain separate MAE-03B follow-up checks.
- See [MAE-03A musical time contract](docs/MAESTRO-MIDI-ENGINE-GOLDEN.md). The MAESTRO online catalog and its CC BY-NC-SA 4.0 attribution remain unchanged.

### GitHub Pages release publication integrity (deployment hotfix)

- Publishing from `main` now runs the production build and Node tests, then uploads and deploys the generated site without **repeating the full Chromium browser suite**. The full browser, research, and SoundFont acceptance suite still runs in PR CI before merging. Repeating a long/occasionally timing-sensitive audio test after merging had been delaying Pages publication, leaving the former `Standalone` version visible.
- Deployment verifies the generated HTML, cache-busting asset URLs, and JavaScript version stamp match `package.json`. After `actions/deploy-pages` it also probes the **public GitHub Pages URL** (cache-busting query, with retries) and requires that both live HTML and JS report the expected version. Thus a successful deploy run provides **actual published-version evidence**, not just a successful Git merge.
- If the GitHub Pages workflow reports success but the browser remains stale, refresh without cache (`Ctrl+Shift+R`) or open `https://shafranek-js.github.io/play-along/?release=latest`. This change does not modify the application's playback, MIDI source handling, SoundFonts, or the 14 approved PNG hand images.

## ASAP music alignment provenance and SoundFont-safe triage (v0.10.65)

- Research audit baseline anchored to the **actual** v0.10.61 GitHub Actions artifact: **1/16** source-aligned piano scores, **15** explicit refusals, classified by musical cause and individually traceable without exporting copyright-protected pitches or notes.
- A genuine Bach BWV 846 Fugue notational voice change can now form a continuous tie only with an unambiguous exact-beat part/staff/pitch source match. Competing starts, cross-staff and gaps still reject. Previous-aligned score regression now fails CI, and a new refusal reason is not misreported as an accuracy improvement.
- Added source-finger-neutral research triage tests and updated CI report; kept full SoundFont-enabled v0.10.63 package dependencies, audio bank assets, instrument routing, Wait/Tempo behavior and 14 user-owned hand PNGs completely unchanged. No production automatic fingering. [FG-04B3c](docs/FG-04B3C-ASAP-REFUSAL-TRIAGE.md).




## MAESTRO v3 Online Library (v0.10.64)

- Added **♩ MAESTRO · 1 276 MIDI** as a separate Online Libraries source and select filter. The catalog loads only on request, shows canonical composer/title/year, supports the existing search, sorting, pagination and favorites, and can be refreshed without resetting the user's collection.
- Opening a performance lazily downloads Google's pinned official MIDI-only ZIP (~56 MB), verifies SHA256, safely checks ZIP entries and CRC32, and imports the selected MIDI through the normal player/persistence path. Use **Подключить ZIP с компьютера** if browser network/CORS blocks remote download. The full ZIP is not bundled or persisted, avoiding storage quota/backups; reuse is in-tab only.
- Google LLC MAESTRO v3.0.0 **CC BY-NC-SA 4.0**: attribution and license are visible and retained with saved recordings. These are real pianist performances and MIDI events, not source-verified MusicXML score/fingering or teaching difficulty. All existing Wait/Tempo, author score provenance and 14 user-provided PNG hand assets are unchanged.
- Added offline/synthetic Chromium catalog smoke test and full official-archive Chromium opening gate in the dedicated MAESTRO research CI. See [MAESTRO Online Catalog](docs/MAESTRO-ONLINE-CATALOG.md).

## Full MAESTRO performance profiling and diversity selection (v0.10.62)

- Added a bounded offline scan of all official MAESTRO v3.0.0 MIDI performances, independently using the existing checksum/CRC/SMF integrity gates. The report freezes the 24 selected source paths, individual MIDI SHA256 and event-derived metrics, without storing source tracks or audio.
- Compare duration, note density, held-note polyphony, repeated key attacks, velocity spread, pitch range, tempo event count and sustain/sostenuto/una corda controller presence with split-local quantile buckets. Select 16 train, 4 validation and 4 test by weighted coverage, retaining the metadata-only baseline for any split where measured coverage does not strictly improve. This is a targeted regression QA sample, **not** a pedagogical skill rating, a representative sample or blind independent ML holdout.
- New deterministic/split-independence/tie-handling tests and dedicated official-source CI report; default playback, user library, author fingering, physical hand poses and Wait/Tempo remain unmodified. The independently verified 2026-10-12 official-source run scanned **1,276 MIDI files and 7,040,164 key attacks**, and the new 24-piece sample includes **143,923 attacks**. Weighted feature-coverage scores improved **train 67→71, validation 52→68, test 45→67** (not percentages or difficulty ratings). [Verified CI run](https://github.com/shafranek-js/play-along/actions/runs/38291524798).  The 24 exact MIDI paths and SHA256 values are frozen in [the MAESTRO QA pins](research/maestro-v3-measured-qa-pins.json), and CI now refuses silent corpus drift.See [MAESTRO integration](docs/MAESTRO-INTEGRATION.md).

## Research: actual MusicXML score-to-MIDI semantic gate (v0.10.61)

- FG-04B3b implements a bounded research MusicXML partwise event extractor with notes/rests, voices, chord grouping, explicit tie merging and stable note IDs. Projects score-derived quarter positions through the unmodified original MIDI tempo map before running strict FG-04B3a alignment; both onset and release must match.
- Add 15 unit score-parsing scenarios, 5 immutable-source/report-safety tests and an **actual 16-piece ASAP corpus CI audit**, with explicit counted refusals for unsupported engraving/repeat/grace cases or mismatches. Do not present a refusal as accuracy, or imply that approved finger numbers have been measured.
- No user-facing fingering or playback changes; no copy of third-party scores or Hand-thesia code; existing MIDI/PNG/source data untouched. [FG-04B3b methods](docs/FG-04B3B-ASAP-XML-MIDI-AUDIT.md).



## MAESTRO real MIDI archive and event audit (v0.10.60)

- Added bounded local Standard MIDI 0/1 parser and ZIP central-directory reader to verify actual MAESTRO v3.0.0 MIDI membership (1,276 entries) and compute derived measurements for the 24 MAE-02A candidates. Integrity gates include official ZIP SHA256, selected CRC32, safe paths, no duplicate matches, bounded decompression and invalid MIDI refusal.
- Measures velocity percentiles, pitch range, note density, max concurrently held notes, repeated attacks, tempo-map count and CC64/66/67 event counts, without inferring hands/fingers or altering the player. No MIDI files or licensed audio are committed or bundled. Candidate selection has **not** yet been rebalanced using measured complexity.
- Added synthetic negative/positive ZIP/MIDI regression tests and a dedicated official-dataset GitHub Action producing a metadata-only artifact. Real-data verification is claimed only upon successful CI, not from generated fixtures. All existing FG-04B3A, FG and Wait/Tempo behavior is unchanged. See [MAESTRO Integration](docs/MAESTRO-INTEGRATION.md).

## Strict source note ↔ MIDI event identity research (v0.10.59)

- FG-04B3a adds pure, bounded one-to-one alignment of canonical score playback note IDs to original MIDI notes, with correct multi-tempo tick-to-seconds conversion and fixed ±2 ms onset/release matching. Unlike nearest-note alignment, equally plausible unisons and source-identity collisions **reject the entire report**.
- Add 15 offline regression scenarios covering polyphony, repeats in source identifiers, ties, changed note endings, misplaced pitch, tempo changes, two competing MIDI notes, duplicated claims and malformed data.
- **No full MusicXML parser or ASAP corpus score↔MIDI semantic verification is asserted.** This is a component gate, not finished FG-04B3 or validated learner fingering. No production app/UI/music data assets were modified. [FG-04B3a](docs/FG-04B3A-EVENT-ALIGNMENT.md).


## Real scored repertoire research corpus (v0.10.58)

- Acquire 16 immutable, real-piano MusicXML / MIDI-score pairs from the ASAP CC BY-NC-SA 4.0 dataset, with enforced research-only licensing, verified byte counts and Git blob hashes; do not bundle the scores or distribute raw note data.
- New offline integrity and refusal tests plus a GitHub Actions research report. A readable score MIDI is **not** a verified MusicXML-MIDI note mapping and never proves finger assignment accuracy.
- Original MusicXML data, 14 owner PNG hands, playback/Wait/Tempo and manual corrections remain unchanged. The next gate is FG-04B3 exact source event alignment, then external fingering candidate adjudication. [FG-04B1b](docs/FG-04B1B-REAL-SCORE-CORPUS.md).


## MAESTRO research metadata/corpus planner (v0.10.57)

- Added an offline dependency-free MAESTRO v3.0.0 CSV validator and reproducible 24-record metadata-diverse QA candidate sampler. Official counts: 1,276 rows, 962/137/177 train/validation/test. Optional streamed ZIP SHA256 check uses Google LLC's published digest.
- The manifest records license/provenance, relative MIDI paths, composer/title, duration, split, year and validation flags. It does not download/import MIDI, profile real note events, infer fingering or expose the dataset to learners. MAESTRO is CC BY-NC-SA 4.0; research corpus only until public distribution rights and musical QA are reviewed.
- Nine local synthetic Node tests passed. Full official CSV and ZIP were not available for real-data verification; no claims of actual MIDI coverage until MAE-02B. The existing FG-04B1A v0.10.56 work is retained unchanged. See [MAESTRO integration](docs/MAESTRO-INTEGRATION.md).

## Pinned MusicXML technical corpus (v0.10.56)

- Add version-pinned, separately licensed 16-file MusicXML regression research manifest and integrity-audited download script. Never check in the third-party source scores; network failure and hash mismatch are hard errors.
- Add 8 offline tests and PR CI artifact with fixture IDs, categories, note-tag counts and SHA evidence. These are **notation-engine fixtures**, not independently fingered performances; this release makes **no** music accuracy or automatic fingering claim.
- Existing playing modes, original source notation, 14 hand PNGs and user corrections are untouched. Real 10–20-score repertoire selection and pianist-validation gate remain open. [Research scope](docs/FG-04B1A-TECHNICAL-CORPUS.md).


## FG-04B2 research-only MIDI marker alignment (v0.10.55)

- Parse bounded MIDI note on/off, normalized tempo map and finger text markers in a standalone, read-only research module. Compare annotated candidate MIDI with unchanged reference MIDI and original MusicXML identities; accept changes only to research markers and hand/channel assignment, never timing, pitch or velocity.
- Return externally generated candidate labels and explicit author conflicts; reject ambiguous unisons or source mismatch without guessing. Nine synthetic local unit cases; real Hand-thesia exports and licensed 10–20-score validation remain unverified. FG-04C/D learner auto-fingers remain NO-GO.
- The 14 user-supplied hand PNG assets, Wait/Tempo scoring, original MusicXML and manual overrides remain unchanged. See [FG-04B2](docs/FG-04B2-MIDI-ALIGNMENT.md) and [roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).


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

**FG-03B2B pianist status (updated 2026-10-12):** The project owner confirmed that the pianist **accepted FG-03B2B-2**. The underlying per-piece review worksheets were not provided; this status must not be read as validation of unimplemented anatomical joint animation or experimental automatically inferred fingers. Research-only auto fingering remains **NO-GO** for teaching. [Detailed methods, checks and exceptions](docs/FG-03B2A-SAFE-MOTION.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

## FG-03B2A hotfix: deployed version labels synchronized (v0.10.45)

**Issue reproduced:** The release displayed to users was stuck at `Standalone · v0.10.41` even though the `main` branch and GitHub Pages deployment held v0.10.44. The three outdated strings were in the **static HTML template**, not evidence that the current app executable had rolled back.

**Fix:** `src/index.html` now uses a mandatory `__PLAY_ALONG_VERSION__` placeholder for title, banner, startup score label and cache-busting query arguments on `app.js` and `app.css`. The build resolves all five occurrences from `package.json`, rejects missing/extra tokens and stale old release text, and writes the stamped `dist/index.html`. `tests/build.test.mjs` verifies the complete stamped HTML and `tests/finger-guidance.real.test.mjs` checks the actual rendered `Standalone` banner, browser tab title and `window.__playAlongVersion` in Chromium.

**FG-03B2A crossing safety fix:** The main Pages deployment exposed a real ambiguity: a two-hand, author-labelled crossing could have an unplaceable/clipped PNG sprite; the pure geometry classifier then returned false (because one of four positions was missing), allowing the other hand to display a static silhouette. The renderer now **fails closed for BOTH hands** whenever the source event and following event each contain RH and LH but any current/next sprite placement is unknown. Both hands show **fixed source-verified target-key badges**, never ambiguous motion. The real Chromium test requires the fail-closed crossing state and both markers-only plans; existing pure crossing tests remain. The release remains v0.10.45; this change adjusts only visual safety on ambiguous crossings, not MIDI scoring or original PNG assets.

**FG-03B2A diagnostic follow-up:** Browser acceptance also detected that the read-only `ghostMotion.targets` diagnostic mistakenly derived source-confirmed target keys from optional PNG placements. An off-canvas pose can be rejected even when the score still contains a trustworthy note and finger. The diagnostic now derives target keys **directly from `frame.next.notes`**; it retains valid RH/LH pitch-and-finger labels even when the visual image is suppressed. The actual keyboard marker rendering already follows that independent score-first rule.

**Verification:** Run `npm run build && npm test && npm run test:browser`; a green pull request plus a successful `main` deployment are required to consider the issue closed. A user already viewing an old browser page may need to reload the page once to fetch the new `index.html`; the new versioned asset URLs then ensure the matching JS and CSS are used. No source finger guidance, research benchmark data or original hand PNG assets were altered.

## FG-03B2B-1 — piano-range and hand-pose visibility acceptance (v0.10.46)

**User-facing corrections.** Selecting an explicitly virtual **25-, 49-, 61- or 88-key** target range and then showing the device/keyboard range no longer forces a real MIDI calibration. This remains a visual preview, **not** a statement that an actual connected keyboard was detected. The piano immediately redraws on selection so the keyboard and key-aligned falling notes share the same new geometry. When a source-verified chord includes notes outside the visible range, we continue displaying valid on-screen numeric finger badges but now refuse to display a misleading **partial** full-hand PNG pose.

**Automated evidence.** A new real Chromium test `tests/finger-guidance-ranges.real.test.mjs` covers all four virtual keyboard sizes on **desktop (1440×900) and mobile (390×844)**. It checks the exact 25/49/61/88 MIDI-key counts and boundaries; readable minimum natural-key widths and horizontal scrolling; pitch-accurate C-sharp black-key hit testing; preservation of original MusicXML-labelled future notes and hand/finger numbers; and suppressing off-screen chord hand poses. Eight screenshots and `geometry-matrix.json` are archived for review as `fg03b2b-piano-range-visual-review` in the PR GitHub Actions artifacts. This test is now mandatory in `npm run test:browser`.

**Verification (FG-03B2B-1 at release time):** `npm run build`, `npm test`, `npm run test:browser`, and standard CI benchmarks/audit. The project owner subsequently confirmed pianist acceptance of **FG-03B2B-2** on 2026-10-12; the eight-case automated viewport check by itself remains a geometry test, not the human acceptance record. No automatic generated fingering was enabled. None of the 14 supplied alpha PNGs was modified. See the [technical protocol](docs/FG-03B2B-RANGE-QA.md) and the [living roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

## FG-03C1 — canonical MusicXML note identity and source provenance (v0.10.47)

**Improvement:** Each newly imported playable MusicXML event now receives a deterministic ID based on its XML part identifier (separator-safe), unique part position in the source, expanded playback measure and individual source-note ordinal. Duplicate part IDs, simultaneous unisons in different voices and repeated playback passages cannot silently collide. Reimporting an unchanged score recreates the same note IDs. This gives the planned FG-03C2 manual finger overrides a reliable target, without changing original author-supplied finger numbers, hands or playing semantics.

**Ties:** a continued MusicXML tie still plays as one held sound, retains its original author finger and existing warnings for contradictory fingering, but now exposes all written source segments as `sourceNoteIds` alongside its originating `noteId`. An untied note has a one-element source list. Normal transposition and arrangement use copies and do not modify these source identities. Existing imported books continue to load; this release does **not** silently migrate legacy IDs or pretend to have enabled persistent per-note corrections.

**Verification:** Five new deterministic Node unit cases and extended real Chromium MusicXML acceptance cover duplicate XML part declarations, multi-voice unisons, same-score reimport, two-bar repeats, tied source lineage and preserved fingering. Run `npm run build`, `npm test`, `npm run test:browser`. Release gated on green PR checks and an actual successful Pages deployment. No original hand PNGs have changed and FG-02 automatic fingering stays disabled for learners.

**Milestone clarification:** The project owner confirmed on 2026-10-12 that the pianist **accepted FG-03B2B-2**. This acceptance is recorded as complete in the roadmap, separate from the FG-03C1 engineering tests; case-level expert evaluation files were not attached. [FG-03C1 technical contract](docs/FG-03C1-SOURCE-IDENTITY.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).

## FG-03C2A — safe user fingering edits (v0.10.48)

A source-identified MusicXML note selected in **Piano Roll** now exposes **Аппликатура этой ноты** in the Practice panel, including the **original author's finger/hand**, even if no original finger exists. Select a finger **1–5** and **LH/RH/unknown**, then **Сохранить правку**. Guidance uses the resulting *user* annotation without mutating the original MusicXML playback object, embedded sheet, imported file or original PNG hand assets. **Отменить правку** performs one-step per-note undo; **Вернуть автора** discards that note's override.

User overrides are validated and saved separately in local preferences, keyed by a stable fingerprint of the exact imported MusicXML and the original canonical note ID. The same source score can be reimported after browser reload with the corrections intact. The existing JSON backup includes the validated override map; strict import rejects invalid finger numbers, hands, malformed IDs, prototype keys or excessive records before writes. Local persistence attempts a validated storage write before updating visual state so a quota error cannot display an unsaved correction. Other MIDI tracks, original source score data and experimental automated fingering remain unchanged.

**CI:** new Node model tests and real Chromium acceptance for change/undo/reset, original immutability, newly labelled previously blank note, reload and reimport, backup export and invalid backup rejection. This is the bounded **FG-03C2A** increment, not full FG-03C2: multi-step history, exact cross-edition merging and annotated MusicXML export remain future work. [Detailed acceptance protocol](docs/FG-03C2A-MANUAL-CORRECTIONS.md) · [Living roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
## Library coverage filters and flexible accordion workspace (v0.10.49)

Each library result now includes an explicit fingering coverage status: **Есть (100%)**, **Частично (1–99%)**, **Нет (0%)**, or **Не проверено** (the file was not yet examined). In saved MusicXML, status is computed from trustworthy source finger numbers and manually confirmed user overrides on **actual playable notes** and cached as lightweight IndexedDB metadata. The cover percentage does not assume that the right/left hand is known; hand availability is tracked separately. Remote catalogs remain **Не проверено** until source files have been opened, rather than falsely claiming no fingering. Saved MIDI can be classified **Нет · MIDI** because MIDI events do not natively encode finger technique. Filter for **«Есть · все ноты»** to keep only complete scores.

The left sidebar library now supports five fully **independent collapsible and reorderable sections**, including the previously nested **Резервная копия**. Click any section heading to open/close it; drag its **⠿** handle above or below another, use **↑ / ↓** for touch, or **Alt+ArrowUp/ArrowDown** from the focused handle. The entire order and collapsed state persist across browser reloads and are part of strict-validated JSON settings backups. Search and filtering remain visible; the dedicated library workspace now uses a predictable one-column sortable stack with a scrollable bounded catalog, not a fixed two-column results panel. Native backup/restore, file import, attached folder and online tools retain their existing DOM nodes and functionality.

**Quality gate:** pure Node and real Chromium tests for coverage categorization, saved-file backfill, user-edit promotion, filters, five-section accordion, pointer drag, keyboard/touch reordering, persistence, backup controls and narrower viewport. Previous music, OSMD, security, and all research benchmark suites continue to run. No automatic fingering was enabled. [Implementation and test details](docs/LIBRARY-COVERAGE-AND-LAYOUT.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
## Quick Actions becomes sixth accordion section (v0.10.50)

The library left panel now treats **Быстрые действия** exactly like Каталог произведений, Моя коллекция, Резервная копия, Подключённая папка and Онлайн-библиотеки. Click its heading to collapse the calibration and layout-reset buttons; drag by ⠿, click ↑/↓, or use Alt + ArrowUp/ArrowDown to reorder. The two original actions remain attached to their original DOM buttons and still function when the section is reopened or repositioned.

**Migration:** An existing custom five-section order is preserved, with Quick Actions appended **open** by default. Both localStorage and old five-section JSON backup settings are accepted and converted to the new six-section schema. Once saved, all six positions and collapsed states persist in settings and backups. The old five panels' collapse flags are untouched.

**CI:** model tests verify full and legacy layouts, safe strict backup restoration and corrupted input refusal; Chromium checks collapse independence, preservation of the calibration/reset controls, moving Quick Actions on narrow screens, full reload persistence and actual old-setting startup migration. [Detailed library documentation](docs/LIBRARY-COVERAGE-AND-LAYOUT.md).
## Multi-step manual fingering Undo/Redo (v0.10.51)

The note inspector now has **Отменить правку** and **Повторить правку** buttons that operate on a full MusicXML score history, not only on the selected note. The most recent **40** successful changes can be undone; Undo can be repeated across multiple notes. Redo replays undone edits in chronological order. A new edit clears the redo branch. **Вернуть автора** remains source-safe and now participates in Undo/Redo. The inspector shows available undo/redo counts and disables unavailable controls.

Successful corrections are still stored separately from original author MusicXML; their history is **per-score and session-only**, never part of backup data. On reload/reimport the corrections remain, but history starts empty. Storage validation and write happen before history state changes; a failed write cannot produce a misleading visual correction. Full source-vs-user fingering annotations in the rendered sheet and optional corrected MusicXML export remain subsequent **FG-03C2B2** work. No experimental automatic fingering is enabled for learners. [Implementation and verification](docs/FG-03C2B1-UNDO-REDO.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
## Group fingering correction on Piano Roll (v0.10.52)

Multiple imported MusicXML notes can now be selected with **Ctrl+A (all)**, **Shift+click (range)**, **Ctrl/Cmd+click (arbitrary)**, or a **drag rectangle** in Piano Roll. Only actual note lanes start marquee selection: clicking the virtual keyboard still plays its sound. Selected notes have yellow outlines, and the right Practice inspector shows the size of the group.

The group editor defaults to **Палец: не менять** and **Рука: не менять**. Change either independently: bulk RH/LH preserves per-note original/user numbers 1–5; previously unlabelled notes retain unknown finger rather than inventing one. A finger may also be explicitly assigned to all selected notes. **Применить ко всем** is one atomic group operation and one Undo/Redo step. **Вернуть автора для выбранных** resets the group and is also undoable. Source MusicXML remains untouched; the local user edits and normal backup validation retain their provenance. Keyboard shortcuts do not hijack text inputs or unrelated library pages.

The selection belongs to the **Piano Roll editor** (not the rendered Sheet Music tab yet) and is ephemeral across score changes. Full notes beyond the viewport are selected by Ctrl+A or Shift ranges, whereas drag area uses actual visible rectangles. Existing notes, musical timing, research-only auto-fingering and all original hand PNGs are unchanged. [Engineering and acceptance protocol](docs/FG-03C2B2-MULTI-SELECT.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
## Full-score fingering editor and user-labelled Sheet Music (v0.10.53)

Play Along now has a **third independent score view — ✍ Аппликатура**. Unlike the falling-notes Piano Roll, this is a real horizontally scrollable **whole-song fingering editor**: notes are arranged by pitch and onset, with duration, effective finger number (or unknown `?`), LH/RH, and clear visual distinction between original author and user corrections. Its pinned toolbar offers Select All, Clear, zoom, optional group finger/hand assignment, apply, return-to-author, Undo and Redo. Ctrl+A selects the full work; Ctrl/Cmd-click, Shift-click and click-drag marquee work within the editor, including across different screen positions. The timeline draws only its visible viewport instead of generating a huge image of the entire piece.

Sheet Music also shows verified numeric user fingering changes by using a **temporary, strictly source-matched MusicXML clone** solely for OSMD rendering. The note-by-note source ID, part, voice, staff, pitch and tie links must all match; otherwise no annotation is applied, and the original sheet appears with a warning. User annotations are amber and a legend explicitly distinguishes them from author markings; hand-only corrections never create fictitious finger digits. The original source, backup's source files, practice timing and MIDI remain untouched.

This release does **not export modified MusicXML**, migrate corrections between revised editions or claim direct editing of OSMD sheet notes. Those are separate roadmap gates requiring expert-verified mapping and export fixtures. [Architecture and UAT](docs/FG-03C2B3-FINGERING-EDITOR.md) · [Roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
## External-fingering comparison without automatic acceptance (v0.10.54)

The dedicated ✍ Аппликатура editor adds a **collapsed research comparison panel**. Open a source MusicXML score, generate a proposed fingering externally (MasterPiano or PianoPlayer), then load the proposed **XML/MusicXML/MXL file locally** into the comparison. Play Along checks the entire score's structural equivalence apart from fingering tags and confirms note IDs, ties, pitches, onsets, durations, parts, staff and voices. It rejects ambiguous or unexpected candidates, identifies all preserved vs overwritten author fingers and newly generated suggestions, and offers a **downloadable JSON note-by-note report**.

No external provider is connected via an undocumented API. Nothing is uploaded by the Play Along comparison, and none of these machine-suggested fingers are automatically imported into learning modes or labeled author/user-approved. **100% algorithmic coverage is not proof of musical accuracy.** The FG-04B frozen/licensed repertoire comparison and independent pianist gate must be completed before an automatic-assignment preview can be considered. Previous music, hand PNGs, backups and author notation are unchanged. [Research protocol](docs/FG-04A-EXTERNAL-CANDIDATE-EVALUATION.md) · [Updated roadmap](docs/ROADMAP-FINGER-GUIDANCE.md).
