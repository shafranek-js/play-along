import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerGuidanceHandTransition as blend} from '../src/core/finger-guidance-hand-transition.mjs';

const pose=(hand,name,x,y,width=120,height=170)=>({hand,pose:name,x,y,width,height});
test('rest to contact crossfades at 200ms with eased, correctly centered hand movement',()=>{
 const resting=pose('LH','rest',100,400,110,190);
 const touching=pose('LH','index',145,420,130,180);
 const initial=blend(null,resting,0);
 assert.equal(initial.layers.length,1);
 assert.equal(initial.layers[0].alpha,.70);
 const entered=blend(initial.state,touching,1000);
 assert.equal(entered.moving,true);
 assert.equal(entered.progress,0);
 assert.equal(entered.layers[1].placement.pose,'index');
 assert.ok(entered.layers[1].alpha>=.5,'press pose is already visible at source NoteOn');
 const middle=blend(entered.state,touching,1100);
 assert.equal(middle.progress,.5);
 assert.equal(middle.layers.length,2);
 assert.equal(middle.layers[0].placement.pose,'rest');
 assert.equal(middle.layers[1].placement.pose,'index');
 assert.ok(middle.layers[0].alpha>0&&middle.layers[1].alpha>0);
 // At midpoint, hand center is halfway between the two native-PNG centers.
 assert.equal(middle.layers[1].x+touching.width/2,(resting.x+resting.width/2+
  touching.x+touching.width/2)/2);
 assert.equal(middle.layers[1].y,(resting.y+touching.y)/2);
 const settled=blend(middle.state,touching,1200);
 assert.equal(settled.moving,false);assert.deepEqual(settled.layers,[
  {placement:touching,x:145,y:420,alpha:.87}
 ]);
});
test('release blends a faint visual trail but instant score-note state is REST',()=>{
 const pressing=pose('RH','spread',300,350);
 const hovering=pose('RH','rest',260,370);
 const out=blend(blend(null,pressing,0).state,hovering,100);
 assert.equal(out.moving,true);
 assert.equal(out.state.target.pose,'rest');
 assert.equal(out.layers[1].placement.pose,'rest');
 assert.ok(out.layers[0].alpha<=.18,
  'past pressing pose cannot convincingly remain held after NoteOff');
 const done=blend(out.state,hovering,301);
 assert.equal(done.moving,false);
 assert.equal(done.layers[0].placement.pose,'rest');
});
test('seek/reset/reduced motion, missing geometry, arbitrary pitch switches do not animate',()=>{
 const r=pose('LH','rest',100,200);
 const p=pose('LH','index',120,230);
 const first=blend(null,r,0);
 assert.equal(blend(first.state,p,80,{reset:true}).moving,false);
 assert.equal(blend(first.state,p,80,{durationMs:0}).moving,false);
 assert.equal(blend(first.state,null,80).layers.length,0);
 assert.equal(blend(null,null,80).state,null);
 assert.equal(blend(first.state,{...p,x:NaN},80).state,null);
 assert.equal(blend(first.state,p,NaN).moving,false);
 const nextFinger=pose('LH','thumb',150,230);
 assert.equal(blend(blend(null,p,10).state,nextFinger,20).moving,false,
  'no anatomical articulation between arbitrary finger silhouettes');
 assert.equal(blend(first.state,p,300).moving,true);
 assert.equal(blend(first.state,p,300).progress,0);
});
test('each hand keeps isolated state and source placement inputs remain immutable',()=>{
 const lh=pose('LH','rest',120,200),rh=pose('RH','rest',600,200);
 const inputs=structuredClone([lh,rh]);
 const l=blend(blend(null,lh,0).state,pose('LH','middle',130,210),10);
 const r=blend(null,rh,10);
 assert.equal(l.state.from.hand,'LH');assert.equal(r.state.from,null);
 assert.deepEqual([lh,rh],inputs);
});
