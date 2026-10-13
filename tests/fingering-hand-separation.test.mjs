import test from 'node:test';
import assert from 'node:assert/strict';
import {separateHandsResearch as separate} from '../src/core/fingering-hand-separation.mjs';
const n=(id,pitch,start=0,duration=.3,extra={})=>({noteId:id,pitch,start,duration,...extra});
const labels=r=>r.items.map(x=>x.hand);

test('P1: unanchored two-hand duet does not assert physical hand ownership',()=>{
 const r=separate([n('low',72),n('high',96)]);
 assert.deepEqual(labels(r),[null,null]);
 assert.deepEqual(r.summary,{total:2,fixed:0,proposed:0,unknown:2});
 assert.ok(r.diagnostics.every(d=>d.code==='UNANCHORED_HAND_IDENTITY'));
});
test('Low-register RH can be fixed; no hard C4 threshold',()=>{
 const r=separate([n('rh',43,0,.4,{authorHand:'RH'}),n('lh',32,0,.4,{authorHand:'LH'})]);
 assert.deepEqual(labels(r),['RH','LH']);
 assert.equal(r.items[0].source,'author');
});
test('A single unsupported melody stays unknown instead of guessing RH',()=>{
 const r=separate([n('a',60),n('b',62,.4),n('c',64,.8)]);
 assert.equal(r.summary.unknown,3);
 assert.deepEqual(labels(r),[null,null,null]);
});
test('Ambiguous reachable chord has no fabricated definitive ownership',()=>{
 const r=separate([60,64,67].map((p,i)=>n('c'+i,p)));
 assert.equal(r.summary.unknown,3);
});
test('Author-labelled independent duet establishes two trajectories',()=>{
 const r=separate([
  n('L0',48,0,.25,{authorHand:'LH'}),n('R0',72,0,.25,{authorHand:'RH'}),
  n('L1',50,.4,.25),n('R1',74,.4,.25)
 ]);
 assert.deepEqual(labels(r),['LH','RH','LH','RH']);
 assert.equal(r.summary.fixed,2);assert.equal(r.summary.proposed,2);
});
test('User override is retained without altering contradictory original author designation',()=>{
 const events=[n('a',60,0,.3,{authorHand:'RH',userHand:'LH',finger:4,sourceFinger:2})];
 const snapshot=structuredClone(events);
 const r=separate(events);
 assert.equal(r.items[0].hand,'LH');assert.equal(r.items[0].source,'user');
 assert.deepEqual(events,snapshot);assert.equal(r.productionEligible,false);
});
test('Source finger-only annotation is preserved but is not RH evidence',()=>{
 const events=[n('a',76,0,.3,{finger:5})];
 assert.deepEqual(labels(separate(events)),[null]);
 assert.equal(events[0].finger,5);
});
test('Crossed RH/LH author assignment stays fixed (crossings allowed)',()=>{
 const r=separate([n('rh-low',60,0,.4,{authorHand:'RH'}),n('lh-high',72,0,.4,{authorHand:'LH'})]);
 assert.deepEqual(labels(r),['RH','LH']);
 assert.deepEqual(r.items.map(v=>v.status),['fixed','fixed']);
});
test('Overlapping same key, including duplicate voice, is refused explicitly',()=>{
 const events=[n('a',60,0,1),n('b',60,.2,.2),n('c',72,0,.2)];
 const r=separate(events);
 assert.equal(r.diagnostics[0].code,'SAME_KEY_OVERLAP');
 assert.equal(r.summary.unknown,3);
});
test('Conflicting fixed two-hand same key still preserves source but refuses inference',()=>{
 const events=[n('a',60,0,1,{authorHand:'RH'}),n('b',60,0,1,{userHand:'LH'})];
 const r=separate(events);
 assert.deepEqual(labels(r),['RH','LH']);
 assert.equal(r.diagnostics[0].code,'SAME_KEY_OVERLAP');
 assert.equal(r.summary.proposed,0);
});
test('More than ten concurrent keys cannot be assigned to only two sets of five',()=>{
 const events=Array.from({length:11},(_,i)=>n('x'+i,48+2*i));
 const r=separate(events);
 assert.equal(r.summary.proposed,0);
 assert.equal(r.diagnostics[0].code,'ONSET_SEARCH_CAP');
});
test('Impossible fixed same-hand stretch rejects unassigned neighbors',()=>{
 const events=[n('lo',35,0,2,{authorHand:'RH'}),n('hi',75,.15,.4,{userHand:'RH'}),n('third',80,.2,.2)];
 const r=separate(events);
 assert.equal(r.diagnostics[0].code,'NO_FEASIBLE_HAND_PATH');
 assert.deepEqual(labels(r),['RH','RH',null]);
});
test('Hand-size model can refuse a physically oversized forced interval',()=>{
 const notes=[n('a',48,0,.6,{authorHand:'LH'}),n('b',60,0,.6,{authorHand:'LH'})];
 const small=separate(notes,{handSize:'XXS'});
 assert.equal(small.diagnostics[0].code,'NO_FEASIBLE_HAND_PATH');
 assert.deepEqual(labels(small),['LH','LH']);
});
test('Deterministic and source identity stable under permuted input order',()=>{
 const notes=[n('a',48,0,.3,{authorHand:'LH'}),n('b',72,0,.3,{authorHand:'RH'}),n('c',50,.5,.3),n('d',74,.5,.3)];
 const a=separate(notes),b=separate([...notes].reverse());
 assert.deepEqual(a,separate(notes));
 assert.deepEqual(Object.fromEntries(a.items.map(x=>[x.noteId,x.hand])),
  Object.fromEntries(b.items.map(x=>[x.noteId,x.hand])));
});
test('Invalid note identities, durations, anchors and solver sizes fail closed',()=>{
 assert.equal(separate([n('a',60),n('a',64)]).reason,'INVALID_OR_DUPLICATE_SOURCE_ID');
 assert.equal(separate([n('x',128)]).reason,'INVALID_EVENT');
 assert.equal(separate([n('x',60,0,0)]).reason,'INVALID_EVENT');
 assert.equal(separate([n('x',60,0,.3,{authorHand:'?'})]).reason,'INVALID_FIXED_HAND');
 assert.equal(separate([n('x',60)],{beamWidth:1}).reason,'INVALID_BEAM_WIDTH');
 assert.equal(separate([n('x',60)],{handSize:'ZZZ'}).reason,'INVALID_HAND_SIZE');
 assert.equal(separate([n('x',60)],{ambiguityMargin:-1}).reason,'INVALID_AMBIGUITY_MARGIN');
});
test('Provenance and production safety flags are invariant on every decision',()=>{
 for(const notes of [[n('a',60)], [n('a',48),n('b',80)], [n('a',60,0,2),n('b',60,.5,.2)]]){
  const r=separate(notes);
  assert.equal(r.productionEligible,false);assert.equal(r.expertValidated,false);
  for(const item of r.items){assert.equal(item.confidence,null);assert.notEqual(item.status,'verified')}
 }
});

