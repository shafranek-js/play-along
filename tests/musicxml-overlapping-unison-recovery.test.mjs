import test from 'node:test';
import assert from 'node:assert/strict';
import {makePianoMotionMidiFromSong,pianoMotionAlignSuggestions} from '../src/core/pianomotion-song-to-midi.mjs';
const n=(pitch,start,duration,noteId)=>({pitch,start,duration,noteId});
test('partial MusicXML preserves original notes and skips re-strikes',()=>{
 const song={format:'MusicXML',tracks:[
  {name:'Piano',notes:[n(62,0,2,'long'),n(65,3,1,'next')]},
  {name:'Piano',notes:[n(62,1.25,.5,'repeat'),n(67,3.5,.5,'end')]}
 ]};
 const original=JSON.stringify(song);
 assert.equal(makePianoMotionMidiFromSong(song).reason,'OVERLAPPING_UNISON_REQUIRES_REVIEW');
 const partial=makePianoMotionMidiFromSong(song,{overlapPolicy:'omit-later'});
 assert.equal(partial.ok,true,JSON.stringify(partial));
 assert.equal(partial.fullNoteCount,4);
 assert.equal(partial.sourceNotes.length,3);
 assert.deepEqual(partial.omittedNotes.map(x=>x.pitch),[62]);
 assert.equal(JSON.stringify(song),original);
 const predictions=partial.sourceNotes.map(x=>({pitch:x.pitch,start:x.startSeconds,
   end:x.endSeconds,hand:'RH',finger:2}));
 assert.equal(pianoMotionAlignSuggestions(song,predictions).reason,'NOTE_COUNT_MISMATCH');
 const aligned=pianoMotionAlignSuggestions(song,predictions,
  {sourceNotes:partial.sourceNotes,tolerance:.005});
 assert.equal(aligned.ok,true,JSON.stringify(aligned));
 assert.deepEqual(aligned.matches.map(x=>x.note.noteId),['long','next','end']);
 song.tracks[0].notes[0].duration+=.1;
 assert.equal(pianoMotionAlignSuggestions(song,predictions,
  {sourceNotes:partial.sourceNotes}).reason,'SOURCE_SELECTION_CHANGED');
});
test('three independent overlaps from polyphonic score stay untouched',()=>{
 const arr=[n(62,0,4,'D-long'),n(62,2.5,1.5,'D-short'),
  n(65,10,3,'F-long'),n(65,12,1,'F-short'),
  n(69,20,3,'A-long'),n(69,22.5,.25,'A-short'),n(60,30,1,'C')];
 const song={format:'MusicXML',tracks:[{name:'Piano',notes:arr}]};
 const original=JSON.stringify(arr);
 const result=makePianoMotionMidiFromSong(song,{overlapPolicy:'omit-later'});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.fullNoteCount,7);
 assert.deepEqual(result.omittedNotes.map(x=>x.pitch),[62,65,69]);
 assert.deepEqual(result.sourceNotes.map(x=>x.pitch),[62,65,69,60]);
 assert.equal(JSON.stringify(arr),original);
});
test('same-onset duplicates still fail closed',()=>{
 const song={format:'MusicXML',tracks:[{notes:[n(60,0,2,'a'),n(60,0,1,'b'),n(64,1,1,'c')]}]};
 assert.equal(makePianoMotionMidiFromSong(song,{overlapPolicy:'omit-later'}).reason,
  'OVERLAPPING_UNISON_REQUIRES_REVIEW');
});
