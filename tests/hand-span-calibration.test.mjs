import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendHandSpanProfile as assess} from '../src/core/hand-span-calibration.mjs';

const hand=(interval,comfort='easy')=>({interval,comfort});

test('FG-04C5 relaxed tenth C4–E5 recommends L (user-validated scenario)',()=>{
 const result=assess({RH:hand('tenth'),LH:hand('tenth')});
 assert.equal(result.ok,true);
 assert.equal(result.profile,'L');
 assert.deepEqual(result.byHand,{RH:'L',LH:'L'});
 assert.equal(result.status,'both-hands');
 assert.equal(result.physiologicalMeasurement,false);
});
test('FG-04C5 more limited hand determines common fingering profile',()=>{
 const r=assess({RH:hand('tenth'),LH:hand('octave')});
 assert.equal(r.profile,'S');
 assert.deepEqual(r.byHand,{RH:'L',LH:'S'});
});
test('FG-04C5 strained reach is downgraded rather than stretched',()=>{
 assert.equal(assess({RH:hand('tenth','stretch')}).profile,'M');
 assert.equal(assess({RH:hand('octave','stretch')}).profile,'XS');
 assert.equal(assess({RH:hand('sub7','stretch')}).profile,'XXS');
});
test('FG-04C5 pain refuses all profiles, even if other hand is comfortable',()=>{
 const a=assess({RH:hand('tenth'),LH:hand('ninth','pain')});
 assert.equal(a.ok,false);
 assert.equal(a.reason,'DISCOMFORT_REPORTED');
 assert.equal(a.hand,'LH');
 assert.equal('profile' in a,false);
});
test('FG-04C5 one unmeasured hand gives a provisional profile',()=>{
 const r=assess({RH:hand('tenth'),LH:hand('unknown')});
 assert.equal(r.ok,true);
 assert.equal(r.profile,'L');
 assert.equal(r.status,'provisional-one-hand');
 assert.deepEqual(r.byHand,{RH:'L'});
});
test('FG-04C5 no answer and invalid values must not fabricate a hand-size',()=>{
 assert.equal(assess({}).reason,'NO_HAND_MEASURED');
 assert.equal(assess({RH:hand('unknown')}).reason,'NO_HAND_MEASURED');
 assert.equal(assess({RH:hand('fifteenth')}).reason,'INVALID_RH_RESPONSE');
 assert.equal(assess({RH:hand('tenth','unknown')}).reason,'INVALID_RH_RESPONSE');
 assert.equal(assess(null).reason,'INVALID_RESPONSES');
});
test('FG-04C5 wide unverified reach cannot auto-promote to XXL',()=>{
 const r=assess({RH:hand('beyondTenth'),LH:hand('beyondTenth')});
 assert.equal(r.profile,'XL');
 assert.notEqual(r.profile,'XXL');
 assert.equal(r.neighbourFingerReachUnverified,true);
});
test('FG-04C5 calculation stays deterministic and leaves answers untouched',()=>{
 const answers={RH:hand('ninth'),LH:hand('tenth')};
 const before=structuredClone(answers);
 assert.deepEqual(assess(answers),assess(answers));
 assert.deepEqual(answers,before);
});
