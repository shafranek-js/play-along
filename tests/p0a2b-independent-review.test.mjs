import test from 'node:test';
import assert from 'node:assert/strict';
import {makeP0A2bBlindPacket,adjudicateP0A2b,evaluateP0A2bEngines,
 validateP0A2bStudy}from '../src/core/p0a2b-independent-review.mjs';
const hash='a'.repeat(64);
const source=(overrides={})=>({
 schema:'p0a2b-curated-source-v1',cohortId:'piece-a',groupId:'composer-a',
 split:'development',handMode:'supplied-hands',rightsStatus:'verified-by-owner',
 scoreSha256:hash,
 notes:[
  {noteId:'p1:0',pitch:60,start:0,duration:.5,hand:'RH',tags:['chord','inversion']},
  {noteId:'p1:1',pitch:64,start:0,duration:.5,hand:'RH',tags:['chord','inversion']},
  {noteId:'p1:2',pitch:62,start:.5,duration:.1,hand:'RH',tags:['repeated-note']},
  {noteId:'p1:3',pitch:48,start:0,duration:.8,hand:'LH',tags:['held-voice']}
 ],
 ...overrides
});
const packet=()=>makeP0A2bBlindPacket(source()).packet;
const makeReview=(p,code,fingers,role='independent')=>({
 schema:'p0a2b-blind-review-v1',cohortId:p.cohortId,
 packetSha256:p.packetSha256,reviewerCode:code,role,blindToAlgorithms:true,
 decisions:p.notes.map((n,i)=>({noteId:n.noteId,uncertain:false,
  acceptable:fingers[i].map(f=>({hand:n.hand,finger:f})),
  ...(role==='adjudicator'?{rationale:'Examined physical technique and accepted alternate.'}:{})}))
});
const proposals=(p,fingers)=>p.notes.map((n,i)=>({
 noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
 hand:n.hand,finger:fingers[i]}));
