# LAUNCH-01 — engineering UAT evidence and open prelaunch gates

**2026-10-14 · Play Along v0.10.101 candidate.** This report separates actual automated acceptance results from assumptions, hardware/rights items and potential blockers. An independent pianist panel is NOT needed for the public beta.

## Reproducible verified tests

Test: `tests/launch01-real-score-smoke.real.test.mjs` in [the successful browser workflow](https://github.com/shafranek-js/play-along/actions/runs/38607400028). It downloads exactly two pinned, **real piano scores** from the [ASAP real-score research manifest](../research/fg04b1b-asap-score-manifest.json); the bytes are validated against pinned Git blob SHA-1 and byte length, loaded into real Chromium via the exact production MusicXML and MIDI parsers, and are never copied or redistributed in this repository. ASAP license scope remains CC BY-NC-SA 4.0, for **noncommercial testing only**, not commercial distribution or bundling into the public site.

| Source (actual pinned score) | Browser MusicXML notes | Browser MIDI notes | MusicXML parser warnings | Outcome |
|---|---:|---:|---:|---|
| Bach — WTC I Prelude BWV 846 | 549 | 549 | 1 | **PASS** |
| Schubert — Moment musical No. 3 | 1,058 | 1,058 | 1 | **PASS** |
| **Total imported** | **1,607** | **1,607** | **2** | **PASS** |

For each pair both browsers parsed parts/tracks, note timestamps were finite and durations positive, MIDI playback event stream existed, and the test recorded no uncaught browser errors. These counts happen to match; **this does not certify event-by-event XML/MIDI alignment, expression, articulation, repeat expansion, musicological correctness or hand split.** The two nonfatal MusicXML parser warnings still need to be investigated before assuming exact score parity.

A deliberately simulated `PIANOMOTION_RUNTIME_FAILED` response to a real imported MIDI verified **one Worker start only**, immediate end of the pending state, disabled Apply/Export, unchanged source notes and accessible retry. This is failure/recovery testing; no live Pyodide inference was claimed.

Test: `tests/launch01-worker-cancel.real.test.mjs`, also in [Chromium QA](https://github.com/shafranek-js/play-along/actions/runs/38607400028). The formerly uncancellable Pyodide calculation now has `✕ Отменить расчёт`, visible only while the Worker is running. Cancel terminates the Worker and increments generation so late callbacks are ignored; restores Calculate; hides Cancel; retains the original MIDI and protects manual edits. A second click can create a new Worker and enable user-controlled preview when valid suggestions return. Regression is a genuine browser interaction with a deterministic **mock Worker**, not a benchmark of real Python or network reliability. It is separate from the previously verified actual Python in CI research benchmarks.

Earlier regression gates stay in place: the 547-note mixed guitar/flute MIDI user-controlled Apply/Undo/Redo and MusicXML reimport, source-time identity restoring the short-note release, structural conflict screen, and the Python research pipeline. Those simulations are **not equivalent to end-to-end live Pyodide network execution**.

## Unverified or blocked before a production-grade launch

| Gate | Present status | Owner action / criterion |
|---|---|---|
| F0 · Third-party code and assets rights | **OPEN / POTENTIAL RELEASE BLOCKER** | Verify original/adapted PianoMotion/Hand-thesia source redistribution permission, dependency licenses, sound fonts and generated/public music rights. Attribution by itself cannot grant rights. Commercial use additionally requires separate review of noncommercial datasets and artwork |
| F1 · Real source XML/MIDI parsing | **PARTIALLY VERIFIED** | 2 actual works, 1,607 browser note imports each format. Need source event identity at pitch/onset/end, verify 2 MusicXML warnings and repeat/tuplet/pedal edge cases; corrupted and long multi-track files |
| F1 · MIDI → finger → exported MusicXML roundtrip | **PARTIALLY VERIFIED** | Prior real-browser file imports with simulated Python result pass; an actual real piece must be run through genuine Pyodide and result/export/reimport checked |
| F2 · Transport/audio hardware | **NOT VERIFIED HERE** | Audible speaker output, physical MicroLab mk3 (or other) MIDI input, connect/disconnect recovery, Wait/Seek/Loop/pedal interactions, mobile Safari/Android and offline handling need device tests |
| F3 · Fingering suggestions safety/control | **ENGINEERING TESTS PASS** | Suggestions are opt-in and marked unverified, detected hard physical contradictions withheld, author/manual finger protection and session Undo/Redo verified; does not establish pianist accuracy |
| F4 · Browser regression | **PASS on this checked commit** | Real Chromium tests include Worker cancellation and two real score imports. Re-run on final release commit and verify Pages version/SHA |
| F5 · Public beta disclosures | **IN PROGRESS** | State unverified finger quality, upload/data policy and licensing restrictions; publish clear known limitations and user feedback channel |

**No expert recruitment is required to complete any above gate.** Research P0-A2b human adjudication is deferred until after launch, separate from ordinary optional finger suggestion.

## How to reproduce

```bash
npm ci
npm run build
npx playwright install chromium
node tests/launch01-real-score-smoke.real.test.mjs
node tests/launch01-worker-cancel.real.test.mjs
```

The real-score test requires internet access to the exact pinned, SHA-verified ASAP GitHub source revision and tests it privately. The cancel test works without a real MIDI device and simulates only the asynchronous PianoMotion Worker response. The browser test does not automatically record or capture audio from speakers.

**Next:** LAUNCH-01 follow-up should resolve the XML parser warnings and test source pitch/onset/end mapping on the two real score pairs, then perform an actual browser Python/Pyodide calculation and locally validate hardware MIDI, before a rights-reviewed public beta.
