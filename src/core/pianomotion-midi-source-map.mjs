/**
 * FG-04C8: conservative original-MIDI raw event identity bridge.
 * Play Along note id = midi:sourceTrack:noteOnSerial.
 * PianoMotion sourceEvent = original mido track-local message ordinals.
 * This independent parser deliberately never guesses hands.
 */
const MAX_BYTES=4000000,MAX_NOTES=2500;
const fail=reason=>({ok:false,reason,items:[],productionEligible:false});
const key=e=>e.midiTrackIndex+':'+e.channel+':'+e.noteOnOrdinal+':'+e.noteOffOrdinal;
export function originalMidiSourceEvents(input){
 const bytes=input instanceof Uint8Array?input:
  input instanceof ArrayBuffer?new Uint8Array(input):null;
 if(!bytes||bytes.length<22||bytes.length>MAX_BYTES)return fail('INVALID_MIDI_BYTES');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let i=0;
 const need=(n,end=bytes.length)=>{if(n<0||i+n>end)throw Error('TRUNCATED_MIDI')};
 const u8=(end=bytes.length)=>{need(1,end);return bytes[i++]};
 const u16=()=>{need(2);const v=dv.getUint16(i);i+=2;return v};
 const u32=()=>{need(4);const v=dv.getUint32(i);i+=4;return v};
 const word=n=>{need(n);const s=String.fromCharCode(...bytes.slice(i,i+n));i+=n;return s};
 const vlq=end=>{let value=0;for(let k=0;k<4;k++){
  const b=u8(end);value=(value<<7)|(b&127);if(!(b&128))return value;
 }throw Error('INVALID_VLQ')};
 try{
  if(word(4)!=='MThd')return fail('NOT_A_MIDI_FILE');
  const length=u32();if(length<6||length>1024)return fail('INVALID_HEADER_LENGTH');
  const type=u16(),trackCount=u16(),ppq=u16();need(length-6);i+=length-6;
  if(type>1||!trackCount||trackCount>150||!ppq||(ppq&0x8000))
   return fail('UNSUPPORTED_MIDI_FORMAT_OR_TIMING');
  const notes=[];
  for(let tr=0;tr<trackCount;tr++){
   if(word(4)!=='MTrk')return fail('MISSING_MIDI_TRACK');
   const length=u32(),end=i+length;if(end>bytes.length)return fail('TRUNCATED_MIDI_TRACK');
   let tick=0,running=0,ordinal=0,serial=0;
   const held=new Map();
   while(i<end){
    tick+=vlq(end);
    let status=bytes[i];
    if(status&0x80){i++;if(status>=0x80&&status<0xf0)running=status}
    else{if(!running)return fail('INVALID_MIDI_RUNNING_STATUS');status=running}
    const eventOrdinal=ordinal++;
    if(status===0xff){
     const meta=u8(end),n=vlq(end);need(n,end);i+=n;
     if(meta===0x2f){i=end;break}continue;
    }
    if(status===0xf0||status===0xf7){
     const n=vlq(end);need(n,end);i+=n;running=0;continue;
    }
    if(status<0x80||status>=0xf0)return fail('UNSUPPORTED_SYSTEM_MESSAGE');
    const op=status&0xf0,ch=status&15;
    const a=u8(end),b=(op===0xc0||op===0xd0)?0:u8(end);
    if(a>127||b>127)return fail('INVALID_MIDI_DATA_BYTE');
    if(op===0x90&&b>0){
     const id=ch+':'+a,queue=held.get(id)??[];
     if(queue.length)return fail('SAME_KEY_OVERLAP_AMBIGUOUS');
     queue.push({noteId:'midi:'+tr+':'+(++serial),pitch:a,velocity:b,
      midiTrackIndex:tr,channel:ch,noteOnOrdinal:eventOrdinal,startTick:tick});
     held.set(id,queue);
    }else if(op===0x80||op===0x90&&b===0){
     const id=ch+':'+a,queue=held.get(id);
     if(!queue?.length)continue;
     const on=queue.shift();if(!queue.length)held.delete(id);
     notes.push({...on,noteOffOrdinal:eventOrdinal,endTick:Math.max(on.startTick+1,tick)});
     if(notes.length>MAX_NOTES)return fail('NOTE_LIMIT_EXCEEDED');
    }
   }
   if([...held.values()].some(q=>q.length))return fail('UNFINISHED_SOURCE_NOTES');
   i=end;
  }
  return notes.length?{ok:true,ppq,items:notes,productionEligible:false}:
   fail('MIDI_HAS_NO_COMPLETE_NOTES');
 }catch(e){return fail(typeof e.message==='string'&&/^[A-Z0-9_]{4,50}$/.test(e.message)?
  e.message:'MIDI_PARSE_FAILED')}
}
export function matchPianoMotionMidiEvents(midiBytes,scoreNotes,candidates){
 const original=originalMidiSourceEvents(midiBytes);
 if(!original.ok)return fail('ORIGINAL_'+original.reason);
 if(!Array.isArray(scoreNotes)||scoreNotes.length!==original.items.length||
    !Array.isArray(candidates)||candidates.length!==original.items.length)
  return fail('NOTE_COUNTS_DO_NOT_MATCH');
 const byId=new Map(original.items.map(n=>[n.noteId,n]));
 const byEvent=new Map(original.items.map(n=>[key(n),n]));
 if(byId.size!==original.items.length||byEvent.size!==original.items.length)
  return fail('AMBIGUOUS_ORIGINAL_MIDI_EVENTS');
 const scoreIds=new Set();
 for(const n of scoreNotes){
  if(!n||typeof n.noteId!=='string'||scoreIds.has(n.noteId))
   return fail('DUPLICATE_OR_MISSING_SCORE_NOTE');
  scoreIds.add(n.noteId);
  const raw=byId.get(n.noteId);
  if(!raw||raw.pitch!==n.pitch||raw.channel!==n.channel||
   raw.midiTrackIndex!==n.sourceTrack||raw.velocity!==n.velocity||
   !Number.isFinite(n.scoreBeat)||!Number.isFinite(n.scoreBeatLength)||
   Math.abs(n.scoreBeat*original.ppq-raw.startTick)>.001||
   Math.abs(n.scoreBeatLength*original.ppq-(raw.endTick-raw.startTick))>.001)
   return fail('PLAY_ALONG_NOTE_SOURCE_MISMATCH');
 }
 const seen=new Set(),items=[];
 for(const p of candidates){
  const e=p?.sourceEvent;
  if(!e||!['RH','LH'].includes(p.hand)||
     !(p.finger===null||Number.isInteger(p.finger)&&p.finger>=1&&p.finger<=5)||
     !['played','unresolved'].includes(p.disposition))
   return fail('INVALID_PIANOMOTION_PROPOSAL');
  const raw=byEvent.get(key(e));
  if(!raw||seen.has(raw.noteId)||!scoreIds.has(raw.noteId)||raw.pitch!==p.pitch)
   return fail('UNKNOWN_DUPLICATE_OR_CHANGED_MIDI_LOCATOR');
  seen.add(raw.noteId);
  items.push({noteId:raw.noteId,pitch:raw.pitch,hand:p.hand,finger:p.finger,
   source:'pianomotion-research',expertValidated:false});
 }
 if(seen.size!==scoreIds.size)return fail('INCOMPLETE_PIANOMOTION_SOURCE_MAPPING');
 return {ok:true,method:'fg04c8-exact-raw-midi-ordinal-mapping',
  originalNotes:original.items.length,items,productionEligible:false,
  sourceOrdinalVerified:true,expertValidated:false};
}
