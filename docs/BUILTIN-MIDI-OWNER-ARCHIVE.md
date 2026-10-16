# Owner-supplied built-in MIDI collection — pending rights release gate

User attachment: `midi.zip`, SHA-256 `0ba2b0e675c3fa2b4b3b02614114d2443a29cf40040192cdaeb0b830d36512b6`.
There are **162 distinct, successfully parsed Standard MIDI Files** inside one `midi/` folder; no other musical formats. MIDI type 1, 2–5 tracks/file, 44,654 note-on events in total. No source license document accompanies the ZIP.

**Copyright evidence:** 29 of the MIDI files have embedded MIDI `copyright` metadata, including The Living Tombstone (four FNaF songs), Toby Fox (Megalovania), and Ashley Kampta (major/minor scales and arpeggios). Another 133 MIDI files have no embedded copyright event, which **does not establish public-domain or redistribution rights**. Do not label these 162 recordings as public domain.

**Release gate:** GitHub Pages and `main` are publicly accessible. Do not commit the MIDI audio assets or distribute the original bytes there without documented redistribution authorization for the collection. This does not prevent the owner from importing the ZIP locally in their own browser. The source pack is deliberately not included in this draft branch, so its build cannot pass until the authorized original payload is supplied.

The source-code scaffold provides a distinct `Встроенные MIDI` filter, searchable entries, on-demand compressed data, SHA-256 verification, and loading through the original MIDI parser without manufacturing fingering. Before a public release: attach an authorized MIDI payload at `src/assets/builtin-midi/parts/part-00.b64` through `part-05.b64`; run build+unit+Chromium QA; verify no non-piano tracks are claimed to be piano arrangements; and review the visible rights notice.
