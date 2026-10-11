import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';
import {references,runBenchmark,benchmarkReference} from '../scripts/fingering-benchmark.mjs';

const n=(pitch,start=0,duration=.6,finger=null,hand='RH')=>({pitch,start,duration,hand,...(finger==null?{}:{finger})});
const out=(pitch,start,duration,finger,hand='RH')=>({pitch,start,duration,finger,hand});
test('FG-02C reference dataset: 20 sourced scenarios with exact pitches and finger sequences',()=>{
 assert.equal(references.cases.length,20);
 const ids=new Set();
 for(const x of references.cases){
  assert.ok(!ids.has(x.id));ids.add(x.id);
  assert.ok(/^https:\/\//.test(x.source));
  assert.ok(['mono','poly'].includes(x.engine));
  assert.ok(['RH','LH'].includes(x.hand));
  assert.equal(x.expected.length,x.pitches.length);
  assert.ok(x.expected.every(f=>Number.isInteger(f)&&f>=1&&f<=5));
  assert.ok(x.pitches.every(n=>Number.isInteger(n)&&n>=21&&n<=108));
 }
});
test('FG-02C auditor accepts explicit root-position C major chord',()=>{
 const input=[n(60),n(64),n(67)];
 const res=audit(input,[out(60,0,.6,1),out(64,0,.6,3),out(67,0,.6,5)]);
 assert.deepEqual(res,{valid:true,violations:[]});
});
test('FG-02C auditor detects reusing one finger on two simultaneous keys',()=>{
 const r=audit([n(60),n(64)],[out(60,0,.6,1),out(64,0,.6,1)]);
 assert.ok(r.violations.some(x=>x.code==='FINGER_REUSED_WHILE_HELD'));
});
test('FG-02C auditor detects reversed finger order for RH',()=>{
 const r=audit([n(60),n(64)],[out(60,0,.6,5),out(64,0,.6,1)]);
 assert.ok(r.violations.some(x=>x.code==='CROSSING_HELD_FINGERS'));
});
test('FG-02C auditor detects reversed finger order for LH',()=>{
 const i=[n(48,0,.6,null,'LH'),n(52,0,.6,null,'LH')];
 const r=audit(i,[out(48,0,.6,1,'LH'),out(52,0,.6,5,'LH')]);
 assert.ok(r.violations.some(x=>x.code==='CROSSING_HELD_FINGERS'));
});
test('FG-02C auditor catches impossible model stretch',()=>{
 const r=audit([n(48),n(76)],[out(48,0,.6,1),out(76,0,.6,5)]);
 assert.ok(r.violations.some(x=>x.code==='STRETCH_EXCEEDS_MODEL'));
});
test('FG-02C auditor preserves MusicXML/user anchors',()=>{
 const r=audit([n(60,0,.6,1)],[out(60,0,.6,2)]);
 assert.ok(r.violations.some(x=>x.code==='ANCHOR_CHANGED'));
});
test('FG-02C auditor detects reassigned hands',()=>{
 const r=audit([n(60,0,.6,null,'LH')],[out(60,0,.6,3,'RH')]);
 assert.ok(r.violations.some(x=>x.code==='HAND_CHANGED'));
});
test('FG-02C auditor detects changed pitch, onset and duration',()=>{
 const r=audit([n(60,0,.6)],[out(61,.2,.3,1)]);
 assert.ok(r.violations.some(x=>x.code==='MUSIC_EVENT_CHANGED'));
});
test('FG-02C auditor accepts same-onset unison voices with identical finger',()=>{
 const r=audit([n(60),n(60)],[out(60,0,.6,1),out(60,0,.6,1)]);
 assert.equal(r.valid,true);
});
test('FG-02C auditor rejects dissonant finger numbers on same physical unison',()=>{
 const r=audit([n(60),n(60)],[out(60,0,.6,1),out(60,0,.6,2)]);
 assert.ok(r.violations.some(x=>x.code==='SAME_KEY_UNISON_SPLIT'));
});
test('FG-02C auditor rejects held-key reattack, allows re-articulation after release',()=>{
 const input=[n(60,0,.8),n(60,.3,.4)];
 assert.ok(audit(input,[out(60,0,.8,1),out(60,.3,.4,1)]).violations.some(x=>x.code==='HELD_KEY_REATTACK'));
 const released=[n(60,0,.3),n(60,.4,.3)];
 assert.equal(audit(released,[out(60,0,.3,1),out(60,.4,.3,1)]).valid,true);
});
test('FG-02C auditor reports invalid hand, hand size and length mismatch',()=>{
 assert.ok(audit([n(60)],[out(60,0,.6,1,'NA')]).violations.some(x=>x.code==='UNASSIGNED_OR_INVALID_FINGER'));
 assert.ok(audit([n(60)],[],{}).violations.some(x=>x.code==='OUTPUT_LENGTH_MISMATCH'));
 assert.ok(audit([n(60)],[out(60,0,.6,1)],{handSize:'INVALID'}).violations.some(x=>x.code==='INVALID_HAND_SIZE'));
});
test('FG-02C reference comparison is deterministic and never fabricates matching',()=>{
 const a=runBenchmark(),b=runBenchmark();
 assert.deepEqual(a,b);
 assert.equal(a.totals.cases,20);
 assert.equal(a.totals.exactCases+a.totals.differentCandidates+a.totals.rejected+a.totals.physicalConflicts,20);
 assert(a.totals.matchPercent>=0&&a.totals.matchPercent<=100);
 assert(a.cases.every(x=>['EXACT','DIFFERENT_VALID_CANDIDATE','REJECTED','PHYSICAL_CONFLICT'].includes(x.status)));
});
test('FG-02C author-pinned references preserve every finger if feasible',()=>{
 const output=runBenchmark({useAnchors:true});
 assert.equal(output.totals.cases,20);
 // An algorithm may reasonably refuse an unplayable source; it must never
 // substitute an invented finger in place of an explicit source anchor.
 assert.equal(output.totals.physicalConflicts,0);
 assert.equal(output.totals.differentCandidates,0);
 assert.equal(output.totals.matchedNotes,output.totals.referenceNotes-output.cases.filter(c=>c.status==='REJECTED').reduce((n,c)=>n+c.total,0));
});
test('FG-02C chord goldens and all raw output are physically audited independently',()=>{
 for(const x of references.cases){
  const r=benchmarkReference(x);
  assert.notEqual(r.status,'PHYSICAL_CONFLICT',x.id+' '+JSON.stringify(r.audit));
 }
});
