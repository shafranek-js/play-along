import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeP0A2Cohort} from '../src/core/p0a2-fingering-cohort.mjs';
import {originalMidiSourceEvents} from '../src/core/pianomotion-midi-source-map.mjs';
import {importP0A2PianoMotion,evaluateP0A2Case,summarizeP0A2}
 from '../src/core/p0a2-fingering-evaluation.mjs';
import {runP0A2RealBenchmark} from '../scripts/p0a2-real-fingering-benchmark.mjs';
const parsed=()=>({sourceId:'fixture',notes:[
 {noteId:'fixture:0',pitch:60,start:0,end:.48,hand:'RH',referenceFinger:1},
 {noteId:'fixture:1',pitch:48,start:0,end:.47,hand:'LH',referenceFinger:5},
 {noteId:'fixture:2',pitch:62,start:.5,end:1.1,hand:'RH',referenceFinger:2},
 {noteId:'fixture:3',pitch:50,start:.55,end:1.2,hand:'LH',referenceFinger:4}
]});
const envelope=cohort=>{
 const observed=originalMidiSourceEvents(cohort.midiBytes);
 const raw=observed.items.map((n,i)=>({
  noteId:'raw:'+i,pitch:n.pitch,
  start:n.startTick/9600,end:n.endTick/9600,
  sourceEvent:{midiTrackIndex:n.midiTrackIndex,channel:n.channel,
   noteOnOrdinal:n.noteOnOrdinal,noteOffOrdinal:n.noteOffOrdinal}
 }));
 const rawByKey=new Map(raw.map(n=>[n.sourceEvent.midiTrackIndex+':'+
  n.sourceEvent.noteOnOrdinal,n]));
 const doc=raw.map((n,i)=>({noteId:'doc:'+i,sourceNoteIds:[n.noteId],
  pitch:n.pitch,startSeconds:n.start,endSeconds:n.end,hand:n.sourceEvent.channel===0?'right':'left'}));
 const mapping=raw.map((n,i)=>({noteId:n.noteId,normalizedNoteId:'doc:'+i,
  status:'exact',rawEvents:[{...n.sourceEvent}]}));
 return {
  rawBaseline:{status:'loaded',inputSha256:createHash('sha256').update(cohort.midiBytes).digest('hex'),
   identityLosses:[],unmappedSourceNoteIds:[],sourceNotes:raw,identityMappings:mapping},
  document:{notes:doc},
  fingeringPlan:{assignments:doc.map((d,i)=>({noteId:d.noteId,hand:d.hand,
   finger:i%5+1,disposition:'played'}))}
 };
};
test('derived source contains no PIG fingering labels and has same MIDI note timing',()=>{
 const src=parsed(),input=makeP0A2Cohort(src);
 assert.equal(input.ok,true,JSON.stringify(input));
 assert.equal(input.source.length,4);assert.equal(input.reference.length,4);
 assert.ok(input.source.every(n=>!Object.hasOwn(n,'referenceFinger')&&!Object.hasOwn(n,'finger')));
 assert.ok(input.midiBytes.length>30);
 assert.equal(input.fingersEmbeddedInMidi,false);
 assert.equal(originalMidiSourceEvents(input.midiBytes).items.length,4);
 assert.deepEqual(src,parsed(),'creating derived input may not mutate source');
 const bytes=Buffer.from(input.midiBytes).toString('latin1');
 assert.ok(!bytes.includes('R1')&&!bytes.includes('L5'));
});
test('source identity uses raw ordinals, not pitch proximity or inferred hand',()=>{
 const src=makeP0A2Cohort(parsed());
 const analysis=envelope(src);
 const out=importP0A2PianoMotion({cohort:src,midiBytes:src.midiBytes,analysis});
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(out.items.length,4);
 assert.deepEqual(new Set(out.items.map(n=>n.noteId)),new Set(src.source.map(n=>n.noteId)));
});
test('reject hash mismatch, repaired and duplicated source aliases',()=>{
 const c=makeP0A2Cohort(parsed());
 const x=envelope(c);x.rawBaseline.inputSha256='f'.repeat(64);
 assert.equal(importP0A2PianoMotion({cohort:c,midiBytes:c.midiBytes,analysis:x}).reason,'PIANOMOTION_MIDI_SHA_MISMATCH');
 const y=envelope(c);y.rawBaseline.identityLosses=[{status:'merged'}];
 assert.equal(importP0A2PianoMotion({cohort:c,midiBytes:c.midiBytes,analysis:y}).reason,'PIANOMOTION_RAW_SOURCE_INCOMPLETE');
 const z=envelope(c);z.rawBaseline.sourceNotes[0].sourceEvent.noteOnOrdinal=999;
 assert.equal(importP0A2PianoMotion({cohort:c,midiBytes:c.midiBytes,analysis:z}).reason,'RAW_EVENT_UNKNOWN_OR_DUPLICATE');
});
test('disjoint expected hands remain separate; swapped hand is scored WRONG, not rejected',()=>{
 const c=makeP0A2Cohort(parsed());
 const proposed=c.source.map((s,i)=>({...s,finger:c.reference[i].finger}));
 proposed[1].hand='RH';
 const scored=evaluateP0A2Case({source:c.source,reference:c.reference,items:proposed});
 assert.equal(scored.ok,true);
 assert.equal(scored.handCorrect,3);
 assert.equal(scored.handWrong,1);
 assert.equal(scored.jointCorrect,3);
 assert.equal(scored.jointAgreementEligiblePercent,75);
});
test('reference fingers never form anchors in source; wrong finger and abstention denominators precise',()=>{
 const c=makeP0A2Cohort(parsed());
 const actual=c.source.slice(0,3).map((s,i)=>({...s,finger:c.reference[i].finger}));
 actual[0].finger=3;
 actual[2].finger=null;
 const scored=evaluateP0A2Case({source:c.source,reference:c.reference,items:actual});
 assert.equal(scored.eligible,4);
 assert.equal(scored.proposed,2);assert.equal(scored.abstained,2);
 assert.equal(scored.jointCorrect,1);
 assert.equal(scored.jointWrong,1);
 assert.equal(scored.coveragePercent,50);
 assert.equal(scored.jointAgreementEligiblePercent,25);
 assert.equal(scored.jointAgreementProposedPercent,50);
});
test('unavailable engine cannot be mistaken for 100% accuracy',()=>{
 const c=makeP0A2Cohort(parsed());
 const report=evaluateP0A2Case({source:c.source,reference:c.reference,
  items:null,engineStatus:'PYTHON_MISSING'});
 assert.equal(report.status,'not-run');assert.equal(report.proposed,0);
 assert.equal(report.abstained,4);assert.equal(report.jointAgreementProposedPercent,null);
 const total=summarizeP0A2([{playAlong:report,pianoMotion:report}]);
 assert.equal(total.ok,true);assert.equal(total.pianoMotion.casesNotRun,1);
 assert.equal(total.pianoMotion.coveragePercent,0);
});
test('physical collisions remain independent from agreement with published finger labels',()=>{
 const c=makeP0A2Cohort(parsed());
 const chosen=c.source.map((s,i)=>({...s,finger:i%2===0?2:3}));
 // Note 0 and 2 overlap? No: hand RH note0 releases at .48, note2 starts .5.
 chosen[1].finger=2;
 const r=evaluateP0A2Case({source:c.source,reference:c.reference,items:chosen});
 assert.equal(r.ok,true);
 assert.equal(r.physicalBlocked,0);
});
test('unknown or duplicate IDs, leaked reference fields are rejected',()=>{
 const c=makeP0A2Cohort(parsed());
 assert.equal(evaluateP0A2Case({source:c.source,reference:c.reference,
  items:[{...c.source[0],noteId:'unrecognized',finger:1}]}).reason,'FOREIGN_OR_CHANGED_SOURCE_NOTE');
 const leaked=c.source.map(n=>({...n}));leaked[0].authorFinger=1;
 assert.equal(evaluateP0A2Case({source:leaked,reference:c.reference}).reason,'INVALID_BLINDED_SOURCE');
 const repeated=c.reference.map(x=>({...x}));repeated[1].noteId=repeated[0].noteId;
 assert.equal(evaluateP0A2Case({source:c.source,reference:repeated}).reason,'INVALID_OR_LEAKED_REFERENCE');
});
test('same hand same key overlapping notes cannot be silently serialized',()=>{
 const p=parsed();p.notes[2].pitch=60;p.notes[2].start=.2;p.notes[2].end=.7;
 assert.equal(makeP0A2Cohort(p).reason,'MIDI_EVENT_SAME_KEY_OVERLAP_AMBIGUOUS');
});
test('CLI research runner rejects nonexistent source before any external download',async()=>{
 const r=await runP0A2RealBenchmark({caseIds:['fictional-piece']});
 assert.equal(r.reason,'UNKNOWN_OR_DUPLICATE_CASE');
 const b=await runP0A2RealBenchmark({repeat:0});
 assert.equal(b.reason,'INVALID_REPEAT_COUNT');
});
