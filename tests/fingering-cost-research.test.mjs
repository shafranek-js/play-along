import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFingeringCostResearch as evaluate}
 from '../src/core/fingering-cost-research.mjs';
const note=(noteId,pitch,finger,start=1,duration=.2,hand='RH')=>({
 noteId,pitch,finger,start,duration,hand,
 source:'musicxml',verification:'source-author'
});
const run=(next,previous=[],overrides={})=>evaluate({
 previous,next,at:0, ...overrides
});
test('FG-04C accepts exact source-verified chord and is deterministic, read-only',()=>{
 const chord=[note('a',60,1),note('b',64,3),note('c',67,5)];
 const before=structuredClone(chord);
 const first=run(chord);
 assert.equal(first.ok,true);
 assert.equal(first.researchOnly,true);
 assert.equal(first.productionEligible,false);
 assert.equal(first.expertValidated,false);
 assert.ok(first.total>=0);
 assert.deepEqual(first,run(chord));
 assert.deepEqual(chord,before);
});
test('FG-04C rejects conflicting physical finger and same-key voices',()=>{
 assert.equal(run([note('a',60,1),note('b',64,1)]).reason,'SAME_FINGER_SIMULTANEOUS');
 assert.equal(run([note('a',60,1),note('b',60,3)]).reason,'SAME_PHYSICAL_KEY');
});
test('FG-04C refuses unsupported/generated hands and duplicated identities',()=>{
 assert.equal(run([note('a',60,1),note('a',64,3)]).reason,'DUPLICATE_NOTE_ID');
 assert.equal(run([{...note('a',60,1),source:'research'}]).reason,'UNVERIFIED_SOURCE_NOTE');
 assert.equal(run([{...note('a',60,1),hand:'unknown'}]).reason,'UNVERIFIED_SOURCE_NOTE');
});
test('FG-04C refuses excessive spans without silently rolling a chord',()=>{
 assert.equal(run([note('a',48,1),note('b',84,5)]).reason,'EXCEEDS_FINGER_SPAN');
});
test('FG-04C refuses trying to reuse an occupied physical finger',()=>{
 const prev=[note('a',60,1,0,.9)];
 const next=[note('b',64,1,.6,.2)];
 assert.equal(run(next,prev).reason,'OCCUPIED_FINGER');
});
test('FG-04C physical travel cannot be hidden by changing source note time',()=>{
 const prev=[note('a',48,1,0,.2)];
 const next=[note('b',84,1,.21,.2)];
 const before=structuredClone([prev,next]);
 assert.equal(run(next,prev).reason,'TRAVEL_TIME_INFEASIBLE');
 assert.deepEqual([prev,next],before);
});
test('FG-04C slower safe transit receives cost, same-note metadata remains unchanged',()=>{
 const prev=[note('a',60,2,0,.2)];
 const next=[note('b',64,3,1,.2)];
 const r=run(next,prev);
 assert.equal(r.ok,true);
 assert.ok(r.parts.transition>0);
 assert.equal(r.notes,1);
});
test('FG-04C invalid configuration and out-of-order onset fail closed',()=>{
 assert.equal(run([note('a',60,1)],[],{handSize:0}).reason,'INVALID_CONFIGURATION');
 assert.equal(run([note('a',60,1)],[],{at:2}).reason,'TARGET_ALREADY_DUE');
});
