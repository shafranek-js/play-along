# Play Along — Piano Practice App (v0.10.138)

## FG-05 — Beam Search for MIDI with explicitly known hands (v0.10.138)

The three main fingering actions now appear on the same 88-key scene for both source-verified MIDI and original MusicXML: Manual, PianoMotion, and Beam Search. MIDI **does not identify physical RH/LH fingers or hands by itself**. Beam only runs after every selected piano note has an explicit hand from the original track title (strict “Right Hand” / “Left Hand” or RH/LH) or a user-confirmed per-note hand assignment. No channel/pitch/register guessing. Unlabeled MIDI shows brief same-stage instructions, does not launch any worker, and never silently assigns fingers.

The original source-validated Beam JS Web Worker, temporary candidate projection, per-note visual review, explicit Apply, atomic Undo/Redo, and the earlier MIDI → MusicXML approximate export are reused. All manual hands, author notation, underlying raw MIDI and accepted PianoMotion fingers are protected. Source note identity is verified again at the Apply boundary. This covers MIDI from “Встроенные MIDI” or any user-imported original file (within bounded source/complexity limits).

**Next remaining work:** honest automatic RH/LH inference for arbitrary unlabeled MIDI must have independently validated evidence before becoming learner-facing; do not claim arbitrary MIDI can be fingered by Beam without hand information.



## FG-06 — «Встроенные MIDI»: owner-supplied 162-file collection (v0.10.137)

Built-in source filter in the music library, with all **162 original MIDI files** from the user's supplied `midi.zip`, indexed by filename, searchable and playable without going to a separate site. Source MIDI is NOT altered, quantized, or rewritten: the packed byte payload is decompressed lazily when the user opens the first composition, SHA-256 checked per work and for the whole pack, and passed to the original MIDI parser with stable source note IDs. No automatic fingers are inferred from the file names or MIDI tracks. Undo/Redo, PianoMotion, Manual and the common 88-key scene continue to use the existing source-identity checks.

The source owner confirmed permission for public redistribution of the entire collection in the Play Along web app on October 16, 2026. Embedded composer/creator copyright metadata is left intact. The collection is not labelled public-domain or relicensed; the permission statement does not transfer ownership or rights to third parties. File download and original metadata remain verifiable in the published bundle.

CI verifies exactly 162 source SMFs, no duplicate identities, original-byte SHA-256, corruption rejection, and real Chromium open of multiple scores using just one compressed pack fetch. The overall library retains existing MAESTRO/ASAP/Mutopia sources, which stay independent.



## FG-05 — one combined PianoMotion + manual MIDI export (v0.10.136)

On the same 88-key Piano Roll, users may apply PianoMotion and **then manually replace individual fingers**, without losing already accepted algorithm assignments. The existing ↓ MusicXML exports one separate approximate score, with user digits taking priority on the exact source note, and unchanged accepted Python digits retained everywhere else. Hand-only corrections do not erase a Python number, and no pending unaccepted candidates are exported. Python and manual history remain separate and reversible.

The merged export verifies original MIDI byte identity for manual entries, source-note object identity and selection scope, full score event parity before/after adding fingering, and source-untrusted user-fingering attribution on reimport. If manually edited notes are outside the piano portion selected for PianoMotion, it refuses export rather than silently dropping them. Source MIDI bytes and active song are not modified. The result is quantized MIDI-derived notation, not expressive-timing-accurate MusicXML. Real Chromium and pure-source regressions cover combined digits and protection.

**Future library intake:** a user-designated additional MIDI collection belongs under **«Встроенные MIDI»**, not MAESTRO/ASAP research or the external online catalog. Its specific files or source URL and reuse rights have not yet been supplied; no phantom catalog entries are shipped.



## FG-05 — source-verified manual MIDI → MusicXML (v0.10.135)

The shared 88-key Piano Roll can now **download an explicitly approximate MusicXML transcription with confirmed MANUAL MIDI finger numbers**, without opening the developer editor. The button is enabled only for a real original MIDI import with saved manual finger digits; hand-only edits and unaccepted PianoMotion/Beam previews cannot enable this export. Source bytes are rechecked against the original import fingerprint at download time, and MIDI remains untouched.

The exporter builds both finger-free and corrected notation from independently cloned notes, reimports both with the current MusicXML importer and requires exact normalized playback equality before any download. It then marks the exported score as user-edited, verifies the marker and all digits after a further reimport, and refuses mismatches. MusicXML reimport must never promote these numeric annotations to original composer fingering. **The notation is quantized, not an exact transcription of expressive original MIDI timing**, and hand-only corrections are not encoded as individual-hand symbols in this version. Large, ambiguous, or unverifiable scores are rejected rather than silently truncated. Existing Python PianoMotion applied export is unchanged; simultaneous manual+Python merging is a separate follow-up.

Real Chromium regression checks same-screen download, numeric fingers, provenance, reimport and source independence alongside MIDI manual Undo/Redo, reset and fingerprint isolation.



## FG-05 — source-safe manual MIDI fingering on the 88-key Piano Roll (v0.10.134)

**Ordinary MIDI users can now choose «Вручную»**, select notes/regions on the existing 88-key roll, assign LH/RH and finger 1–5, and use the same atomic Undo/Redo and two-scope confirmed reset. MIDI and MusicXML manually edited notes use the same gesture and history pipeline. Existing author numbers are never created from MIDI pitch, track or MIDI messages.

**Source identity:** only a real MIDI imported from its intact original raw bytes (up to 4MB) may mint a stable content fingerprint `mid:<byte count>:<two independent hash words>`, distinct from `xml:` keys. MIDI note IDs must follow the importer's original `midi:<source track>:<on serial>` contract, with no duplicate IDs or invalid note pitches/onsets. The key is attached non-enumerably only on successful source import; neither display name nor library ID affects the association. Stored and backup-restored overrides require strict work-prefix/note-prefix matching, bounded values, and explicit user fingers. Reimport of identical MIDI restores hand/finger overrides; a changed MIDI cannot inherit the prior file's corrections. Original MIDI notes and bytes are never mutated by manual editing. Source notes without a verified original MIDI byte key remain non-editable rather than producing unstable fingers.

**Honest capability boundaries:** Beam Search still requires eligible original MusicXML with known hand assignments. MIDI's Python PianoMotion remains available and preserves manual overrides during its candidate eligibility checks. The new MIDI manual overrides are local/playback guidance; MIDI-manual-only MusicXML export is a separate next milestone, and the stage export button remains disabled for that unimplemented case rather than fabricating a file. Real Chromium tests exercise original MIDI parsing, manual edits, Undo/Redo, exact reimport, different-content isolation and confirm-reset with the 88-key roll staying visible.

## FG-05 — one-screen MusicXML export after fingering Apply (v0.10.133)

**User-first workflow:** the same 88-key Piano Roll now offers **«↓ MusicXML»** alongside Manual, PianoMotion, Beam Search, Review, Apply, Undo/Redo and confirmed fingering reset. Users are never required to enter the full technical editor in order to download applied fingering. The button enables only when the opened source has actual applicable saved user edits (original MusicXML, no transformed score) or source-matched already-applied PianoMotion fingers. It does NOT export pending unconfirmed candidate digits or manufacture MIDI source author annotations.

**Existing export paths, no shadow engine:** for manual / accepted Beam, the original `musicXmlCorrectedExport` structural reimport, source identity guard, atomic override layer and explicit user-fingering marker remain authoritative; for applied Python the original `pianoMotionDownloadMusicXML` validates current song and exact/aligned source note identities, retains original source MIDI, serializes a marked download, and never reclassifies generated digits as composer-authored. The common-stage button only selects the correct original export function. Marking now distinguishes MIDI-derived approximate notation from preserved MusicXML notation. The existing developer view still exposes both advanced export controls.

**Acceptance tests:** Chromium manual MusicXML edits → export → inspect provenance and changed digits, assert still on Piano Roll and original XML untouched. Genuine WebWorker Pyodide → verify & Apply on Piano Roll → export from the same stage, verify provenance and re-import roundtrip. No feature regression for author-protected fingers, source-safe Undo or 88-key geometry.

## FG-05 — keep automatic fingering review on the shared stage (v0.10.132)

**Owner rule:** an ordinary user must never navigate to the old fingering/editor view just to review and accept calculated fingers. On the full 88-key Piano Roll, **«Проверить и применить»** opens a compact in-place review panel (the score view, transport and keyboard remain unchanged). Available suggestions use a purple dashed outline; selections receive a gold frame. Click notes, Ctrl+click or drag-select proposed note blocks, or press **«Выбрать все применимые»**; mark an explicit **«Я проверил(а)…»** checkbox before **«Применить выбранные»** becomes enabled. **«Оставить без изменений»** discards only the current on-stage selection and leaves the author's and user's fingering untouched. Switching source/method drops stale selection and consent.

**One source of truth:** Beam still commits using the original `fingerBrowserAcceptSelected` handler, strict source snapshot and atomic user-override Undo/Redo; PianoMotion still commits using the original `pianoMotionReviewApply(indices)`, re-alignment, physical audit and independent MIDI/score history. Only eligible, current-song, source-matched proposals are selectable. The shared-stage Undo/Redo buttons use the correct engine history. Reset uses the pre-existing two-scope confirmation workflow as a modal **over the stage**, without switching view. The original separate advanced editor remains available solely through the developer tools, for extended operations and export.

**Verified behavior:** browser regression covers protected author notes, selection/explicit consent, Beam apply+Undo without leaving the score, zero-eligible MIDI handling, reset on the same stage and absence of silent source modification. Real Pyodide browser test accepts original PianoMotion Python candidates on the same roll before exporting through the existing full workspace. MIDI manual and Beam support are separate, still-open capabilities; this change makes no unsupported engine promises.

## FG-05 — one-click fingering workflows and developer presentation (v0.10.131)

**Ordinary workflow:** open a work, select **«✍ Аппликатура»**, then use one of three DIRECT actions: **«Вручную»**, **«PianoMotion»**, **«Beam Search»**. There is no preliminary algorithm dropdown. Either automatic button selects its original engine and immediately starts its existing calculation handler; the candidate overlay remains read-only until separately reviewed and explicitly accepted. The common stage also has **«Проверить и применить…»**, Undo/Redo and **«Сброс аппликатуры…»**, which delegates to the original two-scope confirmation dialog. Previously authored MusicXML fingers and saved user edits are NOT overwritten by calculating. Undo, original source identity, solver physical audit and source-data immutability are preserved.

**Developer presentation (local UI preference, not authentication):** in **Система → Интерфейс приложения**, enable **«Показывать инструменты разработчика»** to reveal the legacy engine selection, extra stage diagnostics and raw Beam research comparison/coverage metrics. The default learner presentation hides these controls; the regular Beam candidate review remains accessible, including its existing confirmation. The preference is stored separately in localStorage and does not grant write privileges. Returning to regular Beam calculations exits research-only independent-comparison mode.

**Documented limitations / next P0:** currently genuine Python PianoMotion supports eligible MIDI and MusicXML; manual note editing and Beam still require ORIGINAL MusicXML, with known/confirmed hand allocation for Beam. These methods are disabled for MIDI rather than fabricating author finger IDs, hand ownership or phantom Beam results. Add identity-safe manual MIDI editing and a properly validated MIDI→Beam input/hand model in dedicated future work; implement on-scene candidate selection/acceptance via existing safety gates without creating a second Apply path. No claims of professional pianist validation or licensed upstream distribution are made.

The practical browser regression exercises direct launches (including a disabled Worker), unmodified author fingers, direct safe reset, MIDI format eligibility, developer UI opt-in, single engine handlers and unchanged transport/keyboard geometry.

## FG-05 — protected automatic fingering candidate preview on shared stage (v0.10.130)

Following the three methods introduced in v0.10.129, their **eligible, unconfirmed** finger suggestions can now be displayed on the same full-width 88-key Piano Roll. A **purple dashed border** around the corresponding source note and a separate lower finger-number badge (where large enough to read) distinguish a generated proposal from an already accepted or MusicXML-authored number. Original confirmed digits retain their appearance and priority. A count and legend are shown in the method toolbar.

The **PianoMotion** preview reads only the independently audited, source-aligned eligible indices from the original genuine Python review state. **Beam Search** preview uses the existing source-note-ID validated snapshot, current constraints and user/author protection; diagnostic-only comparisons, conflicted/omitted notes and protected fingering never receive an actionable preview. Source/method changes remove the onscreen overlay without changing song data. No calculation, preview, song navigation or rendering action accepts a generated finger, seeks playback, moves a 2D hand or mutates MIDI/MusicXML.

For now, **«Проверить / применить…»** continues into the existing complete review workflow; selective acceptance directly on this shared stage is the next separate feature. The original confirmation, physical audit, Undo/Redo and export remain unchanged. New Chromium checks cover real Beam proposals, source-authored protection and method/source switching, plus the original Python/Pyodide Worker finishing a real calculation and displaying live stage previews before explicit Apply. **The v0.10.130 release is gated by PR #132's Chromium, Pyodide and MAESTRO checks.**

## FG-05 P0 — three explicit fingering methods on one live Piano Roll stage (v0.10.129)

The existing **«✍ Аппликатура»** stage overlay now has an accessible **three-way method selector**:
**Ручной**, **PianoMotion**, **Beam Search**.

- **Ручной** retains direct note/hand editing on the SAME persistent 88-key scene with L/R, 1–5, keyboard shortcuts, selected-note Undo/Redo and off-playback viewport panning/zoom. No manual controls are exposed or hotkey-activated while one of the automatic methods is selected.
- **PianoMotion** uses the **original** `pianoMotionCalculate` handler and Python Worker for the current supported MusicXML or MIDI song. Calculation is launched without navigating away from the scene. Its *actual original engine status* is mirrored in a concise on-stage status. The results are **not applied** until the user moves to the full advanced workspace and reviews/explicitly confirms a permitted selection (original physical audit, undo and MusicXML export retained).
- **Beam Search** uses the **original** `fingerCurrentCalculate` / `fingerBrowserCalculate` Web Worker flow, for original MusicXML only. The author/user anchor guards, unknown-hand refusal, anatomical/legacy comparison, exclusion of impossible islands and full user-confirmation form are retained in the advanced workspace.

Both automatic modes expose **«Рассчитать»** and **«Проверить / применить…»** on the unchanged Piano Roll, and a shared **«Все инструменты…»** link opens the corresponding original analysis/review panel. This is navigation, not a rewrite of the algorithms or their review controls. No automated suggestions are accepted by mode switches, calculation, or playback. Switching to MIDI disables the manual/Beam choices and uses the available PianoMotion method. Switching back to source MusicXML restores access to all three; changing songs clears the ephemeral pending stage status. Viewport/transport and 88-key geometry are unchanged.

The original full Fingering editor, Python and research Workers, score model, strict source identity, physical-audit safeguards, user confirmation, and separate Undo semantics are preserved. On-scene per-note **automated preview overlays and acceptance** are *not* yet implemented; explicit review remains in the advanced workspace. Real Chromium regression verifies three-way selection, delegated Worker flow, MIDI support, unchanged original XML/overrides, unchanged transport and keyboard, and no automatic acceptance.


## FG-05 P0 — independent Fingering viewport and time zoom (v0.10.128)

