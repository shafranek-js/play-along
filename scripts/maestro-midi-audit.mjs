/**
 * MAE-02B: offline, read-only quality audit of official MAESTRO v3 MIDI archive.
 * No fingering inference, no player clock changes, no bundled source dataset.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {parseCsv,validateMetadata,selectQaCorpus,MAESTRO} from './maestro-corpus.mjs';

const fail=message=>{throw Error(message)};
const check=(ok,message)=>{if(!ok)fail(message)};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_ZIP=100_000_000,MAX_ENTRY=5_000_000;
function crc32(bytes){
 let c=0xffffffff;
 for(const v of bytes){c^=v;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1}
 return (c^0xffffffff)>>>0;
}
export function openMidiZip(bytes){
 const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 check(b.length>=22&&b.length<=MAX_ZIP,'ZIP_SIZE_UNSUPPORTED');
 let end=-1;
 for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--){
  if(b.readUInt32LE(p)===0x06054b50&&p+22+b.readUInt16LE(p+20)===b.length){end=p;break}
 }
 check(end>=0,'ZIP_END_RECORD_MISSING');
 check(b.readUInt16LE(end+4)===0&&b.readUInt16LE(end+6)===0,'ZIP_MULTIDISK_UNSUPPORTED');
 const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),offset=b.readUInt32LE(end+16);
 check(count>=1276&&count<=1500&&offset+size<=end,'ZIP_CENTRAL_DIRECTORY_INVALID');
 const entries=new Map();let p=offset;
 for(let i=0;i<count;i++){
  check(p+46<=end&&b.readUInt32LE(p)===0x02014b50,'ZIP_CENTRAL_ENTRY_INVALID');
  const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),crc=b.readUInt32LE(p+16);
  const compressed=b.readUInt32LE(p+20),uncompressed=b.readUInt32LE(p+24);
  const n=b.readUInt16LE(p+28),extra=b.readUInt16LE(p+30),comment=b.readUInt16LE(p+32);
  const local=b.readUInt32LE(p+42);
  check(p+46+n+extra+comment<=offset+size,'ZIP_CENTRAL_BOUNDS');
  const name=b.subarray(p+46,p+46+n).toString('utf8');
  check(name&&name.length<=600&&!name.includes('\\')&&!name.includes('\0')&&!name.startsWith('/')&&!name.split('/').some(v=>v==='.'||v==='..'),'ZIP_UNSAFE_ENTRY_PATH');
  check(!entries.has(name),'ZIP_DUPLICATE_ENTRY');
  check((flags&1)===0&&(flags&0x40)===0&&(method===0||method===8),'ZIP_ENCRYPTED_OR_METHOD_UNSUPPORTED');
  if(!name.endsWith('/')){
   check(compressed<=MAX_ENTRY&&uncompressed<=MAX_ENTRY&&uncompressed>0,'ZIP_ENTRY_SIZE_UNSUPPORTED');
   check(local+30<=offset&&b.readUInt32LE(local)===0x04034b50,'ZIP_LOCAL_HEADER_INVALID');
  }
  entries.set(name,{name,method,crc,compressed,uncompressed,local});
  p+=46+n+extra+comment;
 }
 check(p===offset+size,'ZIP_CENTRAL_SIZE_MISMATCH');
 return {
  entries,
  extract(name){
   const e=entries.get(name);
   check(e&&!name.endsWith('/'),'ZIP_ENTRY_MISSING');
   const localName=b.readUInt16LE(e.local+26),localExtra=b.readUInt16LE(e.local+28);
   const start=e.local+30+localName+localExtra;
   check(start+e.compressed<=offset,'ZIP_COMPRESSED_BOUNDS');
   check(b.subarray(e.local+30,e.local+30+localName).toString('utf8')===name,'ZIP_NAME_MISMATCH');
   const compressed=b.subarray(start,start+e.compressed);
   const data=e.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:MAX_ENTRY});
   check(data.length===e.uncompressed&&crc32(data)===e.crc,'ZIP_ENTRY_CRC_OR_LENGTH_MISMATCH');
   return data;
  }
 };
}
export function locateMidiEntries(archive,metadataRows){
 const allMidi=[...archive.entries.keys()].filter(p=>/\.midi?$/i.test(p)&&!p.endsWith('/'));
 check(allMidi.length===metadataRows.length,'ARCHIVE_MIDI_COUNT_MISMATCH');
 const paths=new Map();
 for(const name of allMidi){
  const candidates=metadataRows.filter(r=>name===r.midi_filename||name.endsWith('/'+r.midi_filename));
  check(candidates.length===1,'ARCHIVE_UNMATCHED_OR_AMBIGUOUS_MIDI: '+name);
  const key=candidates[0].midi_filename;
  check(!paths.has(key),'ARCHIVE_DUPLICATE_MATCH: '+key);
  paths.set(key,name);
 }
 check(paths.size===metadataRows.length,'ARCHIVE_MISSING_METADATA_FILES');
 return paths;
}
function midiDecoder(raw){
 const b=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
 check(b.length>=22&&b.length<=MAX_ENTRY,'MIDI_SIZE_UNSUPPORTED');
 const u16=i=>b.readUInt16BE(i),u32=i=>b.readUInt32BE(i);
 check(b.toString('ascii',0,4)==='MThd'&&u32(4)===6,'MIDI_HEADER_INVALID');
 const format=u16(8),trackCount=u16(10),division=u16(12);
 check((format===0||format===1)&&trackCount>0&&trackCount<=64&&!(division&0x8000)&&division>0,'MIDI_FORMAT_UNSUPPORTED');
 const events=[],tempos=[];let offset=14,serial=0,lastTick=0;
 for(let track=0;track<trackCount;track++){
  check(offset+8<=b.length&&b.toString('ascii',offset,offset+4)==='MTrk','MIDI_TRACK_INVALID');
  const size=u32(offset+4);offset+=8;
  const stop=offset+size;check(stop<=b.length,'MIDI_TRACK_BOUNDS');
  let p=offset,tick=0,running=0,terminated=false;
  const vlq=()=>{
   let result=0;
   for(let k=0;k<4;k++){
    check(p<stop,'MIDI_TRUNCATED_VLQ');
    const v=b[p++];result=result*128+(v&127);
    if(!(v&128))return result;
   }
   fail('MIDI_VLQ_TOO_LONG');
  };
  while(p<stop){
   tick+=vlq();check(tick<=200_000_000&&p<stop,'MIDI_TICK_OVERFLOW');
   lastTick=Math.max(lastTick,tick);
   const first=b[p],op=(first&128)?b[p++]:running;
   if(first&128)running=op>=0x80&&op<0xf0?op:0;
   check(op>=0x80,'MIDI_RUNNING_STATUS_INVALID');
   if(op===0xff){
    check(p<stop,'MIDI_META_TRUNCATED');
    const type=b[p++],len=vlq();
    check(p+len<=stop,'MIDI_META_BOUNDS');
    if(type===0x51){check(len===3,'MIDI_TEMPO_LENGTH');const micros=b.readUIntBE(p,3);check(micros>0,'MIDI_TEMPO_ZERO');tempos.push({tick,micros})}
    p+=len;
    if(type===0x2f){check(len===0&&p===stop,'MIDI_END_TRACK_INVALID');terminated=true;break}
   }else if(op===0xf0||op===0xf7){const len=vlq();check(p+len<=stop,'MIDI_SYSEX_BOUNDS');p+=len}
   else {
    check(op>=0x80&&op<0xf0,'MIDI_STATUS_UNSUPPORTED');
    const kind=op&0xf0,channel=op&0x0f,n=kind===0xc0||kind===0xd0?1:2;
    check(p+n<=stop,'MIDI_DATA_TRUNCATED');
    const key=b[p++],value=n===2?b[p++]:0;
    check(key<128&&value<128,'MIDI_DATA_INVALID');
    if(kind===0x90&&value>0)events.push({tick,type:'on',pitch:key,velocity:value,channel,track,serial:serial++});
    else if(kind===0x80||kind===0x90&&value===0)events.push({tick,type:'off',pitch:key,channel,track,serial:serial++});
    else if(kind===0xb0&&(key===64||key===66||key===67))events.push({tick,type:'cc',cc:key,value,channel,track,serial:serial++});
   }
   check(serial<=500000,'MIDI_EVENT_LIMIT');
  }
  check(terminated,'MIDI_NO_END_TRACK');
  offset=stop;
 }
 check(offset===b.length,'MIDI_TRAILING_BYTES');
 return {format,division,trackCount,events,tempos,lastTick};
}
/**
 * MAE-03A: independent reference of the ORIGINAL MIDI key and pedal timeline.
 * No synthesized sound, UI state, MusicXML, source fingering, or redistribution.
 * Pair same pitch by track+channel FIFO, matching SMF identity semantics.
 * Preserve the exact original key-up interval (no teaching/display minima).
 */
