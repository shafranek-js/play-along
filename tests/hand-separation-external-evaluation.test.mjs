import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateExternalHandIslands as evaluate} from '../src/core/hand-separation-external-evaluation.mjs';
import {disqualifyAmbiguousExternalGT,runRealHandSeparationBenchmark}
 from '../scripts/hand-separation-real-gt-benchmark.mjs';
import {closedPolyphonicIslands} from '../scripts/fingering-independent-polyphony-benchmark.mjs';

const N=(id,pitch,start,hand,extra={})=>({
 id,pitch,start,duration:.2,end:start+.2,annotated:true,hand,finger:3,...extra
});
const duet=()=>[N(0,48,0,'LH'),N(1,72,0,'RH'),
 N(2,50,.3,'LH'),N(3,74,.3,'RH')];
const flat=result=>result.protocols;
test('R1: ground-truth-free evaluation refuses to guess both hands in an unanchored duet',()=>{
 const island=duet(),snapshot=structuredClone(island),r=evaluate([island]);
 assert.equal(flat(r).unanchored.anchors,0);
 assert.equal(flat(r).unanchored.heldout,4);
 assert.equal(flat(r).unanchored.proposed,0);
 assert.equal(flat(r).unanchored.abstained,4);
 assert.equal(flat(r).unanchored.coveragePct,0);
 assert.equal(flat(r).unanchored.accuracyAmongProposedPct,null);
 assert.equal(r.independentlyVerifiedFingerAccuracy,null);
 assert.equal(r.physicalMotionAccuracy,null);
 assert.equal(r.productionEligible,false);
 assert.deepEqual(island,snapshot,'No source GT or timing mutation');
});
test('R1: only first GT hand of each hand is exposed, remaining 2 notes held out',()=>{
 const r=evaluate([duet()]).protocols.oracleSeeded;
 assert.equal(r.sourceNotes,4);
 assert.equal(r.anchors,2);
 assert.equal(r.heldout,2);
 assert.equal(r.heldout,r.proposed+r.abstained);
 assert.equal(r.correct+r.incorrect,r.proposed);
 assert.equal(r.anchorViolations,0);
 assert.equal(r.productionEligible,undefined);
});
test('R1: oracle-assisted source anchor cannot inflate denominator with known labels',()=>{
 const onlyTwo=[N(0,48,0,'LH'),N(1,72,0,'RH')];
 const r=evaluate([onlyTwo]).protocols.oracleSeeded;
 assert.equal(r.anchors,2);
 assert.equal(r.heldout,0);
 assert.equal(r.proposed,0);
 assert.equal(r.accuracyAmongProposedPct,null);
 assert.equal(r.correctAmongAllHeldoutPct,null);
});
test('R1: swapping withheld GT labels does not change any candidate hand proposals',()=>{
 const a=duet(),b=structuredClone(a);
 b[2].hand='RH';b[3].hand='LH';
 const x=evaluate([a]),y=evaluate([b]);
 assert.equal(x.protocols.unanchored.proposed,y.protocols.unanchored.proposed);
 assert.equal(x.protocols.unanchored.abstained,y.protocols.unanchored.abstained);
 assert.equal(x.protocols.oracleSeeded.anchors,y.protocols.oracleSeeded.anchors);
 // The solver sees the SAME first-two oracle anchors and same original notes.
 assert.equal(x.protocols.oracleSeeded.proposed,y.protocols.oracleSeeded.proposed);
 assert.equal(x.protocols.oracleSeeded.abstained,y.protocols.oracleSeeded.abstained);
});
test('R1: no unsupported finger, hand code or duplicate note may enter an island',()=>{
 for(const bad of [
  [N(0,60,0,'XX')],
  [N(0,60,0,'RH',{finger:0})],
  [N(0,60,0,'RH',{finger:null})],
  [N(0,60,0,'RH',{annotated:false})],
  [N(0,60,0,'RH'),N(0,64,.3,'RH')],
  [N(0,60,0,'RH',{start:NaN})]
 ]){
  assert.throws(()=>evaluate([bad]),/UNVERIFIED_EXTERNAL_HAND_LABEL/);
 }
});
test('R1: caller extra untrusted hand hints and finger GT cannot reach held-out candidate inputs',()=>{
 const a=duet();
 const ordinary=evaluate([a]);
 const poisoned=duet().map((n,i)=>({
  ...n,authorHand:'LH',userHand:'LH',hand:'LH',finger:i===0?1:5,
  originalFinger:1,annotationAuthor:'source-misleading',fixed:true
 }));
 // Source GT hand on all notes is changed, but held-out candidate labels
 // are kept entirely out of solver. Finger and arbitrary metadata ignored.
 const changed=evaluate([poisoned]);
 assert.equal(changed.protocols.unanchored.proposed,ordinary.protocols.unanchored.proposed);
 assert.equal(changed.protocols.unanchored.abstained,ordinary.protocols.unanchored.abstained);
});
test('R1: deterministic aggregate hides every raw performer pitch, time and source id',()=>{
 const a=evaluate([duet(),[N(20,60,0,'RH'),N(21,64,0,'RH')]]);
 assert.deepEqual(a,evaluate([duet(),[N(20,60,0,'RH'),N(21,64,0,'RH')]]));
 assert.equal(JSON.stringify(a).includes('eval-'),false);
 assert.equal(JSON.stringify(a).includes('pitch'),false);
 assert.equal(JSON.stringify(a).includes('finger:'),false);
 assert.equal(a.protocols.unanchored.heldout,6);
 assert.equal(a.protocols.oracleSeeded.heldout,3);
});
test('R1: exact five-field duplicate note events erase all GT labels for their source identities',()=>{
 const src=[
 {onset:'0',key_offset:'.4',frame_offset:'.4',note:'60',velocity:'80'},
 {onset:'0',key_offset:'.4',frame_offset:'.4',note:'60',velocity:'80'},
 {onset:'1',key_offset:'1.4',frame_offset:'1.4',note:'64',velocity:'80'}
 ];
 const bound=[
 {id:0,pitch:60,start:0,duration:.4,end:.4,annotated:true,hand:'LH',finger:1},
 {id:1,pitch:60,start:0,duration:.4,end:.4,annotated:true,hand:'RH',finger:3},
 {id:2,pitch:64,start:1,duration:.4,end:1.4,annotated:true,hand:'RH',finger:5}
 ];
 const before=structuredClone(bound);
 const masked=disqualifyAmbiguousExternalGT(src,bound);
 assert.equal(masked.ambiguousEventGroups,1);
 assert.equal(masked.ambiguousGTRowsMasked,2);
 assert.equal(masked.notes[0].annotated,false);
 assert.equal(masked.notes[1].annotated,false);
 assert.equal(masked.notes[2].annotated,true);
 assert.equal(masked.notes[0].hand,undefined);
 assert.equal(masked.notes[1].finger,undefined);
 assert.deepEqual(bound,before);
 const closed=closedPolyphonicIslands(masked.notes);
 assert.equal(closed.eligible.length,0);
});
test('R1: duplicate source metadata rows cannot be relabeled via shortened or shifted lists',()=>{
 const src=[{onset:'0',key_offset:'.4',frame_offset:'.4',note:'60',velocity:'80'}];
 assert.throws(()=>disqualifyAmbiguousExternalGT(src,[]),/HAND_GT_SOURCE_COUNT_MISMATCH/);
});
test('R1: fully sourced same-hand overlapping chord with one anchor keeps the other held out',()=>{
 const chord=[N(0,60,0,'RH',{finger:1}),N(1,64,0,'RH',{finger:3})];
 const r=evaluate([chord]);
 assert.equal(r.protocols.unanchored.heldout,2);
 assert.equal(r.protocols.unanchored.proposed,0);
 assert.equal(r.protocols.oracleSeeded.anchors,1);
 assert.equal(r.protocols.oracleSeeded.heldout,1);
});
test('R1: fixed human hand markers must not get misreported as discovered hand predictions',()=>{
 const r=evaluate([duet()]).protocols.oracleSeeded;
 assert.equal(r.heldout+r.anchors,r.sourceNotes);
 assert.equal(r.proposed+r.abstained+r.anchors,r.sourceNotes);
 assert.equal(r.correct+r.incorrect,r.proposed);
});
const TSV='onset\tkey_offset\tframe_offset\tnote\tvelocity\n'+
 '0\t0.9\t0.9\t48\t75\n0\t0.9\t0.9\t72\t75\n'+
 '0.5\t0.9\t0.9\t50\t80\n0.5\t0.9\t0.9\t74\t80\n';
