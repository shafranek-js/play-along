import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerGuidanceTimeline,fingerGuidancePlayingFrame,fingerGuidanceGhostWindow,fingerGuidanceHandsCross,fingerGuidanceMotionPlan} from '../src/core/finger-guidance-timeline.mjs';
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
test('FG-03A duplicated canonical note IDs are refused without deleting the score onset',()=>{
 const events=[
  note(60,0,1,{noteId:'same'}),
  note(64,0,3,{noteId:'same'}),
  note(67,0,5,{noteId:'distinct'}),
  note(70,.5,5,{noteId:'same'})
 ];
 const original=structuredClone(events);
 const frames=fingerGuidanceTimeline(events);
 assert.deepEqual(events,original,'No mutation of note identity, timing or pitch');
 assert.equal(frames[0].totalNotes,3);
 assert.equal(frames[0].complete,false);
 assert.deepEqual(frames[0].notes.map(n=>n.noteId),['distinct']);
 assert.equal(frames[1].complete,true,
  'The same canonical ID at a DIFFERENT onset is not an intra-chord collision');
});
test('FG-03A a source-unmarked duplicate also invalidates the marked finger candidate',()=>{
 const frames=fingerGuidanceTimeline([
  note(60,0,1,{noteId:'ambiguous'}),
  note(60,0,null,{noteId:'ambiguous'}),
  note(67,.4,5,{noteId:'independent'})
 ]);
 assert.equal(frames[0].totalNotes,2);
 assert.equal(frames[0].notes.length,0);
 assert.equal(frames[0].complete,false);
 assert.equal(frames[1].complete,true);
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

const pose=(x,width=80,unit=20)=>({x,width,unit});

test('FG-03B2 Ghost translation uses deterministic smoothstep without moving fixed key targets',()=>{
 const source=pose(40,100),target=pose(220,90),cfg={from:source,to:target,canvasWidth:500,leadMs:750,playing:true};
 const start=fingerGuidanceMotionPlan({...cfg,remainingMs:750});
 const middle=fingerGuidanceMotionPlan({...cfg,remainingMs:375});
 const end=fingerGuidanceMotionPlan({...cfg,remainingMs:0});
 assert.equal(start.kind,'moving');assert.equal(middle.kind,'moving');assert.equal(end.kind,'moving');
 assert.equal(start.x,45);assert.equal(middle.x,132.5);assert.equal(end.x,220);
 assert.equal(start.progress,0);assert.equal(middle.progress,.5);assert.equal(end.progress,1);
 assert.equal(middle.targetCenter,265);
 assert.deepEqual(source,pose(40,100));assert.deepEqual(target,pose(220,90));
});
test('FG-03B2 pause/seek do not retain stale interpolated hand x',()=>{
 const cfg={from:pose(60),to:pose(260),remainingMs:375,leadMs:750,canvasWidth:600};
 const motion=fingerGuidanceMotionPlan({...cfg,playing:true});
 const pause=fingerGuidanceMotionPlan({...cfg,playing:false});
 const seek=fingerGuidanceMotionPlan({...cfg,remainingMs:125,playing:true});
 assert.ok(motion.x>60&&motion.x<260);
 assert.deepEqual({kind:pause.kind,x:pause.x},{kind:'static',x:260});
 assert.ok(seek.x>motion.x);
 assert.deepEqual(fingerGuidanceMotionPlan({...cfg,playing:true}),motion);
});
test('FG-03B2 the pair of hands cannot visually interpolate through a crossing',()=>{
 const cross=fingerGuidanceHandsCross(pose(20),pose(240),pose(230),pose(30));
 assert.equal(cross,true);
 assert.equal(fingerGuidanceMotionPlan({from:pose(20),to:pose(230),
  canvasWidth:600,remainingMs:250,leadMs:750,crossing:cross}).kind,'markers');
 assert.equal(fingerGuidanceHandsCross(pose(20),pose(260),pose(80),pose(320)),false);
 assert.equal(fingerGuidanceHandsCross(null,pose(260),pose(80),pose(320)),false);
 assert.equal(fingerGuidanceHandsCross(pose(20),pose(260),pose(240),pose(260)),true,
  'Nearly coincident hands must not be represented as a safe 2D movement');
});
test('FG-03B2 unclipped repositioning refuses misleading translations outside visible piano range',()=>{
 assert.equal(fingerGuidanceMotionPlan({from:pose(50),to:pose(450),canvasWidth:500,
  remainingMs:250,leadMs:750}).kind,'markers');
 assert.equal(fingerGuidanceMotionPlan({from:pose(-200),to:pose(200),canvasWidth:500,
  remainingMs:250,leadMs:750}).kind,'static');
 assert.equal(fingerGuidanceMotionPlan({from:null,to:pose(200),canvasWidth:500,
  remainingMs:250,leadMs:750}).kind,'static');
});
test('FG-03B2 only genuine shifts become moving hands; other targets remain anchored badges',()=>{
 assert.equal(fingerGuidanceMotionPlan({from:pose(200),to:pose(220),
  canvasWidth:500,remainingMs:250,leadMs:750}).kind,'markers');
 for(const cfg of [{remainingMs:-1},{remainingMs:800},{leadMs:0},{canvasWidth:0},{to:null}]){
  assert.equal(fingerGuidanceMotionPlan({from:pose(20),to:pose(220),
   canvasWidth:500,remainingMs:250,leadMs:750,...cfg}).kind,'markers');
 }
});

test('LAUNCH-02 Listen physically held notes, not future prompts, across independent onsets',()=>{
 const src=[
  note(60,0,1,{duration:.8,noteId:'rh-a'}),
  note(48,.3,5,{duration:.8,hand:'LH',noteId:'lh-b'}),
  note(64,1.2,3,{duration:.3,noteId:'rh-c'})
 ];
 const snapshot=structuredClone(src),steps=fingerGuidanceTimeline(src);
 const first=fingerGuidancePlayingFrame(steps,.1);
 assert.deepEqual(first.current.notes.map(n=>n.pitch),[60]);
 assert.equal(first.next.start,.3);
 const overlap=fingerGuidancePlayingFrame(steps,.4);
 assert.deepEqual(overlap.current.notes.map(n=>n.pitch),[60,48]);
 assert.equal(overlap.current.complete,true);
 assert.equal(overlap.next.start,1.2);
 const leftOnly=fingerGuidancePlayingFrame(steps,.85);
 assert.deepEqual(leftOnly.current.notes.map(n=>n.pitch),[48]);
 const rest=fingerGuidancePlayingFrame(steps,1.15);
 assert.equal(rest.current,null,'hand must lift at physical NoteOff, not hold a future note');
 assert.equal(rest.previous.start,.3);
 assert.equal(rest.next.start,1.2);
 const last=fingerGuidancePlayingFrame(steps,1.25);
 assert.deepEqual(last.current.notes.map(n=>n.pitch),[64]);
 assert.equal(fingerGuidancePlayingFrame(steps,1.55).current,null);
 assert.equal(fingerGuidancePlayingFrame(steps,1.55).next,null);
 assert.deepEqual(src,snapshot,'visual calculation never mutates score notes');
});
test('LAUNCH-02 mixed authored/unknown source may not create a fabricated full-hand pose',()=>{
 const steps=fingerGuidanceTimeline([
  note(60,0,1,{duration:.5}),note(64,0,null,{duration:.5}),note(67,.6,5),
 ]);
 const partial=fingerGuidancePlayingFrame(steps,.2);
 assert.equal(partial.current.complete,false);
 assert.deepEqual(partial.current.notes.map(n=>n.pitch),[60]);
 assert.equal(partial.next.start,.6);
 const loop={enabled:true,start:0,end:1};
 const wrapped=fingerGuidancePlayingFrame(steps,.88,loop);
 assert.equal(wrapped.current,null);
 assert.equal(wrapped.next.start,0);
});
