/**
 * FG-04B3b: conservative MusicXML 3.x partwise score note-event normalizer.
 *
 * Research only. No DOM/network, external entities, automatic finger
 * predictions, score edits, MIDI-derived source IDs, or repeat guessing.
 * Unsupported score constructs FAIL CLOSED with a reason.
 */
import {musicXmlSourceNoteId} from './musicxml-note-identity.mjs';
import {inspectFingeredMidi} from './handthesia-midi-alignment.mjs';
import {alignNormalizedScoreToMidi} from './score-midi-event-alignment.mjs';

const MAX_XML=4_000_000,MAX_NOTES=25000,EPS=1e-7;
const die=code=>{throw Error(code)};
const rejected=reason=>({status:'rejected',reason,summary:null,links:[],
 scoreXmlSemanticValidation:false,sourceRepeatExpansionValidated:false,
 sourceTieConsolidationValidated:false,productionAutoFingeringAllowed:false});
const nameOf=s=>s.replace(/^[\s\n]+|[\s\n]+$/g,'');

/** Decode tags only: deliberately no DTD/entity expansion or XML DOM. */
function topLevel(content){
 const hits=[],stack=[];
 const tags=/<(\/?)([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?(\/?)>/g;
 let m;
 while((m=tags.exec(content))){
  const closing=m[1]==='/',tag=m[2],self=m[3]==='/';
  if(closing){
   const parent=stack.pop();
   if(!parent||parent.name!==tag)die('MALFORMED_XML_NESTING');
   if(!stack.length)hits.push({name:tag,inner:content.slice(parent.at,m.index),
    open:parent.open});
  }else if(self){
   if(!stack.length)hits.push({name:tag,inner:'',open:m[0]});
  }else stack.push({name:tag,at:tags.lastIndex,open:m[0]});
 }
 if(stack.length)die('UNCLOSED_MUSICXML_TAG');
 return hits;
}
const value=(s,tag)=>{
 const m=s.match(new RegExp('<'+tag+'(?:\\s[^<>]*?)?>([^<>]*)<\\/'+tag+'\\s*>'));
 return m?.[1]?.trim()??null;
};
const numeric=(x,code)=>{
 if(x===null||x===''||!/^-?\d+(?:\.\d+)?$/.test(x)||!Number.isFinite(Number(x)))
  die(code);
 return Number(x);
};
const divisionValue=s=>{
 const v=value(s,'divisions');
 if(v===null)return null;
 const d=numeric(v,'INVALID_XML_DIVISIONS');
 if(!Number.isSafeInteger(d)||d<=0||d>1000000)die('INVALID_XML_DIVISIONS');
 return d;
};
const duration=(s,divisions)=>{
 const n=numeric(value(s,'duration'),'INVALID_XML_DURATION');
 if(!Number.isSafeInteger(n)||n<=0||n>1e8)die('INVALID_XML_DURATION');
 return n/divisions;
};
const notePitch=s=>{
 const m=s.match(/<pitch(?:\s[^<>]*)?>([\s\S]*?)<\/pitch\s*>/);
 if(!m)die('UNPITCHED_XML_NOTE');
 const part=m[1],step=value(part,'step'),oct=numeric(value(part,'octave'),'INVALID_XML_PITCH');
 const alt=value(part,'alter')===null?0:numeric(value(part,'alter'),'INVALID_XML_PITCH');
 if(!Number.isSafeInteger(oct)||oct<0||oct>9||!Number.isInteger(alt)||
   alt<-2||alt>2||!/[A-G]/.test(step??'')||(step??'').length!==1)
  die('UNSUPPORTED_XML_PITCH');
 const midi=12*(oct+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[step]+alt;
 if(!Number.isInteger(midi)||midi<0||midi>127)die('UNSUPPORTED_XML_PITCH');
 return midi;
};
const getAttrs=(source,name)=>
  [...source.matchAll(new RegExp('<'+name+'\\b[^<>]*\\btype=["\\x27](start|stop)["\\x27][^<>]*\\/?>','g'))]
  .map(m=>m[1]);

/** Extract score events IN QUARTER NOTES without deriving musical notes from MIDI. */
export function normalizeMusicXmlBeats(xml){
 if(typeof xml!=='string'||!xml.length||xml.length>MAX_XML)
  die('MUSICXML_SIZE_INVALID');
 if(/<!ENTITY\b/i.test(xml)||/<!\s*\[\s*CDATA/i.test(xml))
  die('MUSICXML_ENTITY_OR_CDATA_UNSUPPORTED');
 if(/<score-timewise\b/.test(xml)||!/<score-partwise\b/.test(xml))
  die('MUSICXML_PARTWISE_REQUIRED');
 // The score MIDI and author notation can disagree at ornaments or repeats.
 // Never invent their realization: leave these as explicit no-go reasons.
 if(/<repeat\b|<ending\b|<dalsegno\b|<segno\b|<coda\b|<sound\b[^>]*\b(?:dacapo|dalsegno|tocoda)=/i.test(xml))
  die('MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED');
 const root=xml.match(/<score-partwise\b[^<>]*>([\s\S]*?)<\/score-partwise\s*>/);
 if(!root)die('MUSICXML_ROOT_INVALID');
 const parts=topLevel(root[1]).filter(e=>e.name==='part');
 if(!parts.length||parts.length>32)die('MUSICXML_PARTS_UNSUPPORTED');
 let raw=[],measuresTotal=0,tempoDirections=0;
 for(const [partIndex,part] of parts.entries()){
  const id=part.open.match(/\bid=["']([^"']+)["']/)?.[1]??'';
  if(id.length>256)die('MUSICXML_PART_ID_INVALID');
  let measureBeat=0,divisions=null;
  const measures=topLevel(part.inner).filter(e=>e.name==='measure');
  if(!measures.length||measures.length>5000)die('MUSICXML_MEASURES_UNSUPPORTED');
  for(const [measureIndex,measure] of measures.entries()){
   measuresTotal++;
   let cursor=0,lastOnset=null,maxCursor=0,ordinal=0;
   for(const element of topLevel(measure.inner)){
    if(element.name==='attributes'){
     const d=divisionValue(element.inner);
     if(d!==null)divisions=d;
    }else if(element.name==='direction'){
     if(/<sound\b[^>]*\btempo=|<metronome\b/.test(element.inner))tempoDirections++;
    }else if(element.name==='backup'||element.name==='forward'){
     if(!divisions)die('MUSICXML_DIVISIONS_UNDEFINED');
     const delta=duration(element.inner,divisions);
     cursor+=element.name==='backup'?-delta:delta;
     if(cursor<-EPS)die('MUSICXML_BACKUP_BEFORE_MEASURE');
     cursor=Math.max(0,cursor);maxCursor=Math.max(maxCursor,cursor);
     lastOnset=null;
    }else if(element.name==='note'){
     if(!divisions)die('MUSICXML_DIVISIONS_UNDEFINED');
     const s=element.inner, chord=/<chord\s*\/>/.test(s),
      grace=/<grace\b/.test(s),rest=/<rest(?:\s|\/|>)/.test(s);
     if(grace)die('MUSICXML_GRACE_TIMING_UNSUPPORTED');
     const d=duration(s,divisions);
     const start=chord?lastOnset:cursor;
     if(start===null)die('MUSICXML_CHORD_WITHOUT_ANCHOR');
     if(!chord){lastOnset=cursor;cursor+=d;}
     maxCursor=Math.max(maxCursor,start+d,cursor);
     // Ordinal counts every MusicXML <note>, including rests, to preserve
     // the application's structural ID convention rather than renumbering
     // only playable notes.
     ordinal++;
     if(rest){if(chord)die('MUSICXML_CHORDED_REST');continue;}
     const sourceId=musicXmlSourceNoteId(id,partIndex,measureIndex,ordinal);
     const pitch=notePitch(s);
     const voice=value(s,'voice')??'1',staff=Number(value(s,'staff')??1);
     if(!voice||voice.length>64||!Number.isInteger(staff)||staff<1||staff>64)
      die('INVALID_XML_VOICE_OR_STAFF');
     const ties=new Set([...getAttrs(s,'tie'),...getAttrs(s,'tied')]);
     raw.push({noteId:sourceId,partId:id,partIndex,measureIndex,voice,
      staff,pitch,start:measureBeat+start,duration:d,tieStart:ties.has('start'),
      tieStop:ties.has('stop')});
     if(raw.length>MAX_NOTES)die('MUSICXML_TOO_MANY_NOTES');
    }
   }
   if(!Number.isFinite(maxCursor)||maxCursor<=0)die('MUSICXML_EMPTY_MEASURE');
   measureBeat+=maxCursor;
   if(measureBeat>86400)die('MUSICXML_TOO_LONG');
  }
 }
 // Merge consecutive tied segments ONLY when the XML supplies both ends,
 // voice/part/pitch match, and musical positions touch exactly.
 raw.sort((a,b)=>a.start-b.start||a.partIndex-b.partIndex||
  a.measureIndex-b.measureIndex||a.noteId.localeCompare(b.noteId));
 const open=new Map(),notes=[];
 for(const event of raw){
  const key=[event.partIndex,event.voice,event.pitch].join('|');
  if(event.tieStop){
   const prev=open.get(key);
   if(!prev)die('MUSICXML_UNPAIRED_TIE_STOP');
   if(Math.abs(prev.start+prev.duration-event.start)>EPS)
    die('MUSICXML_NONCONTIGUOUS_TIE');
   prev.duration+=event.duration;
   prev.sourceNoteIds.push(event.noteId);
   if(!event.tieStart)open.delete(key);
  }else{
   if(open.has(key))die('MUSICXML_UNFINISHED_TIE');
   const note={noteId:event.noteId,sourceNoteIds:[event.noteId],
    partId:event.partId,staff:event.staff,voice:event.voice,
    pitch:event.pitch,start:event.start,duration:event.duration};
   notes.push(note);
   if(event.tieStart)open.set(key,note);
  }
 }
 if(open.size)die('MUSICXML_UNFINISHED_TIE');
 // Raw score XML note IDs are retained for audit but never reported externally
 // in the aggregate CC-BY-NC-SA research CI artifact.
 return {notes,stats:{parts:parts.length,measures:measuresTotal,
   rawNotes:raw.length,playableNotes:notes.length,
   mergedTieSegments:raw.length-notes.length,
   tempoDirections,repeatExpansion:'not-required-detected'}};
}

function secondsAt(midi){
 const ts=midi.tempoMap;
 const prefix=[],div=midi.division;
 let elapsed=0,last=0,micros=500000;
 for(const t of ts){
  elapsed+=(t.tick-last)*micros/(div*1e6);
  prefix.push({tick:t.tick,seconds:elapsed,micros:t.micros});
  last=t.tick;micros=t.micros;
 }
 return tick=>{
  let lo=0,hi=prefix.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);
   if(prefix[mid].tick<=tick)lo=mid;else hi=mid-1;
  }
  const t=prefix[lo];
  return t.seconds+(tick-t.tick)*t.micros/(div*1e6);
 };
}

/**
 * Score-derived note beats are projected onto the REFERENCE MIDI tempo map,
 * so temporal alignment is *conditional* on the MIDI clock. Score tempo
 * markings are NOT independently verified by this function.
 */
export function compareRawMusicXmlToScoreMidi(xml,midiBytes){
 let score,midi,toSeconds;
 try{
  score=normalizeMusicXmlBeats(xml);
  midi=inspectFingeredMidi(midiBytes);
  toSeconds=secondsAt(midi);
 }catch(e){return rejected(String(e?.message||e))}
 const source=score.notes.map(n=>({...n,
  start:toSeconds(n.start*midi.division),
  duration:toSeconds((n.start+n.duration)*midi.division)-
   toSeconds(n.start*midi.division)}));
 const result=alignNormalizedScoreToMidi(source,midiBytes);
 if(result.status!=='aligned')
  return {...rejected(result.reason),
   summary:{...score.stats,sourceNoteCount:source.length,midiNotes:midi.notes.length}};
 return {status:'aligned',reason:null,
  summary:{...score.stats,sourceNoteCount:source.length,midiNotes:midi.notes.length,
   matched:result.summary.matched,
   maxStartErrorSeconds:result.summary.maxStartErrorSeconds,
   maxEndErrorSeconds:result.summary.maxEndErrorSeconds},
  // No raw note labels in the aggregate audit; this API is pure/local.
  links:result.links,
  scoreXmlSemanticValidation:false,
  sourceRepeatExpansionValidated:false,
  sourceTieConsolidationValidated:true,
  midiTempoUsedForScoreClock:true,scoreTempoIndependentlyValidated:false,
  productionAutoFingeringAllowed:false};
}
