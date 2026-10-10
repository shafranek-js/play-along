import test from 'node:test';
import assert from 'node:assert/strict';
import {musicMeasureSpan,musicBarGrid} from '../src/core/music-bars.mjs';

test('ordinary sparse 4/4 measure retains its complete four-beat span',()=>{
 assert.equal(musicMeasureSpan(4,4,1,false),4);
 assert.equal(musicMeasureSpan(3,4,2,false),3);
});
test('implicit pickups preserve actual played duration but empty implicit measures remain stable',()=>{
 assert.equal(musicMeasureSpan(4,4,.5,true),.5);
 assert.equal(musicMeasureSpan(4,4,0,true),4);
 assert.equal(musicMeasureSpan(3,8,.25,true),.25);
});
test('overfull measures stay as written in both parser and notation navigation',()=>{
 assert.equal(musicMeasureSpan(4,4,5,false),5);
 assert.equal(musicMeasureSpan(6,8,4,false),4);
});
test('mixed meter yields reproducible quarter-beat boundaries for a full piece',()=>{
 const bars=[
  {beats:4,beatType:4,occupied:1,implicit:false},
  {beats:3,beatType:4,occupied:3},
  {beats:6,beatType:8,occupied:3},
  {beats:4,beatType:4,occupied:.5,implicit:true},
  {beats:4,beatType:4,occupied:5},
 ];
 assert.deepEqual(musicBarGrid(bars),[0,4,7,10,10.5,15.5]);
});
test('input descriptors remain immutable',()=>{
 const bars=[{beats:4,beatType:4,occupied:2},{beats:3,beatType:4,occupied:1}];
 const before=JSON.stringify(bars);
 assert.deepEqual(musicBarGrid(bars),[0,4,7]);
 assert.equal(JSON.stringify(bars),before);
});
test('invalid meter and out-of-range musical data fail clearly',()=>{
 assert.throws(()=>musicMeasureSpan(0,4,1),/Invalid musical meter/);
 assert.throws(()=>musicMeasureSpan(4,NaN,1),/Invalid musical meter/);
 assert.throws(()=>musicMeasureSpan(4,4,-2),/Invalid occupied duration/);
 assert.throws(()=>musicBarGrid(null),/array/);
 assert.throws(()=>musicBarGrid([null]),/Invalid measure/);
});
