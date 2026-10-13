import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePianoMotionVerifiedPose as sample} from '../src/core/pianomotion-pose-adapter.mjs';
const key=(id,pitch,hand='RH',finger=1,more={})=>({
 noteId:id,pitch,hand,finger,source:'musicxml',verification:'source-author',...more});
const target={isNextUnfinished:true,onset:.5,iteration:0,totalNotes:1,notes:[key('P1-m1-n1',60)]};
const pose=(time,x,hand='right')=>({hand,transportTimeSeconds:time,
 bones:[{boneId:'index-proximal',kind:'proximal',a:[x,1,2],b:[x+1,2,3]}],
 joints:[{kind:'knuckle',point:[x,1,2]}]});
const frames=[{pose:pose(.2,0),binding:{sourceNoteIds:['P1-m1-n1'],iteration:0,generation:2}},
 {pose:pose(.5,6),binding:{sourceNoteIds:['P1-m1-n1'],iteration:0,generation:2}}];
const cfg={target,hand:'RH',frames,viewport:{minPitch:21,maxPitch:108},
 transport:{mode:'listen',now:.35,leadMs:500,speedPercent:100,playing:true,generation:2}};
const run=opts=>sample({...cfg,...opts});
test('verified PianoMotion poses interpolate deterministically without input mutation',()=>{
 const original=structuredClone(cfg),one=run(),two=run();
 assert.deepEqual(one,two);assert.equal(one.kind,'motion');
 assert.ok(Math.abs(one.pose.bones[0].a[0]-3)<1e-12);
 assert.deepEqual(one.pose.bones[0].a.slice(1),[1,2]);
 assert.equal(one.pose.transportTimeSeconds,.35);
 assert.equal(one.productionAutoFingeringAllowed,false);
 assert.deepEqual(cfg,original);
});
test('reject research-generated finger and unbound MIDI hand',()=>{
 assert.equal(run({target:{...target,notes:[key('P1-m1-n1',60,'RH',1,{source:'research'})]}}).kind,'refuse');
 assert.equal(run({target:{...target,notes:[key('P1-m1-n1',60,'LH')]}}).reason,'no-target-for-hand');
});
test('never interpolate ambiguous duplicate note IDs or partly annotated chords',()=>{
 const a=key('id',60),b=key('id',64,'LH',2);
 assert.equal(run({target:{...target,totalNotes:2,notes:[a,b]}}).kind,'refuse');
 const c=key('id2',64,'LH',2,{finger:null});
 assert.equal(run({target:{...target,totalNotes:2,notes:[a,c]}}).kind,'refuse');
});
test('Wait unfinished task, completed chord, Pause and Seek cannot animate',()=>{
 assert.equal(run({transport:{...cfg.transport,mode:'wait'}}).kind,'markers');
 assert.equal(run({target:{...target,notes:[{...target.notes[0],completed:true}]}}).kind,'markers');
 assert.equal(run({transport:{...cfg.transport,playing:false}}).kind,'static');
 assert.equal(run({transport:{...cfg.transport,repositioned:true}}).kind,'static');
});
test('refuse stale seek generation, wrong hand, missing source identities',()=>{
 assert.equal(run({transport:{...cfg.transport,generation:3}}).reason,'unverified-pose-binding');
 assert.equal(run({frames:frames.map(f=>({...f,pose:{...f.pose,hand:'left'}}))}).kind,'markers');
 assert.equal(run({frames:[frames[0],{...frames[1],binding:{...frames[1].binding,sourceNoteIds:['other']}}]}).kind,'markers');
});
test('strict frame ordering and pose skeleton correspondence refuse blending',()=>{
 assert.equal(run({frames:[frames[1],frames[0]]}).kind,'markers');
 assert.equal(run({frames:[frames[0],{...frames[1],pose:{...frames[1].pose,bones:[{...frames[1].pose.bones[0],boneId:'else'}]}}]}).kind,'markers');
 assert.equal(run({frames:[frames[0],{...frames[1],pose:{...frames[1].pose,bones:[{...frames[1].pose.bones[0],a:[NaN,0,0]}]}}]}).kind,'markers');
});
test('25/49/61/88-key ranges restrict source target rather than shifting pose',()=>{
 for(const keys of [25,49,61,88]){
  const min=60-Math.floor(keys/2),max=min+keys-1;
  assert.equal(run({viewport:{minPitch:min,maxPitch:max}}).kind,'motion');
  assert.equal(run({viewport:{minPitch:65,maxPitch:89}}).reason,'target-key-clipped');
 }
});
test('500–1000ms windows and 50–200% playback alter VISUAL eligibility only',()=>{
 for(const leadMs of [500,600,750,1000])
  assert.equal(run({transport:{...cfg.transport,leadMs}}).kind,'motion');
 assert.equal(run({transport:{...cfg.transport,now:.2,speedPercent:50}}).reason,'outside-lookahead');
 assert.equal(run({transport:{...cfg.transport,now:.2,speedPercent:200}}).kind,'motion');
});
test('loop wrapped target requires explicit next cycle and matching iteration',()=>{
 const loop={enabled:true,start:0,end:1,nextCycle:true};
 const future={...target,onset:.25,iteration:1};
 const motionFrames=frames.map(f=>({...f,binding:{...f.binding,iteration:1}}));
 const wrapped=run({target:future,frames:motionFrames,
  transport:{...cfg.transport,now:.95,loop}});
 assert.equal(wrapped.reason,'pose-window-missing');
 assert.equal(run({target:future,frames:motionFrames,transport:{...cfg.transport,now:.95,
  loop:{...loop,nextCycle:false}}}).reason,'loop-iteration-unconfirmed');
});
test('bounds: no extrapolation beyond pose-buffer or unbounded frames',()=>{
 assert.equal(run({transport:{...cfg.transport,now:.19}}).reason,'pose-window-missing');
 assert.equal(run({frames:Array.from({length:129},(_,i)=>({...frames[0],pose:pose(.2+i*.001,i)}))}).reason,'unavailable-pose-buffer');
});
