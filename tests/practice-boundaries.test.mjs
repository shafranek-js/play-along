import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/legacy/parts/50-practice-scoring.js'),'utf8');
// Exercise the actual bundled scoring class, without maintaining a second copy.
const PracticeSession=vm.runInNewContext(source+'\nPracticeSession',{
 rate:()=>1,performance:{now:()=>100}
});
const note=(pitch,start,duration=.5)=>({pitch,start,duration});

test('B01 Tempo: seek into near-unison counts only the available note',()=>{
 const s=new PracticeSession([note(60,0),note(60,.02),note(60,2)],'tempo',.02);
 assert.equal(s.total,2);
 assert.equal(s.inputOn(60,.02,100),true);
 assert.equal(s.stats.hits,1);
 assert.equal(s.all[0].skipped,true);
 assert.equal(s.all[0].hit,false);
 assert.equal(s.all[1].hit,true);
 assert.equal(s.played.get(60).length,1);
 s.inputOff(60,.52);
 assert.equal(s.stats.okHold,1);
 assert.equal(s.stats.short,0);
 assert.equal(s.all[0].holdRatio,null);
 s.advance(.5);
 assert.equal(s.stats.missed,0);
});

test('B02 Wait: completion and next cursor exclude notes before seek',()=>{
 const s=new PracticeSession([note(60,0),note(62,.02),note(64,2)],'wait',.02);
 const g=s.nextGroup();
 assert.equal(g.start,0);
 assert.equal(s.playableStart(g),.02);
 assert.equal(s.inputOn(62,.02,100),'released');
 assert.equal(s.stats.hits,1);
 assert.equal(s.all[0].skipped,true);
 assert.equal(s.all[0].hit,false);
 assert.equal(s.nextGroup().start,2);
 s.inputOff(62,.12);
 assert.equal(s.played.size,0);
});

test('chord grading excludes skipped notes but still requires all available pitches',()=>{
 const s=new PracticeSession([note(60,0),note(62,.02),note(67,.021),note(64,2)],'wait',.02);
 assert.equal(s.inputOn(62,.02,100),true);
 assert.equal(s.stats.goodChords,0);
 assert.equal(s.inputOn(67,.021,150),'released');
 assert.equal(s.stats.goodChords,1);
 assert.equal(s.all[0].chordSpreadMs,null);
 assert.equal(s.all[1].chordSpreadMs,50);
 assert.equal(s.all[2].chordSpreadMs,50);
});

for(const mode of ['tempo','wait']){
 test('Loop boundary inside group: '+mode+' excludes out-of-loop and skipped onsets',()=>{
  const s=new PracticeSession([note(60,0),note(62,.02),note(64,2)],mode,.02,1);
  assert.equal(s.total,1);
  assert.equal(s.playableStart(s.groups[0]),.02);
  if(mode==='wait')assert.equal(s.inputOn(62,.02,100),'released');
  else assert.equal(s.inputOn(62,.02,100),true);
  assert.equal(s.stats.hits,1);
  assert.equal(s.all[0].hit,false);
  assert.equal(s.all[2].skipped,true);
  s.seek(.02);
  assert.equal(s.stats.hits,0);
  assert.equal(s.all[0].skipped,true);
  assert.equal(s.playableStart(s.groups[0]),.02);
  assert.equal(s.inputOn(62,.02,120),mode==='wait'?'released':true);
  assert.equal(s.stats.hits,1);
  assert.equal(s.all[0].hit,false);
 });
}
