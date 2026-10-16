import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerMusicXmlPianoStaffHand,fingerMusicXmlCrossStaffVoiceNotes} from '../src/core/finger-note-selection.mjs';

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

const scored=(partIndex,measure,ordinal,staff,voice,partId='P1')=>({
 noteId:'xml:'+encodeURIComponent(partId)+':'+partIndex+':'+measure+':'+ordinal,
 partId,staff,voice,pitch:60,start:measure, duration:.5
});
test('cross-staff voice only disables unverified staff-hand guesses in that measure',()=>{
 const notes=[
  scored(0,0,1,'1','1'),scored(0,0,2,'2','1'),
  scored(0,0,3,'2','2'),scored(0,1,4,'1','1'),
  scored(0,1,5,'2','2'),scored(1,0,1,'1','1','Violin')
 ];
 const song={...sample,tracks:[{notes}]},copy=structuredClone(song);
 assert.deepEqual([...fingerMusicXmlCrossStaffVoiceNotes(song)].sort(),
  [notes[0].noteId,notes[1].noteId].sort());
 assert.deepEqual(song,copy,'no changes to playback or source fingering');
 // Identity distinguishes a same-name part declared twice in XML.
 assert.equal(fingerMusicXmlCrossStaffVoiceNotes({...sample,tracks:[{notes:[
  scored(0,0,1,'1','1'),scored(1,0,2,'2','1')]}]}).size,0);
});
test('reject uncertain provenance and unrelated music without any guesses',()=>{
 const cross=[scored(0,0,1,'1','1'),scored(0,0,2,'2','1')];
 assert.equal(fingerMusicXmlCrossStaffVoiceNotes({...sample,format:'MIDI',tracks:[{notes:cross}]}).size,0);
 assert.equal(fingerMusicXmlCrossStaffVoiceNotes({...sample,tracks:[{notes:cross.map(n=>({...n,partId:'Organ'}))}]}).size,0);
 assert.equal(fingerMusicXmlCrossStaffVoiceNotes({...sample,tracks:[{notes:[
  {...cross[0],noteId:'xml:unknown:0:0:1'},cross[1]]}]}).size,0);
});
