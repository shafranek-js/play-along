import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerSelectableNotes,fingerSelectUpdate,fingerSelectRectangle,fingerBulkChoice}
 from '../src/core/finger-note-selection.mjs';
import {fingerHistoryEmpty,fingerHistoryTransition} from '../src/core/finger-override-history.mjs';
import {fingerOverrideValidate,fingerOverrideEffective} from '../src/core/finger-overrides.mjs';

const mk=(noteId,pitch,start,finger=null)=>({
 noteId,pitch,start,duration:.5,finger,fingeringSource:finger?'musicxml':null});
const score={tracks:[{notes:[mk('xml:A:0:0:1',60,0,1),mk('xml:A:0:0:2',64,0,3),
 mk('xml:A:0:0:3',62,2,null)]},{notes:[mk('xml:B:1:0:1',48,0,5)]}]};
const order=fingerSelectableNotes(score);
const ids=order.map(x=>x.id);
test('FG multi select: canonical note order is onset/track/source ordinal, including unisons',()=>{
 assert.deepEqual(ids,['xml:A:0:0:1','xml:A:0:0:2','xml:B:1:0:1','xml:A:0:0:3']);
 assert.deepEqual(fingerSelectableNotes(score).map(n=>n.id),ids);
});
test('FG multi select: click, Shift contiguous range, Ctrl toggle non-adjacent, Ctrl+Shift union',()=>{
 let state=fingerSelectUpdate(order,new Set(),ids[0],null);
 assert.deepEqual(state.selected,[ids[0]]);
 state=fingerSelectUpdate(order,new Set(state.selected),ids[3],state.anchor,{shift:true});
 assert.deepEqual(state.selected,ids);
 state=fingerSelectUpdate(order,new Set(state.selected),ids[1],state.anchor,{toggle:true});
 assert.deepEqual(state.selected,[ids[0],ids[2],ids[3]]);
 state=fingerSelectUpdate(order,new Set(state.selected),ids[1],state.anchor,{toggle:true});
 assert.deepEqual(state.selected,ids);
 const merged=fingerSelectUpdate(order,new Set([ids[0]]),ids[3],ids[1],
  {shift:true,toggle:true});
 assert.deepEqual(merged.selected,ids);
});
test('FG multi select: rectangle intersects actual painted notes, not pitch guesses',()=>{
 const box=[
  {n:{noteId:ids[0]},x:5,y:15,w:10,h:30},
  {n:{noteId:ids[1]},x:25,y:15,w:10,h:30},
  {n:{noteId:ids[2]},x:45,y:65,w:12,h:10}
 ];
 assert.deepEqual(fingerSelectRectangle(box,{x1:32,y1:50,x2:0,y2:0}),[ids[0],ids[1]]);
 assert.deepEqual(fingerSelectRectangle(box,{x1:25,y1:13,x2:60,y2:70},
  {ids:new Set([ids[0],ids[2]])}),[ids[2]]);
});
test('FG bulk: assigning a hand preserves different authored fingers, unknown notes remain unnumbered',()=>{
 const author=score.tracks[0].notes[0],blank=score.tracks[0].notes[2];
 assert.deepEqual(fingerBulkChoice(author,null,{finger:undefined,hand:'LH'}),
  {finger:1,hand:'LH'});
 assert.deepEqual(fingerBulkChoice(blank,null,{finger:undefined,hand:'LH'}),
  {finger:null,hand:'LH'});
 assert.equal(fingerBulkChoice(author,null,{finger:undefined,hand:undefined}),null);
 assert.equal(author.finger,1);
 assert.equal(blank.finger,null);
 const work='xml:57:0123456789abcdef';
 const validated=fingerOverrideValidate({[work]:{
  [author.noteId]:{finger:1,hand:'LH'},[blank.noteId]:{finger:null,hand:'LH'}
 }},{strict:true});
 assert.deepEqual(fingerOverrideEffective(blank,validated[work][blank.noteId]),
  {finger:null,hand:'LH',source:'user'});
});
test('FG bulk: one action for multiple distinct notes, undo and redo atomically',()=>{
 const entries=[
 {id:ids[0],before:null,after:{finger:1,hand:'LH'}},
 {id:ids[1],before:null,after:{finger:3,hand:'LH'}},
 {id:ids[3],before:null,after:{finger:null,hand:'LH'}}
 ];
 let change=fingerHistoryTransition(fingerHistoryEmpty(),'batch',{entries});
 assert.equal(change.history.past.length,1);
 assert.equal(change.changes.length,3);
 assert.deepEqual(change.changes.map(e=>e.value.finger),[1,3,null]);
 let undo=fingerHistoryTransition(change.history,'undo');
 assert.equal(undo.history.past.length,0);
 assert.equal(undo.history.future.length,1);
 assert.ok(undo.changes.every(e=>e.value===null));
 let redo=fingerHistoryTransition(undo.history,'redo');
 assert.equal(redo.history.past.length,1);
 assert.deepEqual(redo.changes.map(e=>e.value.hand),['LH','LH','LH']);
 assert.equal(fingerHistoryTransition(redo.history,'batch',{entries:[entries[0],entries[0]]}),null,
  'Duplicate source ID in one transaction must fail');
});
