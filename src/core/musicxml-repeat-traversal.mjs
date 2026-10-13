/**
 * FG-04B3e — bounded, read-only MusicXML repeat traversal research.
 * This does not parse notes, change a score, infer grace timing or control playback.
 *
 * Input contracts:
 * parseMusicXmlRepeatControls(xml) => measureNumbers + boundary events (no timing).
 * planMusicXmlRepeatTraversal({...controls, durations}) => performed measure visits.
 * expandMusicXmlRepeatNotes(plan, writtenNotes) => source-safe playback events.
 * matchRepeatExpansionToMidi(expansion, sourceMidiBytes) => strict optional check.
 */
import {inspectFingeredMidi} from './handthesia-midi-alignment.mjs';
import {alignNormalizedScoreToMidi} from './score-midi-event-alignment.mjs';

const MAX_XML=4_000_000, MAX_MEASURES=5000, MAX_VISITS=12000;
const MAX_NOTES=25000, EPS=1e-8;
const fail=code=>{throw Error(code)};
const reject=reason=>({status:'rejected',reason,sourceRepeatExpansionValidated:false,
 productionAutoFingeringAllowed:false});
const attrs=tag=>{
 const map={};
 for(const m of tag.matchAll(/([A-Za-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
  if(Object.hasOwn(map,m[1]))fail('REPEAT_DUPLICATE_XML_ATTRIBUTE');
  map[m[1]]=m[2]??m[3];
 }
 return map;
};
const onlyNumber=(number)=>number==='1'||number==='2';
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * Barline positions are boundaries: left of measure i = i; right = i+1.
 * Every part must independently specify the SAME repeat controls. MusicXML
 * tempo, notes and rests are deliberately outside this parser's authority.
 */
export function parseMusicXmlRepeatControls(xml){
 if(typeof xml!=='string'||!xml.length||xml.length>MAX_XML)
  fail('REPEAT_XML_SIZE_INVALID');
 if(/<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[/i.test(xml))
  fail('REPEAT_XML_DTD_OR_ENTITY_UNSUPPORTED');
 if(!/<score-partwise\b/.test(xml)||/<score-timewise\b/.test(xml))
  fail('REPEAT_PARTWISE_REQUIRED');
 const clean=xml.replace(/<!--[\s\S]*?-->/g,'');
 if(/<!--|-->/.test(clean))fail('REPEAT_MALFORMED_XML_COMMENT');
 if(/<\s*(?:segno|coda|dalsegno|dacapo|fine|to-coda)\b|<sound\b[^>]*\b(?:dacapo|dalsegno|tocoda|fine|segno|coda)\s*=|\bD\s*\.\s*[CS]\s*\./i.test(clean))
  fail('REPEAT_SCORE_NAVIGATION_UNSUPPORTED');
 const parts=[...clean.matchAll(/<part\s+([^<>]*)>([\s\S]*?)<\/part\s*>/g)];
 if(!parts.length||parts.length>32)fail('REPEAT_PARTS_UNSUPPORTED');
 const partIds=[],partsParsed=[];
 for(const part of parts){
  const id=attrs(part[1]).id;
  if(!id||id.length>256||partIds.includes(id))fail('REPEAT_INVALID_PART_ID');
  partIds.push(id);
  const measures=[...part[2].matchAll(/<measure\s+([^<>]*)>([\s\S]*?)<\/measure\s*>/g)];
  if(!measures.length||measures.length>MAX_MEASURES)
   fail('REPEAT_MEASURES_UNSUPPORTED');
  const numbers=[],events=[];
  for(const [i,measure] of measures.entries()){
   const no=attrs(measure[1]).number;
   if(typeof no!=='string'||!no.length||no.length>80)
    fail('REPEAT_MEASURE_NUMBER_INVALID');
   numbers.push(no);
   let recognized=0;
   for(const bar of measure[2].matchAll(/<barline\b([^<>]*)>([\s\S]*?)<\/barline\s*>/g)){
    const location=attrs(bar[1]).location??'right';
    if(location!=='left'&&location!=='right')
     fail('REPEAT_BARLINE_LOCATION_UNSUPPORTED');
    const boundary=i+(location==='right'?1:0);
    for(const marker of bar[2].matchAll(/<repeat\b([^<>]*?)\/?>/g)){
     recognized++;
     const a=attrs(marker[1]);
     if(a.direction==='forward'){
      if(location!=='left'||a.times!==undefined)
       fail('REPEAT_FORWARD_POSITION_UNSUPPORTED');
      events.push({boundary,kind:'forward'});
     }else if(a.direction==='backward'){
      if(location!=='right')fail('REPEAT_BACKWARD_POSITION_UNSUPPORTED');
      const times=a.times===undefined?2:Number(a.times);
      if(!/^(?:2)$/.test(a.times??'2')||times!==2)
       fail('REPEAT_COUNT_UNSUPPORTED');
      events.push({boundary,kind:'backward',times});
     }else fail('REPEAT_DIRECTION_UNSUPPORTED');
    }
    for(const marker of bar[2].matchAll(/<ending\b([^<>]*?)\/?>/g)){
     recognized++;
     const a=attrs(marker[1]);
     if(!onlyNumber(a.number))fail('REPEAT_ENDING_NUMBER_UNSUPPORTED');
     if(a.type==='start')events.push({boundary,kind:'endingStart',number:a.number});
     else if(a.type==='stop'||a.type==='discontinue')
      events.push({boundary,kind:'endingStop',number:a.number,type:a.type});
     else fail('REPEAT_ENDING_TYPE_UNSUPPORTED');
    }
   }
   // No navigation silently accepted outside supported barline markup.
   if(([...measure[2].matchAll(/<repeat\b/g)].length+
       [...measure[2].matchAll(/<ending\b/g)].length)!==recognized)
    fail('REPEAT_MARKER_OUTSIDE_BARLINE');
  }
  events.sort((a,b)=>a.boundary-b.boundary||
   (a.kind==='endingStop'?-1:a.kind==='endingStart'?1:0)-
   (b.kind==='endingStop'?-1:b.kind==='endingStart'?1:0)||
   a.kind.localeCompare(b.kind)||String(a.number??'').localeCompare(String(b.number??'')));
  partsParsed.push({numbers,events});
 }
 if(partsParsed.some(p=>!identical(p,partsParsed[0])))
  fail('REPEAT_PARTS_NOT_SYNCHRONIZED');
 return {measureNumbers:[...partsParsed[0].numbers],partIds,
  events:partsParsed[0].events.map(e=>({...e})),
  sourceControlFormat:'musicxml-barline-boundaries-v1'};
}

/**
 * The supported subset deliberately excludes nested/overlapping blocks,
 * non-2 repeats, incomplete/contradictory 1st/2nd endings and score jumps.
 * A paired ending is a 1st-ending span ending at the backward repeat,
 * followed immediately by an explicit 2nd-ending span.
 */
export function planMusicXmlRepeatTraversal(control,{maxVisits=MAX_VISITS}={}){
 const numbers=control?.measureNumbers, durations=control?.durations;
 const events=control?.events;
 if(!Array.isArray(numbers)||!numbers.length||numbers.length>MAX_MEASURES||
    !Array.isArray(durations)||durations.length!==numbers.length||
    !Array.isArray(events)||events.length>MAX_MEASURES*4||
    !Number.isSafeInteger(maxVisits)||maxVisits<1||maxVisits>MAX_VISITS)
  fail('REPEAT_PLAN_INVALID_INPUT');
 const N=numbers.length;
 for(let i=0;i<N;i++){
  if(typeof numbers[i]!=='string'||!numbers[i].length||
   !Number.isFinite(durations[i])||durations[i]<=0||durations[i]>1024)
   fail('REPEAT_INVALID_MEASURE_DURATION');
 }
 const starts=new Set(),backs=new Map(),ranges=[],active=new Map();
 for(const event of events){
  const b=event?.boundary;
  if(!Number.isInteger(b)||b<0||b>N)fail('REPEAT_BOUNDARY_INVALID');
  if(event.kind==='forward'){
   if(b>=N||starts.has(b))fail('REPEAT_DUPLICATE_FORWARD');
   starts.add(b);
  }else if(event.kind==='backward'){
   if(b===0||backs.has(b)||event.times!==2)
    fail('REPEAT_BACKWARD_INVALID_OR_COUNT');
   backs.set(b,event);
  }else if(event.kind==='endingStart'){
   if(!onlyNumber(event.number)||active.size||active.has(event.number))
    fail('REPEAT_ENDING_OVERLAP_OR_NUMBER');
   active.set(event.number,b);
  }else if(event.kind==='endingStop'){
   const from=active.get(event.number);
   if(from===undefined||from>=b||
      !['stop','discontinue'].includes(event.type))
    fail('REPEAT_ENDING_UNPAIRED');
   ranges.push({number:event.number,start:from,end:b,type:event.type});
   active.delete(event.number);
  }else fail('REPEAT_UNKNOWN_CONTROL');
 }
 if(active.size)fail('REPEAT_ENDING_UNCLOSED');
 const groups=[];let opened=null,implicit=false;
 for(let b=0;b<=N;b++){
  // At a shared barline, close the previous repeat BEFORE opening the next.
  if(backs.has(b)){
   let from=opened;
   if(from===null){
    if(groups.length||implicit)fail('REPEAT_IMPLICIT_START_AMBIGUOUS');
    from=0;implicit=true;
   }
   if(from>=b)fail('REPEAT_EMPTY_OR_INVALID_RANGE');
   groups.push({id:groups.length+1,start:from,end:b,implicit:opened===null});
   opened=null;
  }
  if(starts.has(b)){
   if(opened!==null)fail('REPEAT_NESTED_UNSUPPORTED');
   opened=b;
  }
 }
 if(opened!==null)fail('REPEAT_FORWARD_WITHOUT_BACKWARD');
 for(let i=1;i<groups.length;i++)
  if(groups[i].start<groups[i-1].end)
   fail('REPEAT_OVERLAPPING_GROUPS');
 const claimedRanges=new Set();
 for(const g of groups){
  const first=ranges.filter(r=>r.number==='1'&&r.start>=g.start&&r.end===g.end);
  const second=ranges.filter(r=>r.number==='2'&&r.start===g.end);
  if(first.length>1||second.length>1)
   fail('REPEAT_ENDING_DUPLICATE');
  if(first.length!==second.length)
   fail('REPEAT_ENDING_PAIR_REQUIRED');
  if(first.length){
   const a=first[0],z=second[0];
   if(a.start<=g.start||z.end<=z.start||z.end>N||
      groups.some(other=>other!==g&&other.start<z.end&&other.end>g.end))
    fail('REPEAT_ENDING_SPANS_AMBIGUOUS');
   g.firstEnding={start:a.start,end:a.end};
   g.secondEnding={start:z.start,end:z.end};
   claimedRanges.add(a);claimedRanges.add(z);
  }
 }
 if(ranges.some(r=>!claimedRanges.has(r)))
  fail('REPEAT_ENDING_OUTSIDE_GROUP');
 const visits=[];let beat=0;
 const append=(i,iteration,groupId)=>{
  if(visits.length>=maxVisits)fail('REPEAT_VISIT_LIMIT');
  const d=durations[i];
  if(beat+d>86400)fail('REPEAT_BEAT_LIMIT');
  visits.push({measureIndex:i,measureNumber:numbers[i],iteration,
   repeatGroupId:groupId,startBeat:beat,durationBeats:d});
  beat+=d;
 };
 let cursor=0;
 for(const g of groups){
  if(g.start<cursor)fail('REPEAT_GROUP_OR_ENDING_OVERLAP');
  for(let i=cursor;i<g.start;i++)append(i,1,null);
  for(let i=g.start;i<g.end;i++)append(i,1,g.id);
  const pass2End=g.firstEnding?.start??g.end;
  for(let i=g.start;i<pass2End;i++)append(i,2,g.id);
  if(g.secondEnding){
   for(let i=g.secondEnding.start;i<g.secondEnding.end;i++)
    append(i,2,g.id);
  }
  cursor=g.secondEnding?.end??g.end;
 }
 for(let i=cursor;i<N;i++)append(i,1,null);
 return {status:'planned',visits,groups,performedBeats:beat,
  writtenMeasures:N,sourceRepeatExpansionValidated:true,
  scoreMidiAlignmentValidated:false,productionAutoFingeringAllowed:false};
}

/**
 * Caller provides independent written note events, measured relative to
 * each measure. No repeat-aware source IDs are forged: sourceNoteId and
 * sourceNoteIds/tie flags remain verbatim, with a separate playbackId.
 */
export function expandMusicXmlRepeatNotes(plan,writtenNotes){
 if(plan?.status!=='planned'||!Array.isArray(plan.visits)||
    !Array.isArray(writtenNotes)||writtenNotes.length>MAX_NOTES)
  fail('REPEAT_EXPANSION_INVALID_INPUT');
 const byMeasure=new Map(),sourceIds=new Set();
 for(const n of writtenNotes){
  if(!n||typeof n.sourceNoteId!=='string'||!/^xml:.{1,180}$/.test(n.sourceNoteId)||
     sourceIds.has(n.sourceNoteId)||
     !Number.isInteger(n.measureIndex)||n.measureIndex<0||
     typeof n.partId!=='string'||!n.partId||
     typeof n.voice!=='string'||!n.voice||
     !Number.isInteger(n.staff)||n.staff<1||n.staff>64||
     !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
     !Number.isFinite(n.startBeat)||n.startBeat<0||
     !Number.isFinite(n.durationBeats)||n.durationBeats<=0)
    fail('REPEAT_WRITTEN_NOTE_INVALID_OR_DUPLICATE');
  sourceIds.add(n.sourceNoteId);
  const list=byMeasure.get(n.measureIndex)||[];
  list.push(n);byMeasure.set(n.measureIndex,list);
 }
 const expanded=[],playbackIds=new Set();
 for(const visit of plan.visits){
  for(const n of byMeasure.get(visit.measureIndex)||[]){
   if(n.startBeat+n.durationBeats>visit.durationBeats+EPS)
    fail('REPEAT_NOTE_OVERRUNS_MEASURE');
   if(expanded.length>=MAX_NOTES)fail('REPEAT_EXPANDED_NOTE_LIMIT');
   const playbackId=n.sourceNoteId+'@repeat:'+String(visit.repeatGroupId??'single')+
    ':'+visit.iteration;
   if(playbackIds.has(playbackId))fail('REPEAT_PLAYBACK_ID_COLLISION');
   playbackIds.add(playbackId);
   expanded.push({...n,playbackId,iteration:visit.iteration,
    repeatGroupId:visit.repeatGroupId,
    startBeat:visit.startBeat+n.startBeat,endBeat:visit.startBeat+
      n.startBeat+n.durationBeats});
  }
 }
 if([...byMeasure.keys()].some(i=>i>=plan.writtenMeasures))
  fail('REPEAT_NOTE_MEASURE_OUT_OF_RANGE');
 expanded.sort((a,b)=>a.startBeat-b.startBeat||a.pitch-b.pitch||
  a.playbackId.localeCompare(b.playbackId));
 return {status:'expanded',visits:plan.visits,notes:expanded,
  sourceRepeatExpansionValidated:true,scoreMidiAlignmentValidated:false,
  originalNoteIdsUnchanged:true,productionAutoFingeringAllowed:false};
}

function tickToSeconds(midi){
 let micros=500000,prev=0,elapsed=0;
 const timeline=[];
 for(const tempo of midi.tempoMap){
  elapsed+=(tempo.tick-prev)*micros/(midi.division*1e6);
  timeline.push({tick:tempo.tick,elapsed,micros:tempo.micros});
  prev=tempo.tick;micros=tempo.micros;
 }
 return tick=>{
  let lo=0,hi=timeline.length-1;
  while(lo<hi){
   const m=Math.ceil((lo+hi)/2);
   if(timeline[m].tick<=tick)lo=m;else hi=m-1;
  }
  const t=timeline[lo];
  return t.elapsed+(tick-t.tick)*t.micros/(midi.division*1e6);
 };
}

/**
 * Validation is separate from repeat recognition. Existing 2-ms event
 * matcher must accept every onset and release; XML tempo semantics and ties
 * are NOT independently proved by a match against the MIDI tempo map.
 */
export function matchRepeatExpansionToMidi(expansion,midiBytes){
 if(expansion?.status!=='expanded'||!Array.isArray(expansion.notes))
  return reject('REPEAT_ALIGNMENT_INPUT_INVALID');
 if(expansion.notes.some(n=>n.tieStart||n.tieStop||
  (Array.isArray(n.sourceNoteIds)&&n.sourceNoteIds.length>1)))
  return reject('REPEAT_TIE_CONSOLIDATION_UNSUPPORTED');
 let midi,at;
 try{
  midi=inspectFingeredMidi(midiBytes);
  at=tickToSeconds(midi);
 }catch(e){return reject(String(e?.message??e))}
 const source=expansion.notes.map(n=>{
  const start=at(n.startBeat*midi.division),
   end=at(n.endBeat*midi.division);
  return {noteId:n.playbackId,sourceNoteIds:[],partId:n.partId,
   staff:n.staff,voice:n.voice,pitch:n.pitch,start,duration:end-start};
 });
 const report=alignNormalizedScoreToMidi(source,midiBytes);
 if(report.status!=='aligned')return reject(report.reason);
 const provenance=new Map(expansion.notes.map(n=>[n.playbackId,n]));
 return {status:'aligned',reason:null,summary:report.summary,
  links:report.links.map(link=>{
   const n=provenance.get(link.noteId);
   return {...link,playbackId:link.noteId,noteId:n.sourceNoteId,
    measureIndex:n.measureIndex,iteration:n.iteration,
    repeatGroupId:n.repeatGroupId};
  }),sourceRepeatExpansionValidated:true,
  sourceTieConsolidationValidated:false,scoreXmlSemanticValidation:false,
  scoreTempoIndependentlyValidated:false,midiTempoUsedForScoreClock:true,
  productionAutoFingeringAllowed:false};
}
