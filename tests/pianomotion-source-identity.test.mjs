import test from 'node:test';
import assert from 'node:assert/strict';
import {pianoMotionSourceAlignedAssignments} from '../src/core/pianomotion-source-identity.mjs';
import {pianoMotionAlignSuggestions} from '../src/core/pianomotion-song-to-midi.mjs';

function fixture(count=3){
 const source=Array.from({length:count},(_,i)=>({
  noteId:'imported-midi/instrument-0/note-'+String(i).padStart(6,'0'),
  pitch:60+i%12,start:Number((i*.3).toFixed(8)),
  end:Number((i*.3+(i%17===0?.009:.2)).toFixed(8)),velocity:90
 }));
 const notes=source.map(s=>({noteId:s.noteId,sourceNoteIds:[s.noteId],pitch:s.pitch,
  startSeconds:s.start,endSeconds:Math.max(s.end,s.start+.05)}));
 return {rawBaseline:{status:'loaded',identityLosses:[],sourceNotes:source},
  document:{notes},fingeringPlan:{assignments:source.map(s=>({
   noteId:s.noteId,hand:'right',finger:3,disposition:'played'}))}};
}
test('PianoMotion Python expands sub-50ms notes but browser must match ORIGINAL end times',()=>{
 const result=fixture(),source=result.rawBaseline.sourceNotes;
 assert.equal(source[0].end, .009);
 assert.equal(result.document.notes[0].endSeconds,.05);
 assert.ok(result.document.notes[0].endSeconds-source[0].end >.04,
  'Previous strict 40ms end tolerance would reject the correct note');
 const verified=pianoMotionSourceAlignedAssignments(result);
 assert.equal(verified.ok,true);
 assert.equal(verified.sourceNoteMappingVerified,true);
 assert.equal(verified.suggestions[0].end,.009);
 assert.notEqual(verified.suggestions[0].end,result.document.notes[0].endSeconds);
 const song={tracks:[{notes:source.map(s=>({pitch:s.pitch,start:s.start,
  duration:s.end-s.start}))}]};
 const alignment=pianoMotionAlignSuggestions(song,verified.suggestions,{
  trackIndices:[0],tolerance:.005});
 assert.equal(alignment.ok,true,'Apply must enable after restoring unmodified raw durations');
 assert.equal(song.tracks[0].notes[0].duration,.009,'source file remains unchanged');
});
test('full 547-note guitar solo model, including short notes, aligns atomically',()=>{
 const r=fixture(547);
 const verified=pianoMotionSourceAlignedAssignments(r);
 assert.equal(verified.ok,true);
 assert.equal(verified.suggestions.length,547);
 const song={tracks:[{notes:r.rawBaseline.sourceNotes.map(n=>({
  pitch:n.pitch,start:n.start,duration:n.end-n.start}))}]};
 const check=pianoMotionAlignSuggestions(song,verified.suggestions,
  {trackIndices:[0],tolerance:.005});
 assert.equal(check.ok,true);
 assert.equal(check.matches.length,547);
});
test('altered source pitch, time, or normalization beyond 50ms is rejected',()=>{
 const pitch=fixture();pitch.document.notes[1].pitch++;
 assert.equal(pianoMotionSourceAlignedAssignments(pitch).reason,'PIANOMOTION_SOURCE_TIME_OR_PITCH_MISMATCH');
 const onset=fixture();onset.document.notes[1].startSeconds+=.06;
 assert.equal(pianoMotionSourceAlignedAssignments(onset).reason,'PIANOMOTION_SOURCE_TIME_OR_PITCH_MISMATCH');
 const end=fixture();end.document.notes[1].endSeconds+=.06;
 assert.equal(pianoMotionSourceAlignedAssignments(end).reason,'PIANOMOTION_SOURCE_TIME_OR_PITCH_MISMATCH');
});
test('missing, duplicated, merged, or ambiguous note identities are refused',()=>{
 const duplicate=fixture();duplicate.document.notes[1].sourceNoteIds=[duplicate.document.notes[0].noteId];
 assert.equal(pianoMotionSourceAlignedAssignments(duplicate).reason,'PIANOMOTION_SOURCE_TIME_OR_PITCH_MISMATCH');
 const merged=fixture();merged.document.notes[0].sourceNoteIds.push(merged.document.notes[1].noteId);
 assert.equal(pianoMotionSourceAlignedAssignments(merged).reason,'PIANOMOTION_NORMALIZED_IDENTITY_AMBIGUOUS');
 const lost=fixture();lost.rawBaseline.sourceNotes.pop();
 assert.equal(pianoMotionSourceAlignedAssignments(lost).reason,'PIANOMOTION_SOURCE_NOTE_COUNT_OR_IDENTITY');
 const lossy=fixture();lossy.rawBaseline.identityLosses=[{sourceNoteIds:['A','B']}];
 assert.equal(pianoMotionSourceAlignedAssignments(lossy).reason,'PIANOMOTION_SOURCE_NOTE_COUNT_OR_IDENTITY');
 const missingFinger=fixture();missingFinger.fingeringPlan.assignments.pop();
 assert.equal(pianoMotionSourceAlignedAssignments(missingFinger).reason,'PIANOMOTION_SOURCE_NOTE_COUNT_OR_IDENTITY');
});
test('invalid finger number and duplicate assignment never reach Apply',()=>{
 const number=fixture();number.fingeringPlan.assignments[0].finger=7;
 assert.equal(pianoMotionSourceAlignedAssignments(number).reason,'PIANOMOTION_ASSIGNMENT_INVALID');
 const repeated=fixture();repeated.fingeringPlan.assignments[1].noteId=repeated.fingeringPlan.assignments[0].noteId;
 assert.equal(pianoMotionSourceAlignedAssignments(repeated).reason,'PIANOMOTION_ASSIGNMENT_INVALID');
});
