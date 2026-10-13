import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMusicXmlRepeatControls,planMusicXmlRepeatTraversal,
 expandMusicXmlRepeatNotes,matchRepeatExpansionToMidi}
 from '../src/core/musicxml-repeat-traversal.mjs';

const ctrl=(n,events,durations=Array(n).fill(1))=>({
 measureNumbers:Array.from({length:n},(_,i)=>String(i+1)),durations,events,
 partIds:['P1']
});
const F=b=>({boundary:b,kind:'forward'});
const B=b=>({boundary:b,kind:'backward',times:2});
const S=(b,number)=>({boundary:b,kind:'endingStart',number});
const E=(b,number,type='stop')=>({boundary:b,kind:'endingStop',number,type});
const seq=p=>p.visits.map(v=>v.measureIndex);
const plan=c=>planMusicXmlRepeatTraversal(c);
const L=s=>'<barline location="left">'+s+'</barline>';
const R=s=>'<barline location="right">'+s+'</barline>';
const fw='<repeat direction="forward"/>';
const bw='<repeat direction="backward"/>';
const start=n=>'<ending number="'+n+'" type="start"/>';
const stop=n=>'<ending number="'+n+'" type="stop"/>';
const xml=measures=>'<score-partwise version="3.1"><part-list/>'+
 '<part id="P1">'+measures.map((body,i)=>
 '<measure number="'+(i+1)+'">'+body+'</measure>').join('')+
 '</part></score-partwise>';
const note=(measureIndex,pitch,startBeat=0,durationBeats=1,voice='1',ordinal=1)=>({
 sourceNoteId:'xml:P1:0:'+measureIndex+':'+ordinal,
 measureIndex,partId:'P1',voice,staff:1,pitch,startBeat,durationBeats
});
const indices=expanded=>expanded.notes.map(n=>n.measureIndex);
const onoff=notes=>notes.map(n=>({pitch:n.pitch,start:n.startBeat*480,
 end:n.endBeat*480}));
const be16=n=>[(n>>8)&255,n&255];
const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const vlq=n=>{const bytes=[n&127];while(n>>=7)bytes.unshift((n&127)|128);return bytes};
function midi(pairs,tempoEvents=[]){
 const commands=[...tempoEvents.map(t=>({tick:t.tick,prio:0,
 bytes:[255,81,3,(t.micros>>16)&255,(t.micros>>8)&255,t.micros&255]}))];
 for(const p of pairs){
  commands.push({tick:p.start,prio:2,bytes:[0x90,p.pitch,80]});
  commands.push({tick:p.end,prio:1,bytes:[0x80,p.pitch,0]});
 }
 commands.sort((a,b)=>a.tick-b.tick||a.prio-b.prio);
 let last=0;const track=[];
 for(const e of commands){
  assert.ok(Number.isSafeInteger(e.tick)&&e.tick>=last);
  track.push(...vlq(e.tick-last),...e.bytes);last=e.tick;
 }
 track.push(0,255,47,0);
 return Uint8Array.from([...Buffer.from('MThd'),...be32(6),...be16(0),
  ...be16(1),...be16(480),...Buffer.from('MTrk'),...be32(track.length),...track]);
}

