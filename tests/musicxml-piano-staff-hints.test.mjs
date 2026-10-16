import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerMusicXmlPianoStaffHand} from '../src/core/finger-note-selection.mjs';

const sample={format:'MusicXML',pianoGrandStaffParts:['P1'],
 tracks:[{name:'Piano',notes:[]}]};
const note=(partId,staff)=>({noteId:'xml:'+partId+':0:0:1',partId,staff,pitch:60});
test('two-staff piano hypothesis maps notation staff only, never source finger or hand',()=>{
 const source=structuredClone(sample),a=note('P1','1'),b=note('P1','2');
 assert.equal(fingerMusicXmlPianoStaffHand(sample,a),'RH');
 assert.equal(fingerMusicXmlPianoStaffHand(sample,b),'LH');
 assert.equal(fingerMusicXmlPianoStaffHand(sample,note('P1','3')),null);
 assert.deepEqual(sample,source,'no changes to song or source notes');
 assert.ok(!Object.hasOwn(a,'hand')&&!Object.hasOwn(a,'finger'));
});
test('reject orchestral parts, MIDI, missing part provenance and invalid hands',()=>{
 assert.equal(fingerMusicXmlPianoStaffHand(sample,note('Violin','1')),null);
 assert.equal(fingerMusicXmlPianoStaffHand({...sample,pianoGrandStaffParts:[]},note('P1','1')),null);
 assert.equal(fingerMusicXmlPianoStaffHand({...sample,format:'MIDI'},note('P1','1')),null);
 assert.equal(fingerMusicXmlPianoStaffHand(sample,{...note('P1','1'),noteId:'midi:0:1'}),null);
 assert.equal(fingerMusicXmlPianoStaffHand(sample,note('P1','0')),null);
});
