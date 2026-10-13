# SoundFont: orchestration and acceptance

Started 2026-10-12 against Play Along v0.10.39, commit `144f884a5ee4534ba0254edb74c12df9cedab652`.

On 2026-10-13 the user explicitly authorized integration into main and GitHub Pages publication as v0.10.63, with memory usage and dense GeneralUser clipping deferred. Earlier statements below about publication not being authorized describe the preceding implementation phase. The release carries the verified functional implementation; it does not claim those two budgets or physical/Safari acceptance are complete. Generated test artifacts referenced below are retained locally and as CI artifacts, not bundled into the site.

## Integration onto the parallel developer's current version

The user reported ongoing parallel development. Root initially fetched **v0.10.58 / `92665cf`**, 22 commits and 88 changed files ahead of the initial base. A subsequent fetch found four more research commits, **v0.10.62 / `97af55b`**. Current integration work is isolated at **`C:\Projects\play-along-soundfont`**, branch **`codex/soundfont-two-banks`**, fast-forwarded to that latest verified commit while retaining SoundFont edits. The original dirty `C:\Projects\play-along` checkout and its plans, audits and evidence remain preserved. No commit or push has been made. The four overlapping metadata/CI files were backed up and merged before the fast-forward; inputs and results are preserved in `artifacts/audio-sf05/v01062-integration/`.

Before applying feature code, the current v0.10.58 baseline passed its build, **316/316 unit tests**, and **all 20 browser scripts** with the pinned test tooling. Its 22-part manifest, fingering editor, source note provenance, user corrections, library layout, new research modules and version branding are protected. SoundFont edits are transferred with an explicit three-way comparison against the initial v0.10.39 base. Conflicts in settings, MusicXML provenance, bootstrap, appended CSS and CI are reviewed by their owners; upstream features are not replaced wholesale by the older source. Tests for the integrated result are a separate gate and remain pending.

The implementation follows `Play_Along_SoundFont_Implementation_Plan.md`. The user requested GPT-6 Luna with Extra High reasoning for all subagents. Root orchestrates work, reviews evidence and returns corrections to the assigned owner.

## Ownership

| Agent | Model / reasoning | Assignment |
| --- | --- | --- |
| sf00_engine | GPT-6 Luna / xhigh | Standalone engine spike, worklet queue cancellation, channel isolation and audition UI |
| sf00_banks | GPT-6 Luna / xhigh | Official pinned banks, reproducible acquisition/conversion, hashes, inventory and licenses |
| sf00_verify | GPT-6 Luna / xhigh | Independent PCM browser tests and environment/result records |
| root | Orchestrator | Architecture review, independent verification, phase decisions and user communication |

The initial spike is partitioned under `research/soundfont-sf00/`; production ownership is recorded below. Existing user plans, audits, fingering work and supplied PNG files are protected.

## Phase status

| Phase | Status | Acceptance evidence |
| --- | --- | --- |
| SF-00 | Technical PCM/UI checks passed; memory target and musical acceptance open | Final ownership-enabled build report, WAV pair, root UI acceptance and native-memory reports |
| SF-01 | Technical loader gate passed | Both production banks, prefix-safe delivery, cache/readiness/error states, real PCM and bank swap |
| SF-02 | Parser gate passed | Real-browser MIDI/XML/MSCX fixtures; canonical events and scoring-note contract |
| SF-03 | Chromium worklet and application transport gates passed | Exact file note identity, fanout/cancellation, real Wait/Tempo, speed/seek/loop and sustain/drum PCM |
| SF-04 | Full Chromium UI and Firefox loading smoke passed | Both banks, live instruments, retry/Panic, persisted settings and current/legacy backup compatibility; 390px layout inspected |
| SF-05 | In progress | Full regressions and production performance/memory measurements; musical and hardware acceptance open |
| SF-06 | Pending | Default mode and release verification |

SF-00 does not pass on mocks or a successful library installation. Cancelling currently sounding voices alone is insufficient: future NoteOn and stale NoteOff must be invalidated. Recorded evidence must distinguish browser PCM timing from physical MIDI-to-speaker latency and subjective listening quality.

## Current evidence and review

