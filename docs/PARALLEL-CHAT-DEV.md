# Play Along — parallel development across ChatGPT chats

> **Archived coordination protocol (2026-10-13):** The project owner ended multi-chat delegation because coordination was too complex. **All active Play Along development, PR review, QA integration and releases now run directly in the single Lead Architect chat.** This document preserves the previous multi-chat branch/file contracts for historical traceability only; do not open or delegate new subagent threads. The Lead can independently integrate work from existing GitHub PRs into fresh versioned branches and run CI before merge. The original research safety, SoundFont, MAESTRO, 14 PNG, source MusicXML/MIDI and README-per-release rules remain binding.

**Owner:** project user. **Coordination chat:** Lead Architect.  
**Canonical source of truth:** [GitHub repository](https://github.com/shafranek-js/play-along), current **main** plus merged PRs, not a chat's memory or a copied ZIP.  
**Created:** 2026-10-13. **Current main at creation:** `8f4946987de1eaa74b99ea71a59df2b923adbdb5` (v0.10.67). Always re-read the actual current main before a new task.

## Why this file exists

Separate ChatGPT conversations do not automatically send each other messages or transfer changes. Each worker chat must receive its own self-contained task, inspect the live repository, work in an isolated Git branch, publish verifiable results through a Pull Request, and report the PR URL back to the owner. **No concurrent agent has authority to merge directly.** The owner brings the PR link to the coordinating chat for review and approval.

## Workstreams and ownership

| Chat | Branch prefix | Main ownership | May edit | Must not touch without coordination |
|---|---|---|---|---|
| **Lead Architect** (this project's coordination chat) | `integration/`, `docs/` | Roadmap, acceptance, integration, release/version, documentation and final merging | `README.md`, shared roadmap, CI, package versions **during integration** | Don't overwrite another active branch; honor upstream changes |
| **Fingering AI** | `research/fingering-ai-` | Experimental source-aware RH/LH note separation and finger planning, independent evaluations, refusal classification | New `src/core/*fingering*.mjs`, `tests/*fingering*.test.mjs`, dedicated `docs/FG-*.md`, research scripts | Production player, authored MusicXML, saved user corrections, 14 PNG hands, audio banks, `README.md`/package version before integration |
| **Hand Animation** | `research/hand-motion-` | Source-backed next-unfinished-note preview, 2D preparation research and future independently implemented articulated animation | New motion/presentation research modules, isolated tests, scoped docs | Automatic finger approvals, source notes/timing, audio engine, assets, hand-pose replacement; coordinate with Fingering AI over interfaces |
| **Music Engine** | `research/music-engine-` | MusicXML/MIDI strict parsing and audit, score repeat/grace/tie provenance, exact transport integrity | Source validation under dedicated new `src/core/` helpers, targeted tests, research scripts/docs | SoundFont synthesis code, MAESTRO catalogs, teaching hints, original score bytes; coordinate any shared parser changes |
| **QA & Integration** (Lead can perform or open a 5th chat) | `qa/` | Independent musical QA, browser regression, SoundFont and MAESTRO non-regression | Isolated tests and reports; comments on PRs | No silent edits to other workers' feature branches or weakened acceptance thresholds |

All workstreams **must read this file, `README.md`, and `docs/ROADMAP-FINGER-GUIDANCE.md` from the current GitHub main** before touching the code. Check open PRs and latest commits for concurrent work. Existing PRs may come from older branch versions (e.g., historical FG-04B3d), so never assume a PR's version is the current app release.

## Shared immutable contracts

1. Finger/hand recommendations are **research-only** until independent musician acceptance; author MusicXML fingers and explicit user overrides have priority; unknown means unknown. The prior independent hand/finger baseline did not establish general teaching accuracy.
2. The original **14 transparent user-provided PNG hand poses** remain bit-for-bit untouched; hints target the **next unfinished note**, not the already sounding note; no unrequested 3D migration. Player Wait/Tempo/Listen note onset and release are authoritative.
3. **SoundFont:** GeneralUser GS and MuseScore General banks, checksums, GM program mapping, WebAudio timing and 256/256 real GM program PCM verification remain protected. Never alter these to make an unrelated research test pass.
4. **MAESTRO:** retain actual real v3 MIDI corpus integrity, split-provenance, performance timing, current original online catalog and copyright/noncommercial-use constraints. MAESTRO has no source fingering ground truth.
5. **ASAP:** CC BY-NC-SA 4.0 **research only**; no third-party source score/MIDI bytes in public player or PR report. Respect fixed source revision, blob hashes, 16-case baseline and explicit refusal reasons (latest baseline 1/16 full XML↔MIDI matches; never claim 16/16 by mere auditing).
6. Hand-thesia/pygame-piano-animator serves as architectural research for hand separation, beam search, trajectory anticipation and finger metadata compatibility. Use independently implemented methods; no verbatim third-party source without permission/licensing confirmation. Never modify original note timing to make visual hands appear smoother.
7. **Do not reassign production auto-finger labels or update teaching UI** without Lead/owner acceptance. Experimental output must be explicitly labeled `research-only` or `NO-GO`.

## Branch, PR and integration protocol

1. **Start:** fetch current main HEAD and open PR list. Write a scoped task note: assumptions, input/output contract, acceptance and declared file ownership. Create a branch from current main using the assigned prefix. Do **not** push experiments to main.
2. **Implement/test:** favor pure modules and synthetic fixtures. Include real musical regression evidence when relevant; use documented source provenance. A refusal is not a success. Do not change packages, build, CI or audio outside scope without coordinating ownership.
3. **Deliver:** a PR with concise summary, files changed, test command and output, musical failures/refusal rate, non-regression evidence, external rights and explicit TODOs. Make meaningful unit tests available for integration. **Do not merge your own PR.**
4. **Integrate:** Lead reviews code, latest main and all concurrent PR changes. Rebase/recreate a fresh integration branch when main changes; run all current Node/Chromium/MAESTRO/SoundFont tests and any relevant research/benchmark gates.
5. **Release/CI distinction:** The PR workflow exempts explicitly named worker research branches (`research/fingering-ai-*`, `research/hand-motion-*`, `research/music-engine-*`, `qa/*`) from README changes **only if** they include a dedicated `docs/FG-*.md` / `docs/QA-*.md` and touch exclusively allowed `src/core/*.mjs`, `tests/*.js|mjs`, `scripts/*.mjs`, `research/*.json|md|mjs` and dedicated docs. Any other PR must update README. Every **merged application release** must update `README.md` and relevant roadmap, package and lock version as a single integrated change. README/package versions are reserved for Lead during integration to minimize parallel merge conflicts. A research or documentation-only PR is not itself a deployed application release; never bump version to manufacture progress.
6. **Verification:** report precise CI status and GitHub Pages deployment separately; only claim success after the relevant workflow completes successfully. Record actual commit SHA and PR URL.

## Initial assignment order

**Start with Fingering AI**: inspect FG-02I two-hand score router, FG-02J independent polyphony evidence (including external ground-truth coverage/refusals), and FG-04B Hand-thesia review. Implement a **pure read-only candidate hand-separation evaluator** using source-derived note IDs and independently specified reference hands, with physical overlap/ambiguity refusal. Do not equate an automatic guess with authored RH/LH, and do not wire it into the teaching player. Provide quantitative evidence and PR without changing README/package/audio.

After this first PR is scoped, launch Hand Animation on a separate interface-bound next-note trajectory task, then Music Engine on repeat/grace/MIDI anomaly resolution. The lead remains responsible for final coordination and integrative acceptance.

## Owner-facing progress bar

The coordination chat displays a simple Hand-thesia objective progress bar in **every response**. The current baseline is a **provisional 35%** based on confirmed earlier milestones, **not an automated KPI**. Only adjust after a verified, accepted capability is materially delivered. Research fixture additions alone do not increase the percentage. The future fully 3D piano/hands concept is deferred beyond the present primary milestone and must not be conflated with current 2D PNG guidance.
