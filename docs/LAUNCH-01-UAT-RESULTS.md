# LAUNCH-01 — engineering UAT evidence and open prelaunch gates

**2026-10-14 · Play Along v0.10.102.** This report separates actual automated acceptance results from assumptions, hardware/rights items and potential blockers. An independent pianist panel is NOT needed for the public beta.

## Reproducible verified tests

Test: `tests/launch01-real-score-smoke.real.test.mjs` in [the successful browser workflow](https://github.com/shafranek-js/play-along/actions/runs/38607400028). It downloads exactly two pinned, **real piano scores** from the [ASAP real-score research manifest](../research/fg04b1b-asap-score-manifest.json); the bytes are validated against pinned Git blob SHA-1 and byte length, loaded into real Chromium via the exact production MusicXML and MIDI parsers, and are never copied or redistributed in this repository. ASAP license scope remains CC BY-NC-SA 4.0, for **noncommercial testing only**, not commercial distribution or bundling into the public site.

| Source (actual pinned score) | Browser MusicXML notes | Browser MIDI notes | MusicXML parser warnings | Outcome |
|---|---:|---:|---:|---|
| Bach — WTC I Prelude BWV 846 | 549 | 549 | 0 | **PASS** |
| Schubert — Moment musical No. 3 | 1,058 | 1,058 | 0 | **PASS** |
| **Total imported** | **1,607** | **1,607** | **0** | **PASS** |

For each pair both browsers parsed parts/tracks, note timestamps were finite and durations positive, MIDI playback event stream existed, and the test recorded no uncaught browser errors. These counts happen to match; **this does not certify event-by-event XML/MIDI alignment, expression, articulation, repeat expansion, musicological correctness or hand split.** The two warnings were identified as **false-positive MIDI port mixing**: each actual score uses exactly one port (port 1). The importer now warns only when multiple distinct ports coexist; an independent synthetic 1-versus-2-port fixture verifies that the genuine warning remains.

### MIDI note-on/note-off comparison — independent source cross-check

Test: [successful final diagnostic browser QA](https://github.com/shafranek-js/play-along/actions/runs/38613221446). In addition to the production MusicXML and MIDI browsers, `originalMidiSourceEvents` **independently parsed the pinned MIDI bytes**, matched original notes by pitch and chronological occurrence and checked that the actual browser MIDI physical key-down/key-up times agree with raw NoteOn/NoteOff ticks (constant score tempo for these specific two fixtures). **All 1,607 raw MIDI attacks and releases matched the imported events within floating-point error**. Therefore the score/MIDI release differences below were present in the source files and were **not introduced by the Play Along MIDI import**.

| Pair, at ±20 ms | Pitches same | Note onset | Physical note release | Largest release residual |
|---|---:|---:|---:|---:|
| Bach BWV 846 (549) | 549 | 549/549 | 549/549 | 1.04 ms |
| Schubert Moment musical 3 (1,058) | 1,058 | 1,058/1,058 | 479/1,058 | 157.55 ms |
| **Combined** | **1,607** | **1,607/1,607** | **1,028/1,607** | **157.55 ms** |

The Schubert source MIDI contains **568** releases about 158 ms before the corresponding notated MusicXML release, while 479 are within 1.5 ms; eleven others have different offsets. This is **source MIDI physical key gating versus MusicXML nominal note length**, not a parser truncation. It may reflect score-to-MIDI articulation or export conventions; the engineering test does **not** certify any particular composer's intended articulation. The application must **not silently lengthen/shorten either imported source** to force agreement.

Caveat: pitch+chronological occurrence comparison is not an authoritative XML-to-MIDI noteId join. Three simultaneous same-pitch contacts in Schubert remain ambiguous. No hand/finger inference, tempo edit or author provenance is claimed. The original raw-MIDI audit does prove the Play Along importer retains the MIDI physical NoteOff times accurately for these inputs. A pinned [machine-verifiable aggregate evidence file](../research/launch01-real-score-parity-2026-10-14.json) records the exact numbers and [unit tests](../tests/launch01-real-score-parity-evidence.test.mjs) fail if any reported denominator is changed without revision.

A deliberately simulated `PIANOMOTION_RUNTIME_FAILED` response to a real imported MIDI verified **one Worker start only**, immediate end of the pending state, disabled Apply/Export, unchanged source notes and accessible retry. This is failure/recovery testing; no live Pyodide inference was claimed.

Test: `tests/launch01-worker-cancel.real.test.mjs`, also in [Chromium QA](https://github.com/shafranek-js/play-along/actions/runs/38607400028). The formerly uncancellable Pyodide calculation now has `✕ Отменить расчёт`, visible only while the Worker is running. Cancel terminates the Worker and increments generation so late callbacks are ignored; restores Calculate; hides Cancel; retains the original MIDI and protects manual edits. A second click can create a new Worker and enable user-controlled preview when valid suggestions return. Regression is a genuine browser interaction with a deterministic **mock Worker**, not a benchmark of real Python or network reliability. It is separate from the previously verified actual Python in CI research benchmarks.

Earlier regression gates stay in place: the 547-note mixed guitar/flute MIDI user-controlled Apply/Undo/Redo and MusicXML reimport, source-time identity restoring the short-note release, structural conflict screen, and the Python research pipeline. Those simulations are **not equivalent to end-to-end live Pyodide network execution**.

## Additional true Pyodide acceptance — v0.10.103

A **separate** [genuine Python browser run](https://github.com/shafranek-js/play-along/actions/runs/38617719233) has now closed the previously open "Pyodide was only simulated" subcase for one real piece. It invoked the original Python algorithm through the shipped Chromium module Worker and external official Pyodide runtime, **applied all 22 valid predictions with original physical note timing unchanged**, downloaded MusicXML and reimported all 22 user-applied fingers without promoting them to author provenance. The same workflow demonstrated safe behavior under a real blocked Python CDN request. Reproducible scripts, aggregates and limitations: [live Python UAT](LAUNCH-01-PYODIDE-LIVE-UAT.md).

This **does not invalidate the limitations of earlier mocked failure tests** and is not representative of all MIDI sizes, hand sizes or musical genres. The full browser-complete, live Python criterion is passed for this 22-note sample, while end-to-end testing on the user's own specific uploaded MIDI and other complex material remains outstanding. Third-party redistribution permission is still unresolved.

## Unverified or blocked before a production-grade launch

| Gate | Present status | Owner action / criterion |
|---|---|---|
| F0 · Third-party code and assets rights | **OPEN / POTENTIAL RELEASE BLOCKER** | Verify original/adapted PianoMotion/Hand-thesia source redistribution permission, dependency licenses, sound fonts and generated/public music rights. Attribution by itself cannot grant rights. Commercial use additionally requires separate review of noncommercial datasets and artwork |
| F1 · Real source XML/MIDI parsing | **PARTIALLY VERIFIED** | 2 actual works, 1,607 browser note imports each format, independent raw-MIDI tick parity and 2 false port warnings fixed. Source MIDI/score nominal release differences remain, with 3 ambiguous same-pitch contacts; broader repeat/tuplet/pedal/corruption fixtures still open |
| F1 · MIDI → finger → exported MusicXML roundtrip | **REAL SAMPLE VERIFIED; BROADER COVERAGE OPEN** | Actual 22-note finger-free `Au clair de la lune` ran in browser Python and imported/exported successfully without source changes. Other user MIDI types, complex polyphony and large files not yet verified |
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

A new independent live Python workflow is documented above and separately tests actual Pyodide, unlike these earlier simulated failure scenarios.

**Next:** LAUNCH-01 follow-up should run the actual browser Python/Pyodide inference on imported real sources (including failure/offline recovery), test corrupt/long MIDI and MXL, transport Wait/Seek/Loop and locally verify audible output and physical MIDI keyboard. The third-party rights review remains a release gate, independent pianist recruitment does not.