The already-shared 88-key Performance/Fingering Piano Roll now has an **independent time viewport** while the **«✍ Редактировать»** manual editing mode is active. Scroll over the falling-note region to pan the visible music time, with strictly bounded source duration; **Ctrl/Cmd+wheel** zooms its time axis between **2 and 24 seconds** and keeps the score time under the pointer fixed (except at finite score limits). The actual playback transport position, audio/MIDI/Wait synchronization, hand animation and fixed 88-key geometry do not move with this browsing gesture. Wheel on the physical-keyboard region remains outside the viewport handler.

The read-only timestamp **«Вид: …»** shows either following the playing cursor or a detached time position; **«К воспроизведению»** resumes follow without seeking the source. Left/right chronological source-note navigation and Auto-advance reveal offscreen selected notes in a detached view and never seek. Imported new songs reset stale detached view/zoom; these view properties are ephemeral UI state, not exported to MusicXML, and do not modify note IDs, durations, selected hands/fingers or Undo. Performance view always uses the real transport timeline.

There remain **three fingering methods**: (1) manual editing on the common scene, (2) Python PianoMotion automated inference and (3) browser FG-02I Beam Search automated inference. The latter two remain independent analysis/research engines in the existing full **«Аппликатура»** panel, opened from the common toolbar via **«PianoMotion / Beam»**; generated fingers are previews until explicitly approved. They are not silently applied and no algorithmic or source rewrite occurs in this UI release. Subsequent phases can make the automatic calculations' review tools share this same viewport. Read-only independent timeline tests plus real Chromium assert wheel pan, anchored zoom, preserved playback and piano key geometry; all existing CI gates remain required.


## FG-05 P0 — on-scene Fingering editing (v0.10.127)

The **new opt-in «✍ Редактировать»** button enables manual MusicXML fingering editing on the existing **Performance Piano Roll, fixed 88-key keyboard, hands and transport**, without replacing or remounting that canvas. The contextual toolbar appears over the scene with **LH / RH**, finger **1–5**, **0 restore author for selected notes**, Auto-advance (off by default), Undo/Redo, current selection and a link to the existing advanced **«⚙ Аппликатура»** workspace. The detailed scrollable full-score editor, the genuine Python PianoMotion, FG-02I Beam Search, physical audits, score export and confirmation workflows are **unchanged** and remain available.

The new mode reuses stable source noteIds, click/ctrl/shift/marquee selection, multi-note batched changes, content-fingerprinted persistent user overrides, one-step Undo, and the actual source note durations; the original score and source pitches never mutate. Shortcuts are active **only** during this Fingering mode: **1–5** finger, **L/R** hand, **0** clear selected user corrections, **←/→** chronological note navigation, **Ctrl/Cmd+Z / Ctrl/Cmd+Y** Undo/Redo; input fields, dialogs and competing shortcuts are protected. Auto-advance acts after finger assignment for one selected note, and re-confirming an identical finger navigates without adding a history entry. Labels on the shared falling notes now reflect accepted/saved user fingers and hidden source-author finger masks rather than stale source note data. Switching modes leaves playhead position, Canvas geometry, note IDs and Undo state intact. Fingering mode currently targets **original MusicXML**; MIDI and other formats still use PianoMotion in the advanced workspace until the subsequent source-identity phase.

This is **phase one** of the shared-workspace plan. Independent editing-view time, wheel-based navigation/zoom and full MIDI manual editing are future phases, not asserted as implemented. Real Chromium tests verify single shared DOM Canvas, source-safe keyboard/toolbar assignments, Auto-advance, group history, unchanged transport, preserved advanced research and mode handoff.


## Full fingering reset without changing original MusicXML (v0.10.126)

The MusicXML Fingering editor's **«Сброс аппликатуры»** now opens one accessible confirmation dialog with two independently chosen scopes:

- **Только пользовательская аппликатура** — removes all previously confirmed numeric user fingers in the current work, preserving explicit RH/LH hand-only choices and any author fingering that has not previously been hidden.
- **Вся аппликатура, включая авторскую** — also hides all currently imported MusicXML author fingers from the editable score, learner fingering hints, Beam Search input and the displayed OSMD score copy, using a persistent, source-keyed `suppressAuthor:true` author-mask for exactly those source note identities.

Nothing rewrites the original MusicXML, tie/timing/pitch data or other scores. Author masks and saved user fingers are validated through the same strict localStorage/backup guard, committed atomically in **one Undo/Redo step**, and survive browser reloads. Replacement user fingers can be reviewed and confirmed in normal Beam mode; author masks persist to avoid reviving old written numbers. `Вернуть автора (выбранные)` continues to restore original author fingerings explicitly for chosen source notes. A stale modal or changed score blocks reset. Diagnostic-only comparison remains read-only.

The printed score is rendered from a verified detached XML clone: only `<fingering>` children are hidden while other score elements are untouched. The original score remains intact and author numbers can always be restored by Undo before reloading or by explicitly restoring selected notes afterward.

QA: strict mask persistence and hostile backup rejection, reset/Undo/Redo state equality, original music unchanged, real Chromium user-only scope and full mask scope, reload, renewed Beam suggestions and explicit application on previously authored notes.


## FG-03C2 — one-click undoable score fingering reset (v0.10.125)

The original MusicXML Fingering editor now offers a distinct **«Сброс аппликатуры»** button beside **«Вернуть автора (выбранные)»**. The new action targets all saved user **finger numbers in the current score** without needing a selection. Existing selected-note restore remains untouched. With zero saved finger numbers, Reset is disabled; a count-based native confirmation ensures Cancel makes no changes.

On confirmation, all affected fingers are cleared atomically via the existing batch and single-step Undo/Redo mechanism. Any user-selected LH/RH hand is retained as a hand-only override (finger null). Original MusicXML, authored fingering, other scores, note event timing and pitches remain unchanged; a fresh Beam run can propose fingers again. No silent auto-acceptance. The Worker preview is invalidated after reset.

Node and real Chromium QA cover the four-note accepted-fingers scenario, Cancel, Confirm, no source edits, preserved hand ownership, regenerated suggestions, and one-step Undo.


## FG-02I — safe model comparison after applying fingers (v0.10.124)

After accepting a Beam Search batch into **user overrides**, its fingers become user-locked anchors for future research calculations; consequently the Anatomical model may legitimately report 0 *new* suggestions, whereas Legacy may refuse a conflicting set under `AUTHOR_PHYSICAL_CONFLICT` due to **different reach thresholds**. The original XML and existing saved overrides are not damaged.

The research panel now explicitly displays previously saved user fingers, original author annotations and the number of effective solver anchors. A new **opt-in, read-only** checkbox ("compare Legacy and Anatomical without my saved fingers") lets the user rerun both solvers without user-confirmed finger anchors, while retaining original author MusicXML fingering restrictions and the user's explicit hand choices. The source document and all saved override objects are untouched. **No editable, applicable candidate preview is created in comparison mode:** purple editable suggestions, confirmation and Apply stay disabled. Returning to normal mode requires a fresh calculation, which again honors every saved user finger and every author annotation.

This mode is for evaluating baseline algorithm differences, not changing the active fingering, determining pianist correctness or editing source notes. The previously implemented source-ID validation, notes-for-manual-review exclusions and independent physical audit remain unchanged. Node and real Chromium regression verify saved proposals, repeat calculation, independent read-only recomparison, strict no-apply, unchanged overrides and Undo.


## FG-02I Adaptive Beam Recovery (v0.10.123)

The Legacy and Anatomical JavaScript Beam Search research models now attempt each polyphonic/chord island at normal **beam width 40**. Only when that local island returns `NO_VALID_PATH`, FG-02I retries **the same island** at widths 80 and 128 (in that order); retries stop immediately on success or a different error. Finger order, pair-specific reach, hand size, all physical constraints, source identities, author/user finger anchors, tempo and MusicXML are unchanged. Monophonic passages, successful 40-width chords, ambiguous hand ownership, six simultaneously held piano keys, and other structural errors never trigger additional search. The two models remain independent.

Successful expanded-width segments are included in the ordinary independent physical audit and source-identity review, and the UI reports recovered-island and note counts **separately for each model**. When 128 still fails, the entire source-identified connected island continues to be excluded only from temporary research inference and is shown for manual review. The full adaptive attempt sequence 40 → 80 → 128 is explicitly reported on that refusal. No prior successful prediction is automatically confirmed. The result is not pianist-validated.

Tests: baseline 40-width exact-equivalence, no-source-change protected exclusions, explicit width-80 calling behavior, and actual Chromium MusicXML review, in addition to all pinned real Pyodide/PianoMotion/MAESTRO release checks. The owner-provided Bach MXL is retained privately and is not redistributed in the repository. Any improved note coverage must be measured separately, rather than assumed merely from a wider search.


## FG-02I — auditable research Beam Search failure evidence (v0.10.122)

Each local FG-02B Beam model now records the **first search group where its finite beam becomes empty** and bounded counts of rejected candidate states: hand span/finger order, lack of free fingers, rapid finger reuse, and held-key hand relocation. This is algorithmic diagnostic evidence, **not** a conclusion that any passage is physically impossible for a pianist. The existing reach thresholds, optimizer, beamWidth and musical note data remain unchanged.

The source-safe partial-island workflow carries a separate refusal trace per legacy/anatomical model. The Fingering editor now reports actual model coverage (eligible source notes / all original imported notes), lists each model's problematic islands and shows the first failed chord pitch/time plus leading rejected-constraint types. Notes excluded for overlapping unisons or for difficult islands are never given automatic candidates; manual edits, source-snapshot validation, author fingering, Undo and the original MusicXML remain unchanged. Missing coverage metadata in older test-worker responses is handled safely.

Validation uses a synthetic unplayable-under-heuristic B3–F5 held chord and real Chromium MusicXML review. The user's original 37-measure Bach MXL is not redistributed in this repository. Structural diagnostics from that local MXL: 445 imported score notes, three overlapping same-pitch reattacks, and a maximum eight-note connected RH island after unison screening. These figures are *pre-solver*, not proof of final application coverage.


## FG-02I — source-safe partial Beam Search recovery from NO_VALID_PATH (v0.10.121)

When the research-only JavaScript Beam Search cannot find a permitted physical fingering for a **single connected chord/held-note island**, it previously rejected the entire MusicXML piece. Now each model first runs the unchanged full-score FG-02I solver. For a recoverable isolated `NO_VALID_PATH` or `TOO_MANY_SIMULTANEOUS_KEYS` with exact source note IDs, it removes **only the whole refused island from temporary research input**, retries the original solver, and keeps the refused notes **unaltered in the actual score** for explicit manual review. Non-isolatable errors, contradictory authored annotations, cross-hand same-key co-onsets, invalid input, audit violations and missing source IDs still fail closed. No span thresholds or original MIDI/MusicXML onsets, durations, pitches, voices, ties or author/user numbers are changed.

Both normal (legacy) and anatomical models report their **own** physical abstentions. UI shows original / unison-cleared / manually reviewed counts, exact original note locations (measure, staff, voice, pitch/time where available), and lists eligible source-ID-based suggestions only. The anatomical model remains the default preview if successful; otherwise the successful legacy one. User selection/confirmation, source snapshot invalidation and Undo still protect commits. Research results are not expert-validated or automatically applied to practice. Testing: pure recovery cases with an unsolvable B3–F5 held chord, pinned browser multi-voice and difficult-chord MusicXML test, full PR suite + real Pyodide verification. User-supplied Bach MXL stays outside the repository.


## LAUNCH-06 — Beam Search polyphonic unison review (v0.10.120)

The local JavaScript FG-02I / FG-02B Beam Search is independent of PianoMotion and previously rejected the entire score when a voice re-attacked a still-sounding MIDI pitch. A separate *research-only* score screening now excludes **only later, distinct-onset same-key re-articulations from the temporary Beam Search input**, while leaving source MusicXML, all note identities, written voices, durations and author/user fingering untouched. Same-onset same-hand unisons are still treated as one physical key; ambiguous same-onset *cross-hand* unisons fail closed. The existing solver, its hard physical checks and both cost models are unchanged.

The preview reports full, eligible and manually reviewed note counts, offers candidates only for eligible original note IDs, lists excluded notes by pitch/seconds/staff/voice, and never auto-applies a finger. User confirmation, source fingerprint invalidation, manual editing and Undo remain mandatory. When both Beam models refuse a passage for other physical reasons, the UI now reports each refusal instead of displaying a false success. Tested with synthetic multivoice MusicXML and dedicated source-preserving unit and Chromium checks. The user-provided Bach MXL is not committed or redistributed. Pianist validation is not claimed.


## LAUNCH-06 — source-safe overlapping-unison MusicXML fingering recovery (v0.10.119)

In polyphonic original MusicXML, distinct voices can sustain and re-attack the **same pitch** before its first note ends. Exporting these overlapping note-ons to one MIDI channel cannot preserve their identity; the original PianoMotion Python normalizer truncates same-pitch overlapping notes even across channels. The production calculation therefore uses a **MusicXML-only explicit partial calculation**: leave every score note, voice, author finger and duration completely unchanged; omit only the later overlapping same-pitch event from temporary solver MIDI; run the genuine original Python on the unambiguous remainder. Show the precise omission count and require users to assign fingers manually to omitted notes in the score editor. Review/Apply/Undo/Redo/MusicXML export validate the solver's exact source-note whitelist so suggestions can never attach to omitted or changed notes. Ambiguous same-onset duplicate notes remain blocked rather than guessed. For non-MusicXML inputs the previous strict rejection is preserved. Example from customer-submitted Air on the G String MXL: 445 playable score notes, 3 distinct-time overlapping unisons, 442 eligible solver notes (the original score file is never redistributed in the repository). Regression: pure adapter/source-selection unit tests and real Chromium multi-voice fingering review, plus existing real Pyodide and source-safe export suites.


## LAUNCH-06 — Responsive real-Pyodide CI correction (v0.10.118)

The genuine Chromium + pinned Pyodide/Python worker end-to-end now selects the **visible** Fingering navigation control: desktop tab on wide screens, or the compact score-view dropdown on narrow screens. This corrects a test-only timeout exposed on GitHub's default Chromium viewport after moving the original calculation panel; musical source, engine, UI and output are unchanged. The dedicated real-browser Python workflow also runs on pertinent pull requests before merge (not only after merging to `main`). Acceptance requires `LAUNCH01_REAL_BROWSER_PYODIDE_PASS`, source-note preservation, and protected MusicXML export/reimport; regular PR CI alone is not evidence of real Pyodide execution.

## LAUNCH-06 — Pyodide QA navigation alignment (v0.10.118)

The real Playwright/Pyodide worker end-to-end regression opens the central **Аппликатура** view before pressing its single visible PianoMotion calculation button. This matches the v0.10.118 relocation from the Practice sidebar. All assertions remain unchanged: real pinned Pyodide+Python worker, protected apply, source-note preservation, MusicXML export and score re-import. This is a test-only alignment; no production source, algorithm, or release version change.

## LAUNCH-06 — Unified Fingering Workspace (v0.10.118)

The **Аппликатура** score view is now the single place for fingering calculation and reviewing proposals. The existing production PianoMotion Python calculate/review/apply/Undo/Redo/MusicXML export panel is moved from the right Practice sidebar to the central Fingering view **without cloning its algorithm or handlers**. The workspace detects the loaded source format and displays only eligible actions: MIDI and other supported note streams offer protected PianoMotion proposals/review/export; original MusicXML additionally offers manual author-fingering editing, Beam Search research/compare and correction transfer, all with existing safeguards. A separate original-MIDI-only experimental feature (available only to approved local research builds) is relocated under a collapsed research disclosure in the same view; it never claims to apply pedagogical fingering. Original source notes, source-authored fingerings, physical audit, selected apply and Undo/Redo remain unchanged. Browser regression: `tests/unified-fingering-workspace.real.test.mjs` plus existing real Python/Pyodide/MusicXML tests.


