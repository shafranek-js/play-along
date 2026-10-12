import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerGuidanceTimeline} from '../src/core/finger-guidance-timeline.mjs';
const note=(pitch,start,finger=null,extra={})=>({pitch,start,duration:.25,hand:'RH',
 finger,source:finger==null?null:'musicxml',track:0,...extra});

test('FG-03A complete authored notes and original note IDs survive unchanged',()=>{
 const src=[note(60,0,1,{noteId:'xml:0'}),note(64,0,3,{noteId:'xml:1'})];
 const before=structuredClone(src);
 const result=fingerGuidanceTimeline(src);
 assert.deepEqual(src,before);
 assert.equal(result.length,1);
 assert.deepEqual({count:result[0].totalNotes,complete:result[0].complete},
  {count:2,complete:true});
 assert.deepEqual(result[0].notes.map(n=>n.noteId),['xml:0','xml:1']);
});
test('FG-03A unannotated intervening notes are retained as silent guidance fences',()=>{
 const timeline=fingerGuidanceTimeline([note(60,0,1),note(62,.25),note(64,.5,3)]);
 assert.deepEqual(timeline.map(g=>g.start),[0,.25,.5]);
 assert.deepEqual(timeline.map(g=>g.notes.length),[1,0,1]);
 assert.deepEqual(timeline.map(g=>g.complete),[true,false,true]);
});
test('FG-03A partially annotated chord cannot masquerade as a complete hand shape',()=>{
 const timeline=fingerGuidanceTimeline([note(60,0,1),note(64,0),note(67,0,5)]);
 assert.equal(timeline[0].notes.length,2);
 assert.equal(timeline[0].totalNotes,3);
 assert.equal(timeline[0].complete,false);
});
test('FG-03A invalid or untrusted fingers never become actionable labels',()=>{
 const events=[note(60,0,2,{source:'proposed-research'}),
  note(62,.1,7),note(64,.2,3,{hand:'UNKNOWN'}),
  note(65,.3,2,{source:'demo',hand:null})];
 const frames=fingerGuidanceTimeline(events);
 assert.deepEqual(frames.map(g=>g.notes.length),[0,0,0,1]);
 assert.deepEqual(frames.at(-1).notes.map(n=>[n.source,n.hand,n.finger]),[['demo',null,2]]);
});
test('FG-03A same-onset voices are counted individually, never deduplicated by pitch',()=>{
 const result=fingerGuidanceTimeline([note(60,.1,1),note(60,.1,1),note(60,.1)]);
 assert.equal(result[0].totalNotes,3);
 assert.equal(result[0].notes.length,2);
 assert.equal(result[0].complete,false);
});
test('FG-03A valid events are deterministically grouped at original ms precision',()=>{
 const result=fingerGuidanceTimeline([note(65,.5001,4),note(60,0,1),note(67,.5004,5)]);
 assert.deepEqual(result.map(g=>g.start),[0,.5001]);
 assert.deepEqual(result.map(g=>g.notes.length),[1,2]);
 assert.deepEqual(result.map(g=>g.complete),[true,true]);
});
test('FG-03A nonmusical values fail closed and do not crash or create phantom notes',()=>{
 assert.deepEqual(fingerGuidanceTimeline(null),[]);
 const result=fingerGuidanceTimeline([null,{pitch:200,start:0,duration:1},
  {pitch:60,start:-1,duration:1},{pitch:60,start:0,duration:0},
  note(60,0,1)]);
 assert.equal(result.length,1);
 assert.equal(result[0].notes[0].pitch,60);
});
