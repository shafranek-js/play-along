import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeContextualMonophonicFingering as solve} from '../src/core/fingering-contextual.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';

const make=(pitches,{hand='RH',step=.25,duration=.18,anchors={}}={})=>
 pitches.map((pitch,i)=>({pitch,start:i*step,duration,hand,
  noteId:'test:'+i,...(Object.hasOwn(anchors,i)?{finger:anchors[i]}:{})}));
const fingers=r=>r.items.map(n=>n.finger);
test('FG-02H mixed direction forward and backward with maintained hand and all notes',()=>{
 const n=make([60,62,64,65,64,62,60,62,64,67,65,64]);
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.items.length,n.length);
 assert.equal(audit(n,r.items).valid,true);
 assert.ok(r.diagnostics.boundaries.some(b=>b.reason==='DIRECTION_CHANGE'));
 assert.ok(r.items.every(n=>n.source==='proposed-contextual'));
});
test('FG-02H repeated notes are allowed with same or alternating fingers',()=>{
 const n=make([60,60,60,62,62,60],{step:.2,duration:.15});
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.items.length,6);
});
test('FG-02H RH/LH turn does not claim to infer playing fingers',()=>{
 for(const hand of ['LH','RH']){
  const notes=make([60,64,67,64,60,57,60],{hand});
  const r=solve(notes,{hand});
  assert.equal(r.ok,true);
  assert.deepEqual(r.items.map(n=>n.hand),Array(notes.length).fill(hand));
  assert.equal(r.expertValidated,false);assert.equal(r.confidence,null);
 }
});
test('FG-02H preserves unusual but sequential authored same-finger slide, with warning',()=>{
 const n=make([60,62,64,65],{step:.2,duration:.18,anchors:{0:1,1:1,2:2,3:3}});
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(fingers(r),[1,1,2,3]);
 assert.deepEqual(r.items.map(x=>x.source),Array(4).fill('anchor'));
 assert.equal(r.diagnostics.warnings.some(w=>w.code==='AUTHOR_ANCHOR_SLIDE_UNVERIFIED'),true);
 assert.equal(audit(n,r.items).valid,true);
});
test('FG-02H author source finger always supersedes soft ergonomic preference',()=>{
 const n=make([62,64,65,64,62,60],{anchors:{0:4,1:1,2:5,3:5,4:3,5:1}});
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(fingers(r),[4,1,5,5,3,1]);
});
test('FG-02H author anchored black-key thumb accepted without silent override',()=>{
 const n=make([61,63,65,66],{anchors:{0:1,2:5,3:1}});
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.items[0].finger,1);
 assert.equal(r.items[3].finger,1);
});
test('FG-02H rest marks break position continuity without skipping note IDs',()=>{
 const n=make([60,62,64,65,67]);
 n[3].start=2.5;n[4].start=2.75;
 const r=solve(n,{hand:'RH'});
 assert.equal(r.ok,true);
 assert.equal(r.diagnostics.boundaries.some(x=>x.reason==='REST'),true);
 assert.deepEqual(r.items.map(x=>x.noteId),n.map(x=>x.noteId));
});
test('FG-02H never pretends simultaneously held keys are a monophonic phrase',()=>{
 const n=[{pitch:60,start:0,duration:.6,hand:'LH'},
  {pitch:64,start:.1,duration:.5,hand:'LH'}];
 assert.equal(solve(n,{hand:'LH'}).reason,'POLYPHONY_UNSUPPORTED');
});
test('FG-02H two hands known from source must not be collapsed or guessed',()=>{
 const n=make([60,62,64]);n[1].hand='LH';
 assert.equal(solve(n,{hand:'RH'}).reason,'HAND_CONFLICT');
 assert.equal(solve(n,{}).reason,'HAND_REQUIRED');
});
test('FG-02H malformed fingers, handSize and note data fail closed',()=>{
 const n=make([60,62,64]);
 assert.equal(solve(n,{hand:'RH',handSize:'XXXXL'}).reason,'INVALID_HAND_SIZE');
 n[1].finger=0;assert.equal(solve(n,{hand:'RH'}).reason,'INVALID_ANCHOR');
 delete n[1].finger;n[1].duration=0;assert.equal(solve(n,{hand:'RH'}).reason,'INVALID_NOTE');
 assert.equal(solve([], {hand:'RH'}).reason,'INVALID_LENGTH');
});
test('FG-02H output retains caller order and never mutates source',()=>{
 const n=make([60,62,64,65,67,65,64]).reverse(),frozen=structuredClone(n);
 const a=solve(n,{hand:'RH'}),b=solve(n,{hand:'RH'});
 assert.deepEqual(n,frozen);
 assert.deepEqual(a,b);
 assert.deepEqual(a.items.map(x=>x.pitch),n.map(x=>x.pitch));
 assert.deepEqual(a.items.map(x=>x.start),n.map(x=>x.start));
 assert.deepEqual(a.items.map(x=>x.duration),n.map(x=>x.duration));
 assert.deepEqual(a.items.map(x=>x.noteId),n.map(x=>x.noteId));
});
test('FG-02H no pitch class hardcoding; 12 semitone transpositions across both hands',()=>{
 const melody=[60,62,64,65,64,62,60,59];
 for(let tonic=0;tonic<12;tonic++)for(const hand of ['RH','LH']){
  const n=make(melody.map(p=>p+tonic),{hand});
  const r=solve(n,{hand});
  assert.equal(r.ok,true,'tonic '+tonic+' '+hand);
  assert.equal(audit(n,r.items).valid,true);
 }
});
test('FG-02H seven hand sizes cannot alter explicitly authored anchor assignments',()=>{
 for(const handSize of ['XXS','XS','S','M','L','XL','XXL']){
  const n=make([60,62,64,65,67],{anchors:{0:1,1:1,2:3,3:1,4:5}});
  const r=solve(n,{hand:'RH',handSize});
  assert.equal(r.ok,true,handSize);
  assert.deepEqual(fingers(r),[1,1,3,1,5]);
 }
});
test('FG-02H authoritative held finger cannot be reassigned to a second overlapping key',()=>{
 const n=make([60,64,67],{anchors:{0:1,1:1,2:2}});
 n[0].duration=.5;n[1].start=.25;
 assert.equal(solve(n,{hand:'RH'}).reason,'POLYPHONY_UNSUPPORTED');
});
test('FG-02H score only represents research cost, no confidence percentage',()=>{
 const r=solve(make([60,62,64,62,60]),{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.method,'fg02h-research-mixed-direction-dp');
 assert.equal(r.expertValidated,false);assert.equal(r.confidence,null);
});
