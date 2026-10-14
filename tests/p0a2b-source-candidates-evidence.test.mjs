import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
const snapshot=JSON.parse(readFileSync(new URL(
 '../research/p0a2b-mit-source-candidates-2026-10-14.json',
 import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL(
 '../research/fg04b1a-musicxml-corpus.json',
 import.meta.url),'utf8'));
test('P0-A2b real Chromium source evidence corresponds exactly to six pinned MIT blobs',()=>{
 assert.equal(snapshot.ok,true);
 assert.equal(snapshot.pinnedRevision,manifest.source.revision);
 assert.equal(snapshot.license,manifest.source.license);
 assert.equal(snapshot.selected,6);
 assert.equal(snapshot.verifiedSourceBlobs,6);
 assert.equal(snapshot.technicallyParsed,6);
 assert.equal(snapshot.cases.length,6);
 const ids=new Set();
 for(const c of snapshot.cases){
  const m=manifest.cases.find(x=>x.id===c.id);
  assert.ok(m);
  assert.ok(!ids.has(c.id));ids.add(c.id);
  assert.equal(c.category,m.category);
  assert.equal(c.sourceBlobSha1,m.blobSha);
  assert.match(c.scoreSha256,/^[a-f0-9]{64}$/);
  assert.equal(c.status,'TECHNICAL_CANDIDATE');
  assert.ok(Number.isInteger(c.notes)&&c.notes>0);
 }
 assert.equal(snapshot.cases.reduce((s,c)=>s+c.notes,0),133);
});
test('evidence is synthetic technical source metadata, never reviewed hand/finger labels',()=>{
 assert.equal(snapshot.expertReviewerCount,0);
 assert.equal(snapshot.notesReviewedByHuman,0);
 assert.equal(snapshot.independentFingeringAccuracy,null);
 assert.equal(snapshot.sourcesCommitted,0);
 assert.equal(snapshot.researchOnly,true);
 assert.equal(snapshot.expertValidated,false);
 assert.equal(snapshot.productionEligible,false);
 assert.equal(snapshot.validation.fingerLabelsWithheld,true);
 assert.equal(snapshot.validation.independentPianistRatingsPresent,false);
 assert.equal(snapshot.evidence.extractedFromActualGitHubActionsLog,true);
 assert.match(snapshot.evidence.runUrl,/actions\/runs\/\d+$/);
 assert.match(snapshot.evidence.workflowCommit,/^[a-f0-9]{40}$/);
 for(const row of snapshot.cases){
  assert.equal('noteId'in row,false);
  assert.equal('finger'in row,false);
  assert.equal('midiBytes'in row,false);
 }
});
