import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFingeringEnginesResearch as compare,
 runExistingPlayAlongFingeringResearch as runPlayAlong}
 from '../src/core/fingering-engine-comparison.mjs';

const note=(noteId,pitch,start,duration,hand,other={})=>({
 noteId,pitch,start,duration,hand,...other});
const source=[
 note('rh-c',60,0,.4,'RH',{partId:'p',staff:1,voice:'1',sourceNoteIds:['score:c']}),
 note('rh-e',64,0,.4,'RH',{partId:'p',staff:1,voice:'1',sourceNoteIds:['score:e']}),
 note('rh-g',67,0,.4,'RH',{partId:'p',staff:1,voice:'1',sourceNoteIds:['score:g']}),
 note('lh-c',48,0,.4,'LH',{partId:'p',staff:2,voice:'2',sourceNoteIds:['score:lc']}),
 note('lh-e',52,0,.4,'LH',{partId:'p',staff:2,voice:'2',sourceNoteIds:['score:le']}),
 note('lh-g',55,0,.4,'LH',{partId:'p',staff:2,voice:'2',sourceNoteIds:['score:lg']})
];
const rows=(fingers=[1,3,5,5,3,1])=>source.map((n,i)=>({
 noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
 hand:n.hand,finger:fingers[i],partId:n.partId,staff:n.staff,
 voice:n.voice,sourceNoteIds:n.sourceNoteIds
}));
const original=()=>structuredClone(source);
test('FG-04C2 calls EXISTING real Play Along router, never pretends PianoMotion ran',()=>{
 const r=runPlayAlong(source);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.items.length,6);
 assert.equal(r.researchOnly,true);
 const report=compare({source,playAlong:r.items});
 assert.equal(report.ok,true);
 assert.equal(report.playAlong.status,'evaluated',JSON.stringify(report.playAlong));
 assert.equal(report.playAlong.summary.proposed,6);
 assert.equal(report.playAlong.summary.sourceContextUnverified,6);
 assert.equal(report.pianoMotion.status,'not-run');
 assert.equal(report.pianoMotion.summary,null);
});
test('FG-04C2 two named engine outputs compare only aggregate independent truth',()=>{
 const truth=source.map((n,i)=>({noteId:n.noteId,hand:n.hand,finger:[1,3,5,5,3,1][i]}));
 const r=compare({source,playAlong:rows(),pianoMotion:rows([1,2,5,5,3,1]),truth});
 assert.equal(r.playAlong.summary.truthCorrect,6);
 assert.equal(r.playAlong.summary.truthAgreementEligible,1);
 assert.equal(r.pianoMotion.summary.truthCorrect,5);
 assert.equal(r.pianoMotion.summary.truthWrong,1);
 assert.equal(r.pianoMotion.summary.truthAgreementProposed,5/6);
 assert.equal(r.playAlong.summary.sourceContextUnverified,0);
 assert.equal(r.pianoMotion.status,'evaluated');
 assert.ok(!JSON.stringify(r).includes('score:c'),'Never export source IDs or finger sequences');
});
test('FG-04C2 reject duplicate source IDs and invalid source onset/duration',()=>{
 assert.equal(compare({source:[source[0],{...source[1],noteId:source[0].noteId}]}).reason,
  'MISSING_OR_DUPLICATE_SOURCE_ID');
 assert.equal(compare({source:[{...source[0],duration:0}]}).reason,'INVALID_SOURCE_EVENT');
 assert.equal(compare({source:[{...source[0],hand:null}]}).reason,'INVALID_SOURCE_EVENT');
});
test('FG-04C2 refuse engine-pitched timing, hand and score-context changes',()=>{
 for(const change of [{pitch:61},{start:.05},{duration:.45},{hand:'LH'},{partId:'other'},
  {sourceNoteIds:['wrong']}]) {
  const altered=rows();Object.assign(altered[0],change);
  const report=compare({source,playAlong:altered});
  assert.equal(report.playAlong.status,'rejected',JSON.stringify(change));
 }
});
test('FG-04C2 duplicate or fabricated proposal IDs cannot inflate coverage',()=>{
 const more=rows();more.push({...more[0]});
 assert.equal(compare({source,pianoMotion:more}).pianoMotion.status,'rejected');
 const foreign=rows();foreign[0].noteId='not-from-score';
 assert.equal(compare({source,pianoMotion:foreign}).pianoMotion.reason,
  'DUPLICATE_OR_UNKNOWN_CANDIDATE_ID');
});
test('FG-04C2 author or user fingers remain hard anchors with NO silent override',()=>{
 const trusted=source.map(n=>({...n}));
 trusted[0].authorFinger=1;
 trusted[1].authorFinger=2;trusted[1].userFinger=3; // user wins
 const r=compare({source:trusted,playAlong:rows()});
 assert.equal(r.playAlong.status,'evaluated');
 const altered=rows();altered[1].finger=2;
 assert.equal(compare({source:trusted,pianoMotion:altered}).pianoMotion.reason,
  'AUTHOR_OR_USER_ANCHOR_CHANGED_OR_MISSING');
 const absent=rows().slice(1);
 assert.equal(compare({source:trusted,pianoMotion:absent}).pianoMotion.reason,
  'AUTHOR_OR_USER_ANCHOR_CHANGED_OR_MISSING');
});
test('FG-04C2 independent truth must not leak into source anchors',()=>{
 const anchored=original();anchored[0].authorFinger=1;
 assert.equal(compare({source:anchored,truth:[{noteId:'rh-c',hand:'RH',finger:1}]}).reason,
  'INVALID_OR_LEAKING_WITHHELD_TRUTH');
 assert.equal(compare({source,truth:[{noteId:'missing',hand:'RH',finger:1}]}).ok,false);
});
test('FG-04C2 refusals and abstentions retain honest eligible denominators',()=>{
 const engine=rows().slice(0,2);
 const truth=source.map((n,i)=>({noteId:n.noteId,hand:n.hand,finger:[1,3,5,5,3,1][i]}));
 const r=compare({source,pianoMotion:engine,truth}).pianoMotion;
 assert.equal(r.status,'evaluated');
 assert.equal(r.summary.total,6);
 assert.equal(r.summary.proposed,2);
 assert.equal(r.summary.abstained,4);
 assert.equal(r.summary.truthCorrect,2);
 assert.equal(r.summary.truthAbstained,4);
 assert.equal(r.summary.coverage,2/6);
 assert.equal(r.summary.truthAgreementEligible,2/6);
});
test('FG-04C2 flags physically impossible held-finger reuse without hiding errors',()=>{
 const src=[note('a',60,0,1,'RH'),note('b',64,.4,.2,'RH')];
 const candidate=src.map(n=>({...n,finger:1}));
 const r=compare({source:src,playAlong:candidate}).playAlong;
 assert.equal(r.status,'physical-conflicts');
 assert.ok(r.summary.physicalViolations.FINGER_REUSED_WHILE_HELD>0);
 assert.equal(r.summary.proposed,2);
});
test('FG-04C2 detects cross-hand simultaneous occupation of one physical key',()=>{
 const src=[note('a',60,0,.5,'RH'),note('b',60,0,.5,'LH')];
 const r=compare({source:src,pianoMotion:src.map(n=>({...n,finger:1}))}).pianoMotion;
 assert.equal(r.status,'physical-conflicts');
 assert.equal(r.summary.physicalViolations.CROSS_HAND_SAME_KEY_OVERLAP,1);
});
test('FG-04C2 scoring is deterministic and leaves exact original event data untouched',()=>{
 const before=original(),proposal=rows(),truth=[{noteId:'rh-c',hand:'RH',finger:1}];
 const snap=structuredClone({before,proposal,truth});
 const a=compare({source:before,playAlong:proposal,truth});
 const b=compare({source:before,playAlong:proposal,truth});
 assert.deepEqual(a,b);assert.deepEqual({before,proposal,truth},snap);
 assert.equal(a.productionEligible,false);assert.equal(a.expertValidated,false);
});
test('FG-04C2 physical size audit remains research-only for small hands',()=>{
 const src=[note('a',60,0,.4,'RH'),note('b',72,0,.4,'RH')];
 const out=[{...src[0],finger:1},{...src[1],finger:5}];
 const report=compare({source:src,playAlong:out,handSize:'XXS'}).playAlong;
 assert.equal(report.status,'physical-conflicts');
 assert.ok(report.summary.physicalViolationCount>=1);
});
