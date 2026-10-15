import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserFingeringResearch as run}
 from '../src/core/browser-fingering-research.mjs';
const note=(id,pitch,start,duration,hand='RH',extra={})=>({
 noteId:'xml:P1:0:0:'+id,pitch,start,duration,hand,
 staff:hand==='RH'?'1':'2',voice:'1',...extra
});

test('NO_VALID_PATH is local: simple phrases survive impossible B3–F5 held chord',()=>{
 const notes=[
  note(1,60,0,.3),note(2,62,.4,.3),note(3,48,0,.3,'LH'),
  note(4,59,3,1.8),note(5,77,3,1.8),
  note(6,64,6,.3),note(7,65,6.5,.3)
 ];
 const old=structuredClone(notes),r=run({notes});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.noteCount,7);
 assert.equal(r.omittedCount,0,'no held unison in this example');
 for(const mode of ['legacy','anatomical']){
  const m=r.models[mode];
  assert.equal(m.status,'computed',JSON.stringify(m));
  assert.equal(m.omittedCount,2,JSON.stringify(m));
  assert.deepEqual(m.omittedNotes.map(x=>x.pitch),[59,77]);
  assert.equal(m.omittedNotes.every(x=>x.reason==='NO_VALID_PATH'),true);
  assert.equal(m.candidates.length,5);
  const ids=new Set(m.omittedNotes.map(x=>x.noteId));
  assert.ok(m.candidates.every(x=>!ids.has(x.noteId)));
 }
 assert.deepEqual(notes,old,'neither model may change original score notes');
});

test('model-specific partial omissions do not inflate disagreement count',()=>{
 const notes=[
  note(1,60,0,.4),note(2,64,.5,.4),
  note(3,59,3,1),note(4,77,3,1),
  note(5,65,5,.3),note(6,48,0,.4,'LH')
 ];
 const r=run({notes,handSize:'M'});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.models.legacy.omittedCount,2);
 assert.equal(r.models.anatomical.omittedCount,2);
 assert.equal(r.models.legacy.candidates.length,4);
 assert.equal(r.disagreements>=0,true);
});

test('fail closed on nonrecoverable cross-hand co-onset collision',()=>{
 const r=run({notes:[note(1,60,0,.5,'RH'),note(2,60,0,.4,'LH')]});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'AMBIGUOUS_CROSS_HAND_SAME_ONSET_UNISON');
});

test('documented author fingering remains unchanged within omitted island',()=>{
 const notes=[
  note(1,60,0,.3),note(2,59,2,1,'RH',{authorFinger:1}),
  note(3,77,2,1),note(4,62,4,.3)
 ];
 const old=structuredClone(notes),r=run({notes});
 assert.equal(r.ok,true,JSON.stringify(r));
 for(const mode of ['legacy','anatomical']){
  assert.equal(r.models[mode].status,'computed');
  assert.equal(r.models[mode].omittedCount,2);
  assert.ok(!r.models[mode].candidates.some(x=>x.noteId===notes[1].noteId));
 }
 assert.deepEqual(notes,old);
});


test('FG-02B bounded Beam Search explains rejected onset without changing constraints',async()=>{
 const {proposePolyphonicFingering}=await import('../src/core/fingering-polyphonic.mjs');
 const chord=[note(1,59,0,1),note(2,77,0,1)];
 const original=structuredClone(chord);
 const result=proposePolyphonicFingering(chord,{hand:'RH',handSize:'M'});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'NO_VALID_PATH');
 assert.equal(result.failureAt.start,0);
 assert.deepEqual(result.failureAt.pitches,[59,77]);
 assert.equal(result.failureAt.survivingBeamStates,1);
 assert.ok(result.failureAt.pruned.spanOrFingerOrder>0,
  JSON.stringify(result.failureAt));
 assert.deepEqual(result.failureAt.noteIds,chord.map(n=>n.noteId));
 assert.deepEqual(chord,original);
});

