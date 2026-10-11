import test from 'node:test';
import assert from 'node:assert/strict';
import {readPitchSPN,parsePIGFingering,partitionMonophonicHand} from '../src/core/fingering-repertoire-pig.mjs';
import {compareRepertoire,corpus,loadRepertoireSource} from '../scripts/fingering-repertoire-benchmark.mjs';

const pig=lines=>'//Version: PIG/v1.0.0\n'+lines.join('\n')+'\n';
const line=(id,start,end,pitch,finger,channel=0)=>[
 id,start.toFixed(6),end.toFixed(6),pitch,80,0,channel,finger
].join(' ');
test('FG-02G corpus is pinned, has five real hand-authored source files and proper attribution',()=>{
 assert.match(corpus.revision,/^[0-9a-f]{40}$/);
 assert.equal(corpus.license,'CC-BY-SA-4.0');
 assert.equal(corpus.cases.length,5);
 assert.equal(corpus.cases.reduce((n,c)=>n+c.expectedNotes,0),148);
 assert.ok(corpus.cases.every(c=>c.sourceUrl.includes(corpus.revision)));
 assert.equal(new Set(corpus.cases.map(c=>c.id)).size,5);
});
test('FG-02G MIDI pitch parsing treats C4 as 60 and handles accidentals',()=>{
 assert.equal(readPitchSPN('C4'),60);
 assert.equal(readPitchSPN('F#5'),78);
 assert.equal(readPitchSPN('Bb3'),58);
 assert.equal(readPitchSPN('C#4'),61);
 assert.throws(()=>readPitchSPN('H4'),/INVALID_PITCH/);
});
test('FG-02G signed fingers are authoritative hands; MIDI channel is NOT hand ownership',()=>{
 const data=pig([line(0,0,.4,'A2',-5,0),line(1,0,.4,'E5',5,0),line(2,.4,.8,'G#3',-1,0)]);
 const parsed=parsePIGFingering(data,{sourceId:'two-hands'});
 assert.equal(parsed.notes.length,3);
 assert.deepEqual(parsed.notes.map(n=>n.hand),['LH','RH','LH']);
 assert.deepEqual(parsed.notes.map(n=>n.referenceFinger),[5,5,1]);
 assert.deepEqual(parsed.notes.map(n=>n.rawChannel),[0,0,0]);
});
test('FG-02G source events preserve real offsets, IDs, not just note pitch',()=>{
 const data=pig([line(0,0,.2,'E4',1),line(1,.3,1.25,'D4',2)]);
 const result=parsePIGFingering(data,{sourceId:'phrase'}).notes;
 assert.deepEqual(result.map(n=>n.noteId),['phrase:0','phrase:1']);
 assert.equal(result[0].duration,.2);
 assert.equal(result[1].duration,.95);
 assert.equal(result[0].end,.2);
});
test('FG-02G refuses 0-9 labels rather than accidentally treating 0 as valid LH thumb',()=>{
 const body=pig([line(0,0,.3,'C4',0)]);
 assert.throws(()=>parsePIGFingering(body),/INVALID_PIG_NOTE_OR_FINGER/);
});
test('FG-02G refuses note substitutions (e.g. 3_1), unsupported format is not silently rewritten',()=>{
 assert.throws(()=>parsePIGFingering(pig([line(0,0,.4,'C4','3_1')])),/INVALID_PIG_NOTE_OR_FINGER/);
});
test('FG-02G refuses duplicate IDs, bad times, and manipulated text',()=>{
 assert.throws(()=>parsePIGFingering(pig([line(0,0,.4,'C4',1),line(0,.5,.8,'E4',2)])),/DUPLICATE_PIG_NOTE_ID/);
 assert.throws(()=>parsePIGFingering(pig([line(0,0,0,'C4',1)])),/INVALID_PIG_TIMING/);
 assert.throws(()=>parsePIGFingering('0 0 1 C4 80 0 0 1'),/UNSUPPORTED_PIG_VERSION/);
});
test('FG-02G detects different hands at same time, does not treat as one-hand polyphony',()=>{
 const p=parsePIGFingering(pig([
  line(0,0,.4,'A3',-5),line(1,0,.4,'E5',5),
  line(2,.4,.8,'B3',-3),line(3,.4,.8,'D5',4),
  line(4,.8,1.2,'C4',-1),line(5,.8,1.2,'C5',3)
 ]));
 const rh=partitionMonophonicHand(p.notes,'RH'),lh=partitionMonophonicHand(p.notes,'LH');
 assert.equal(rh.runs[0].length,3);
 assert.equal(lh.runs[0].length,3);
 assert.equal(rh.skipped.length+lh.skipped.length,0);
});
test('FG-02G both notes in a same-hand held chord are excluded and documented',()=>{
 const p=parsePIGFingering(pig([
  line(0,0,.5,'C4',1),line(1,0,.5,'E4',3),
  line(2,.5,.9,'G4',5),line(3,.9,1.3,'A4',4),
  line(4,1.3,1.7,'G4',3)
 ]));
 const part=partitionMonophonicHand(p.notes,'RH');
 assert.equal(part.skipped.filter(n=>n.reason==='SAME_HAND_POLYPHONY').length,2);
 assert.equal(part.skipped.length,2);
 assert.equal(part.runs.length,1);
 assert.equal(part.runs[0].length,3);
});
test('FG-02G real rests form independent runs, short runs are counted not hidden',()=>{
 const p=parsePIGFingering(pig([
  line(0,0,.3,'C4',1),line(1,.3,.6,'D4',2),
  line(2,2,2.4,'E4',3),line(3,2.4,2.8,'F4',4),line(4,2.8,3.2,'G4',5)
 ]));
 const x=partitionMonophonicHand(p.notes,'RH');
 assert.equal(x.runs.length,1);
 assert.equal(x.runs[0].length,3);
 assert.equal(x.skipped.filter(n=>n.reason==='SHORT_RUN').length,2);
});
test('FG-02G comparison masks author fingering for predictions; pinned case is separate',()=>{
 const p=parsePIGFingering(pig([
  line(0,0,.45,'C4',1),line(1,.45,.9,'D4',2),line(2,.9,1.35,'E4',3),
  line(3,1.35,1.8,'F4',1)
 ]),{sourceId:'example'});
 const output=compareRepertoire(p,{id:'example',label:'unit synthetic'});
 assert.equal(output.sourceNotes,4);
 assert.equal(output.segmented.eligibleNotes,4);
 assert.equal(output.segmented.excludedNotes,0);
 assert.equal(output.baseline.attempted,4);
 assert.equal(output.generalized.attempted,4);
 assert.equal(output.authorPinned.attempted,4);
 assert.equal(output.authorPinned.matched,4);
 assert.equal(output.authorPinned.anchorViolations,0);
});
test('FG-02G pinned fetch is validated against a fixed revision and exact note count',async()=>{
 const entry=corpus.cases[0];
 const text=pig(Array.from({length:entry.expectedNotes},(_,i)=>
  line(i,i*.6,i*.6+.5,'G4',i%5+1)));
 let seenUrl=null;
 const fake=async url=>{seenUrl=url;return {ok:true,url:'https://huggingface.co/test',
  text:async()=>text}};
 const r=await loadRepertoireSource(entry,{download:fake});
 assert.equal(r.parsed.notes.length,entry.expectedNotes);
 assert.match(seenUrl,new RegExp(corpus.revision));
 assert.match(r.sha256,/^[0-9a-f]{64}$/);
});
test('FG-02G changed source note count is a hard error (cannot adjust benchmark silently)',async()=>{
 const entry=corpus.cases[0];
 const fake=async ()=>({ok:true,url:'https://huggingface.co/test',
  text:async()=>pig([line(0,0,.5,'C4',1)])});
 await assert.rejects(loadRepertoireSource(entry,{download:fake}),/SOURCE_NOTE_COUNT_CHANGED/);
});
test('FG-02G rejects manifest path traversal before network request',async()=>{
 await assert.rejects(loadRepertoireSource({id:'evil',path:'../../user-data.txt',
   expectedNotes:1},{download:async()=>{throw Error('SHOULD_NOT_BE_FETCHED')}}),
  /SOURCE_MANIFEST_INVALID/);
});
