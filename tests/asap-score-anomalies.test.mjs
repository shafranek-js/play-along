import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectScoreMidiAnomalies,inspectScoreXmlNotationFeatures,
 summarizeScoreAnomalies} from '../src/core/asap-score-anomalies.mjs';

const be16=n=>[(n>>8)&255,n&255];
const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a}
function track(events){
 let tick=0,body=[];
 for(const e of events){body.push(...vlq(e.tick-tick),...e.bytes);tick=e.tick;}
 body.push(0,255,47,0);
 return [...Buffer.from('MTrk'),...be32(body.length),...body];
}
function midi(tracks){
 const fmt=tracks.length===1?0:1;
 return Uint8Array.from([...Buffer.from('MThd'),...be32(6),
  ...be16(fmt),...be16(tracks.length),...be16(480),...tracks.flatMap(track)]);
}
const ev=(tick,...bytes)=>({tick,bytes});
const score=body=>'<?xml version="1.0"?><score-partwise version="3.1"><part id="P1">'+body+'</part></score-partwise>';

test('FG-04B3d: independent full-duration MIDI inspection is read-only',()=>{
 const data=midi([[ev(0,0x90,60,80),ev(480,0x80,60,0)]]);
 const before=Uint8Array.from(data);
 const report=inspectScoreMidiAnomalies(data);
 assert.equal(report.status,'inspected');
 assert.equal(report.tracks,1);
 assert.equal(report.noteOns,1);
 assert.equal(report.pairedNotes,1);
 assert.equal(report.zeroLengthNotes,0);
 assert.equal(report.originalMidiEdited,false);
 assert.equal(report.productionAutoFingeringAllowed,false);
 assert.deepEqual(data,before);
 assert.equal(JSON.stringify(report).includes('"pitch"'),false);
});
test('FG-04B3d: a zero-tick NoteOn/Off is counted but never fixed',()=>{
 const raw=midi([[ev(0,0x90,60,100),ev(0,0x80,60,0)]]);
 const result=inspectScoreMidiAnomalies(raw);
 assert.equal(result.zeroLengthNotes,1);
 assert.equal(result.zeroByTrack[0].count,1);
 assert.equal(result.inferredNoteDuration,false);
 assert.equal(result.zeroNotesDiscarded,false);
 assert.equal(result.noteOns,1);
});
test('FG-04B3d: velocity-zero note-off and MIDI running status',()=>{
 const raw=midi([[ev(0,0x90,60,80),ev(240,60,0),
  ev(240,0x90,62,80),ev(240,62,0)]]);
 const r=inspectScoreMidiAnomalies(raw);
 assert.equal(r.pairedNotes,2);
 assert.equal(r.zeroLengthNotes,1);
 assert.equal(r.unpairedNoteOffs,0);
});
test('FG-04B3d: source ambiguities are counted rather than guessed',()=>{
 const raw=midi([[ev(0,0x90,60,80),ev(240,0x90,60,80),
  ev(480,0x80,60,0),ev(480,0x80,60,0),
  ev(480,0x80,62,0),ev(480,0x90,64,60)]]);
 const r=inspectScoreMidiAnomalies(raw);
 assert.equal(r.overlappingSameChannelStarts,1);
 assert.equal(r.unpairedNoteOffs,2);
 assert.equal(r.danglingNoteOns,1);
 assert.equal(r.productionAutoFingeringAllowed,false);
});
test('FG-04B3d: by-track zero durations and sustain controller',()=>{
 const raw=midi([[ev(0,0x90,60,80),ev(0,0x80,60,0)],
  [ev(0,0x90,72,80),ev(480,0x80,72,0),
   ev(480,0xb0,64,127),ev(960,0xb0,64,0)]]);
 const r=inspectScoreMidiAnomalies(raw);
 assert.equal(r.format,1);assert.equal(r.tracks,2);
 assert.equal(r.zeroLengthNotes,1);
 assert.deepEqual(r.zeroByTrack,[{trackIndex:0,count:1},{trackIndex:1,count:0}]);
 assert.equal(r.sustainPedalEvents,2);
 assert.equal(r.division,480);
});
test('FG-04B3d: rejects corrupt MIDI bytes and SMPTE division',()=>{
 assert.throws(()=>inspectScoreMidiAnomalies(new Uint8Array([1,2,3])),
  /INVALID_DIAGNOSTIC_MIDI_SIZE/);
 const raw=midi([[ev(0,0x90,60,80),ev(480,0x80,60,0)]]);
 const broken=Uint8Array.from(raw);broken[0]=0;
 assert.throws(()=>inspectScoreMidiAnomalies(broken),
  /INVALID_DIAGNOSTIC_MIDI_HEADER/);
 const smpte=Uint8Array.from(raw);smpte[12]=0xe7;
 assert.throws(()=>inspectScoreMidiAnomalies(smpte),
  /UNSUPPORTED_DIAGNOSTIC_MIDI_FORMAT/);
});
test('FG-04B3d: MusicXML flags do not invent grace or repeat timing',()=>{
 const xml=score('<measure number="1"><note><grace slash="yes"/>'+
  '<pitch><step>C</step><octave>5</octave></pitch></note>'+
  '<note><pitch><step>E</step><octave>4</octave></pitch>'+
  '<duration>1</duration><tie type="start"/></note>'+
  '<backup><duration>1</duration></backup>'+
  '<direction><direction-type><metronome/></direction-type></direction>'+
  '<barline><repeat direction="forward"/>'+
  '<ending number="1" type="start"/></barline></measure>'+
  '<measure><barline><repeat direction="backward"/></barline></measure>');
 const d=inspectScoreXmlNotationFeatures(xml);
 assert.equal(d.noteElements,2);assert.equal(d.graceNotes,1);
 assert.equal(d.repeatForward,1);assert.equal(d.repeatBackward,1);
 assert.equal(d.endingElements,1);assert.equal(d.voiceBackupElements,1);
 assert.equal(d.tempoDirections,1);assert.equal(d.tiesStarted,1);
 assert.equal(d.graceTimingInferred,false);
 assert.equal(d.repeatPathInferred,false);
 assert.equal(d.productionAutoFingeringAllowed,false);
});
test('FG-04B3d: rejects unsafe XML entities and missing partwise score',()=>{
 assert.throws(()=>inspectScoreXmlNotationFeatures(score('<!ENTITY a SYSTEM "file:///x">')),
  /UNSAFE_DIAGNOSTIC_XML_ENTITY/);
 assert.throws(()=>inspectScoreXmlNotationFeatures('<score-timewise/>'+' '.repeat(40)),
  /INVALID_DIAGNOSTIC_XML_PARTWISE/);
});
test('FG-04B3d: aggregate 16 works without retaining score-note data',()=>{
 const m=inspectScoreMidiAnomalies(midi([[ev(0,0x90,60,80),
  ev(0,0x80,60,0)]]));
 const x=inspectScoreXmlNotationFeatures(score('<measure><note><grace/></note></measure>'));
 const cases=Array.from({length:16},(_,i)=>({id:'piece-'+i,midi:m,xml:x}));
 const report=summarizeScoreAnomalies(cases);
 assert.equal(report.scores,16);
 assert.equal(report.withZeroLengthMidi,16);
 assert.equal(report.withGraceNotes,16);
 assert.equal(report.totals.zeroLengthNotes,16);
 assert.equal(report.originalDataEdited,false);
 assert.equal(report.productionAutoFingeringAllowed,false);
 assert.equal(JSON.stringify(report).includes('"pitch"'),false);
});
test('FG-04B3d: incomplete and duplicate score diagnostics refused',()=>{
 const m=inspectScoreMidiAnomalies(midi([[ev(0,0x90,60,80),ev(1,0x80,60,0)]]));
 const x=inspectScoreXmlNotationFeatures(score('<measure/>'));
 const cases=Array.from({length:16},(_,i)=>({id:'piece-'+i,midi:m,xml:x}));
 assert.throws(()=>summarizeScoreAnomalies(cases.slice(0,15)),
  /INCOMPLETE_SCORE_ANOMALY_SCOPE/);
 const copy=structuredClone(cases);copy[1].id=copy[0].id;
 assert.throws(()=>summarizeScoreAnomalies(copy),/INVALID_SCORE_ANOMALY_ENTRY/);
});
