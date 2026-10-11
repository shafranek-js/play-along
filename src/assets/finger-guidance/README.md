# Finger Guidance PNG hands · v0.10.28

This pilot uses two **new AI-generated** transparent PNG hand illustrations, processed and optimized for the browser. PianGo is a UX reference only. No PianGo sprites, downloaded/traced artwork, or data are included.

- `left-hand.png` — left-hand overhead pose, orange accent; 438×520 approx., PNG-8 with transparency.
- `right-hand.png` — right-hand overhead pose, blue accent; 342×520 approx., PNG-8 with transparency.
- Source generated-image files are not distributed. Browser files are recompressed without external dependencies. The assets are checked into this repository and copied into `dist/assets/finger-guidance/` during build.

## Important limitation

These are **static reference poses**, not skeletal animation or pose-conditioned key presses. The existing demo fingering assignments determine the scored pitches, while the rendered hands are aligned by a constrained least-squares horizontal transform from known (manually calibrated) fingertip locations to the selected score notes. The thumb, index, middle, ring and little fingers cannot bend independently in a raster sprite.

Where a group has impossible or inconsistent fingertip coordinates, the sprite is suppressed and **exact numeric labels remain on the corresponding piano keys**. A default MIDI controller cannot detect which physical fingers are used.

The displayed numbers always follow the MusicXML/MIDI score-derived demo pitches, never the apparent fingertips in the PNG.

## Next stages

FG-01: import authoritative MusicXML fingering and stable score note IDs.
FG-02: editable finger assignments, hand selection and persistence.
FG-03: pose library for distinct hand shapes (closed, chord, thumb-under), tuned by musician review; eventually move to articulated rigs if needed.

Do not claim these generated PNGs have PianGo-level dynamic animation. Assess screenshot readability and biomechanical plausibility separately.
