# GeneralUser GS 2.0.3 delivery notice

This folder contains the original GeneralUser GS 2.0.3 SF2 bank by S. Christian Collins, pinned to upstream commit 684543d5e5efaef08d02be50dcda8d552478fa60. The bank is delivered as a local, static asset; the application does not fetch a mutable upstream download at runtime.

- Bank: GeneralUser-GS-2.0.3.sf2 — 32,319,396 bytes; SHA-256 9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe.
- Original bank license: GeneralUser-GS-LICENSE.txt.
- Original upstream documentation: GeneralUser-GS-README.md.
- Full preset catalog: GeneralUser-GS-2.0.3-presets.json (287 active preset headers: 261 instrument presets, 13 bank-128 drum kits, and 13 bank-120 drum-kit aliases; GM bank 0 contains programs 0–127).
- Upstream repository at the pinned revision: https://github.com/mrbumpy409/GeneralUser-GS/tree/684543d5e5efaef08d02be50dcda8d552478fa60
- Bank file at the pinned revision: https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2

The catalog labels the source field as soundfontBank, meaning the raw SF2 preset-header bank number; those values are inventory metadata, not asserted MIDI bank MSB/LSB, CC0/CC32, or SpessaSynth runtime routing. The runtime selector should use the synthesizer’s own normalized preset list.

The upstream License v2.0 allows use of the complete SoundFont in software projects and permits modification of the bank or its packaging. It also states that the author cannot be completely certain of the origin of every historical sample and says this uncertainty may matter for commercial software products. The full original license is included; this delivery does not characterize the samples as MIT-licensed, public domain, or independently rights-cleared.

No GeneralUser-specific sample-source CSV was present in the pinned source distribution, so none is included or borrowed from another bank. Refer to the original upstream documentation and license for the source and provenance statements available from the author.

**Project status:** GeneralUser GS and MuseScore General are both supplied as switchable banks, with GeneralUser GS as the default. Human A/B listening and release acceptance remain pending, and the SF-00 browser-memory target of 160 MiB was not met. This file package records provenance and inventory; it does not claim sound-quality acceptance. The delivered GeneralUser bytes are the original SF2, not a converted SF3.
