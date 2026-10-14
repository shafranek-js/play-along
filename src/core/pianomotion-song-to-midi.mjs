/**
 * FG-04C9 temporary calculation-only SMF from the already parsed song.
 * Required when PianoMotion's Python engine takes MIDI but source is an
 * XML/MuseScore arrangement. Does not modify the source musical document.
 * Exact MIDI source bytes always take priority over this lossy conversion.
 */
const vlq=v=>{
 if(!Number.isSafeInteger(v)||v<0||v>0x0fffffff)throw Error('MIDI_TICK_OUT_OF_RANGE');
 const a=[v&127];while((v>>=7)>0)a.unshift((v&127)|128);
 return a;
};
const u16=n=>[(n>>8)&255,n&255],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const four=s=>[...s].map(c=>c.charCodeAt(0));
export function makePianoMotionMidiFromSong(song){
 if(!song||!Array.isArray(song.tracks)||!song.tracks.length)
  return {ok:false,reason:'NO_SELECTED_SONG'};
 const items=[];
 for(const [trackIndex,track]of song.tracks.entries()){
  for(const [ordinal,n]of (track.notes||[]).entries()){
   if(n.channel===9||n.isDrum)continue;
   if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
      !Number.isFinite(n.start)||n.start<0||
      !Number.isFinite(n.duration)||n.duration<=0||
      n.start+n.duration>86400)return {ok:false,reason:'INVALID_PARSED_NOTE'};
   items.push({trackIndex,ordinal,pitch:n.pitch,start:n.start,end:n.start+n.duration});
  }
 }
 if(!items.length||items.length>10000)return {ok:false,reason:'UNSUPPORTED_NOTE_COUNT'};
 const events=[{tick:0,order:0,data:[0xff,0x51,0x03,0x0f,0x42,0x40]}];
 // 1000 ticks/s, constant 60 BPM. The score's real elapsed note times are
 // retained to the millisecond; original tempo automation is NOT exported.
 // Only Python fingering analysis uses this temporary arrangement.
 const index=[];
 for(const [i,n]of items.entries()){
  const start=Math.round(n.start*1000),end=Math.round(n.end*1000);
  if(end<=start)return {ok:false,reason:'NOTE_TOO_SHORT_FOR_MIDI'};
  const channel=n.trackIndex%16===9?0:(n.trackIndex%16);
  events.push({tick:start,order:2,data:[0x90|channel,n.pitch,90]});
  events.push({tick:end,order:1,data:[0x80|channel,n.pitch,0]});
  index.push({...n,startSeconds:start/1000,endSeconds:end/1000,index:i});
 }
 events.push({tick:Math.max(...items.map(n=>Math.round(n.end*1000)))+1,order:3,data:[0xff,0x2f,0]});
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
 const body=[];let prev=0;
 for(const event of events){body.push(...vlq(event.tick-prev),...event.data);prev=event.tick}
 const result=Uint8Array.from([...four('MThd'),...u32(6),...u16(0),...u16(1),...u16(1000),
  ...four('MTrk'),...u32(body.length),...body]);
 return {ok:true,midiBytes:result,source:'derived-from-open-song',
  exactOriginalMidi:false,sourceNotes:index,tempoAutomationPreserved:false};
}