## LAUNCH-05 — adjustable Piano Roll grid/lane visibility (v0.10.117)

The Practice settings now include **«Видимость сетки и дорожек» (0–100%, default 50%)**. The slider changes the drawing opacity of piano-roll background white/black pitch lanes, lane borders, horizontal second guides, labels and the strike guide line as one isolated Canvas layer. At 0%, the falling-note area has a uniform dark `#111720` background; at 100%, its grid matches the legacy rendering. Falling MIDI note blocks, loop/wait overlays, physical 88-key keyboard and animated hand/finger guidance retain their original opacity. Rendering updates immediately; a validated global preference is saved to localStorage and supported by existing backup and upgrade handling. Browser regression `tests/piano-roll-grid-opacity.real.test.mjs` samples real Chromium Canvas pixels and verifies saved value, 50% migration, normal 88-key display and invalid-value rejection.


## LAUNCH-04 — Compact Workspace (v0.10.116)

The former full-width 78px song information header is **removed** from Practice. The 88-key Piano Roll now fills the entire height between the topbar and playback transport, including formerly unused vertical space, while preserving the exact 5.5:1 natural-key proportions. On the topbar: Piano Roll / Sheet Music / Fingering view buttons (compact view selector on narrow windows), a single **Компоновка** dropdown (Изучение / Игра / Анализ), and a **Руки** popup containing the original hand/finger mode and lookahead controls. The 26px bottom status bar now contains the work title as a clickable metadata panel (source, author and track count); other live status indicators remain. Focus, hybrid docking, mobile, Library/Progress and keyboard reachability remain supported. All controls retain original IDs, MIDI events and fingering calculations are unchanged.

Chromium integration coverage: `tests/compact-workspace.real.test.mjs`; legacy tests are adapted to open the new dropdown before selecting hidden choices.


## LAUNCH-03 — minimal bottom status bar (v0.10.115)

An always-on **26px bottom status line**, below the transport, consolidates practice mode (`MIDI · Слушать / Wait / Tempo`), permanent piano coverage (`88 клавиш · A0–C8 · активны 25` for a 25-key range, up to 88), live MIDI readiness, current finger-guidance status, transient notifications, and sounding-note count. The cluttered keyboard information row is removed; the actual finger-guidance selectors remain in the center header. The duplicate A0–C8 header chip is hidden. Information-only notices no longer cover the Piano Roll. Practice, focus, drawers, Library and Progress each reserve space for the fixed status bar, so the 88-key piano retains exact proportional geometry above transport. No changes to MIDI events or fingering calculations. Responsive status trims secondary details rather than shrinking the piano.


## LAUNCH-02 — hybrid side panels (v0.10.114)

Practice now supports independently closable, pinnable Library and Tools drawers. A pinned panel docks and shrinks the 88-key Piano Roll only when at least 700–820 px remain for the center; when the window becomes narrower, that panel automatically floats over the roll without changing its stored pin preference. A floating drawer spans the full available height (down to the transport), remains above the 88-key keyboard, and closes with its × button, Escape or by clicking the dimmed backdrop. Resize pinned panels by dragging their existing divider; open/closed status, pin preference and sizes persist. Shift+L/R toggle the drawers, and F enters keyboard-first focus mode. Docked panels never sit under the fixed roll; closed panels restore a window-wide A0–C8 piano. In Library/Progress full-page workspaces, the original full-width layouts remain unchanged. No changes to MIDI note events or audio/fingering interpretation.


## LAUNCH-02 — full-window 88-key proportional piano and reachable MIDI range (v0.10.113)

**Mandatory A0–C8 (MIDI 21–108), all 88 keys:** the Play Along live Piano Roll now occupies a window-wide lower band above the transport, regardless of sidebar visibility. All 52 naturals and 36 accidentals are kept in the Canvas and the score lanes, with no horizontal scrolling. White keys retain **5.5:1 height/width**, black keys retain **0.61 white-key width**, and both dimensions derive from the same 52-white-key viewport-width scaling factor, including responsive desktop/mobile resizes. Neither device calibration nor an individual piece can crop the physical piano. The former visible-range dropdown is replaced with a brief explanatory label, while the previously saved setting remains backward-compatible.

**Small physical controller support:** current calibrated MIDI controller range, or explicitly selected 25/37/49/61/76/88-key preview, is highlighted as the only interactive region of the virtual piano. Keys outside that range are visibly **darkened** (both naturals and accidentals), cannot be clicked, and do not show false played-key highlights. The entire 88-key outline and any genuine score notes remain visible; this does **not** silence out-of-range note audio, delete source MIDI, alter the adaptation/transpose algorithm, or silently remap physical MIDI events. If controller endpoints are unknown, all 88 keys are active until calibrated or a preview range is chosen.

**Verification:** updated production Chromium range matrix for all six controller sizes at desktop and mobile widths, source finger identity, key count, edge-to-edge Canvas, invariant white-key aspect ratio, absence of horizontal scrolling, black-key priority, disabled-key hit-tests and sampled Canvas lightness. Existing real controller and other browser QA still required; 88 keys at small phone widths are correspondingly small to preserve accurate proportions. Extremal ultra-wide/short windows may have insufficient height for the full note-fall area, but the keyboard is never stretched out of ratio.

## LAUNCH-02 — continuous hand silhouettes during solo rests and adjacent chords (v0.10.112)

**Listen, source-annotated notes only:** after a verified single-hand note releases and before its next score NoteOn, the *same* right/left hand remains visible in its existing original `rest` PNG, even when the other hand is never used. The program **does not fabricate the missing second hand** and does not assign anatomy to ordinary unannotated MIDI. This extends v0.10.111's two-hand resting support to solo pieces.

**Nearby active-to-active transitions:** changing two adjacent, sourced hand positions without an intervening rest may show a strictly cosmetic **120 ms** faint outgoing PNG silhouette (alpha ≤ 0.12), smoothly interpolated to the newly played location. The new actual source pitch/finger PNG is displayed at its *correct exact location and full alpha .87 immediately at NoteOn*; the prior PNG is a non-actionable motion trace, not an additional key press. Jumps greater than 1.25 hand widths, large vertical shifts, a different hand, untrusted or incomplete positions, reduced-motion, and Wait do **not** animate active-to-active motion. Explicit Seek, loop wrap, resizing, toggling mode or loss of score provenance continue to reset.

**Verification:** Node unit checks cover exact onsets, bounded motion, alpha, immutable coordinates, and disallowed cases. Production Chromium tests verify original single-hand `rest` PNG during a real musical silence, source-accurate active-to-active hand sprites during natural playback, seek reset and no images for unlabeled MIDI. The original 14 PNG binaries, score timing, finger provenance, Wait scoring and audio remain untouched. Not anatomical finger-joint animation and not physical MIDI hardware UAT.

## LAUNCH-02 — smooth passive/playing hand PNG transitions (v0.10.111)

**200 ms eased visual crossfade** between original `rest` PNG and a score-confirmed active hand PNG. The two hands have independent short-lived transition states. The old and new PNG are drawn at smoothly interpolated wrist positions while opacity changes, preserving each image's native aspect ratio. A released key immediately stops being a score/keyboard contact at **NoteOff**; only a faint, decaying visual trace (alpha ≤ 0.18) can remain for at most 200 ms. On **NoteOn**, the active PNG appears immediately at visible alpha while the previous `rest` fades. Key target/finger badges are always instantaneous and authoritative, especially in **Wait**; wrong notes never advance its target.

**Safety and usability:** no claimed articulation of static PNG finger joints, no invented transitions between arbitrary active finger poses, no guessed fingers/hands for unknown MIDI. Pending transitions reset on Seek, Pause/Play state changes, score replacement, resized keyboard, mode/track/loop changes, tab-throttling jumps and reduced-motion preference. Ghost preview remains independent and only appears under its own existing rules. Existing 14 user originals and source-note timing remain untouched.

**Verification:** Node easing/pose-switch/immutability tests and a real Chromium Canvas interception check of original PNG fading while live score time crosses NoteOff and NoteOn, plus Wait target accuracy, explicit Seek reset and reduced-motion mode. Hardware MIDI/physical pianist validation are not claimed.

## LAUNCH-02 — visibly resting idle piano hand (v0.10.110)

**Reused both existing original transparent PNG assets** (`src/assets/finger-guidance/poses/left/left-rest.png` and `right/right-rest.png`): previously the sprite placement logic returned `null` when a hand had zero currently assigned notes, so the unused `rest` pose could never appear. When a source-bound **two-hand** piece has playable/expected notes for only one hand in the current Listen or Wait frame, the other is now drawn in its actual original `rest` PNG, visibly hovering rather than claiming to press a keyboard key. On the next phrase they switch naturally. The existing hands/ghost modes respect the setting; numbers/off mode and single-hand or unknown-hand MIDI never fabricate an idle hand.

**Position stays stable during each silent phrase:** for the idle hand, position follows its last score-verified or explicitly user-applied note; if it has never played, use its first upcoming known note. Do not guess an offscreen wrist, infer which hand from note pitch, or change source timestamps. Resting sprites stay inside the piano viewport and are drawn beneath active hand poses. This does not implement articulated finger movement or imply pedagogical approval.

**Regression:** pure Node test verifies first upcoming anchor, last played position, stable rests, loop isolation and one-hand/no-provenance refusals. New genuine production Chromium test checks both real rest PNG `drawImage` invocations, stable positions, Listen physical playing/idle inversion, Wait chord completion with the other hand resting, and absence of an invented second hand in single-hand works. Existing 14 PNG binary-preservation audit and all music/audio/browser tests remain required; physical piano/controller evaluation is separate.

## LAUNCH-02 — distinct hand guidance in Listen vs Wait (v0.10.109)

**Requested behavior:** with hand/finger guidance enabled, **Listen** depicts hands on notes that are *physically depressed by the original score at the current playback time*, including simultaneously held notes from earlier and later onsets; it stops showing a pressed finger at physical NoteOff, even if CC64 pedal sustains the audible tail. This fixes the former Listen behavior that pointed to the *next* note as soon as its onset was upcoming, incorrectly removing an actually held hand pose. During rests the active hand/key-contact overlay is cleared. Optional **Ghost** lookahead is visibly translucent and separate from the active fingers; it never advances the actual score or pretends an upcoming note is already pressed.

**Wait** remains instructional: while the current practice note/chord is unfinished, only keys the learner still needs to press are targeted. Wrong MIDI notes do not move the hand hint; partially completed chords retain the remaining required keys, and the hint moves to the next task after the final correct NoteOn. Original authored or explicitly user-applied hand/finger assignments are used when available; for unannotated MIDI the required key is marked with a neutral **?** rather than inventing a hand/finger. Selecting the existing `Руки` or `Опережение` guidance mode enables the hand PNGs (an explicit `Выкл` preference remains respected).

**Implementation:** pure `fingerGuidancePlayingFrame()` separates actual physical note contacts from upcoming groups. The existing Wait/Tempo scoring semantics, original source note timings, audio engine, piano key geometry, and all fourteen original transparent PNG hand assets remain unchanged. The sprites are still static PNG pose translations, **not physically joint-articulated real 3D hands**. Node tests and a new actual-production Chromium flow check Listen held keys/rests, Wait wrong-key/chord progress, and missing finger metadata; the full preexisting regression suite and deployment gate remain mandatory.

## LAUNCH-02 — source-protecting fingering review (v0.10.108)

**Improve the existing PianoMotion suggestion review, not the Python algorithm:** the preview now gives a whole-score count of *eligible* notes, original author/manual **protected** notes, **physical conflicts** rejected by the independent audit, **unresolved** suggestions without an assigned finger, and **already applied** notes. These statuses are explicit on each preview row. Unavailable notes have disabled checkboxes, muted note blocks and explanatory tooltips; they cannot be selected from the canvas either. No expert pianist approval is implied.

**Review actions are honest:** “Выбрать применимые” selects eligible proposals across *all* pages (not only the 24 visible notes); “Применить все доступные” applies the same safe subset. The existing per-note selection and “Применить выбранные” remain. After application, the applied notes are clearly marked and no longer offered for duplicate application; Undo makes their proposals eligible again. Both the UI and the atomic batch validator use the same source-bound eligibility function, while the batch validator retains its independent fresh-state check. Manual and author fingering, original MIDI pitches/timing, raw MusicXML and PNG hands are never overwritten by this UI.

**QA:** pure Node tests compare entire-score eligible selection with actual batch patches, all five eligibility categories, Undo and source invariance. A new real production Chromium test uses a deterministic fake Python Worker to exercise a 5-note MIDI source with overlapping conflicting fingers, protected author marking, unresolved note, safe selection, one-note Apply, Undo/Redo, and original note/event timing unchanged. The existing full browser matrix, physical audit, 547-note Apply/Export/reimport and genuine Python/Pyodide gates remain required. **No claim of piano-technique validation or actual keyboard testing.**

## LAUNCH-01 F2 — MIDI source ownership and All Notes Off (v0.10.107)

**Fixed simultaneous USB and virtual-key interaction:** the aggregate pressed-key display previously conflated MIDI and the on-screen piano. A MIDI device disconnect would synthesize NoteOffs for *all* highlighted keys, incorrectly releasing mouse-held notes. Physical and virtual input now each own their own held pitches. Repeated NoteOn from one source stays de-duplicated; if both sources hold the same pitch, one source releasing it cannot stop the other source's note or corrupt the practice score.

**Fixed CC123 / CC120 / channel-mode All Notes Off:** a hardware MIDI reset may never send individual NoteOffs, which previously left Wait frozen on apparently still-held physical notes. Controller resets now clear physical MIDI key ownership through the normal practice-release path and unblock Wait. The existing live instrument engine routes incoming channels to its single live channel, so these reset commands apply to the selected **USB input**, not a fictitious independent per-channel synthesizer. If an on-screen key remains held, controller reset/pedal-up is sent without All Sound Off silencing that virtual note. Device disconnect also releases MIDI-owned controller states without cancelling virtual-key presses. Original source files and audio/score timing are unchanged.

**Regression:** expanded real-app Chromium `tests/launch01-midi-hotplug.real.test.mjs` covers duplicate-pitch ownership, physical NoteOff, MIDI CC123, mode switch, USB unplug with a held virtual note, and Wait recovery/next-note acceptance after CC123. The existing F2 unplug/reconnect checks remain. Hardware MicroLab mk3, actual pedals, multi-channel live instruments and acoustic speaker output have not been physically tested.

## LAUNCH-01 F2 — sustain-aware playback key highlights (v0.10.106)

**Fixed a visual/audio discrepancy, not source MIDI:** prior playback key highlights ended at the physical note's `NoteOff` even when channel sustain `CC64 >= 64` was holding the note audibly. A bounded channel-specific pass now derives the *visual-only* release instant from the original ordered MIDI CC64/NoteOff timeline, including pedal-up, controller resets, seek into an already pedaled note and bounded loop/song ending. Original NoteOn/NoteOff timestamps, source note IDs, PCM scheduling, score annotations and audio bank data remain untouched. Pedal-down **after** a NoteOff never resurrects that note, and CC64 for one channel never extends another channel's key highlight.