test('Reference fixture benchmark: fixed references excluded from proposal denominator',()=>{
 // Labels originate from existing fixed two-hand/chord test patterns; these
 // are synthetic consistency references, NOT independently pianist-scored data.
 const fixtures=[
  {name:'wide-duet',notes:[n('a',40),n('b',75)],truth:['LH','RH']},
  {name:'high-duet',notes:[n('a',72),n('b',96)],truth:['LH','RH']},
  {name:'author-follow',notes:[n('l0',48,0,.2,{authorHand:'LH'}),n('r0',72,0,.2,{authorHand:'RH'}),n('l1',50,.5,.2),n('r1',74,.5,.2)],truth:['LH','RH','LH','RH']},
  {name:'ambiguous-chord',notes:[n('c',60),n('e',64),n('g',67)],truth:['RH','RH','RH']},
  {name:'melody',notes:[n('c',60),n('d',62,.4),n('e',64,.8)],truth:['RH','RH','RH']}
 ];
 let fixed=0,proposed=0,unknown=0,correct=0,wrong=0;
 for(const fixture of fixtures){
  const result=separate(fixture.notes);
  for(let i=0;i<result.items.length;i++){
   const note=result.items[i];
   if(note.status==='fixed'){fixed++;continue}
   if(note.status==='unknown'){unknown++;continue}
   proposed++;
   if(note.hand===fixture.truth[i])correct++;else wrong++;
  }
 }
 const eligible=proposed+unknown;
 console.log('HAND_SEPARATION_REFERENCE '+JSON.stringify({fixtures:fixtures.length,notes:fixed+eligible,
  fixed,eligible,proposed,unknown,correct,wrong,proposalCoveragePct:+(100*proposed/eligible).toFixed(2),
  acceptedAgreementPct:proposed?+(100*correct/proposed).toFixed(2):null,
  strictAgreementPct:+(100*correct/eligible).toFixed(2)}));
 assert.equal(fixtures.length,5);
 assert.equal(wrong,0);
 assert.ok(unknown>0);
});

test('P2: physically feasible 5+5 onset passes structure/search without fake hand labels',()=>{
 const pitches=[48,50,52,53,55,72,74,76,77,79];
 const r=separate(pitches.map((p,i)=>n('ten'+i,p,0,.2)));
 assert.equal(r.ok,true);
 assert.equal(r.summary.total,10);
 assert.equal(r.summary.unknown,10);
 assert.equal(r.summary.proposed,0);
 assert.ok(r.diagnostics.every(d=>d.code==='UNANCHORED_HAND_IDENTITY'));
 assert.ok(!r.diagnostics.some(d=>d.code==='ONSET_SEARCH_CAP'));
});
test('Source anchors still permit unique two-hand trajectories without automatic fingers',()=>{
 const notes=[n('L0',48,0,.3,{authorHand:'LH',voice:'LH',partId:'P1'}),
  n('R0',72,0,.3,{authorHand:'RH',voice:'RH',partId:'P1'}),
  n('L1',50,.5,.2,{voice:'LH',partId:'P1'}),
  n('R1',74,.5,.2,{voice:'RH',partId:'P1'})];
 const r=separate(notes);
 assert.deepEqual(labels(r),['LH','RH','LH','RH']);
 assert.equal(r.productionEligible,false);
});

// Register isolated FG-04C research regressions in the existing npm test suite.
import './fingering-cost-research.test.mjs';
