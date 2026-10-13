import test from 'node:test';
import assert from 'node:assert/strict';
import {planAnticipatoryHandMotion as plan} from '../src/core/hand-motion-feasibility.mjs';

// Exact production pianoKeyGeometry scale/rank/black-key center calculation.
const BLACK=new Set([1,3,6,8,10]), RANK=[0,0,1,1,2,3,3,4,4,5,5,6];
function geometry(min=21,max=108,width=1650){
 const keys=[];
 for(let p=min;p<=max;p++){
  const pc=p%12,rank=7*Math.floor(p/12)+RANK[pc],black=BLACK.has(pc);
  keys.push({pitch:p,black,cx:rank+(black?1:.5),unitW:black?.61:1});
 }
 const left=Math.min(...keys.map(k=>k.cx-k.unitW/2)),right=Math.max(...keys.map(k=>k.cx+k.unitW/2));
 const scale=width/(right-left);
 for(const k of keys){k.x=(k.cx-k.unitW/2-left)*scale;k.w=k.unitW*scale;k.center=k.x+k.w/2;}
 return {byPitch:new Map(keys.map(k=>[k.pitch,k])),keys,min,max,scale,
  whites:keys.filter(k=>!k.black),blacks:keys.filter(k=>k.black)};
}
const N=(pitch,finger=1,hand='RH',extra={})=>({noteId:'xml:'+hand+':'+pitch+':'+finger,pitch,finger,hand,
 source:'musicxml',verification:'source-author',duration:.06,...extra});
const group=(onset,notes)=>({onset,totalNotes:notes.length,notes,isNextUnfinished:true});
function fixture(){
 const geom=geometry();return {hand:'RH',geometry:geom,viewport:{left:0,right:1650},
  origin:group(0,[N(60)]),target:group(.8,[N(64,3)]),
  transport:{mode:'listen',now:.1,leadMs:750,speedPercent:100,playing:true,oppositeHandClear:true}};
}
const result=extra=>plan({...fixture(),...extra});
const kind=(expected,extra)=>assert.equal(result(extra).kind,expected);
const reason=(expected,extra)=>assert.equal(result(extra).reason,expected);