export function maestroReferenceEvents(raw){
 const {division,trackCount,events,tempos}=midiDecoder(raw);
 const ordered=[...tempos].sort((a,b)=>a.tick-b.tick);
 const tempoMap=[{tick:0,micros:500000,sec:0}];
 for(const t of ordered){
  const last=tempoMap.at(-1);
  if(last.tick===t.tick){last.micros=t.micros;continue}
  tempoMap.push({tick:t.tick,micros:t.micros,sec:last.sec+
   (t.tick-last.tick)/division*last.micros/1000000});
 }
 const secs=tick=>{
  let a=0,b=tempoMap.length-1;
  while(a<b){const mid=Math.ceil((a+b)/2);if(tempoMap[mid].tick<=tick)a=mid;else b=mid-1}
  const t=tempoMap[a];return t.sec+(tick-t.tick)/division*t.micros/1000000;
 };
 const tracks=new Map(),held=new Map(),cc=[],dangling=[];
 for(const e of events.sort((a,b)=>a.tick-b.tick||a.serial-b.serial)){
  if(e.type==='cc'){cc.push({time:secs(e.tick),track:e.track,channel:e.channel,
   controller:e.cc,value:e.value});continue}
  const key=e.track+':'+e.channel+':'+e.pitch;
  if(e.type==='on'){
   const queue=held.get(key)||[];queue.push(e);held.set(key,queue);
  }else{
   const queue=held.get(key);
   if(!queue?.length)continue;
   const on=queue.shift();
   if(!queue.length)held.delete(key);
   const list=tracks.get(e.track)||[];
   list.push({sourceTrack:e.track,channel:e.channel,pitch:e.pitch,
    start:secs(on.tick),duration:secs(on.tick+Math.max(1,e.tick-on.tick))-secs(on.tick),
    velocity:on.velocity});
   tracks.set(e.track,list);
  }
 }
 for(const queue of held.values())dangling.push(...queue);
 const sourceTrackOrder=[...tracks.keys()].sort((a,b)=>a-b);
 const trackIndexBySource=new Map(sourceTrackOrder.map((v,i)=>[v,i]));
 const notes=sourceTrackOrder.flatMap(track=>tracks.get(track).map(n=>({...n,track:trackIndexBySource.get(track)})));
 notes.sort((a,b)=>a.track-b.track||a.start-b.start||a.pitch-b.pitch||a.channel-b.channel||a.duration-b.duration||a.velocity-b.velocity);
 cc.sort((a,b)=>a.time-b.time||a.track-b.track||a.channel-b.channel||a.controller-b.controller||a.value-b.value);
 return {ppq:division,sourceTrackCount:trackCount,notes,cc,dangling_noteon_count:dangling.length,
  tempoPoints:tempoMap.map(({tick,micros,sec})=>({tick,micros,sec}))};
}

