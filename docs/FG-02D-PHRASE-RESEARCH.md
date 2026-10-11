# FG-02D — Phrase-aware fingering research (NOT activated)

**Status: isolated research-only candidate generator. Production Play Along still uses
the user's original hand PNGs and existing authorised MusicXML/demo fingers.**

## What problem this prototype addresses

FG-02C found five exact-reference discrepancies (out of 20). A simple FG-02A
five-state dynamic program tends to optimize local pairwise movement, missing
the *whole-phrase* consequences of a thumb passage across the octave boundary.

FG-02D adds **structural reference-phrase hypotheses** to the research code.
These are *not* measured optimal fingerings and are *not* a port of PianoPlayer.
To avoid pretending we have a universal model, it uses a deliberately narrow
set of two-octave and close-position candidates, then applies all previously
existing validation checks.

## Decision procedure

1. Calculate the original FG-02A monophonic or FG-02B polyphonic answer first.
   If the baseline rejects an input, FG-02D does **not** override that refusal.
2. Identify a complete phrase by exact interval sequence and physical onset:
   - 15-note, two-octave ascending/descending **major scale**
   - 7-note, two-octave ascending/descending **major triad arpeggio**
   - 3-key close-position **major-triad root / first / second inversion**
3. Restrict recognition to root keys **C, D or G major**. C and G are present
   in the development references; D is *only a transposition-based metamorphic
   test*, not independent pedagogical ground truth.
4. Instantiate candidate fingers from explicit pedagogical *patterns* (rather
   than merely retuning adjacent-note finger-motion weights).
5. **Reject** the candidate on any conflicting original author/user finger,
   conflicting known hand, black-key first-finger restriction, or failed
   independent physical-invariant audit. In these cases the **baseline wins**.
6. Otherwise return a separately labelled
   `strategy:'reference-phrase-candidate'` with
   `source:'proposed-phrase-hypothesis'` for all newly suggested fingers.
   Original fixed fingers retain `source:'anchor'`.
7. Never compute a fake cross-model ergonomic cost or a fake confidence
   percentage: `totalCost:null` is intentional for phrase candidates.

No note identity, onset, pitch, duration, hand attribution or user anchor may
be silently altered.

### Reproducible research comparison

- `npm run benchmark:fingering` — **unchanged** FG-02C baseline.
- `npm run benchmark:fingering:phrases` — baseline **vs FG-02D** on the same
  20 development-reference examples. Both outputs and statuses are preserved.
- `npm test` includes a dedicated FG-02D test suite.
- CI uploads `artifacts/fg02d-phrase-comparison.json` with the comparison.

**This is an in-sample development test**, because the phrase templates were
designed to address FG-02C discrepancies. Even a perfect 20/20 result would
**not** be an independently measured accuracy figure, and is not a deployment
acceptance criterion. Transposed D-key tests are invariance checks, not a
blind test against professionally annotated D-major scores.

## Explicit exclusions

This version deliberately does not assign fingers to ordinary MIDI by
pitch, analyze unknown or mixed hands, generalize to all 12 keys, optimize
polyphonic counterpoint as a whole, decide between stylistically alternative
fingerings, recognize finger substitution, or drive the on-screen hand poses.
Unsupported shapes always remain with the old FG-02A/FG-02B research baseline,
**not** any default user hint.

## Next independent evidence needed

- Expert-reviewed, independent score selection across different keys,
  rhythms and articulation; collect examples *without using them to construct
  templates* before applying them as a genuine held-out test.
- Confirm flexibility of patterns for small/large hands and curved/sliding
  thumb passages with an actual keyboard and pianist.
- Integrate **only if and when** musical coverage, partial-finger handling,
  hand ownership and user editing have their own approval and UAT.
- Label any future automatic proposal distinctly from authored instructions,
  and never claim Web MIDI can detect physical finger identity.

**FG-02D is not approved as learner-facing automatic fingering.**
