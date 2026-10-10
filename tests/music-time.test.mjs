import test from 'node:test';
import assert from 'node:assert/strict';
import {musicCreateTempoTimeline,musicTickToSeconds,musicBeatToSeconds,musicSecondsToBeat} from '../src/core/music-time.mjs';

const near=(actual,expected,epsilon=1e-9)=>assert.ok(Math.abs(actual-expected)<=epsilon,`Expected ${expected}, got ${actual}`);

test('pure ES module: default 120 BPM timing is identical in seconds and beats',()=>{
 const timeline=musicCreateTempoTimeline([],480);
 assert.deepEqual(timeline,[{tick:0,beat:0,sec:0,tempo:500000}]);
 near(musicTickToSeconds(timeline,480,960),1);
 near(musicBeatToSeconds(timeline,4),2);
 near(musicSecondsToBeat(timeline,1.5),3);
});
test('tempo changes create continuous increasing canonical times',()=>{
 const timeline=musicCreateTempoTimeline([{tick:0,tempo:500000},{tick:960,tempo:1000000}],480);
 assert.deepEqual(timeline.map(e=>e.beat),[0,2]);
 assert.deepEqual(timeline.map(e=>e.sec),[0,1]);
 near(musicTickToSeconds(timeline,480,1440),2);
 near(musicSecondsToBeat(timeline,2),3);
 for(const beat of [0,.1,1,1.5,2,2.25,2.75,5,9]){
  near(musicSecondsToBeat(timeline,musicBeatToSeconds(timeline,beat)),beat);
 }
});
test('last event at the same tick wins; input array is not mutated',()=>{
 const input=[{tick:480,tempo:1000000},{tick:0,tempo:700000},{tick:480,tempo:250000}];
 const snapshot=JSON.stringify(input);
 const timeline=musicCreateTempoTimeline(input,480);
 assert.equal(JSON.stringify(input),snapshot);
 assert.deepEqual(timeline,[{tick:0,beat:0,sec:0,tempo:700000},{tick:480,beat:1,sec:.7,tempo:250000}]);
 near(musicBeatToSeconds(timeline,2),.95);
});
test('reordered multi-part tempo events and irregular ppq are handled',()=>{
 const timeline=musicCreateTempoTimeline([{tick:384,tempo:1000000},{tick:192,tempo:250000}],192);
 assert.deepEqual(timeline.map(e=>e.sec),[0,.5,.75]);
 near(musicTickToSeconds(timeline,192,576),1.75);
});
test('compound 6/8 dotted quarter at 60 equals quarter at 90',()=>{
 const tempo=60000000/90;
 const timeline=musicCreateTempoTimeline([{tick:0,tempo}],480);
 near(musicBeatToSeconds(timeline,1.5),1);
 near(musicSecondsToBeat(timeline,2),3);
});
test('invalid tempo records are ignored; impossible axes fail explicitly',()=>{
 const timeline=musicCreateTempoTimeline([{tick:-1,tempo:100000},{tick:480,tempo:0},{tick:NaN,tempo:100000},{tick:480,tempo:Infinity}],480);
 assert.equal(timeline.length,1);
 assert.throws(()=>musicCreateTempoTimeline([],0),/Invalid pulses/);
 assert.throws(()=>musicCreateTempoTimeline([],480,0),/Invalid default/);
 assert.throws(()=>musicCreateTempoTimeline(null,480),/must be an array/);
 assert.throws(()=>musicBeatToSeconds([],0),/Missing/);
 assert.throws(()=>musicSecondsToBeat(timeline,NaN),/Invalid time/);
});
test('timeline clamps negative transport position, preserving start marker',()=>{
 const timeline=musicCreateTempoTimeline([{tick:480,tempo:900000}],480);
 near(musicBeatToSeconds(timeline,-2),0);
 near(musicSecondsToBeat(timeline,-5),0);
});
