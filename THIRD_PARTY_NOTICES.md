# Third-party attribution — PianoMotion / Hand-thesia

This notice identifies the provenance of the fingering and hand-motion
code included in the experimental PianoMotion browser integration
(FG-04C9 / Play Along v0.10.90 release candidate).

## 1. PianoMotion Studio (owner-authorized integration)

- Project: **PianoMotion Studio**
- Source repository: https://github.com/shafranek-js/pianomotion-studio
- Code copied into Play Along:
  `src/pianomotion-python/python-core/handthesia_core/`
- Original module entry point:
  `handthesia_core.api:analyze_midi`
- Source identity: see the preserved
  `src/pianomotion-python/python-core/handthesia_core/source_manifest.json`
  (per-file SHA-256 and engine version).
- The Play Along project owner has expressly authorized integrating their
  PianoMotion Studio work into Play Along.

This statement **does not assign a license** to the repository or imply
that the owner can license code contributed by unrelated rights holders.

## 2. Hand-thesia / pygame-piano-animator (upstream inspiration and derivatives)

- Original third-party project: **Hand-thesia — Animated Hands for Piano**
- Author account shown by GitHub: **V9011N**
- Repository: https://github.com/V9011N/pygame-piano-animator
- Desktop source revision identified by the preserved PianoMotion
  manifest: `f8189c021d9235005fb35faa2c8cfbc09a3768a0`
- PianoMotion's `handthesia_core` includes algorithms adapted in part from
  this upstream project, notably fingering, musical-figure and hand-motion
  methods. The adaptation/rewriting within PianoMotion does not itself prove
  that all upstream rights have been cleared.

**Rights status as of October 14, 2026: Not established for public redistribution.**

No `LICENSE` or `LICENSE.md` granting rights to reproduce, modify or
redistribute the original upstream source was found in the inspected
repository. Public access, forks, source code availability and this
attribution statement are **not** a copyright license.

Before public release of the copied/derived modules, record one of:
- A compatible explicit license published by the upstream rights holder;
- A written permission/grant from the upstream rights holder covering
  modification and public redistribution in Play Along; or
- A file-by-file independently implemented replacement supported by
  an appropriate provenance review.

Do not silently describe Hand-thesia as MIT, public domain, or otherwise
open-source licensed without supporting evidence.

## 3. Runtime and third-party dependencies

Browser execution also involves Pyodide and Python packages such as
NumPy, mido, pretty_midi, packaging, six and importlib-resources. Their
respective license texts and conditions must be reviewed for the specific
distributed artifacts and deployment method. Their licenses do not
confer rights to the separate Hand-thesia source.

## Attribution and technical verification are different

- **Attribution:** this file and the README identify whose work was used.
- **Source integrity:** the original SHA-256 manifest verifies which files
  were copied; it does **not** grant legal permission.
- **Functional acceptance:** CI unit/browser tests do not substitute for
  a real Pyodide execution test or independent evaluation of fingering.
- **Deployment:** the public GitHub Pages release should not include
  unlicensed third-party-derived code until the corresponding permissions
  are resolved.

This is a provenance notice, not a claim that any third party has endorsed
Play Along.
