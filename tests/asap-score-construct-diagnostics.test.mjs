import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSourceMidiAnomalies,inspectMusicXmlNotationMarkers,
 summarizeSourceDiagnostics}
 from '../src/core/asap-score-construct-diagnostics.mjs';

const be16=n=>[(n>>8)&255,n&255];
const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const vl=n=>{const b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b};
function midi(tracks,{format=tracks.length===1?0:1,division=480}={}){
 const header=[...Buffer.from('MThd'),...be32(6),...be16(format),
  ...be16(tracks.length),...be16(division)];
 const parts=tracks.flatMap(events=>{
  const body=[];let last=0;
  for(const {tick,bytes} of events){
   body.push(...vl(tick-last),...bytes);last=tick;
  }
  body.push(0,255,47,0);
  return [...Buffer.from('MTrk'),...be32(body.length),...body];
 });
 return Uint8Array.from([...header,...parts]);
}
const on=(tick,pitch=60,channel=0)=>({tick,bytes:[0x90|channel,pitch,100]});
const off=(tick,pitch=60,channel=0)=>({tick,bytes:[0x80|channel,pitch,0]});
const metaTempo=(tick=0)=>({tick,bytes:[255,81,3,7,161,32]});
const xml=inner=>'<?xml version="1.0"?><score-partwise version="3.1"><part-list/>'+
 '<part id="P1"><measure number="1">'+inner+'</measure></part></score-partwise>';
