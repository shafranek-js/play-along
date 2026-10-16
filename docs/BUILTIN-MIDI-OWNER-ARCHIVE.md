# Owner-supplied built-in MIDI collection — owner authorization and integration

User attachment: `midi.zip`, SHA-256 `0ba2b0e675c3fa2b4b3b02614114d2443a29cf40040192cdaeb0b830d36512b6`.
There are **162 distinct, successfully parsed Standard MIDI Files** inside one `midi/` folder; no other musical formats. MIDI type 1, 2–5 tracks/file, 44,654 note-on events in total. No source license document accompanies the ZIP.

**Copyright evidence:** 29 of the MIDI files have embedded MIDI `copyright` metadata, including The Living Tombstone (four FNaF songs), Toby Fox (Megalovania), and Ashley Kampta (major/minor scales and arpeggios). Another 133 MIDI files have no embedded copyright event, which **does not establish public-domain or redistribution rights**. Do not label these 162 recordings as public domain.

**Owner authorization (2026-10-16):** the user explicitly confirmed permission to redistribute the attached collection publicly in Play Along. This is a project-specific authorization assertion, **not** a declaration that the recordings are public domain or that third-party users receive a sublicense. Preserve embedded MIDI authorship metadata, and maintain the archive fingerprint to audit precisely what was distributed.

The source-code scaffold provides a distinct `Встроенные MIDI` filter, searchable entries, on-demand compressed data, SHA-256 verification, and loading through the original MIDI parser without manufacturing fingering. For reproducibility, the original MIDI bytes are bundled as six text-safe Brotli chunks; before release verify assets at `src/assets/builtin-midi/parts/part-00.b64` through `part-05.b64`, run build+unit+Chromium QA, and preserve the distinctions between original MIDI, piano transcription and soundtrack.
