import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMusicXmlBeats,compareRawMusicXmlToScoreMidi}
 from '../src/core/musicxml-score-midi-bridge.mjs';

const note=(step='C',oct=4,d=4,extra='')=>
 '<note>'+extra+'<pitch><step>'+step+'</step><octave>'+oct+
 '</octave></pitch><duration>'+d+'</duration><voice>1</voice><staff>1</staff></note>';
const rest=d=>'<note><rest/><duration>'+d+'</duration></note>';
const score=(measures,{parts=1}={})=>
 '<?xml version="1.0"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'+
 '<score-partwise version="3.1"><part-list/>'+
 Array.from({length:parts},(_,i)=>'<part id="P'+(i+1)+'">'+
 measures.map((items,j)=>'<measure number="'+(j+1)+'">'+
 (j===0?'<attributes><divisions>4</divisions></attributes>':'')+
 items+'</measure>').join('')+'</part>').join('')+'</score-partwise>';
const be16=n=>[(n>>8)&255,n&255];
const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a}
function midi(events,tempos=[{tick:0,micros:500000}]){
 let commands=[];
 for(const e of events){
  commands.push({tick:e.start,prio:2,data:[0x90|(e.channel||0),e.pitch,90]});
  commands.push({tick:e.end,prio:0,data:[0x80|(e.channel||0),e.pitch,0]});
 }
 for(const t of tempos)commands.push({tick:t.tick,prio:1,
  data:[255,81,3,...be32(t.micros).slice(1)]});
 commands.sort((a,b)=>a.tick-b.tick||a.prio-b.prio);
 let cursor=0,chunk=[];
 for(const c of commands){chunk.push(...vlq(c.tick-cursor),...c.data);cursor=c.tick;}
 chunk.push(0,255,47,0);
 return Uint8Array.from([...Buffer.from('MThd'),...be32(6),...be16(0),
  ...be16(1),...be16(480),...Buffer.from('MTrk'),...be32(chunk.length),...chunk]);
}
const ev=(pitch,start=0,end=480,channel=0)=>({pitch,start,end,channel});
const assertReject=(xml,data,reason)=>{
 const r=compareRawMusicXmlToScoreMidi(xml,data);
 assert.equal(r.status,'rejected');
 assert.equal(r.reason,reason);
 assert.equal(r.productionAutoFingeringAllowed,false);
};
test('FG-04B3b: raw MusicXML partwise single note matches original MIDI',()=>{
 const xml=score([note()]);
 const before=xml,data=midi([ev(60)]);
 const r=compareRawMusicXmlToScoreMidi(xml,data);
 assert.equal(r.status,'aligned');
 assert.equal(r.summary.rawNotes,1);
 assert.equal(r.summary.matched,1);
 assert.equal(r.links[0].noteId,'xml:P1:0:0:1');
 assert.equal(r.scoreTempoIndependentlyValidated,false);
 assert.equal(r.productionAutoFingeringAllowed,false);
 assert.equal(xml,before);
});
test('FG-04B3b: rests advance cursor; only pitched notes enter matching',()=>{
 const xml=score([rest(4)+note('E',4,4)]);
 const n=normalizeMusicXmlBeats(xml);
 assert.equal(n.notes.length,1);
 assert.equal(n.notes[0].start,1);
 assert.equal(compareRawMusicXmlToScoreMidi(xml,midi([ev(64,480,960)])).status,'aligned');
});
test('FG-04B3b: inline chords share start but not MIDI unison confusion',()=>{
 const xml=score([note('C')+note('E',4,4,'<chord/>')]);
 const n=normalizeMusicXmlBeats(xml);
 assert.equal(n.notes[0].start,n.notes[1].start);
 assert.equal(compareRawMusicXmlToScoreMidi(xml,midi([ev(60),ev(64)])).status,'aligned');
});
test('FG-04B3b: backup enables simultaneous independent score voices',()=>{
 const xml=score([note('C')+'<backup><duration>4</duration></backup>'+
  '<note><pitch><step>G</step><octave>3</octave></pitch>'+
  '<duration>4</duration><voice>2</voice><staff>2</staff></note>']);
 const r=compareRawMusicXmlToScoreMidi(xml,midi([ev(60),ev(55,0,480,1)]));
 assert.equal(r.status,'aligned');
 assert.equal(r.links.length,2);
 assert.equal(new Set(r.links.map(x=>x.voice)).size,2);
});
test('FG-04B3b: consolidate explicit XML ties into one sustained MIDI note',()=>{
 const a=note('C',4,4,'<tie type="start"/>');
 const b=note('C',4,4,'<tie type="stop"/>');
 const xml=score([a,b]);
 const normalized=normalizeMusicXmlBeats(xml);
 assert.equal(normalized.notes.length,1);
 assert.equal(normalized.notes[0].duration,2);
 assert.equal(normalized.notes[0].sourceNoteIds.length,2);
 const r=compareRawMusicXmlToScoreMidi(xml,midi([ev(60,0,960)]));
 assert.equal(r.status,'aligned');
 assert.equal(r.summary.mergedTieSegments,1);
});
test('FG-04B3b: MIDI tempo map is applied to score beat positions',()=>{
 const xml=score([note('C')+note('D')]);
 const data=midi([ev(60,0,480),ev(62,480,960)],
  [{tick:0,micros:500000},{tick:480,micros:1000000}]);
 const r=compareRawMusicXmlToScoreMidi(xml,data);
 assert.equal(r.status,'aligned');
 assert.equal(r.midiTempoUsedForScoreClock,true);
 assert.equal(r.scoreTempoIndependentlyValidated,false);
});
test('FG-04B3b: explicit XML repeats cannot be assumed unfolded',()=>{
 const xml=score([note()+'<barline><repeat direction="backward"/></barline>']);
 assertReject(xml,midi([ev(60)]),'MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED');
});
test('FG-04B3b: grace timing refused instead of fabricating zero duration',()=>{
 const xml=score([note('C',4,4,'<grace/>')]);
 assertReject(xml,midi([ev(60)]),'MUSICXML_GRACE_TIMING_UNSUPPORTED');
});
test('FG-04B3b: missing tie stop and orphan tie stop both refused',()=>{
 assertReject(score([note('C',4,4,'<tie type="start"/>')]),midi([ev(60)]),
  'MUSICXML_UNFINISHED_TIE');
 assertReject(score([note('C',4,4,'<tie type="stop"/>')]),midi([ev(60)]),
  'MUSICXML_UNPAIRED_TIE_STOP');
});
test('FG-04B3b: mismatch between independently parsed XML pitches and MIDI rejected',()=>{
 assertReject(score([note('C')]),midi([ev(61)]),'SCORE_EVENT_UNMATCHED');
});
test('FG-04B3b: out-of-time MIDI note is not silently accepted',()=>{
 assertReject(score([note('C')]),midi([ev(60,2,482)]),'SCORE_EVENT_UNMATCHED');
});
test('FG-04B3b: changed note count is hard refusal',()=>{
 assertReject(score([note('C')+note('D')]),midi([ev(60)]),
  'SCORE_MIDI_NOTE_COUNT_MISMATCH');
});
test('FG-04B3b: duplicate unison from two separate score parts refused',()=>{
 const xml=score([note()],{parts:2});
 const r=compareRawMusicXmlToScoreMidi(xml,midi([ev(60,0,480,0),ev(60,0,480,1)]));
 assert.equal(r.status,'rejected');
 assert.equal(r.reason,'AMBIGUOUS_MIDI_EVENT_CANDIDATES');
});
test('FG-04B3b: XML external entities refused, safe doctype permitted',()=>{
 const xml=score([note()]).replace('<part-list/>',
  '<!ENTITY x SYSTEM "file:///etc/passwd"><part-list/>');
 assertReject(xml,midi([ev(60)]),'MUSICXML_ENTITY_OR_CDATA_UNSUPPORTED');
});
test('FG-04B3b: source-derived ID not invented from MIDI track/channel',()=>{
 const r=compareRawMusicXmlToScoreMidi(score([note()]),midi([ev(60,0,480,8)]));
 assert.equal(r.status,'aligned');
 assert.equal(r.links[0].noteId,'xml:P1:0:0:1');
 assert.equal(r.links[0].midiChannel,8);
 assert.equal(r.scoreXmlSemanticValidation,false);
});