A new actual production Chromium test (`tests/launch01-sustain-visual.real.test.mjs`) checks highlighted notes after their NoteOff while CC64 remains down, channel isolation, seek into the sustained tail, pedal-up extinction and unchanged source score/audio events. It joins `npm run test:browser`. The companion existing `tests/practice-transport.real.test.mjs` continues to verify *audible PCM* sustain/seek/loop behavior; a highlighted key is not a measurement of final acoustic sample decay. Tests are simulated controls only; **no actual physical pedal, USB controller or speakers were used**.

## LAUNCH-01 F2 — MIDI hotplug and Wait recovery (v0.10.105)

**Fixed:** when a MIDI controller is unplugged or the selected input is switched while a note is held, the browser often receives no matching NoteOff. Play Along now finalizes those held keys through its ordinary release pathway before detaching the port; PracticeSession's played-note state and the Wait-release latch cannot remain stuck on the old device. The practice transport stays active and accepts the next note when another keyboard reconnects.

**Automated coverage:** `tests/launch01-midi-hotplug.real.test.mjs` uses the production Chromium app with a simulated Web MIDI permission/port, an actual Wait session, a missing NoteOff during USB disconnect, new-port reconnection and explicit input switching. It asserts the played-note map clears and Wait progresses instead of hiding phantom pressed keys. Included in `npm run test:browser`. This verifies browser logic **only**, not physical MicroLab mk3 electrical/USB behavior, audible speakers, pedal hardware, Safari, or real device latency; those remain F2 UAT work.

## Current owner decision — deferred F0, continue functional development (2026-10-14)

The project owner has **deferred the unresolved upstream Hand-thesia/PianoMotion source-rights decision to the final release**. No new licensing research or replacement effort is scheduled in the current development sprint. This is a priority change **only**: rights are **not cleared** and public GitHub Pages/public beta distributions still require consideration of third-party permissions. Engineering continues with LAUNCH-01 F2 transport, Wait/Seek/Loop, pedal/MIDI controller/audio QA, then LAUNCH-02/03 usability and source-safe fingering. The final release requires an explicit upstream grant, compatible license, cleared replacement, or adjusted distribution. See [current launch policy](docs/LAUNCH-READINESS.md). This owner's F0 decision remains unchanged in v0.10.108; F2 repairs and LAUNCH-02 review UX remain separate engineering changes.

## LAUNCH-01 — real MXL corruption refusal and 1,050-note multi-track MIDI stress (v0.10.104)

**Fixed MXL ZIP source-integrity checks.** The browser archive importer now validates ZIP central/local record consistency, size and directory bounds, declared uncompressed byte counts, unique safe filenames, supportable single-disk/non-encrypted methods, UTF-8, and a real `META-INF/container.xml` rootfile reference; it never silently falls back to unrelated XML when the declared rootfile is missing. Original 15 MiB decompressed and 16 MiB archive size caps are retained. No note pitches, note starts/releases, MusicXML fingering provenance or audio are changed by this fix.

