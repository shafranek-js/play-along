/**
 * FG-04B3a — conservative, research-only one-to-one association between
 * source-normalized *playback note events* and original score MIDI events.
 *
 * An imported MusicXML score must supply its OWN canonical note IDs and
 * note timings (seconds), independently of this MIDI. This module does not
 * parse XML, unfold repeats, combine ties or infer staff/hand from MIDI.
 *
 * A successful match is only event-level evidence, NOT independent proof of
 * MusicXML parsing fidelity, authorship, fingering quality or technique.
 */
import {inspectFingeredMidi} from './handthesia-midi-alignment.mjs';

const EPS=0.002; // absolute max. No caller-adjustable fuzzy threshold.
const fail=reason=>({status:'rejected',reason,summary:null,links:[],
  scoreXmlSemanticValidation:false,sourceRepeatExpansionValidated:false,
  sourceTieConsolidationValidated:false,productionAutoFingeringAllowed:false});

function tempoToSeconds(midi){
 const timeline=[];
 let previousTick=0,seconds=0,micros=500000;
 for(const e of midi.tempoMap){
  if(!Number.isSafeInteger(e.tick)||e.tick<previousTick||
     !Number.isInteger(e.micros)||e.micros<=0)throw Error('INVALID_MIDI_TEMPO_MAP');
  seconds+=(e.tick-previousTick)*micros/(midi.division*1e6);
  timeline.push({tick:e.tick,seconds,micros:e.micros});
  previousTick=e.tick;micros=e.micros;
 }
 if(!timeline.length||timeline[0].tick!==0)throw Error('MIDI_TEMPO_ZERO_MISSING');
 return tick=>{
  let lo=0,hi=timeline.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);
   if(timeline[mid].tick<=tick)lo=mid;else hi=mid-1;
  }
  const e=timeline[lo];
  return e.seconds+(tick-e.tick)*e.micros/(midi.division*1e6);
 };
}

function canonicalSource(source){
 if(!Array.isArray(source)||!source.length||source.length>25000)
  throw Error('SOURCE_NOTE_MANIFEST_REQUIRED');
 const notes=[],identities=new Set(),segments=new Set();
 for(const n of source){
  if(!n||typeof n.noteId!=='string'||!/^xml:.{1,260}$/.test(n.noteId)||
     identities.has(n.noteId)||typeof n.partId!=='string'||
     !n.partId.length||n.partId.length>256||
     !Number.isInteger(n.staff)||n.staff<1||n.staff>64||
     !(typeof n.voice==='string'&&n.voice.length>0&&n.voice.length<=64)||
     !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
     !Number.isFinite(n.start)||n.start<0||n.start>86400||
     !Number.isFinite(n.duration)||n.duration<=0||
     n.start+n.duration>86400)
    throw Error('INVALID_OR_DUPLICATE_SOURCE_NOTE_IDENTITY');
  identities.add(n.noteId);
  const refs=n.sourceNoteIds===undefined?[]:n.sourceNoteIds;
  if(!Array.isArray(refs)||refs.length>128||
     refs.some(id=>typeof id!=='string'||!/^xml:.{1,260}$/.test(id)))
    throw Error('INVALID_SOURCE_TIE_SEGMENTS');
  for(const id of new Set([n.noteId,...refs])){
   if(segments.has(id))throw Error('DUPLICATE_SOURCE_SEGMENT_ID');
   segments.add(id);
  }
  if(new Set(refs).size!==refs.length)throw Error('DUPLICATE_SOURCE_TIE_SEGMENT');
  notes.push(n);
 }
 return notes;
}

/**
 * sourceEvents: canonical imported score track notes, with
 * noteId, partId, staff, voice, pitch, start, duration and optional
 * sourceNoteIds (merged tie component identities).
 *
 * Matching compares MIDI note-on AND key release. Velocity, channel and
 * track cannot provide a score-note ID. Two plausible source/MIDI pairings
 * mean REJECTION even when a greedy ordering could appear to succeed.
 *
 * These score events MUST NOT have been reconstructed from the same MIDI:
 * such a comparison would be circular and cannot prove score fidelity.
 */
export function alignNormalizedScoreToMidi(sourceEvents,midiBytes){
 let midi,notes,at;
 try{
  notes=canonicalSource(sourceEvents);
  midi=inspectFingeredMidi(midiBytes);
  at=tempoToSeconds(midi);
 }catch(e){return fail(String(e?.message||e))}
 if(notes.length!==midi.notes.length)
  return fail('SCORE_MIDI_NOTE_COUNT_MISMATCH');
 const index=new Map(),events=[];
 for(const [i,n] of midi.notes.entries()){
  const start=at(n.startTick),end=at(n.endTick);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)
   return fail('INVALID_MIDI_EVENT_TIMING');
  const event={i,n,start,end};
  events.push(event);
  const key=n.pitch+':'+Math.round(start*1000);
  const bucket=index.get(key)||[];bucket.push(event);index.set(key,bucket);
 }
 const claimed=new Set(),links=[];
 let maxStartError=0,maxEndError=0;
 for(const s of notes){
  const expectedEnd=s.start+s.duration,rounded=Math.round(s.start*1000);
  const candidates=[];
  for(let ms=rounded-3;ms<=rounded+3;ms++){
   for(const event of index.get(s.pitch+':'+ms)||[]){
    if(Math.abs(event.start-s.start)<=EPS+1e-12&&
       Math.abs(event.end-expectedEnd)<=EPS+1e-12)
     candidates.push(event);
   }
  }
  // Do NOT remove previously claimed events before checking ambiguity.
  if(candidates.length===0)return fail('SCORE_EVENT_UNMATCHED');
  if(candidates.length>1)return fail('AMBIGUOUS_MIDI_EVENT_CANDIDATES');
  const event=candidates[0];
  if(claimed.has(event.i))return fail('MIDI_EVENT_MATCHED_TO_MULTIPLE_SCORE_NOTES');
  claimed.add(event.i);
  const startError=Math.abs(event.start-s.start),endError=Math.abs(event.end-expectedEnd);
  maxStartError=Math.max(maxStartError,startError);
  maxEndError=Math.max(maxEndError,endError);
  links.push({noteId:s.noteId,sourceNoteIds:[...(s.sourceNoteIds||[])],
   partId:s.partId,staff:s.staff,voice:s.voice,pitch:s.pitch,
   midiIndex:event.i,midiStartTick:event.n.startTick,
   midiEndTick:event.n.endTick,midiTrack:event.n.track,
   midiChannel:event.n.channel,startErrorSeconds:startError,
   endErrorSeconds:endError});
 }
 if(claimed.size!==events.length)return fail('UNMATCHED_MIDI_EVENTS');
 return {status:'aligned',reason:null,
  summary:{sourceNotes:notes.length,midiNotes:events.length,matched:links.length,
   toleranceSeconds:EPS,maxStartErrorSeconds:maxStartError,
   maxEndErrorSeconds:maxEndError,ambiguousCandidates:0,unmatched:0},
  links,
  // This step audits provided normalized input, not independently parsed XML.
  scoreXmlSemanticValidation:false,sourceRepeatExpansionValidated:false,
  sourceTieConsolidationValidated:false,productionAutoFingeringAllowed:false};
}