test('FG-04B3c: cross-voice same-staff contiguous tie uniquely preserves original source IDs',()=>{
 const start=note('G',4,4,'<tie type="start"/>');
 const stop='<note><tie type="stop"/><pitch><step>G</step><octave>4</octave></pitch>'+
  '<duration>4</duration><voice>3</voice><staff>1</staff></note>';
 const xml=score([start,stop]);
 const normalized=normalizeMusicXmlBeats(xml);
 assert.equal(normalized.notes.length,1);
 assert.equal(normalized.stats.crossVoiceTieSegments,1);
 assert.deepEqual(normalized.notes[0].sourceNoteIds,[
  'xml:P1:0:0:1','xml:P1:0:1:1'
 ]);
 const report=compareRawMusicXmlToScoreMidi(xml,midi([ev(67,0,960)]));
 assert.equal(report.status,'aligned');
 assert.equal(report.summary.crossVoiceTieSegments,1);
 assert.equal(report.productionAutoFingeringAllowed,false);
});
test('FG-04B3c: simultaneous same-pitch start ties cannot select a cross-voice winner',()=>{
 const a=note('G',4,4,'<tie type="start"/>');
 const second='<note><tie type="start"/><pitch><step>G</step>'+
  '<octave>4</octave></pitch><duration>4</duration><voice>2</voice>'+
  '<staff>1</staff></note>';
 const stop='<note><tie type="stop"/><pitch><step>G</step>'+
  '<octave>4</octave></pitch><duration>4</duration><voice>3</voice>'+
  '<staff>1</staff></note>';
 const xml=score([a+'<backup><duration>4</duration></backup>'+second,stop]);
 assertReject(xml,midi([ev(67,0,960,0),ev(67,0,480,1)]),
  'MUSICXML_AMBIGUOUS_TIE_STOP');
});
test('FG-04B3c: unique cross-staff tie is not assumed physically continuous',()=>{
 const a=note('G',4,4,'<tie type="start"/>');
 const stop='<note><tie type="stop"/><pitch><step>G</step>'+
  '<octave>4</octave></pitch><duration>4</duration><voice>3</voice>'+
  '<staff>2</staff></note>';
 assertReject(score([a,stop]),midi([ev(67,0,960)]),
  'MUSICXML_UNPAIRED_TIE_STOP');
});
test('FG-04B3c: same pitch and staff at different time cannot synthesize a tie',()=>{
 const a=note('G',4,4,'<tie type="start"/>');
 const stop='<note><tie type="stop"/><pitch><step>G</step>'+
  '<octave>4</octave></pitch><duration>4</duration><voice>3</voice>'+
  '<staff>1</staff></note>';
 assertReject(score([a,rest(4)+stop]),midi([ev(67,0,960)]),
  'MUSICXML_UNPAIRED_TIE_STOP');
});
