import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {proposePolyphonicFingering as finger,proposeTwoHandFingering as both} from '../src/core/fingering-polyphonic.mjs';

const pitches=(ps,start=0,duration=.42,anchor=[])=>ps.map((pitch,i)=>({
 pitch,start,duration,...(anchor[i]?{finger:anchor[i]}:{}),noteId:'note-'+i
}));
const result=(notes,hand='RH',extra={})=>{
 const r=finger(notes,{hand,...extra});assert.equal(r.ok,true,JSON.stringify(r));return r;
};
function legalChord(items,hand){
 const sorted=items.slice().sort((a,b)=>a.pitch-b.pitch);
 const arr=sorted.map(n=>n.finger);
 assert.equal(new Set(arr).size,arr.length,'Different simultaneous keys need different fingers');
 for(let i=1;i<arr.length;i++){
  assert(hand==='RH'?arr[i]>arr[i-1]:arr[i]<arr[i-1],'Hand must maintain pitch/finger order');
 }
}

test('RH C-E-G triad: conventional 1-3-5',()=>{
 const r=result(pitches([60,64,67]));
 legalChord(r.items,'RH');
 assert.deepEqual(r.items.map(n=>n.finger),[1,3,5]);
});
test('LH C-E-G triad: conventional 5-3-1',()=>{
 const r=result(pitches([48,52,55]),'LH');
 legalChord(r.items,'LH');
 assert.deepEqual(r.items.map(n=>n.finger),[5,3,1]);
});
test('RH C major first inversion E-G-C: distinct ergonomic fingers',()=>{
 const r=result(pitches([64,67,72]));legalChord(r.items,'RH');
 assert.equal(r.items.length,3);
});
test('RH C major second inversion G-C-E',()=>{
 const r=result(pitches([67,72,76]));legalChord(r.items,'RH');
});
test('LH first and second inversions respect physical order',()=>{
 for(const chord of [[52,55,60],[55,60,64]])legalChord(result(pitches(chord),'LH').items,'LH');
});
test('Sequence of three C-major triad inversions preserves stable note chronology',()=>{
 const notes=[
  ...pitches([60,64,67],0,.43),
  ...pitches([64,67,72],.55,.43),
  ...pitches([67,72,76],1.1,.43)
 ];
 const r=result(notes);
 assert.equal(r.items.length,9);
 for(let i=0;i<9;i+=3)legalChord(r.items.slice(i,i+3),'RH');
});
test('Arpeggiated C major has one note per onset and does not invent extra fingers',()=>{
 const notes=[60,64,67,72,67,64,60].map((pitch,i)=>({pitch,start:i*.43,duration:.38}));
 const r=result(notes);
 assert.equal(r.items.length,7);
 assert(r.items.every(n=>n.finger>=1&&n.finger<=5));
});
test('Held melody C4 while E4 enters: two unique physical fingers',()=>{
 const notes=[{pitch:60,start:0,duration:1.4},{pitch:64,start:.45,duration:.35}];
 const r=result(notes);
 assert.notEqual(r.items[0].finger,r.items[1].finger);
});
test('Three separately entering voices may overlap simultaneously',()=>{
 const notes=[
  {pitch:60,start:0,duration:2},
  {pitch:64,start:.4,duration:1},
  {pitch:67,start:.8,duration:.6}
 ];
 const r=result(notes);
 assert.equal(new Set(r.items.map(n=>n.finger)).size,3);
});
test('Partial chord: free fingers, never reuse a held one',()=>{
 const notes=[
  {pitch:60,start:0,duration:1.5,finger:1},
  {pitch:64,start:.4,duration:.3,finger:3},
  {pitch:67,start:.8,duration:.4,finger:5}
 ];
 const r=result(notes);
 assert.deepEqual(r.items.map(n=>n.finger),[1,3,5]);
});
test('User/author chord anchors remain immutable',()=>{
 const r=result(pitches([60,64,67],0,.42,[1,3,5]));
 assert.deepEqual(r.items.map(n=>n.source),['anchor','anchor','anchor']);
 assert.deepEqual(r.items.map(n=>n.finger),[1,3,5]);
});
test('Conflicting chord anchors fail, rather than silently reorder',()=>{
 const r=finger(pitches([60,64],0,.4,[4,2]),{hand:'RH'});
 assert.equal(r.ok,false);assert.equal(r.reason,'NO_VALID_PATH');
});
test('Same physical pitch in multiple voices at the same onset shares one finger',()=>{
 const notes=[
  {pitch:60,start:0,duration:.7,noteId:'sop',finger:1},
  {pitch:60,start:0,duration:.8,noteId:'alto',finger:1},
  {pitch:64,start:0,duration:.3,noteId:'mel'}
 ];
 const r=result(notes);
 assert.equal(r.items[0].finger,1);assert.equal(r.items[1].finger,1);
 assert.notEqual(r.items[2].finger,1);
 assert.deepEqual(r.items.map(n=>n.noteId),['sop','alto','mel']);
});
test('Unison voices with conflicting anchor fingers are rejected',()=>{
 const notes=[{pitch:60,start:0,duration:.5,finger:1},{pitch:60,start:0,duration:.6,finger:2}];
 assert.equal(finger(notes,{hand:'RH'}).reason,'CONFLICTING_UNISON_ANCHORS');
});
test('The same pitch struck while already held is flagged, not guessed',()=>{
 const notes=[{pitch:60,start:0,duration:1},{pitch:60,start:.3,duration:.4}];
 assert.equal(finger(notes,{hand:'RH'}).reason,'HELD_KEY_REARTICULATION_UNSUPPORTED');
});
test('Five-pitch chord uses five distinct fingers if physically reachable',()=>{
 const r=result(pitches([60,62,64,65,67]));
 legalChord(r.items,'RH');assert.equal(r.items.length,5);
});
test('Six simultaneous distinct keys per hand must fail',()=>{
 assert.equal(finger(pitches([60,62,64,65,67,69]),{hand:'RH'}).reason,'TOO_MANY_SIMULTANEOUS_KEYS');
});
test('Six overlapping distinct voices, even at different onset times, must fail',()=>{
 const notes=[60,62,64,65,67,69].map((pitch,i)=>({pitch,start:i*.1,duration:1.3}));
 assert.equal(finger(notes,{hand:'LH'}).reason,'TOO_MANY_SIMULTANEOUS_KEYS');
});
test('Tenths on small hands rejected; normal octave still possible for M',()=>{
 const tenth=finger(pitches([60,76]),{hand:'RH',handSize:'XXS'});
 assert.equal(tenth.reason,'NO_VALID_PATH');
 const octave=result(pitches([60,72]),'RH',{handSize:'M'});
 assert.equal(octave.items.length,2);
});
test('Sustained distant notes beyond hand reach are refused even in two onsets',()=>{
 const notes=[{pitch:48,start:0,duration:2},{pitch:64,start:.4,duration:.5}];
 assert.equal(finger(notes,{hand:'RH'}).reason,'NO_VALID_PATH');
});
test('Two explicit hands may each contain a simultaneous triad',()=>{
 const r=both({RH:pitches([60,64,67]),LH:pitches([48,52,55])});
 assert.equal(r.ok,true,JSON.stringify(r));
 legalChord(r.hands.RH,'RH');legalChord(r.hands.LH,'LH');
});
test('A two-hand song with only RH material is accepted, not split heuristically',()=>{
 const r=both({RH:pitches([60,64,67]),LH:[]});
 assert.equal(r.ok,true);assert.equal(r.hands.LH.length,0);
});
test('Cross-hand overlapping same-key attacks are reported as ambiguous',()=>{
 const r=both({RH:[{pitch:60,start:0,duration:1}],LH:[{pitch:60,start:.25,duration:1}]});
 assert.equal(r.reason,'CROSS_HAND_SAME_KEY_OVERLAP');
});
test('Hand ownership is explicit and cannot be silently switched',()=>{
 const notes=[{pitch:60,start:0,duration:1,hand:'LH'}];
 assert.equal(finger(notes,{hand:'RH'}).reason,'HAND_CONFLICT');
 assert.equal(finger(notes,{}).reason,'HAND_REQUIRED');
});
test('Bad hand size, beam width, anchors and pitches fail closed',()=>{
 const base=pitches([60,64]);
 assert.equal(finger(base,{hand:'RH',handSize:'INVALID'}).reason,'INVALID_HAND_SIZE');
 assert.equal(finger(base,{hand:'RH',beamWidth:0}).reason,'INVALID_BEAM_WIDTH');
 assert.equal(finger([{pitch:128,start:0,duration:.3}],{hand:'RH'}).reason,'INVALID_NOTE');
 assert.equal(finger([{pitch:60,start:0,duration:.3,finger:7}],{hand:'RH'}).reason,'INVALID_ANCHOR');
 assert.equal(finger([],{hand:'LH'}).reason,'INVALID_LENGTH');
 assert.equal(both({RH:[],LH:[]}).reason,'HAND_PARTS_REQUIRED');
});
test('Deterministic and input-order stable with no original mutation',()=>{
 const n=[...pitches([64,67,72],.6),...pitches([60,64,67],0)];
 const before=structuredClone(n);
 const a=result(n),b=result(n);
 assert.deepEqual(a,b);assert.deepEqual(n,before);
 assert.deepEqual(a.items.map(x=>x.pitch),n.map(x=>x.pitch));
});
test('Seven hand sizes each either yield a valid chord or report a reach failure',()=>{
 for(const handSize of ['XXS','XS','S','M','L','XL','XXL']){
  const r=finger(pitches([60,64,67]),{hand:'RH',handSize});
  assert(r.ok||r.reason==='NO_VALID_PATH',JSON.stringify(r));
 }
});
test('Bounded search performance for 400-note chord/arpeggio phrase',()=>{
 const notes=[];
 for(let i=0;i<100;i++){
  const root=60+((i%3)*2),start=i*.5;
  notes.push(...pitches([root,root+4,root+7],start,.24));
  notes.push({pitch:root+12,start:start+.25,duration:.20});
 }
 const start=performance.now(),r=finger(notes,{hand:'RH'}),ms=performance.now()-start;
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.items.length,400);
 console.log('FG-02B 400-note mixed-chord sample: '+ms.toFixed(2)+'ms (exploratory CI)');
 assert(ms<5000,'Search took longer than conservative CI safety bound: '+ms);
});

// FG-04C3: opt-in pair-specific reach constraints (legacy model unchanged).
import './fingering-anatomical-spans.test.mjs';