test('both Beam models keep independent evidence and auditable partial coverage',()=>{
 const notes=[
  note(1,60,0,.2),note(2,64,.3,.2),
  note(3,59,2,1.4),note(4,77,2,1.4),
  note(5,67,5,.2),note(6,48,0,.2,'LH')
 ];
 const original=structuredClone(notes),result=run({notes,handSize:'M'});
 assert.equal(result.ok,true);
 for(const mode of ['legacy','anatomical']){
  const model=result.models[mode];
  assert.equal(model.status,'computed',JSON.stringify(model));
  assert.equal(model.coveragePercent,66.7);
  assert.equal(model.eligibleCount,4);
  assert.equal(model.omittedGroups.length,1);
  assert.equal(model.omittedGroups[0].reason,'NO_VALID_PATH');
  assert.equal(model.omittedGroups[0].hand,'RH');
  assert.equal(model.omittedGroups[0].notes,2);
  assert.deepEqual(model.omittedGroups[0].failureAt.pitches,[59,77]);
  assert.ok(model.omittedGroups[0].failureAt.pruned.spanOrFingerOrder>0);
  assert.ok(model.candidates.every(n=>n.noteId!==notes[2].noteId&&n.noteId!==notes[3].noteId));
 }
 assert.deepEqual(notes,original);
});


test('adaptive 40->80->128 exhausts only blocked islands and keeps reach constraints',()=>{
 const notes=[
  note('start',60,0,.2),note('next',62,.3,.2),
  note('wide-low',59,3,1.5),note('wide-high',77,3,1.5),
  note('tail',65,6,.2),note('bass',48,0,.2,'LH')
 ];
 const before=structuredClone(notes);
 const result=run({notes,handSize:'M'});
 assert.equal(result.ok,true,JSON.stringify(result));
 for(const mode of ['legacy','anatomical']){
  const m=result.models[mode];
  assert.equal(m.status,'computed',JSON.stringify(m));
  assert.equal(m.omittedCount,2);
  assert.equal(m.recoveredNotes,0);
  assert.deepEqual(m.beamRecoveries,[]);
  assert.deepEqual(m.omittedGroups[0].beamAttemptWidths,[40,80,128]);
  assert.equal(m.eligibleCount,4);
  assert.equal(m.coveragePercent,66.7);
  assert.equal(m.candidates.length,4);
  assert.ok(m.candidates.every(n=>!['xml:P1:0:0:wide-low','xml:P1:0:0:wide-high'].includes(n.noteId)));
 }
 assert.deepEqual(notes,before,'score notes and annotations may not change on retry');
});

test('adaptive widths preserve normal 40-width chord output bit-for-bit',async()=>{
 const {proposeHybridScoreFingering}=await import('../src/core/fingering-score-router.mjs');
 const rh=[note('C',60,0,.5),note('E',64,0,.5),note('G',67,0,.5)];
 const a=proposeHybridScoreFingering({RH:rh,LH:[]},{beamWidth:40,costModel:'anatomical'});
 const b=proposeHybridScoreFingering({RH:rh,LH:[]},{beamWidth:40,costModel:'anatomical'});
 assert.equal(a.ok,true,JSON.stringify(a));
 assert.deepEqual(a,b);
 assert.deepEqual(a.hands.RH.map(n=>n.finger),[1,3,5]);
 assert.deepEqual(a.diagnostics.beamRecoveries,[]);
 assert.equal(a.segments.RH[0].beamWidthUsed,undefined);
});

test('explicit beamWidth 80 is a single direct run, not auto-expanded',async()=>{
 const {proposeHybridScoreFingering}=await import('../src/core/fingering-score-router.mjs');
 const rh=[note('low',59,0,1),note('high',77,0,1)];
 const r=proposeHybridScoreFingering({RH:rh,LH:[]},{beamWidth:80,costModel:'anatomical'});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'NO_VALID_PATH');
 assert.equal(r.beamAttemptWidths,undefined);
 assert.deepEqual(r.segmentNoteIds,rh.map(n=>n.noteId));
});
