/**
 * FG-04B3d — immutable research source diagnostics, NOT MIDI repair.
 * Inspects every SMF event without importing its notes into the player or
 * changing the original bytes, note-on/release times, or note identity.
 * The result contains counts only: never pitches, ticks or score fragments.
 */
const MAX_BYTES=4_000_000,MAX_TRACKS=64,MAX_EVENTS=500_000,MAX_TICKS=100_000_000;
const die=message=>{throw Error(message)};
const count=(s,re)=>(s.match(re)||[]).length;

export function inspectScoreMidiAnomalies(raw){
 const b=raw instanceof Uint8Array?raw:
  raw instanceof ArrayBuffer?new Uint8Array(raw):null;
 if(!b||b.length<22||b.length>MAX_BYTES)die('INVALID_DIAGNOSTIC_MIDI_SIZE');
 const code=i=>String.fromCharCode(...b.subarray(i,i+4));
 const u16=i=>(b[i]<<8)|b[i+1];
 const u32=i=>b[i]*0x1000000+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
 if(code(0)!=='MThd'||u32(4)!==6)die('INVALID_DIAGNOSTIC_MIDI_HEADER');
 const format=u16(8),trackCount=u16(10),division=u16(12);
 if(![0,1].includes(format)||(format===0&&trackCount!==1)||
    trackCount<1||trackCount>MAX_TRACKS||division<1||(division&0x8000))
  die('UNSUPPORTED_DIAGNOSTIC_MIDI_FORMAT');
 let pos=14,totalEvents=0,noteEvents=0,pairedNotes=0,zeroLengthNotes=0,
     overlapStarts=0,unpairedOffs=0,danglingOns=0,tempoEvents=0,
     sustainPedalEvents=0,channelEvents=0;
 const zeroByTrack=[];
 for(let track=0;track<trackCount;track++){
  if(pos+8>b.length||code(pos)!=='MTrk')
   die('MISSING_DIAGNOSTIC_MIDI_TRACK');
  const length=u32(pos+4);
  pos+=8;
  const end=pos+length;
  if(!length||end>b.length)die('INVALID_DIAGNOSTIC_TRACK_LENGTH');
  let tick=0,runStatus=0,closed=false,trackZero=0;
  const held=new Map();
  const vlq=()=>{
   let v=0;
   for(let i=0;i<4;i++){
    if(pos>=end)die('TRUNCATED_DIAGNOSTIC_VLQ');
    const n=b[pos++];
    v=(v<<7)|(n&127);
    if(!(n&128))return v;
   }
   die('INVALID_DIAGNOSTIC_VLQ');
  };
  while(pos<end){
   if(++totalEvents>MAX_EVENTS)die('TOO_MANY_DIAGNOSTIC_EVENTS');
   tick+=vlq();
   if(tick>MAX_TICKS||pos>=end)die('INVALID_DIAGNOSTIC_EVENT_POSITION');
   const first=b[pos];
   let op;
   if(first&128){
    op=b[pos++];
    runStatus=op>=0x80&&op<=0xef?op:0;
   }else{
    if(runStatus<0x80||runStatus>0xef)die('BAD_DIAGNOSTIC_RUNNING_STATUS');
    op=runStatus;
   }
   if(op===0xff){
    if(pos>=end)die('TRUNCATED_DIAGNOSTIC_META');
    const type=b[pos++],size=vlq();
    if(pos+size>end)die('TRUNCATED_DIAGNOSTIC_META');
    if(type===0x51){
     if(size!==3)die('INVALID_DIAGNOSTIC_TEMPO');
     tempoEvents++;
    }
    pos+=size;
    if(type===0x2f){
     if(size||pos!==end)die('BAD_DIAGNOSTIC_END_OF_TRACK');
     closed=true;
     break;
    }
    continue;
   }
   if(op===0xf0||op===0xf7){
    const length=vlq();
    if(pos+length>end)die('TRUNCATED_DIAGNOSTIC_SYSEX');
    pos+=length;
    continue;
   }
   if(op<0x80||op>0xef)die('UNSUPPORTED_DIAGNOSTIC_EVENT');
   const kind=op&0xf0,channel=op&15;
   const fields=kind===0xc0||kind===0xd0?1:2;
   if(pos+fields>end)die('TRUNCATED_DIAGNOSTIC_CHANNEL_EVENT');
   const pitch=b[pos++],velocity=fields===2?b[pos++]:0;
   if(pitch>127||velocity>127)die('INVALID_DIAGNOSTIC_DATA_BYTE');
   channelEvents++;
   const key=channel+':'+pitch;
   if(kind===0x90&&velocity>0){
    noteEvents++;
    if(held.has(key))overlapStarts++;
    // Do not claim a pairing for overlapping source events. Replace only
    // for counting; the original strict comparator still rejects the file.
    held.set(key,tick);
   }else if(kind===0x80||(kind===0x90&&velocity===0)){
    const start=held.get(key);
    if(start===undefined)unpairedOffs++;
    else {
     pairedNotes++;
     if(start===tick){zeroLengthNotes++;trackZero++;}
     held.delete(key);
    }
   }else if(kind===0xb0&&pitch===64)sustainPedalEvents++;
  }
  if(!closed)die('UNFINISHED_DIAGNOSTIC_MIDI_TRACK');
  danglingOns+=held.size;
  zeroByTrack.push({trackIndex:track,count:trackZero});
  pos=end;
 }
 if(pos!==b.length)die('TRAILING_DIAGNOSTIC_MIDI_BYTES');
 return {status:'inspected',format,tracks:trackCount,division,
  totalEvents,channelEvents,noteOns:noteEvents,pairedNotes,
  zeroLengthNotes,zeroByTrack,
  overlappingSameChannelStarts:overlapStarts,unpairedNoteOffs:unpairedOffs,
  danglingNoteOns:danglingOns,tempoEvents,sustainPedalEvents,
  // Source anomaly counts alone cannot determine a musically correct fix.
  originalMidiEdited:false,zeroNotesDiscarded:false,
  inferredNoteDuration:false,productionAutoFingeringAllowed:false};
}