test('FG-04B3d: zero-tick note is enumerated but never lengthened',()=>{
 const src=midi([[on(0),off(0)]]);
 const frozen=Uint8Array.from(src);
 const r=inspectSourceMidiAnomalies(src);
 assert.equal(r.numberOfNotes,1);
 assert.equal(r.zeroLengthNotes,1);
 assert.deepEqual(r.zeroEvents,[{track:0,channel:0,pitch:60,tick:0}]);
 assert.equal(r.zeroNotesRepaired,false);
 assert.equal(r.canAssertAllNoteTiming,false);
 assert.deepEqual(src,frozen);
});
test('FG-04B3d: ordinary notes count separately and zero note is not dropped',()=>{
 const r=inspectSourceMidiAnomalies(midi([[
  metaTempo(),on(0),off(480),on(480,61),off(480,61)
 ]]));
 assert.equal(r.tempoEvents,1);
 assert.equal(r.positiveNotes,1);
 assert.equal(r.zeroLengthNotes,1);
 assert.equal(r.numberOfNotes,2);
});
test('FG-04B3d: two tracks and channels preserve their original tick locations',()=>{
 const r=inspectSourceMidiAnomalies(midi([
  [on(0,48),off(0,48)],
  [on(200,62,5),off(200,62,5),on(300,64),off(600,64)]
 ]));
 assert.equal(r.format,1);
 assert.equal(r.tracks,2);
 assert.equal(r.numberOfNotes,3);
 assert.deepEqual(r.zeroEvents,[{track:0,channel:0,pitch:48,tick:0},
  {track:1,channel:5,pitch:62,tick:200}]);
});
test('FG-04B3d: note-on with velocity zero is a note-off',()=>{
 const r=inspectSourceMidiAnomalies(midi([[on(0),{tick:0,bytes:[0x90,60,0]}]]));
 assert.equal(r.zeroLengthNotes,1);
});
test('FG-04B3d: valid MIDI running status accepted without guessed notes',()=>{
 const r=inspectSourceMidiAnomalies(midi([[on(0),
  {tick:100,bytes:[60,0]}, // uses 0x90 running status
  {tick:100,bytes:[62,90]},
  {tick:300,bytes:[62,0]}
 ]]));
 assert.equal(r.numberOfNotes,2);
 assert.equal(r.zeroLengthNotes,0);
});
test('FG-04B3d: same-channel overlapping pitch refuses ambiguity',()=>{
 assert.throws(()=>inspectSourceMidiAnomalies(midi([
  [on(0),on(10),off(20)]
 ])),/SOURCE_MIDI_AMBIGUOUS_SAME_KEY_OVERLAP/);
});
test('FG-04B3d: orphan note-off and hanging note-on refuse',()=>{
 assert.throws(()=>inspectSourceMidiAnomalies(midi([[off(0)]])),
  /SOURCE_MIDI_ORPHAN_NOTE_OFF/);
 assert.throws(()=>inspectSourceMidiAnomalies(midi([[on(0)]])),
  /SOURCE_MIDI_UNFINISHED_TRACK/);
});
test('FG-04B3d: malformed MIDI and SMPTE timing cannot enter diagnostics',()=>{
 const original=midi([[on(0),off(100)]]);
 const damaged=Uint8Array.from(original);damaged[0]=0;
 assert.throws(()=>inspectSourceMidiAnomalies(damaged),/SOURCE_MIDI_BAD_HEADER/);
 assert.throws(()=>inspectSourceMidiAnomalies(midi([[on(0),off(100)]],
  {division:0xe728})),/SOURCE_MIDI_UNSUPPORTED_FORMAT/);
 assert.throws(()=>inspectSourceMidiAnomalies(new Uint8Array(10)),
  /SOURCE_MIDI_INVALID_SIZE/);
});
test('FG-04B3d: lexical repeat and grace counts with author timing attributes',()=>{
 const score=xml('<note><grace slash="yes" steal-time-following="8"/>'+
  '<pitch><step>C</step><octave>4</octave></pitch></note>'+
  '<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>'+
  '<barline><repeat direction="forward"/></barline>'+
  '<barline><repeat direction="backward"/><ending number="1" type="stop"/></barline>'+
  '<direction><sound dacapo="yes"/></direction>');
 const r=inspectMusicXmlNotationMarkers(score);
 assert.equal(r.graceMarkers,2);
 assert.equal(r.graceWithTimingAttributes,1);
 assert.equal(r.graceWithoutTimingAttributes,1);
 assert.equal(r.forwardRepeats,1);
 assert.equal(r.backwardRepeats,1);
 assert.equal(r.repeatMarkers,2);
 assert.equal(r.endingMarkers,1);
 assert.equal(r.scoreNavigationSoundMarkers,1);
 assert.equal(r.graceTimingValidated,false);
 assert.equal(r.repeatExpansionValidated,false);
});
test('FG-04B3d: notation comments do not count as played score markings',()=>{
 const score=xml('<!-- <grace/> <repeat direction="backward"/> -->'+
  '<note><pitch><step>E</step><octave>4</octave></pitch></note>');
 const r=inspectMusicXmlNotationMarkers(score);
 assert.equal(r.graceMarkers,0);
 assert.equal(r.repeatMarkers,0);
});
test('FG-04B3d: XML entity/CDATA and timewise sources fail closed',()=>{
 assert.throws(()=>inspectMusicXmlNotationMarkers(xml('<!ENTITY evil SYSTEM "file:">')),
  /SOURCE_XML_ENTITY_DISALLOWED/);
 assert.throws(()=>inspectMusicXmlNotationMarkers(xml('<![CDATA[abc]]>')),
  /SOURCE_XML_ENTITY_DISALLOWED/);
 assert.throws(()=>inspectMusicXmlNotationMarkers('<score-timewise></score-timewise>'),
  /SOURCE_XML_PARTWISE_REQUIRED/);
});
const piece=(id,i=0)=>({
 id, midi:{numberOfNotes:20+i,zeroLengthNotes:i===1?3:0,zeroEvents:[{
  pitch:60,track:1,tick:960,channel:0
 }]},
 musicxml:{graceMarkers:i===2?4:0,graceWithTimingAttributes:0,
  repeatMarkers:i===3?2:0,endingMarkers:i===3?1:0,
  scoreNavigationSoundMarkers:0}
});
test('FG-04B3d: aggregate 16-piece report contains no notes/pitches/raw data',()=>{
 const list=Array.from({length:16},(_,i)=>piece('asap-'+i,i));
 const frozen=structuredClone(list);
 const report=summarizeSourceDiagnostics(list);
 assert.equal(report.casesChecked,16);
 assert.equal(report.totals.zeroLengthNotes,3);
 assert.equal(report.totals.graceMarkers,4);
 assert.equal(report.totals.repeatMarkers,2);
 assert.deepEqual(report.piecesWithZeroMidiNotes,['asap-1']);
 assert.equal(report.musicAltered,false);
 assert.equal(report.productionAutoFingeringAllowed,false);
 assert.ok(!JSON.stringify(report).includes('"pitch"'));
 assert.ok(!JSON.stringify(report).includes('"tick"'));
 assert.deepEqual(list,frozen);
});
test('FG-04B3d: incomplete/duplicate/out-of-range audit cases refused',()=>{
 const list=Array.from({length:16},(_,i)=>piece('asap-'+i));
 assert.throws(()=>summarizeSourceDiagnostics(list.slice(1)),
  /SOURCE_DIAGNOSTIC_SCOPE_MISMATCH/);
 list[1].id=list[0].id;
 assert.throws(()=>summarizeSourceDiagnostics(list),
  /SOURCE_DIAGNOSTIC_DUPLICATE_CASE/);
 list[1].id='asap-1';list[1].midi.zeroLengthNotes=50;
 assert.throws(()=>summarizeSourceDiagnostics(list),
  /SOURCE_DIAGNOSTIC_INVALID_MIDI/);
});
