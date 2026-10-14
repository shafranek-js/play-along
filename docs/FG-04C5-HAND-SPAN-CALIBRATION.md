# FG-04C5 — User-friendly hand-span calibration (v0.10.88)

## User goal
The user need not guess `XXS`–`XXL`. In the browser fingering editor's existing research panel, **«Как определить мой размер кисти?»** asks the maximum **comfortable** thumb–little finger keyboard interval separately for RH and LH and whether it felt easy, noticeably stretched or painful. For example, C4–E5 is a **tenth** and an easy, relaxed tenth suggests `L` at the current Play Along FG-04C3 pair-span model. This captures a subjective preliminary span only; it does not measure finger 2–3/3–4/4–5 reach.

The current solver only accepts one hand-size scalar for both hands, so where two estimates are available it deliberately selects the smaller one. With only one hand tested it labels the estimate **provisional**. When stretching is noticeable the estimate is reduced one level rather than encouraging a strained reach; if pain/discomfort is reported it produces **no recommendation**. Very large reported spans cannot automatically choose XXL; users may still manually select any existing enum based on other evidence.

## Technical behavior and data hygiene
- Pure `src/core/hand-span-calibration.mjs` function `recommendHandSpanProfile({RH,LH})` evaluates only bounded enum values without making physiologic diagnoses or changing user input.
- Browser DOM owns only temporary form answers; the saved preference is `state.fingerBrowserHandSize` in `src/legacy/parts/00-runtime.js`, validated against `['XXS','XS','S','M','L','XL','XXL']`. Thus it uses the existing localStorage and strict backup-restore validation, not a new storage mechanism or new sensitive stored data.
- `src/legacy/parts/35-fingering-editor.js` shows the proposed size and explicit `Использовать этот размер` confirmation. Confirmation invalidates stale worker proposals and makes the selected size the default for subsequent FG-04C4 browser calculations; manual changing the original size select is still permitted.
- The new questionnaire is behind a normal button/div within the existing details panel. No extra nested `summary` (existing real Chromium editor tests depend on stable selectors). Responsive CSS shows RH/LH side by side where space permits, stacking on narrow screens.
- MusicXML author fingers, hand annotations, user overrides, note pitch/onset/release, original 14 owner PNG poses, actual player timing and SoundFont/MAESTRO are unaffected. No Python or PianoMotion dependencies introduced.

## Regression acceptance
Run `node --test tests/hand-span-calibration.test.mjs`, full `npm test` and browser `tests/browser-fingering.real.test.mjs`. Cases include relaxed tenth→L, smaller left hand→S, strained reach downgrade, pain refusal, incomplete one-hand status, untrusted inputs, no automatic XXL, source immutability, Chrome UI calculation, localStorage persistence/reload, disabled apply on discomfort and retained source correction state.

This is a **guided selection of a heuristic search parameter**, not an objective anatomical profile or recommendation to force any interval. No claim of measured fingering accuracy improvement; the algorithm remains research-only, Hand-thesia roadmap percentage unchanged until independent acceptance.
