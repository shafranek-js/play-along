# Library: fingering coverage and customizable sections (v0.10.49)

## Fingering coverage — what the badge means

Every library row has one of four statuses: **Есть**, **Частично**, **Нет**, or **Не проверено**. The first three require a score actually inspected by the application; the fourth is used when the remote score has not been downloaded, a local file has not yet been scanned, or parsing failed. Missing online catalog *metadata* is not proof that fingering is absent.

For an inspected score, **Есть** requires a verified finger **1–5 on every playable note event** (100%). **Частично** is a nonzero but incomplete percentage; **Нет** is zero verified fingers. Known **hand identity** is tracked separately and is not silently inferred. Only MusicXML author fingering and valid, explicitly selected FG-03C2A manual corrections count. Research-only inferred fingering is excluded. The explicitly identified two-hand built-in demonstration has a separate documented preset; other demos are not assumed annotated.

The new **Аппликатура** filter (Любая / Есть · все ноты / Частично / Нет / Не проверено) combines with existing source, search and favorite filters. In a saved MusicXML library, a compact `fingeringCoverage` object is stored in IndexedDB **workIndex**, not the binary `works` payload. Older v3 indexes are enriched progressively in the background with small asynchronous yields; the binary remains unchanged, and an unreadable score remains **Не проверено**, not **Нет**. A newly imported/saved file and valid manual fingering corrections refresh coverage without network access. Saved MIDI has no native author finger labels and is shown as **Нет · MIDI**, without a fictitious number of notes. The remote catalog is never bulk-downloaded for coverage.

## Rearrange the left library sidebar

The five independent sortable accordion sections are:

- Каталог произведений
- Моя коллекция
- Резервная копия
- Подключённая папка
- Онлайн-библиотеки

Click the section heading to collapse or expand. **Drag by ⠿**, or use **↑ / ↓** on each header (also works on touch), or focus the handle and press **Alt + ArrowUp / ArrowDown**. Search, source, favorite and coverage filters remain outside the movable stack so they are always reachable. Backup was intentionally promoted from a nested section inside My Collection into a *peer* section. The original file inputs, backup handlers, folder controls and external catalog controls remain the same DOM nodes; reordering never recreates them.

The order and collapsed state are stored in validated `state.librarySections` preferences with the normal application settings and JSON backup. Invalid/oversized/malicious backup layout records are rejected in strict restore; invalid legacy localStorage layout resets to the safe default. Every section has real `aria-controls` and `aria-expanded` state, move buttons with accessible labels, and visible drag-position feedback.

In the dedicated **Библиотека** workspace, the previous fixed two-pane catalog layout is intentionally replaced by a **single literal reorderable vertical stack**. The filter block stays sticky at the top; the catalog has its own bounded internal scroll window so thousands of songs never create an unbounded section. In the compact practice sidebar the same saved order and collapsed states apply.

## Acceptance tests

- Pure Node coverage cases: full, partial, none, unknown, known finger but unknown hand, saved user corrections, no untrusted automatic predictions.
- Pure Node section layout: stable defaults, full permutation, collapse map, rejection of duplicates and unknown keys.
- Real Chromium coverage: three saved XML files, exact percentage labels and filters, correction promotes partial to full, saved index migration after reload, online unknown.
- Real Chromium layout: five independent sections, backup no longer nested, collapse/reopen, native mouse drag, keyboard/arrow reorder, persistence after reload, mobile width and preserved file/backup/catalog controls.
- Existing OSMD, MIDI, Wait, backups, security, music research benchmark, deterministic asset version and Pages deployment must all pass before release.

**Non-goals:** Searching an un-downloaded remote archive is not silently upgraded into guaranteed fingering coverage. No auto-fingering is enabled for learners. Reordering the sidebar does not move notes, delete user files, or rewrite cached music. No new library DB schema version is required.
