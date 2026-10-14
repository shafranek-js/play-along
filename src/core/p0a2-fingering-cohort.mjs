/**
 * P0-A2: deterministic PIG -> calculation-only MIDI, with SOURCE HAND known.
 * The hand labels are allowed musical input; finger reference labels are
 * NEVER placed in MIDI nor in either solver's input.
 *
 * The source is from pinned, SHA-256 checked PIG text (not MusicXML).
 * Timing is explicitly quantized to 1/9600 s; do not claim bit-exact source.
 * Every note has an independently checked MIDI event locator.
 */
import {originalMidiSourceEvents} from './pianomotion-midi-source-map.mjs';

const TICKS_PER_SECOND=9600,MAX=2500;
const bytes=s=>[...Buffer.from(s,'ascii')],u16=x=>[x>>8&255,x&255],
 u32=x=>[(x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255];
const vlq=n=>{
 if(!Number.isSafeInteger(n)||n<0||n>0x0fffffff)throw Error('MIDI_DELTA_OVERFLOW');
 const out=[n&127];while((n=Math.floor(n/128))>0)out.unshift((n&127)|128);
 return out;
};
const sig=(channel,pitch,startTick,endTick)=>[channel,pitch,startTick,endTick].join(':');
const bad=reason=>({ok:false,reason});
export function makeP0A2Cohort(parsed){
 if(!Array.isArray(parsed?.notes)||!parsed.notes.length||parsed.notes.length>MAX)
  return bad('INVALID_PIG_COHORT');
 const seen=new Set(),items=[];
 for(const n of parsed.notes){
  if(typeof n?.noteId!=='string'||!n.noteId||seen.has(n.noteId)||
   !['RH','LH'].includes(n.hand)||!Number.isInteger(n.referenceFinger)||
   n.referenceFinger<1||n.referenceFinger>5||
   !Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108||
   !Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.end)||n.end<=n.start)
   return bad('INVALID_ANNOTATED_NOTE');
  seen.add(n.noteId);
  const on=Math.round(n.start*TICKS_PER_SECOND),off=Math.round(n.end*TICKS_PER_SECOND);
  if(off<=on||off>0x0fffffff)return bad('UNREPRESENTABLE_PIG_TIME');
  items.push({id:n.noteId,hand:n.hand,referenceFinger:n.referenceFinger,
   channel:n.hand==='RH'?0:1,pitch:n.pitch,on,off});
 }
 const eventsFor=hand=>{
  const channel=hand==='RH'?0:1;
  const track=[{tick:0,priority:0,data:[0xff,0x03,...vlq(hand==='RH'?10:9),...bytes(hand==='RH'?'Right Hand':'Left Hand')]},
   {tick:0,priority:1,data:[0xc0|channel,0]}];
  if(hand==='RH')track.unshift({tick:0,priority:-1,data:[0xff,0x51,3,0x0f,0x42,0x40]});
  for(const n of items.filter(n=>n.hand===hand)){
   track.push({tick:n.on,priority:3,data:[0x90|channel,n.pitch,90]});
   track.push({tick:n.off,priority:2,data:[0x80|channel,n.pitch,0]});
  }
  track.sort((a,b)=>a.tick-b.tick||a.priority-b.priority||
   (a.data[1]??0)-(b.data[1]??0));
  const body=[];let previous=0;
  for(const e of track){body.push(...vlq(e.tick-previous),...e.data);previous=e.tick}
  body.push(...vlq(0),0xff,0x2f,0);
  return [...bytes('MTrk'),...u32(body.length),...body];
 };
 // One physical hand per explicit track. Never embed signed PIG fingers.
 const midiBytes=Uint8Array.from([...bytes('MThd'),...u32(6),...u16(1),...u16(2),
  ...u16(TICKS_PER_SECOND),...eventsFor('RH'),...eventsFor('LH')]);
 const parsedMidi=originalMidiSourceEvents(midiBytes);
 if(!parsedMidi.ok||parsedMidi.items.length!==items.length)
  return bad('MIDI_EVENT_'+(parsedMidi.reason||'COUNT_MISMATCH'));
 const map=new Map(),duplicates=new Set();
 for(const n of parsedMidi.items){
  const signature=sig(n.channel,n.pitch,n.startTick,n.endTick);
  if(map.has(signature))duplicates.add(signature);
  map.set(signature,n);
 }
 if(duplicates.size)return bad('AMBIGUOUS_MIDI_SAME_PITCH_NOTE');
 const source=[],reference=[],locators=[],used=new Set();
 for(const n of items){
  const actual=map.get(sig(n.channel,n.pitch,n.on,n.off));
  if(!actual||used.has(actual.noteId))return bad('MIDI_SOURCE_ID_MISMATCH');
  used.add(actual.noteId);
  source.push({noteId:n.id,pitch:n.pitch,start:actual.startTick/TICKS_PER_SECOND,
   duration:(actual.endTick-actual.startTick)/TICKS_PER_SECOND,hand:n.hand});
  reference.push({noteId:n.id,hand:n.hand,finger:n.referenceFinger});
  locators.push({noteId:n.id,midiTrackIndex:actual.midiTrackIndex,
   channel:actual.channel,noteOnOrdinal:actual.noteOnOrdinal,
   noteOffOrdinal:actual.noteOffOrdinal,pitch:n.pitch,
   start:actual.startTick/TICKS_PER_SECOND,end:actual.endTick/TICKS_PER_SECOND});
 }
 if(used.size!==items.length)return bad('MIDI_SOURCE_BIJECTION_FAILED');
 return {ok:true,midiBytes,source,reference,locators,
  noteCount:items.length,quantizedTimeSeconds:1/TICKS_PER_SECOND,
  fingersEmbeddedInMidi:false,knownHandLabelsUsed:true,researchOnly:true};
}
