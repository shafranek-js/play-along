import test from 'node:test';
import assert from 'node:assert/strict';
import {pianoMotionComposeExport} from '../src/core/pianomotion-export-composition.mjs';
import {fingerOverrideEffective} from '../src/core/finger-overrides.mjs';

const n=(id,pitch,finger,hand='RH')=>({
 noteId:id,pitch,start:pitch/4,duration:.5,velocity:90,channel:0,
 finger,hand,fingeringSource:'pianomotion'
});
const input=()=>{
 const a=n('midi:0:1',60,1),b=n('midi:0:2',62,2),
  c=n('midi:0:3',64,3),outside=n('midi:1:1',80,null);
 const piano={name:'Piano',notes:[a,b,c]},other={name:'Non-piano',notes:[outside]};
 return {song:{format:'MIDI',tracks:[piano,other]},piano,other,a,b,c,outside};
};
const call=(song,parts,edits)=>pianoMotionComposeExport(song,parts,edits,{
 effective:fingerOverrideEffective
});
test('manual numeric finger takes precedence; hand-only keeps accepted Python finger',()=>{
 const {song,piano,a,b,c}=input();
 const source=JSON.stringify(song);
 const result=call(song,[piano],{
  [a.noteId]:{finger:5,hand:'LH'},
  [b.noteId]:{finger:null,hand:'LH'}
 });
 assert.equal(result.ok,true);
 assert.equal(result.manualCount,1);
 assert.equal(result.solverCount,2);
 assert.equal(result.handOnly,1);
 assert.equal(result.totalNumbers,3);
 assert.deepEqual(result.tracks[0].notes.map(x=>[x.finger,x.hand,x.fingeringSource]),[
  [5,'LH','user'],[2,'LH','pianomotion'],[3,'RH','pianomotion']
 ]);
 assert.equal(JSON.stringify(song),source,'neither original Python notes nor raw score mutated');
 assert.notStrictEqual(result.tracks[0],piano);
 assert.notStrictEqual(result.tracks[0].notes[0],a);
 assert.strictEqual(song.tracks[0].notes[1],b);
 assert.strictEqual(song.tracks[0].notes[2],c);
});
test('manual correction on previously unresolved note is exported alongside applied Python',()=>{
 const {song,piano,c}=input();
 delete c.finger;delete c.hand;delete c.fingeringSource;
 const result=call(song,[piano],{[c.noteId]:{finger:4,hand:'RH'}});
 assert.equal(result.ok,true);
 assert.equal(result.manualCount,1);
 assert.equal(result.solverCount,2);
 assert.equal(result.tracks[0].notes[2].finger,4);
});
test('source-bound import refuses stale, invalid, out-of-scope and ambiguous IDs',()=>{
 const {song,piano,a,outside}=input();
 assert.equal(call(song,[piano],{[outside.noteId]:{finger:4,hand:'LH'}}).reason,
  'MANUAL_CORRECTION_OUTSIDE_EXPORTED_PIANO_PART');
 assert.equal(call(song,[piano],{'midi:9:3':{finger:2,hand:'RH'}}).reason,
  'MANUAL_CORRECTION_SOURCE_MISMATCH');
 assert.equal(call(song,[piano],{[a.noteId]:{finger:8,hand:'LH'}}).reason,
  'INVALID_MANUAL_CORRECTION');
 assert.equal(call(song,[{notes:[{...a}]}],{}).reason,'UNVERIFIED_SELECTED_NOTE');
 const duplicate=input();
 duplicate.song.tracks[1].notes[0].noteId=duplicate.a.noteId;
 assert.equal(call(duplicate.song,[duplicate.piano],{}).reason,
  'SOURCE_NOTE_ID_MISSING_OR_DUPLICATED');
});
