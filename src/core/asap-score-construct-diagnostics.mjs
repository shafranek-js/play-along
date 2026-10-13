/**
 * FG-04B3d: read-only structural anomaly inventory for ORIGINAL MIDI scores
 * and lexical MusicXML constructs. Designed for CC BY-NC-SA research corpus.
 *
 * IMPORTANT: detecting a zero-tick MIDI note is NOT permission to lengthen,
 * suppress, replace or re-label it. No source or production code is modified.
 */
const MAX_BYTES=4_000_000,MAX_TRACKS=64,MAX_NOTES=25_000,MAX_TICKS=100_000_000;
const reject=code=>{throw Error(code)};
const strict=(cond,code)=>{if(!cond)reject(code)};

/**
 * Strict structural MIDI scanner that permits zero-tick note pairs for
 * diagnostics only. It is independent of the production MIDI parser.
 * It does NOT unfold sustain pedal, same-key overlaps or performance tempo.
 * Zero event locations include raw pitches only in ephemeral in-memory output;
 * the public corpus report exports COUNTS and booleans only.
 */
export function inspectSourceMidiAnomalies(raw){
 const b=raw instanceof Uint8Array?raw:raw instanceof ArrayBuffer?new Uint8Array(raw):null;
 strict(b&&b.length>=22&&b.length<=MAX_BYTES,'SOURCE_MIDI_INVALID_SIZE');
 const tag=i=>String.fromCharCode(...b.subarray(i,i+4));
 const u16=i=>(b[i]<<8)|b[i+1];
 const u32=i=>b[i]*0x1000000+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3];
 strict(tag(0)==='MThd'&&u32(4)===6,'SOURCE_MIDI_BAD_HEADER');
 const format=u16(8),tracks=u16(10),division=u16(12);
 strict((format===0||format===1)&&(format!==0||tracks===1)&&
  tracks>=1&&tracks<=MAX_TRACKS&&division>0&&!(division&0x8000),
  'SOURCE_MIDI_UNSUPPORTED_FORMAT');
 let pos=14,numberOfNotes=0,positiveNotes=0,zeroEvents=[];
 let tempoEvents=0;
 for(let track=0;track<tracks;track++){
  strict(pos+8<=b.length&&tag(pos)==='MTrk','SOURCE_MIDI_TRACK_MISSING');
  const size=u32(pos+4),end=pos+8+size;
  strict(size>=4&&end<=b.length,'SOURCE_MIDI_TRACK_OVERRUN');
  pos+=8;
  let tick=0,status=0,finished=false;
  const held=new Map();
  const vlq=()=>{
   let number=0;
   for(let k=0;k<4;k++){
    strict(pos<end,'SOURCE_MIDI_TRUNCATED_DELTA');
    const x=b[pos++];
    number=(number<<7)|(x&127);
    if(!(x&128))return number;
   }
   reject('SOURCE_MIDI_INVALID_VLQ');
  };
  while(pos<end){
   tick+=vlq();
   strict(tick<=MAX_TICKS&&pos<end,'SOURCE_MIDI_TICK_RANGE');
   const first=b[pos];
   let op;
   if(first&128){
    op=b[pos++];
    status=op<240?op:0;
   }else{
    strict(status>=0x80&&status<=0xef,'SOURCE_MIDI_BAD_RUNNING_STATUS');
    op=status;
   }
   if(op===255){
    strict(pos<end,'SOURCE_MIDI_TRUNCATED_META');
    const type=b[pos++],count=vlq();
    strict(pos+count<=end,'SOURCE_MIDI_META_OVERRUN');
    if(type===0x51){strict(count===3,'SOURCE_MIDI_BAD_TEMPO');tempoEvents++;}
    if(type===0x2f){
     strict(count===0&&pos===end,'SOURCE_MIDI_EARLY_END_OF_TRACK');
     finished=true;
    }
    pos+=count;
    if(finished)break;
    continue;
   }
   // Original score-MIDI source contract deliberately rejects SysEx
   // and other unsupported transport messages; no silent byte skipping.
   strict(op>=0x80&&op<=0xef,'SOURCE_MIDI_UNSUPPORTED_EVENT');
   const kind=op&0xf0,channel=op&0x0f;
   const width=kind===0xc0||kind===0xd0?1:2;
   strict(pos+width<=end,'SOURCE_MIDI_CHANNEL_OVERRUN');
   const data1=b[pos++],data2=width===2?b[pos++]:0;
   strict(data1<128&&data2<128,'SOURCE_MIDI_INVALID_CHANNEL_DATA');
   const key=channel+':'+data1;
   if(kind===0x90&&data2>0){
    strict(!held.has(key),'SOURCE_MIDI_AMBIGUOUS_SAME_KEY_OVERLAP');
    held.set(key,tick);
   }else if(kind===0x80||(kind===0x90&&data2===0)){
    strict(held.has(key),'SOURCE_MIDI_ORPHAN_NOTE_OFF');
    const onset=held.get(key);
    strict(tick>=onset,'SOURCE_MIDI_NEGATIVE_DURATION');
    held.delete(key);
    numberOfNotes++;
    strict(numberOfNotes<=MAX_NOTES,'SOURCE_MIDI_TOO_MANY_NOTES');
    if(tick===onset){
     zeroEvents.push({track,channel,pitch:data1,tick});
    }else positiveNotes++;
   }
  }
  strict(finished&&!held.size,'SOURCE_MIDI_UNFINISHED_TRACK');
  pos=end;
 }
 strict(pos===b.length&&numberOfNotes>0,'SOURCE_MIDI_TRAILING_OR_EMPTY');
 return {format,tracks,division,numberOfNotes,positiveNotes,
  zeroLengthNotes:zeroEvents.length,zeroEvents,tempoEvents,
  // Safe policy: never treat a zero-duration source event as a playable note.
  zeroNotesRepaired:false,canAssertAllNoteTiming:zeroEvents.length===0};
}

