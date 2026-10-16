import test from 'node:test';
import assert from 'node:assert/strict';
import {
 fingerAcceptedSnapshot,fingerAcceptedValidate,fingerAcceptedRestore
} from '../src/core/finger-overrides.mjs';

const KEY='mid:45:0123456789abcdef';
const MIDI_ID='midi:0:1';
const xmlKey='xml:100:0123456789abcdef';
const clone=s=>structuredClone(s);
const song=()=>({format:'MIDI',midiFingerWorkKey:KEY,tracks:[{notes:[
 {noteId:'midi:0:0',pitch:60,start:0,duration:.5},
 {noteId:MIDI_ID,pitch:64,start:.5,duration:.5},
 {noteId:'midi:0:2',pitch:67,start:1,duration:.25}
]}]});
const accept=(note,finger,hand)=>{
 note.finger=finger;note.hand=hand;note.fingeringSource='pianomotion';
};

test('accepted PianoMotion survives serialization, same-work reload and is not author fingering',()=>{
 const a=song();
 accept(a.tracks[0].notes[0],1,'RH');
 accept(a.tracks[0].notes[1],3,'LH');
 const snap=fingerAcceptedSnapshot(a);
 assert.equal(snap.key,KEY);
 assert.equal(Object.keys(snap.entries).length,2);
 const saved=fingerAcceptedValidate({[snap.key]:snap.entries},{strict:true});
 const reloaded=song();
 assert.equal(fingerAcceptedRestore(reloaded,JSON.parse(JSON.stringify(saved))),2);
 assert.equal(reloaded.tracks[0].notes[0].fingeringSource,'pianomotion');
 assert.deepEqual([reloaded.tracks[0].notes[0].finger,reloaded.tracks[0].notes[0].hand],[1,'RH']);
 assert.deepEqual([reloaded.tracks[0].notes[1].finger,reloaded.tracks[0].notes[1].hand],[3,'LH']);
 assert.equal(reloaded.tracks[0].notes[2].finger,undefined);
 assert.deepEqual(fingerAcceptedSnapshot(reloaded).entries,snap.entries);
});

test('reset and undo follow the ACTUAL note state (never resurrect a cleared digit)',()=>{
 const a=song();
 accept(a.tracks[0].notes[0],2,'RH');
 const saved=fingerAcceptedValidate({[KEY]:fingerAcceptedSnapshot(a).entries},{strict:true});
 assert.equal(fingerAcceptedRestore(song(),saved),1);
 delete a.tracks[0].notes[0].finger;
 delete a.tracks[0].notes[0].fingeringSource;
 const cleared=fingerAcceptedSnapshot(a).entries;
 assert.equal(Object.keys(cleared).length,0,'cleared application creates no persisted accepted fingers');
 accept(a.tracks[0].notes[0],2,'RH');
 assert.equal(Object.keys(fingerAcceptedSnapshot(a).entries).length,1,'Undo returns the accepted finger');
});

test('different original bytes or changed note identity never receive stale fingers',()=>{
 const source=song();
 accept(source.tracks[0].notes[0],2,'RH');
 const snap=fingerAcceptedSnapshot(source);
 const changed=song();
 changed.midiFingerWorkKey='mid:45:ffffffffffffffff';
 assert.equal(fingerAcceptedRestore(changed,{[KEY]:snap.entries}),0);
 assert.equal(changed.tracks[0].notes[0].finger,undefined);
 const changedNote=song();
 changedNote.tracks[0].notes[0].pitch=61;
 assert.equal(fingerAcceptedRestore(changedNote,{[KEY]:snap.entries}),0);
 assert.equal(changedNote.tracks[0].notes[0].finger,undefined);
 const changedTiming=song();
 changedTiming.tracks[0].notes[0].duration=.45;
 assert.equal(fingerAcceptedRestore(changedTiming,{[KEY]:snap.entries}),0);
 const changedId=song();
 changedId.tracks[0].notes[0].noteId='midi:0:777';
 assert.equal(fingerAcceptedRestore(changedId,{[KEY]:snap.entries}),0);
});

test('original author digits are never overwritten; restores are atomic',()=>{
 const source=song();accept(source.tracks[0].notes[0],5,'LH');
 accept(source.tracks[0].notes[1],2,'RH');
 const saved=fingerAcceptedValidate({[KEY]:fingerAcceptedSnapshot(source).entries},{strict:true});
 const target=song();target.tracks[0].notes[1].finger=4;
 target.tracks[0].notes[1].fingeringSource='musicxml';
 assert.equal(fingerAcceptedRestore(target,saved),0);
 assert.equal(target.tracks[0].notes[0].finger,undefined);
 assert.equal(target.tracks[0].notes[1].finger,4);
 assert.equal(target.tracks[0].notes[1].fingeringSource,'musicxml');
});

test('strict backup validation rejects hostile, malformed and cross-source entries',()=>{
 const valid={pitch:60,start:0,duration:.5,finger:2,hand:'RH'};
 for(const bad of [
  {[KEY]:{[MIDI_ID]:{...valid,finger:7}}},
  {[KEY]:{[MIDI_ID]:{...valid,hand:'??'}}},
  {[KEY]:{'xml:a':valid}},
  {[KEY]:{[MIDI_ID]:{...valid,random:true}}},
  {[xmlKey]:{[MIDI_ID]:valid}},
  {'__proto__':{[MIDI_ID]:valid}}
 ]){
  if(!Object.hasOwn(bad,'__proto__'))
   assert.throws(()=>fingerAcceptedValidate(bad,{strict:true}));
 }
 assert.deepEqual(Object.keys(fingerAcceptedValidate(null)),[]);
});
