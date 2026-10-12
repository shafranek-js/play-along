import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFingeredMidi, compareHandthesiaMidi}
  from '../src/core/handthesia-midi-alignment.mjs';

const u16 = x => [(x >> 8) & 255,x & 255];
const u32 = x => [(x >>> 24)&255,(x >>> 16)&255,(x >>> 8)&255,x&255];
const vlq = x => {const out=[x&127];while(x>>=7)out.unshift((x&127)|128);return out};
const meta = (type,txt) => [0xff,type,...vlq(txt.length),...txt];
const track = data => [...Buffer.from('MTrk'),...u32(data.length),...data];
function midi({channel=0, pitch=60, velocity=90, start=0, end=480,
              tag=null, duplicate=false, tempo=500000, noteCount=1}={}) {
  let messages=[];
  if (tempo !== null) messages.push({at:0,sort:0,bytes:meta(0x51,[...u32(tempo)].slice(1))});
  for(let i=0;i<noteCount;i++) {
    if (tag!==null) messages.push({at:start+i*480,sort:1,bytes:meta(0x01,[...Buffer.from(tag)])});
    messages.push({at:start+i*480,sort:2,bytes:[0x90|channel,pitch,velocity]});
    messages.push({at:end+i*480,sort:-1,bytes:[0x80|channel,pitch,0]});
  }
  if(duplicate) {
    messages.push({at:start,sort:2,bytes:[0x91,pitch,velocity]});
    messages.push({at:end,sort:-1,bytes:[0x81,pitch,0]});
  }
  messages.sort((a,b)=>a.at-b.at||a.sort-b.sort);
  let t=0,bytes=[];
  for(const m of messages){bytes.push(...vlq(m.at-t),...m.bytes);t=m.at}
  bytes.push(0,...meta(0x2f,[]));
  return Uint8Array.from([...Buffer.from('MThd'),...u32(6),...u16(0),...u16(1),...u16(480),...track(bytes)]);
}
const source = (overrides={}) => [{noteId:'xml:P1:0:0:1',partId:'P1',staff:1,voice:'1',
 pitch:60,start:0,duration:.5,...overrides}];
test('FG-04B2 reads R/L fingering tags from adjacent MIDI text events',()=>{
 const f = inspectFingeredMidi(midi({tag:'R3'}));
 assert.equal(f.notes[0].marker,'R3');assert.equal(f.notes[0].endTick,480);
 assert.deepEqual(f.tempoMap,[{tick:0,micros:500000}]);
});
test('FG-04B2 generated fingers only in research report; original frozen',()=>{
 const s=source(), raw=midi(), marked=midi({tag:'L2',channel:5});
 const copy=structuredClone(s);
 const a=compareHandthesiaMidi(raw,marked,s);
 assert.equal(a.status,'compatible');assert.equal(a.summary.generated,1);
 assert.equal(a.notes[0].candidateHand,'LH');assert.equal(a.notes[0].candidateFinger,2);
 assert.equal(a.productionAutoFingeringAllowed,false);assert.deepEqual(s,copy);
});
test('FG-04B2 author conflicts marked and never automatically accepted',()=>{
 const a=compareHandthesiaMidi(midi(),midi({tag:'R4'}),source({finger:2,fingeringSource:'musicxml'}));
 assert.equal(a.status,'conflicts');assert.equal(a.summary.conflicts,1);
});
test('FG-04B2 refuses timing, velocity and tempo edits separately',()=>{
 const ref=midi();
 for (const altered of [midi({end:479,tag:'R2'}),midi({velocity:91,tag:'R2'}),midi({tempo:510000,tag:'R2'})]){
  assert.equal(compareHandthesiaMidi(ref,altered,source()).status,'rejected');
 }
});
test('FG-04B2 refuses overlapping unisons without guessing a source ID',()=>{
 assert.equal(compareHandthesiaMidi(midi({duplicate:true}),midi({duplicate:true}),
  source().concat(source({noteId:'xml:P2:1:0:1'}))).status,'rejected');
});
test('FG-04B2 refuses mismatched MusicXML identities, ties or missing source notes',()=>{
 assert.equal(compareHandthesiaMidi(midi(),midi({tag:'R2'}),source({start:1})).status,'rejected');
 assert.equal(compareHandthesiaMidi(midi(),midi({tag:'R2'}),[]).status,'rejected');
});
test('FG-04B2 finger-only markers have unknown hand, not an invented one',()=>{
 const a=compareHandthesiaMidi(midi(),midi({tag:'F1'}),source());
 assert.equal(a.summary.unknownHand,1);assert.equal(a.notes[0].candidateHand,null);
});
test('FG-04B2 bad raw input and unpaired note events fail closed',()=>{
 assert.equal(compareHandthesiaMidi(new Uint8Array(),midi(),source()).status,'rejected');
 const b=midi({tag:'R2'});b[b.length-10]=0x90;
 assert.equal(compareHandthesiaMidi(midi(),b,source()).status,'rejected');
});
test('FG-04B2 same pitch at distinct starts remains deterministically identifiable',()=>{
 const ref=midi({noteCount:2});
 const s=source().concat(source({noteId:'xml:P1:0:0:2',start:.5}));
 const a=compareHandthesiaMidi(ref,midi({noteCount:2,tag:'R2'}),s);
 assert.equal(a.status,'compatible');assert.equal(a.summary.generated,2);
});
