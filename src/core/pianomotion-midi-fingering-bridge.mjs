/**
 * FG-04C7 — strictly score-free original MIDI/PianoMotion output join.
 * This accepts REAL, separately executed PianoMotion analyze_midi envelopes.
 * Never fabricates a MIDI hand assignment; no Python/WASM runtime here.
 */
import {createHash} from 'node:crypto';
import {inspectFingeredMidi} from './handthesia-midi-alignment.mjs';

const fail=reason=>({ok:false,reason,notes:[],researchOnly:true,productionEligible:false});
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.002;
const hand=x=>x==='left'?'LH':x==='right'?'RH':null;
const integers=(x,keys)=>x&&keys.every(k=>Number.isInteger(x[k])&&x[k]>=0);
function timeOf(tick,m){
 let prev=0,seconds=0,micros=500000;
 for(const t of m.tempoMap){
  if(t.tick>tick)break;
  seconds+=(t.tick-prev)*micros/(m.division*1000000);
  prev=t.tick;micros=t.micros;
 }
 return seconds+(tick-prev)*micros/(m.division*1000000);
}
function sign(n){return [n.track,n.channel,n.pitch,
 n.startTick,n.endTick].join(':')}
export function importPianoMotionMidiFingeringResearch({midiBytes,analysis}={}){
 const bytes=midiBytes instanceof Uint8Array?midiBytes:
  midiBytes instanceof ArrayBuffer?new Uint8Array(midiBytes):null;
 if(!bytes||bytes.length<22||bytes.length>4000000)return fail('ORIGINAL_MIDI_REQUIRED');
 const raw=analysis?.rawBaseline,doc=analysis?.document,plan=analysis?.fingeringPlan;
 if(!raw||raw.status!=='loaded'||!doc||doc.schemaVersion!==1||
   !Array.isArray(doc.notes)||!plan||plan.kind!=='fingering'||
   plan.schemaVersion!==1||!Array.isArray(plan.assignments)||
   plan.inputRevision!==doc.revision||plan.projectId!==doc.projectId)
  return fail('PIANOMOTION_RESULT_UNAVAILABLE_OR_REPAIRED');
 const sha=createHash('sha256').update(bytes).digest('hex');
 if(raw.inputSha256!==sha)return fail('ORIGINAL_MIDI_SHA_MISMATCH');
 if(!Array.isArray(raw.sourceNotes)||!Array.isArray(raw.identityMappings)||
    (raw.identityLosses?.length??0)!==0||
    (raw.unmappedSourceNoteIds?.length??0)!==0||
    raw.sourceNotes.length!==raw.identityMappings.length||
    raw.sourceNotes.length!==doc.notes.length||
    doc.notes.length!==plan.assignments.length)
  return fail('PIANOMOTION_IDENTITY_LOSS');
 let midi;try{midi=inspectFingeredMidi(bytes)}
 catch(e){return fail('MIDI_PARSE_'+e.message)}
 if(midi.notes.length!==doc.notes.length)return fail('MIDI_NOTE_COUNT_MISMATCH');
 const rawById=new Map(), mapping=new Map(),assignments=new Map();
 for(const n of raw.sourceNotes){
  if(!n||typeof n.noteId!=='string'||rawById.has(n.noteId)||
     !integers(n.sourceEvent,['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal'])||
     n.sourceEvent.noteOffOrdinal<=n.sourceEvent.noteOnOrdinal)
   return fail('INVALID_RAW_SOURCE_EVENTS');
  rawById.set(n.noteId,n);
 }
 for(const n of raw.identityMappings){
  if(!n||n.status!=='exact'||mapping.has(n.normalizedNoteId)||
    !rawById.has(n.noteId)||!Array.isArray(n.rawEvents)||n.rawEvents.length!==1)
   return fail('NONEXACT_PIANOMOTION_MAPPING');
  const a=rawById.get(n.noteId).sourceEvent,b=n.rawEvents[0];
  if(!['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal'].every(k=>a[k]===b[k]))
   return fail('RAW_EVENT_PROVENANCE_MISMATCH');
  mapping.set(n.normalizedNoteId,n);
 }
 for(const a of plan.assignments){
  if(!a||typeof a.noteId!=='string'||assignments.has(a.noteId)||
    !hand(a.hand)||!['played','unplayable','glissando'].includes(a.disposition)||
    (a.disposition==='played'?!Number.isInteger(a.finger)||a.finger<1||a.finger>5:a.finger!==null))
   return fail('INVALID_PIANOMOTION_FINGER');
  assignments.set(a.noteId,a);
 }
 const midiBySignature=new Map();
 for(const [index,n] of midi.notes.entries()){
  const signature=sign(n);
  if(midiBySignature.has(signature))return fail('AMBIGUOUS_ORIGINAL_MIDI_NOTES');
  midiBySignature.set(signature,{index,n});
 }
 const used=new Set(),notes=[];
 for(const note of doc.notes){
  const m=mapping.get(note?.noteId),a=assignments.get(note?.noteId);
  if(!m||!a||a.hand!==note.hand||
    !Array.isArray(note.sourceNoteIds)||note.sourceNoteIds.length!==1||
    note.sourceNoteIds[0]!==m.noteId||
    !integers(note.sourceEvent,['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal'])||
    !['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal'].every(k=>note.sourceEvent[k]===m.rawEvents[0][k])||
    !Number.isInteger(note.pitch)||!hand(note.hand)||
    !Number.isFinite(note.startSeconds)||!Number.isFinite(note.endSeconds)||
    note.endSeconds<=note.startSeconds)return fail('UNVERIFIED_PIANOMOTION_DOCUMENT');
  const source=rawById.get(m.noteId);
  if(!source||source.pitch!==note.pitch||
    !near(source.start,note.startSeconds)||!near(source.end,note.endSeconds))
   return fail('PIANOMOTION_CHANGED_NOTE_EVENT');
  const candidates=midi.notes.map((n,index)=>({n,index})).filter(({n})=>
    n.track===note.sourceEvent.midiTrackIndex&&n.channel===note.sourceEvent.channel&&
    n.pitch===note.pitch&&near(timeOf(n.startTick,midi),note.startSeconds)&&
    near(timeOf(n.endTick,midi),note.endSeconds));
  if(candidates.length!==1)return fail('AMBIGUOUS_OR_UNMATCHED_MIDI_EVENT');
  const found=candidates[0];
  if(used.has(found.index))return fail('DUPLICATE_MIDI_EVENT');
  used.add(found.index);
  notes.push({midiIndex:found.index,track:found.n.track,channel:found.n.channel,
    pitch:found.n.pitch,start:timeOf(found.n.startTick,midi),
    duration:timeOf(found.n.endTick,midi)-timeOf(found.n.startTick,midi),
    hand:hand(a.hand),finger:a.disposition==='played'?a.finger:null});
 }
 if(used.size!==midi.notes.length)return fail('UNMATCHED_MIDI_NOTES');
 return {ok:true,method:'fg04c7-original-midi-source-locked-import',
  midiSha256:sha,notes:notes.sort((a,b)=>a.midiIndex-b.midiIndex),
  researchOnly:true,productionEligible:false,expertValidated:false,
  midiNoteCount:notes.length};
}
