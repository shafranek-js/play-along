import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {proposeMonophonicFingering as optimize} from '../src/core/fingering-dp.mjs';

const melody=(pitches,step=.5,duration=.45)=>pitches.map((pitch,i)=>({pitch,start:i*step,duration}));
const ascending=melody([60,62,64,65,67,69,71,72]);
const descending=melody([72,71,69,67,65,64,62,60]);
const fingers=(notes,opts)=>{const r=optimize(notes,opts);assert.equal(r.ok,true,JSON.stringify(r));return r.items.map(n=>n.finger)};
test('RH C major scale: conventional one-octave thumb-under fingering',()=>{
 assert.deepEqual(fingers(ascending,{hand:'RH'}),[1,2,3,1,2,3,4,5]);
});
test('LH ascending C major scale: conventional cross-over',()=>{
 assert.deepEqual(fingers(ascending,{hand:'LH'}),[5,4,3,2,1,3,2,1]);
});
test('Descending C major in RH has valid five-finger solution',()=>{
 const f=fingers(descending,{hand:'RH'});assert.equal(f.length,8);assert(f.every(n=>n>=1&&n<=5));
});
test('Descending C major in LH has valid five-finger solution',()=>{
 const f=fingers(descending,{hand:'LH'});assert.equal(f.length,8);assert(f.every(n=>n>=1&&n<=5));
});
test('Chromatic run does not repeat one finger on an adjacent semitone at speed',()=>{
 const f=fingers(melody(Array.from({length:13},(_,i)=>60+i)),{hand:'RH'});
 for(let i=1;i<f.length;i++)assert.notEqual(f[i],f[i-1]);
});
test('Rapid repeated G4 rotates fingering instead of endlessly repeating one finger',()=>{
 const f=fingers(melody([67,67,67,67],.16,.12),{hand:'RH'});
 assert(new Set(f).size>=2,JSON.stringify(f));
});
test('Slow repeated note permits the same finger',()=>{
 const f=fingers(melody([67,67,67],1.5,.1),{hand:'RH'});
 assert(f.every(n=>n>=1&&n<=5));
});
test('Explicit author anchors are hard constraints',()=>{
 const anchored=ascending.map((n,i)=>({...n,...(i===0?{finger:1}:i===7?{finger:5}:{})}));
 const r=optimize(anchored,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.items[0].finger,1);assert.equal(r.items[7].finger,5);
 assert.equal(r.items[0].source,'anchor');assert.equal(r.items[1].source,'proposed');
});
test('Black-key fingering anchor is preserved even when less comfortable',()=>{
 const r=optimize([{pitch:61,start:0,duration:.4,finger:1},{pitch:63,start:.5,duration:.4}],{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.items[0].finger,1);
});
test('Two simultaneous chord pitches are rejected, not assigned one monophonic hand path',()=>{
 const r=optimize([{pitch:60,start:0,duration:1},{pitch:64,start:0,duration:1}],{hand:'RH'});
 assert.deepEqual(r,{ok:false,reason:'POLYPHONY_UNSUPPORTED'});
});
test('Significant legato overlap is rejected instead of pretending to be monophonic',()=>{
 const r=optimize([{pitch:60,start:0,duration:.6},{pitch:64,start:.2,duration:.6}],{hand:'LH'});
 assert.equal(r.reason,'POLYPHONY_UNSUPPORTED');
});
test('Small quantization overlap <=35ms is tolerated',()=>{
 const r=optimize([{pitch:60,start:0,duration:.51},{pitch:62,start:.49,duration:.48}],{hand:'RH'});
 assert.equal(r.ok,true);
});
test('Missing/invalid hand and hand-size fail closed',()=>{
 assert.equal(optimize(ascending,{}).reason,'HAND_REQUIRED');
 assert.equal(optimize(ascending,{hand:'R'}).reason,'HAND_REQUIRED');
 assert.equal(optimize(ascending,{hand:'RH',handSize:'SUPER'}).reason,'INVALID_HAND_SIZE');
});
test('Invalid pitch/duration and finger anchors are rejected',()=>{
 assert.equal(optimize([{pitch:128,start:0,duration:1}],{hand:'RH'}).reason,'INVALID_NOTE');
 assert.equal(optimize([{pitch:60,start:0,duration:0}],{hand:'RH'}).reason,'INVALID_NOTE');
 assert.equal(optimize([{pitch:60,start:0,duration:1,finger:9}],{hand:'RH'}).reason,'INVALID_ANCHOR');
 assert.equal(optimize([], {hand:'RH'}).reason,'INVALID_LENGTH');
});
test('All seven hand size presets produce complete paths',()=>{
 for(const handSize of ['XXS','XS','S','M','L','XL','XXL']){
  const r=optimize(ascending,{hand:'RH',handSize});
  assert.equal(r.ok,true,handSize);
  assert.equal(r.items.length,8);
 }
});
test('Deterministic repeated computation and stable note order',()=>{
 const permuted=[ascending[2],ascending[0],ascending[1],...ascending.slice(3)];
 const original=permuted.map(x=>({...x}));
 const a=optimize(permuted,{hand:'RH'}),b=optimize(permuted,{hand:'RH'});
 assert.deepEqual(a,b);assert.deepEqual(permuted,original,'input must not be mutated');
 assert.deepEqual(a.items.map(n=>n.pitch),permuted.map(n=>n.pitch),'output keeps caller order');
});
test('Impossible consecutive author anchors return NO_VALID_PATH, never silently override',()=>{
 const notes=melody([60,62],.5,.4).map((n,i)=>({...n,finger:1}));
 const result=optimize(notes,{hand:'RH'});
 assert.equal(result.ok,false);assert.equal(result.reason,'NO_VALID_PATH');
});
test('2500-note performance sample, recorded separately from UI correctness',()=>{
 const pitches=Array.from({length:2500},(_,i)=>60+(i%8));
 const input=melody(pitches,.33,.25);
 // Warm up JIT before the measurement; 150 ms is an experimental target,
 // not yet a demonstrated universal performance guarantee.
 optimize(ascending,{hand:'RH'});
 const start=performance.now(),r=optimize(input,{hand:'RH'}),ms=performance.now()-start;
 assert.equal(r.ok,true);assert.equal(r.items.length,2500);
 console.log('FG-02A DP 2500-note sample: '+ms.toFixed(2)+' ms (research target <150ms)');
 assert(ms<750,'Exploratory runtime exceeds a conservative CI safety bound: '+ms+'ms');
});