test('original author-verified next not yet sounded produces bounded trajectory',()=>{
 const cfg=fixture(),src=structuredClone({...cfg,geometry:undefined});
 const a=plan(cfg);assert.equal(a.kind,'moving');assert.equal(a.keys[0].pitch,64);
 assert.equal(a.keys[0].noteId,cfg.target.notes[0].noteId);
 assert.ok(a.fromX<a.x&&a.x<a.toX);
 assert.equal(a.arrivalAtScore,.8);assert.equal(a.timing,'visual-only');
 assert.deepEqual({...cfg,geometry:undefined},src);
 assert.deepEqual(plan(cfg),a);
});
test('never points to an already accepted note of the same chord',()=>{
 const target=group(.8,[N(60,1,'RH',{completed:true}),N(64,3)]);
 const v=result({target});assert.equal(v.kind,'markers');assert.equal(v.reason,'partial-wait-chord');
 assert.deepEqual(v.keys.map(x=>x.pitch),[64]);
});
test('no pending target never skips forward to the next group',()=>{
 reason('target-complete',{target:group(.8,[N(64,3,'RH',{completed:true})])});
});
test('unknown, generated, demo and mismatched verification all refuse',()=>{
 const items=[N(64,3,'RH',{source:'generated'}),N(64,3,'RH',{source:'musicxml',verification:'candidate'}),
  N(64,3,'RH',{source:'demo'}),N(64,3,'RH',{verification:'user-verified'}),N(64,3,'RH',{hand:null})];
 for(const n of items)reason('unverified-note',{target:group(.8,[n])});
});
test('explicitly user-verified correction accepted without modifying author data',()=>{
 const n=N(64,3,'RH',{noteId:'xml:correction',source:'user',verification:'user-verified'});
 kind('moving',{target:group(.8,[n])});
});
test('future group cannot be promoted unless confirmed next unfinished',()=>{
 reason('next-target-unconfirmed',{target:{...group(.8,[N(64,3)]),isNextUnfinished:false}});
});
test('other hand unknown is not automatically considered absent',()=>{
 reason('opposite-state-unknown',{transport:{...fixture().transport,oppositeHandClear:undefined}});
});
test('incomplete score group, even if subset valid, always refuses',()=>{
 reason('incomplete-group',{target:{...group(.8,[N(64,3)]),totalNotes:2}});
});
test('duplicated source identity and invalid note identity are refused',()=>{
 for(const n of [N(67,5,'RH',{noteId:'xml:RH:64:3'}),N(67,5,'RH',{noteId:''})]){
  reason('unverified-note',{target:group(.8,[N(64,3),n])});
 }
});
test('simultaneous duplicated pitch/finger conflicts are not silently deduplicated',()=>{
 reason('chord-finger-conflict',{target:group(.8,[N(64,2),N(68,2,'RH',{noteId:'different'})])});
 reason('chord-finger-conflict',{target:group(.8,[N(64,2),N(64,4)])});
});
test('chord finger order is source-gated and anatomically ambiguous layouts refuse',()=>{
 reason('chord-finger-order',{target:group(.8,[N(64,5),N(67,2)])});
 reason('chord-finger-order',{hand:'LH',origin:group(0,[N(48,5,'LH')]),
  target:group(.8,[N(50,1,'LH'),N(53,4,'LH')])});
});
test('wide chord and more than 5 simultaneous notes reject full-pose movement',()=>{
 reason('chord-span-unknown',{target:group(.8,[N(60,1),N(80,5)])});
 reason('chord-finger-conflict',{target:group(.8,[N(60,1),N(62,2),N(64,3),N(65,4),N(67,5),N(69,1)])});
});
test('verified three-note chord has stationary geometric targets',()=>{
 const target=group(.8,[N(62,1),N(65,3),N(69,5)]);
 const v=result({target});assert.equal(v.kind,'moving');
 assert.deepEqual(v.keys.map(x=>x.pitch),[62,65,69]);
 for(const t of v.keys)assert.equal(t.x,fixture().geometry.byPitch.get(t.pitch).center);
});
test('sustained original note through target refuses without shortening duration',()=>{
 const orig=group(0,[N(60,1,'RH',{duration:1.1})]);
 reason('held-note-conflict',{origin:orig});assert.equal(orig.notes[0].duration,1.1);
});
test('source still held at current frame prevents premature motion',()=>{
 const v=result({origin:group(0,[N(60,1,'RH',{duration:.4})])});
 assert.equal(v.kind,'static');assert.equal(v.reason,'origin-still-held');
 const after=result({origin:group(0,[N(60,1,'RH',{duration:.52})]),
  transport:{...fixture().transport,now:.55}});
 assert.equal(after.kind,'markers');assert.equal(after.reason,'movement-infeasible');
});
test('physical pressed keys never silently reassign hands',()=>{
 reason('physical-keys-held',{transport:{...fixture().transport,heldNoteIds:['unmatched-midi']}});
 reason('untrusted-held-keys',{transport:{...fixture().transport,heldNoteIds:['ok',2]}});
});
test('unknown original release never assumes free hand',()=>{
 const orig=group(0,[N(60,1,'RH',{duration:undefined})]);
 reason('origin-release-unknown',{origin:orig});
});
test('missing origin gives accurate static target, no invented trajectory',()=>{
 reason('origin-unknown',{origin:null});kind('static',{origin:null});
});
test('large leap and thumb-transition examples refuse safely',()=>{
 reason('movement-infeasible',{target:group(.8,[N(88,5)])});
 reason('chord-finger-order',{target:group(.8,[N(63,5),N(67,1)])});
});
test('small repositioning becomes static rather than jitter',()=>{
 reason('no-relocation-needed',{target:group(.8,[N(60)])});
});
test('25/49/61/88-key geometry without pitch projection',()=>{
 for(const [min,max] of [[48,72],[36,84],[36,96],[21,108]]){
  const g=geometry(min,max,1200),cfg={geometry:g,viewport:{left:0,right:1200}};
  const a=result(cfg);assert.equal(a.kind,'moving',min+'..'+max+': '+a.reason);
  assert.equal(a.keys[0].x,g.byPitch.get(64).center);
 }
});
test('keys outside range refuse, not replaced with adjacent keys',()=>{
 const g=geometry(48,72,1200);
 reason('key-out-of-range',{target:group(.8,[N(84,3)]),geometry:g,viewport:{left:0,right:1200}});
});
test('key clipping refuses animation; source clipping stays static',()=>{
 const g=geometry(21,108,1650),mid=g.byPitch.get(64).center;
 reason('target-clipped',{viewport:{left:mid+2,right:1650}});
 reason('origin-clipped',{viewport:{left:mid-25,right:1650}});
});
test('black-key center, not white-key slot, fixes target',()=>{
 const a=result({target:group(.8,[N(61,3)])});
 assert.equal(a.kind,'moving');assert.equal(a.keys[0].x,fixture().geometry.byPitch.get(61).center);
});
test('two-hand target requires independently verified opposite hand',()=>{
 const target=group(.8,[N(64,3),N(48,3,'LH')]);
 reason('crossing-unknown',{target});
 const opposite={origin:group(0,[N(43,4,'LH')]),target:group(.8,[N(48,3,'LH')])};
 const a=result({target,opposite});assert.equal(a.kind,'moving',a.reason);
});
test('crossing and nearly touching hands forbid full animation',()=>{
 const target=group(.8,[N(48,3),N(72,3,'LH')]);
 const opposite={origin:group(0,[N(43,4,'LH')]),target:group(.8,[N(72,3,'LH')])};
 reason('crossing-or-crowding',{target,opposite});
 const narrow={origin:group(0,[N(59,3,'LH')]),target:group(.8,[N(62,3,'LH')])};
 reason('crossing-or-crowding',{target:group(.8,[N(64,3),N(62,3,'LH')]),opposite:narrow});
});
test('opposite held hand and unverified source gate movement',()=>{
 const target=group(.8,[N(64,3),N(48,3,'LH')]);
 const opposite={origin:group(0,[N(43,4,'LH',{duration:1.2})]),target:group(.8,[N(48,3,'LH')])};
 reason('opposite-held-note',{target,opposite});
 reason('crossing-unknown',{target,opposite:{...opposite,origin:group(0,[N(43,4,'LH',{source:'candidate'})])}});
});
test('Wait current chord stays statically actionable',()=>{
 const v=result({transport:{...fixture().transport,mode:'wait'}});
 assert.equal(v.kind,'static');assert.equal(v.reason,'wait-pending');
});
test('500–1000ms preparation windows enforce feasibility',()=>{
 for(const leadMs of [500,600,750,900,1000]){
  const cfg=fixture();cfg.transport={...cfg.transport,now:1.8-leadMs/1000+.02,leadMs};
  assert.equal(result({target:group(1.8,[N(64,3)]),transport:cfg.transport}).kind,'moving',String(leadMs));
 }
});
test('50%, 100% and 200% speed affects only visual clock',()=>{
 for(const speedPercent of [50,100,200]){
  const t={...fixture().transport,now:1.8-.5*speedPercent/100,speedPercent};
  const v=result({transport:t,target:group(1.8,[N(64,3)])});
  assert.equal(v.kind,'moving',v.reason);assert.ok(Math.abs(v.remainingMs-500)<1e-6);
  assert.equal(v.arrivalAtScore,1.8);
 }
});
test('outside lead stays static, overdue onset never animated',()=>{
 reason('outside-lookahead',{transport:{...fixture().transport,now:0,leadMs:500}});
 reason('target-already-due',{transport:{...fixture().transport,now:.8}});
});
test('Pause and Seek recalculate statelessly without stale trajectory',()=>{
 const a=result(),transport=fixture().transport;
 const paused=result({transport:{...transport,playing:false}});
 const sought=result({transport:{...transport,repositioned:true,now:.55}});
 assert.equal(paused.kind,'static');assert.equal(sought.kind,'static');
 assert.deepEqual(result(),a);
 const newFrame=result({transport:{...transport,now:.45}});
 assert.ok(newFrame.phase>a.phase);assert.equal(newFrame.toX,a.toX);
});
test('Loop wrap requires explicit nextCycle and forward remaining time',()=>{
 const transport={...fixture().transport,now:3.8,leadMs:750,
  loop:{enabled:true,start:2,end:4,nextCycle:true}};
 const origin=group(2.3,[N(60)]),target=group(2.2,[N(64,3)]);
 const out=result({transport,origin,target});assert.equal(out.kind,'moving',out.reason);
 assert.ok(Math.abs(out.remainingMs-400)<1e-6);
 reason('loop-cycle-unconfirmed',{transport:{...transport,loop:{...transport.loop,nextCycle:false}},origin,target});
});
test('invalid Loop, controls and source ordering refuse',()=>{
 reason('invalid-loop',{transport:{...fixture().transport,loop:{enabled:true,start:3,end:2}}});
 reason('invalid-configuration',{transport:{...fixture().transport,speedPercent:250}});
 reason('invalid-configuration',{transport:{...fixture().transport,leadMs:1100}});
 reason('nonforward-source-order',{origin:group(.9,[N(60)])});
});
test('bounded per-onset work never scans full-song arrays',()=>{
 const cfg=fixture(),foreign=Object.freeze(Array(100000).fill(0));
 cfg.song=foreign;const before=JSON.stringify(cfg.target);
 for(let i=0;i<2000;i++)assert.equal(plan(cfg).kind,'moving');
 assert.equal(JSON.stringify(cfg.target),before);assert.equal(foreign.length,100000);
});

