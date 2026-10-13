import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {structuralHandModelWitness,inspectHandSeparationSyntheticCase,
 evaluateIndependentHandStructuralChallenges} from '../src/core/hand-separation-structural-challenges.mjs';
import {originalSyntheticManifest,runIndependentSyntheticFalsification,
 FROZEN_FIXTURE_BLOB,FROZEN_SOLVER_BLOB} from '../scripts/hand-separation-structural-challenges.mjs';
const manifest=originalSyntheticManifest();
const find=id=>structuredClone(manifest.cases.find(c=>c.id===id));
test('R3: original independently-authored synthetic controls AND frozen baseline are pinned to exact Git blobs',()=>{
 assert.match(FROZEN_FIXTURE_BLOB,/^[a-f0-9]{40}$/);
 assert.match(FROZEN_SOLVER_BLOB,/^[a-f0-9]{40}$/);
 assert.equal(manifest.schema,'fg04b4-r3-independent-engineering-challenges-v1');
 assert.equal(manifest.externalSourceGTAllowed,false);
 assert.equal(manifest.cases.length,15);
 assert.ok(manifest.cases.every(c=>c.events.every(e=>['LH','RH'].includes(e.truthHand))));
});
test('R3: safe single-hand cases do not become proof of global RH/LH identifiability',()=>{
 const r=inspectHandSeparationSyntheticCase(find('rh-single-anchor-phrase'));
 assert.equal(r.anchors,1);
 assert.equal(r.heldout,4);
 assert.equal(r.physicalHumanFeasibilityCertified,false);
 assert.equal(r.source,'ORIGINAL_SYNTHETIC_ONLY');
 assert.equal(r.productionEligible,false);
 assert.equal(r.scored.heldout,r.scored.proposed+r.scored.abstained);
 assert.equal(r.scored.proposed,r.scored.correct+r.scored.incorrect);
});
test('R3: hand-crossing and one-exposed-hand-only controls preserve honest hidden-label scoring',()=>{
 const c=find('rh-known-other-unseen');
 const x=inspectHandSeparationSyntheticCase(c);
 const y=structuredClone(c);
 // Only withheld GT labels change; MIDI input and source-hand anchors do not.
 for(const event of y.events)if(!event.anchor)
  event.truthHand=event.truthHand==='LH'?'RH':'LH';
 const b=inspectHandSeparationSyntheticCase(y);
 assert.equal(x.solverVerdict,b.solverVerdict);
 assert.equal(x.heldout,b.heldout);
 assert.equal(x.proposed,b.proposed);
 assert.equal(x.abstained,b.abstained);
 assert.equal(x.widerBeamChangedVerdict,b.widerBeamChangedVerdict);
 assert.equal(x.largerHandChangedVerdict,b.largerHandChangedVerdict);
 assert.equal(x.correct+x.incorrect,b.correct+b.incorrect);
});
test('R3: eleven simultaneous different physical keys are structurally over elementary 10-finger bound',()=>{
 const c=find('eleven-simultaneous-keys');
 const source=c.events.map((e,i)=>({noteId:'n'+i,pitch:e.pitch,
  start:e.start,duration:e.duration,
  ...(e.anchor?{authorHand:e.truthHand}:{})}));
 const witness=structuralHandModelWitness(source);
 assert.equal(witness.peakSimultaneousEvents,11);
 assert.ok(witness.codes.includes('MORE_THAN_TEN_SIMULTANEOUS_EVENTS'));
 assert.equal(witness.physicalHumanFeasibilityCertified,false);
 const r=inspectHandSeparationSyntheticCase(c);
 assert.equal(r.witnessedStructuralConflict,true);
 assert.equal(r.sourceStructuralFlags.includes('MORE_THAN_TEN_SIMULTANEOUS_EVENTS'),true);
});
test('R3: duplicated physical key overlap is source ambiguous but not falsely erased',()=>{
 for(const id of ['same-key-overlap-voices','same-key-unison']){
  const r=inspectHandSeparationSyntheticCase(find(id));
  assert.equal(r.witnessedStructuralConflict,true);
  assert.ok(r.sourceStructuralFlags.includes('CONCURRENT_SAME_PHYSICAL_KEY'));
  assert.equal(r.proposed,0);
  assert.equal(r.productionEligible,false);
 }
});
test('R3: six externally declared same-hand notes breach limited 5-finger model, not human physiology proof',()=>{
 const c=find('six-anchored-lh-chord');
 const r=inspectHandSeparationSyntheticCase(c);
 assert.ok(r.sourceStructuralFlags.includes('MORE_THAN_FIVE_ANCHORED_KEYS_IN_ONE_HAND'));
 assert.equal(r.anchors,6);
 assert.equal(r.heldout,0);
 assert.equal(r.physicalHumanFeasibilityCertified,false);
});
test('R3: a search-model NO_FEASIBLE result without structural certificate is indeterminate, never validated anatomical impossibility',()=>{
 const r=inspectHandSeparationSyntheticCase(find('extreme-rh-jump'));
 assert.equal(r.witnessedStructuralConflict,false);
 assert.equal(r.physicalHumanFeasibilityCertified,false);
 if(r.modelNoFeasible)assert.equal(r.modelNoFeasibleWithoutStructuralCertificate,true);
});
test('R3: known authored crossed hands retained without using high-note RH shortcut',()=>{
 const r=inspectHandSeparationSyntheticCase(find('two-hands-crossed-registers'));
 assert.equal(r.anchors,2);
 assert.equal(r.heldout,2);
 assert.equal(r.correct+r.incorrect+r.abstained,2);
 assert.equal(r.productionEligible,false);
});
test('R3: unanchored both-hands case never counts a guessed hand identity as verified',()=>{
 const r=inspectHandSeparationSyntheticCase(find('unanchored-both-hands'));
 assert.equal(r.anchors,0);
 assert.equal(r.proposed,0);
 assert.equal(r.abstained,r.heldout);
 assert.equal(r.productionEligible,false);
});
test('R3: all 15 independent controls retain exactly one scoring denominator per held-out note',()=>{
 const r=evaluateIndependentHandStructuralChallenges(manifest);
 assert.equal(r.totals.cases,15);
 assert.equal(r.totals.cases,r.cases.length);
 assert.equal(r.totals.heldout,r.totals.proposed+r.totals.abstained);
 assert.equal(r.totals.proposed,r.totals.correct+r.totals.incorrect);
 assert.equal(Object.values(r.families).reduce((a,b)=>a+b.heldout,0),r.totals.heldout);
 assert.equal(Object.values(r.families).reduce((a,b)=>a+b.modelNoFeasibleCases,0),
  r.totals.modelNoFeasibleCases);
 assert.equal(r.productionEligible,false);
 assert.equal(r.professionalPianistValidated,false);
 assert.equal(r.groundTruthKind,'ENGINEERING_CONSTRUCTED_NOT_REAL_PERFORMER');
 assert.equal(r.autonomousLearnerHandHintsEnabled,false);
});
test('R3: immutable scorer never mutates original annotated fixture or outputs note-level labels',()=>{
 const before=JSON.stringify(manifest);
 const a=runIndependentSyntheticFalsification();
 const b=runIndependentSyntheticFalsification();
 assert.equal(JSON.stringify(manifest),before);
 assert.deepEqual(a,b);
 const text=JSON.stringify(a);
 assert.ok(!text.includes('"truthHand"'));
 assert.ok(!text.includes('"pitch"'));
 assert.ok(!text.includes('"duration"'));
 assert.ok(!text.includes('"start"'));
 assert.ok(!text.includes('"noteId"'));
 assert.equal(a.cases.length,15);
});
test('R3: invalid or arbitrary unsafe labels, durations, duplicate cases fail closed',()=>{
 const base=find('rh-single-anchor-phrase');
 for(const e of [
  {...base,events:[{...base.events[0],truthHand:'UNKNOWN'}]},
  {...base,events:[{...base.events[0],duration:0}]},
  {...base,events:[{...base.events[0],anchor:'true'}]}
 ]){
  assert.throws(()=>inspectHandSeparationSyntheticCase(e),
   /INVALID_INDEPENDENT_SYNTHETIC_CHALLENGE/);
 }
 const duplicate={...manifest,cases:structuredClone(manifest.cases)};
 duplicate.cases[1].id=duplicate.cases[0].id;
 assert.throws(()=>evaluateIndependentHandStructuralChallenges(duplicate),
  /INVALID_INDEPENDENT_SYNTHETIC_CHALLENGE/);
});
test('R3: no original unlabelled note may be upgraded to independent oracle marker',()=>{
 const c=find('unanchored-both-hands');
 const unchanged=inspectHandSeparationSyntheticCase(c);
 const reflected=structuredClone(c);
 reflected.events.forEach(e=>{e.truthHand=e.truthHand==='RH'?'LH':'RH'});
 const q=inspectHandSeparationSyntheticCase(reflected);
 assert.equal(unchanged.proposed,q.proposed);
 assert.equal(unchanged.abstained,q.abstained);
 assert.equal(unchanged.anchors,0);
 assert.equal(q.anchors,0);
});
