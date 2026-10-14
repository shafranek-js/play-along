/**
 * FG-04C9: calculation-only MIDI adapter. The original score never changes.
 * A foreign instrument may be played on a piano; it is not an orchestra arranger.
 * Keep raw-note identities so applying fingers never guesses from 350ms proximity.
 */
const vlq=v=>{
 if(!Number.isSafeInteger(v)||v<0||v>0x0fffffff)throw Error('MIDI_TICK_OUT_OF_RANGE');
 const a=[v&127];while((v>>=7)>0)a.unshift((v&127)|128);
 return a;
};
const u16=n=>[(n>>8)&255,n&255],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const four=s=>[...s].map(c=>c.charCodeAt(0));
const drumNote=(track,n)=>n.isDrum===true||n.channel===9||track.isDrum===true||track.channel===9;
const playable=(track)=>Array.isArray(track?.notes)&&track.notes.some(n=>!drumNote(track,n));
const explicitNonPiano=(track)=>{
 const label=String(track.instrumentName??track.instrument??track.name??'').toLowerCase();
 if(/guitar|bass|flute|violin|cello|sax|clarinet|trumpet|synth|strings|drums|percussion|гитар|бас|флейт|скрип/.test(label))return true;
 const program=track.program??track.instrumentProgram??track.midiProgram;
 return Number.isInteger(program)&&program>7&&program<=127;
};
/** Pure recommendation: direct only if no explicit foreign instrument or drums. */
export function pianoMotionSourcePlan(song,activeTrack=0){
 if(!song||!Array.isArray(song.tracks))return {ok:false,reason:'NO_SELECTED_SONG'};
 const candidates=song.tracks.map((t,i)=>playable(t)?i:-1).filter(i=>i>=0);
 if(!candidates.length)return {ok:false,reason:'NO_MELODIC_NOTES'};
 const foreign=song.tracks.some((t)=>explicitNonPiano(t)||t.isDrum||t.channel===9||
  (t.notes||[]).some(n=>drumNote(t,n)));
 if(!foreign)return {ok:true,mode:'original',trackIndices:candidates,description:'Исходный фортепианный MIDI'};
 const selected=candidates.includes(activeTrack)?activeTrack:candidates[0];
 const track=song.tracks[selected];
 return {ok:true,mode:'derived',trackIndices:[selected],
  selectedTrack:selected,description:'Фортепианная партия: '+String(track.name||'дорожка '+(selected+1)),
  omittedTracks:candidates.length-1};
}
/** Retry only for known source-structure failures; runtime failures are not MIDI problems. */
export function pianoMotionCanRetry(reason){
 return ['ORIGINAL_MIDI_PROVENANCE_UNVERIFIED','NOT_A_STANDARD_MIDI_FILE',
  'ORIGINAL_MIDI_STRUCTURE_UNSUPPORTED','PIANOMOTION_MIDI_STRUCTURE_UNSUPPORTED'].includes(String(reason));
}
export function makePianoMotionMidiFromSong(song,{trackIndices}={}){
 if(!song||!Array.isArray(song.tracks)||!song.tracks.length)
  return {ok:false,reason:'NO_SELECTED_SONG'};
 const chosen=trackIndices==null?null:new Set(trackIndices);
 if(chosen&&([...chosen].some(i=>!Number.isInteger(i)||i<0||i>=song.tracks.length)||!chosen.size))
  return {ok:false,reason:'INVALID_SELECTED_TRACKS'};
 const items=[];
 for(const [trackIndex,track]of song.tracks.entries()){
  if(chosen&&!chosen.has(trackIndex))continue;
  for(const [ordinal,n]of (track.notes||[]).entries()){
   if(drumNote(track,n))continue;
   if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
      !Number.isFinite(n.start)||n.start<0||
      !Number.isFinite(n.duration)||n.duration<=0||
      n.start+n.duration>86400)return {ok:false,reason:'INVALID_PARSED_NOTE'};
   const startTick=Math.round(n.start*1000),endTick=Math.round((n.start+n.duration)*1000);
   if(endTick<=startTick)return {ok:false,reason:'NOTE_TOO_SHORT_FOR_MIDI'};
   items.push({trackIndex,ordinal,pitch:n.pitch,start:n.start,end:n.start+n.duration,
    startTick,endTick});
  }
 }
 if(!items.length||items.length>10000)return {ok:false,reason:'UNSUPPORTED_NOTE_COUNT'};
 // One piano channel is enough for analysis. Same-pitch overlapping note-ons
 // cannot be represented reliably on one channel; reject instead of truncating.
 const byPitch=new Map();
 for(const n of [...items].sort((a,b)=>a.startTick-b.startTick||a.endTick-b.endTick)){
  if(n.startTick<(byPitch.get(n.pitch)??-1))
   return {ok:false,reason:'OVERLAPPING_UNISON_REQUIRES_REVIEW'};
  byPitch.set(n.pitch,n.endTick);
 }
 const events=[{tick:0,order:0,data:[0xff,0x51,0x03,0x0f,0x42,0x40]}];
 const index=[];
 for(const [i,n]of items.entries()){
  events.push({tick:n.startTick,order:2,data:[0x90,n.pitch,90]});
  events.push({tick:n.endTick,order:1,data:[0x80,n.pitch,0]});
  index.push({trackIndex:n.trackIndex,ordinal:n.ordinal,pitch:n.pitch,
   startSeconds:n.startTick/1000,endSeconds:n.endTick/1000,index:i});
 }
 events.push({tick:Math.max(...items.map(n=>n.endTick))+1,order:3,data:[0xff,0x2f,0]});
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
 const body=[];let prev=0;
 for(const e of events){body.push(...vlq(e.tick-prev),...e.data);prev=e.tick}
 const result=Uint8Array.from([...four('MThd'),...u32(6),...u16(0),...u16(1),...u16(1000),
  ...four('MTrk'),...u32(body.length),...body]);
 return {ok:true,midiBytes:result,source:'derived-from-open-song',
  exactOriginalMidi:false,sourceNotes:index,trackIndices:chosen?[...chosen]:null,
  tempoAutomationPreserved:false};
}
/** Independent, strict note alignment. No in-place edits on ambiguous mappings. */
export function pianoMotionAlignSuggestions(song,suggestions,{trackIndices,tolerance=.025}={}){
 if(!song||!Array.isArray(song.tracks)||!Array.isArray(suggestions)||!suggestions.length)
  return {ok:false,reason:'NO_NOTE_MAPPING'};
 const selected=trackIndices==null?null:new Set(trackIndices);
 const source=[];
 for(const [trackIndex,track]of song.tracks.entries()){
  if(selected&&!selected.has(trackIndex))continue;
  for(const [ordinal,n]of (track.notes||[]).entries()){
   if(!drumNote(track,n))source.push({note:n,trackIndex,ordinal});
  }
 }
 if(source.length!==suggestions.length)return {ok:false,reason:'NOTE_COUNT_MISMATCH',expected:source.length,actual:suggestions.length};
 const used=new Set(),matches=[];
 for(const s of suggestions){
  if(!Number.isInteger(s.pitch)||!Number.isFinite(s.start)||
     (s.end!=null&&!Number.isFinite(s.end))||
     !['RH','LH'].includes(s.hand)||
     (s.finger!==null&&(!Number.isInteger(s.finger)||s.finger<1||s.finger>5)))
   return {ok:false,reason:'INVALID_FINGER_RESULT'};
  const candidates=source.filter(({note:n},i)=>!used.has(i)&&n.pitch===s.pitch&&
   Math.abs(n.start-s.start)<=tolerance&&
   (s.end==null||Math.abs(n.start+n.duration-s.end)<=Math.max(tolerance,.04)));
  if(candidates.length!==1)return {ok:false,reason:candidates.length?'AMBIGUOUS_NOTE_MAPPING':'NOTE_MAPPING_NOT_FOUND'};
  const entry=candidates[0],sourceIndex=source.indexOf(entry);
  used.add(sourceIndex);matches.push({...entry,suggestion:s});
 }
 return {ok:true,matches,total:source.length};
}
/** Diagnostic only: exceeding ten simultaneous attacks/held notes is not a safe piano part. */
export function pianoMotionPlayableDiagnostic(song,trackIndices){
 const selected=trackIndices==null?null:new Set(trackIndices),events=[];
 (song?.tracks||[]).forEach((track,i)=>{
  if(selected&&!selected.has(i))return;
  for(const n of track.notes||[]){
   if(drumNote(track,n))continue;
   events.push({time:n.start,delta:1});
   events.push({time:n.start+n.duration,delta:-1});
  }
 });
 events.sort((a,b)=>a.time-b.time||a.delta-b.delta);
 let held=0,maxHeld=0;
 for(const e of events){held+=e.delta;maxHeld=Math.max(maxHeld,held)}
 return {maxHeld,possiblyUnplayable:maxHeld>10};
}
