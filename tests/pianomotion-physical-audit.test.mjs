import test from 'node:test';
import assert from 'node:assert/strict';
import {pianoMotionAuditFingers} from '../src/core/pianomotion-physical-audit.mjs';
import {pianoMotionProposeBatch,pianoMotionCommitBatch,pianoMotionEmptyHistory}
 from '../src/core/pianomotion-review.mjs';
const note=(pitch,start,duration)=>({pitch,start,duration});
const alignment=rows=>({ok:true,matches:rows.map(([pitch,start,duration,hand,finger])=>({
 note:note(pitch,start,duration),
 suggestion:{pitch,start,end:start+duration,hand,finger}
}))});
test('one finger on two different held keys blocks BOTH source-bound notes',()=>{
 const x=alignment([[60,0,1,'RH',1],[64,.2,.3,'RH',1],[72,1,.2,'RH',1]]);
 const r=pianoMotionAuditFingers(x);
 assert.deepEqual(r.blocked,[0,1]);assert.equal(r.safe,1);
 assert.equal(r.counts.OCCUPIED_FINGER,2);
 const batch=pianoMotionProposeBatch(x,[0,1,2],{},r);
 assert.equal(batch.blockedCount,2);
 assert.deepEqual(batch.patches.map(p=>p.index),[2]);
 assert.equal(pianoMotionCommitBatch(pianoMotionEmptyHistory(),batch).count,1);
 assert.equal(x.matches[0].note.finger,undefined);
});
test('same key held across two different hands cannot get two contacts',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,.5,'RH',1],[60,.05,.4,'LH',2]]));
 assert.equal(r.hardConflicts,2);
 assert.equal(r.counts.SAME_KEY_OVERLAP,2);
});
test('same-onset unison for same physical finger is explicitly allowed',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,.5,'RH',2],[60,0,.5,'RH',2]]));
 assert.deepEqual(r.blocked,[]);
});
test('same physical key reattack before release is blocked',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,.5,'RH',2],[60,.1,.5,'RH',2]]));
 assert.deepEqual(r.blocked,[0,1]);
 assert.equal(r.counts.SAME_KEY_OVERLAP,2);
});
test('six concurrent distinct keys in one hand all marked, not just last',()=>{
 const r=pianoMotionAuditFingers(alignment(
  Array.from({length:6},(_,i)=>[60+i,0,1,'LH',1+i%5])));
 assert.deepEqual(r.blocked,[0,1,2,3,4,5]);
 assert.equal(r.counts.MORE_THAN_FIVE_HELD_KEYS,6);
});
test('the same finger may move at exact physical key release despite sustain pedal',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,.2,'RH',1],[64,.2,.2,'RH',1]]));
 assert.equal(r.safe,2);assert.deepEqual(r.blocked,[]);
});
test('unresolved notes are preserved but never counted as safe assigned fingers',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,1,'RH',null],[64,0,.4,'RH',2]]));
 assert.equal(r.assigned,1);assert.equal(r.unresolved,1);assert.equal(r.safe,1);
});
test('manual source note is not modified even if PianoMotion conflicts are reported',()=>{
 const a=alignment([[60,0,1,'RH',1],[64,.2,.5,'RH',1],[72,2,.2,'RH',2]]);
 a.matches[0].note.finger=3;a.matches[0].note.fingeringSource='musicxml';
 const r=pianoMotionAuditFingers(a),batch=pianoMotionProposeBatch(a,[0,1,2],{},r);
 assert.deepEqual(batch.patches.map(p=>p.index),[2]);
 assert.equal(a.matches[0].note.finger,3);
});
test('large deterministic non-overlapping score is linear in active notes',()=>{
 const items=Array.from({length:10000},(_,i)=>[60+i%12,i*.1,.045,i%2?'RH':'LH',1+i%5]);
 const r=pianoMotionAuditFingers(alignment(items));
 assert.equal(r.ok,true);assert.equal(r.safe,10000);assert.equal(r.hardConflicts,0);
});
test('invalid note, invalid config and missing source alignment refuse',()=>{
 assert.equal(pianoMotionAuditFingers({ok:false,matches:[]}).reason,'INVALID_SOURCE_ALIGNMENT');
 assert.equal(pianoMotionAuditFingers(alignment([[60,0,1,'RH',1]]),{epsilon:-1}).ok,false);
 const a=alignment([[60,0,1,'RH',1]]);a.matches[0].note.duration=0;
 assert.equal(pianoMotionAuditFingers(a).reason,'INVALID_SOURCE_OR_PROPOSAL');
});

test('PianoMotion allowed adjacent double-thumb is a technique exception, not refusal',()=>{
 const r=pianoMotionAuditFingers(alignment([[60,0,.5,'RH',1],[62,0,.5,'RH',1]]));
 assert.deepEqual(r.blocked,[]);assert.equal(r.safe,2);
 assert.equal(r.techniqueExceptions,1);
});
test('PianoMotion allowed adjacent double-pinky on white keys and double-thumb on black keys',()=>{
 const pinky=pianoMotionAuditFingers(alignment([[64,0,.5,'RH',5],[65,0,.5,'RH',5]]));
 const thumb=pianoMotionAuditFingers(alignment([[61,0,.5,'RH',1],[63,0,.5,'RH',1]]));
 assert.equal(pinky.safe,2);assert.equal(thumb.safe,2);
 assert.equal(pinky.techniqueExceptions,1);
 assert.equal(thumb.techniqueExceptions,1);
});
test('distant double-thumb and non-thumb black-key pairs remain hard contradictions',()=>{
 const distant=pianoMotionAuditFingers(alignment([[60,0,1,'RH',1],[64,0,1,'RH',1]]));
 const blackPinky=pianoMotionAuditFingers(alignment([[61,0,1,'LH',5],[63,0,1,'LH',5]]));
 assert.deepEqual(distant.blocked,[0,1]);
 assert.deepEqual(blackPinky.blocked,[0,1]);
});

test('pathologically dense held-note stream refuses before quadratic work',()=>{
 const notes=Array.from({length:66},(_,i)=>[40+i,0,4,'RH',1+i%5]);
 const r=pianoMotionAuditFingers(alignment(notes));
 assert.equal(r.ok,false);
 assert.equal(r.reason,'UNSUPPORTED_HELD_NOTE_DENSITY');
});
