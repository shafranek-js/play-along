import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importPianoMotionMidiFingeringResearch as run} from '../src/core/pianomotion-midi-fingering-bridge.mjs';
const bytes=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,
 0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
]);
const sha=createHash('sha256').update(bytes).digest('hex');
const event={midiTrackIndex:0,channel:0,noteOnOrdinal:0,noteOffOrdinal:1};
const baseline=()=>({
 rawBaseline:{status:'loaded',inputSha256:sha,identityLosses:[],unmappedSourceNoteIds:[],
  sourceNotes:[{noteId:'raw:0',pitch:60,start:0,end:.5,sourceEvent:{...event}}],
  identityMappings:[{noteId:'raw:0',normalizedNoteId:'pm:0',status:'exact',rawEvents:[{...event}]}]},
 document:{schemaVersion:1,projectId:'one',revision:0,notes:[
  {noteId:'pm:0',sourceNoteIds:['raw:0'],pitch:60,startSeconds:0,endSeconds:.5,
   hand:'right',sourceEvent:{...event}}
 ]},
 fingeringPlan:{schemaVersion:1,kind:'fingering',projectId:'one',inputRevision:0,
  assignments:[{noteId:'pm:0',hand:'right',finger:1,disposition:'played'}]}
});
test('FG-04C7 original MIDI can join real-format source-verified PianoMotion assignments',()=>{
 const a=baseline(),snapshot=structuredClone(a),result=run({midiBytes:bytes,analysis:a});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.notes.length,1);
 assert.deepEqual(result.notes[0],{midiIndex:0,track:0,channel:0,pitch:60,
  start:0,duration:.5,hand:'RH',finger:1});
 assert.equal(result.productionEligible,false);
 assert.deepEqual(a,snapshot);
 assert.deepEqual(result,run({midiBytes:bytes,analysis:a}));
});
test('FG-04C7 mismatched MIDI hash refuses completely',()=>{
 const a=baseline();a.rawBaseline.inputSha256='x'.repeat(64);
 assert.equal(run({midiBytes:bytes,analysis:a}).reason,'ORIGINAL_MIDI_SHA_MISMATCH');
});
test('FG-04C7 rejected source repair, missing provenance and normalized merged notes',()=>{
 const a=baseline();a.rawBaseline.status='repaired';
 assert.equal(run({midiBytes:bytes,analysis:a}).reason,'PIANOMOTION_RESULT_UNAVAILABLE_OR_REPAIRED');
 const b=baseline();b.rawBaseline.identityMappings[0].status='merged';
 assert.equal(run({midiBytes:bytes,analysis:b}).reason,'NONEXACT_PIANOMOTION_MAPPING');
 const c=baseline();c.document.notes[0].sourceNoteIds.push('raw:1');
 assert.equal(run({midiBytes:bytes,analysis:c}).reason,'UNVERIFIED_PIANOMOTION_DOCUMENT');
});
test('FG-04C7 refuses changed pitch, hand, note time, ordinal and disposition',()=>{
 const experiments=[
  [a=>a.document.notes[0].pitch=61,'PIANOMOTION_CHANGED_NOTE_EVENT'],
  [a=>a.document.notes[0].hand='left','UNVERIFIED_PIANOMOTION_DOCUMENT'],
  [a=>a.document.notes[0].endSeconds=.6,'PIANOMOTION_CHANGED_NOTE_EVENT'],
  [a=>a.document.notes[0].sourceEvent.noteOffOrdinal=3,'UNVERIFIED_PIANOMOTION_DOCUMENT'],
  [a=>a.fingeringPlan.assignments[0].finger=8,'INVALID_PIANOMOTION_FINGER'],
 ];
 for(const [mutate,reason] of experiments){
  const a=baseline();mutate(a);
  assert.equal(run({midiBytes:bytes,analysis:a}).reason,reason);
 }
});
test('FG-04C7 unplayable stays explicit abstention, never invented finger',()=>{
 const a=baseline();a.fingeringPlan.assignments[0].finger=null;
 a.fingeringPlan.assignments[0].disposition='unplayable';
 const result=run({midiBytes:bytes,analysis:a});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.notes[0].finger,null);
});
test('FG-04C7 missing or changed original MIDI is never silently matched',()=>{
 assert.equal(run({midiBytes:new Uint8Array(5),analysis:baseline()}).reason,'ORIGINAL_MIDI_REQUIRED');
 assert.equal(run({midiBytes:bytes,analysis:null}).reason,'PIANOMOTION_RESULT_UNAVAILABLE_OR_REPAIRED');
});

// FG-04C8 session isolates the exact original MIDI for a future browser engine.
import './original-midi-session.test.mjs';

// FG-04C9: original Python source checksum and all supported parsed-to-MIDI paths.
import './pianomotion-browser-python.test.mjs';
