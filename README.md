# Play Along — Modular Project v0.10.0

Standalone browser piano practice application. This is a **structure-first migration** of Play Along v0.9.1, not a rewrite.

## Quick start (Windows 11)

1. Install [Node.js LTS](https://nodejs.org/) if it is not installed.
2. Extract the ZIP archive, open the `Play_Along_Project_v0_10_0` folder in VS Code / Terminal.
3. Run `npm run dev`.
4. Open **http://localhost:4173/** in Chrome or Edge and grant browser MIDI permission the first time.

The project ZIP **already includes `dist/`**, so building is optional. To run the prebuilt version with a web server, execute `npm run dev`. `dist/index.html` also opens directly, but Web MIDI and filesystem access depend on browser security restrictions, so localhost is recommended.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve the prebuilt `dist/` on localhost:4173; reflects changes after `npm run build` |
| `npm run build` | Rebuild `dist/index.html`, `dist/assets/app.css` and `dist/assets/app.js` from `src/` |
| `npm test` | Check deterministic build, source integrity, JS syntax, HTML structure and key feature entry points |
| `python tests/browser_smoke.py` | Optional Chromium regression (needs Python Playwright and Chromium) |

No npm dependencies are required for building or serving. Development can proceed entirely offline, though online music catalogs and OSMD (currently fetched from CDN) need network access.


## GitHub Pages — public test environment

The app can be published at **https://shafranek-js.github.io/play-along/** after the repository exists, the files are pushed, and Pages is enabled. **This URL is not claimed live until verified.**

The repository contains `.github/workflows/pages.yml`: each push to `main` rebuilds the static site, runs `npm test`, and publishes `dist/` with GitHub Actions. No npm dependencies and no secrets are required.

**One-time setup (repository owner):**

1. Create a public repository named `play-along` under account `shafranek-js`. Create it **empty** (no README, license, or .gitignore) if pushing this project directly.
2. Push the entire project to the `main` branch. Do not upload the ZIP itself as the sole repository file.
3. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. Visit **Actions → Test and deploy Play Along** to check the first deployment, and then open the Pages URL.

Local development remains `npm run dev` (127.0.0.1:4173). GitHub Pages serves the same built HTML/CSS/JS over HTTPS so Web MIDI permissions can work in Chrome/Edge. MIDI input must still be explicitly authorized by the browser if not previously allowed. Actual hardware behavior cannot be fully validated in CI.

**Important:** moving to GitHub Pages creates a new browser origin, so IndexedDB/localStorage from `file://` or localhost will not automatically appear on the published site. The published repository and built JS are publicly visible; don't add private files or tokens. OSMD is currently loaded from an external CDN, and music catalogs need internet access.

## Structure

```text
Play_Along_Project_v0_10_0/
├── src/
│   ├── index.html                  # HTML markup only
│   ├── styles/app.css              # Application styling
│   └── legacy/parts/              # Feature-oriented source files
│       ├── 00-runtime.js           # Settings, app state and shared utilities
│       ├── 10-keyboard-adaptation.js
│       ├── 20-workspace-ui.js
│       ├── 30-sheet-music-osmd.js
│       ├── 40-audio-transport.js
│       ├── 50-practice-scoring.js
│       ├── 60-performance-review.js
│       ├── 70-piano-roll.js
│       ├── 80-midi-devices.js
│       ├── 90-smart-practice.js
│       ├── 100-folder-browser.js
│       ├── 110-mutopia-catalog.js
│       ├── 120-musetrainer-catalog.js
│       ├── 130-asap-catalog.js
│       ├── 140-library-musicxml.js
│       ├── 150-musescore-reader.js
│       ├── 160-library-import.js
│       ├── 170-mutopia-downloads.js
│       ├── 180-library-ui.js
│       └── 190-app-bootstrap.js
├── scripts/
│   ├── build.mjs                   # Deterministic, dependency-free builder
│   ├── dev-server.mjs              # Static local HTTP server
│   └── manifest.json               # Ordered feature list
├── tests/build.test.mjs            # Migration integrity tests
├── dist/                           # Runnable application
├── package.json
└── LICENSES.md
```

## Migration guarantees and current architecture caveat

**Guaranteed:** JavaScript feature source concatenated in manifest order recreates the v0.9.1 IIFE **byte for byte** before applying the app version stamp (`0.10.0`). CSS and HTML DOM contents come directly from v0.9.1. Original Web MIDI, Web Audio, OSMD, Piano Roll, Wait mode, local import, library and online catalogs remain unchanged.

**Not yet complete ES module isolation:** The feature files deliberately share the old lexical scope when bundled. They are not individually importable ES modules. This intermediate approach avoids breaking cross-feature global state and call order. Follow-up work should progressively move to explicit dependency-injected modules (`audio/`, `midi/`, `score/`, `library/`) with tests, ideally in small independently reviewable changes.

**OSMD is not bundled locally yet:** The genuine OSMD renderer is requested from CDN on demand, exactly as in v0.9.1. A truly offline notation view will require vendoring and verifying a particular OSMD distribution, followed by real-browser rendering tests. No license-restricted third-party files were copied into the ZIP.

**Version migration:** Browser storage keys/IDB schemas and user settings are not changed; the app retains existing library and MIDI preferences in the same browser origin. Moving from `file://` to `http://localhost:4173/` changes the browser's origin, however, so the browser may not automatically show files/data previously saved under `file://`.

## Testing limits

The automatic browser smoke test uses a simulated OSMD renderer and simulated ASAP HTTP responses. The actual OSMD code path and live MicroLab mk3 remain to be verified in an unrestricted Chrome/Edge session. This CI environment denies `page.goto()` to every URL, including localhost. The browser smoke therefore validates the HTTP files via Python first and injects the same built JS/CSS into a Chromium document instead of claiming real browser network navigation passed.

## Persistent library & preferences (v0.10.1)

- Imported MIDI, MusicXML/MXL and MuseScore files are stored in **IndexedDB** under `Моя коллекция` and the last active saved work is automatically restored after reload.
- Each composition has its own selected track, Wait/Tempo mode, speed, view (Piano Roll or Sheet Music), zoom, accompaniment, adaptation, repeat region, bookmarks and last position.
- Global settings such as MIDI device preferences, keyboard calibration, volume, labels, and window layout are remembered in browser localStorage.
- These preferences belong to the browser profile and web **origin** (`https://shafranek-js.github.io`): private browsing, clearing site data, switching browser/device or storage eviction can remove local records. Files are **not uploaded to GitHub**.
- `npm run test:browser` verifies real OSMD and persistence across browser reloads with two distinct imported scores.
