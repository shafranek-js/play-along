import test from 'node:test';
import assert from 'node:assert/strict';
import {p0a2bCandidateFromSong}from '../src/core/p0a2b-source-intake.mjs';
import {makeP0A2bBlindPacket}from '../src/core/p0a2b-independent-review.mjs';
const hash='d'.repeat(64),settings={cohortId:'test-work',groupId:'test-composer',
 split:'development',scoreSha256:hash,rightsConfirmed:true};
function fixture(){
 const notes=[
 {noteId:'xml:P1:0:0:1',pitch:60,start:0,duration:.5,sourceNoteIds:['xml:P1:0:0:1']},
 {noteId:'xml:P1:0:0:2',pitch:64,start:0,duration:.5,sourceNoteIds:['xml:P1:0:0:2']},
 {noteId:'xml:P1:0:0:3',pitch:60,start:.5,duration:.5,sourceNoteIds:['xml:P1:0:0:3']},
 {noteId:'xml:P2:1:0:1',pitch:48,start:0,duration:1,sourceNoteIds:['xml:P2:1:0:1']}
 ];
 const audioEvents=notes.flatMap(n=>[
  {type:'noteOn',time:n.start,noteId:n.noteId,pitch:n.pitch},
  {type:'noteOff',time:n.start+n.duration,noteId:n.noteId,pitch:n.pitch}]);
 return {format:'MusicXML',warnings:[],tracks:[{notes:notes.slice(0,3)},
  {notes:notes.slice(3)}],audioEvents};
}
test('real note/source event identities yield fingerless blind-hand candidate',()=>{
 const s=fixture();s.tracks[0].notes[0].finger=3;
 s.tracks[0].notes[0].fingeringSource='musicxml';
 const before=structuredClone(s),result=p0a2bCandidateFromSong(s,settings);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.source.handMode,'blind-hands');
 assert.ok(result.source.notes.every(n=>!('finger'in n)&&!('hand'in n)&&
  !('referenceFinger'in n)));
 assert.deepEqual(before,s,'source score and author fingers never changed');
 assert.equal(result.summary.notes,4);
 assert.ok(result.summary.chordNotes>=2);
 assert.ok(result.summary.heldVoiceNotes>=1);
 assert.equal(result.summary.repeatedNoteCandidates,1);
 assert.ok(result.source.notes.find(n=>n.noteId==='xml:P1:0:0:3').tags.includes('repeated-note'));
 const packet=makeP0A2bBlindPacket(result.source);
 assert.equal(packet.ok,true,JSON.stringify(packet));
});
test('same-time accompaniment is co-onset, not a pianist-verified inversion',()=>{
 const c=p0a2bCandidateFromSong(fixture(),settings);
 assert.equal(c.ok,true);
 assert.equal(c.summary.techniqueTagsHumanReviewed,false);
 assert.ok(c.source.notes.every(n=>!n.tags.includes('inversion')&&
  !n.tags.includes('thumb-under')));
});
test('unverified rights, unsafe parser gaps, and drum events refuse',()=>{
 assert.equal(p0a2bCandidateFromSong(fixture(),{...settings,rightsConfirmed:false}).reason,
  'SOURCE_OR_RIGHTS_NOT_CONFIRMED');
 const x=fixture();x.warnings=['Форшлаги/украшения пропущены.'];
 assert.equal(p0a2bCandidateFromSong(x,settings).reason,'SCORE_IMPORT_IS_LOSSY');
 const drum=fixture();drum.tracks[0].notes[0].isDrum=true;
 assert.equal(p0a2bCandidateFromSong(drum,settings).reason,'MISSING_OR_CHANGED_SOURCE_NOTE');
});
test('not a source-bound score if any event is altered or truncated',()=>{
 const a=fixture();a.audioEvents[0].time=.08;
 assert.equal(p0a2bCandidateFromSong(a,settings).reason,'SOURCE_PHYSICAL_KEY_TIMING_MISMATCH');
 const b=fixture();b.audioEvents.pop();
 assert.equal(p0a2bCandidateFromSong(b,settings).reason,'SOURCE_KEY_EVENT_COUNT_MISMATCH');
 const c=fixture();c.tracks[0].notes[1].noteId=c.tracks[0].notes[0].noteId;
 assert.equal(p0a2bCandidateFromSong(c,settings).reason,'MISSING_OR_CHANGED_SOURCE_NOTE');
});
test('source notes with tied segments preserve physical note identity only',()=>{
 const s=fixture();s.tracks[0].notes[0].sourceNoteIds.push('xml:P1:0:1:12');
 const r=p0a2bCandidateFromSong(s,settings);
 assert.equal(r.ok,true);
 assert.equal(r.summary.tiedSourceNotes,1);
});