export function profileMidi(raw,metadataDuration=null){
 const {division,trackCount,events,tempos,lastTick}=midiDecoder(raw);
 const tempoMap=[{tick:0,micros:500000}];
 for(const tempo of tempos.sort((a,b)=>a.tick-b.tick||a.micros-b.micros)){
  const prev=tempoMap.at(-1);
  if(prev.tick===tempo.tick){check(prev.tick!==0||prev.micros===500000||tempo.tick!==0,'MIDI_DUPLICATE_START_TEMPO');prev.micros=tempo.micros}
  else tempoMap.push({...tempo});
 }
 let p=tempoMap[0],seconds=0;
 for(let i=1;i<tempoMap.length;i++){
  const next=tempoMap[i];seconds+=(next.tick-p.tick)*p.micros/1e6/division;next.seconds=seconds;p=next;
 }
 const time=tick=>{
  let lo=0,hi=tempoMap.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tempoMap[mid].tick<=tick)lo=mid;else hi=mid-1}
  const x=tempoMap[lo];return (x.seconds??0)+(tick-x.tick)*x.micros/1e6/division;
 };
 events.sort((a,b)=>a.tick-b.tick||(a.type==='off'?-1:b.type==='off'?1:0)||a.serial-b.serial);
 const held=new Map(),velocities=[],pitches=[],onsets=[];
 const pedal={64:0,66:0,67:0},pedalDown={64:0,66:0,67:0};
 let current=0,maxPolyphony=0,unpairedOff=0,danglingOn=0,overlappingSamePitch=0;
 for(const e of events){
  if(e.type==='cc'){pedal[e.cc]++;if(e.value>=64)pedalDown[e.cc]++;continue}
  const key=e.channel+':'+e.pitch;
  if(e.type==='on'){
   const active=held.get(key)||[];
   if(active.length)overlappingSamePitch++;
   active.push(e);held.set(key,active);current++;maxPolyphony=Math.max(maxPolyphony,current);
   velocities.push(e.velocity);pitches.push(e.pitch);onsets.push(time(e.tick));
  }else{
   const active=held.get(key);
   if(!active?.length){unpairedOff++;continue}
   active.shift();current--;
   if(!active.length)held.delete(key);
  }
 }
 danglingOn=current;
 check(velocities.length>0,'MIDI_NO_NOTES');
 velocities.sort((a,b)=>a-b);pitches.sort((a,b)=>a-b);onsets.sort((a,b)=>a-b);
 const quantile=q=>velocities[Math.min(velocities.length-1,Math.floor(q*(velocities.length-1)))];
 let repeatedPitchWithin250ms=0;
 const lastByPitch=new Map();
 for(const e of events){
  if(e.type!=='on')continue;
  const t=time(e.tick),prev=lastByPitch.get(e.pitch);
  if(prev!==undefined&&t-prev<=.25&&t>=prev)repeatedPitchWithin250ms++;
  lastByPitch.set(e.pitch,t);
 }
 const durationSeconds=time(lastTick);
 const referenceSeconds=Number.isFinite(metadataDuration)&&metadataDuration>0?metadataDuration:durationSeconds;
 return {
  note_count:velocities.length,track_count:trackCount,ppq:division,tempo_event_count:tempos.length,
  duration_seconds:Number(durationSeconds.toFixed(3)),
  metadata_duration_seconds:Number.isFinite(metadataDuration)?Number(metadataDuration.toFixed(3)):null,
  notes_per_second:Number((velocities.length/referenceSeconds).toFixed(3)),
  pitch_min:pitches[0],pitch_max:pitches.at(-1),
  max_simultaneous_held_notes:maxPolyphony,
  velocity:{min:velocities[0],p10:quantile(.1),median:quantile(.5),p90:quantile(.9),max:velocities.at(-1)},
  repeated_pitch_within_250ms:repeatedPitchWithin250ms,
  cc_counts:{sustain:pedal[64],sostenuto:pedal[66],una_corda:pedal[67]},
  cc_down_events:{sustain:pedalDown[64],sostenuto:pedalDown[66],una_corda:pedalDown[67]},
  integrity:{unpaired_note_off:unpairedOff,dangling_note_on:danglingOn,overlapping_same_channel_pitch_on:overlappingSamePitch}
 };
}
export function auditArchive(csv,zip,{requireOfficialHash=true,expectedArchiveSha256=MAESTRO.zipSha256}={}){
 const {rows,counts}=validateMetadata(parseCsv(csv));
 const actual=hash(zip);
 if(requireOfficialHash)check(actual===expectedArchiveSha256,'ARCHIVE_SHA256_MISMATCH');
 const archive=openMidiZip(zip),paths=locateMidiEntries(archive,rows);
 const candidate=selectQaCorpus(rows),works=[];
 for(const row of candidate){
  const raw=archive.extract(paths.get(row.midi_filename));
  works.push({...row,midi_sha256:hash(raw),profile:profileMidi(raw,row.duration)});
 }
 const sum=(key)=>works.reduce((a,w)=>a+w.profile[key],0);
 return {schema:'play-along-maestro-real-midi-audit/1',
  dataset:{version:MAESTRO.version,license:MAESTRO.license,attribution:MAESTRO.attribution,source:MAESTRO.official,
    official_zip_sha256:expectedArchiveSha256,observed_zip_sha256:actual},
  validation:{archive_sha256_verified:actual===expectedArchiveSha256,metadata_rows:rows.length,split_counts:counts,
    archive_midi_count:paths.size,all_metadata_paths_matched:true,selected_files_crc32_verified:true,
    individual_midi_verified:true,performance_complexity_profiled:true},
  selection:{method:'MAE-02A deterministic metadata candidate selection; measured metrics only, no difficulty label',count:works.length},
  summary:{sample_notes:sum('note_count'),sample_total_seconds:Number(works.reduce((a,w)=>a+w.profile.duration_seconds,0).toFixed(3)),
    unique_composers:new Set(works.map(w=>w.canonical_composer)).size,
    sample_min_pitch:Math.min(...works.map(w=>w.profile.pitch_min)),
    sample_max_pitch:Math.max(...works.map(w=>w.profile.pitch_max)),
    samples_with_cc64:works.filter(w=>w.profile.cc_counts.sustain>0).length,
    samples_with_cc66:works.filter(w=>w.profile.cc_counts.sostenuto>0).length,
    samples_with_cc67:works.filter(w=>w.profile.cc_counts.una_corda>0).length,
    samples_with_unpaired_or_dangling_notes:works.filter(w=>w.profile.integrity.dangling_note_on||w.profile.integrity.unpaired_note_off).length},
  limitations:['No ground-truth hand/finger labels','No MusicXML score identity or fingering','No pedagogical difficulty claims','Note density uses official metadata duration; pedal presses are MIDI CC events, not sound duration'],
  works};
}
async function cli(args){
 const opts={};for(let i=0;i<args.length;i++){const k=args[i];check(['--csv','--zip','--out'].includes(k)&&args[i+1]&&!args[i+1].startsWith('--'),'Usage: node scripts/maestro-midi-audit.mjs --csv METADATA --zip MIDI_ZIP --out REPORT');opts[k]=args[++i]}
 check(opts['--csv']&&opts['--zip']&&opts['--out'],'REQUIRED_CSV_ZIP_OUT');
 const [csv,zip]=await Promise.all([readFile(opts['--csv'],'utf8'),readFile(opts['--zip'])]);
 const report=auditArchive(csv,zip);
 await writeFile(opts['--out'],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'verified',dataset:report.dataset.version,files:report.validation.archive_midi_count,
  selected:report.works.length,notes:report.summary.sample_notes,output:opts['--out']}));
}
if(process.argv[1]?.endsWith('/maestro-midi-audit.mjs')||process.argv[1]?.endsWith('\\maestro-midi-audit.mjs')){
 cli(process.argv.slice(2)).catch(e=>{console.error('MAE-02B AUDIT FAILED: '+e.message);process.exitCode=1});
}
