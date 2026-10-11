import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {proposeGeneralizedMonophonicFingering as run} from '../src/core/fingering-generalized.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';

const STEPS=[2,2,1,2,2,2,1];
const NOTES=tonic=>{
 const p=[tonic];for(let i=0;i<14;i++)p.push(p.at(-1)+STEPS[i%7]);return p;
};
const series=(pitches,options={})=>pitches.map((pitch,i)=>({
 pitch,start:i*(options.step??.45),duration:options.duration??.4,
 hand:options.hand??'RH',noteId:'note:'+i
}));
const fingers=r=>r.items.map(n=>n.finger);
test('FG-02F recognizes ascending major-scale geometry in ALL 12 pitch classes; no tonic allowlist',()=>{
 let recognized=0;
 for(let tonic=48;tonic<60;tonic++){
  for(const hand of ['RH','LH']){
   const notes=series(NOTES(tonic),{hand});
   const r=run(notes,{hand});
   assert.equal(r.ok,true,'tonic='+tonic+' '+JSON.stringify(r));
   assert.equal(r.items.length,15);
   assert.equal(audit(notes,r.items).valid,true);
   assert.deepEqual(r.items.map(x=>x.pitch),notes.map(x=>x.pitch));
   if(r.strategy==='generalized-melodic-hypothesis')recognized++;
  }
 }
 assert.equal(recognized,24,'All diatonic signatures must be eligible for a key-independent hypothesis');
});
test('FG-02F descending scale: physical direction is relative to the hand',()=>{
 for(const tonic of [48,49,53,56,59])for(const hand of ['RH','LH']){
  const notes=series(NOTES(tonic).reverse(),{hand});
  const r=run(notes,{hand});
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(audit(notes,r.items).valid,true);
  assert.equal(r.phraseKind,'monotone-stepwise');
 }
});
test('FG-02F handles ascending + descending major triad arpeggios without a tonic whitelist',()=>{
 for(let tonic=48;tonic<60;tonic++)for(const hand of ['RH','LH']){
  const asc=[tonic,tonic+4,tonic+7,tonic+12,tonic+16,tonic+19,tonic+24];
  for(const pitches of [asc,asc.slice().reverse()]){
   const notes=series(pitches,{hand});
   const r=run(notes,{hand});
   assert.equal(r.ok,true,'tonic='+tonic+' '+hand+' '+JSON.stringify(r));
   assert.equal(audit(notes,r.items).valid,true);
   if(r.strategy==='generalized-melodic-hypothesis'){
    assert.equal(r.phraseKind,'monotone-arpeggiated');
   }else{
    assert.match(r.strategy,/^baseline-(no-generalized-path|independent-audit-rejected)$/);
   }
  }
 }
});
test('FG-02F preserves arbitrary partial author anchors and independently validates them',()=>{
 const notes=series(NOTES(60));
 notes[0].finger=1;notes[3].finger=4;notes[14].finger=5;
 const before=structuredClone(notes),r=run(notes,{hand:'RH'});
 assert.equal(r.ok,true);
 assert.deepEqual(notes,before,'input never mutated');
 for(const i of [0,3,14]){
  assert.equal(r.items[i].finger,notes[i].finger);
  assert.equal(r.items[i].source,'anchor');
 }
 assert.equal(audit(notes,r.items).valid,true);
});
test('FG-02F one black-key thumb anchor is preserved or baseline reports inability',()=>{
 const notes=series(NOTES(61));
 notes[0].finger=1;
 const r=run(notes,{hand:'RH'});
 assert.equal(r.ok,true);
 assert.equal(r.items[0].finger,1);
 assert.equal(r.items[0].source,'anchor');
});
test('FG-02F never converts incompatible original fixed fingers into a guess',()=>{
 const notes=series([60,62],{step:.15,duration:.10});
 notes[0].finger=1;notes[1].finger=1;
 assert.equal(run(notes,{hand:'RH'}).reason,'NO_VALID_PATH');
});
test('FG-02F no inferred hand, and conflicting explicit hand labels fail closed',()=>{
 const notes=series(NOTES(60),{hand:'RH'});
 assert.equal(run(notes,{}).reason,'HAND_REQUIRED');
 const conflicting=structuredClone(notes);conflicting[5].hand='LH';
 assert.equal(run(conflicting,{hand:'RH'}).reason,'HAND_CONFLICT');
});
test('FG-02F a mixed-direction musical phrase correctly falls back to FG-02A',()=>{
 const notes=series([60,64,62,65,67,69,67,72]);
 const r=run(notes,{hand:'RH'});
 assert.equal(r.ok,true);
 assert.equal(r.strategy,'baseline-outside-monotonic-scope');
});
test('FG-02F chromatic sequence does not fake a diatonic-scale class',()=>{
 const notes=series(Array.from({length:20},(_,i)=>60+i));
 const r=run(notes,{hand:'RH'});
 assert.equal(r.strategy,'baseline-outside-monotonic-scope');
});
test('FG-02F rejects overlapping MIDI polyphony: only true monophonic passages supported',()=>{
 const notes=[{pitch:60,start:0,duration:.6,hand:'RH'},
  {pitch:64,start:.1,duration:.6,hand:'RH'}];
 assert.equal(run(notes,{hand:'RH'}).reason,'POLYPHONY_UNSUPPORTED');
});
test('FG-02F rejects malformed parameters without throwing or silent coercion',()=>{
 const ns=series(NOTES(60));
 assert.equal(run(ns,{hand:'RH',handSize:'Q'}).reason,'INVALID_HAND_SIZE');
 assert.equal(run(ns,{hand:'RH',beamWidth:0}).reason,'INVALID_BEAM_WIDTH');
 assert.equal(run(ns,{hand:'RH',beamWidth:2.5}).reason,'INVALID_BEAM_WIDTH');
 assert.equal(run(ns,{hand:'RH',beamWidth:257}).reason,'INVALID_BEAM_WIDTH');
 const invalid=structuredClone(ns);invalid[2].pitch=132;
 assert.equal(run(invalid,{hand:'RH'}).reason,'INVALID_NOTE');
});
test('FG-02F deterministic across search repetitions, note IDs and reverse caller order',()=>{
 const original=series(NOTES(55)).reverse(),snapshot=structuredClone(original);
 const a=run(original,{hand:'RH'}),b=run(original,{hand:'RH'});
 assert.deepEqual(a,b);assert.deepEqual(original,snapshot);
 assert.deepEqual(a.items.map(n=>n.noteId),original.map(n=>n.noteId));
 assert.deepEqual(a.items.map(n=>n.pitch),original.map(n=>n.pitch));
 assert.deepEqual(a.items.map(n=>n.start),original.map(n=>n.start));
});
test('FG-02F hand-size options preserve source notes and valid finger bounds',()=>{
 const melody=series(NOTES(60),{hand:'LH'});
 for(const handSize of ['XXS','XS','S','M','L','XL','XXL']){
  const r=run(melody,{hand:'LH',handSize});
  assert.equal(r.ok,true,handSize);
  assert.equal(audit(melody,r.items,{handSize}).valid,true);
  assert.equal(r.items.length,15);
 }
});
test('FG-02F does not manufacture accuracy or medical/biometric certainty',()=>{
 const r=run(series(NOTES(60)),{hand:'RH'});
 assert.equal(r.expertValidated,false);
 assert.equal(r.confidence,null);
 assert.equal(r.strategy,'generalized-melodic-hypothesis');
 assert.equal(r.items.every(x=>x.source==='proposed-generalized'),true);
});
test('FG-02F bounded performance on 1800 notes and no O(N^2) path explosion',()=>{
 const notes=series(Array.from({length:1800},(_,i)=>42+i%12));
 const t=performance.now();
 const r=run(notes,{hand:'RH'}),elapsed=performance.now()-t;
 assert.equal(r.ok,true);
 assert.equal(r.items.length,1800);
 console.log('FG-02F 1800-note mixed-direction baseline fallback: '+elapsed.toFixed(1)+'ms');
 assert(elapsed<3000,'Exploratory CI safety bound exceeded: '+elapsed);
});
