import test from 'node:test';
import assert from 'node:assert/strict';
import {FINGER_HISTORY_LIMIT,fingerHistoryEmpty,fingerHistoryTransition,fingerHistorySame}
 from '../src/core/finger-override-history.mjs';

const id=i=>'xml:P1:0:0:'+i;
const val=(finger,hand='RH')=>({finger,hand});
const edit=(history,i,before,after)=>fingerHistoryTransition(history,'edit',{id:id(i),before,after});

test('FG-03C2B1 multi-note edit, undo and redo preserve chronological ordering',()=>{
 let h=fingerHistoryEmpty();
 const a=edit(h,1,null,val(2));assert.equal(a.expected,null);h=a.history;
 const b=edit(h,2,null,val(4,'LH'));h=b.history;
 assert.equal(h.past.length,2);assert.equal(h.future.length,0);
 const u1=fingerHistoryTransition(h,'undo');h=u1.history;
 assert.equal(u1.step.id,id(2));assert.equal(u1.value,null);assert.deepEqual(u1.expected,val(4,'LH'));
 const u2=fingerHistoryTransition(h,'undo');h=u2.history;
 assert.equal(u2.step.id,id(1));assert.equal(h.past.length,0);assert.equal(h.future.length,2);
 const r1=fingerHistoryTransition(h,'redo');h=r1.history;
 assert.equal(r1.step.id,id(1));assert.deepEqual(r1.value,val(2));
 const r2=fingerHistoryTransition(h,'redo');h=r2.history;
 assert.equal(r2.step.id,id(2));assert.deepEqual(r2.value,val(4,'LH'));
 assert.equal(h.past.length,2);assert.equal(h.future.length,0);
 assert.equal(fingerHistoryTransition(h,'redo'),null);
});
test('FG-03C2B1 a new manual edit after undo clears redo branch',()=>{
 let h=fingerHistoryEmpty();
 h=edit(h,1,null,val(1)).history;
 h=edit(h,2,null,val(2)).history;
 h=fingerHistoryTransition(h,'undo').history;
 assert.equal(h.future.length,1);
 h=edit(h,3,null,val(3)).history;
 assert.equal(h.future.length,0);
 assert.equal(fingerHistoryTransition(h,'redo'),null);
});
test('FG-03C2B1 no-op edits do not create history, source reset is undoable',()=>{
 const empty=fingerHistoryEmpty();
 assert.equal(edit(empty,1,null,null),null);
 assert.equal(edit(empty,1,val(2),val(2)),null);
 const h=edit(empty,1,val(5,'LH'),null).history;
 const redo=fingerHistoryTransition(fingerHistoryTransition(h,'undo').history,'redo');
 assert.equal(redo.value,null);assert.deepEqual(redo.step.before,val(5,'LH'));
});
test('FG-03C2B1 bounded history cannot grow unbounded or retain discarded redo states',()=>{
 let h=fingerHistoryEmpty();
 for(let i=1;i<100;i++)h=edit(h,i,null,val(i%5+1)).history;
 assert.equal(h.past.length,FINGER_HISTORY_LIMIT);
 assert.equal(h.past[0].id,id(100-FINGER_HISTORY_LIMIT));
 for(let i=0;i<FINGER_HISTORY_LIMIT;i++)h=fingerHistoryTransition(h,'undo').history;
 assert.equal(h.future.length,FINGER_HISTORY_LIMIT);
 assert.equal(h.past.length,0);
});
test('FG-03C2B1 invalid choices, mutable caller input and authorship safeguards',()=>{
 const before=val(2,'LH'),after=val(5,'RH');
 const transition=edit(fingerHistoryEmpty(),1,before,after);
 after.finger=1;before.finger=4;
 assert.deepEqual(transition.step.after,val(5,'RH'));
 assert.deepEqual(transition.step.before,val(2,'LH'));
 assert.equal(fingerHistoryTransition(fingerHistoryEmpty(),'edit',
  {id:id(1),before:null,after:{finger:7,hand:'RH'}}),null);
 assert.equal(fingerHistorySame(null,null),true);
 assert.equal(fingerHistorySame(null,val(1)),false);
});
