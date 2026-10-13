/**
 * QA-01 cross-component read-only musical contract checks.
 * These synthetic fixtures are not a pianist-reviewed correctness benchmark.
 * Run explicitly: node --test tests/qa-musical-contracts.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMusicXmlBeats,compareRawMusicXmlToScoreMidi}
 from '../src/core/musicxml-score-midi-bridge.mjs';
import {fingerGuidanceTimeline,fingerGuidanceGhostWindow,
 fingerGuidanceHandsCross,fingerGuidanceMotionPlan}
 from '../src/core/finger-guidance-timeline.mjs';

const u16=n=>[(n>>8)&255,n&255];
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const vlq=n=>{const a=[n&127];while((n>>=7)>0)a.unshift((n&127)|128);return a;};
function smf(events,tempos=[{tick:0,micros:500000}]){
 const commands=[];
 for(const e of events){
  commands.push({tick:e.start,prio:2,data:[0x90|(e.channel??0),e.pitch,90]});
  commands.push({tick:e.end,prio:0,data:[0x80|(e.channel??0),e.pitch,0]});
 }
 for(const t of tempos)commands.push({tick:t.tick,prio:1,
  data:[0xff,0x51,3,...u32(t.micros).slice(1)]});
 commands.sort((a,b)=>a.tick-b.tick||a.prio-b.prio);
 const chunk=[];let last=0;
 for(const e of commands){chunk.push(...vlq(e.tick-last),...e.data);last=e.tick;}
 chunk.push(0,0xff,0x2f,0);
 return Uint8Array.from([...Buffer.from('MThd'),...u32(6),...u16(0),
  ...u16(1),...u16(480),...Buffer.from('MTrk'),...u32(chunk.length),...chunk]);
}
const pitch=(step,oct=4)=>'<pitch><step>'+step+'</step><octave>'+oct+'</octave></pitch>';
const note=(step,duration=480,finger=1,extra='')=>
 '<note>'+extra+pitch(step)+'<duration>'+duration+'</duration>'+
 '<voice>1</voice><staff>1</staff>'+
 '<notations><technical><fingering>'+finger+'</fingering></technical></notations></note>';
const xmlScore=measures=>'<?xml version="1.0"?><score-partwise version="3.1">'+
 '<part-list/><part id="P1">'+measures.map((items,i)=>
 '<measure number="'+(i+1)+'">'+
 (i===0?'<attributes><divisions>480</divisions></attributes>':'')+
 items+'</measure>').join('')+'</part></score-partwise>';
const N=(pitch,start,end,channel=0)=>({pitch,start,end,channel});
const trusted=(pitch,start,finger,extra={})=>({
 pitch,start,duration:.25,hand:'RH',finger,source:'musicxml',track:0,...extra
});

test('QA-01: changes in MIDI tempo map never rewrite original source XML, MIDI or IDs',()=>{
 const xml=xmlScore([note('C',480,2)+note('D',480,4)]);
 const midi=smf([N(60,0,480),N(62,480,960)],
  [{tick:0,micros:500000},{tick:480,micros:750000}]);
 const originalMidi=Buffer.from(midi);
 const normalized=normalizeMusicXmlBeats(xml);
 const before=JSON.stringify(normalized);
 const result=compareRawMusicXmlToScoreMidi(xml,midi);
 assert.equal(result.status,'aligned',result.reason);
 assert.equal(result.summary.matched,2);
 assert.deepEqual(result.links.map(x=>x.noteId),
  ['xml:P1:0:0:1','xml:P1:0:1:1']);
 assert.equal(result.midiTempoUsedForScoreClock,true);
 assert.equal(result.scoreTempoIndependentlyValidated,false);
 assert.equal(result.productionAutoFingeringAllowed,false);
 assert.deepEqual(Buffer.from(midi),originalMidi,'source MIDI mutated');
 assert.equal(JSON.stringify(normalizeMusicXmlBeats(xml)),before,'source event normalization changed');
 assert.match(xml,/<fingering>2<\/fingering>/);
 assert.match(xml,/<fingering>4<\/fingering>/);
});

test('QA-01: note pitch, release and onset mismatches are explicit refusal, not silent repairs',()=>{
 const original=xmlScore([note('C')+note('D')]);
 const midi=smf([N(60,0,480),N(62,480,960)]);
 const variants=[
  original.replace('<step>D</step>','<step>E</step>'),
  original.replace('<duration>480</duration>','<duration>240</duration>'),
  original
 ];
 const midis=[midi,midi,smf([N(60,0,480),N(62,492,972)])];
 for(let i=0;i<variants.length;i++){
  const result=compareRawMusicXmlToScoreMidi(variants[i],midis[i]);
  assert.equal(result.status,'rejected','variant '+i+' wrongly aligned');
  assert.equal(result.productionAutoFingeringAllowed,false);
  assert.ok(typeof result.reason==='string'&&result.reason.length>0);
 }
 assert.equal(compareRawMusicXmlToScoreMidi(original,midi).status,'aligned');
});

test('QA-01: explicit tie retains both source segment IDs, no phantom second MIDI attack',()=>{
 const xml=xmlScore([
  note('G',480,3,'<tie type="start"/>'),
  note('G',480,3,'<tie type="stop"/>')
 ]);
 const normalized=normalizeMusicXmlBeats(xml);
 assert.equal(normalized.notes.length,1);
 assert.deepEqual(normalized.notes[0].sourceNoteIds,
  ['xml:P1:0:0:1','xml:P1:1:0:1']);
 const result=compareRawMusicXmlToScoreMidi(xml,smf([N(67,0,960)]));
 assert.equal(result.status,'aligned',result.reason);
 assert.equal(result.summary.mergedTieSegments,1);
});

test('QA-01: ambiguous unison and unsupported repeat/grace fail closed',()=>{
 const unisonXml=xmlScore([note('C')+'<backup><duration>480</duration></backup>'+
  note('C',480,4)]);
 const ambiguous=compareRawMusicXmlToScoreMidi(unisonXml,
  smf([N(60,0,480,0),N(60,0,480,1)]));
 assert.equal(ambiguous.status,'rejected');
 const repeat=compareRawMusicXmlToScoreMidi(
  xmlScore([note('C')+'<barline><repeat direction="backward"/></barline>']),
  smf([N(60,0,480)]));
 assert.deepEqual({status:repeat.status,reason:repeat.reason},
  {status:'rejected',reason:'MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED'});
 const grace=compareRawMusicXmlToScoreMidi(xmlScore([note('C',480,2,'<grace/>')]),
  smf([N(60,0,480)]));
 assert.deepEqual({status:grace.status,reason:grace.reason},
  {status:'rejected',reason:'MUSICXML_GRACE_TIMING_UNSUPPORTED'});
});

test('QA-01: source/user annotations remain trusted; generated unknown never becomes advice',()=>{
 const original=[
  trusted(60,0,2,{noteId:'xml:P1:0:0:1'}),
  trusted(64,0,4,{noteId:'xml:P1:0:1:1',source:'user'}),
  trusted(67,0,5,{noteId:'predicted:3',source:'generated-research'}),
  trusted(69,.25,3,{noteId:'xml:P1:0:3:1'})
 ];
 const snapshot=structuredClone(original);
 const frames=fingerGuidanceTimeline(original);
 assert.deepEqual(original,snapshot,'input notes modified');
 assert.equal(frames.length,2);
 assert.equal(frames[0].totalNotes,3);
 assert.equal(frames[0].notes.length,2);
 assert.equal(frames[0].complete,false,'partial chord mistaken for fully fingered');
 assert.deepEqual(frames[0].notes.map(x=>[x.noteId,x.source,x.finger]),[
  ['xml:P1:0:0:1','musicxml',2],
  ['xml:P1:0:1:1','user',4]
 ]);
 assert.equal(frames[1].start,.25);
});

test('QA-01: next action safety under Wait / Tempo / Loop / Pause / Seek / crossing',()=>{
 const w=fingerGuidanceGhostWindow({nextOnset:1,now:.6,leadMs:750,mode:'wait'});
 assert.equal(w.visible,false);
 const listening=fingerGuidanceGhostWindow({nextOnset:1,now:.6,leadMs:750,mode:'listen'});
 assert.equal(listening.visible,true);
 assert.equal(fingerGuidanceGhostWindow({nextOnset:1,now:1,mode:'listen'}).visible,false);
 const loop=fingerGuidanceGhostWindow({nextOnset:2.2,now:3.8,
  loop:{enabled:true,start:2,end:4},mode:'tempo',leadMs:750});
 assert.equal(loop.remainingMs,400);
 assert.equal(loop.visible,true);
 const lh={x:20,width:80,unit:20},rh={x:240,width:80,unit:20};
 const nextLh={x:230,width:80,unit:20},nextRh={x:30,width:80,unit:20};
 assert.equal(fingerGuidanceHandsCross(lh,rh,nextLh,nextRh),true);
 assert.equal(fingerGuidanceMotionPlan({from:lh,to:nextLh,canvasWidth:600,
  remainingMs:300,leadMs:750,crossing:true}).kind,'markers');
 const cfg={from:{x:40,width:80,unit:20},to:{x:240,width:80,unit:20},
  canvasWidth:600,remainingMs:450,leadMs:750};
 const moving=fingerGuidanceMotionPlan({...cfg,playing:true});
 assert.equal(moving.kind,'moving');
 assert.deepEqual(fingerGuidanceMotionPlan({...cfg,playing:true}),moving);
 assert.equal(fingerGuidanceMotionPlan({...cfg,playing:false}).kind,'static');
 const seek=fingerGuidanceMotionPlan({...cfg,remainingMs:200,playing:true});
 assert.ok(seek.progress>moving.progress);
});
