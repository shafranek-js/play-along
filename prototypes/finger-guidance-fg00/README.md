# Finger Guidance — FG-00 Visual Proof of Concept

**Status:** isolated UX prototype; not shipped in Play Along.  
**Baseline:** main v0.10.26 / `108aec40d0c612205f6323c306d42cdb82ab6e8d`.

Open **index.html** in a browser, or serve this folder using a local static HTTP server. Everything is self-contained. No npm dependency is required to use the prototype.

## Scenarios

Five manually fingered examples: C-major right-hand scale, right-hand thumb-under, C-major triad and inversions, octave hand shift, and synchronized left/right hand triads.

Switch between three views: **digits only**, **schematic 2D hands**, **hands + next ghost**. Step backward or forward, use demonstration playback, display a transition preview, and toggle note names and trajectory.

The piano key placement uses the same original geometry formula as `src/legacy/parts/70-piano-roll.js`. All procedural SVG hand drawings are original to this prototype, not copied or traced from PianGo or `hands.zip`.

## Scope boundary / risks

This is a **visual feasibility prototype**, *not* an automatic piano fingering engine. Fingerings are supplied by scripted fixtures; Web MIDI, WebAudio, scoring, library, persistence, OSMD and production app are not accessed. Ghost placement and interpolated transitions are schematic and **have not been anatomically or pedagogically validated**. We do not claim to identify which real finger a MIDI player uses.

On small displays the keyboard scrolls horizontally rather than shrinking below legible key widths.

## Acceptance / review

1. Review five scenarios in each display mode and compare readability of the fingers and hand-to-key alignment.
2. Verify LH orange / RH blue, chords, thumb-under cue, octave movement, and right/left overlap.
3. Verify next ghost appears only in ghost mode; play/next/previous and transition preview remain deterministic.
4. Check desktop, tablet, mobile, dark/high zoom accessibility and reduced motion preferences.
5. Have a piano teacher assess pose geometry **before** any real-product integration.

## Test

From repository root after `npm ci` and Playwright Chromium installation:

```bash
node prototypes/finger-guidance-fg00/smoke.mjs
```

FG-00 does not mutate `main`. Next phase FG-01 requires UX approval.
