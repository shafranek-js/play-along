# P0-A2 — Genuine PianoMotion Python vs Play Along FG-02I (14 October 2026)

## What was actually executed

GitHub Actions [successful genuine Python comparison](https://github.com/shafranek-js/play-along/actions/runs/38562825923) invoked **the original, checked-in PianoMotion Python `handthesia_core.api.analyze_midi`** through the owner-authorized `scripts/fg04c2-run-pianomotion.mjs` launcher. No Worker stubs, fake candidates or generated reference fingers were used in the recorded outcome. The corresponding original Play Along implementation `runExistingPlayAlongFingeringResearch` invoked **FG-02I** directly.

Five SHA-256-pinned hand-authored [Piano Protege Curriculum](https://huggingface.co/datasets/riyaranjan/piano-protege-curriculum) Stage 3 excerpts (CC BY-SA 4.0) provide 148 note events. Their signed finger labels establish hand ownership (RH/LH) and a **single published finger reference**; they are *not* independent, adjudicated expert consensus or a unique correct fingering.

For each work `makeP0A2Cohort` converts published note-on/off times to a private **60 BPM, 9600 PPQ, two-hand SMF**, without embedding reference finger numbers. Quantization is within one tick (1/9600 s), not bit-identical to an original MusicXML/MIDI. An independent MIDI parser checks note count, exact event ordinals and injective event signature mappings. Both engines receive the same musical note events and the known hand labels (Python via RH/LH track names, FG-02I as explicit source hand). Therefore **this experiment assesses finger choice with supplied hand ownership, not automatic hand-separation accuracy**.

PianoMotion receives only those MIDI bytes, **never the reference finger array**. Real Python analyses are computed twice per work, verified against the original MIDI SHA-256 and the output's original `sourceEvent` note-on/note-off ordinals, pitch and 2-ms physical start/end tolerance; failures are reported as abstentions/not-run, never silently joined by pitch alone. Source-preserving 50-ms internal normalization is handled by separately restoring original raw source event timing. Each run's candidate set is compared with the same withheld single-finger reference only **after both engines have finished inference**.

Parameters: Python 3.12, `pretty_midi==0.2.11.post0`, `mido==1.3.3`, `numpy==2.2.6`, `six==1.17.0`; Play Along FG-02I handSize M and beamWidth 40. PianoMotion engine SHA: `99243fa5335e6cca95a5c09f34d1dedb0225b73e88f0d9b358ababfaed2c3f4d`. The aggregate snapshot is frozen in [research/p0a2-real-python-aggregate-2026-10-14.json](../research/p0a2-real-python-aggregate-2026-10-14.json).

## First real results

| Excerpt | Notes | FG-02I matches | PianoMotion matches | Both exact same assignment |
|---|---:|---:|---:|---:|
| Bach Minuet in G major (dataset) | 32 | 25 | 22 | 24 |
| Für Elise theme | 36 | 15 | 22 | 22 |
| Au clair de la lune | 22 | 22 | 22 | 22 |
| Frère Jacques | 32 | 15 | 12 | 24 |
| Amazing Grace | 26 | 10 | 9 | 25 |
| **Total** | **148** | **87 (58.78%)** | **87 (58.78%)** | **117 (79.05%)** |

All 148 finger candidates from each engine were present; both engines returned complete proposals on all five works. The independent hard-key-conflict screen reported zero blocked notes on this very small corpus; **zero heuristically observed physical conflicts does not prove anatomical playability**. Both real Python runs per case agreed exactly.

Among all 148 note identities, the algorithms selected the same hand/finger for 117 and different assignments for 31. Both agreed with the dataset on 77 notes; only FG-02I matched on 10, only PianoMotion matched on 10, and neither matched on 51. **Do not read "both wrong" as "both unplayable":** a different valid fingering may be deliberately chosen and yet disagree with the single publisher's numbers. In the 31 disagreements, 11 choices were different and neither matched the reference.

The wall-time numbers printed in the machine report are **not comparable engine benchmarks**: the Python number includes process startup and module imports, while FG-02I is measured inside a warm Node.js process. This benchmark measures note agreement, not speed or teaching effectiveness.

## Reproduction

From the repository checkout, on a machine with Python 3.12 and Node.js 22:

```bash
python -m pip install "numpy==2.2.6" "pretty_midi==0.2.11.post0" "mido==1.3.3" "six==1.17.0"
node --test tests/p0a2-fingering-comparison.test.mjs tests/p0a2-evidence-snapshot.test.mjs
node scripts/p0a2-real-fingering-benchmark.mjs --all --repeat 2
```

For one pinned work, run `node scripts/p0a2-real-fingering-benchmark.mjs --case fur-elise-theme --repeat 2`. Python executable can be set via `PYTHON` environment variable. Optional `--output local-aggregate.json` writes a **new** private aggregate-only file (never overwrites an existing file). Input PIG text is downloaded from the exact 40-hex-character dataset commit and SHA-256 checked; failure of downloads, different source hashes, missing Python dependencies, identity collisions or nondeterministic output fails clearly. The temporary, reference-free MIDI and full Python JSON envelope are deleted after each case; source notes, fingers and recording data do not appear in stdout or the recorded JSON aggregate.

CI: [`.github/workflows/p0a2-real-python-benchmark.yml`](../.github/workflows/p0a2-real-python-benchmark.yml) executes the real Python analysis on each matching push and by manual dispatch. The existing Pages and Chromium checks remain independent.

## Implications and next accepted work

1. The current evidence **does not** show an advantage for either solver on this hand-labelled corpus. Do not blindly alter Python figure penalties, beam widths, thumb under rules or Play Along's candidate router on the strength of 148 correlated notes.
2. Collect a *separate* permission-cleared source-identical cohort with independently reviewed and adjudicated finger choices, true polyphonic chords, inversions, thumb passages, voice overlaps, repeated pitches, hand crossings and different hand spans. Pre-register a development/held-out split and require MIDI/MusicXML source identity proof for every event.
3. Report finger accuracy with full denominators and per-technique cases; hand separation must be evaluated separately on independent hand labels not passed as input. Recognize alternative acceptable fingerings rather than assuming one teacher's fingering is unique.
4. Only after measured held-out improvement, independent validation and source/third-party-rights checks should new solver weights affect lesson-grade guidance. **`researchOnly=true`, `productionEligible=false`, `expertValidated=false`, Hand-thesia completion 35%** remain unchanged. Optional PianoMotion IK is separate and stays opt-in behind its safety gates.

This is a genuine research comparison, not a promise of automated performance grading or a certification of anatomical correctness.