test('plain forward/backward replay has four visits and exact beat positions',()=>{
 const p=plan(ctrl(2,[F(0),B(2)]));
 assert.deepEqual(seq(p),[0,1,0,1]);
 assert.deepEqual(p.visits.map(v=>v.startBeat),[0,1,2,3]);
 assert.deepEqual(p.visits.map(v=>v.iteration),[1,1,2,2]);
 assert.equal(p.performedBeats,4);
});
test('implicit forward from start is supported once',()=>{
 assert.deepEqual(seq(plan(ctrl(2,[B(2)]))),[0,1,0,1]);
});
test('pair of first/second endings skips first ending on second pass',()=>{
 const p=plan(ctrl(4,[F(0),S(2,'1'),E(3,'1'),B(3),
  S(3,'2'),E(4,'2')]));
 assert.deepEqual(seq(p),[0,1,2,0,1,3]);
 assert.deepEqual(p.visits.map(v=>v.iteration),[1,1,1,2,2,2]);
 assert.equal(p.performedBeats,6);
});
test('first ending with several measures and second ending discontinue',()=>{
 const p=plan(ctrl(5,[F(0),S(1,'1'),E(3,'1'),B(3),
  S(3,'2'),E(4,'2','discontinue')]));
 assert.deepEqual(seq(p),[0,1,2,0,3,4]);
});
test('consecutive disjoint repeat blocks at same barline',()=>{
 assert.deepEqual(seq(plan(ctrl(4,[F(0),B(2),F(2),B(4)]))),
  [0,1,0,1,2,3,2,3]);
});
test('pickup and uneven measure durations preserved, never padded',()=>{
 const p=plan(ctrl(3,[F(1),B(3)],[.5,1.25,.75]));
 assert.deepEqual(seq(p),[0,1,2,1,2]);
 assert.deepEqual(p.visits.map(v=>v.startBeat),[0,.5,1.75,2.5,3.75]);
 assert.equal(p.performedBeats,4.5);
});
test('repeat in independent simultaneous voices preserves source IDs',()=>{
 const p=plan(ctrl(1,[F(0),B(1)]));
 const originals=[note(0,60,0,1,'1',1),note(0,55,0,1,'2',2)];
 const frozen=structuredClone(originals);
 const out=expandMusicXmlRepeatNotes(p,originals);
 assert.equal(out.notes.length,4);
 assert.deepEqual(out.notes.map(n=>n.sourceNoteId),
  [originals[1].sourceNoteId,originals[0].sourceNoteId,
   originals[1].sourceNoteId,originals[0].sourceNoteId]);
 assert.deepEqual(out.notes.map(n=>n.voice),['2','1','2','1']);
 assert.equal(new Set(out.notes.map(n=>n.playbackId)).size,4);
 assert.deepEqual(originals,frozen);
 assert.equal(out.originalNoteIdsUnchanged,true);
});
test('rests and chord simultaneity follow independent source onset',()=>{
 const p=plan(ctrl(1,[B(1)],[1]));
 const input=[note(0,60,.25,.5,'1',1),note(0,64,.25,.5,'1',2)];
 const out=expandMusicXmlRepeatNotes(p,input);
 assert.deepEqual(out.notes.map(n=>n.startBeat),[.25,.25,1.25,1.25]);
 assert.deepEqual(out.notes.map(n=>n.endBeat),[.75,.75,1.75,1.75]);
});
test('two parts with identical controls accepted',()=>{
 const original=xml([L(fw),R(bw)]);
 const second='<part id="P2">'+['1','2'].map((n,i)=>
  '<measure number="'+n+'">'+(i===0?L(fw):R(bw))+'</measure>').join('')+'</part>';
 const parsed=parseMusicXmlRepeatControls(original.replace('</score-partwise>',second+'</score-partwise>'));
 assert.deepEqual(parsed.partIds,['P1','P2']);
 assert.deepEqual(seq(plan({...parsed,durations:[1,1]})),[0,1,0,1]);
});
test('actual MusicXML barlines 1st/2nd ending use physical boundaries',()=>{
 const parsed=parseMusicXmlRepeatControls(xml([
  L(fw),'',L(start('1'))+R(stop('1')+bw),
  L(start('2'))+R(stop('2'))
 ]));
 assert.deepEqual(seq(plan({...parsed,durations:[1,1,1,1]})),
  [0,1,2,0,1,3]);
});
test('first ending may start at previous measure right barline',()=>{
 const parsed=parseMusicXmlRepeatControls(xml([
  L(fw),'',R(start('1')),R(stop('1')+bw),
  L(start('2'))+R(stop('2'))
 ]));
 assert.deepEqual(seq(plan({...parsed,durations:[1,1,1,1,1]})),
  [0,1,2,3,0,1,2,4]);
});
test('XML comments containing repeat markers are not performed',()=>{
 const parsed=parseMusicXmlRepeatControls(xml([
  '<!-- <barline><repeat direction="forward"/></barline> -->',R(bw)
 ]));
 assert.deepEqual(seq(plan({...parsed,durations:[1,1]})),[0,1,0,1]);
});
test('score navigation Dal Segno refuses rather than invents playing order',()=>{
 assert.throws(()=>parseMusicXmlRepeatControls(xml([
  '<direction><sound dalsegno="segno1"/></direction>'
 ])),/REPEAT_SCORE_NAVIGATION_UNSUPPORTED/);
});
test('partially annotated part repeats must not synchronize by guessing',()=>{
 const source=xml([L(fw),R(bw)]);
 const second='<part id="P2"><measure number="1"/><measure number="2"/></part>';
 assert.throws(()=>parseMusicXmlRepeatControls(
  source.replace('</score-partwise>',second+'</score-partwise>')),
 /REPEAT_PARTS_NOT_SYNCHRONIZED/);
});
test('unknown repeat count, invalid barline positions and ending label refuse',()=>{
 assert.throws(()=>parseMusicXmlRepeatControls(xml([R('<repeat direction="backward" times="3"/>')])),
  /REPEAT_COUNT_UNSUPPORTED/);
 assert.throws(()=>parseMusicXmlRepeatControls(xml([R(fw)])),
  /REPEAT_FORWARD_POSITION_UNSUPPORTED/);
 assert.throws(()=>parseMusicXmlRepeatControls(xml([L(start('1,2'))])),
  /REPEAT_ENDING_NUMBER_UNSUPPORTED/);
});
test('nested, unclosed and repeated implicit starts refuse',()=>{
 assert.throws(()=>plan(ctrl(3,[F(0),F(1),B(3)])),/REPEAT_NESTED_UNSUPPORTED/);
 assert.throws(()=>plan(ctrl(3,[F(0)])),/REPEAT_FORWARD_WITHOUT_BACKWARD/);
 assert.throws(()=>plan(ctrl(4,[B(2),B(4)])),/REPEAT_IMPLICIT_START_AMBIGUOUS/);
});
test('orphan endings, unpaired volta and overlapping ending spans refuse',()=>{
 assert.throws(()=>plan(ctrl(3,[E(1,'1')])),/REPEAT_ENDING_UNPAIRED/);
 assert.throws(()=>plan(ctrl(3,[F(0),S(1,'1'),E(2,'1'),B(2)])),
  /REPEAT_ENDING_PAIR_REQUIRED/);
 assert.throws(()=>plan(ctrl(3,[F(0),S(1,'1'),S(2,'2'),E(3,'1'),B(3)])),
  /REPEAT_ENDING_OVERLAP_OR_NUMBER/);
});
test('malformed measure durations and visit limit fail closed',()=>{
 assert.throws(()=>plan(ctrl(2,[B(2)],[1,0])),/REPEAT_INVALID_MEASURE_DURATION/);
 assert.throws(()=>planRepeatWithLimit(),/REPEAT_VISIT_LIMIT/);
 function planRepeatWithLimit(){
  return planMusicXmlRepeatTraversal(ctrl(2,[B(2)]),{maxVisits:3});
 }
});
test('input with 6000 measures refuses before computation',()=>{
 assert.throws(()=>plan(ctrl(6000,[])),/REPEAT_PLAN_INVALID_INPUT/);
});
test('source note duration, IDs and measure bounds must be trustworthy',()=>{
 const p=plan(ctrl(1,[B(1)]));
 assert.throws(()=>expandMusicXmlRepeatNotes(p,[note(0,60),note(0,61)]),
  /REPEAT_WRITTEN_NOTE_INVALID_OR_DUPLICATE/);
 assert.throws(()=>expandMusicXmlRepeatNotes(p,[note(0,60,.5,1)]),
  /REPEAT_NOTE_OVERRUNS_MEASURE/);
});
test('actual onset AND release matching after repeat is independently required',()=>{
 const p=plan(ctrl(2,[B(2)]));
 const expansion=expandMusicXmlRepeatNotes(p,[note(0,60),note(1,62)]);
 const reference=midi(onoff(expansion.notes));
 const success=matchRepeatExpansionToMidi(expansion,reference);
 assert.equal(success.status,'aligned');
 assert.equal(success.links.length,4);
 assert.deepEqual(success.links.map(x=>x.iteration),[1,1,2,2]);
 assert.equal(success.scoreTempoIndependentlyValidated,false);
 assert.equal(success.productionAutoFingeringAllowed,false);
 const wrongEnd=midi([{pitch:60,start:0,end:460},
  {pitch:62,start:480,end:960},{pitch:60,start:960,end:1440},
  {pitch:62,start:1440,end:1920}]);
 assert.equal(matchRepeatExpansionToMidi(expansion,wrongEnd).status,'rejected');
});
test('changed MIDI tempo map preserves beat identity but not independent XML tempo validation',()=>{
 const p=plan(ctrl(2,[B(2)]));
 const expansion=expandMusicXmlRepeatNotes(p,[note(0,60),note(1,62)]);
 const result=matchRepeatExpansionToMidi(expansion,
  midi(onoff(expansion.notes),[{tick:0,micros:500000},{tick:960,micros:1000000}]));
 assert.equal(result.status,'aligned');
 assert.equal(result.scoreTempoIndependentlyValidated,false);
});
test('recognition is not a match: wrong pitch or note count stays rejected',()=>{
 const exp=expandMusicXmlRepeatNotes(plan(ctrl(1,[B(1)])),[note(0,60)]);
 assert.equal(exp.scoreMidiAlignmentValidated,false);
 assert.equal(matchRepeatExpansionToMidi(exp,midi([{pitch:61,start:0,end:480},
  {pitch:61,start:480,end:960}])).status,'rejected');
 assert.equal(matchRepeatExpansionToMidi(exp,midi([{pitch:60,start:0,end:480}])).status,'rejected');
});
test('ties are carried but never silently consolidated across repeat boundaries',()=>{
 const source=note(0,60);source.tieStart=true;
 const exp=expandMusicXmlRepeatNotes(plan(ctrl(1,[B(1)])),[source]);
 assert.equal(exp.notes[0].tieStart,true);
 assert.equal(matchRepeatExpansionToMidi(exp,midi(onoff(exp.notes))).reason,
  'REPEAT_TIE_CONSOLIDATION_UNSUPPORTED');
});