const GT='onset\tkey_offset\tframe_offset\tnote\tvelocity\thand\tfinger\n'+
 '0\t0.9\t0.9\t48\t75\tL\t5\n0\t0.9\t0.9\t72\t75\tR\t1\n'+
 '0.5\t0.9\t0.9\t50\t80\tL\t4\n0.5\t0.9\t0.9\t74\t80\tR\t2\n';
const fetchMock=async(url)=>{
 const isGT=url.includes('/Fingering_GT/');
 return {ok:true,text:async()=>isGT?GT:TSV};
};
test('R1: all 11 pinned recordings are evaluated without putting performer event data in JSON',async()=>{
 const r=await runRealHandSeparationBenchmark({fetcher:fetchMock});
 assert.equal(r.source,'PianoVAM/PianoVAM_v1');
 assert.match(r.revision,/^[0-9a-f]{40}$/);
 assert.equal(r.totals.recordings,11);
 assert.equal(r.totals.sourceNotes,44);
 assert.equal(r.totals.externalGTNotes,44);
 assert.equal(r.totals.GTAlignedToSource,44);
 assert.equal(r.totals.closedPolyphonyNotes,44);
 assert.equal(r.totals.protocols.unanchored.heldout,44);
 assert.equal(r.totals.protocols.oracleSeeded.anchors,22);
 assert.equal(r.totals.protocols.oracleSeeded.heldout,22);
 assert.equal(r.recordings.length,11);
 assert.equal(r.productionEligible,false);
 assert.equal(r.learnerAutomaticHandHintsAllowed,false);
 const serialized=JSON.stringify(r);
 assert.equal(serialized.includes('"pitch"'),false);
 assert.equal(serialized.includes('"onset"'),false);
 assert.equal(serialized.includes('"finger"'),false);
 assert.equal(serialized.includes('"hand"'),false);
});
test('R1: unusable/mutated pinned source GT is rejected instead of being benchmarked',async()=>{
 const broken=async url=>({
  ok:true,text:async()=>url.includes('/Fingering_GT/')?GT.replace('\tR\t2','\tX\t2'):TSV
 });
 await assert.rejects(runRealHandSeparationBenchmark({fetcher:broken}),
  /UNKNOWN_SOURCE_FINGER_CODING/);
});