/**
 * Bounded lexical feature inventory, not a complete MusicXML parser. It
 * establishes presence and author timing attributes, NOT performed timing.
 */
export function inspectMusicXmlNotationMarkers(xml){
 strict(typeof xml==='string'&&xml.length>0&&xml.length<=MAX_BYTES,
  'SOURCE_XML_INVALID_SIZE');
 strict(/<score-partwise(?:\s|>)/.test(xml)&&!/<score-timewise\b/.test(xml),
  'SOURCE_XML_PARTWISE_REQUIRED');
 strict(!/<!ENTITY\b|<!\[CDATA\[/i.test(xml),'SOURCE_XML_ENTITY_DISALLOWED');
 const clean=xml.replace(/<!--[\s\S]*?-->/g,'');
 const grace=[...clean.matchAll(/<grace\b([^<>]*?)\/?>/g)];
 const repeats=[...clean.matchAll(/<repeat\b([^<>]*?)\/?>/g)];
 const endings=[...clean.matchAll(/<ending\b([^<>]*?)\/?>/g)];
 const sound=[...clean.matchAll(/<sound\b([^<>]*?)\/?>/g)];
 const attrs=(s,name)=>{
  const m=s.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*["\\x27]([^"\\x27]*)["\\x27]','i'));
  return m?.[1]??null;
 };
 const graceExplicit=grace.filter(m=>['steal-time-previous','steal-time-following','make-time']
  .some(k=>attrs(m[1],k)!==null)).length;
 const backward=repeats.filter(m=>attrs(m[1],'direction')==='backward').length;
 const forward=repeats.filter(m=>attrs(m[1],'direction')==='forward').length;
 const jumps=sound.filter(m=>['dacapo','dalsegno','tocoda','fine']
  .some(k=>attrs(m[1],k)!==null)).length;
 return {schema:'fg04b3d-lexical-musicxml-notation-v1',
  graceMarkers:grace.length,graceWithTimingAttributes:graceExplicit,
  graceWithoutTimingAttributes:grace.length-graceExplicit,
  repeatMarkers:repeats.length,forwardRepeats:forward,
  backwardRepeats:backward,otherRepeatDirections:repeats.length-forward-backward,
  endingMarkers:endings.length,scoreNavigationSoundMarkers:jumps,
  // Lexical markers do not establish played-note counts or safe expansion.
  repeatExpansionValidated:false,graceTimingValidated:false};
}

export function summarizeSourceDiagnostics(cases){
 strict(Array.isArray(cases)&&cases.length===16,
  'SOURCE_DIAGNOSTIC_SCOPE_MISMATCH');
 const ids=new Set();
 const totals={zeroLengthNotes:0,sourceMidiNotes:0,graceMarkers:0,
  graceWithTimingAttributes:0,repeatMarkers:0,endingMarkers:0,
  scoreNavigationSoundMarkers:0};
 const pieceStatus=[];
 for(const row of cases){
  strict(typeof row?.id==='string'&&/^[a-z0-9-]{3,60}$/.test(row.id)&&
   !ids.has(row.id),'SOURCE_DIAGNOSTIC_DUPLICATE_CASE');
  ids.add(row.id);
  const midi=row.midi,xml=row.musicxml;
  strict(Number.isSafeInteger(midi?.numberOfNotes)&&midi.numberOfNotes>0&&
   Number.isSafeInteger(midi?.zeroLengthNotes)&&midi.zeroLengthNotes>=0&&
   midi.zeroLengthNotes<=midi.numberOfNotes,
   'SOURCE_DIAGNOSTIC_INVALID_MIDI');
  for(const k of ['graceMarkers','graceWithTimingAttributes','repeatMarkers',
   'endingMarkers','scoreNavigationSoundMarkers']){
   strict(Number.isSafeInteger(xml?.[k])&&xml[k]>=0,
    'SOURCE_DIAGNOSTIC_INVALID_XML');
  }
  strict(xml.graceWithTimingAttributes<=xml.graceMarkers,
   'SOURCE_DIAGNOSTIC_INVALID_GRACE');
  for(const k of Object.keys(totals)){
   const value=k==='sourceMidiNotes'?midi.numberOfNotes:k==='zeroLengthNotes'?
    midi.zeroLengthNotes:xml[k];
   totals[k]+=value;
  }
  pieceStatus.push({id:row.id,sourceMidiNotes:midi.numberOfNotes,
   zeroLengthNotes:midi.zeroLengthNotes,graceMarkers:xml.graceMarkers,
   graceWithTimingAttributes:xml.graceWithTimingAttributes,
   repeatMarkers:xml.repeatMarkers,endingMarkers:xml.endingMarkers,
   scoreNavigationSoundMarkers:xml.scoreNavigationSoundMarkers,
   independentScoreToMidiValidated:false});
 }
 return {schema:'fg04b3d-source-construct-diagnostics-v1',
  casesChecked:16,totals,piecesWithZeroMidiNotes:pieceStatus
   .filter(x=>x.zeroLengthNotes>0).map(x=>x.id),
  piecesWithGrace:pieceStatus.filter(x=>x.graceMarkers>0).map(x=>x.id),
  piecesWithRepeatOrJump:pieceStatus.filter(x=>x.repeatMarkers+x.endingMarkers+
   x.scoreNavigationSoundMarkers>0).map(x=>x.id),
  perPiece:pieceStatus,
  musicAltered:false,automaticFixesApplied:0,
  xmlMidiAlignmentImprovementClaimed:false,
  productionAutoFingeringAllowed:false};
}
