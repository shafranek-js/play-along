/**
 * FG-04C9: synthesize an ORIGINAL-SONG analysis MIDI for score-like formats.
 * Never edits the score, its MusicXML, or playback. Constant 60 bpm at
 * 1000 PPQ reproduces source seconds to <= .5 ms on a strict SMF timeline.
 * The source reference is a separate exact signature index, not a MIDI guess.
 */
const reason=x=>({ok:false,reason:x});
const vlq=x=>{if(!Number.isSafeInteger(x)||x<0||x>0x0fffffff)throw Error('INVALID_DELTA');const a=[x&127];while(x>>=7)a.unshift((x&127)|128);return a};
const u16=n=>[(n>>8)&255,n&255];
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const ascii=s=>[...s].map(ch=>ch.charCodeAt(0));
export function midiNoteSignature(n){return [n.track,n.channel,n.pitch,n.startTick,n.endTick].join(':')}
export function serializeSongForPianoMotion(song){
 if(!song||!Array.isArray(song.tracks))return reason('NO_CURRENT_SCORE');
 const input=[],identity=new Set(),active=new Map();
 for(const [track,t]of song.tracks.entries()){
  if(!Array.isArray(t.notes))continue;
  if(track>=16)return reason('TOO_MANY_INSTRUMENT_TRACKS');
  for(const [i,n] of t.notes.entries()){
   if(!Number.isInteger(n?.pitch)||n.pitch<0||n.pitch>127||
      !Number.isFinite(n.start)||n.start<0||!Number.isFinite(n.duration)||n.duration<=0)
    return reason('INVALID_SOURCE_NOTE');
   const startTick=Math.round(n.start*1000),endTick=Math.round((n.start+n.duration)*1000);
   if(endTick<=startTick||endTick>0x0fffffff||startTick<0)
    return reason('UNREPRESENTABLE_NOTE_TIME');
   const ref=typeof n.noteId==='string'&&n.noteId.length?n.noteId:'note:'+track+':'+i;
   if(identity.has(ref))return reason('DUPLICATE_SOURCE_NOTE_ID');
   identity.add(ref);
   const channel=track===9?10:track%16; // avoid percussion channel 10 (zero-indexed 9)
   input.push({noteId:ref,source:n,pitch:n.pitch,startTick,endTick,track:0,channel,
    velocity:Number.isFinite(n.velocity)?Math.max(1,Math.min(127,Math.round(n.velocity))):80,
    sourceHand:n.hand==='RH'||n.hand==='LH'?n.hand:null});
  }
 }
 if(!input.length||input.length>2500)return reason('INVALID_SOURCE_NOTE_COUNT');
 // Refuse same key pressed twice while it is already held on that channel.
 const ordered=[...input].sort((a,b)=>a.channel-b.channel||a.pitch-b.pitch||
    a.startTick-b.startTick||a.endTick-b.endTick);
 for(let i=1;i<ordered.length;i++){
  const x=ordered[i-1],y=ordered[i];
  if(x.channel===y.channel&&x.pitch===y.pitch&&y.startTick<x.endTick)
   return reason('OVERLAPPING_SAME_CHANNEL_SOURCE');
 }
 const events=[
  {tick:0,rank:0,bytes:[0xff,0x51,0x03,0x0f,0x42,0x40]} // tempo 60 BPM
 ];
 for(const n of input){
  events.push({tick:n.startTick,rank:2,bytes:[0x90|n.channel,n.pitch,n.velocity]});
  events.push({tick:n.endTick,rank:1,bytes:[0x80|n.channel,n.pitch,0]});
 }
 events.sort((a,b)=>a.tick-b.tick||a.rank-b.rank||a.bytes[0]-b.bytes[0]||a.bytes[1]-b.bytes[1]);
 let tick=0;const body=[];
 for(const e of events){
  body.push(...vlq(e.tick-tick),...e.bytes);tick=e.tick;
 }
 body.push(0,0xff,0x2f,0);
 const bytes=Uint8Array.from([...ascii('MThd'),...u32(6),...u16(0),...u16(1),...u16(1000),
   ...ascii('MTrk'),...u32(body.length),...body]);
 const bySignature=new Map();
 for(const n of input){
  const signature=midiNoteSignature(n);
  if(bySignature.has(signature))return reason('AMBIGUOUS_SYNTHESIZED_MIDI');
  bySignature.set(signature,n.noteId);
 }
 return {ok:true,midiBytes:bytes,
  sourceNoteIds:input.map(n=>n.noteId),
  bySignature:Object.fromEntries(bySignature),
  sourceEvents:input.map(n=>({noteId:n.noteId,hand:n.sourceHand,pitch:n.pitch,
   start:n.source.start,duration:n.source.duration})),
  maxQuantizationErrorSeconds:.0005,
  sourceWasModified:false,analysisOnly:true};
}
