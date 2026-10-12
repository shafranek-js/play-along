import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerGuidanceTimeline,fingerGuidanceGhostWindow} from '../src/core/finger-guidance-timeline.mjs';
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

test('FG-03B secondary ghost is hidden until the upcoming note enters the wall-clock lead window',()=>{
 const options={nextOnset:2,now:1,leadMs:750,speedPercent:100,mode:'listen'};
 const early=fingerGuidanceGhostWindow(options);
 assert.deepEqual(early,{visible:false,remainingMs:1000,alpha:0});
 const late=fingerGuidanceGhostWindow({...options,now:1.5});
 assert.equal(late.visible,true);assert.equal(late.remainingMs,500);
 assert.ok(late.alpha>.10&&late.alpha<.35);
 const due=fingerGuidanceGhostWindow({...options,now:2});
 assert.equal(due.visible,false,'No zero-time secondary position after the next note arrives');
});
test('FG-03B lookahead responds to playback tempo without altering score time',()=>{
 const state={nextOnset:1,now:.2,leadMs:750,mode:'tempo'};
 assert.equal(fingerGuidanceGhostWindow({...state,speedPercent:100}).visible,false);
 assert.equal(fingerGuidanceGhostWindow({...state,speedPercent:150}).visible,true);
 assert.equal(fingerGuidanceGhostWindow({...state,speedPercent:50}).visible,false);
});
test('FG-03B Wait never shows a second hand configuration before unfinished input',()=>{
 for(const leadMs of [500,750,1000]){
  const state=fingerGuidanceGhostWindow({nextOnset:.5,now:0,mode:'wait',leadMs});
  assert.equal(state.visible,false);
  assert.equal(state.remainingMs,null);
 }
});
test('FG-03B loop wrap measures forward next-cycle time, not negative score delta',()=>{
 const loop={enabled:true,start:2,end:4};
 const near=fingerGuidanceGhostWindow({nextOnset:2.2,now:3.8,loop,mode:'listen',leadMs:500,speedPercent:100});
 assert.equal(near.visible,true);
 assert.equal(near.remainingMs,400);
 const far=fingerGuidanceGhostWindow({nextOnset:2.2,now:3.1,loop,mode:'listen',leadMs:500,speedPercent:100});
 assert.equal(far.visible,false);
 assert.equal(far.remainingMs,1100);
});
test('FG-03B missing/invalid timing or configuration fails closed',()=>{
 for(const nextOnset of [undefined,null,NaN,Infinity]){
  assert.equal(fingerGuidanceGhostWindow({nextOnset,now:0}).visible,false);
 }
 for(const leadMs of [0,499,1001,NaN,750.5]){
  assert.equal(fingerGuidanceGhostWindow({nextOnset:.5,now:0,leadMs}).visible,false);
 }
 assert.equal(fingerGuidanceGhostWindow({nextOnset:.5,now:0,mode:'unknown'}).visible,false);
 assert.equal(fingerGuidanceGhostWindow({nextOnset:.5,now:0,loop:{enabled:true,start:2,end:1}}).visible,false);
 assert.equal(fingerGuidanceGhostWindow({nextOnset:.5,now:0,mode:'listen',speedPercent:0}).visible,false);
});