test('packet strips all fingering answers, tracks source SHA and keeps technique categories',()=>{
 const sourceInput=source(),snapshot=structuredClone(sourceInput);
 const r=makeP0A2bBlindPacket(sourceInput);
 assert.equal(r.ok,true);assert.equal(r.packet.notes.length,4);
 assert.equal(r.packet.containsFingerAnswers,false);
 assert.equal(r.packet.containsEnginePredictions,false);
 assert.equal(r.packet.notes[0].tags.includes('inversion'),true);
 assert.ok(!JSON.stringify(r.packet).includes('referenceFinger'));
 assert.deepEqual(sourceInput,snapshot);
 assert.equal(r.packet.packetSha256.length,64);
});
test('unlicensed, answer-leaking, unknown hand or invalid technique source fails closed',()=>{
 const bad=source();bad.notes[0].finger=3;
 assert.equal(makeP0A2bBlindPacket(bad).reason,'INVALID_OR_LEAKING_SOURCE_NOTE');
 const badRights=source({rightsStatus:'unspecified'});
 assert.equal(makeP0A2bBlindPacket(badRights).reason,'INVALID_OR_UNAUTHORIZED_SOURCE');
 const badTags=source();badTags.notes[1].tags=['invented'];
 assert.equal(makeP0A2bBlindPacket(badTags).reason,'INVALID_OR_LEAKING_SOURCE_NOTE');
 const blind=source({handMode:'blind-hands'}); // hand cannot be included
 assert.equal(makeP0A2bBlindPacket(blind).ok,false);
});
test('only two distinct blind reviewer responses can create an agreed reference',()=>{
 const p=packet(),f=[[1],[3],[2],[5]],r1=makeReview(p,'expert-one',f),r2=makeReview(p,'expert-two',f);
 const result=adjudicateP0A2b(p,[r1,r2]);
 assert.equal(result.ok,true);
 assert.equal(result.status,'LABELS_ADJUDICATED');
 assert.equal(result.stats.agreed,4);assert.equal(result.stats.disputed,0);
 assert.equal(result.accepted.size,4);
 assert.equal(result.productionEligible,false);
 assert.equal(result.independentlyValidated,false);
 assert.equal(result.reviewerIndependenceExternallyVerified,false);
 assert.equal(adjudicateP0A2b(p,[r1,r1]).reason,'DUPLICATE_REVIEWER');
 assert.equal(adjudicateP0A2b(p,[r1]).reason,'TWO_REVIEWS_REQUIRED');
});
test('disputed notes abstain unless different adjudicator explicitly reviews them',()=>{
 const p=packet(),a=makeReview(p,'one',[[1],[3],[2],[5]]),b=makeReview(p,'two',[[1],[2],[2],[5]]);
 const unresolved=adjudicateP0A2b(p,[a,b]);
 assert.equal(unresolved.ok,true);assert.equal(unresolved.status,'REVIEW_INCOMPLETE');
 assert.equal(unresolved.stats.unresolved,1);assert.equal(unresolved.accepted.size,3);
 const third=makeReview(p,'three',[[1],[2],[2],[5]],'adjudicator');
 const resolved=adjudicateP0A2b(p,[a,b],{adjudicator:third});
 assert.equal(resolved.ok,true);assert.equal(resolved.stats.adjudicated,1);
 assert.equal(resolved.accepted.get('p1:1').has('RH:2'),true);
 assert.equal(adjudicateP0A2b(p,[a,b],{adjudicator:{...third,reviewerCode:'one'}}).reason,
  'ADJUDICATOR_NOT_INDEPENDENT');
});
test('compatible alternative finger sets count as acceptable rather than unique answer',()=>{
 const p=packet(),r1=makeReview(p,'one',[[1,2],[3],[2],[5]]),
 r2=makeReview(p,'two',[[2,4],[3],[2],[5]]);
 const adjudication=adjudicateP0A2b(p,[r1,r2]);
 assert.equal(adjudication.accepted.get('p1:0').size,1);
 const pa=proposals(p,[2,3,2,5]),pm=proposals(p,[1,3,2,5]);
 const scored=evaluateP0A2bEngines(p,adjudication,{playAlong:pa,pianoMotion:pm});
 assert.equal(scored.ok,true);
 assert.equal(scored.engines.playAlong.acceptable,4);
 assert.equal(scored.engines.pianoMotion.acceptable,3);
 assert.equal(scored.engines.playAlong.byTechnique.chord.eligible,2);
 assert.equal(scored.engines.playAlong.byTechnique.chord.acceptable,2);
 assert.equal(scored.engines.playAlong.byHand.RH.eligible,3);
 assert.equal(scored.scoredNotes,4);
 assert.equal(scored.noteFingerVectorsDisclosed,false);
});
test('refused notes are excluded from assessed denominator; missing predictions count as abstain',()=>{
 const p=packet(),a=makeReview(p,'one',[[1],[3],[2],[5]]),
 b=makeReview(p,'two',[[1],[2],[2],[5]]),adj=adjudicateP0A2b(p,[a,b]);
 const score=evaluateP0A2bEngines(p,adj,{
  playAlong:proposals(p,[1,3,2,5]).slice(0,3),
  pianoMotion:proposals(p,[1,3,2,5]).slice(0,2)});
 assert.equal(score.ok,true);
 assert.equal(score.status,'REVIEW_INCOMPLETE');
 assert.equal(score.scoredNotes,3);
 assert.equal(score.engines.playAlong.eligible,3);
 assert.equal(score.engines.playAlong.proposed,2);
 assert.equal(score.engines.playAlong.abstained,1);
 assert.equal(score.engines.pianoMotion.proposed,1);
 assert.equal(score.engines.pianoMotion.coveragePct,33.33);
 assert.equal(score.productionEligible,false);
});
test('engine source tampering / duplicate ID and altered source event refuse atomically',()=>{
 const p=packet(),f=[[1],[3],[2],[5]];
 const a=adjudicateP0A2b(p,[makeReview(p,'one',f),makeReview(p,'two',f)]);
 const original=proposals(p,[1,3,2,5]);
 const swapped=original.map(x=>({...x}));swapped[0].pitch=61;
 assert.equal(evaluateP0A2bEngines(p,a,{playAlong:swapped,pianoMotion:original}).reason,
  'ENGINE_SOURCE_IDENTITY_OR_HAND_MISMATCH');
 const duplicate=original.map(x=>({...x}));duplicate[1].noteId=duplicate[0].noteId;
 assert.equal(evaluateP0A2bEngines(p,a,{playAlong:duplicate,pianoMotion:original}).ok,false);
 const badHand=original.map(x=>({...x}));badHand[0].hand='LH';
 assert.equal(evaluateP0A2bEngines(p,a,{playAlong:badHand,pianoMotion:original}).ok,false);
 const tampered={...p,scoreSha256:'b'.repeat(64)};
 assert.equal(evaluateP0A2bEngines(tampered,a,{playAlong:original,pianoMotion:original}).reason,
  'EVALUATION_SOURCE_OR_REVIEW_MISMATCH');
});
test('blind-hand packet omits hand labels and can measure hand separation separately',()=>{
 const s=source({handMode:'blind-hands'});
 s.notes=s.notes.map(({hand,...n})=>n);
 const result=makeP0A2bBlindPacket(s);assert.equal(result.ok,true);
 assert.equal(result.packet.notes.every(n=>!('hand'in n)),true);
 const p=result.packet;
 const f=[[1],[3],[2],[5]];
 const hand=['RH','RH','RH','LH'];
 const mk=(code)=>({...makeReview({...p,notes:p.notes.map((n,i)=>({...n,hand:hand[i]}))},code,f),
  packetSha256:p.packetSha256});
 const a=adjudicateP0A2b(p,[mk('one'),mk('two')]);
 assert.equal(a.ok,true);
 const prediction=p.notes.map((n,i)=>({...n,hand:hand[i],finger:f[i][0]}));
 prediction[0].hand='LH';
 const out=evaluateP0A2bEngines(p,a,{playAlong:prediction,pianoMotion:prediction});
 assert.equal(out.ok,true);assert.equal(out.engines.playAlong.acceptable,3);
});
test('study refuses development/heldout leakage by group, reusing source or note identity',()=>{
 const dev=packet(),held=makeP0A2bBlindPacket(source({
  cohortId:'piece-b',groupId:'composer-a',split:'heldout',scoreSha256:'b'.repeat(64)
 })).packet;
 assert.equal(validateP0A2bStudy([dev,held]).reason,'DEVELOPMENT_HELDOUT_GROUP_LEAKAGE');
 const second=makeP0A2bBlindPacket(source({
  cohortId:'piece-b',groupId:'composer-b',split:'heldout',scoreSha256:'b'.repeat(64)
 })).packet;
 const pass=validateP0A2bStudy([dev,second]);
 assert.equal(pass.ok,true);assert.equal(pass.heldout,1);
 assert.equal(pass.independentExpertsAvailable,false);
 assert.equal(validateP0A2bStudy([dev,dev]).reason,'DUPLICATE_SOURCE_IN_STUDY');
});
