# LAUNCH-01 — Real browser Pyodide end-to-end acceptance

**Status: engineering PASS (22-note genuine browser sample). Public beta / external copyright rights: NOT cleared.**

## Actual source and execution

On 14 October 2026, GitHub Actions [LAUNCH-01 true browser Python workflow](https://github.com/shafranek-js/play-along/actions/runs/38617719233) installed Chromium, built the same production assets as Pages, and executed **the shipped, genuine** `pianomotion-engine-worker.js`. It fetched `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs`, loaded the pinned Python runtime, installed the genuine PianoMotion dependencies and ran the actual `handthesia_core.api.analyze_midi` code. **No mock Worker, fake result or substitute native Python CLI** was used in this acceptance path.

The music was the authentic, SHA-256-pinned **Au clair de la lune**, 22-note excerpt from the [Piano Protege Curriculum](../research/fg02g-repertoire-manifest.json) (CC BY-SA 4.0). Its contributor's reference fingers were **not sent to the solver**. A temporary, finger-free derived two-track MIDI was generated from that source without redistributing score material in the repository, GitHub Pages or QA artifacts. The sample was not the user's personal MIDI upload and does not by itself represent all score types or difficulty levels.

## Observed pass criteria

| End-to-end check | Confirmed result |
|---|---|
| Genuine ESM Web Worker | **PASS** |
| Actual pinned Pyodide 314.0.7 module requested | **PASS** |
| Original Python PianoMotion completed | **PASS** |
| Import and mapping to source note events | **22/22** |
| Hard physical contradiction flags in test sample | **0** |
| User explicitly pressed Apply (no automatic acceptance) | **22 generated fingers applied** |
| Original note IDs, pitch, onset and physical release after Apply | **unchanged** |
| Browser MusicXML download | **PASS** |
| MusicXML reimport | **22/22 notes** |
| Reimported generated finger numbers labelled unverified user export | **22/22** |
| Generated numbers masquerading as composer annotations | **0** |

This is **functional integration proof**, not musical/pedagogical endorsement. It does not prove that all 22 choices are ergonomically valid or coincide with an expert's preferred fingering.

## Genuine network outage and recovery

The same successful workflow separately ran [`tests/launch01-pyodide-offline.real.test.mjs`](../tests/launch01-pyodide-offline.real.test.mjs) using the actual production Worker with the official CDN `pyodide.mjs` request forcibly blocked by Chromium's network layer. **No Worker result was synthesized.** Exactly one real CDN request was blocked; the Worker produced the explicit `PYODIDE_RUNTIME_DOWNLOAD_FAILED` error, the interface described the need for an internet connection, restored the Calculate button and kept Apply/Export disabled. All source MIDI note data remained unchanged. The independent online test succeeded after access was available, proving a fresh calculation can work in the supported Chromium environment; the two scenarios are not a proof of uninterrupted session-level state recovery without a page reload.

The browser integration code handles a user pressing **Отменить расчёт** while loading dependencies by terminating the Worker and refusing late messages. That scenario has a separate real-browser mocked-async-response regression, not a live CDN throttle benchmark.

## Reproduction

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
node tests/launch01-pyodide-offline.real.test.mjs
node tests/launch01-pyodide-real-browser.real.test.mjs
```

The second command requires internet to the pinned Piano Protege excerpt on Hugging Face, the jsDelivr-hosted runtime and Python wheels. Source SHA-256 is validated before use; download errors must fail rather than substitute fabricated fingering. The workflow runs on matching changes and can be triggered manually. Output reports source hashes, counts, source preservation and QA gates, **never the copyrighted MIDI, source note list or reference fingers**. Aggregates with provenance are frozen in [the QA JSON](../research/launch01-real-pyodide-browser-2026-10-14.json) and checked by a test.

## Remaining release limitations (non-expert beta)

- **Third-party rights unresolved:** parts of PianoMotion's Python source derive from Hand-thesia / pygame-piano-animator without a verified redistribution license/permission. [Third-party notices](../THIRD_PARTY_NOTICES.md) explicitly record this. Successful execution and attribution are NOT legal clearance to distribute those modules on public GitHub Pages.
- Actual user-supplied musical files of different complexity, unsupported patterns, corrupt and very large MIDI, repeated same-pitch overlaps, MXL and independent source score roundtrips need further integration/regression testing.
- Audio via device speakers, a physical MicroLab mk3 or other MIDI controller, transport Wait/Seek/Loop, pedal hardware and Safari/mobile were not covered by this Pyodide test. Real hardware UAT cannot be honestly claimed from headless Chromium alone.
- Independent professional pianist review of automatic finger correctness is **not a public-beta requirement**, but without it the product must continue to label calculated fingers as **editable, unverified suggestions**.

**Next LAUNCH-01:** true original-MIDI mixed track/stress cases; audio/transport and hardware manual UAT; code and asset license/permission verification; only then approve beta release. The original Hand-thesia research estimate 35% is separate from player launch readiness.
