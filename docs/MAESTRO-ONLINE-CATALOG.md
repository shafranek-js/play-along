# MAESTRO v3.0.0 — Online Library (MAE-04A, Play Along v0.10.64)

## What the user sees

In **Библиотека → Онлайн-библиотеки**, choose **♩ MAESTRO · 1 276 MIDI** or select **MAESTRO · Piano MIDI** in the source dropdown. The index is downloaded only on explicit selection (not during initial page load), is searchable using the existing Library title/composer search, and uses the existing paginated result rows. Metadata includes composer, title, performance year, original split and duration; no difficulty grade or author-fingering claim.

Click any recording to open its actual Disklavier MIDI in Piano Roll / Wait / Tempo. On first playback attempt, the browser downloads Google's official **MIDI-only ZIP (~56 MB)**, verifies SHA256 against `70470ee253295c8d2c71e6d9d4a815189e35c89624b76d22fce5a019d5dde12c`, indexes the ZIP central directory and extracts only the selected MIDI entry. It verifies the entry's uncompressed size, CRC32 and `MThd` header. The ZIP remains in memory only for the current tab; subsequent selections reuse it. The opened individual MIDI may be saved locally in IndexedDB using the **existing** original-file storage and provenance path, retaining the source license and homepage link.

When remote ZIP downloading is not possible due to CORS/network restrictions, the user can download the exact official MIDI-only archive using the source link in the UI and click **Подключить ZIP с компьютера**. The same strong SHA256 and entry-integrity validation applies. Importing an arbitrary different ZIP is rejected. **The full ZIP is never stored in the app's persistent library, backups or website bundle.**

## Sources and rights

- Official dataset: https://magenta.tensorflow.org/datasets/maestro — **Google LLC**, MAESTRO v3.0.0.
- Official metadata CSV: https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.csv
- Fallback CSV mirror: https://huggingface.co/datasets/projectlosangeles/maestro-v3.0.0/resolve/main/maestro-v3.0.0.csv
- Official MIDI-only ZIP: https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0-midi.zip
- License: **CC BY-NC-SA 4.0** (attribution, non-commercial use, share alike). Source link and license are shown on the catalog and saved records. Public redistribution or commercial use needs separate rights review.

These are **expressive concert performances** with variable timing, MIDI velocity and pedal controller data. They are **not** structured MusicXML scores and carry **no verified anatomical left/right finger assignments**. The library never marks fingering as verified merely because a MIDI track contains distinct channels or pitches. Sheet Music notation is not falsely generated. The existing practice clock/transport handles MIDI; musicological correctness is not validated merely by being in the catalog.

## Tests and acceptance

`tests/maestro-online.real.test.mjs` verifies the actual filter, 1,276-record CSV validation, title/composer search, no background ZIP download and unsafe-metadata rejection in Chromium. The dedicated MAESTRO GitHub Actions workflow also downloads/checks the **official ZIP**, opens a real selected MIDI via the local-archive fallback in Chromium and verifies the player title and application state, alongside existing full corpus SHA256/pin gates. `tests/build.test.mjs` requires the new manifest part and DOM anchors; the standard browser suite includes the lightweight no-network catalog test.

- [ ] Real official-CORS metadata retrieval in the deployed production origin: test outside GitHub Actions if the browser reports a network error. A fallback mirror and user-driven retry exist, but CORS of an external host can change.
- [ ] Accessibility/mobile/large-list QA on a real user's browser beyond Chromium CI.
- [ ] Offline persistence of whole MIDI-only ZIP: **not implemented** by design (56 MB + storage/quota/backup risk).
- [ ] Teaching difficulty ranking, matching MusicXML score, automatic finger assignments: **not implemented**.

MAE-02C's 24 source-frozen QA corpus remains independent; the catalog does not limit users to those 24 recordings.
