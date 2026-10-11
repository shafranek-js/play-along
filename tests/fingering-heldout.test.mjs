import test from 'node:test';
import assert from 'node:assert/strict';
import {heldout,heldoutCase,runHeldoutBenchmark} from '../scripts/fingering-heldout-benchmark.mjs';
import {references} from '../scripts/fingering-benchmark.mjs';
import {proposePhraseAwareMonophonicFingering as phrase} from '../src/core/fingering-phrases.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';

const cases=heldout.cases;
test('FG-02E held-out fixture is complete, frozen and does not recycle development examples',()=>{
 assert.equal(cases.length,34);
 assert.equal(cases.reduce((n,c)=>n+c.pitches.length,0),314);
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 const devKeys=new Set(references.cases.map(c=>c.key).filter(Boolean));
 assert.deepEqual(devKeys,new Set());
 const tonics=new Set(cases.map(c=>c.key));
 assert.deepEqual([...tonics].sort(),['A-flat','B','B-flat','E','E-flat','F','F-sharp'].sort());
 const previous=new Set(references.cases.map(c=>c.id));
 assert.ok(cases.every(c=>!previous.has(c.id)));
 assert.ok(cases.every(c=>!['C','D','G'].includes(c.key)));
 assert.ok(heldout.frozenAgainst.includes('9f492faf'));
});
test('FG-02E every case has valid keys, notes, anchors and URL provenance',()=>{
 for(const c of cases){
  assert.ok(/^https:\/\/piano\.org\//.test(c.source),c.id);
  assert.ok(c.pitches.every(p=>Number.isInteger(p)&&p>=21&&p<=108),c.id);
  assert.ok(c.expected.every(f=>Number.isInteger(f)&&f>=1&&f<=5),c.id);
  assert.equal(c.expected.length,c.pitches.length,c.id);
  assert.equal(c.pitches.length,c.span==='one-octave'?8:15,c.id);
  assert.ok(['RH','LH'].includes(c.hand));
  assert.ok(['ascending','descending'].includes(c.direction));
  const step=c.direction==='ascending'?1:-1;
  assert.ok(c.pitches.slice(1).every((p,i)=>(p-c.pitches[i])*step>0));
  assert.ok(c.alternativeExpected===undefined||
    (c.alternativeExpected.length===c.expected.length&&c.alternativeExpected.every(f=>f>=1&&f<=5)));
 }
});
test('FG-02E source disagreements are explicitly identified rather than silently marked wrong',()=>{
 assert.equal(heldout.secondarySource,'https://pianoscales.org/major.html');
 const disputed=cases.filter(c=>c.referenceAgreement==='published-variant');
 assert.equal(disputed.length,4);
 assert.equal(cases.filter(c=>c.referenceAgreement==='both-sources').length,30);
 assert.ok(disputed.every(c=>c.alternativeExpected&&c.variantReason));
 assert.ok(disputed.some(c=>c.id.includes('B-flat-RH')));
 assert.ok(disputed.some(c=>c.id.includes('F-sharp-LH-2oct')));
});
test('FG-02E published variant is counted as exact for either provider',()=>{
 const c=cases.find(c=>c.id==='major-B-flat-RH-1oct-ascending');
 assert.ok(c.alternativeExpected);
 const sample={...c,expected:c.alternativeExpected,alternativeExpected:c.expected};
 const r=heldoutCase(sample);
 assert.equal(r.noteCount,8);
 assert.ok(['EXACT_PUBLISHED','DIFFERENT','REJECTED','PHYSICAL_CONFLICT'].includes(r.status));
 // Check the metric against the returned notes rather than forcing a particular proposed fingering.
 if(r.actual){
  const matchesAlt=r.actual.every((v,i)=>v===c.expected[i]);
  const matchesPrimary=r.actual.every((v,i)=>v===c.alternativeExpected[i]);
  assert.equal(r.exactPublished,matchesAlt||matchesPrimary);
 }
});
test('FG-02E reference answers are never injected into an unannotated solver call',()=>{
 const c=cases.find(c=>c.id==='major-F-sharp-RH-1oct-ascending');
 const a=heldoutCase(c);
 const poisoned={...c,expected:Array(c.expected.length).fill(5),
  alternativeExpected:undefined};
 const b=heldoutCase(poisoned);
 assert.deepEqual(a.actual,b.actual);
 assert.equal(a.strategy,b.strategy);
});
test('FG-02E baseline and phrase outputs both explicitly report match and biomechanical validity',()=>{
 const r=runHeldoutBenchmark();
 assert.equal(r.baseline.length,34);
 assert.equal(r.phrase.length,34);
 for(const arr of [r.baseline,r.phrase]){
  for(const c of arr){
   assert.ok(['EXACT_PUBLISHED','DIFFERENT','REJECTED','PHYSICAL_CONFLICT'].includes(c.status));
   assert.ok(c.matchedPrimary>=0&&c.matchedPrimary<=c.noteCount);
   assert.ok(c.matchedBestPublished>=c.matchedPrimary&&c.matchedBestPublished<=c.noteCount);
   if(c.actual)assert.equal(c.actual.length,c.noteCount);
  }
 }
 assert.equal(r.stats.phrase.notes,314);
 assert.equal(r.stats.phrase.agreedCases,30);
});
test('FG-02E source-variant scenarios are excluded from strict consensus scoring',()=>{
 const r=runHeldoutBenchmark();
 const agreed=r.phrase.filter(x=>x.agreement==='both-sources');
 assert.equal(agreed.length,r.stats.phrase.agreedCases);
 assert.equal(r.stats.phrase.eligibleExactAgreed,agreed.filter(x=>x.exactPublished).length);
 assert.equal(r.stats.phrase.matchedNotesAgreed,agreed.reduce((n,x)=>n+x.matchedPrimary,0));
});
test('FG-02E author-anchored held-out inputs never silently change an accepted fixed finger',()=>{
 const r=runHeldoutBenchmark();
 for(const c of r.pinned){
  if(c.status!=='REJECTED'){
   assert.equal(c.anchorPreserved,true,c.id);
   assert.deepEqual(c.actual,c.expected,c.id);
  }
 }
 assert.equal(r.stats.pinned.authorAnchorViolations,0);
});
test('FG-02E report is fully deterministic, including all footnote source disagreements',()=>{
 assert.deepEqual(runHeldoutBenchmark(),runHeldoutBenchmark());
});
test('FG-02E output status must retain an explicit, non-overridable research-only release block',()=>{
 const r=runHeldoutBenchmark();
 assert.equal(r.researchGate.productionAutoFingeringAllowed,false);
 assert.equal(r.researchGate.musicalEvidenceSufficient,false);
 assert.equal(r.researchGate.minimumAgreedCaseAccuracy,.90);
 assert.ok(r.caveat.includes('not')||r.caveat.includes('Not'));
});
test('FG-02E source references do not appear in recognition patterns or expand known key coverage',()=>{
 const f=cases.find(c=>c.id==='major-F-RH-1oct-ascending');
 const notes=f.pitches.map((pitch,i)=>({pitch,start:i*.5,duration:.43,hand:f.hand}));
 const output=phrase(notes,{hand:'RH'});
 assert.equal(output.ok,true);
 assert.equal(output.strategy,'baseline');
});
test('FG-02E hand ownership conflict still fails closed on novel hold-out passages',()=>{
 const c=cases.find(c=>c.id==='major-B-RH-1oct-ascending');
 const notes=c.pitches.map((pitch,i)=>({pitch,start:i*.5,duration:.43,hand:i===3?'LH':'RH'}));
 const r=phrase(notes,{hand:'RH'});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'HAND_CONFLICT');
});
test('FG-02E independent audit catches physically impossible held-key reassignment',()=>{
 const a=[{pitch:60,start:0,duration:.9,hand:'RH'},
          {pitch:67,start:.25,duration:.5,hand:'RH'}];
 const bad=[{...a[0],finger:1},{...a[1],finger:1}];
 assert.equal(audit(a,bad).valid,false);
 assert.ok(audit(a,bad).violations.some(x=>x.code==='FINGER_REUSED_WHILE_HELD'));
});
