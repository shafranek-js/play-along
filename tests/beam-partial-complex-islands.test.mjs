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
