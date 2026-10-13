import test from 'node:test';
import assert from 'node:assert/strict';
import {auditImportedHandMotion as audit,motionEvidenceGeometry} from '../src/core/real-hand-motion-evidence.mjs';

const N=(i,pitch,start,duration=.06,{finger,hand,source='musicxml',ids}={})=>({
 noteId:'xml:P1:0:'+i+':'+(i+1),sourceNoteIds:ids||['xml:P1:0:'+i+':'+(i+1)],
 pitch,start,duration,staff:'1',voice:'1',partId:'P1',
 ...(finger!=null?{finger,hand,fingeringSource:source}:{})
});
const A=(finger,hand='RH')=>({finger,hand});
const song=(notes,xml='<score-partwise version="4.0"/>')=>({
 format:'MusicXML',notationXML:xml,
 tracks:[{notes}],
 audioEvents:notes.flatMap(n=>[
 {type:'noteOn',time:n.start,noteId:n.noteId,pitch:n.pitch,velocity:85,channel:0},
 {type:'noteOff',time:n.start+n.duration,noteId:n.noteId,pitch:n.pitch,channel:0}
 ])
});
test('D2: exactly annotated source chord-free motion is a heuristic, not measured accuracy',()=>{
 const notes=[N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))];
 const s=song(notes),copy=structuredClone(s);
 const x=audit(s);
 assert.equal(x.status,'HEURISTIC_SCREENING_ONLY');
 assert.equal(x.totalNotes,2);
 assert.equal(x.authorizedAuthorPairs,2);
 assert.equal(x.onsetGroups,2);
 assert.equal(x.fullyAuthorizedGroups,2);
 assert.equal(x.attemptedHandTransitions,1);
 assert.equal(x.decisions.moving,1,JSON.stringify(x));
 assert.equal(x.pianistJudgedAccuracy,null);
 assert.equal(x.labeledGroundTruthAccuracy,null);
 assert.equal(x.productionEligible,false);
 assert.equal(x.expertValidated,false);
 assert.deepEqual(s,copy);
 assert.ok(!JSON.stringify(x).includes('xml:P1:'),
  'Never publish raw source note IDs in aggregate report');
});
test('D2: original notes lacking finger+hand never receive fabricated motion',()=>{
 const x=audit(song([N(0,60,0),N(1,64,.8)]));
 assert.equal(x.status,'NO_AUTHORED_FINGER_AND_HAND_PAIRS');
 assert.equal(x.authorizedAuthorPairs,0);
 assert.equal(x.attemptedHandTransitions,0);
 assert.equal(x.decisions.moving,0);
 assert.equal(x.ineligibility['incomplete-author-finger-or-hand'],1);
});
test('D2: user-exported numeric MusicXML explicitly refuses independent author source',()=>{
 const src=song([N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))],
 '<score-partwise><miscellaneous-field name="play-along-user-fingering"/></score-partwise>');
 assert.equal(audit(src).reason,'NO_UNMODIFIED_ORIGINAL_MUSICXML');
 const apparent=song([N(0,60,0,.06,{...A(1),source:'musicxml-user-export-unverified'}),
  N(1,64,.8,.06,{...A(3),source:'musicxml-user-export-unverified'})]);
 assert.equal(audit(apparent).authorizedAuthorPairs,0);
});
test('D2: unknown source note in a target chord blocks full-pose assessment',()=>{
 const s=song([N(0,60,0,.06,A(1)),
  N(1,64,.8,.06,A(3)),N(2,67,.8)]);
 const r=audit(s);
 assert.equal(r.authorizedAuthorPairs,2);
 assert.equal(r.fullyAuthorizedGroups,1);
 assert.equal(r.attemptedHandTransitions,0);
});
test('D2: incomplete preceding group cannot be filtered to fictitious clear origin',()=>{
 const s=song([N(0,60,0,.06,A(1)),N(1,48,0),
  N(2,64,.8,.06,A(3))]);
 assert.equal(audit(s).decisions.moving,0);
});
test('D2: physically overlapping same key with two original IDs refuses entire audit',()=>{
 const s=song([N(0,60,0,1,A(1)),N(1,60,.3,.06,A(2))]);
 assert.equal(audit(s).reason,'OVERLAPPING_IDENTICAL_PHYSICAL_KEY');
});
test('D2: two differently encoded onsets rounding to same millisecond fail closed',()=>{
 const s=song([N(0,60,0,.06,A(1)),N(1,64,.8001,.06,A(3)),N(2,69,.8002,.06,A(5))]);
 assert.equal(audit(s).reason,'SUBMILLISECOND_GROUP_AMBIGUITY');
});
test('D2: missing, repeated or tampered note-on/off source IDs and times fail closed',()=>{
 const notes=[N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))];
 const a=song(notes);a.audioEvents[0].time=.2;
 assert.equal(audit(a).reason,'SOURCE_AUDIO_TIMELINE_MISMATCH');
 const b=song(notes);b.audioEvents[0].noteId='xml:P1:999:0:1';
 assert.equal(audit(b).reason,'UNVERIFIED_SOURCE_AUDIO_EVENTS');
 const c=song(notes);c.audioEvents.push({...c.audioEvents[0]});
 assert.equal(audit(c).reason,'DUPLICATE_SOURCE_AUDIO_EVENTS');
 const d=song(notes);d.audioEvents.pop();
 assert.equal(audit(d).reason,'SOURCE_AUDIO_TIMELINE_MISMATCH');
});
test('D2: duplicate source notes, duplicate tie segments and changed leader refuse',()=>{
 const notes=[N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))];
 assert.equal(audit(song([notes[0],{...notes[1],noteId:notes[0].noteId}])).reason,
 'NONCANONICAL_OR_AMBIGUOUS_SOURCE_NOTE');
 const dup=[...notes];dup[1]={...dup[1],sourceNoteIds:[dup[1].noteId,dup[0].noteId]};
 assert.equal(audit(song(dup)).reason,'NONCANONICAL_OR_AMBIGUOUS_SOURCE_NOTE');
});
test('D2: expanded repeats and non-original source never become research evidence',()=>{
 const x=song([N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))]);
 assert.equal(audit({...x,originalNotationXML:'<original>'}).reason,'NO_UNMODIFIED_ORIGINAL_MUSICXML');
 assert.equal(audit({...x,format:'MIDI'}).reason,'NO_UNMODIFIED_ORIGINAL_MUSICXML');
});
test('D2: physically infeasible leap is marked rather than declared correct',()=>{
 const x=audit(song([N(0,36,0,.06,A(1)),N(1,88,.8,.06,A(5))]));
 assert.equal(x.decisions.moving,0);
 assert.equal(x.decisions.markers,1);
 assert.equal(x.reasons['movement-infeasible'],1);
});
test('D2: 5+5 chord uncertainty and hand crossing never claims biomechanical correctness',()=>{
 const data=[N(0,40,0,.06,A(1,'LH')),N(1,70,0,.06,A(2,'RH')),
  N(2,72,.8,.06,A(3,'LH')),N(3,42,.8,.06,A(4,'RH'))];
 const r=audit(song(data));
 assert.equal(r.attemptedHandTransitions,2);
 assert.equal(r.decisions.moving,0);
 assert.equal(r.reasons['crossing-or-crowding'],2);
});
test('D2: full source no handwritten fingering remains an honest no-evidence result',()=>{
 const s=song([N(0,48,0),N(1,64,.8),N(2,66,1.2)]);
 const r=audit(s);
 assert.equal(r.status,'NO_AUTHORED_FINGER_AND_HAND_PAIRS');
 assert.equal(r.pianistJudgedAccuracy,null);
 assert.equal(r.decisions.moving,0);
});
test('D2: fixed geometry exact cents, audio integrity and rejection are deterministic',()=>{
 const g=motionEvidenceGeometry();
 assert.equal(g.byPitch.size,88);
 assert.equal(g.byPitch.get(21).center-g.byPitch.get(21).x,g.byPitch.get(21).w/2);
 assert.throws(()=>motionEvidenceGeometry(108,21),/INVALID_EVIDENCE_GEOMETRY/);
 const s=song([N(0,60,0,.06,A(1)),N(1,64,.8,.06,A(3))]);
 assert.deepEqual(audit(s),audit(s));
});
