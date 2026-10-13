# FG-03C2B4 — Opt-in MusicXML with user fingering (v0.10.73)

**Status:** user-initiated download from **✍ Аппликатура**; never an automatic export or modification of the original song. The existing author XML, imported notes, original MIDI events, source-note IDs, user correction storage, MAESTRO/SoundFont and 14 PNG hand poses remain unchanged.

## User operation

Open an original MusicXML or MXL score, add individual or bulk finger corrections in **Аппликатура**, then click **↓ MusicXML с правками**. The browser downloads `<title>-user-fingering.musicxml` after all checks pass. The filename, `<identification><miscellaneous><miscellaneous-field name="play-along-user-fingering">` marker and import warning identify the result as **user-edited, not composer-authored**. No upload is performed.

The exported file is a separate canonical score clone with only verified numeric `<notations><technical><fingering>` insertions/replacements. It has no amber display noteheads, styling or simulated finger estimates. Notes without a chosen numeric finger are **not** assigned a digit. Hand-only changes cannot be represented as standard fingering digits and are deliberately **not exported** (reported to the user); when there are no numeric corrections the operation refuses.

## Fail-closed contract

1. Only the originally loaded `MusicXML` score in original, untransposed mode is eligible. MIDI transcriptions, missing original XML, untrusted IDs, malformed corrections and unknown note identities refuse.
2. The same exact source matching used by the Sheet Music annotation preview verifies every original playable MusicXML segment (part order/index, measure/index, note ordinal, pitch, part, voice, staff and tie IDs) **before** editing a detached XML document.
3. Export mode changes fingering tags only. The independent `externalFingeringStructuralKey()` must show exact equivalence between the original and modified score outside fingering annotations.
4. The existing MusicXML importer is run **twice**, before and after the provenance marker. Both results must match the loaded source in ordered note identity/segment/pitch/start/duration/instrument and ordered MIDI audio event properties. An exception or mismatch refuses export instead of downloading.
5. Scores whose repeat notation was expanded on import (`originalNotationXML`) are refused. Their first/second passes cannot safely be merged back into a written score with identical IDs. No score, note length, tempo, pedal or event time is guessed.
6. Source size is bounded by existing 15 MB XML and 25,000 playable notes. There are no external services or new dependencies.

**Important:** The marker warns that this is user-edited output; it is not a cryptographic signature and must never be used as an authorization for automatic predictions. Another app may ignore the marker. In Play Along it is surfaced as an import warning. Export itself contains no generated fingering from experimental FG-02/FG-04 solvers.

## Acceptance

- Existing and added Chromium editor test downloads the file after corrections and verifies marker, absence of display tint, only the intended numeric fingering annotations, unchanged imported note IDs/timing and import provenance warning.
- Build, Node, real Chromium, pinned MAESTRO, SoundFont/GM and source/hand PNG gates must pass in GitHub Actions.
- Expert validation of edited fingering **remains the user's responsibility**. Export is data portability, not a claim of anatomically correct fingers.

See [prior editor scope](FG-03C2B3-FINGERING-EDITOR.md), [roadmap](ROADMAP-FINGER-GUIDANCE.md).
