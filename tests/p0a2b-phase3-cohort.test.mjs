import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditP0A2bPhase3Screening} from '../src/core/p0a2b-phase3-cohort.mjs';

const plan=JSON.parse(readFileSync(new URL('../research/p0a2b-phase3-screening-plan.json',import.meta.url)));
const upstream=JSON.parse(readFileSync(new URL('../research/fg04b1b-asap-score-manifest.json',import.meta.url)));
const copy=x=>JSON.parse(JSON.stringify(x));

test('eight pinned real works form a composer-disjoint research-only screening queue',()=>{
 const r=auditP0A2bPhase3Screening(plan,upstream);
 assert.equal(r.ok,true);
 assert.equal(r.candidateRealWorks,8);
 assert.equal(r.development,4);
 assert.equal(r.heldout,4);
 assert.equal(r.composerGroups,8);
 assert.equal(r.sourceRevision,upstream.source.revision);
 assert.match(r.planSha256,/^[a-f0-9]{64}$/);
 assert.equal(r.status,'REAL_SCORE_SCREENING_QUEUE_ONLY');
 assert.equal(r.hypothesesNotExpertLabels,true);
 assert.equal(r.originalMusicXmlMidiAlignmentVerified,false);
 assert.equal(r.excerptWindowsCurated,false);
 assert.equal(r.independentlyReviewedNotes,0);
 assert.equal(r.algorithmsComparedOnThisCohort,false);
 assert.equal(r.productionEligible,false);
 for(const tag of ['chord','inversion','arpeggio','thumb-under',
  'repeated-note','held-voice','crossing'])
  assert.ok(r.targetedCategories[tag]>0,'screening target '+tag);
});
test('a composer cannot leak between development and heldout under different work IDs',()=>{
 const m=copy(plan);
 m.selections[4]={...m.selections[4],caseId:'bach-fugue-846',
  groupId:'composer-bach'};
 assert.equal(auditP0A2bPhase3Screening(m,upstream).reason,
  'COMPOSER_DEVELOPMENT_HELDOUT_LEAKAGE');
});
test('no duplicate score, illegal or synthetic technical candidate can be admitted',()=>{
 const duplicate=copy(plan);
 duplicate.selections[1]=copy(duplicate.selections[0]);
 assert.equal(auditP0A2bPhase3Screening(duplicate,upstream).reason,
  'INVALID_OR_DUPLICATED_SELECTION');
 const fake=copy(plan);
 fake.selections[0].caseId='schubert-chord';
 assert.equal(auditP0A2bPhase3Screening(fake,upstream).reason,
  'INVALID_OR_DUPLICATED_SELECTION');
 const pins=copy(upstream);pins.cases[0].musicxml.blobSha='0'.repeat(12);
 assert.equal(auditP0A2bPhase3Screening(plan,pins).reason,'INVALID_SOURCE_PIN');
});
test('no self-attested licence, fake reviews, source alignment or approved technique flags',()=>{
 for(const [key,value] of [
  ['license','CC0'],['independentPianistReviews',2],
  ['expertAdjudicatedNotes',133],['musicxmlMidiEventIdentityVerified',true],
  ['sourceBytesDownloaded',true],['humanTechniqueScreeningCompleted',true],
  ['productionEligible',true],['labelsStatus','expert-reviewed']]){
  const p=copy(plan);p[key]=value;
  assert.equal(auditP0A2bPhase3Screening(p,upstream).reason,
   'UNVERIFIED_PLAN_OR_FALSE_EVIDENCE',key);
 }
 const item=copy(plan);item.selections[0].techniqueTargets.push('fingering-ground-truth');
 assert.equal(auditP0A2bPhase3Screening(item,upstream).reason,
  'INVALID_OR_DUPLICATED_SELECTION');
});
test('screening balance, targets, and composer-group identity remain locked',()=>{
 const a=copy(plan);a.selections[0].split='heldout';
 assert.equal(auditP0A2bPhase3Screening(a,upstream).reason,
  'INSUFFICIENT_SPLIT_OR_TECHNIQUE_SCREENING');
 const b=copy(plan);b.selections[0].groupId='made-up-piece';
 assert.equal(auditP0A2bPhase3Screening(b,upstream).reason,
  'INVALID_OR_DUPLICATED_SELECTION');
 const c=copy(plan);
 for(const s of c.selections)s.techniqueTargets=s.techniqueTargets.filter(x=>x!=='repeated-note');
 assert.equal(auditP0A2bPhase3Screening(c,upstream).reason,
  'INSUFFICIENT_SPLIT_OR_TECHNIQUE_SCREENING');
 const d=copy(upstream);d.source.usage='commercial';
 assert.equal(auditP0A2bPhase3Screening(plan,d).reason,'UNVERIFIED_UPSTREAM_MANIFEST');
});