**Real Chromium QA passed** for actual production readers: native MXL stored/Deflate formats open equivalently to MusicXML; **9/9 malformed/hostile MXL variations are refused**; a generated **3-track, 1,050-note** MIDI imports with **2,100 audio NoteOn/NoteOff events**, and **5/5 corrupt/unsupported MIDI** cases are refused. Failed imports leave the current song untouched. [Reproduction/negative cases](docs/LAUNCH-01-MXL-MIDI-BOUNDARIES.md) · [successful browser run](https://github.com/shafranek-js/play-along/actions/runs/38620666234). The regression is included in `npm run test:browser` and the separate PianoMotion Chromium Actions job; no copyrighted scores or MIDI sources are bundled as fixtures.

**Parallel launch blocker F0:** a source-rights audit confirmed that [V9011N/pygame-piano-animator](https://github.com/V9011N/pygame-piano-animator)'s pinned revision declares no identifiable public redistribution license, and GitHub metadata reports `license: null`. Since Play Along's build copies its PianoMotion/Hand-thesia-derived Python sources to the public bundle, **owner permission to integrate PianoMotion alone is not sufficient to declare upstream redistribution rights cleared**. [Rights evidence and required decisions](docs/LAUNCH-01-UPSTREAM-LICENSE-AUDIT.md). This is an unresolved launch gate, not a claim of legal prohibition or a substitution for professional advice.

**Next LAUNCH-01:** real transport Wait/Seek/Loop/pedal and MIDI-controller/audio tests plus broader real-source corruption/large-file checks. Experts are not required for an honest beta; clear rights and reliable core playback are. The Hand-thesia research estimate remains 35%, distinct from beta readiness.

## LAUNCH-01 — actual browser Pyodide, Apply, MusicXML export and network recovery (v0.10.103)

**A full real-browser Python test has now passed.** Chromium imported a temporary, authentic SHA-verified, finger-free **22-note Au clair de la lune** MIDI from Piano Protege Curriculum (CC BY-SA 4.0); loaded the **actual shipped PianoMotion module Worker**, downloaded pinned **Pyodide 314.0.7** and Python packages, executed the **original Python `analyze_midi`** without mocking the Worker, source-aligned all 22 notes, and applied **22 suggestions explicitly by user action**. The app preserved **all original note identities, pitches, starts, physical releases**. A real MusicXML download and reimport reproduced **22 notes with 22 generated finger annotations tagged as unverified user output**, never forged author labels. The independent structural conflict check found zero hard conflicts in this particular piece; this is NOT a musician's quality judgment.

**Actual offline-network failure test:** a real Chromium Worker attempted to fetch pinned `pyodide.mjs` and its CDN response was deliberately blocked; the app now reports `PYODIDE_RUNTIME_DOWNLOAD_FAILED` with an actionable connection/retry explanation, keeps Apply and Export disabled, leaves MIDI untouched and allows Calculate to be retried. This test **does not** replace the separate successful online test with a synthetic result. Both passed on the same commit in [genuine browser Pyodide CI](https://github.com/shafranek-js/play-along/actions/runs/38617719233).

**Reproduce:** `npm ci`, `npx playwright install --with-deps chromium`, `npm run build`, then `npm run test:pyodide:live`. Test output exposes only source SHA-256, note totals, worker provenance and safety status, not third-party score notes, MIDI or author fingering. The test runs separately from the ordinary release pipeline because genuine Python runtime/wheel downloading is expensive. Details: [LAUNCH-01 genuine Python UAT](docs/LAUNCH-01-PYODIDE-LIVE-UAT.md), checked [aggregate JSON](research/launch01-real-pyodide-browser-2026-10-14.json) and both [browser test files](tests/launch01-pyodide-real-browser.real.test.mjs).

**Important launch limits:** this is **one real 22-note song**, not a test of the user's uploaded MIDI or every score style. It does not validate a physical MIDI keyboard, audible audio, Wait/Seek/Loop, Safari/mobile or professional fingering accuracy. The upstream Hand-thesia derivative source still **lacks confirmed public redistribution permission** (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)); successful QA and attribution are not a license. Do not certify legal beta release or claim pianist-approved fingering until those separate prerequisites are met. The user's decision to launch without a pianist expert team remains unchanged; expert ratings are post-launch optional. Hand-thesia research completion remains 35%.

## LAUNCH-01 — independent MIDI timing parity and genuine MusicXML port-warning fix (v0.10.102)

**Resolved false source warnings:** Bach BWV 846 and Schubert Moment musical No. 3 each declare only MIDI port 1. The previous MusicXML importer showed a misleading port-conflict warning for *any* port declaration. Now it reports potential instrument/channel port collisions **only if multiple different ports really coexist**; a real-browser test proves single-port scores stay clean and a two-port score still warns. Original MusicXML/MIDI bytes, source note timing and author notes are never mutated.

**Independent real-score MIDI timing audit:** the same two SHA-pinned real ASAP MusicXML/MIDI pairs contain **1,607 actual notes** in each format. All pitches and note-on times align within 20 ms under a transparent same-pitch chronological comparison. In Bach, **549/549** note releases agree within 20 ms. Schubert has **479/1,058** agreeing within 20 ms; 568 raw MIDI key releases are about **158 ms shorter** than MusicXML's notated note duration, plus eleven other differences. Crucially a second **independent parser of the original raw MIDI NoteOn/NoteOff ticks** independently confirmed all 1,607 MIDI source key releases were preserved by Play Along's actual MIDI importer down to floating-point precision. **Do not lengthen them automatically**: this is a physical source MIDI vs score notation difference, not a Play Along data-loss bug. Three same-pitch Schubert overlaps remain ambiguous under the pitch+occurrence correspondence heuristic; full MusicXML-to-MIDI source-ID parity is **not** claimed.

**Reproducibility:** [LAUNCH-01 precise original score UAT](docs/LAUNCH-01-UAT-RESULTS.md) · [source-hashed aggregate evidence](research/launch01-real-score-parity-2026-10-14.json) · `tests/launch01-midi-xml-parity.test.mjs` and `tests/launch01-real-score-parity-evidence.test.mjs`, plus original-source Chromium QA in `tests/launch01-real-score-smoke.real.test.mjs`. No third-party score/MIDI bytes are committed, and ASAP's CC BY-NC-SA 4.0 use is restricted to noncommercial research. Open beta gates remain real-browser Pyodide, hardware MIDI/audio/transport QA and source code/assets redistribution rights. Independent pianist recruitment is **not** a launch gate.

## LAUNCH-01 — Real piano score/MIDI UAT and cancellable Python calculation (v0.10.101)

**Real-score engineering QA:** a new independent Chromium workflow uses **original SHA-pinned Bach Prelude BWV 846 and Schubert Moment musical No. 3** MusicXML + MIDI source pairs from the ASAP dataset (CC BY-NC-SA 4.0, temporary noncommercial QA only). The actual app readers imported **549 + 1,058 = 1,607 playable notes** in each format, without invalid note timing or page errors. Both MusicXML imports emitted one warning; matching counts **do not establish exact event alignment**. No upstream music bytes are bundled, committed or deployed. On those real imported piano MIDIs, a simulated Python Worker runtime failure leaves source notes unchanged, prevents Apply/Export and permits retry.

**UX fix:** an earlier long Python/Pyodide Worker call could not be cancelled. While it runs, an explicit **✕ Отменить расчёт** button now terminates the Worker and invalidates late callbacks, retains MIDI and manual corrections, and unlocks Calculate for retry. On completion/error or cancellation it disappears. A real Chromium regression exercises delayed async replies and safe retry with unchanged notes. This is a local asynchronous Worker mock, not a claim that actual Pyodide reliably loads offline.

**Evidence:** [LAUNCH-01 engineering UAT](docs/LAUNCH-01-UAT-RESULTS.md), [original-score and cancellation browser QA workflow](.github/workflows/pianomotion-integration.yml).  Previous mixed-instrument 547-note Apply → Undo/Redo → MusicXML reimport tests and real original Python research tests remain independent and unchanged.

**Beta readiness remains conditional:** two real scores pass parsing, but the source-event semantic parity, nonfatal XML warnings, actual end-to-end Pyodide calculation for user music, hardware MicroLab/musical audio/Wait-Seek-Loop checks and **third-party redistribution rights** remain open. Missing professional pianist adjudicators do **not** block a beta, but legal or critical data/playback problems do. No fingering solver weights or animation sprites were changed.

## LAUNCH-01 — honest beta fingering without expert-review dependency (v0.10.100)

**Project-owner decision:** there is no professional reviewer team before launch, and none is required to publish the functional Play Along beta. Independent expert adjudication remains a post-launch optional research improvement. Automatic PianoMotion fingering is **opt-in and editable**, never advertised as pianist-verified or guaranteed optimal. The actual practice UI now displays a prominent Russian beta warning **before** calculation, calls the action **“Предложить аппликатуру”** rather than implying correctness, clarifies that the user must inspect and explicitly Apply the fingers, and updates hand-guidance/Apply tooltips to avoid describing unverified generated positions as professional validation. No MusicXML, MIDI, audio, existing fingers, model math or hand PNG is modified by this wording update.

**Launch policy:** [docs/LAUNCH-READINESS.md](docs/LAUNCH-READINESS.md) separates public-beta release engineering/legal gates (rights to ship original/adapted Python code, source-safe import/export, playable hardware/audio/transport, real-browser QA, provenance and Pages publication) from **independent pianist approval claims**, which require actual evidence but **must not disable standard user-controlled preview/Apply/Undo/Export**. The optional post-launch P0-A2b research remains intact for future collaborators, with `expertValidated=false` / `productionEligible=false` still correctly describing unverified research claims. Research Hand-thesia percentage remains 35%, separate from beta launch readiness.

**Regression:** `tests/build.test.mjs` now ensures the beta warning, user-facing Apply and Export controls remain in the built UI without a reviewer-panel gate. Future priorities shift to LAUNCH-01 real-score/browser/hardware UAT, LAUNCH-02 clear editable suggestion ergonomics, LAUNCH-03 graceful failure and usability, then LAUNCH-04 source-license and public beta release review.

## Launch policy — no expert panel required for beta (owner decision, 2026-10-14)

**Play Along is intended to launch before an expert/reviewer team exists.** Independent pianist adjudication is a post-launch research option, **not** a condition for publishing the functional piano practice app. Users can still calculate, inspect, manually change, selectively apply, undo and export automatic PianoMotion suggestions with their provenance preserved. These suggestions must be described as **unverified, editable**, not uniquely optimal or professional-pianist-approved. `expertValidated=false` in P0-A2b research reports is not a feature-off switch for ordinary player controls. **Launch blockers are engineering failures or unresolved rights/security/data-integrity concerns, not absence of a reviewer team.** Next priorities are real-song/browser/hardware UAT, import/export/playback reliability, transparent UI limitations, license audit and stable public beta. See [launch gates and prioritized work](docs/LAUNCH-READINESS.md). P0-A2b blind-review tooling remains available if experts become involved after launch. The next v0.10.100 beta UI release implements this policy without changing solver math.

## P0-A2b Phase 3 — real piano repertoire screening pre-registration (v0.10.99)

**Engineering delivery, NOT expert accuracy or a ready-to-run source corpus.** Eight **actual classical piano works** from the existing SHA-1-pinned ASAP CC BY-NC-SA 4.0 real-score manifest are now selected for **private, noncommercial** excerpt screening: 4 development (Bach Prelude BWV 846; Beethoven Sonata 17/I; Schubert Moment musical 3; Schumann Kreisleriana I) and 4 held-out (Chopin Etude Op. 10/1; Liszt Concert Etude S.145/1; Mozart Sonata 12/II; Debussy Pour le piano I). The **composer-disjoint split is frozen in advance**. The plan contains no copied score, MIDI, performance, source note/finger rows, expert evaluations or invented bar boundaries.

A source-pinned, deterministic independent audit checks 16 upstream real-score metadata entries, the selected 8 unique work IDs, noncommercial license scope, source-pair blob SHA-1 shape, composer-group isolation, split balance and explicitly **unverified** screening targets for chords, inversions, arpeggios, thumb-under, repeated notes, held voices and crossing. Screening targets are hypotheses for a qualified curator, **NOT musicologically verified properties of a selected excerpt**. It refuses tampered licensing, invented expert counts, declared XML/MIDI source alignment, duplicated scores and development/heldout composer leakage. Run `npm run research:fingering:p0a2b-phase3` or `node --test tests/p0a2b-phase3-cohort.test.mjs`. The dedicated Chromium candidate-intake and real-original-Python baseline Actions workflows run these checks on PRs and main.

**Open gates:** A curator must choose actual measure windows and approve their musical techniques, verify exact original MusicXML/MIDI NoteOn/NoteOff identity for each window, confirm external rights and reviewer qualifications, collect two independent blind pianist submissions, and obtain a distinct third adjudicator for disputed notes. Existing P0-A2b private review tooling remains the review mechanism. No real source excerpt downloaded by this increment; no verified human reference or P0-A2b two-engine comparison exists. `independentReviews=0`, `productionEligible=false`, no solver weights, source score, audio, or any of the 14 PNG hand poses were modified. A separate Chromium regression fix prevents imported `musicxml-user-export-unverified` digits from becoming learner guidance. Original author fingers, explicit manual corrections and individually user-accepted PianoMotion session suggestions still work; review/editor visibility remains intact. Hand-thesia **35%**. [Screening protocol](docs/P0-A2B-PHASE3-SCREENING.md) · [research-only plan](research/p0a2b-phase3-screening-plan.json).

## P0-A2b phase 2 — real MusicXML candidate intake for independent pianist review (v0.10.98)

**Implemented:** The existing real Play Along MusicXML browser reader can now securely prepare a **private fingerless, blind-hand, SHA-256-bound research packet** from a rights-confirmed local `.musicxml` or `.xml` file. Its exact source note IDs, pitch, NoteOn and physical NoteOff event times are checked; author finger labels are stripped, hands are **not guessed from staff or pitch**, and unhandled ornaments/incomplete or altered events fail closed. Objective event-derived flags denote co-onset chord *candidates*, held-voice overlaps and repeated pitches; true inversions, thumb-under, crossing and other technique classifications require human pianists. Arbitrary XML entities and DTD subsets are refused. Only the known public standard Recordare MusicXML Partwise DTD declaration may be removed before parsing.

**Technical evidence:** Six pinned, explicitly MIT-licensed MusicXML Test Suite files (9+4+18+30+2+70 = **133 imported source notes**) were checked by Git blob SHA-1, imported in **real Chromium** and converted into private research packet candidates. [Frozen aggregate-only research evidence](research/p0a2b-mit-source-candidates-2026-10-14.json) · [the successful Chromium intake workflow](https://github.com/shafranek-js/play-along/actions/runs/38578243524). These are **synthetic MusicXML notation fixtures, NOT published performances with pianist finger ground truth**. No source score XML, finger vectors or review packets are redistributed in Play Along.

**Local workflow:** `npm ci`, `npm run build`, `npx playwright install chromium`; run `node scripts/p0a2b-import-musicxml.mjs --file /private/licensed-score.musicxml --id work-001 --group composer-001 --split development --rights-confirmed --output /private/work-001-blind-packet.json`. The operator must verify rights outside software; a flag cannot establish permission. Next run the private reviewer-template/adjudication tool described in [source intake and curator notes](docs/P0-A2B-MUSICXML-SOURCE-INTAKE.md) and [blind review protocol](docs/P0-A2B-REVIEW-PROTOCOL.md). Only aggregate counts, not source notes/fingers, are printed publicly. Research CI runs the pinned-MIT qualification and hard XML security tests independently of production Pages deployment.

**Status:** SOURCE_INTAKE_READY; **0 independent pianist reviews**, no confirmed expert accuracy result, `expertValidated=false` and `productionEligible=false`. Neither PianoMotion nor FG-02I solver weights, source notes, audio, original hand PNG assets nor automatically guided lessons are changed. **Next:** acquire independently reviewed *actual* difficult piano passages under suitable rights and validate original-MIDI identity to both real engines; compare separately on genuinely withheld reviewer decisions. Hand-thesia completion stays 35%.

## P0-A2b — independent blinded pianist-review infrastructure (v0.10.97)

**Delivered an engineering protocol, NOT independent pianist-validated accuracy.** This release introduces an offline, immutable SHA-bound, **fingerless** review packet with full source-note identity, hand-mode choice (explicit score hands vs blind hand separation), human-curated technical categories (chords, inversions, thumb-under, repeated notes, arpeggios, crossing, held voices, wide spans), and predeclared `development` / `heldout` study grouping. Finger-number references and all candidate model predictions are rejected if they appear in the source packet.

Two independent anonymous reviewer responses are required; agreed acceptable hand/finger combinations use the **intersection** of their acceptable choices, not a silently broadened union. Uncertain/disputed notes are excluded until a third distinct adjudicator explicitly rules with a rationale. Both engines' candidate rows must join by the same original `noteId`, pitch, onset and duration; no hand guessing, shifted events or nearest-pitch alignment. Reported outputs aggregate coverage, abstentions, reference-compatible fingers, disagreements, by-hand and by-technique measures, and never print source note vectors/finger assignments. The CLI can create private, no-overwrite review templates and validate that the same work/composer/arrangement group does not straddle development/heldout.

**Local workflow:** `node scripts/p0a2b-review-workflow.mjs packet /private/curated-source.json /private/packet.json`, then `template`, `study` and `evaluate` commands documented in [P0-A2b reviewer protocol](docs/P0-A2B-REVIEW-PROTOCOL.md). All input scores, expert reviews, engine outputs and packet forms stay local; no new data collection UI or automatic sharing is enabled. Unit tests `tests/p0a2b-independent-review.test.mjs` and `tests/p0a2b-review-workflow.test.mjs` are part of `npm test` and the research GitHub Actions gate. The previous genuine Python/PianoMotion-vs-FG-02I 148-note report remains [P0-A2](docs/P0-A2-REAL-FINGERING-QUALITY.md).

**Acceptance remains blocked:** no independently qualified pianists have supplied the required blind ratings, and the program cannot verify reviewers' credentials, rights grants or the truth of `blindToAlgorithms` self-attestations. This code does not execute either solver or prove accuracy gains; it scores only separately computed, exact-source outputs. The resulting `independentlyValidated=false`, `productionEligible=false`; generated fingers are not automatically promoted to teaching guidance. **NEXT P0-A2b:** obtain authorized polyphonic and technique-rich material and actual, independently reviewed variant fingering reference sets, then run the real Python and FG-02I engines on frozen heldout cases. Hand-thesia completion remains 35%; optional IK remains separate.

## P0-A2 — REAL original-Python PianoMotion vs Play Along FG-02I (v0.10.96)

**First source-blinded, actual two-engine comparison delivered and reproduced in GitHub Actions**, not a browser Worker simulation. The source is five SHA-256-pinned, hand-authored PIG pieces from Piano Protege Curriculum (CC BY-SA 4.0): **148 notes**, each with known RH/LH ownership and a withheld reference finger. Both solvers receive *identical finger-free musical events*; source hands are supplied to both (Python via track name). An independent 9600-PPQ MIDI source-event bridge proves exact original note-on/off ordinals, source times and SHA-256 against each real Python `analyze_midi` result, without guessing from pitch or leaking a published reference finger. Original Python is actually run **twice per piece**; all ten analyses succeeded with identical outcomes.

**Measured aggregate:** FG-02I 87/148 (58.78%) matches to the published single-finger reference; real PianoMotion also 87/148 (58.78%). Both returned 148/148 proposed fingers. The engines gave **identical suggestions on 117/148 notes (79.05%)**; among the 31 disagreements, ten matched only FG-02I, ten matched only PianoMotion and eleven matched neither. PianoMotion matched Für Elise on 22/36 vs FG-02I 15/36; on Bach Minuet the order reversed (22 vs 25 of 32). No independent physically impossible holds were detected in these small examples, which is not a musical validation. Full method, run provenance, per-case denominators and caveats: [P0-A2 real fingering quality report](docs/P0-A2-REAL-FINGERING-QUALITY.md), frozen [aggregate JSON](research/p0a2-real-python-aggregate-2026-10-14.json).

**Reproduce:** install Node 22, Python 3.12, and Python `numpy==2.2.6 pretty_midi==0.2.11.post0 mido==1.3.3 six==1.17.0`. Run `npm run research:fingering:p0a2`; this downloads only the five pinned/hash-verified PIG text sources, runs the checked-in original Python source and actual Play Along FG-02I, prints **aggregate-only metrics**, and deletes transient MIDI/full PianoMotion outputs. [P0-A2 real Python GitHub Actions](.github/workflows/p0a2-real-python-benchmark.yml) separately runs the actual algorithm rather than mocking it; deterministic source, provenance and denominator tests are registered in `npm test`.

**Boundary:** PIG fingers were contributed by corpus authors, not independently adjudicated by professional pianists; we supplied the author-derived hand labels to both solvers, so **hand-separation performance is not being measured**. One reference sequence is not uniquely optimal. The Python runtime timing includes startup; the Node FG-02I timing does not, so raw speed figures are not comparable. **No quality superiority is established, no solver penalty weights were changed, and auto-teaching promotion is not allowed**. Before FG-03D5/03D6 optional PianoMotion IK becomes authoritative, P0-A2b needs permission-cleared, *independent pianist-reviewed* held-out polyphony, crossings, inversions, repeats, thumb techniques and hand-size evidence. Hand-thesia objective remains 35%.

## P0-A1 — independent PianoMotion physical contradiction audit (v0.10.95)

This release adds a **source-note-anchored second opinion on generated fingering**, NOT a different fingering model and NOT evidence of increased pianist accuracy. Before a proposed PianoMotion finger can be accepted in the Practice review, `pianoMotionAuditFingers` independently checks physical key release times (original MIDI NoteOff, **not pedal sustain**): a single finger cannot hold two unrelated keys, the same physical key cannot be independently attacked by two different hands/held reattacks, and one hand cannot hold more than five separate keys. Simultaneous unisons on the same hand/finger are allowed; the original PianoMotion **adjacent double-thumb (white/black) and double-pinky (white)** technique is recognized as a separate *unverified technique exception*, not incorrectly declared impossible.

Conflicting candidates are highlighted in red with an accessible reason; source-author and manual annotations are protected. **Apply all** and **Apply selected** automatically skip hard-contradictory generated candidates and state how many were skipped. Valid remaining candidates retain existing per-note selection and Undo/Redo; unresolved notes remain unresolved; exports never silently convert a rejected proposal into an approved finger. The input score, track selection, MIDI physical timings, tempo, SoundFont, hand PNG assets and backed-up original corrections do not change. The screen refuses malformed source alignments and streams with extreme concurrent density, rather than hanging or fabricating finger assignments.

**Engineering QA:** `src/core/pianomotion-physical-audit.mjs`, `tests/pianomotion-physical-audit.test.mjs`, and the real-Chromium `tests/pianomotion-physical-audit.real.test.mjs` (genuine MIDI import and UI with a synthetic conflicting Python Worker result). The dedicated Chromium workflow also runs the existing 547-note guitar + flute apply/export/reimport regression. **Limitations:** no pianist-labelled corpus was run in this increment, and the browser integration uses a simulated Python response. Hard-conflict absence ≠ good fingering, anatomy certification, or performance accuracy; generated proposals are never relabelled as score-author annotations.

**Next P0-A2:** execute both real PianoMotion Python and the existing Play Along FG-02I scorer on **identical, source-ID-verified, independently hand-annotated MusicXML/MIDI cases** including scales, repeated notes, inversions, fast thumb crossings, held voices and different hand spans; use strictly withheld expert finger annotations, record full eligible/proposed/refused/error denominators, and change solver weights only on independently verified gains. The preliminary research contract is `docs/FG-04C2-PIANOMOTION-FINGERING-COMPARISON.md`. Optional PianoMotion IK (FG-03D5/03D6) stays behind that acceptance gate; Hand-thesia completion remains 35%.

## FG-04D3 — PianoMotion complete visual fingering review (v0.10.94)

**New in Practice → Automatic Fingering:** the original-Python calculation now opens a source-anchored **interactive miniature piano roll** and a keyboard-accessible paged note list (24 real notes/page, no first-120 cutoff). Click a note rectangle or its checkbox to select the candidate, select all/none, inspect the proposed RH/LH and finger number, then **Apply selected**. The original **Apply to current melody** button still exists for explicit accept-all, but is not automatic. Selections can span all pages including all 547 guitar notes. Source author and manual finger assignments are skipped, never overwritten; unresolved fingers are not filled by guessing. MIDI note times, pedal, imported tracks and original MusicXML stay unchanged.

**Undo/Redo:** every selected or all-notes Apply is one atomic, reversible session history step (up to 40 batches), including the note's prior hand/finger/provenance fields. Any intervening manual or source-note modification refuses a stale undo rather than partially reverting edited notes. Session review/history resets on a fresh calculation. Hiding accepted proposals collapses the preview but leaves Undo/Redo and already accepted MusicXML export available. Generated results are still unverified and not original composer annotations.

**Verification:** `tests/pianomotion-review.test.mjs` is in `npm test`. Dedicated GitHub Actions runs the real Chromium flow `tests/pianomotion-musicxml-roundtrip.real.test.mjs`: import source MIDI containing 547 guitar + 12 flute notes, navigate pages, select via canvas and checkbox, Apply one, Undo, Redo, Undo, Apply all, export marked MusicXML and independently re-import with non-authorial fingering provenance. A deterministic simulated Worker supplies suggestions; this checks real app UI/MIDI/XML integration but is **not an actual Pyodide/PianoMotion musical-accuracy benchmark**. The previous real-browser Apply/Export test also asserts Undo after hiding details.

**Next:** per-score semantic piano-fingering comparison with independent pianist-reviewed labels (P0-A), then source-safe optional PianoMotion IK procedural hand display (FG-03D5/03D6). Third-party source redistribution review and musician validation remain open gates.

## FG-04D2 — Real Chromium PianoMotion integration and safe XML provenance (v0.10.93)

**Why:** The new PianoMotion Worker can compute and explicitly apply fingers to an imported MIDI, but a generated MusicXML file must not disguise those fingers as original composer-provided annotations when re-imported.

**Fix:** Downloaded PianoMotion MusicXML now contains the existing conservative `play-along-user-fingering` provenance marker. Upon independent MusicXML re-import, the parser treats **every numeric fingering** in such a download as `musicxml-user-export-unverified`, never `musicxml` score-author fingering. If the XML cannot be safely parsed/marked, export fails rather than shipping misleading digits. Input MIDI/MusicXML, note on/off, tempo, SoundFont, author/user corrections and all 14 owner PNG hand poses remain untouched. The output derived from MIDI is **approximate score notation** and preserves no claim of bit-perfect source timing in the generated score.

**Integration QA:** Added `tests/pianomotion-musicxml-roundtrip.real.test.mjs`: Chromium imports a deterministic Format-1 synthetic guitar MIDI with **547 notes** (including short notes, repeated pitches and chords) plus **12 separate flute notes**. A deterministic test double substitutes only for the external Python Worker; the browser uses the actual MIDI parser, source selection, user Apply, MusicXML download, independent MusicXML importer and provenance guards. It verifies 547/547 applied guitar notes, no flute edits, unchanged underlying source-note timing/velocity, 547 exported/reimported notes and *zero* fabricated composer-author fingers. The existing browser Apply/Export and 21 source/adapter module regressions also run in an **independent GitHub Actions Chromium workflow** on main: [PianoMotion integration QA](.github/workflows/pianomotion-integration.yml). Registered the new test in `npm run test:browser`.

**Validation boundary:** Python/Pyodide's actual network-dependent inference has not yet been run inside this new CI browser scenario; previously built source-identity and 50-ms normalization checks remain pure module tests. No expert musician has approved generated fingering as lesson-grade. Rights inherited from adapted third-party Hand-thesia sources remain an independent review requirement.

**Next:** FG-04D3 source-note-anchored visual review and selective finger acceptance/Undo, followed by measured P0-A musical quality work and FG-03D5/03D6 switchable PianoMotion IK. The full roadmap is [docs/ROADMAP-FINGER-GUIDANCE.md](docs/ROADMAP-FINGER-GUIDANCE.md); the 3D piano idea remains deferred under issue #36.

## FG-04D0B — PianoMotion raw note identity restore (v0.10.92)

**Fix for disabled Apply after successful Python fingering.** PianoMotion's original Python MIDI loader normalizes very short notes to a minimum of 50 ms for its internal model. Comparing those modeled note-offs to the original MIDI with a 40 ms tolerance incorrectly returned `NOTE_MAPPING_NOT_FOUND` even when all fingers were calculated. The Worker now uses an exact one-to-one `sourceNoteIds` join to `rawBaseline.sourceNotes` and restores original onset and release times before returning suggestions to Play Along. No source MIDI, tempo, rhythm, notes or original MusicXML is changed.

The mapping refuses duplicate/missing source IDs, changes to pitch/onset, unexpectedly shortened/lengthened notes, missing assignments and normalization losses. These proposals still require user Apply before MusicXML export, and remain unverified by a pianist. Tested against a synthetic 547-note guitar-like source with sub-50ms notes; browser end-to-end validation with a real user file is still needed.

Tests: `tests/pianomotion-source-identity.test.mjs` now part of `npm test`. Worker source: `src/workers/pianomotion-engine.worker.mjs`, validation helper: `src/core/pianomotion-source-identity.mjs`.



## FG-04D0 — PianoMotion MIDI compatibility and safe apply/export (v0.10.91)

**Scope: one playable piano part, NOT an orchestral arranger.** “Calculate fingers” inspects track names, GM Program Change events, drum channel 10 and track/channel membership. Clearly piano-only MIDI uses exact original bytes when available. MIDI with foreign instruments or drums (e.g. guitar solo) creates a temporary piano-note MIDI from **one selected playable track** (and the densest melodic channel for multi-channel SMF type 0). The currently selected track is preferred; otherwise the first playable track is used. Original song and timing are unchanged. No orchestral reduction is claimed.

**Fail closed:** original MIDI retries occur only for known structural/provenance errors; Python/Pyodide download, checksums, source-module and Worker failures do not trigger repeated conversion. Temporary MIDI uses one piano channel and millisecond note times; it rejects overlapping identical pitches with ambiguous note-offs. A warning for more than ten simultaneously held notes is a coarse diagnostic, NOT expert validation of piano playability.

**Apply and export:** all returned fingers must be uniquely matched by pitch and tightly matching note timings to existing source notes in the selected track/channel; ambiguous, missing or extra notes disable Apply and XML export. XML export is enabled only after applying at least one finger. Source-note identity is rechecked at both Apply and Export. Existing author/user fingers are protected. Clear hides proposals **without deleting applied fingers**. Original MusicXML export never silently falls back to an approximate transcription if the overlay fails; imported MIDI exports only the chosen piano part/channel using explicitly approximate transcription. Generated fingerings are not expert-verified ground truth.

Regression tests: `tests/pianomotion-source-selection.test.mjs` (`npm test`) and `tests/pianomotion-apply-export.test.mjs` (`npm run test:browser`). Source: `src/core/pianomotion-song-to-midi.mjs` and `src/legacy/parts/35-fingering-editor.js`. Retain the author/upstream attribution below.

## FG-04C9 — ORIGINAL PianoMotion Python fingering in the browser (v0.10.90)

**Source attribution:** the PianoMotion browser integration incorporates the owner's [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio) Python code, which includes algorithms adapted in part from **Hand-thesia / pygame-piano-animator** by [V9011N](https://github.com/V9011N/pygame-piano-animator), upstream source revision `f8189c021d9235005fb35faa2c8cfbc09a3768a0`. The exact files and hashes are identified in the original `source_manifest.json`. See [third-party attribution and permission status](THIRD_PARTY_NOTICES.md). **Attribution does not grant redistribution rights**; the upstream repository has no verified permissive license.

**FG-04C8 (research foundation):** Opening an original .mid/.midi through the existing library parser now retains a byte-identical original MIDI snapshot **in memory** for that specific song. The future PianoMotion worker can use a copy for the source-verified FG-04C7 conversion without a second file upload. The snapshot is bounded, never placed in browser backup/storage, safely copied and eventually garbage-collected. This change does not yet run the Python algorithm in browser or enable automatic teaching fingers. [Implementation and tests](docs/FG-04C8-ORIGINAL-MIDI-BYTES.md).

**FG-04C7 — true PianoMotion output for original MIDI (research adapter):** Added the conservative MIDI-only source-provenance bridge: hash-locked original MIDI bytes, exact PianoMotion source-event identity, hand/finger assignment, note-on/off timing and refusal of ambiguous or repaired streams. No original PianoMotion Python core is shipped or run by the browser yet; no learner auto-fingers are enabled. [Implementation and next runtime gate](docs/FG-04C7-PIANOMOTION-NATIVE-MIDI-BRIDGE.md). No app version or Hand-thesia completion change.

## FG-04C6 — One-click fingering for the already open MusicXML (v0.10.89)

**No second file needed.** Open any supported original MusicXML, select **Аппликатура**, then click **🧠 Рассчитать для текущего произведения** at the top of the editor. The dedicated offline browser worker computes Play Along's current FG-02I / FG-04C3 research models for the **currently selected** score and current calibrated hand size. Missing original hands require explicit consent for a **research-only** staff 1→RH / staff 2→LH assumption; original MIDI remains unsupported by this browser solver. The Python algorithm from PianoMotion Studio is **not** installed or executed by this feature.

Purple, dashed finger labels appear **on the actual note blocks** as clearly unverified suggestions. They are not saved or fed to learner hand animation. A user can select and review individual notes (Ctrl+A selects all), check **«Я проверил(а)…»**, and click **«Принять выбранные предложения»**. Confirmed selections are saved only as ordinary user corrections via the existing validated **one-step Undo/Redo** mechanism. Author fingers and prior manual edits are never overwritten. **«Скрыть предложения»** discards them without any data changes. Changing source, hand-size, hand hypothesis or existing corrections invalidates the current preview. Source MusicXML, playback events, transport, SoundFont and the 14 original PNG hands remain unchanged.

This is a **user-review workflow, not proof of pianist-approved automatic fingering**. Direct PianoMotion MIDI/Python browser integration remains a separate priority requiring pinned runtime assets, exact MIDI identity, source/provenance rights and browser acceptance. [FG-04C6 details](docs/FG-04C6-CURRENT-SONG-FINGERING.md). The Hand-thesia objective remains conservatively **35%** until verified musical accuracy and visual UAT.

## FG-04C5 — Measure your comfortable hand span (v0.10.88)

**New in the MusicXML fingering editor:** in the **Практика** (Practice) sidebar, open **«Как определить мой размер кисти?»** at any time, even before loading MusicXML. The fingering editor also offers **«Настроить охват кисти»** as a shortcut. For each hand, test how far thumb (1) and little finger (5) can comfortably reach on the actual keyboard: seventh C4–B4, octave C4–C5, ninth C4–D5 or tenth C4–E5 (with smaller/wider options). Select **«Легко, без напряжения»**, **«Заметное растяжение»**, or **«Дискомфорт или боль»**. The app recommends a conservative research hand-size model: a relaxed tenth yields **L**; the smaller estimate across LH/RH determines the single shared profile; an unmeasured hand is marked provisional; any pain prevents automatic recommendation. Noticeable stretch lowers the suggested class; a lone wide reach cannot automatically recommend XXL or establish the reach of adjacent fingers. **This is not a medical or pianist-validated biomechanical measurement.**

Click **«Использовать этот размер»** to apply it to the existing browser calculation `XXS–XXL` setting; it is validated, saved as a global preference, restored on reload and included in normal user backup, rather than resetting per song. The user can override the profile manually. The questionnaire answers/comfort levels are **not saved**. Previous research candidates are invalidated on a size change. Nothing changes MusicXML, MIDI timing, playback, user finger corrections or learner guidance, and all fourteen supplied Classic PNG hand assets remain byte-identical. [FG-04C5 contract and tests](docs/FG-04C5-HAND-SPAN-CALIBRATION.md).

## FG-04C4 — Browser-native fingering research (v0.10.87)

**New visible capability:** in the MusicXML **Аппликатура** editor, expand **«Рассчитать аппликатуру в браузере · эксперимент»**, choose hand size and click **«Рассчитать и сравнить»**. A bundled **offline Web Worker** runs the real Play Along FG-02I Beam Search and its FG-04C3 opt-in anatomical finger-pair model side-by-side, returning counts, disagreement metrics and a bounded proposal list. Neither Python installation nor external PianoMotion checkout is required. For unannotated two-staff MusicXML, explicit one-time user opt-in may treat staff 1/2 as RH/LH *for this research only*; unknown ownership otherwise fails closed. Author and manually corrected fingers remain source anchors. Suggestions never overwrite user edits, MusicXML, MIDI events or learner-facing hand hints, and the fourteen original PNG hands remain unchanged.

**Distinction:** this is **not** PianoMotion Studio's Python core running in the browser. The PianoMotion engine remains a source-provenance-locked offline comparator. The browser-native prototype delivers a first no-installation end-user research calculation and tests the integration boundary; a separately justified, license-cleared Python/WASM port may follow. [FG-04C4 implementation and QA gates](docs/FG-04C4-BROWSER-FINGERING-EXPERIMENT.md). No claimed musical accuracy gain or expert teaching approval; Hand-thesia progress remains **35%** pending verified integration.

## FG-04C2 — Verified PianoMotion fingering comparator (research integrated)

[PR #93](https://github.com/shafranek-js/play-along/pull/93) integrated the score-MIDI provenance-locked comparison bridge (merge commit `cc951ff6`) after complete successful CI. It invokes **Play Along's real FG-02I solver** and separately consumes actual [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio) finger assignments. The converter requires the SHA-256 of the same original MIDI, exact unique raw event locators and stable MusicXML note/hand/timing identity; it refuses repairs, ambiguous unisons, missing provenance, changed author/user anchors or musical times. It never silently uses inferred fingers as verified teaching hints. An optional local Node launcher invokes the owner's installed Python core without copying that source into Play Along; `scripts/fingering-engine-comparison.mjs` returns aggregate-only results. See [FG-04C2 methods and commands](docs/FG-04C2-PIANOMOTION-FINGERING-COMPARISON.md).

This is a **research/tooling integration, not a measured accuracy improvement**. PianoMotion and Play Along have not yet been benchmarked here on an accepted identical independent score corpus. A new opt-in finger-pair anatomy Beam Search model (FG-04C3) is being evaluated separately; the legacy algorithm remains unchanged by default. No source music, audio, MIDI, fourteen original PNG hand assets or student-facing guidance changed. App version stays **v0.10.86** and Hand-thesia goal completion **35%**.

## Next two owner priorities — Fingering AI and optional PianoMotion IK hands

**Research foundation integrated:** FG-04C1 cost evaluator and FG-03D4 source-bound PianoMotion pose adapter are in `main` after passing CI. Neither is yet a learner-facing fingering engine or IK renderer. [FG-03D4 contract](docs/FG-03D4-PIANOMOTION-POSE-ADAPTER.md).

**Priority P0-A: fingering quality.** Compare PianoMotion Studio's score-aware Beam Search, musical figure analysis and per-pianist ergonomic cost against Play Along's existing FG-02/FG-04C algorithms on identical, immutable source-note IDs. Preserve original MusicXML author fingers and explicitly user-corrected notes; no automatically generated fingers are trusted learner instructions without independent validation.

**Priority P0-B: user-selectable visual hands.** Keep all 14 owner PNG poses intact as the default **Classic PNG** hand display. Add an optional procedural PianoMotion IK display with four skins: Cartoon, Gloves, Robot and Skeleton. The renderer is opt-in, and must preserve next-unfinished-note targeting, Wait, Seek, Loop, tempo and physical-key/hand-contact correctness. No style is available to select until its implementation passes browser QA. [Implementation, acceptance and rights plan](docs/PRIORITY-FINGERING-IK-PIANOMOTION.md). Hand-thesia goal progress remains **35%** until verified production integration.

## PianoMotion Studio — owner-authorized integration assessment (no code import yet)

The project owner has authorized reuse of their [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio). Its procedural motion buffer, articulated hands/PixiJS renderer, validated plan contracts and Worker/Pyodide bridge are integration candidates for source-verified next-note motion. The separate Python numerical core contains adapted Hand-thesia lineage and still requires per-file source/right verification before copy or public redistribution. The current fourteen original PNG poses, playback, MusicXML/MIDI timing and verified author/user fingers remain unchanged. Optional renderer and cost-model integration are gated on browser QA and pianist validity; automatic fingering remains NO-GO. [Detailed interface and provenance plan](docs/PIANOMOTION-STUDIO-INTEGRATION.md). No application version bump for this assessment; Hand-thesia progress remains **35%**.

## FG-03A-P1 — Reject duplicate source-note IDs in live next-chord guidance (v0.10.86)

When simultaneous score notes share the same nonempty canonical `noteId`, a hand position cannot be uniquely attributed to either source event. The original score onset and total note count are retained, but all duplicate-ID finger candidates at that onset are suppressed; independent unambiguous fingers may remain as numeric labels while the full chord is marked incomplete. An unannotated source note sharing an ID also invalidates the annotated candidate. Earlier/later separate onsets remain independent; original note-on/off, Wait/Tempo/Listen, SoundFont, MAESTRO and all 14 hand PNG assets are untouched. Two synthetic nonmutation/refusal regressions cover this safety behavior. This is a production guidance integrity fix, **not** inferred RH/LH or automated teaching fingering.

## FG-04B4-R7 — Internal candidate-cohort collision gate (research only)

Merged [PR #87](https://github.com/shafranek-js/play-along/pull/87) after passing the complete [GitHub Actions CI](https://github.com/shafranek-js/play-along/actions/runs/38457833902), integration commit `0d5822785f668537315a342a7486e1517d225b5c`. This extends the R6 publisher-metadata leakage research with aggregate, source-safe comparisons **within** the reference-nonoverlapping pseudolabel cohort: shared P1/P2 performers, exact composer+work matches, collisions across publisher splits and impacted candidate counts. No new live-source R7 collision numbers are claimed until independently measured. The 15 R6 reference-nonoverlap recordings are **not verified independent**, and automatic RH/LH/finger predictions remain NO-GO for teaching. No player, audio, MIDI, fourteen original PNGs or source scores changed. [R7 research contract](docs/FG-04B4-R7-INTERNAL-COHORT-COLLISIONS.md). Version stays v0.10.85; this is a research-only integration, not a new application release. Hand-thesia progress stays **35%**.

## FG-04B4-R6 — Real source performer and repertoire overlap audit (v0.10.85)

**Measured real publisher source collision (2026-10-13):** 95 automatic-only filename-disjoint recordings were compared with all eleven previously studied human-GT original recordings using the same publisher's pinned canonical metadata. **79/95 share an original performer; 20/95 repeat an exact composer+work title; 19 share BOTH; altogether 80/95 have at least one known overlap, leaving only 15 with no exact metadata collision** (not verified independent or human-labeled). Of the unchanged 8-pilot recordings, **5** overlap on performer/work, only **3** do not. Original train/test labels do NOT establish pianist independence. **No independent real hand/finger accuracy or learner eligibility is inferred.** [Exact full measured counts](docs/FG-04B4-R6-PUBLISHER-METADATA-LEAKAGE.md).

**Research data quality, not machine-learning accuracy:** FG-04B4-R5 established **95 filename-disjoint** automatic-pseudolabel recordings separate from the already examined 11 PianoVAM human-GT recordings. This is insufficient for a blind RH/LH test because the same pianists and compositions can appear under different timestamps. FG-04B4-R6 reads the **immutable publisher's canonical `metadata.json`** at the exact PianoVAM revision and compares original `record_time`, *both* participant fields `P1_name/P2_name` and each composer's work title with **all eleven old manually annotated reference recordings**. It detects known duplicate performers/repertoire separately in the 95-source pool and the unchanged eight-source pilot, and includes publisher train/valid/test split distributions as **descriptive metadata, not independent performer evidence**. Incomplete original or reference metadata blocks claims about a disjoint cohort.

Metadata-derived results are anonymous aggregate counts and source SHA256, with **no raw performer names, music work titles, timestamps, metadata JSON, original notes, finger sequences or per-recording slices** in the published CI artifact. Even no exact metadata collisions would not establish verified individual identities or independently adjudicated piano fingering. No pseudo-hand labels are promoted to original MusicXML author notation or learner guidance; no beam-search weights, source MIDI, SoundFont, MAESTRO, original fourteen PNG hand assets or transport is changed. PianoVAM's license is **CC BY-NC-SA 4.0 noncommercial research only**; automatic RH/LH/finger hints remain **NO-GO** for the learner. Hand-thesia progress stays **35%**. [FG-04B4-R6 protocol](docs/FG-04B4-R6-PUBLISHER-METADATA-LEAKAGE.md).



## FG-04B4-R5 — Strictly separate previously evaluated PianoVAM GT from pseudo-only source records (v0.10.84)

**Measured original pinned corpus (2026-10-13):** 107 original TSV recordings, 106 automatic video pseudolabel recordings and exactly 11 already-reviewed manual-GT recordings. After excluding all 11 from the pseudo pool, **95 disjoint recording filenames** remain; 73 source-pairs meet the existing 350 KB file-size cap and 22 do not (still counted in the full 95). The fixed eight-file pilot verified **10,318/10,318 original MIDI event correspondences**, with **8,567** automatic hand+finger labels and **1,751 `Noinfo`** (**83.03% coverage**, not accuracy), zero indistinguishable source duplicate identities. Performer/composition-level independence is **not** established; no fresh human GT for this pilot. [Exact evidence](docs/FG-04B4-R5-DISJOINT-PSEUDO-COHORT.md).

After independent original-video-pseudolabel verification in FG-04B4-R4, the next research gate constructs a **strict recording-disjoint original-source manifest** from three version-pinned PianoVAM directories: original MIDI-derived `TSV/`, video-generated `Fingering/` and human-reviewed `Fingering_GT/`. The **eleven manual-GT recordings already inspected repeatedly in FG-02J/FG-04B4-R1/R2/R4 are excluded from the entire pseudo-only candidate pool**, not merely hidden in the published sample. The `Fingering_GT/` filenames must exactly match the separately frozen eleven names, and every automatic pseudolabel file must have a corresponding original source TSV. Unexpected GT entries, missing original partners, changed revision, malformed metadata or partial directory listings **fail the research run**.

From the remaining pseudo-only recordings, a fixed hash-ranked eight-record pilot **restricted to pairs whose original upstream metadata lists both files at no more than 350 KB** (the existing bounded parser/fetch limit) undergoes **exact original note event identity verification** across MIDI pitch, onset, key release, sound/frame release and velocity; `Noinfo` is counted as unknown, never forced to RH/LH. An aggregate-only report records source-note counts, pseudo-label coverage and source identity anomalies, with no licensed note records, finger sequences, original timestamps or performer filenames. **Pseudo-label coverage is NOT accuracy**: this sample has no independently manually verified truth, and disjoint filenames alone do not establish different pianists or different pieces. No model training, solver tuning, production learner hands, user fingers, original fourteen hand PNGs, MIDI/Wait/Tempo/pedal, SoundFont or MAESTRO changes occur. PianoVAM is CC BY-NC-SA 4.0 for **noncommercial research only**. [FG-04B4-R5 method and rights](docs/FG-04B4-R5-DISJOINT-PSEUDO-COHORT.md). Hand-thesia stays **35%**; all automatic teaching remains **NO-GO**.



## FG-04B4-R4 — Independently audit video-derived automatic hand pseudolabels (v0.10.83)

Official PianoVAM v1.2 includes `Fingering/` with automated hand/finger suggestions for real video-recorded performances and a distinct `Fingering_GT/` manually reviewed subset. FG-04B4-R4 adds a **read-only, source-identity-verified audit** on the same 11 immutable, noncommercial PianoVAM recordings already evaluated in FG-02J / FG-04B4-R1 (32,525 original performance events, 1,800 original human GT note labels). For every source note, the upstream automatic label file must match the original MIDI-derived TSV's **five original event fields and exact row order**; ambiguous physically indistinguishable duplicate GT events are quarantined. The report measures **actual hand coverage, errors among auto-labeled notes, unknown hands, hand-only labels, and full hand-plus-finger agreement**, each using explicit denominators. `Noinfo` means unlabelled and is **never** converted into an inferred RH/LH.

**Measured actual PianoVAM automatic hand quality (11 recordings, 2026-10-13):** 26,879/32,525 original notes receive an automatic hand (**82.64% coverage**, 5,646 `Noinfo`). Of the 1,800 original manually reviewed notes, **1,588/1,800** receive an automatic hand (**88.22% coverage**) and **1,576/1,588** of those hands match human GT (**99.24% agreement among proposals, 12 demonstrably wrong**). Full RH/LH **plus finger** matches **1,520/1,588 (95.72%)**. Including abstentions, correct human-reviewed hands cover **1,576/1,800 (87.56%)**. These are independent source-parity calculations but **not new human annotations or evaluation of the Play Along algorithm**. [Measured figures and denominators](docs/FG-04B4-R4-VIDEO-PSEUDOLABEL-AUDIT.md).

This measures the **dataset vendor's automatic pseudolabels**, **not** the Play Along hand separator's hand accuracy, teacher-approved source scores or a fresh blind holdout. The same manual 1,800-note GT already informed previous studies; no model is trained, tuned or tested blindly using this sample, and no original performer notes/fingering streams or videos are redistributed. Upstream CC BY-NC-SA 4.0 requires **noncommercial research only**. No Play Along player integration, original MusicXML/MIDI/audio, 14 PNG hand files or learner facing auto hints are changed. [FG-04B4-R4 methods, identity and rights](docs/FG-04B4-R4-VIDEO-PSEUDOLABEL-AUDIT.md). **Auto RH/LH for teaching remains NO-GO; Hand-thesia remains 35%.**



## FG-04B4-R3 — Independent hypothesis falsification, without using real GT to tune the splitter (v0.10.82)

The external PianoVAM comparison (v0.10.81) identified **53 incorrect oracle-seeded hand assignments** and **738 abstentions** (including **583 NO_FEASIBLE_HAND_PATH**), but these diagnoses alone cannot prove human physical impossibility or justify training on the same held-out answers. FG-04B4-R3 adds a **new 15-case original, project-authored, CC0-1.0 SYNTHETIC engineering challenge suite** that is distinct from the PianoVAM recordings and PIG/ThumbSet datasets. Fictional annotated hands are withheld from the *unchanged and exact-Git-blob-pinned* beam solver except for explicitly selected source anchor notes; candidate predictions are scored against withheld synthetic truth **only after inference**. These are engineering controls, **not independent real performer, pianist, or anatomical ground truth**.

A separate source-only structural witness identifies elementary 10-simultaneous-key, 5-source-anchored-key-per-hand, and same-held-physical-key contradictions. If the beam search reports `NO_FEASIBLE_HAND_PATH` without such a witness, the output explicitly calls it a **model-path rejection with no structural certificate**, not physical inability. Fixed 128-beam and XXL-size counterfactual probes measure **sensitivity only**—they do not change the production/experimental solver parameters or decide correctness. The original source fixture and frozen solver must both match **exact Git blob pins** or research CI refuses. Synthetic scenario reports contain aggregate outcomes, not original note arrays. [FG-04B4-R3 falsification method and licence](docs/FG-04B4-R3-STRUCTURAL-HYPOTHESES.md).

External PIG and ThumbSet sources were investigated as future independent real evaluation candidates, but the former is restricted to nonprofit academic research and the latter requires access approval; neither is imported without source rights and expert annotation review. Existing **PianoVAM results remain fixed**, unanchored accuracy still unmeasured, and no musical/physical accuracy improvement is claimed. All app behavior, original notes/MIDI/Wait/Tempo, SoundFont/MAESTRO, fourteen original PNG hands and learner hints remain unchanged. Production auto RH/LH and automatic fingering are **NO-GO**; Hand-thesia completion remains **35%**.



## FG-04B4-R2 — Explain where the independent hand splitter refuses or mislabels (v0.10.81)

Following the source-pinned real PianoVAM v1.1 comparison (11 original recordings, 242 fully ground-truth-covered same-hand polyphonic islands), the existing FG-04B4-R1 **0-anchor MIDI-only** and **source/oracle-seeded** algorithms now have a read-only, **pre-declared diagnostic error stratification**. It bins **only held-out notes** by source attack texture, island size, number of disclosed original hand anchors, pitch distance to the closest *exposed* anchor, and concurrent identical-key overlaps. Per-bin metrics show heldout/proposed/correct/incorrect/abstained; prediction-direction mistakes are aggregated **across all eleven recordings only**. Five independently validated marginal axes must each reconcile to the original immutable denominators; refused islands remain abstained, not silently removed. The research code never receives withheld GT hands or fingers as predictor input. No raw notes, score event data, individual hand labels, source finger streams or per-recording small-cell diagnostics are exported.

**Measured independent R2 strata:** Of 53 seeded-mode wrong hands, **32 came from notes in components with only one hand known** (32/76 proposed = 42.11% errors), versus **21/249 = 8.43%** with both source hands anchored. **43 of the 53** wrong labels were 5–12 semitones from the nearest known source seed (43/166 proposed); 37 errors predicted RH for GT LH and 16 predicted LH for GT RH. The **738** abstentions comprise **583** model `NO_FEASIBLE_HAND_PATH`, **133** `AMBIGUOUS_HAND`, and **22** `BEAM_TRUNCATED_AMBIGUOUS`. These separate marginal strata show **associations, not causal evidence**; an algorithmic infeasibility classification is not independently demonstrated physiological impossibility. [Full measured table](docs/FG-04B4-R2-FAILURE-STRATIFICATION.md).

The original unmodified algorithm baseline remains **0/1,467** autonomous hand proposals (100% abstained). With **404 source-provided oracle hand seeds**, **325/1,063** heldout hand proposals (30.57% coverage), **272 right / 53 wrong** (83.69% among proposals ONLY) and **738 abstained**. This is a diagnostic of existing mistakes, **not** improved hand separation or independent piano-teacher approval; GT is CC BY-NC-SA 4.0 research only. **No tuning to external GT was performed**, learner-facing hand/finger guidance and all source MIDI/audio, SoundFonts, MAESTRO, original 14 PNGs and transport remain untouched. Automatic learner use is **NO-GO**. [FG-04B4-R2 measured diagnostic contract](docs/FG-04B4-R2-FAILURE-STRATIFICATION.md). Hand-thesia progress remains **35%**.



## FG-04B4-R1 — Independent REAL performer RH/LH ground-truth benchmark (v0.10.80)

Instead of interpreting the four unlabeled ASAP real scores as evidence of correct piano finger/hand placement, FG-04B4 now has a separate **noncommercial research-only** source-based benchmark on **11 immutable PianoVAM performances** (existing FG-02J original-source event alignment: 32,525 MIDI/TSV notes, 1,800 externally hand+finger annotated notes, 5.53% initial GT coverage). A strict **source-complete held-key polyphonic island** gate refuses any partial GT chord and any identical duplicate five-field source events which cannot unambiguously link an external hand label to a particular original note. Notes, MIDI or hand labels are not copied into reports or product builds (upstream **CC BY-NC-SA 4.0**, research only).

Two independent test protocols are reported side by side: **MIDI-only** with every original hand withheld (the conservative splitter may abstain), and **source/oracle-seeded** with at most the earliest independently labeled note from each hand provided as fixed identity per score island. In the latter, the fixed anchors are excluded from prediction denominators and all other hands and **all finger numbers** remain hidden. Each report separates eligible versus fully held-out notes, algorithm coverage, true agreement, false-hand assignments, unknowns and rejected islands. Seeded/source-assisted agreement is **not** real MIDI-only autonomous hand discovery, pianist-approved technique, or certified motion. No production auto hand hints, automatic fingers, original 14 PNG changes, SoundFont/MAESTRO/music timing changes, or learner release gating is altered. [Method and licence](docs/FG-04B4-R1-REAL-HAND-GT.md). Hand-thesia progress stays **35%**.



## FG-03D3 — Real piano polyphony does not mean the whole score is corrupt (v0.10.79)

**Research-only refusal correction, not auto fingering:** The pinned four-score FG-03D2 Chromium benchmark imported all four real ASAP MusicXML sources, but three complete pieces were previously rejected because independently notated **same-pitch notes overlapped in multiple score voices**. One physical held key cannot be independently played by two fingers, yet an overlap in a real polyphonic manuscript is **not evidence that every other note in the composition is invalid**. FG-03D3 precisely quarantines *the ambiguous overlap windows* and abstains from **all** consecutive source-onset transitions crossing them, without inventing fingers, changing note times, deduplicating voices or touching MIDI data. Safe consecutive score intervals outside those windows remain eligible **only** with original composer-written hand+finger pairs. Reports now separate physically ambiguous note clusters, affected unique source notes, merged time windows and conservatively skipped transitions. Authentic note/MIDI event identity failures still reject the whole score.

Original CI evidence: 4/4 sources imported; Bach prelude 549 source notes assessed but no author fingering; Bach fugue 752, Chopin etude 1,337 and Mozart sonata 1,201 notes previously globally refused as same-pitch overlaps. Across the original sample, **zero independent author hand+finger pairs and zero motion trials were available**. New code does not turn unverified fingers into evidence or claim musical/ergonomic accuracy. Test coverage includes clean movement islands on both sides of physically ambiguous repeated keys, simultaneous cross-hand unisons, chained note overlaps and source invariants. [FG-03D3 root-cause / contracts](docs/FG-03D3-OVERLAP-REFUSAL-TRIAGE.md). All research-only algorithms remain disconnected from learner guidance; Hand-thesia progress stays **35%**.



## FG-03D2 — Actual pinned real-score hand motion eligibility audit (v0.10.78)

The original **Play Along Chromium MusicXML importer** now feeds a separate, **research-only** feasibility audit across four revision-pinned, rights-reviewed *real* ASAP piano works (Bach prelude/fugue, Chopin etude, Mozart sonata). Source bytes are verified against exact Git hashes and sizes, and are never included in reports or shipped to Pages (ASAP **CC BY-NC-SA 4.0, research only**). The evaluator verifies original source note/tie IDs and MIDI note-on/off identity, counts only fully original author-provided hand **and** finger pairs, refuses duplicate/held physical keys, submillisecond collisions and incomplete simultaneous groups, then invokes FG-03D1 motion *only* on consecutive original onsets. The output is aggregate numbers of eligible/refused/moving/static decisions, never exported note/finger data. **No inferred finger, hand identity or pianist-approved motion is invented.** Real scores may have *zero* usable author labels; ground-truth musician accuracy remains **unmeasured**, not 100% or 0%. Detailed source and acceptance contract: [FG-03D2](docs/FG-03D2-REAL-SCORE-MOTION-EVIDENCE.md).

**First measured external result (2026-10-13):** all 11 source recordings validated; 242 complete GT polyphonic islands (1,467 original notes). Without hand anchors: **0/1,467** proposals (100% conservative abstention). With **404 known source GT hand anchors**, **1,063** notes remained held out; algorithm proposed hands for **325/1,063 (30.57% coverage)**, correctly matching **272** and incorrectly assigning **53** (**83.69% agreement ONLY among proposals**, **16.31% error among proposals**, **25.59% correct among all held-out**). Do not interpret source-assisted conditional agreement as MIDI-only accuracy. Still research **NO-GO**. [Measured evidence](docs/FG-04B4-R1-REAL-HAND-GT.md).

All player behavior, original 14 PNG hands, Source MusicXML, MIDI/Wait/Tempo/Ghost, SoundFonts, MAESTRO and the no-go research/learner boundary remain untouched. Hand-thesia progress stays at **35%**.



## FG-04D1 — Correct author/user provenance before hand-motion research (v0.10.77)

**Safety fix:** MusicXML that carries Play Along's **user-edited fingering** export marker is no longer treated as independently composer-authored fingering after reimport. The source still displays its note numbers, original pitches/rhythms and tied segments, but the imported digits are classified **unverified** and cannot supply automatic learner hand/finger guidance or count as authored fingering. This avoids silently treating a previous user's corrections as musical authority. To enable guidance, review and explicitly save source-keyed manual fingers **and hands** in the editor. A metadata marker is not a cryptographic signature, so originally authored and edited digits cannot be separated securely from a mixed exported file.

**Research-only FG-04D1 adapter:** A separate source reimport gate now compares every canonical MusicXML note/tie ID, voice/staff/part, full MIDI timeline and tempo map before passing only independently reimported author hand+finger pairs or matching locally saved user edits to the existing FG-04D0 hand/finger/motion research bridge. Forged note metadata, incomplete override pairs, mismatched score provenance and user-export fingers refuse or abstain; generated fingers cannot authorize motion. Node adversarial and real Chromium export→reimport tests added. **This adapter is not wired into learner guidance and does not imply pianist-approved hand motion.** [Source provenance contract](docs/FG-04D1-IMPORT-PROVENANCE-GATE.md). Hand-thesia progress remains **35%**.



## FG-03C2B7 — Source-verified tied-note cross-edition review (v0.10.76)

**✍ Аппликатура → 🔁 Перенос ручной аппликатуры** now allows an explicitly selected transfer of a previously edited *sustained* MusicXML note across score editions, where the importer merged two or more **written tie segments** into one MIDI note. All original `sourceNoteIds` must be present and have the complete start/stop(/start) chain; source and target must match in exact non-fingering MusicXML notation for **every segment**, including durations, pitch, staff, voice, and tie topology. The user selects the target, checks the note confirmation and separately acknowledges any conflicting author or user annotations. Changed segmentation/rhythm, malformed/orphan ties, excessive repeated matches and unverified note identity refuse. No automatic matching of ties, no generated fingers and no player/audio changes. The existing atomic single Undo/Redo applies. Tested using real Chromium XML→one sustained note→manual transfer/Undo, plus adversarial Node chains. [FG-03C2B7 contract](docs/FG-03C2B7-VERIFIED-TIE-CHAINS.md).



## FG-03C2B6 — Explicit review of ambiguous cross-edition fingering (v0.10.75)

**✍ Аппликатура → 🔁 Перенос ручной аппликатуры** now offers a separate, deliberately opt-in **manual reconciliation** path for repeated or modified MusicXML measures and author/user label conflicts. For each eligible old user correction, select the *exact* corresponding target note from a bounded list filtered by original part/pitch/voice/staff, tick a separate per-note confirmation, and independently acknowledge any author fingering or saved user override that would be overwritten. Nothing is preselected. No probabilities, nearest-time mapping or algorithmic finger guesses are treated as proof; score authorship must still be checked by the person resolving the notes. Ties, unsupported score navigation and excessive/ambiguous result sets refuse. Each approved batch is validated and persisted as one atomic Undo/Redo action; source XML, MIDI timing, author annotations and the 14 original hand PNGs stay untouched. CI includes adversarial conflict gates and real Chromium ambiguous-repetition/Undo regression. [Manual review contract](docs/FG-03C2B6-MANUAL-REVIEW.md).



## FG-03C2B5 — User-approved MusicXML edition reconciliation (v0.10.74)

The **✍ Аппликатура** editor can now compare a *previous original* MusicXML/MXL file (with locally saved manual corrections) to a newer open edition. **🔁 Перенос ручной аппликатуры из другой редакции** shows only source-verified matching notes in **unique unchanged measures**, with every transfer checkbox **unchecked by default**. The user explicitly approves individual candidates; accepted corrections are one validated, atomic **Undo** step. Duplicate/repeated bars, changed notation, cross-measure ties, conflicting author/user labels, different works and unsupported score navigation are refused or reported without guessed mappings. Neither source XML nor original MIDI timing is changed. This is data portability—not automated fingering or pianist validation. [Reconciliation contract](docs/FG-03C2B5-CROSS-EDITION-RECONCILIATION.md).



## FG-03C2B4 — Download corrected MusicXML (v0.10.73)

In **✍ Аппликатура**, explicitly download a **separate** `.musicxml` copy containing manually corrected numeric fingering. Before download, the entire source score is matched to canonical note IDs; non-fingering XML structure, original notes/measure timing, and MIDI events must survive reimport unchanged. The resulting XML carries an explicit Play Along **user-edited fingering** metadata marker and triggers a provenance warning on reimport. Hand-only corrections are reported but **not serialized as fabricated fingers**. Expanded repeat scores and unverifiable edits refuse export. Existing source MusicXML, local user correction storage, all 14 original hand PNGs, playback and research-only/no-go auto-fingering remain unchanged. [Details and limits](docs/FG-03C2B4-CORRECTED-MUSICXML-EXPORT.md).


Play Along is an independently hosted browser piano practice application with Web MIDI, Piano Roll, OpenSheetMusicDisplay (OSMD), MusicXML/MXL and MIDI import, optional online music catalogs, and Wait/Tempo/Listen practice modes.

**Live site:** https://shafranek-js.github.io/play-along/

## FG-04D0 — Research-only hand/finger/motion bridge (v0.10.72)

 Added a pure, bounded three-solver interface connecting experimental FG-04B4 RH/LH hand-separation summaries, FG-02I finger-planning **aggregate counts** and FG-03D1 verified next-unfinished-note motion screening. Only complete same-layer **MusicXML author** or explicitly **user-verified** hand+finger pairs may reach the motion planner; generated or ambiguous hands/fingers, partial overrides, prior unplayed onsets and partial chords fail closed. The original note timing/IDs, MAESTRO/SoundFont audio, all 14 original hand PNGs and learner preview are untouched. Registered 24 research regression tests, including incomplete previous chords and overlapping same-key voices blocking fabricated motion. **No learner auto-fingering, real-world hand-label accuracy or anatomical motion certification is claimed.** [FG-04D0 contract](docs/FG-04D0-RESEARCH-PROVENANCE-BRIDGE.md). Project Hand-thesia progress remains provisional 35% until independently accepted visual/pedagogical behavior.

**Parallel-PR CI policy (coordination update; no application release):** Research-only branches `research/fingering-ai-*`, `research/hand-motion-*`, `research/music-engine-*` and `qa/*` must provide dedicated `docs/FG-*.md` / `docs/QA-*.md` and are limited to research modules/tests/scripts/docs/data manifests; they cannot change production player, SoundFont/MAESTRO, shared README, package versions or CI. All **other** application/integration PRs still must update README and pass full existing tests. The Lead Architect merges compatible work, updates release docs/version and verifies deployment. This change does not itself increase Hand-thesia completion or enable auto-fingering.

**Single-chat development coordination (since 2026-10-13):** The owner discontinued parallel ChatGPT workstreams. The Lead Architect independently handles implementation, review, QA integration, release versioning and merging in one conversation, with isolated Git branches and mandatory GitHub Actions gates. The former [parallel-chat protocol](docs/PARALLEL-CHAT-DEV.md) is archived for historical traceability only; **no new worker/subagent threads** are required. This workflow clarification does not enable unverified auto-fingering.


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

**FG-03D1 / QA-01 research integration (v0.10.69):** Integrated an **unwired, research-only** hand-motion feasibility planner for source-author/user-verified *next unfinished* note groups; it checks held keys, hand crossings, reach/time and exact original piano geometry without modifying source note onsets/releases or all 14 original PNG poses. Lead review identified and fixed two P1 issues: late first calls now refuse infeasible movement instead of borrowing elapsed time, and other-hand target checks require matching score onset and repeat iteration. An identity-bound prior-motion token can continue an already authorized trajectory, but cannot alone prove physical correctness. Added 5 P1 regression cases to the original 35 synthetic motion tests; added independent QA-01 integrity/MIDI/fingering tests to the actual `npm test` list, covering immutable SoundFont bank checksums, PNG hashes, original MAESTRO files, note-event invariants and generated-hand NO-GO. **No animation or new auto-fingering is activated in the published player.** The planner's per-frame speed and biomechanics have **not** been professionally reviewed. See [FG-03D1 motion research](docs/FG-03D1-HAND-MOTION-FEASIBILITY.md) and [QA-01 checks](docs/QA-01-REGRESSION-BASELINE.md). No percentage change is claimed for overall Hand-thesia progress.

**FG-04B4 / QA-02 hardening (v0.10.70, research-only):** Independent QA demonstrated a hand-identity ambiguity: unannotated simultaneous pitches can be played by ordinary or crossed hands, even when a heuristic strongly prefers one. The standalone RH/LH splitter now returns **`unknown` with `UNANCHORED_HAND_IDENTITY`** for every unfixed note when the phrase has no independently pinned user/author/score hand. This sacrifices unverified suggestion coverage to avoid misleading certainty. Structural beam search now permits a feasible **10-note (5+5) chord** rather than rejecting it at the old nine-note cap, with a separate bounded **300,000 expansion** safeguard. Independent QA-02 synthetic tests are registered with full `npm test`; pre-fix 17/32 proposed including 2 hypothetical crossed-hand mislabels was **not** real pianist accuracy and must not be compared as such. No auto-fingering or generated RH/LH is enabled for teaching; neither source MIDI events, 14 owner PNGs, SoundFont assets nor MAESTRO changed. [QA-02 evidence](docs/QA-02-HAND-SEPARATION-VALIDATION.md) and [FG-04B4 research](docs/FG-HAND-SEPARATION-RESEARCH.md).

**FG-04B3e v0.10.71 (MusicXML repeat traversal, RESEARCH ONLY):** Added a conservative, independently written control parser for finite forward/backward repeats and explicit first/second endings, producing canonical written-measure references plus repeat-iteration playback identities without rewriting source MusicXML note IDs. It takes separately supplied **original written-measure durations**, preserves note pitch/onset/release and refuses nested navigation, unsupported ornament/grace timing, unpaired endings and unbounded playback. A strict optional original MIDI comparison must verify all note onset/release events within 2 ms; the planner does **not** prove original XML tempo equivalence or enable repeat playback in the player. **28 dedicated Node tests** are registered with the full regression suite. In four licensed pinned ASAP repeat examples all still have unresolved grace/ornament timing; **0 newly aligned, 4 refused**, and the established ASAP 16-piece baseline remains **1 matched / 15 refused**. This does not enable automatic generated learner finger hints. Original MAESTRO, SoundFont, 14 PNG hand poses and musical transport remain untouched. [FG-04B3e research](docs/FG-04B3E-REPEAT-TRAVERSAL-RESEARCH.md).

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

## FG-04B3e Strict Repeat Traversal Research (v0.10.71)

- Added a research-only finite MusicXML repeat and first/second ending expansion API which keeps original written source note IDs unchanged and assigns separate playback iteration identities. It refuses unsupported nested repeats, post-jump navigation, grace and unresolved ornament timing; original MusicXML/MIDI and physical note durations remain untouched.
- Registered 28 independent synthetic regression scenarios with `npm test`; two fixtures require strict original MIDI **pitch, NoteOn and NoteOff** equivalence, not just matching repeat notation. Real ASAP repeat works: 0/4 now fully aligned due to unsolved grace timing; no fabricated improvements or learner fingering enabled.
- Unchanged published SoundFont/MAESTRO catalogs, 14 original transparent hand PNG poses, Wait/Tempo/Listen and previously integrated experimental hand/motion safety gates.


## Conservative RH/LH Uncertainty and QA-02 Acceptance (v0.10.70)

- Hardened research hand separation after independent QA-02 found that a preferred unanchored LH-low/RH-high duet need not be the player's actual physical hand arrangement. An unanchored whole phrase now abstains instead of labelling that preference as reliable; author/user anchored paths remain research-only proposals.
- Extended bounded search to 10-note two-hand chords and added a 300,000 mask-evaluation budget. Registered new hand-separation and independent QA-02 tests with standard `npm test`, preserving exact source notes, timing, user corrections and NO-GO learner status.
- Development ownership has returned to **one Lead Architect chat**. Old parallel-thread coordination instructions remain only as archival background; existing older PRs are reviewed, integrated or closed here, not delegated to new chats.


## Research-only Motion Feasibility and QA Gates (v0.10.69)

- Added the independent `planAnticipatoryHandMotion` research API and 40 synthetic/refusal/immutability test cases (including five independent P1 regression cases). It does not import into production UI and never changes audio, MusicXML, MAESTRO or hand PNGs.
- Added and **registered** new QA-01 checks for all 14 original transparent poses, the two SoundFont bank hashes and all 256 documented GM inventory programs, MAESTRO source pins, strict MIDI onset/release/tempo behavior, provenance and research candidate abstentions. Hashes alone do not prove audible PCM; real Chromium SoundFont/MAESTRO suites still run in full PR CI.
- Preserved experimental fingering NO-GO and the existing 500–1000 ms Ghost preview. The new planner's 50–200% research transport envelope does not change the currently published Ghost selector/speed limits. [FG-03D1 technical contract](docs/FG-03D1-HAND-MOTION-FEASIBILITY.md).


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

## FG-04C7 — Original PianoMotion MIDI/Pyodide bridge (local development only)

The Play Along research build can now invoke **the owner's actual PianoMotion Studio `handthesia_core.api.analyze_midi` Python algorithm** on the **already opened and saved MIDI file**, entirely inside an opt-in local browser Worker. This is **not the Play Along JavaScript Beam Search**. The new local-only asset staging script checks original Python, wheel and Pyodide runtime SHA-256 manifests from a prepared private PianoMotion checkout; the browser calls the real algorithm using exactly those pinned sources and refuses repaired/mismatched MIDI.

**Standard `npm run build` and GitHub Pages do not ship the private runtime.** Because PianoMotion's upstream Python redistribution terms and an unused SoundFont bundled inside its pretty-midi wheel are unresolved, normal public users cannot see or use the original PianoMotion MIDI control yet; the local-only staging command must never be used for a public deployment until rights are cleared. The local preview returns read-only, explicitly unverified predictions and never adopts/generated finger numbers for learning. No actual private-engine browser UAT has been certified by the public CI.

[Developer staging commands, original-source contract, provenance and release gates](docs/FG-04C7-ORIGINAL-PIANOMOTION-PYODIDE.md). Existing MusicXML, original MIDI bytes, playback, SoundFont and fourteen supplied PNG hand assets remain unchanged.
