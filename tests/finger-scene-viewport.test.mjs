import test from 'node:test';
import assert from 'node:assert/strict';
import {EDITOR_WINDOW_DEFAULT,EDITOR_WINDOW_MIN,EDITOR_WINDOW_MAX,
 clampEditorTime,normalizedWheelPixels,editorPan,editorZoom,editorRevealTime}
 from '../src/core/finger-scene-viewport.mjs';

test('pan changes ONLY the independent viewing time and clamps to the score duration',()=>{
 const original={time:5,deltaPixels:240,pixelsPerSecond:60,duration:20};
 assert.equal(editorPan(original),9);
 assert.deepEqual(original,{time:5,deltaPixels:240,pixelsPerSecond:60,duration:20});
 assert.equal(editorPan({...original,deltaPixels:-4000}),0);
 assert.equal(editorPan({...original,deltaPixels:4000}),20);
 assert.equal(editorPan({...original,pixelsPerSecond:0}),5);
 assert.equal(clampEditorTime(Infinity,20),0);
 assert.equal(clampEditorTime(-15,20),0);
 assert.equal(clampEditorTime(25,20),20);
});
test('wheel delta modes are normalized independently of browser line/page settings',()=>{
 assert.equal(normalizedWheelPixels(4,0,500),4);
 assert.equal(normalizedWheelPixels(4,1,500),64);
 assert.equal(normalizedWheelPixels(4,2,500),2000);
});
test('Ctrl wheel zoom is bounded and retains the same musical time under the pointer',()=>{
 const at=182,strike=412,time=8,windowSeconds=EDITOR_WINDOW_DEFAULT,scoreDuration=75;
 for(const delta of [-180,180]){
  const zoom=editorZoom({time,windowSeconds,deltaPixels:delta,
   anchorY:at,strikeY:strike,duration:scoreDuration});
  const oldAnchor=time+(strike-at)*windowSeconds/(strike-14);
  const newAnchor=zoom.time+(strike-at)*zoom.windowSeconds/(strike-14);
  assert.ok(Math.abs(oldAnchor-newAnchor)<1e-10,
   'pointer-anchored zoom cannot move the musical event beneath the mouse');
 }
 assert.equal(editorZoom({time:8,windowSeconds:6,deltaPixels:-100000,
  anchorY:at,strikeY:strike,duration:75}).windowSeconds,EDITOR_WINDOW_MIN);
 assert.equal(editorZoom({time:8,windowSeconds:6,deltaPixels:100000,
  anchorY:at,strikeY:strike,duration:75}).windowSeconds,EDITOR_WINDOW_MAX);
 const edge=editorZoom({time:0,windowSeconds:6,deltaPixels:100000,
  anchorY:at,strikeY:strike,duration:10});
 assert.ok(edge.time>=0&&edge.time<=10);
});
test('chronological note navigation reveals only offscreen targets without seeking playback',()=>{
 assert.equal(editorRevealTime({viewTime:5,target:7,windowSeconds:6,duration:40}),5);
 assert.equal(editorRevealTime({viewTime:5,target:20,windowSeconds:6,duration:40}),17);
 assert.equal(editorRevealTime({viewTime:5,target:1,windowSeconds:6,duration:40}),0);
 assert.equal(editorRevealTime({viewTime:35,target:50,windowSeconds:6,duration:40}),35);
});