/**
 * A bounded feature inventory, not a MusicXML parser. In particular,
 * presence of <grace> does not determine an exact MIDI performance duration,
 * and presence of a repeat does not determine validated unfolded order.
 */
export function inspectScoreXmlNotationFeatures(xml){
 if(typeof xml!=='string'||xml.length<20||xml.length>MAX_BYTES)
  die('INVALID_DIAGNOSTIC_XML_SIZE');
 if(/<!ENTITY\b/i.test(xml)||/<!\[CDATA\[/i.test(xml))
  die('UNSAFE_DIAGNOSTIC_XML_ENTITY');
 if(!/<score-partwise\b/.test(xml)||!/<\/score-partwise\s*>/.test(xml))
  die('INVALID_DIAGNOSTIC_XML_PARTWISE');
 const repeatElements=[...xml.matchAll(/<repeat\b([^<>]*)\/?>/g)];
 const repeatForward=repeatElements.filter(x=>/\bdirection\s*=\s*["']forward["']/.test(x[1])).length;
 const repeatBackward=repeatElements.filter(x=>/\bdirection\s*=\s*["']backward["']/.test(x[1])).length;
 const repeatUnspecified=repeatElements.length-repeatForward-repeatBackward;
 const graceNotes=count(xml,/<grace(?:\s|\/|>)/g);
 const endingElements=count(xml,/<ending(?:\s|\/|>)/g);
 const navigationElements=count(xml,/<(?:segno|coda|dalsegno|dacapo|tocoda)(?:\s|\/|>)/g)+
  count(xml,/<sound\b[^<>]*\b(?:dalsegno|dacapo|tocoda)\s*=/g);
 const ornamentElements=count(xml,/<(?:trill-mark|mordent|inverted-mordent|turn|inverted-turn|tremolo)(?:\s|\/|>)/g);
 const tempoDirections=count(xml,/<sound\b[^<>]*\btempo\s*=/g)+
  count(xml,/<metronome(?:\s|\/|>)/g);
 return {status:'inspected',noteElements:count(xml,/<note(?:\s|>)/g),
  graceNotes,repeatForward,repeatBackward,repeatUnspecified,
  endingElements,navigationElements,ornamentElements,
  tempoDirections,voiceBackupElements:count(xml,/<backup(?:\s|>)/g),
  tiesStarted:count(xml,/<tie\b[^<>]*\btype\s*=\s*["']start["']/g),
  tiesStopped:count(xml,/<tie\b[^<>]*\btype\s*=\s*["']stop["']/g),
  scoreXmlEdited:false,graceTimingInferred:false,
  repeatPathInferred:false,productionAutoFingeringAllowed:false};
}

export function summarizeScoreAnomalies(cases){
 if(!Array.isArray(cases)||cases.length!==16)die('INCOMPLETE_SCORE_ANOMALY_SCOPE');
 const ids=new Set(),totals={zeroLengthNotes:0,graceNotes:0,
  forwardRepeats:0,backwardRepeats:0,endingElements:0,ornamentElements:0};
 let withZero=0,withGrace=0,withRepeats=0;
 const perScore=[];
 for(const x of cases){
  if(typeof x?.id!=='string'||ids.has(x.id)||
     x.midi?.status!=='inspected'||x.xml?.status!=='inspected')
   die('INVALID_SCORE_ANOMALY_ENTRY');
  ids.add(x.id);
  const z=x.midi.zeroLengthNotes,g=x.xml.graceNotes;
  const repeats=x.xml.repeatForward+x.xml.repeatBackward+
   x.xml.repeatUnspecified+x.xml.endingElements+x.xml.navigationElements;
  if(![z,g,repeats].every(n=>Number.isSafeInteger(n)&&n>=0))
   die('INVALID_SCORE_ANOMALY_COUNTS');
  totals.zeroLengthNotes+=z;totals.graceNotes+=g;
  totals.forwardRepeats+=x.xml.repeatForward;
  totals.backwardRepeats+=x.xml.repeatBackward;
  totals.endingElements+=x.xml.endingElements;
  totals.ornamentElements+=x.xml.ornamentElements;
  if(z)withZero++;
  if(g)withGrace++;
  if(repeats)withRepeats++;
  perScore.push({id:x.id,midi:x.midi,xml:x.xml});
 }
 return {schema:'fg04b3d-source-anomaly-audit-v1',scores:16,
  withZeroLengthMidi:withZero,withGraceNotes:withGrace,withRepeatNavigation:withRepeats,
  totals,perScore,originalDataEdited:false,
  midiClockAltered:false,midiZeroNotesAutoDiscarded:false,
  graceOrRepeatTimingInferred:false,
  independentPianistReview:false,productionAutoFingeringAllowed:false};
}
