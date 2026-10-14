import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {serializeSongForPianoMotion,midiNoteSignature}
 from '../src/core/song-to-pianomotion-midi.mjs';
import {inspectFingeredMidi} from '../src/core/handthesia-midi-alignment.mjs';
import {verifyPianoMotionBrowserAnalysis}
 from '../src/core/browser-pianomotion-analysis.mjs';

const song=()=>({format:'MusicXML',tracks:[{notes:[
 {noteId:'xml:c',pitch:60,start:0,duration:.5,hand:'RH',velocity:90},
 {noteId:'xml:e',pitch:64,start:0,duration:.5,hand:'RH',velocity:88}
]}]});
const sourceEvent=(on,off)=>({midiTrackIndex:0,channel:0,
 noteOnOrdinal:on,noteOffOrdinal:off});
const envelope=(bytes)=>{
 const midi=inspectFingeredMidi(bytes);
 const byPitch=new Map(midi.notes.map((n,i)=>[n.pitch,{n,i}]));
 const events=[60,64].map((pitch,i)=>{
  const found=byPitch.get(pitch);
  return {id:'pm:'+pitch,rawId:'raw:'+pitch,pitch,
   start:0,end:.5,event:sourceEvent(i,i+2)};
 });
 return {rawBaseline:{status:'loaded',
  inputSha256:createHash('sha256').update(bytes).digest('hex'),
  sourceNotes:events.map(e=>({noteId:e.rawId,pitch:e.pitch,start:e.start,end:e.end,sourceEvent:e.event})),
  identityMappings:events.map(e=>({noteId:e.rawId,normalizedNoteId:e.id,status:'exact',rawEvents:[e.event]})),
  identityLosses:[],unmappedSourceNoteIds:[]},
  document:{schemaVersion:1,projectId:'score',revision:0,
   notes:events.map(e=>({noteId:e.id,sourceNoteIds:[e.rawId],pitch:e.pitch,
    startSeconds:e.start,endSeconds:e.end,hand:'right',sourceEvent:e.event}))},
  fingeringPlan:{kind:'fingering',schemaVersion:1,projectId:'score',inputRevision:0,
   assignments:events.map((e,i)=>({noteId:e.id,hand:'right',finger:i===0?1:3,disposition:'played'}))}};
};
test('FG-04C9 generates a 60 BPM analysis-only SMF for original MusicXML with identity map',()=>{
 const score=song(),snapshot=structuredClone(score);
 const out=serializeSongForPianoMotion(score);
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(out.midiBytes[0],77);
 const midi=inspectFingeredMidi(out.midiBytes);
 assert.equal(midi.notes.length,2);
 assert.equal(midi.division,1000);
 assert.deepEqual(midi.notes.map(n=>n.pitch).sort(),[60,64]);
 assert.deepEqual(Object.values(out.bySignature).sort(),['xml:c','xml:e']);
 assert.deepEqual(score,snapshot);
 assert.equal(out.analysisOnly,true);
});
test('FG-04C9 accepts genuine-schema Python result with original note ID matching',async()=>{
 const original=song(),generated=serializeSongForPianoMotion(original);
 const report=await verifyPianoMotionBrowserAnalysis({
  midiBytes:generated.midiBytes,analysis:envelope(generated.midiBytes),
  sourceSong:original,sourceIndex:generated.bySignature
 });
 assert.equal(report.ok,true,JSON.stringify(report));
 assert.deepEqual(report.candidates.map(n=>n.noteId),['xml:c','xml:e']);
 assert.deepEqual(report.candidates.map(n=>n.finger),[1,3]);
 assert.equal(report.sourceMappingVerified,true);
 assert.equal(report.productionEligible,false);
 assert.deepEqual(original,song());
});
test('FG-04C9 copied source cannot gain candidate from altered original MIDI',async()=>{
 const score=song(),midi=serializeSongForPianoMotion(score).midiBytes,
  p=envelope(midi),bad=midi.slice();
 bad[bad.length-7]=bad[bad.length-7]===60?61:60;
 const result=await verifyPianoMotionBrowserAnalysis({midiBytes:bad,analysis:p,sourceSong:score});
 assert.equal(result.ok,false);
 assert.match(result.reason,/ORIGINAL_MIDI_SHA_MISMATCH|MIDI_PARSE_/);
});
test('FG-04C9 rejects mismatched PianoMotion physical-key time and author hand',async()=>{
 const score=song(),result=serializeSongForPianoMotion(score);
 const p=envelope(result.midiBytes);
 p.document.notes[0].endSeconds=.6;
 const bad=await verifyPianoMotionBrowserAnalysis({midiBytes:result.midiBytes,
  analysis:p,sourceSong:score,sourceIndex:result.bySignature});
 assert.equal(bad.reason,'PIANOMOTION_CHANGED_ORIGINAL_NOTE');
 const q=envelope(result.midiBytes);
 q.fingeringPlan.assignments[0].hand='left';q.document.notes[0].hand='left';
 const hand=await verifyPianoMotionBrowserAnalysis({midiBytes:result.midiBytes,
  analysis:q,sourceSong:score,sourceIndex:result.bySignature});
 assert.equal(hand.reason,'SOURCE_HAND_CONFLICT');
});
test('FG-04C9 fails safely for unsupported score overlap, track count and identity',()=>{
 const s=song();s.tracks[0].notes[1].pitch=60;
 assert.equal(serializeSongForPianoMotion(s).reason,'OVERLAPPING_SAME_CHANNEL_SOURCE');
 const many={tracks:Array.from({length:16},(_,i)=>({notes:[{
  noteId:'n'+i,pitch:60,start:i,duration:.5
 }]}))};
 assert.equal(serializeSongForPianoMotion(many).reason,'TOO_MANY_INSTRUMENT_TRACKS');
 const duplicate=song();duplicate.tracks[0].notes[1].noteId='xml:c';
 assert.equal(serializeSongForPianoMotion(duplicate).reason,'DUPLICATE_SOURCE_NOTE_ID');
});
test('FG-04C9 pure-piano MIDI with no xml note IDs still maps to selected notes',async()=>{
 const score=song();score.format='MIDI';
 for(const n of score.tracks[0].notes)delete n.noteId;
 const generated=serializeSongForPianoMotion(score),p=envelope(generated.midiBytes);
 const report=await verifyPianoMotionBrowserAnalysis({
  midiBytes:generated.midiBytes,analysis:p,sourceSong:score});
 assert.equal(report.ok,true,JSON.stringify(report));
 assert.deepEqual(report.candidates.map(n=>n.noteId),['midi:0:0','midi:0:1']);
});
