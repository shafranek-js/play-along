import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserFingeringResearch as calc}
 from '../src/core/browser-fingering-research.mjs';
const n=(noteId,pitch,finger=null,start=0,hand='RH')=>({
 noteId,pitch,start,duration:.45,hand,
 ...(finger==null?{}:{authorFinger:finger})
});
test('FG-04C4 worker engine computes both original and anatomical modes with source IDs',()=>{
 const notes=[n('xml:c',60),n('xml:e',64),n('xml:g',67)];
 const snapshot=structuredClone(notes),a=calc({notes});
 assert.equal(a.ok,true,JSON.stringify(a));
 assert.equal(a.engine,'Play Along · FG-02I Beam Search');
 assert.equal(a.models.legacy.status,'computed');
 assert.equal(a.models.anatomical.status,'computed');
 assert.deepEqual(a.models.legacy.candidates.map(x=>x.finger),[1,3,5]);
 assert.equal(a.models.anatomical.proposed,3);
 assert.equal(a.productionEligible,false);
 assert.equal(a.expertValidated,false);
 assert.deepEqual(notes,snapshot);
 assert.deepEqual(a,calc({notes}),'deterministic browser calculations');
});
test('FG-04C4 real anatomical research can admit a 1–5 ninth while legacy refuses',()=>{
 const notes=[n('xml:lower',60,1),n('xml:upper',74,5)];
 const result=calc({notes});
 assert.equal(result.ok,true);
 assert.equal(result.models.legacy.status,'refused');
 assert.equal(result.models.anatomical.status,'computed');
 assert.equal(result.anchored,2);
 assert.equal(result.models.anatomical.proposed,0);
 const small=calc({notes,handSize:'XS'});
 assert.equal(small.models.anatomical.status,'refused');
});
test('FG-04C4 user correction overrides original author anchor without source mutations',()=>{
 const notes=[{...n('xml:note',60,1),userFinger:4}];
 const r=calc({notes});
 assert.equal(r.ok,true);
 assert.equal(r.anchored,1);
 assert.equal(r.models.legacy.proposed,0);
});
test('FG-04C4 refuses unknown hand, malformed IDs and unsupported hand sizes',()=>{
 assert.equal(calc({notes:[n('xml:a',60,null,0,null)]}).reason,'HAND_NOT_SOURCE_VERIFIED');
 assert.equal(calc({notes:[n('unknown',60)]}).reason,'SOURCE_ID_REQUIRED_OR_DUPLICATE');
 assert.equal(calc({notes:[n('xml:one',60),n('xml:one',64)]}).reason,
  'SOURCE_ID_REQUIRED_OR_DUPLICATE');
 assert.equal(calc({notes:[n('xml:one',60)],handSize:'HUGE'}).reason,'INVALID_HAND_SIZE');
});
test('FG-04C4 invalid authored finger and invalid source duration are refused',()=>{
 assert.equal(calc({notes:[{...n('xml:a',60),authorFinger:7}]}).reason,'INVALID_ANCHOR');
 assert.equal(calc({notes:[{...n('xml:a',60),duration:-.5}]}).reason,'INVALID_SCORE_EVENT');
});
test('FG-04C4 concurrent impossible voices cannot be silently rolled or rewritten',()=>{
 const notes=[n('xml:1',60,1),n('xml:2',64,1)];
 const r=calc({notes});
 assert.equal(r.ok,true);
 assert.equal(r.models.legacy.status,'refused');
 assert.equal(r.models.anatomical.status,'refused');
 assert.deepEqual(notes.map(n=>n.start),[0,0]);
});
test('FG-04C4 fixed author fingers and unknown fingers stay explicitly distinct',()=>{
 const notes=[n('xml:c',60,1),n('xml:e',64,null),n('xml:g',67,5)];
 const r=calc({notes});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.anchored,2);
 assert.equal(r.models.legacy.proposed,1);
 assert.equal(r.models.legacy.candidates[0].noteId,'xml:e');
 assert.ok(!r.models.legacy.candidates.some(n=>n.noteId==='xml:c'));
});
test('FG-04C4 exact length cap rejects excessive worker requests',()=>{
 const notes=Array.from({length:2501},(_,i)=>n('xml:'+i,60));
 assert.equal(calc({notes}).reason,'INVALID_NOTE_COUNT');
 assert.equal(calc({notes:[]}).reason,'INVALID_NOTE_COUNT');
});

// FG-04C5: hand span self-report calibration and refusal controls.
import './hand-span-calibration.test.mjs';


test('saved anatomical fingers are strict anchors by default, but independent comparison is read-only',()=>{
 const notes=[
  {...n('xml:c',60,null),userFinger:1},
  {...n('xml:d',64,null),userFinger:1},
  n('xml:g',67)
 ];
 const snapshot=structuredClone(notes);
 const protectedResult=calc({notes});
 assert.equal(protectedResult.ok,true,JSON.stringify(protectedResult));
 assert.equal(protectedResult.savedFingerCount,2);
 assert.equal(protectedResult.comparisonOnly,false);
 assert.equal(protectedResult.anchored,2);
 assert.equal(protectedResult.models.legacy.status,'refused');
 const compared=calc({notes,compareWithoutSaved:true});
 assert.equal(compared.ok,true,JSON.stringify(compared));
 assert.equal(compared.comparisonOnly,true);
 assert.equal(compared.savedFingerCount,2);
 assert.equal(compared.anchored,0);
 assert.equal(compared.models.legacy.status,'computed',JSON.stringify(compared));
 assert.equal(compared.models.anatomical.status,'computed',JSON.stringify(compared));
 assert.equal(compared.models.anatomical.proposed,3);
 assert.deepEqual(notes,snapshot,'comparison may not change stored or authored finger data');
});

test('ignoring saved user fingers does not bypass original MusicXML author anchors',()=>{
 const notes=[{...n('xml:c',60,1),userFinger:2},n('xml:e',64)];
 const source=structuredClone(notes);
 const report=calc({notes,compareWithoutSaved:true});
 assert.equal(report.ok,true,JSON.stringify(report));
 assert.equal(report.comparisonOnly,true);
 assert.equal(report.savedFingerCount,1);
 assert.equal(report.authorFingerCount,1);
 assert.equal(report.anchored,1);
 for(const mode of ['legacy','anatomical']){
  assert.equal(report.models[mode].status,'computed',JSON.stringify(report));
  assert.ok(report.models[mode].candidates.every(x=>x.noteId!=='xml:c'));
 }
 assert.deepEqual(notes,source);
 assert.equal(calc({notes,compareWithoutSaved:'yes'}).reason,'INVALID_COMPARISON_MODE');
});
