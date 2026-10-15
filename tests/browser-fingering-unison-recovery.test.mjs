import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserFingeringResearch as calculate,
 prepareBrowserFingeringUnisons as screen} from '../src/core/browser-fingering-research.mjs';

const note=(id,pitch,start,duration,hand='RH',rest={})=>({
 noteId:'xml:'+id,pitch,start,duration,hand,...rest
});

test('Beam Search recovers three distinct-time unisons without touching source notes',()=>{
 const notes=[
  note('d-held',62,0,4,'RH',{staff:'1',voice:'2'}),
  note('d-repeat',62,2.5,1.5,'RH',{staff:'1',voice:'1'}),
  note('f-held',65,10,3,'RH',{staff:'1',voice:'2'}),
  note('f-repeat',65,12,1,'LH',{staff:'2',voice:'5'}),
  note('a-held',69,20,3,'RH',{staff:'1',voice:'2'}),
  note('a-repeat',69,22.5,.25,'RH',{staff:'1',voice:'1'}),
  note('lh1',48,0,1,'LH'),
  note('lh2',43,10,1,'LH'),
  note('lh3',45,20,1,'LH')
 ];
 const original=structuredClone(notes);
 const prepared=screen(notes);
 assert.equal(prepared.ok,true,JSON.stringify(prepared));
 assert.equal(prepared.notes.length,6);
 assert.deepEqual(prepared.omitted.map(n=>n.noteId),
  ['xml:d-repeat','xml:f-repeat','xml:a-repeat']);
 assert.equal(prepared.omitted[1].staff,'2');
 assert.equal(prepared.omitted[1].voice,'5');
 const result=calculate({notes});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.noteCount,9);
 assert.equal(result.eligibleCount,6);
 assert.equal(result.omittedCount,3);
 assert.equal(result.models.legacy.status,'computed',JSON.stringify(result));
 assert.equal(result.models.anatomical.status,'computed',JSON.stringify(result));
 const forbidden=new Set(prepared.omitted.map(n=>n.noteId));
 for(const model of ['legacy','anatomical']){
  assert.equal(result.models[model].candidates.length,6);
  assert.ok(result.models[model].candidates.every(n=>!forbidden.has(n.noteId)));
 }
 assert.deepEqual(notes,original,'score events and author notation must not change');
});

test('Beam Search retains valid same-onset same-hand unisons as one physical key',()=>{
 const notes=[note('v1',60,0,.6),note('v2',60,0,.4),
  note('third',64,0,.4)];
 const prepared=screen(notes);
 assert.equal(prepared.omitted.length,0);
 const result=calculate({notes});
 assert.equal(result.models.legacy.status,'computed',JSON.stringify(result));
 assert.equal(result.models.legacy.proposed,3);
 assert.equal(result.models.legacy.candidates[0].finger,
  result.models.legacy.candidates[1].finger);
});

test('Beam Search declines cross-hand co-onset same-key ambiguity',()=>{
 const notes=[note('rh',60,0,.5,'RH'),note('lh',60,0,.5,'LH')];
 const report=calculate({notes});
 assert.equal(report.ok,false);
 assert.equal(report.reason,'AMBIGUOUS_CROSS_HAND_SAME_ONSET_UNISON');
});

test('Beam Search preserves annotated excluded note and rejects impossible physical islands',()=>{
 const notes=[
  note('held',62,0,2,'RH'),
  note('author-restrike',62,1,.3,'RH',{authorFinger:3}),
  note('other',65,2.5,.25,'RH')
 ];
 const saved=structuredClone(notes),result=calculate({notes});
 assert.equal(result.ok,true);
 assert.equal(result.anchored,1);
 assert.equal(result.omittedCount,1);
 assert.ok(!result.models.legacy.candidates.some(n=>n.noteId==='xml:author-restrike'));
 assert.deepEqual(notes,saved);
 const impossible=[note('c',60,0,.4,'RH',{authorFinger:1}),
   note('e',64,0,.4,'RH',{authorFinger:1})];
 const bad=calculate({notes:impossible});
 assert.equal(bad.ok,true);
 assert.equal(bad.models.legacy.status,'refused');
 assert.equal(bad.models.anatomical.status,'refused');
 assert.equal(bad.omittedCount,0);
});
