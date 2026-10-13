import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planNoteLanes} from '../src/audio/index.js';
const hasErrorCode=(code,details={})=>error=>error?.name==='EngineError'&&error.code===code&&
 Object.entries(details).every(([key,value])=>error[key]===value);

function note(noteId, start, end, {channel=0, pitch=60, sequence=0, offSequence=sequence+1, isDrum=false}={}){
 return [
  {type:'noteOn',time:start,channel,pitch,velocity:90,noteId,sequence,isDrum},
  {type:'noteOff',time:end,channel,pitch,velocity:0,noteId,sequence:offSequence,isDrum},
 ];
}

test('audio lane planner keeps FIFO-compatible notes together and splits crossing releases',async t=>{
 await t.test('notes whose offs follow their onsets need one FIFO lane',()=>{
  const events=[...note('first',0,1,{sequence:1}),...note('second',.2,1.2,{sequence:2,offSequence:3})];
  const plan=planNoteLanes(events);
  assert.deepEqual(plan.assignments.map(({noteId,lane})=>[noteId,lane]),[['first',0],['second',0]]);
  assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['0:60'],1);
  assert.equal(plan.diagnostics.lanesAllocated,1);
 });

 await t.test('a short later note cannot release an earlier long note on the same FIFO lane',()=>{
  const events=[...note('long',0,1,{sequence:1}),...note('short',.2,.5,{sequence:2,offSequence:3})];
  const plan=planNoteLanes(events);
  const assigned=Object.fromEntries(plan.assignments.map(item=>[item.noteId,item]));
  assert.notEqual(assigned.long.lane,assigned.short.lane);
  assert.equal(assigned.long.channel,assigned.short.channel,'logical score channel remains available for diagnostics');
  assert.equal(assigned.long.pitch,assigned.short.pitch);
  assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['0:60'],2);
  assert.equal(plan.diagnostics.splitNotes,1);
  assert.equal(plan.diagnostics.lanesAllocated,2);
 });

 await t.test('three overlapping notes receive the minimum two FIFO lanes',()=>{
  const events=[
   ...note('a',0,1,{sequence:1}),
   ...note('b',.1,.7,{sequence:2,offSequence:4}),
   ...note('c',.2,.9,{sequence:3,offSequence:5}),
  ];
  const plan=planNoteLanes(events);
  const assignment=Object.fromEntries(plan.assignments.map(item=>[item.noteId,item.lane]));
  assert.equal(new Set(Object.values(assignment)).size,2);
  assert.equal(assignment.a,0,'the longest FIFO-compatible chain keeps the original channel lane');
  assert.ok(assignment.b!==assignment.a||assignment.c!==assignment.a);
  assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['0:60'],2);
 });

 await t.test('planner validates the entire note identity graph before returning a partial plan',()=>{
  const duplicate=[...note('same',0,.4),...note('same',.1,.5,{sequence:2,offSequence:3})];
  assert.throws(()=>planNoteLanes(duplicate),hasErrorCode('NOTE_ID_DUPLICATE'));
  const dangling=[{type:'noteOn',time:0,channel:0,pitch:60,noteId:'open',sequence:1}];
  assert.throws(()=>planNoteLanes(dangling),hasErrorCode('NOTE_ID_DANGLING'));
  const mismatched=[
   {type:'noteOn',time:0,channel:0,pitch:60,velocity:90,noteId:'wrong-channel',sequence:1},
   {type:'noteOff',time:1,channel:1,pitch:60,velocity:0,noteId:'wrong-channel',sequence:2},
  ];
  assert.throws(()=>planNoteLanes(mismatched),hasErrorCode('NOTE_ID_MISMATCH'));
 });

 await t.test('capacity exhaustion and drum exclusivity are explicit diagnostics',()=>{
  const crossing=[...note('long',0,1,{sequence:1}),...note('short',.2,.5,{sequence:2,offSequence:3})];
  assert.throws(()=>planNoteLanes(crossing,{maxLanesPerPitch:1}),hasErrorCode('NOTE_LANE_CAPACITY_EXCEEDED',
   {channel:0,pitch:60,required:2,max:1}));
  const drumCrossing=[...note('drum-long',0,1,{channel:9,pitch:36,sequence:1,isDrum:true}),
   ...note('drum-short',.2,.5,{channel:9,pitch:36,sequence:2,offSequence:3,isDrum:true})];
  assert.throws(()=>planNoteLanes(drumCrossing),hasErrorCode('DRUM_NOTE_ID_UNSUPPORTED'));
 });

 await t.test('reset controls split the plan into independent note identity segments',()=>{
  const events=[
   ...note('before-reset',0,1,{sequence:1}),
   {type:'cc',time:.3,channel:0,controller:123,value:0,sequence:3},
   ...note('after-reset',.4,.7,{sequence:4,offSequence:5}),
  ];
  const plan=planNoteLanes(events);
  assert.equal(plan.diagnostics.resetSegments,1);
  assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['0:60'],1,
   'a channel reset makes later notes independent of the pre-reset FIFO voice');
 });
});
