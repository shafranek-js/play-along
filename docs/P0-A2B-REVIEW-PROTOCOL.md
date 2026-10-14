# P0-A2b — blinded independent fingering review protocol

**Status: engineering ready for collecting evaluations; NO independent pianist decisions collected or verified.** Implemented in Play Along after P0-A2 (v0.10.96); the first preparatory delivery is v0.10.97. This document is not a claim of independently validated fingering quality.

## 1. Preconditions — do not bypass

- Select music/MIDI/MusicXML that you own or have written permission to use for this research. Record the **actual source score SHA-256** and evidence of permissible use outside the repository. Do not treat `rightsStatus:"verified-by-owner"` as legal proof: the program cannot inspect a license.
- Recruit at least **two qualified, genuinely independent piano reviewers**. Verify competence and independence **outside software**, preferably with a third reviewer/adjudicator for conflicting decisions. JSON `reviewerCode` is an anonymous study code, not proof of identity, qualification or independence.
- Predefine development and held-out **work/composer/arrangement groups**, avoiding duplicates, transpositions, variants and other near copies across splits. A software group-ID equality check is a minimum engineering control, not a full musicological leakage audit.
- Include actual polyphony (same-hand held chords/inversions), repetitions, arpeggios, thumb-under, hand crossing, sustained voice overlaps, hand span differences; use transparent `tags` as *human-curated classifications*, not ground-truth labels or features for solver tuning.
- If evaluating **finger selection with known hand**, use `"handMode":"supplied-hands"` and fill the canonical RH/LH for every note (the exact same hand assignment must be provided to both engines). If evaluating **blind hand separation**, use `"handMode":"blind-hands"` and OMIT hand from **every** source note. Do not present these two metrics as equivalent.
- Register the cohort/split, engine revisions, hand-size protocols, acceptable alternative definitions and metrics *before computing candidate finger assignments*. Freeze held-out music after the registration; no weight-tuning on held-out.

## 2. Local-only data files

Store the curated source and expert responses **outside the public Git repository**. Format of one local curated source (`private-source.json`):

```json
{
  "schema": "p0a2b-curated-source-v1",
  "cohortId": "study01-work001",
  "groupId": "study01-composer001",
  "split": "heldout",
  "handMode": "supplied-hands",
  "rightsStatus": "verified-by-owner",
  "scoreSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "notes": [
    {"noteId": "source:001", "pitch": 60, "start": 0, "duration": 0.5, "hand": "RH", "tags": ["chord", "inversion"]},
    {"noteId": "source:002", "pitch": 64, "start": 0, "duration": 0.5, "hand": "RH", "tags": ["chord", "inversion"]}
  ]
}
```

The SHA string above is **an example placeholder, not a verified source hash**. Use the digest of your actual permitted source. `noteId` must resolve uniquely to the *exact same canonical musical note* in both engines. The schema accepts `tags` from: `chord`, `inversion`, `arpeggio`, `thumb-under`, `repeated-note`, `held-voice`, `crossing`, `fast-passage`, `wide-span`, `other`. Do not include `finger`, `referenceFinger`, `userFinger`, `authorFinger`, any predicted result, or `truth` in this curated source.

Generate an immutable **fingerless** review packet and separate reviewer templates:

```bash
node scripts/p0a2b-review-workflow.mjs packet /private/source.json /private/packet.json
node scripts/p0a2b-review-workflow.mjs template /private/packet.json /private/reviewer-A.json reviewer-A independent
node scripts/p0a2b-review-workflow.mjs template /private/packet.json /private/reviewer-B.json reviewer-B independent
node scripts/p0a2b-review-workflow.mjs template /private/packet.json /private/reviewer-C.json reviewer-C adjudicator
node scripts/p0a2b-review-workflow.mjs study /private/packet1.json /private/packet2.json
```

