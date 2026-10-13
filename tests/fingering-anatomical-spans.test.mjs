import test from 'node:test';
import assert from 'node:assert/strict';
import {proposePolyphonicFingering as poly,proposeTwoHandFingering as two}
 from '../src/core/fingering-polyphonic.mjs';
import {proposeHybridScoreFingering as hybrid} from '../src/core/fingering-score-router.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';

const n=(id,pitch,finger,hand='RH')=>({noteId:id,pitch,start:0,duration:.4,finger,hand});
const solve=(notes,opts={})=>poly(notes,{hand:notes[0]?.hand||'RH',...opts});

test('FG-04C3 default legacy polyphonic result is byte-identical to explicit legacy mode',()=>{
 const notes=[n('c',60,null),n('e',64,null),n('g',67,null)];
 assert.deepEqual(solve(notes),solve(notes,{costModel:'legacy'}));
 assert.deepEqual(solve(notes).items.map(x=>x.finger),[1,3,5]);
});

test('FG-04C3 a ninth with anchored 1-5 is biomechanically feasible only in opt-in model',()=>{
 const notes=[n('c4',60,1),n('d5',74,5)];
 const before=structuredClone(notes);
 assert.equal(solve(notes).reason,'NO_VALID_PATH');
 const experiment=solve(notes,{costModel:'anatomical'});
 assert.equal(experiment.ok,true,JSON.stringify(experiment));
 assert.equal(experiment.method,'fg02b-anatomical-pair-beam');
 assert.deepEqual(experiment.items.map(x=>x.finger),[1,5]);
 assert.equal(audit(notes,experiment.items).valid,false);
 assert.equal(audit(notes,experiment.items,{spanModel:'anatomical'}).valid,true);
 assert.deepEqual(notes,before);
});

test('FG-04C3 finger 2-3 has a different pair reach than generic adjacent gap',()=>{
 const notes=[n('d4',62,2),n('fs4',66,3)]; // 2.5 white-key units
 assert.equal(solve(notes).reason,'NO_VALID_PATH');
 assert.equal(solve(notes,{costModel:'anatomical'}).ok,true);
 assert.equal(audit(notes,solve(notes,{costModel:'anatomical'}).items,{spanModel:'anatomical'}).valid,true);
});

test('FG-04C3 finger 3-4 remains physically limited, not a universal leniency',()=>{
 const notes=[n('d4',62,3),n('fs4',66,4)];
 assert.equal(solve(notes,{costModel:'anatomical'}).reason,'NO_VALID_PATH');
});

test('FG-04C3 anatomically wider ninth still refused for a smaller hand',()=>{
 const notes=[n('c4',60,1),n('d5',74,5)];
 assert.equal(solve(notes,{costModel:'anatomical',handSize:'XS'}).reason,'NO_VALID_PATH');
 assert.equal(solve(notes,{costModel:'anatomical',handSize:'M'}).ok,true);
});

test('FG-04C3 LH thumb/fifth pair mirrors anatomical span without rewriting notes',()=>{
 const notes=[n('bass',48,5,'LH'),n('top',62,1,'LH')];
 assert.equal(solve(notes,{hand:'LH',costModel:'anatomical'}).ok,true);
 assert.equal(solve(notes,{hand:'LH',handSize:'XXS',costModel:'anatomical'}).reason,'NO_VALID_PATH');
 assert.deepEqual(solve(notes,{hand:'LH',costModel:'anatomical'}).items.map(x=>x.noteId),
  ['bass','top']);
});

test('FG-04C3 existing hybrid router propagates the opt-in span model',()=>{
 const notes=[n('c4',60,1),n('d5',74,5)];
 const legacy=hybrid({RH:notes,LH:[]});
 assert.equal(legacy.reason,'AUTHOR_PHYSICAL_CONFLICT');
 const experimental=hybrid({RH:notes,LH:[]},{costModel:'anatomical'});
 assert.equal(experimental.ok,true,JSON.stringify(experimental));
 assert.equal(experimental.costModel,'anatomical');
 assert.deepEqual(experimental.hands.RH.map(x=>x.finger),[1,5]);
 assert.equal(experimental.productionEligible,false);
 assert.equal(experimental.expertValidated,false);
});

test('FG-04C3 two-hand beam passes model opt-in to each hand',()=>{
 const RH=[n('rh1',60,1),n('rh2',74,5)];
 const LH=[n('lh1',48,5,'LH'),n('lh2',62,1,'LH')];
 assert.equal(two({RH,LH}).ok,false);
 const experimental=two({RH,LH},{costModel:'anatomical'});
 assert.equal(experimental.ok,true,JSON.stringify(experimental));
 assert.deepEqual(experimental.hands.RH.map(x=>x.finger),[1,5]);
 assert.deepEqual(experimental.hands.LH.map(x=>x.finger),[5,1]);
});

test('FG-04C3 malformed cost model rejected by solver, router and auditor',()=>{
 const notes=[n('c',60,1)];
 assert.equal(solve(notes,{costModel:'surprise'}).reason,'INVALID_COST_MODEL');
 assert.equal(hybrid({RH:notes,LH:[]},{costModel:'surprise'}).reason,'INVALID_COST_MODEL');
 assert.deepEqual(audit(notes,notes,{spanModel:'surprise'}).violations,
  [{code:'INVALID_SPAN_MODEL'}]);
});

test('FG-04C3 opt-in result stays deterministic and preserves source IDs/timing',()=>{
 const notes=[n('upper',74,5),n('lower',60,1)]; // deliberately unsorted
 const before=structuredClone(notes);
 const a=solve(notes,{costModel:'anatomical'});
 assert.equal(a.ok,true);
 assert.deepEqual(a,solve(notes,{costModel:'anatomical'}));
 assert.deepEqual(notes,before);
 assert.deepEqual(a.items.map(x=>x.noteId),['upper','lower']);
 assert.deepEqual(a.items.map(x=>x.duration),[.4,.4]);
});