- Root baseline: production build PASS, 181/181 unit tests PASS, all 12 browser scripts PASS.
- Root independently reran pinned bank acquisition/hash/inventory verification: both banks cover all 128 GM bank-0 programs. GeneralUser has 287 active headers (261 melodic + 13 kits + 13 bank-120 aliases); MuseScore General has 309 active headers and 37 kits.
- Standalone build and localhost page/worklet HTTP checks PASS. GeneralUser SF3 conversion is pending: the required native converter is absent; a decoder or opaque quality callback is not proof of equivalent conversion settings.
- Root code review returned lifecycle/error handling, disposal guards, bounded queues, clock alignment, and build-relative URL corrections to the engine owner. The verifier additionally checks sample-window coverage and runtime melodic presets independently of drum aliases.
- Initial Chromium verification **did not reach PCM**: Playwright 1.55.1 caused AudioWorklet module loading to hang without requesting its URL. This matches upstream [Playwright issue 37592](https://github.com/microsoft/playwright/issues/37592). The isolated prototype pins Playwright 1.56.1; Chrome 154.0.8037.98 then loads and renders. Production testing now also pins Playwright 1.56.1 and uses its bundled Chromium 141.0.7390.37.
- The post-rebuild serial real-PCM suite passed on Chrome 154 at 48 kHz. Both banks expose 128/128 melodic GM programs at runtime. GeneralUser full engine checks cover future NoteOn/NoteOff cancellation, fresh same-pitch survival, file/live control isolation, same-frame Program Change order, 16 MIDI channels, percussion and bounded initialization failure. MuseScore receives the bank/runtime inventory and comparable audition checks.
- Final software immediate-live dispatch-to-PCM p50/p95: 0.292/0.521 ms across seven trials; worklet scheduler p95 error: 0 ms, against a two-render-quantum target of 5.333 ms. These figures include sample attack but exclude physical MIDI and speaker/device latency. They are not a broad performance benchmark.
- Final suite artifacts bind the exact built engine and worklets by SHA-256 in `research/soundfont-sf00/results/verification.json`. Root independently checked those hashes against current files.
- Root independently ran the actual audition UI after final source/CSS fixes: seven checks passed, no unhandled page errors. Checks include WAV capture with serialized bank controls, acknowledged engine disposal on bank swap, same AudioContext and retained settings, network/parse failure recovery, stale capture visibility and a 390 px viewport. Root inspected the real mobile screenshot and corrected a CSS rule that overrode the hidden download link.
- The MIDI 1 backend's FIFO release still defers a later overlapping same-pitch NoteOff until the older note releases. It can extend the shorter note. This is tested and documented, not exact per-note lifetime acceptance. `channel-allocation-review.md` specifies a bounded overflow-channel solution to implement and prove before SF-03.

Evidence: `research/soundfont-sf00/verification.md`, `results/verification.json`, `results/ui-root.json`, and `results/pcm/*-sf00-audition.wav`. The two 7.8-second dry WAVs use equal MIDI state and shared master gain; neither is independently normalized. The numerical difference between them establishes distinct renders, not a preferred sound.

## Memory result and SF-01 decision

The native Windows Chrome process-tree probe completed both banks. Its primary measure is the observed sampled increase in summed private bytes from the cold-page median; it includes the audio service and other launched browser descendants, unlike JS heap alone. It can miss short transients, and the working-set sum can count shared pages more than once.

| Bank | Initial observed increase | Owned-buffer run | Initial 160 MiB target |
| --- | ---: | ---: | --- |
| GeneralUser SF2 | 165.18 MiB | 172.60 MiB | FAIL |
| MuseScore General SF3 | 218.07 MiB | 190.34 MiB | FAIL |

The opt-in owned-buffer API removes an avoidable bank clone and its default mode preserves the reusable caller buffer. The verifier proves both behaviors against the real worklet, including before/after SHA-256. The measurements do **not** establish a GeneralUser memory improvement; its cold baseline also changed. The target was not relaxed. Both complete reports are preserved in `results/memory/windows-final.json` and `windows-owned-buffer.json`, with source/dist hashes in the latter. Twenty repetitions are same-bank phrase cancellations, not twenty bank replacements or imported songs. Physical MIDI and repeated bank-replacement memory remain unmeasured.

The user's continuation starts SF-01 foundation work. The user then delegated bank selection and explicitly requested both banks with a switch. Both are supplied, with GeneralUser default on its verified coverage and lower observed resource cost. We are not waiting for the user to select one bank, and no subjective preference is claimed. SF-00 queue cancellation and group isolation have passed, so delivery/loader work proceeds. The memory goal, exact overlapping-note lifetimes and musical/release acceptance remain open. This foundation does not yet switch production playback or mark SF-00 fully accepted.

SF-01 ownership: `sf00_engine` owns new `src/audio/**`, root package/lock and the audio build extension; `sf00_banks` owns new `src/assets/audio/**` and original notices/catalog; `sf00_verify` owns build-test extensions and new audio tests. Owners coordinate the manifest/API before edits. Root reviews integrity, lifecycle/cache behavior and runs the agreed regression pass once the final source is ready.

The two pinned bank binaries total 68.87 MiB. The deliberately authorized static audio artifact budget is 80 MiB to accommodate both banks, catalogs, modules and notices. Only the selected bank is fetched at runtime; Cache Storage entries use content hashes. This delivery-size decision does not change the 160 MiB memory goal.

SF-02 ownership: `sf00_banks` owns only file parsing in `80-midi-devices.js`, `readMusicXML` and `museRead`. Live MIDI handlers, transport, user PNGs and fingering algorithms are protected. The verifier adds independent canonical-event fixtures after SF-01 checks stabilize. Ordered audio events retain the original scoring/timing data and source note identity.

## SF-01/SF-02 gate and integration ownership

Root verified the SF-01 PASS report `artifacts/audio-sf01/runs/real-browser-2026-10-12T12-29-19-817Z-7796-PASS.json` and matched its three built-module SHA-256 values to the actual dist files. Both banks have 128 runtime GM programs and finite, nonzero cold/warm PCM. The test proves one explicit network fetch per bank, content-hash cache separation, source-buffer preservation versus opt-in ownership transfer, silent old voices/future notes after bank replacement, one retained AudioContext, retained master/effects settings, and bounded acknowledged disposal. Audition timing includes scheduled lookahead and is not an immediate-live latency measurement.

The first real preparation run exposed an incorrect metadata-versus-preset API assumption. The worklet now resolves the public SoundBank preset before accessing voice parameters and PCM samples. The failing built files are retained under `artifacts/audio-sf01/diagnostics/preparation-metadata-failure/`. A subsequent test-report binding failure is retained separately; neither failure is erased by the later PASS.

Root full unit suite: **203/203 PASS**. All **12 original browser scripts PASS**; the new parser script and production audio script passed in separate focused runs after their corrections. This is not one uninterrupted 14-script PASS. Parser evidence includes source MIDI controls and note identity, MusicXML instrument/channel/bank/drum mappings, MuseScore initial instruments, all 15 available melodic channels, and front/rear pan fixtures.

SF-03 owner `sf00_engine`: `src/audio/**`, `40-audio-transport.js`, and live MIDI handlers only in `80-midi-devices.js`. It implements preflighted file-note lanes, logical-channel controller fanout, queue cancellation, seek/resume/loop/wait and isolated live playback. SF-04 owner `sf00_banks`: HTML/CSS, settings sanitizer in `00-runtime.js`, UI in `20-workspace-ui.js`, and bootstrap wiring in `190-app-bootstrap.js`. The agreed classic-IIFE bridge is `audioEnsureReady`, `audioSwitchBank`, `audioSelectLivePreset`, `audioPanic`, `audioSetMasterVolume`, `audioGetStatus`, `audioSubscribe`, `audioListPresets`, and explicit `audioSetSimpleFallback`. The verifier owns independent PCM, transport and settings/UI tests. Root serializes rebuild and actual-audio gates.

The standalone preview runs at `http://127.0.0.1:4179/`; it does not establish application integration. HTTP readiness is not audio acceptance.

Root independently checked the file-note planner against all **720** six-note release permutations, using a longest-decreasing-subsequence lower bound and per-lane FIFO invariants. **9/9 focused tests PASS**, including explicit melodic channel 10 and equal-time source order. The worklet now has 80 physical channels: file base 0–15, live 16–31, and three file overflow lanes per logical channel at 32–79. Real crossing-note PCM and application transport remain pending; pure tests alone do not establish exact audible release.

Root rebuilt and ran `tests/audio-gm.real.test.mjs`: **128/128 programs in each bank, 256/256 total PASS** on bundled Chromium 141.0.7390.37 at 48 kHz. Each program is prepared, sounded at pitch 60 / velocity 100, cancelled, and measured with finite nonzero stereo PCM. The preserved report is `artifacts/audio-sf05/runs/gm-2026-10-12T18-11-42-177Z-65972-PASS.json`; it binds actual built-module hashes and both bank hashes. This proves central-note sound presence, not timbre quality, full keyboard range, dense-song headroom or memory acceptance. Dependency audit: **0 vulnerabilities**.

During the initial SF-04 integration, sidebar/settings/live-handler source existed before its application bridge was complete. That provisional build was not application acceptance. The bridge and real app gates subsequently passed as recorded below. All three agents reached usage limits during the first integration turn; after the user's continuation, root resumed their tasks with the same requested Luna / xhigh configuration.

## Current v0.10.62 verification

The integrated build passes with all 22 upstream source parts and 72,831,050 bytes of delivered audio. The first v0.10.58 integrated unit gate passed **347/347** tests. After the v0.10.62 fast-forward and live-event correction, root rebuilt and passed **395/395** unit tests (`artifacts/audio-sf05/unit-v01062-final.log`); dependency audit reports **0 vulnerabilities**. Complete browser regression and the subsequent Panic ordering correction remain separate gates. An initial v0.10.62 unit attempt used stale v0.10.58 dist and correctly failed build-consistency checks; its log remains alongside the rebuilt passing run.

Root's real worklet suite passed on GeneralUser in `artifacts/audio-sf03/runs/real-pcm-controls-chromium-2026-10-12T18-47-58-635Z-33224-PASS.json`. Two crossing note lifetimes on one logical channel match the independent two-channel reference exactly (PCM relative error 0, correlation 1); identical FIFO stimulus is detected as different. Sustain, RPN pitch range, bend and pressure fanout also match exactly. File cancellation suppresses its spectral component to 0.000586 of reference while preserving the live component at 0.960878. An invalidated old NoteOff after CC123 leaves the new same-pitch voice identical to reference; an intentional early release is detected as different. Root matched actual built-engine/worklet hashes to the report.

Exploratory FAIL artifacts remain alongside PASS reports. A coverage self-check rounded an exact endpoint up one frame and threw outside its handler; this is corrected with absolute-time-derived tolerance, one-frame-gap rejection and bounded error handling. Controller and CC123 test references were also corrected to match the actual stimuli, including modulation state and the old release tail; thresholds were not relaxed. These failures did not establish a cross-group synth defect.

Application checks exposed and corrected a single-object preparation result treated as iterable, cloned score-note references used for visual identity, displayed zero-padded program numbers missing from numeric search, and raw SoundFont header bank 128 used incorrectly as a MIDI MSB. The bridge now uses runtime-normalized drum routing. Initial readiness, concrete missing-preset notification/persistence, all 128 GM options, keyboard instrument selection and numeric search have been reached in real UI runs. Complete switch/retry/Panic/settings/practice and all upstream browser regressions are still pending. UI screenshots and unique FAIL reports are preserved; a later PASS must not erase them.

Human listening and physical MIDI measurements cannot be inferred from synthetic browser tests. No phase completion or release acceptance will be claimed without its evidence. No commit, push or deployment is authorized by this implementation task.

Root's full Chromium settings gate passed in `artifacts/audio-sf04/runs/settings-ui-chromium-2026-10-12T19-29-06-889Z-47044-PASS.json`, including actual live kick/closed-hat/open-hat PCM, failed bank fetch and retry, active-playback bank/toggle cancellation, Panic PCM and current/legacy backup restoration. Desktop and 390px screenshots were independently inspected. Firefox 142 loading/selector/SF3-switch smoke passed in `settings-ui-firefox-2026-10-12T19-30-28-695Z-55432-PASS.json`; it does not establish the full Chromium-specific PCM/backup protocol on Firefox. Windows WebKit 26 lacked the AudioContext constructors; its preserved failure is an environment limitation, not Safari acceptance or a general Safari incompatibility finding.

The immediate-Panic-to-live-key race was confirmed from measured event times: NoteOn at 7.144333s was followed by delayed reset at 7.145333s, silencing the new hit. Reset and program-restore events now share the post-cancel current audio timestamp and precede subsequent notes. Root rebuilt before the passing settings gate. The real application transport gate also passed (`artifacts/audio-sf03/runs/practice-transport-2026-10-12T19-34-21-889Z-40784-PASS.json`). Loop PCM windows use actual NoteOn/cancel/next-NoteOn timestamps; the source note ends after the loop boundary, while the app suppresses its later Off and cancels the old epoch. Prior failed fixtures used an invalid pre-Play time anchor or demanded a future Off that the app correctly did not queue. Their FAIL reports and actual measurements remain preserved; the 5% quiet-window threshold was unchanged.

The first complete-browser attempt passed its first 11 scripts and then exposed an older fingering-PNG fixture reading motion immediately after asynchronous Play. Its original assertions are retained while readiness is awaited; the interrupted attempt is recorded in `artifacts/audio-sf05/browser-v01062-attempt1-FAIL.log`. This is not a complete 25-script PASS.

## Final functional regression, 2026-10-13

Root ran the complete **25-script browser chain without interruption: PASS**, then the final **395/395 unit tests: PASS**. Logs are `artifacts/audio-sf05/browser-v01062-final.log` and `unit-v01062-final.log`. The run includes the current real application transport, source-preserving hand PNG/editor regressions, both-bank cache/ownership/replacement, controls PCM, settings/Panic/backup and all **256 GM central-note renders**. The current GM report is `artifacts/audio-sf05/runs/gm-2026-10-13T05-23-10-119Z-34616-PASS.json`; it does not establish the full note/velocity range or subjective quality.

The second interrupted attempt is preserved in `browser-v01062-attempt2-FAIL.log`. Awaiting two rendered frames crossed the original fingering fixture's 1 ms zero-onset preview boundary, so the test legitimately saw no next preview. The fixture now shifts both authored onsets uniformly while retaining their 0.5 s interval, target notes, hand/finger attribution and strict paused/moving/stale/mobile assertions. Protected fingering product code and the 14 PNG assets were not changed. The final full chain includes this corrected test.

Firefox focused engine PCM passed in `artifacts/audio-sf03/runs/real-pcm-controls-firefox-2026-10-12T19-35-36-068Z-35444-PASS.json`. WebKit capability preflight explicitly recorded `AudioContext`, `webkitAudioContext` and `AudioWorkletNode` as undefined on a secure origin in `artifacts/audio-sf04/runs/settings-ui-webkit-2026-10-12T19-35-58-279Z-48492-UNSUPPORTED_ENVIRONMENT.json`. This result is not a functional PASS and does not substitute for Safari/iOS testing.

The first production performance probe failed before launching a browser because its manifest/array return shape was misread. The unique FAILED report is retained. The helper contract was corrected and a preflight-only command now checks bundle/asset/input consistency without making audio or acceptance claims. Actual production memory, dense PCM and warm live-input measurements are separate from the passing functional regression.

## Production measurement outcome and remaining work

The two-bank measurement `artifacts/audio-sf05/runs/audio-performance-2026-10-13T05-30-21-371Z-43656-438d0f2a-267f-4f23-9b30-6123eb864d87-FAILED.json` preserves a GeneralUser cold-counter failure and a complete MuseScore run. GeneralUser was then measured alone after improving the bounded native-counter diagnostics: `audio-performance-2026-10-13T05-44-53-937Z-43440-9fd88fd1-ba14-47b4-b746-02bd3c489fa2-COMPLETED_SUBSET.json`. These are separate runs; no complete two-bank performance PASS is claimed.

| Observation | GeneralUser GS | MuseScore General |
| --- | ---: | ---: |
| Synthetic app song load/play/pause changes | 20 | 20 |
| Valid prepared live-input PCM trials | 20/20 | 20/20 |
| Input-to-first-PCM p95, software only | 8.621 ms | 3.021 ms |
| Observed private-memory increase over cold-page median | 200.844 MiB | 411.688 MiB |
| 160 MiB initial memory goal | Unmet | Unmet |
| Dense fixture active notes / observed synth voices | 128 / 128 | 128 / 350 |
| Dense fixture peak at 40% volume | 2.440739 | 0.564383 |
| Dense fixture samples at or above full scale | 3306 | 0 |

Memory uses tagged fresh bundled-Chromium process trees and discrete Windows private-byte snapshots; it is not a continuous peak measurement or proof of a disposal leak. The dense stimulus deliberately duplicates eight pitches across all 16 melodic logical channels at velocity 100. GeneralUser therefore still needs output-headroom correction for this workload; the 395-unit/25-browser functional PASS does not close that gate. Physical MIDI latency, listening acceptance and Safari/iOS remain unmeasured.

The additional drum probe captured finite nonzero PCM for all 47 standard percussion pitches in each bank. Its exploratory report `drums-2026-10-13T05-40-21-800Z-24216-FAIL.json` remains FAIL because hi-hat comparison assumptions were invalid: preparation exposes a maximum exclusive-class sentinel across layers, and unrelated waveform phases invalidate direct samplewise comparison. A test-only event-aligned envelope revision exists but has not been rerun and is not included in the passing 25-script chain. It must not be presented as accepted choke coverage.

Local review preview: `http://127.0.0.1:4178/`, served by the isolated worktree. Root verified HTTP 200, v0.10.62 title, SoundFont controls and served app SHA-256 against dist. No commit, push or deployment occurred. After user feedback about time/token use, further exploratory expansion was stopped; the next narrow implementation step is GeneralUser output headroom, with memory optimization tracked separately.
