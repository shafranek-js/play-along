/**
 * QA-02 independent black-box characterization, Play Along v0.10.68.
 * Source git blob: 9f257898ad0d9c3cdde6092c999f83e82be028f4.
 * SYNTHETIC oracle only, not pianist-approved ground truth.
 * Run: node --test tests/qa02-hand-separation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {separateHandsResearch as separate} from '../src/core/fingering-hand-separation.mjs';
const n=(id,p,start=0,duration=.3,extra={})=>({noteId:id,pitch:p,start,duration,...extra});
const hands=r=>Object.fromEntries(r.items.map(x=>[x.noteId,x.hand]));
const voice=(side,i,p,time,d=.2,fix=false)=>n(side+i,p,time,d,{partId:'P1',staff:side==='LH'?2:1,voice:side,...(fix?{authorHand:side}:{})});
const stats=r=>r.summary;

test('QA02-A: source identity, author/user precedence and original fingers untouched',()=>{
 const notes=[n('xml:P1:0:0:1',48,0,.3,{authorHand:'RH',userHand:'LH',finger:4,sourceFinger:2}),
  n('xml:P1:0:0:2',72,0,.3,{authorHand:'RH',finger:5})];
 const original=structuredClone(notes),r=separate(notes);
 assert.deepEqual(notes,original);
 assert.deepEqual(Object.keys(hands(r)),notes.map(x=>x.noteId));
 assert.deepEqual(r.items.map(x=>x.source),['user','author']);
 assert.deepEqual(r.items.map(x=>x.hand),['LH','RH']);
 assert.equal(r.productionEligible,false);assert.equal(r.expertValidated,false);
 assert.ok(r.items.every(x=>x.confidence===null));
});
test('QA02-B: single unanchored melody abstains',()=>{
 const r=separate([60,62,64,65,67].map((p,i)=>n('melody'+i,p,i*.4,.2)));
 assert.deepEqual(stats(r),{total:5,fixed:0,proposed:0,unknown:5});
});
test('QA02-C: two independent voices preserve source hand trajectories',()=>{
 const notes=[voice('LH',0,48,0,.2,true),voice('RH',0,72,0,.2,true),
 voice('LH',1,50,.3),voice('RH',1,74,.3),voice('LH',2,52,.6),voice('RH',2,76,.6)];
 const r=separate(notes);
 assert.equal(stats(r).fixed,2);assert.equal(stats(r).proposed,4);
 assert.deepEqual(r.items.map(x=>x.hand),['LH','RH','LH','RH','LH','RH']);
});
test('QA02-D: three-note chord with one RH anchor reports middle ambiguity',()=>{
 const r=separate([n('fixed',60,0,.4,{authorHand:'RH'}),n('middle',64,0,.4),n('top',67,0,.4)]);
 assert.deepEqual({middle:hands(r).middle,top:hands(r).top},{middle:null,top:'RH'});
 assert.equal(stats(r).unknown,1);
});
test('QA02-E: compact five-note chord without source hand abstains',()=>{
 const r=separate([60,62,64,65,67].map((p,i)=>n('c'+i,p,0,.4)));
 assert.equal(stats(r).unknown,5);assert.equal(stats(r).proposed,0);
});
test('QA02-F: nine-note 5+4 chord uniquely partitions',()=>{
 const pitches=[48,50,52,53,55,72,74,76,77];
 const r=separate(pitches.map((p,i)=>n('c'+i,p,0,.4)));
 assert.equal(stats(r).proposed,9);
 assert.deepEqual(r.items.map(x=>x.hand),['LH','LH','LH','LH','LH','RH','RH','RH','RH']);
});
test('QA02-G: documented known coverage defect, feasible ten-note 5+5 onset refused',()=>{
 const pitches=[48,50,52,53,55,72,74,76,77,79];
 const r=separate(pitches.map((p,i)=>n('c'+i,p,0,.4)));
 assert.equal(r.ok,true);assert.equal(r.diagnostics[0].code,'ONSET_SEARCH_CAP');
 assert.equal(stats(r).proposed,0);assert.equal(stats(r).unknown,10);
});
test('QA02-H: held LH while RH voice proceeds',()=>{
 const notes=[voice('LH',0,48,0,2,true),voice('RH',0,72,0,.2,true),
 voice('RH',1,74,.5),voice('RH',2,76,1)];
 const r=separate(notes);
 assert.deepEqual(r.items.map(x=>x.hand),['LH','RH','RH','RH']);
 assert.equal(stats(r).proposed,2);
});
test('QA02-I: fast unsupported jump refuses, same slow jump is possible',()=>{
 const make=dt=>[voice('LH',0,48,0,.01,true),voice('RH',0,72,0,.01,true),
 voice('LH',1,60,dt,.01),voice('RH',1,84,dt,.01)];
 const fast=separate(make(.02)),slow=separate(make(.6));
 assert.equal(stats(fast).proposed,0);
 assert.equal(fast.diagnostics[0].code,'NO_FEASIBLE_HAND_PATH');
 assert.deepEqual(slow.items.map(x=>x.hand),['LH','RH','LH','RH']);
});
test('QA02-J: known crossing remains fixed, unanchored continuation abstains',()=>{
 const notes=[voice('LH',0,72,0,.2,true),voice('RH',0,60,0,.2,true),
 voice('LH',1,74,.5),voice('RH',1,62,.5)];
 const r=separate(notes);
 assert.deepEqual(r.items.slice(0,2).map(x=>x.hand),['LH','RH']);
 assert.equal(stats(r).proposed,0);assert.equal(stats(r).unknown,2);
});
test('QA02-K: overlapping unison refused; adjacent reattack not falsely rejected',()=>{
 const overlap=separate([n('a',60,0,1),n('b',60,.2,.2),n('unrelated',84,1,.2)]);
 assert.equal(overlap.diagnostics[0].code,'SAME_KEY_OVERLAP');
 assert.equal(stats(overlap).proposed,0);assert.equal(stats(overlap).unknown,3);
 const adjacent=separate([n('a',60,0,.2),n('b',60,.2,.2)]);
 assert.ok(!adjacent.diagnostics.some(x=>x.code==='SAME_KEY_OVERLAP'));
});
test('QA02-L: underdetermined opposite crossed-hand interpretation can be confidently mislabeled',()=>{
 const notes=[n('lower',72),n('higher',96)],result=separate(notes);
 assert.deepEqual(result.items.map(x=>x.hand),['LH','RH']);
 assert.equal(stats(result).unknown,0);
 const syntheticCrossedTruth={lower:'RH',higher:'LH'};
 assert.equal(result.items.filter(x=>x.hand!==syntheticCrossedTruth[x.noteId]).length,2);
 // This is an adversarial identifiability example, not a measured real-world error rate.
});
test('QA02-M: multi-voice identity stable against shuffled note order',()=>{
 const notes=[voice('RH',0,50,0,.2,true),voice('LH',0,74,0,.2,true),
 voice('LH',1,76,.8),voice('RH',1,52,.8)];
 const a=separate(notes),b=separate([...notes].reverse());
 assert.deepEqual(hands(a),hands(separate(notes)));assert.deepEqual(hands(a),hands(b));
 assert.deepEqual(notes.map(x=>x.noteId),a.items.map(x=>x.noteId));
});
test('QA02-N: malformed IDs, duration or hand rejected rather than guessed',()=>{
 assert.equal(separate([n('a',60),n('a',64)]).reason,'INVALID_OR_DUPLICATE_SOURCE_ID');
 assert.equal(separate([n('z',60,0,0)]).reason,'INVALID_EVENT');
 assert.equal(separate([n('u',60,0,.3,{userHand:'INVALID'})]).reason,'INVALID_FIXED_HAND');
});
test('QA02-O: caller note timing/velocity/staff/finger metadata unchanged',()=>{
 const events=[n('s1',48,0,1,{partId:'p',staff:2,voice:1,finger:-4,velocity:90}),
  n('s2',72,.5,.3,{partId:'p',staff:1,voice:2,finger:2,velocity:100})];
 const snapshot=JSON.stringify(events),r=separate(events);
 assert.equal(JSON.stringify(events),snapshot);
 assert.deepEqual(r.items.map(x=>x.noteId),events.map(x=>x.noteId));
 assert.equal(r.productionEligible,false);
});
const syntheticCases=[
 {category:'duet',truth:['LH','RH','LH','RH'],events:[voice('LH',0,48,0,.2,true),voice('RH',0,72,0,.2,true),voice('LH',1,50,.3),voice('RH',1,74,.3)]},
 {category:'held',truth:['LH','RH','RH','RH'],events:[voice('LH',0,48,0,2,true),voice('RH',0,72,0,.2,true),voice('RH',1,74,.5),voice('RH',2,76,1)]},
 {category:'nine-key-chord',truth:['LH','LH','LH','LH','LH','RH','RH','RH','RH'],events:[48,50,52,53,55,72,74,76,77].map((p,i)=>n('c'+i,p))},
 {category:'ten-key-chord',truth:['LH','LH','LH','LH','LH','RH','RH','RH','RH','RH'],events:[48,50,52,53,55,72,74,76,77,79].map((p,i)=>n('c'+i,p))},
 {category:'mono',truth:['RH','RH','RH'],events:[60,62,64].map((p,i)=>n('m'+i,p,i*.4))},
 {category:'crossing',truth:['LH','RH','LH','RH'],events:[voice('LH',0,72,0,.2,true),voice('RH',0,60,0,.2,true),voice('LH',1,74,.5),voice('RH',1,62,.5)]},
 {category:'adversarial-crossed-two-hand',truth:['RH','LH'],events:[n('low',72),n('high',96)]},
 {category:'normal-duet',truth:['LH','RH'],events:[n('low',48),n('high',72)]}
];
function metric(rows){
 let fixed=0,eligible=0,proposed=0,unknown=0,correct=0,wrong=0;
 for(const row of rows){const r=separate(row.events);for(let i=0;i<row.events.length;i++){
  const item=r.items[i];if(item.status==='fixed'){fixed++;continue;}
  eligible++;if(item.status==='unknown'){unknown++;continue;}
  proposed++;if(item.hand===row.truth[i])correct++;else wrong++;
 }}
 return {fixtures:rows.length,fixed,eligible,proposed,unknown,correct,wrong,
  coverage:eligible?proposed/eligible:null,abstentionRate:eligible?unknown/eligible:null,
  accuracyAmongProposed:proposed?correct/proposed:null,
  falseAssignmentRateAmongProposed:proposed?wrong/proposed:null};
}
test('QA02-P: transparent synthetic category denominators, no real GT claims',()=>{
 const categories=Object.fromEntries(syntheticCases.map(x=>[x.category,metric([x])]));
 const total=metric(syntheticCases);
 console.log('QA02_SYNTHETIC_METRICS '+JSON.stringify({total,categories}));
 assert.equal(total.eligible,total.proposed+total.unknown);
 assert.equal(total.proposed,total.correct+total.wrong);
 assert.equal(categories['ten-key-chord'].unknown,10);
 assert.equal(categories['adversarial-crossed-two-hand'].wrong,2);
});
test('QA02-Q: short/long bounded solver probes, not SLA',()=>{
 const sizes=[20,200,1000,2500],results=[];
 for(const size of sizes){
  const events=Array.from({length:size},(_,i)=>n('perf'+i,48+2*(i%4),i*.15,.1));
  const t0=performance.now(),r=separate(events),durationMs=performance.now()-t0;
  assert.equal(r.ok,true);assert.equal(r.summary.total,size);
  assert.ok(Number.isFinite(durationMs));
  results.push({notes:size,ms:+durationMs.toFixed(2),proposed:r.summary.proposed,unknown:r.summary.unknown});
 }
 console.log('QA02_PERFORMANCE '+JSON.stringify(results));
});
