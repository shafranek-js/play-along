import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGTToSource,closedPolyphonicIslands,evaluatePolyphonicGroundTruth}
 from '../scripts/fingering-independent-polyphony-benchmark.mjs';
const row=(pitch,start,end,hand=null,finger=null)=>({
 onset:String(start),key_offset:String(end),
 frame_offset:String(end+.1),note:String(pitch),velocity:'80',
 ...(hand?{hand,finger:String(finger)}:{})
});
test('FG-02J real evaluation: fully annotated same-hand triad is eligible',()=>{
 const midi=[row(60,0,.5),row(64,0,.5),row(67,0,.5)];
 const gt=[row(60,0,.5,'R',1),row(64,0,.5,'R',3),
  row(67,0,.5,'R',5)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.sourceCoverage.polyphonicComponents,1);
 assert.equal(r.metrics.eligibleNotes,3);
 assert.equal(r.metrics.proposedMatched,3);
 assert.equal(r.metrics.pinnedAccepted,3);
 assert.equal(r.metrics.sourceAnchorOverrides,0);
});
test('FG-02J incomplete chord never becomes falsely high-scoring',()=>{
 const midi=[row(60,0,.5),row(64,0,.5),row(67,0,.5)];
 const gt=[row(60,0,.5,'R',1),row(67,0,.5,'R',5)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.sourceCoverage.skippedPartialGTNotes,2);
 assert.equal(r.sourceCoverage.polyphonicComponents,0);
 assert.equal(r.metrics.eligibleNotes,0);
 assert.equal(r.metrics.proposedNoteAgreementPct,null);
});
test('FG-02J cross-hand duet alone is not mislabeled intra-hand polyphony',()=>{
 const midi=[row(48,0,.5),row(72,0,.5)];
 const gt=[row(48,0,.5,'L',5),row(72,0,.5,'R',1)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.sourceCoverage.closedComponents,1);
 assert.equal(r.sourceCoverage.polyphonicComponents,0);
});
test('FG-02J serial notes are monophonic; true overlapping held voices are polyphonic',()=>{
 const midi=[row(60,0,.5),row(64,.5,.9),row(67,.55,.95)];
 const gt=[row(60,0,.5,'R',1),row(64,.5,.9,'R',3),row(67,.55,.95,'R',5)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.sourceCoverage.polyphonicComponents,1);
 assert.equal(r.metrics.eligibleNotes,2);
});
test('FG-02J chord eligibility is blocked by an overlapping unannotated bass',()=>{
 const midi=[row(48,0,1.3),row(60,.25,.65),row(64,.25,.65)];
 const gt=[row(60,.25,.65,'R',1),row(64,.25,.65,'R',3)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.metrics.eligibleNotes,0);
 assert.equal(r.sourceCoverage.skippedPartialGTNotes,2);
});
test('FG-02J duplicates/ambiguities cannot fabricate extra finger labels',()=>{
 const midi=[row(60,0,.4),row(60,0,.4)];
 const gt=[row(60,0,.4,'R',1)];
 const r=bindGTToSource(midi,gt);
 assert.equal(r.filter(n=>n.annotated).length,1);
 assert.equal(r.filter(n=>!n.annotated).length,1);
 assert.throws(()=>bindGTToSource([row(60,0,.4)],
  [row(62,0,.4,'R',1)]),/GT_NOT_A_SUBSET/);
});
test('FG-02J unknown GT hand or finger coding fails closed',()=>{
 const src=[row(60,0,.4)];
 assert.throws(()=>bindGTToSource(src,[row(60,0,.4,'?',1)]),
  /UNKNOWN_SOURCE_FINGER_CODING/);
 assert.throws(()=>bindGTToSource(src,[row(60,0,.4,'R',0)]),
  /UNKNOWN_SOURCE_FINGER_CODING/);
});
test('FG-02J no raw source notes or fingering sequence in aggregate metrics',()=>{
 const midi=[row(60,0,.5),row(64,0,.5)];
 const gt=[row(60,0,.5,'R',1),row(64,0,.5,'R',3)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.ok(r.details.length===1);
 assert.deepEqual(Object.keys(r.details[0]).sort(),
  ['hands','islandIndex','modeledFingerConflicts','notes','pinned','proposed','proposedMatchingNotes'].sort());
 assert.equal(JSON.stringify(r.details).includes('pitch'),false);
 assert.equal(JSON.stringify(r.details).includes('finger'),false);
});
test('FG-02J subset scope remains measurable independently of release gate',()=>{
 const all=[{id:1,pitch:60,start:0,end:.5,annotated:true,hand:'RH',finger:1},
  {id:2,pitch:64,start:0,end:.5,annotated:true,hand:'RH',finger:3},
  {id:3,pitch:48,start:1,end:1.5,annotated:false}];
 const r=closedPolyphonicIslands(all);
 assert.equal(r.summary.allSourceNotes,3);
 assert.equal(r.summary.annotatedNotes,2);
 assert.equal(r.summary.polyphonicNotes,2);
 assert.equal(r.summary.uncoveredSourceNotes,1);
});

test('FG-02J fully anchored chord model rejection has an auditable conflict code',()=>{
 const midi=[row(60,0,.5),row(64,0,.5)];
 const gt=[row(60,0,.5,'R',1),row(64,0,.5,'R',1)];
 const r=evaluatePolyphonicGroundTruth(midi,gt);
 assert.equal(r.metrics.pinnedRejectedIslands,1);
 assert.equal(r.metrics.pinnedRejectionReasons.AUTHOR_PHYSICAL_CONFLICT,1);
 assert.ok(r.metrics.pinnedModeledConflictTypes.FINGER_REUSED_WHILE_HELD>=1);
 assert.equal(r.metrics.sourceAnchorOverrides,0);
});