// FG-04B4-R2 — pre-registered score-structure diagnostics, aggregate only.
// None of these features is allowed to use hidden external hand or finger.
const axisFields=['heldout','proposed','correct','incorrect','abstained'];
const assertAxes=protocol=>{
 for(const [axis,buckets] of Object.entries(protocol.diagnosticAxes)){
  const sums=Object.fromEntries(axisFields.map(k=>[k,0]));
  for(const [key,counts] of Object.entries(buckets)){
   assert.equal(typeof key,'string');
   assert.equal(counts.heldout,counts.proposed+counts.abstained);
   assert.equal(counts.proposed,counts.correct+counts.incorrect);
   for(const k of axisFields)sums[k]+=counts[k];
  }
  for(const k of axisFields)
   assert.equal(sums[k],protocol[k],'Axis '+axis+' field '+k);
 }
 assert.equal(Object.values(protocol.wrongDirection).reduce((a,b)=>a+b,0),
  protocol.incorrect);
};
test('R2: pre-registered axes independently reconcile exactly to every original R1 denominator',()=>{
 const island=duet(),r=evaluate([island]);
 assertAxes(r.protocols.unanchored);
 assertAxes(r.protocols.oracleSeeded);
 assert.deepEqual(Object.keys(r.protocols.unanchored.diagnosticAxes).sort(),[
  'attackTexture','exposedHandAnchors','heldSamePitchOverlap',
  'islandSize','nearestExposedAnchorPitch'].sort());
 const u=r.protocols.unanchored,o=r.protocols.oracleSeeded;
 assert.equal(u.diagnosticAxes.exposedHandAnchors.none.heldout,4);
 assert.equal(u.diagnosticAxes.nearestExposedAnchorPitch.none.heldout,4);
 assert.equal(o.diagnosticAxes.exposedHandAnchors.both.heldout,2);
 assert.equal(o.diagnosticAxes.nearestExposedAnchorPitch['0-4-semitones'].heldout,2);
 assert.equal(o.diagnosticAxes.attackTexture['simultaneous-onset'].heldout,2);
});
test('R2: withheld GT changes can affect scored correctness, never pre-scoring feature denominators',()=>{
 const original=duet(),changed=structuredClone(original);
 changed[2].hand='RH';changed[3].hand='LH';
 changed[2].finger=5;changed[3].finger=1;
 const a=evaluate([original]).protocols.oracleSeeded;
 const b=evaluate([changed]).protocols.oracleSeeded;
 assert.equal(a.anchors,b.anchors);
 assert.equal(a.proposed,b.proposed);
 assert.equal(a.abstained,b.abstained);
 for(const axis of Object.keys(a.diagnosticAxes))
  for(const category of Object.keys(a.diagnosticAxes[axis])){
   assert.equal(a.diagnosticAxes[axis][category].heldout,
    b.diagnosticAxes[axis][category].heldout);
   assert.equal(a.diagnosticAxes[axis][category].proposed,
    b.diagnosticAxes[axis][category].proposed);
   assert.equal(a.diagnosticAxes[axis][category].abstained,
    b.diagnosticAxes[axis][category].abstained);
  }
 assertAxes(a);assertAxes(b);
});
test('R2: same-key overlap and chord texture are source features, not guessed RH/LH identity',()=>{
 const island=[N(0,60,0,'RH'),N(1,60,.1,'LH'),
  N(2,64,.1,'RH'),N(3,67,.3,'RH')];
 const r=evaluate([island]).protocols.unanchored;
 assertAxes(r);
 assert.equal(r.diagnosticAxes.heldSamePitchOverlap['overlapping-physical-key'].heldout,2);
 assert.equal(r.diagnosticAxes.heldSamePitchOverlap['no-overlapping-physical-key'].heldout,2);
 assert.equal(r.diagnosticAxes.attackTexture['simultaneous-onset'].heldout,2);
 assert.equal(r.diagnosticAxes.attackTexture['staggered-onset'].heldout,2);
 assert.equal(r.proposed,0);
});
test('R2: rejected solver population is fully counted in every diagnostic abstention axis',()=>{
 // 11 same-onset keys trigger the research solver's 10-key cap; each
 // held-out note must remain unassigned and counted once on every axis.
 const island=Array.from({length:11},(_,i)=>N(i,48+i,0,i%2?'LH':'RH'));
 const r=evaluate([island]);
 for(const p of Object.values(r.protocols)){
  assertAxes(p);
  assert.equal(p.proposed,0);
  assert.equal(p.abstained,p.heldout);
 }
 assert.ok(r.protocols.oracleSeeded.unresolvedReasons.UNRESOLVED_ONSET_SEARCH_CAP>0);
});
test('R2: score-feature bins are complete without exposing original note arrays or performer labels',()=>{
 const result=evaluate([duet()]);
 const json=JSON.stringify(result);
 assert.ok(!json.includes('eval-'));
 assert.ok(!json.includes('"pitch":'));
 assert.ok(!json.includes('"start":'));
 assert.ok(!json.includes('"noteId":'));
 assert.ok(!json.includes('"finger":'));
 assert.ok(!json.includes('"hand":'));
 assertAxes(result.protocols.unanchored);
 assertAxes(result.protocols.oracleSeeded);
});
test('R2: 11 original-source mock benchmark exports only population-wide diagnostic bins',async()=>{
 const r=await runRealHandSeparationBenchmark({fetcher:fetchMock});
 const seeded=r.totals.protocols.oracleSeeded;
 assertAxes(seeded);
 assertAxes(r.totals.protocols.unanchored);
 assert.equal(seeded.heldout,22);
 assert.equal(seeded.diagnosticAxes.exposedHandAnchors.both.heldout,22);
 assert.ok(r.recordings.every(x=>Object.values(x.protocols).every(p=>
  p.diagnosticAxes===undefined&&p.wrongDirection===undefined)));
 assert.equal(r.productionEligible,false);
 assert.equal(r.learnerAutomaticHandHintsAllowed,false);
});