These are no-overwrite, `0600`-permission files on POSIX. Blank templates contain `uncertain:true` and `acceptable:[]`; reviewers must independently supply valid pairs `{"hand":"RH","finger":1}` through `{"hand":"LH","finger":5}`. A reviewer can mark uncertainty explicitly; do not silently turn missing decisions into approved fingers. Only the third adjudicator must give a meaningful `rationale` (at least 12 non-whitespace characters) for disputes.

**Anti-contamination:** neither reviewer sees algorithms' output or each other's review before independent submission. Preserve evidence of this outside the tool. The code only verifies the declared `blindToAlgorithms:true` and distinct anonymous reviewer codes; it CANNOT prove true blinding or independent expertise.

## 3. Disagreement resolution and eligible denominators

Two independent reviewers agree when their accepted sets of `hand:finger` pairs **intersect**. The acceptable gold set is their intersection (not an unchecked union). If they disagree, are uncertain, or have disjoint options, the note is **excluded from scoring** until a distinct third adjudicator makes an explicit, explained ruling. Alternative acceptable fingering patterns can be retained for each note; passing one variant does not imply uniqueness or ergonomic appropriateness.

To evaluate, provide two **independently computed, source-identity-verified** files in the shape `{"items":[{"noteId":"source:001","pitch":60,"start":0,"duration":0.5,"hand":"RH","finger":1},...]}`, one for each actual engine. A source event with wrong `noteId`, pitch, onset, release, or illegal changed hand is refused **atomically**. No fake missing notes or pitch-nearest guesses are allowed. The scorer compares only accepted reviewer choices, excluding contested or unresolved notes from its denominator; any engine abstention is shown separately.

```bash
node scripts/p0a2b-review-workflow.mjs evaluate \
  /private/packet.json /private/reviewer-A.json /private/reviewer-B.json \
  /private/reviewer-C.json /private/fg02i.json /private/pianomotion.json
```

For a study without a third adjudicator, pass `-` instead of the adjudicator path; conflicting notes remain excluded and explicitly counted. **The output contains aggregate counts only**, including review agreement/disagreements, assessment eligibility, proposed/abstained, acceptable/disagree, per-hand breakdown and per-technique categories. Original note/finger vectors and source files are not printed, uploaded or committed.

The two actual engine outputs must be produced separately (e.g. using the P0-A2 real Python and FG-02I workflows), on **the same score and source identities**. This new independent-review scorer does not execute either engine or synthesize predictions. For blind-hand mode do not use the prior known-hand P0-A2 runner without modification: that would leak gold hand information.

## 4. Evaluation/release gate

The following remain strictly **false** until independent human evidence is collected and verified: `independentlyValidated`, `reviewerIndependenceExternallyVerified`, `productionEligible`. A JSON string cannot certify pianist competence or rights. In particular, an adjudication status `LABELS_ADJUDICATED` means the supplied anonymous reviews mechanically agree; **it does not mean independent experts have been verified**.

Compare unmodified FG-02I and real PianoMotion on held-out alternatives with exact note coverage denominators and physical-conflict screens; only then explore changes on the separate development split. Require reproducible real Python executions and an independent validation review before considering learner-facing automation or optional PianoMotion IK instructional approval. Keep source-model rights checks separate.

## 5. Engineering verification

- `tests/p0a2b-independent-review.test.mjs`: blind packets, contamination rejection, reviewers, alternatives, adjudicator refusals, per-technique/per-hand counters, source identity, group leakage, blind hand-separation mode.
- `tests/p0a2b-review-workflow.test.mjs`: no-overwrite local packet/template, file permissions, private aggregate-only scoring and multi-packet checks.
- Both are included in `npm test` and the dedicated real-Python P0-A2 GitHub Actions workflow.
- The previous 148-note pinned Piano Protege author-reference results remain **P0-A2**, not the new P0-A2b independently reviewed evidence.

**Current gate:** `EXPERT_REVIEW_NOT_YET_VERIFIED`. No external review data is bundled, and no percentage of P0-A2b pianist-judged accuracy is claimed.
