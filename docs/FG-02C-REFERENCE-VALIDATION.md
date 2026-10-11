# FG-02C — sourced educational reference benchmark and independent audit

**Status:** offline research verification only. Automatic fingering stays disabled in the user interface.

## Evidence-based reference dataset

`research/fg02c-reference-cases.json` contains **16 explicitly contextualized educational reference examples**. We manually transcribed their pitches and finger numbers from the following public study references:

- [C major scales](https://piano.org/scales/major/c/) — RH/LH, one octave ascending and descending, two octaves ascending.
- [G major scales](https://piano.org/scales/major/g/) — RH/LH, one octave ascending and descending; includes F sharp.
- [C major arpeggios](https://piano.org/arpeggios/major/) — RH/LH **one-octave finishing** and **two-octave continuing** fingerings.
- [C major triad](https://piano.org/chords/major/c/) — root-position simultaneous C–E–G for RH/LH.

These are **sourced pedagogical examples, not teacher-adjudicated ground truth** and **not the only physically sensible fingering**. Arpeggio fingerings depend on whether the passage finishes or continues; different reputable methods may teach different LH fingerings. Inversions without referenced specific finger sequences are handled by physical audits but are **not labeled gold standards**.

## How to reproduce

- `npm run benchmark:fingering` runs the existing FG-02A mono and FG-02B chord prototypes **without injecting expected fingers**, and prints each reference's **EXACT**, **DIFFERENT_VALID_CANDIDATE**, **REJECTED**, or **PHYSICAL_CONFLICT** status.
- `npm test` runs independent auditor tests and verifies input preservation. It does **not** falsely force every algorithmic suggestion to match a context-dependent example.
- The optional environment variable `FG02C_REPORT=/path/to/file.json` writes a full JSON report.
- A second benchmark run **with author anchors** tests whether engines preserve externally supplied fingering instead of overwriting it.

The comparison reports note-level exact match separately from case-level exact match. A different choice is an **investigation target**, not automatically a physical impossibility.

## Independent physical-invariant audit

`src/core/fingering-audit.mjs` checks emitted pitches/onsets/durations, hand assignment, original anchors, duplicate voices on one physical key, physically conflicting same-hand key presses, crossing fingers, and approximate hand span. The auditor does **not** import or call either proposal engine and is suitable for verifying future variants.

This is a limited biomechanical model. The spread thresholds are uncalibrated and cannot determine whether a proposed fingering is ergonomically optimal for a particular player.

## Remaining release gates

1. Independent pianist review of mismatched examples, with exact context (tempo, articulation, continuation, hand size) and a broader licensed score corpus. No false claim of expert validation.
2. Additional independently annotated reference data for inversions, chromatic passages, polyphonic voice-leading and multi-hand redistribution.
3. Browser/mobile benchmarks on real instruments/devices; a Node CI performance sample does not represent all hardware.
4. Offline pass/fail reports for explicit author anchors and impossible overlaps, including adversarial random fixtures.
5. Only after approval: implement worker/caching and opt-in UI that **always labels suggested fingers as suggestions** and preserves author/user choices.

**No automatic fingering is enabled by this patch. Original Play Along PNG hand poses and next-target guidance remain unchanged.**
