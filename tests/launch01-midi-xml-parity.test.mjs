import test from 'node:test';
import assert from 'node:assert/strict';
import {auditScoreMidiParity} from '../src/core/launch01-midi-xml-parity.mjs';
const n=(pitch,start,duration)=>({pitch,start,duration});
test('independent MIDI and MusicXML event streams can be compared with explicit tolerance',()=>{
 const score=[n(60,0,.5),n(64,0,.5),n(60,.5,.25),n(50,1,.2)];
 const midi=[n(60,.001,.499),n(60,.502,.25),n(50,1.003,.2),n(64,0,.501)];
 const r=auditScoreMidiParity(score,midi,{toleranceSeconds:.01});
 assert.equal(r.ok,true);
 assert.equal(r.pitchHistogramEqual,true);
 assert.equal(r.comparablePairs,4);
 assert.equal(r.bothWithinTolerance,4);
 assert.equal(r.exactTimingAtTolerance,true);
 assert.equal(r.sourceIdentityProven,false,'pitch match is not a source identity mapping');
 assert.equal(r.musicalEventParityCertified,false);
});
test('identical total note count does not hide different note pitches',()=>{
 const r=auditScoreMidiParity([n(60,0,.4),n(64,0,.4)],
  [n(60,0,.4),n(65,0,.4)]);
 assert.equal(r.noteCountScore,2);assert.equal(r.noteCountMidi,2);
 assert.equal(r.pitchHistogramEqual,false);assert.equal(r.comparablePairs,0);
 assert.deepEqual(r.pitchDifferences,[
  {pitch:64,score:1,midi:0},{pitch:65,score:0,midi:1}]);
});
test('pitch histogram matches but onset shifts or shortens must be reported',()=>{
 const r=auditScoreMidiParity([n(60,0,.5),n(62,.5,.5)],
  [n(60,0,.3),n(62,.6,.4)],{toleranceSeconds:.02});
 assert.equal(r.pitchHistogramEqual,true);
 assert.equal(r.comparablePairs,2);
 assert.equal(r.exactTimingAtTolerance,false);
 assert.equal(r.releaseWithinTolerance,1);
 assert.equal(r.onsetWithinTolerance,1);
});
test('same-pitch unison coincident events are explicitly ambiguous, not identity-proof',()=>{
 const a=[n(60,0,.5),n(60,0,.75)];
 const r=auditScoreMidiParity(a,a);
 assert.equal(r.comparablePairs,2);
 assert.equal(r.bothWithinTolerance,2);
 assert.equal(r.ambiguousRepeatedPitchContacts,1);
 assert.equal(r.exactTimingAtTolerance,false);
 assert.equal(r.sourceIdentityProven,false);
});
test('invalid notes and impossible tolerance fail closed',()=>{
 assert.equal(auditScoreMidiParity([],[]).reason,'INVALID_SCORE_PAIR');
 assert.equal(auditScoreMidiParity([n(61,0,0)],[n(61,0,1)]).reason,'INVALID_NOTE_TIMING');
 assert.equal(auditScoreMidiParity([n(61,0,1)],[n(61,0,1)],
   {toleranceSeconds:1}).reason,'INVALID_SCORE_PAIR');
});
