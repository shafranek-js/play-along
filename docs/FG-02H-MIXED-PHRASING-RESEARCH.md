# FG-02H — mixed-direction phrasing and authored fingering compatibility

**Status: research only. Nothing in this PR changes the learner's Play Along controls, 14 original PNG hand images, OSMD, MIDI transport, Wait/Tempo, or author MusicXML hints.**

## Why this phase exists

The preceding FG-02G study downloaded five independent hand-annotated musical excerpts from the [Piano Protege Curriculum](https://huggingface.co/datasets/riyaranjan/piano-protege-curriculum) (CC BY-SA 4.0, Riya Ranjan and collaborators), source version fixed by commit and SHA-256. The existing FG-02A and FG-02F research solvers each matched the author's finger number for **81/148** score notes (54.73%) and returned no perfectly matched full phrase. Their outputs were identical because FG-02F only recognized monotonic scale-like/arpeggio-like structures.

More seriously, a *fully author-pinned* test rejected **4 of 7** one-hand excerpts: only **58/148** source notes were accepted. FG-02A contains a hard infinite penalty for rapid same-finger motion between different pitches, even where the first physical key has been released. This may be difficult at tempo, but **cannot justify silently declaring an explicit author choice nonexistent or wrong**.

## New research model

`src/core/fingering-contextual.mjs` is an original, separate monophonic dynamic program. It:

- handles local turns of melodic direction, consecutive pitch repeats and rests without requiring the entire score to rise or fall;
- considers physical left/right keyboard position, black keys and the center of a five-finger hand, with softer penalties for thumb-under, turning and long rests;
- respects all explicit MusicXML/user finger anchors `1..5` and known hand membership, without overriding them;
- **permits** reuse of the same finger on two sequential different keys *after a release*, but flags rapid anchored transitions as `AUTHOR_ANCHOR_SLIDE_UNVERIFIED` rather than asserting they are comfortable;
- still **rejects physical overlap** of distinct sounding notes as `POLYPHONY_UNSUPPORTED`; chord/voice fingering remains separate research;
- uses the independent FG-02C constraints audit to refuse physical conflicts without trusting its own heuristic costs;
- preserves each source note's identity, MIDI pitch, onset and duration, input order and source provenance.

This does not model actual wrist motion, finger substitution, glissandi or experimentally calibrated biomechanics; "author preserved" is a constraint-integrity claim, not an ergonomic endorsement. MIDI cannot identify which anatomical finger played a key.

## Independent technical checks and contextual evaluation

- `npm test` includes property/contract checks for mixed-direction runs, repeated notes, rests, strange but valid author anchors, overlap, conflicting hand claims and 12 transposed key classes. A second suite audits the source comparator.
- `npm run benchmark:fingering:contextual` downloads the **original 5 CC BY-SA files** using the existing FG-02G fixed revision and verified SHA-256 checksums (source files are **not vendored**) and prints:
  - FG-02A/FG-02F historical agreement and pinned acceptance;
  - FG-02H exact finger agreement per full run and note;
  - FG-02H fully anchored acceptance coverage **including rejected notes in the denominator**;
  - every unresolved rapid same-finger anchor movement and every rejected/polyp​honic segment.
- CI uploads `fg02h-contextual-repertoire-report` containing individual expected and produced finger sequences, source IDs, original hashes, modeled audit failures and flagged movement transitions.
- The original FG-02G benchmark and all earlier FG-02C/FG-02E golden fixtures remain unchanged. Results are comparable.

## Interpretation and release gate

**The five FG-02G excerpts were already seen when designing FG-02H**. The new comparison is deliberately labeled *RETROSPECTIVE*. If FG-02H improves musical agreement, that improvement is an engineering diagnostic—not independent accuracy certification. A new unseen and educator-adjudicated musical corpus is needed before any learner-facing opt-in.

Successful recovery of a full author-pinned phrase is not proof the literal author fingers are easy or optimal. Any suspicious same-finger repositioning must remain visible in the diagnostic report, not hidden by a 100% acceptance number.

**Release decision: FG-02H is NO-GO for learner-facing automatic fingering.** The next research gate requires (a) independent pianist annotations, (b) genuine polyphony, (c) strong agreement on new works, and (d) a separate UAT of teacher/suggestion provenance.