test('P1: first invocation 10ms before attack never invents elapsed travel',()=>{
 const a=result({transport:{...fixture().transport,now:.79}});
 assert.equal(a.kind,'markers');
 assert.equal(a.reason,'movement-infeasible-now');
 assert.ok(.8-.79<.02);
});
test('P1: exact earlier moving token permits safe continuity without relaunch',()=>{
 const first=result();
 assert.equal(first.kind,'moving');
 assert.ok(first.motionContinuation.motionKey.length>0);
 const late=result({transport:{...fixture().transport,now:.79,
  motionContinuation:first.motionContinuation}});
 assert.equal(late.kind,'moving',late.reason);
 assert.equal(late.motionContinuation.startedAtScore,.1);
 assert.equal(late.keys[0].pitch,64);
 assert.ok(late.phase>first.phase);
});
test('P1: fabricated or stale journey data cannot bypass late-start refusal',()=>{
 const first=result().motionContinuation;
 const stale={...first,motionKey:'old-score-target'};
 const impossible={...first,startedAtScore:.7};
 const altered= result({transport:{...fixture().transport,now:.79,
  speedPercent:150,motionContinuation:first}});
 for(const motionContinuation of [stale,impossible,{...first,startedAtScore:-1}]){
  const r=result({transport:{...fixture().transport,now:.79,motionContinuation}});
  assert.equal(r.reason,'movement-infeasible-now',r.reason);
 }
 assert.equal(altered.reason,'movement-infeasible-now');
 const changed=result({target:group(.8,[N(65,3)]),
  transport:{...fixture().transport,now:.79,motionContinuation:first}});
 assert.equal(changed.reason,'movement-infeasible-now');
});
test('P1: other-hand notes at a different score onset do not authorize motion',()=>{
 const target=group(.8,[N(64,3),N(48,3,'LH')]);
 const opposite={origin:group(0,[N(43,4,'LH')]),target:group(2.0,[N(48,3,'LH')])};
 const r=result({target,opposite});
 assert.equal(r.kind,'markers');
 assert.equal(r.reason,'crossing-unknown');
});
test('P1: other-hand repeat iteration and next-status must match canonical target',()=>{
 const target={...group(.8,[N(64,3),N(48,3,'LH')]),iteration:2,loopCycle:3};
 const opposite={origin:group(0,[N(43,4,'LH')]),
  target:{...group(.8,[N(48,3,'LH')]),iteration:3,loopCycle:3}};
 assert.equal(result({target,opposite}).reason,'crossing-unknown');
 opposite.target={...opposite.target,iteration:2,loopCycle:4};
 assert.equal(result({target,opposite}).reason,'crossing-unknown');
 opposite.target={...opposite.target,loopCycle:3,isNextUnfinished:false};
 assert.equal(result({target,opposite}).reason,'crossing-unknown');
 opposite.target={...opposite.target,isNextUnfinished:true};
 assert.equal(result({target,opposite}).kind,'moving');
});
