# LAUNCH-01 F0 — third-party source rights preliminary audit (14 October 2026)

**Outcome: RIGHTS-NOT-ESTABLISHED for the adapted Hand-thesia Python source.** This is engineering provenance and launch-policy documentation, **not legal advice**. It does not itself establish copyright ownership, sublicensing authority, a license, or permission to redistribute.

## Verified upstream facts

Source: [V9011N/pygame-piano-animator](https://github.com/V9011N/pygame-piano-animator) at the exact source revision `f8189c021d9235005fb35faa2c8cfbc09a3768a0`, already recorded by the PianoMotion code manifest.

- The upstream GitHub repository metadata currently reports **`license: null`**.
- The exact commit's Git tree contains README and requirements files but **no root or nested LICENSE/COPYING/NOTICE grant** identifiable from the published file tree.
- Consequently, no applicable upstream *public license grant* has been established from that repository. This does **not** mean the files are public domain or that all usage is prohibited in every context; the owner must obtain and document an appropriate right to reuse and publicly distribute the actual derivatives.
- [PianoMotion Studio](https://github.com/shafranek-js/pianomotion-studio) is the project owner's own application. Owner approval to integrate that application does not automatically resolve rights inherited from unrelated upstream authors.

## Actual redistribution surface

Play Along's [build script](../scripts/build.mjs) copies all sources below `src/pianomotion-python/python-core/` into `dist/assets/pianomotion/python-core/`, including the checked-in `handthesia_core` package. The site has publicly served those sources from GitHub Pages since its original Python integration.

The frozen [`source_manifest.json`](../src/pianomotion-python/python-core/handthesia_core/source_manifest.json) describes **12** Python files with individual SHA-256 digests, the exact original PianoMotion engine version and desktop source commit. Integrity hashes prove what was copied, not the licenses or originality of those files. The [third-party notices](../THIRD_PARTY_NOTICES.md) identify the upstream authors but **attribution does not create redistribution permission**.

Additional components requiring separate review before commercial launch: Pyodide distribution and fetched Python packages/wheels, OSMD, SpessaSynth/SoundFont banks, owner-generated hand images, and all distributed music repertoire. Research datasets (ASAP, MAESTRO, PianoVAM, Piano Protege) must be kept outside commercial/public bundle scope unless their separate licenses expressly allow it.

## Required release decision (F0)

One of these must be established **before describing a public beta as rights-cleared**:

1. Obtain a grant from the actual upstream rightsholder sufficiently covering public distribution and adaptation of the relevant source files within Play Along, including any intended commercial future; archive the written grant outside the public repository as appropriate.
2. Identify an existing explicit compatible license that actually covers those specific source files/revisions and comply with its conditions.
3. Replace every copied/derivative restricted component with an independently authored, appropriately licensed alternative; audit and compare provenance per file, then prove the replacement still passes real-browser Python/functional QA.

Do not infer a grant from public GitHub availability, absence of a LICENSE file, a repository fork, or attribution. If the license cannot be resolved, **do not approve F0**; work can continue on locally-developed transport, reader, UI and optional safe features.

## What this audit does and does not block

- **Does block**: declaring `LAUNCH-04 PUBLIC BETA LICENSE APPROVED`, or asserting that the bundled Hand-thesia-derived Python is license-cleared.
- **Does not block**: private/local research, independent tests on permitted input music, engineering fixes to our original importer and player, or a future public release built entirely from cleared/replaced code.
- **Does not require**: a professional piano reviewer team. Independent pianist quality assessment is a distinct optional post-launch workstream.

**Status:** `F0=BLOCKED` until a documented rightsholder/license/replacement decision is verified. No grant has been obtained or claimed during this task. Public deployment of the existing copied Python should be reviewed promptly by the project owner.
