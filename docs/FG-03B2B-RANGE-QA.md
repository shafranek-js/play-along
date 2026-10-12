# FG-03B2B-1 — Automated piano-range and hand-pose safety matrix (v0.10.46)

**Status:** FG-03B2B-1 engineering acceptance was automated in v0.10.46. **Subsequent milestone FG-03B2B-2 was confirmed accepted by a pianist by the project owner on 2026-10-12.** The underlying individual musician review cases were not supplied with that confirmation; the automated eight-view matrix is still not, by itself, anatomical evidence. No claims are made regarding automatic fingering, which remains disabled for learner guidance.

## Root causes fixed

1. **Preview keyboard without a calibrated MIDI device:** selecting a target preview range (25, 49, 61 or 88 keys) and then "calibrated/device display" incorrectly launched calibration, because the prior check looked only for a physical `getProfile()`. The display now accepts `targetKeyboard()`, which returns either a physical calibrated device or an explicit virtual preview, while an unsupported physical-only request still triggers calibration. Selecting the range now forces `resizeCanvas()` immediately, so actual piano geometry matches the setting without waiting for a resize event.
2. **Incomplete on-screen chord represented as a full hand:** `fingerGuidanceSpritePlacement()` previously filtered **away** any trusted finger note outside `pianoGeom.byPitch`, and fitted one of the original PNG hand poses to the remaining visible subset. That could imply that the hand is correctly positioned for the entire source chord. Now the sprite is rejected if **any** source-authorized note of that hand is outside the selected piano range; in-range independently authored numeric key badges remain available. Both current and future Ghost placements obey the same rule. This does **not** modify source MusicXML data.

## Automated QA matrix

`tests/finger-guidance-ranges.real.test.mjs` is a real Chromium browser run, included in `npm run test:browser`. It uses an explicitly authored two-hand score fixture containing a C-sharp black key and an upper-register source chord. It uses the real target range and display controls, not private state mutation, and runs all combinations:

| Keyboard preview | MIDI low–high | Wide desktop | Narrow mobile |
| --- | --- | --- | --- |
| 25 | 48–72 | screenshot + JSON | screenshot + JSON |
| 49 | 36–84 | screenshot + JSON | screenshot + JSON |
| 61 | 36–96 | screenshot + JSON | screenshot + JSON |
| 88 | 21–108 | screenshot + JSON | screenshot + JSON |

For each matrix entry, the test asserts the exact piano MIDI bounds and key count, correct virtual preview selection without any attached MIDI device, readable white-key geometry (horizontal scrolling rather than tiny keys), correct black-key pointer hit testing for C-sharp, unchanged source-authorized finger/hand data, and valid lookahead. In the 25-key case it additionally asserts that an off-range upper note **cannot** produce a misleading full PNG silhouette; only safe, source-backed target markers remain.

Evidence: eight captured PNG screenshots and `geometry-matrix.json` are produced in `artifacts/finger-range-review/` and uploaded from PR GitHub Actions with the name `fg03b2b-piano-range-visual-review`. They provide a repeatable **visual UAT checklist**, not automated proof of anatomical accuracy.

## Acceptance / remaining risks

- Build: `npm run build`.
- Deterministic release/security/musical invariants: `npm test`.
- Real Chromium (including range matrix): `npm run test:browser`.
- Independent source-annotation requirements from FG-03A–FG-03B2A and fourteen original owner PNG assets remain unchanged.
- Pianist review still required to approve real wrist/arm routes, thumb-under, finger changes on black keys, and two-hand crossings. A passed geometry check **must not** be marketed as expert confirmation of fingering, and FG-02 automatic fingering remains NO-GO for learner guidance.

[Roadmap](ROADMAP-FINGER-GUIDANCE.md) · [Conservative motion predecessor](FG-03B2A-SAFE-MOTION.md)
