import test from 'node:test';
import assert from 'node:assert/strict';
import {alignNormalizedScoreToMidi}
 from '../src/core/score-midi-event-alignment.mjs';

const be16=v=>[(v>>8)&255,v&255];
const be32=v=>[(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255];
function variable(x){const a=[x&127];while(x>>=7)a.unshift((x&127)|128);return a}
const meta=(kind,b)=>[255,kind,...variable(b.length),...b];
function fixture(events,{tempos=[{tick:0,micros:500000}],format=0}={}){
 const commands=[];
 for(const [i,n] of events.entries()){
  commands.push({tick:n.startTick,priority:2,seq:i,bytes:[0x90|(n.channel||0),n.pitch,n.velocity||90]});
  commands.push({tick:n.endTick,priority:0,seq:i,bytes:[0x80|(n.channel||0),n.pitch,0]});
 }
 for(const [i,t] of tempos.entries())
  commands.push({tick:t.tick,priority:1,seq:i,bytes:meta(0x51,be32(t.micros).slice(1))});
 commands.sort((a,b)=>a.tick-b.tick||a.priority-b.priority||a.seq-b.seq);
 let last=0,body=[];
 for(const e of commands){body.push(...variable(e.tick-last),...e.bytes);last=e.tick}
 body.push(0,...meta(0x2f,[]));
 const track=[...Buffer.from('MTrk'),...be32(body.length),...body];
 return Uint8Array.from([...Buffer.from('MThd'),...be32(6),
   ...be16(format),...be16(1),...be16(480),...track]);
}
const n=(id,pitch,start,duration,extra={})=>({
 noteId:'xml:P1:0:0:'+id,partId:'P1',staff:1,voice:'1',pitch,start,duration,...extra
});
const event=(pitch,startTick=0,endTick=480,channel=0)=>({pitch,startTick,endTick,channel});
const check=(s,m)=>alignNormalizedScoreToMidi(s,m);
test('FG-04B3a: precise one-to-one match binds source IDs to MIDI notes without editing',()=>{
 const source=[n(1,60,0,.5),n(2,64,.5,.5)];
 const before=structuredClone(source);
 const r=check(source,fixture([event(60),event(64,480,960)]));
 assert.equal(r.status,'aligned');
 assert.equal(r.summary.matched,2);
 assert.equal(r.links[0].noteId,source[0].noteId);
 assert.equal(r.productionAutoFingeringAllowed,false);
 assert.equal(r.scoreXmlSemanticValidation,false);
 assert.deepEqual(source,before);
});
test('FG-04B3a: parallel left/right voices match via pitch/onset/release not channel',()=>{
 const source=[n(1,60,0,.5,{voice:'1',staff:1}),n(2,48,0,1,{voice:'2',staff:2})];
 const r=check(source,fixture([event(60),event(48,0,960,5)]));
 assert.equal(r.status,'aligned');assert.equal(r.links.length,2);
 assert.equal(r.links[1].midiChannel,5);
 assert.equal(r.links[1].staff,2);
});
test('FG-04B3a: score events may arrive in a different order than MIDI',()=>{
 const source=[n(2,67,.5,.5),n(1,60,0,.5)];
 const r=check(source,fixture([event(60),event(67,480,960)]));
 assert.equal(r.status,'aligned');assert.equal(r.links[0].pitch,67);
});
test('FG-04B3a: respects MIDI tempo changes when matching onset and offset',()=>{
 const source=[n(1,60,0,.5),n(2,62,.5,1)];
 const midi=fixture([event(60),event(62,480,960)],
  {tempos:[{tick:0,micros:500000},{tick:480,micros:1000000}]});
 assert.equal(check(source,midi).status,'aligned');
 assert.equal(check([source[0],{...source[1],duration:.5}],midi).status,'rejected');
});
test('FG-04B3a: source and MIDI timestamp error capped to 2 ms',()=>{
 const score=[n(1,60,.001,.5)];
 assert.equal(check(score,fixture([event(60)])).status,'aligned');
 assert.equal(check([n(1,60,.003,.5)],fixture([event(60)])).status,'rejected');
});
test('FG-04B3a: rejects even one shifted note, end time or pitch',()=>{
 const midi=fixture([event(60)]);
 for(const source of [[n(1,61,0,.5)],[n(1,60,.01,.49)],[n(1,60,0,.49)]]){
  const r=check(source,midi);
  assert.equal(r.status,'rejected');assert.equal(r.reason,'SCORE_EVENT_UNMATCHED');
 }
});
test('FG-04B3a: ambiguous same pitch, onset and release across channels rejected',()=>{
 const data=fixture([event(60,0,480,0),event(60,0,480,1)]);
 const score=[n(1,60,0,.5),n(2,60,0,.5)];
 const result=check(score,data);
 assert.equal(result.status,'rejected');
 assert.equal(result.reason,'AMBIGUOUS_MIDI_EVENT_CANDIDATES');
});
test('FG-04B3a: two close candidates within 2 ms are ambiguous even if one exact',()=>{
 const data=fixture([event(60,0,480,0),event(60,1,481,1)]);
 const score=[n(1,60,0,.5),n(2,60,1/960,.5)];
 const result=check(score,data);
 assert.equal(result.status,'rejected');
 assert.equal(result.reason,'AMBIGUOUS_MIDI_EVENT_CANDIDATES');
});
test('FG-04B3a: two distinct source IDs cannot claim one MIDI event',()=>{
 const data=fixture([event(60),event(64)]);
 const source=[n(1,60,0,.5),n(2,60,0,.5)];
 const result=check(source,data);
 assert.equal(result.status,'rejected');
 assert.equal(result.reason,'MIDI_EVENT_MATCHED_TO_MULTIPLE_SCORE_NOTES');
});
test('FG-04B3a: changed count, missing source, extra MIDI events fail closed',()=>{
 assert.equal(check([n(1,60,0,.5)],fixture([event(60),event(64)])).reason,
  'SCORE_MIDI_NOTE_COUNT_MISMATCH');
 assert.equal(check([],fixture([event(60)])).status,'rejected');
});
test('FG-04B3a: duplicate canonical ID / bad voice / bad staff are rejected',()=>{
 const a=n(1,60,0,.5),b=n(1,64,.5,.5);
 for(const score of [[a,b],[{...a,voice:''}],[{...a,staff:0}]]){
  const r=check(score,fixture(score.length===2?[event(60),event(64,480,960)]:[event(60)]));
  assert.equal(r.status,'rejected');
  assert.equal(r.reason,'INVALID_OR_DUPLICATE_SOURCE_NOTE_IDENTITY');
 }
});
test('FG-04B3a: tie provenance cannot contain duplicate or cross-note segments',()=>{
 const one=n(1,60,0,.5,{sourceNoteIds:['xml:P1:0:1:2','xml:P1:0:1:2']});
 assert.equal(check([one],fixture([event(60)])).reason,'DUPLICATE_SOURCE_TIE_SEGMENT');
 const a=n(1,60,0,.5,{sourceNoteIds:['xml:P1:0:2:3']});
 const b=n(2,64,.5,.5,{sourceNoteIds:['xml:P1:0:2:3']});
 assert.equal(check([a,b],fixture([event(60),event(64,480,960)])).reason,
  'DUPLICATE_SOURCE_SEGMENT_ID');
});
test('FG-04B3a: valid linked tie identities kept, not invented or rewritten',()=>{
 const a=n(1,60,0,1,{sourceNoteIds:['xml:P1:0:1:1','xml:P1:0:2:1']});
 const r=check([a],fixture([event(60,0,960)]));
 assert.equal(r.status,'aligned');
 assert.deepEqual(r.links[0].sourceNoteIds,a.sourceNoteIds);
 assert.equal(r.sourceTieConsolidationValidated,false);
});
test('FG-04B3a: rejects unsupported MIDI bytes and untrusted source metadata',()=>{
 assert.equal(check([n(1,60,0,.5)],new Uint8Array([0,1,2])).status,'rejected');
 assert.equal(check([n(1,60,0,.5,{noteId:'fake-id'})],fixture([event(60)])).status,'rejected');
 const invalid=fixture([event(60)]);
 invalid[0]=0;
 assert.equal(check([n(1,60,0,.5)],invalid).status,'rejected');
});
test('FG-04B3a: independent output never declares XML parsing, repeat or piano expertise',()=>{
 const r=check([n(1,60,0,.5)],fixture([event(60)]));
 assert.equal(r.status,'aligned');
 assert.equal(r.scoreXmlSemanticValidation,false);
 assert.equal(r.sourceRepeatExpansionValidated,false);
 assert.equal(r.sourceTieConsolidationValidated,false);
 assert.equal(r.productionAutoFingeringAllowed,false);
 assert.equal(r.links[0].finger,undefined);
});
