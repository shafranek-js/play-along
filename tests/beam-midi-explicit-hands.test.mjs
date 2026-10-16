import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserFingeringResearch} from '../src/core/browser-fingering-research.mjs';
import {fingerMidiExplicitTrackHand} from '../src/core/finger-note-selection.mjs';

const n=(i,pitch,hand)=>({noteId:'midi:0:'+i,pitch,start:(i-1)*.5,duration:.4,hand});
test('Beam Search accepts exact MIDI source note IDs with explicitly verified hands only',()=>{
 const input=[n(1,60,'RH'),n(2,64,'LH'),n(3,62,'RH'),n(4,65,'LH')];
 const baseline=structuredClone(input);
 const result=compareBrowserFingeringResearch({notes:input});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.noteCount,4);
 assert.equal(result.models.legacy.status,'computed',JSON.stringify(result));
 assert.equal(result.models.anatomical.status,'computed',JSON.stringify(result));
 assert.equal(result.models.anatomical.candidates.length,4);
 assert.ok(result.models.anatomical.candidates.every(c=>
  /^midi:0:[1-4]$/.test(c.noteId)&&c.finger>=1&&c.finger<=5));
 assert.deepEqual(input,baseline,'Beam proposals do not modify MIDI event objects');
});
test('Hand abstention, duplicate source identity and noncanonical MIDI key are rejected',()=>{
 const a=n(1,60,'RH'),b=n(2,65,'LH');
 assert.equal(compareBrowserFingeringResearch({notes:[a,{...b,hand:null}]}).reason,
  'HAND_NOT_SOURCE_VERIFIED');
 assert.equal(compareBrowserFingeringResearch({notes:[a,{...b,noteId:a.noteId}]}).reason,
  'SOURCE_ID_REQUIRED_OR_DUPLICATE');
 assert.equal(compareBrowserFingeringResearch({notes:[{...a,noteId:'midi:path:1'}]}).reason,
  'SOURCE_ID_REQUIRED_OR_DUPLICATE');
 assert.equal(compareBrowserFingeringResearch({notes:[{...a,hand:'RH',start:Infinity}]}).reason,
  'INVALID_SCORE_EVENT');
});
test('Only literal MIDI hand track labels are accepted; instrument/pitch never determine hand',()=>{
 for(const label of ['RH','Right Hand','Right-Hand','Piano RH','right piano'])
  assert.equal(fingerMidiExplicitTrackHand({name:label}),'RH');
 for(const label of ['LH','Left Hand','Piano LH','left-piano'])
  assert.equal(fingerMidiExplicitTrackHand({name:label}),'LH');
 for(const label of ['Piano','Treble','Bass','Guitar RH solo','Piano right arrangement',''])
  assert.equal(fingerMidiExplicitTrackHand({name:label}),null);
});
