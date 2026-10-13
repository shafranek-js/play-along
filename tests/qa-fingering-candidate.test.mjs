/**
 * QA-01 independent acceptance adapter for Fingering AI research candidate.
 * This file deliberately does not make the candidate a dependency of main.
 * On a QA-only branch, cases SKIP (not PASS). On an integration branch
 * including the candidate, all cases become mandatory automatically.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const target=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
 '../src/core/fingering-hand-separation.mjs');
const available=existsSync(target);
const separate=available
 ? (await import('../src/core/fingering-hand-separation.mjs')).separateHandsResearch
 : null;
const options={skip:!available&&'candidate not included in the QA-only branch'};
const note=(noteId,pitch,start,duration,extra={})=>
 ({noteId,pitch,start,duration,...extra});

test('QA-01 candidate: author/source/user precedence and immutable inputs',options,()=>{
 const input=[
  note('auth',64,0,.4,{authorHand:'RH',finger:2}),
  note('override',48,0,.4,{authorHand:'RH',userHand:'LH',finger:5})
 ];
 const before=structuredClone(input);
 const result=separate(input);
 assert.equal(result.ok,true);
 assert.deepEqual(input,before);
 assert.deepEqual(result.items.map(x=>[x.noteId,x.hand,x.source]),
  [['auth','RH','author'],['override','LH','user']]);
 assert.equal(result.productionEligible,false);
 assert.equal(result.expertValidated,false);
 assert.ok(result.items.every(x=>x.confidence===null));
});

test('QA-01 candidate: held identical key across voices must refuse generated hands',options,()=>{
 const input=[
  note('v1',60,0,1,{partId:'P1',staff:1,voice:1}),
  note('v2',60,.25,.5,{partId:'P1',staff:1,voice:2}),
  note('independent',84,0,.25)
 ];
 const result=separate(input);
 assert.equal(result.ok,true);
 assert.equal(result.summary.proposed,0);
 assert.equal(result.summary.unknown,3);
 assert.ok(result.diagnostics.some(x=>x.code==='SAME_KEY_OVERLAP'));
});

test('QA-01 candidate: oversized anchored stretch keeps fixed labels but refuses inference',options,()=>{
 const input=[
  note('left',36,0,1,{authorHand:'RH'}),
  note('right',84,0,1,{userHand:'RH'}),
  note('unfixed',72,.2,.3)
 ];
 const result=separate(input,{handSize:'XXS'});
 assert.equal(result.ok,true);
 assert.equal(result.summary.proposed,0);
 assert.equal(result.summary.unknown,1);
 assert.deepEqual(result.items.slice(0,2).map(x=>x.status),['fixed','fixed']);
 assert.ok(result.diagnostics.some(x=>x.code==='NO_FEASIBLE_HAND_PATH'));
});

test('QA-01 candidate: deterministic identity-preserving independent two-hand phrase',options,()=>{
 const input=[
  note('R0',72,0,.2,{authorHand:'RH',partId:'P1',staff:1,voice:1}),
  note('L0',48,0,.2,{authorHand:'LH',partId:'P1',staff:2,voice:2}),
  note('L1',50,.5,.2,{partId:'P1',staff:2,voice:2}),
  note('R1',74,.5,.2,{partId:'P1',staff:1,voice:1})
 ];
 const a=separate(input),b=separate([...input].reverse());
 assert.equal(a.ok,true);
 assert.equal(a.summary.total,input.length);
 assert.deepEqual(new Set(a.items.map(x=>x.noteId)),new Set(input.map(x=>x.noteId)));
 assert.deepEqual(Object.fromEntries(a.items.map(x=>[x.noteId,x.hand])),
  Object.fromEntries(b.items.map(x=>[x.noteId,x.hand])));
 assert.deepEqual(Object.fromEntries(a.items.map(x=>[x.noteId,x.hand])),
  {R0:'RH',L0:'LH',L1:'LH',R1:'RH'});
 assert.equal(a.productionEligible,false);
});
