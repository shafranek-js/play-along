# FG-04D1 — Original MusicXML provenance and research guidance source authentication (v0.10.77)

## Critical bug fixed in the published importer

FG-03C2B4 exports a **separate, human-edited** MusicXML download containing the original score and corrected numeric fingering with an informational metadata marker:

\`<identification><miscellaneous><miscellaneous-field name="play-along-user-fingering">...</miscellaneous-field></miscellaneous></identification>\`.

Before FG-04D1, reimport warned users that the numbers were not necessarily composer's fingering, yet still labelled the numbers \`fingeringSource:'musicxml'\`. The learner-facing finger guide and coverage/hand preview trust that exact source value. This was a **provenance promotion bug**: it could display manual revisions as if they were independently authored notation. It affected all imported numeric fingers, including fingering read from a continuation of a held MusicXML tie.

The importer now classifies **every numeric fingering in any MusicXML carrying the marker** as \`fingeringSource:'musicxml-user-export-unverified'\`, including merged tie continuations. The user still sees the score's digits, pitches and rhythms. They are no longer counted as independently verified **author** fingering and they produce no automatic learner finger/hand guidance. The warning explicitly instructs the user to review fingers and hands in the editor.

The metadata marker is a **self-assertion, not a digital signature or cryptographic proof**. An adversarial party could strip it. When a marked file mixes original composer and Play Along-edited digits, there is no secure note-by-note provenance; demote all numbers. To create locally trusted **user corrections**, explicitly confirm each chosen finger+hand through the editor. Never treat a metadata marker as proof of authorization.

## Independent research-only adapter

\`src/core/musicxml-guidance-provenance.mjs\` exports \`inspectMusicXmlProvenanceResearch\`, an opt-in, **NOT browser/player imported** wrapper around the FG-04D0 research bridge. Its inputs are the entire original imported MusicXML song, the entire strict-validated local override store keyed by that exact original XML content fingerprint, completion IDs, transport/geometry, and the **real independent** \`readMusicXML\` reimport function.

1. Explicitly reject unsupported or expanded-repeat XML. For **up to 128** playable notes, require original canonical source and tied-segment IDs, valid part/voice/staff/pitch/times, unique identities and bounded XML length.
2. Reimport the original immutable XML through the supplied parser; compare every canonical ID and ordered tie/source segment, pitch, note onset/duration, voice/staff/part, author finger/source/hand attribution and the full audio-event and tempo timeline. Any mismatch rejects the entire operation.
3. Strictly validate local hand/finger correction records with the existing \`fingerOverrideValidate\` contract and resolve only the local edits under \`fingerOverrideWorkKey(song)\`. Missing or mismatched correction IDs refuse; other works cannot donate fingering. The work key is **non-cryptographic** and does not authenticate a malicious forged database.
4. Build the bridge's author hand+finger **only** from the independent reimport's \`fingeringSource==='musicxml'\` and a valid paired hand+finger. A marked user export yields *zero* source-author pairs. Build user hand/finger only from the exact source-keyed local manual edits. A partial user correction is deliberately refused as a motion authorization; it cannot borrow the composer's other half.
5. Pass the sanitized source events to FG-04D0; experimental RH/LH and finger predictions remain aggregate-only. FG-03D1 may show its **research-only** motion plan only if the entire next original score-onset group is independently authorized. All outputs retain \`productionEligible:false\`, \`expertValidated:false\` and \`researchOnly:true\`.
6. No automatic user guidance, MIDI/transport adjustment, original MusicXML rewriting, SoundFont/MAESTRO changes or edits to any of the fourteen owner PNGs.

**Remaining trust limit:** caller-provided \`completedNoteIds\`, viewport, transport and \`reimport\` implementation are not themselves cryptographically attested. The wrapper requires the caller to supply the legitimate independently deployed MusicXML importer. Actual MIDI and Wait/Tempo event validation, pianist-reviewed physical motion and real-world source-author hand accuracy still remain **NO-GO**. This is an engineering provenance gate, not independent evidence of musical performance correctness.

## Tests

- New \`tests/musicxml-guidance-provenance.test.mjs\`: real author→trusted research motion, unverified export refuses, exact local user pair accepted, no partial cross-layer borrowing, spoofed original finger or hand rejected by independent reimport, altered pitch/segments/duration/part/voice/tempo/audio rejected, orphan user corrections, scope limits, determinism and immutability.
- New real Chromium \`tests/finger-provenance-export.real.test.mjs\`: import equivalent original authored and user-edited-marked MusicXML including a two-segment held tie; source IDs, visible digits and **all MIDI events remain identical**, original author finger guidance still works, marked file produces **no** unverified teaching numbers or hand previews.
- Existing original XML download/reimport browser regression now checks no reimported numeric fingering is promoted to \`musicxml\`; unit coverage explicitly excludes marked digits from author/user score coverage until the user supplies a valid local correction.
- Require full PR Node/Chromium regression, MAESTRO original performance/pedal preservation, two 128-program GM banks, and successful main GitHub Pages deployment.

Hand-thesia milestone remains **35%**. This is safety/attribution correctness, not pianist validation of generated fingering or lifelike motion.
