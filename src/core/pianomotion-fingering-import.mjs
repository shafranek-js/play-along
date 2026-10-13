/**
 * FG-04C2b: independently written research importer of ACTUAL PianoMotion output.
 * Requires identical MIDI bytes and SHA-256, a proven score-MIDI alignment,
 * and independently exact PianoMotion source-event provenance.
 * Never maps by pitch alone, track-name or inferred hands.
 */
import {createHash} from 'node:crypto';
import {alignNormalizedScoreToMidi} from './score-midi-event-alignment.mjs';

const TOL=.002000001,MAX_NOTES=2500;
const bad=reason=>({ok:false,reason,items:[],researchOnly:true,productionEligible:false,sourceIdentityVerified:false});
const int=Number.isInteger;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const exactEvent=(a,b)=>a&&b&&['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal']
 .every(k=>int(a[k])&&a[k]===b[k]);
const validEvent=e=>e&&int(e.midiTrackIndex)&&e.midiTrackIndex>=0&&
 int(e.channel)&&e.channel>=0&&e.channel<=15&&
 int(e.noteOnOrdinal)&&e.noteOnOrdinal>=0&&
 int(e.noteOffOrdinal)&&e.noteOffOrdinal>e.noteOnOrdinal;
const hand=h=>h==='left'?'LH':h==='right'?'RH':null;
const close=(a,b)=>finite(a)&&Math.abs(a-b)<=TOL;

/**
 * source: original Play Along canonical MusicXML notes, with part/staff/voice,
 * midiBytes: SAME original MIDI passed to PianoMotion analyze_midi,
 * analysis: PianoMotion {rawBaseline,document,fingeringPlan}.
 *
 * Output is source-identical candidate note rows with no copied structural
 * verification fields; comparator reports context it cannot prove.
 */
export function importPianoMotionAnalysisResearch({source,midiBytes,analysis}={}){
 if(!Array.isArray(source)||!source.length||source.length>MAX_NOTES)return bad('INVALID_SCORE');
 const b=midiBytes instanceof Uint8Array?midiBytes:
  midiBytes instanceof ArrayBuffer?new Uint8Array(midiBytes):null;
 if(!b||b.byteLength<22||b.byteLength>4000000)return bad('INVALID_ORIGIN_MIDI');
 const raw=analysis?.rawBaseline,doc=analysis?.document,plan=analysis?.fingeringPlan;
 if(!raw||raw.status!=='loaded'||!doc||!plan||
  !Array.isArray(doc.notes)||doc.notes.length!==source.length||
  !Array.isArray(plan.assignments)||plan.assignments.length!==doc.notes.length||
  plan.kind!=='fingering'||doc.schemaVersion!==1||plan.schemaVersion!==1||
  doc.projectId!==plan.projectId||doc.revision!==plan.inputRevision)
  return bad('PIANOMOTION_RESULT_INCOMPLETE_OR_REPAIRED');
 const sha=createHash('sha256').update(b).digest('hex');
 if(raw.inputSha256!==sha)return bad('MIDI_HASH_MISMATCH');
 if((raw.identityLosses?.length??0)>0||
  (raw.unmappedSourceNoteIds?.length??0)>0||
  !Array.isArray(raw.identityMappings)||
  !Array.isArray(raw.sourceNotes)||
  raw.identityMappings.length!==raw.sourceNotes.length||
  raw.identityMappings.length!==doc.notes.length)
  return bad('PIANOMOTION_SOURCE_IDENTITY_LOSS');
 const alignment=alignNormalizedScoreToMidi(source,b);
 if(alignment.status!=='aligned'||alignment.links.length!==source.length)
  return bad('SCORE_MIDI_'+alignment.reason);
 const byNormalized=new Map();
 const observedById=new Map(raw.sourceNotes.map(n=>[n.noteId,n]));
 if(observedById.size!==raw.sourceNotes.length)return bad('PIANOMOTION_SOURCE_IDENTITY_LOSS');
 for(const item of raw.identityMappings){
  if(!item||item.status!=='exact'||typeof item.normalizedNoteId!=='string'||
    typeof item.noteId!=='string'||!Array.isArray(item.rawEvents)||
    item.rawEvents.length!==1||!validEvent(item.rawEvents[0])||
    byNormalized.has(item.normalizedNoteId))
   return bad('PIANOMOTION_SOURCE_IDENTITY_LOSS');
  const observed=observedById.get(item.noteId);
  if(!observed||!exactEvent(observed.sourceEvent,item.rawEvents[0]))
   return bad('PIANOMOTION_SOURCE_EVENT_UNVERIFIED');
  byNormalized.set(item.normalizedNoteId,item.rawEvents[0]);
 }
 const assignments=new Map();
 for(const item of plan.assignments){
  if(!item||typeof item.noteId!=='string'||assignments.has(item.noteId)||
   !hand(item.hand)||!['played','glissando','unplayable'].includes(item.disposition)||
   !(item.finger===null||int(item.finger)&&item.finger>=1&&item.finger<=5)||
   (item.disposition==='played')!==(item.finger!==null))
   return bad('PIANOMOTION_ASSIGNMENT_INVALID');
  assignments.set(item.noteId,item);
 }
 const docs=[];
 for(const item of doc.notes){
  if(!item||typeof item.noteId!=='string'||!validEvent(item.sourceEvent)||
   !exactEvent(item.sourceEvent,byNormalized.get(item.noteId))||
   !assignments.has(item.noteId)||!hand(item.hand)||
   assignments.get(item.noteId).hand!==item.hand||
   !Array.isArray(item.sourceNoteIds)||item.sourceNoteIds.length!==1||
   !observedById.has(item.sourceNoteIds[0])||
   !finite(item.startSeconds)||!finite(item.endSeconds)||
   item.endSeconds<=item.startSeconds||!int(item.pitch))
   return bad('PIANOMOTION_DOCUMENT_UNVERIFIED');
  const original=observedById.get(item.sourceNoteIds[0]);
  if(item.pitch!==original.pitch||!close(item.startSeconds,original.start)||
   !close(item.endSeconds,original.end))
   return bad('PIANOMOTION_NOTE_TIMING_CHANGED');
  docs.push(item);
 }
 const used=new Set(),items=[];
 const srcById=new Map(source.map(n=>[n.noteId,n]));
 for(const link of alignment.links){
  const note=srcById.get(link.noteId);
  const candidates=docs.filter(n=>n.sourceEvent.midiTrackIndex===link.midiTrack&&
   n.sourceEvent.channel===link.midiChannel&&n.pitch===link.pitch&&
   close(n.startSeconds,note.start)&&
   close(n.endSeconds,note.start+note.duration));
  // Matching remains conservative: both endpoints proved exact raw provenance
  // on identical hash-locked MIDI and this physical signature is unique.
  if(candidates.length!==1)return bad(candidates.length?'AMBIGUOUS_RAW_EVENT_JOIN':'RAW_EVENT_JOIN_MISSING');
  const found=candidates[0];
  if(used.has(found.noteId))return bad('DUPLICATE_RAW_EVENT_JOIN');
  used.add(found.noteId);
  const a=assignments.get(found.noteId);
  items.push({noteId:link.noteId,pitch:found.pitch,hand:hand(a.hand),
   start:note.start,duration:note.duration,
   finger:a.disposition==='played'?a.finger:null});
 }
 if(items.length!==source.length||used.size!==doc.notes.length)
  return bad('UNMAPPED_PIANOMOTION_NOTES');
 return {ok:true,method:'fg04c2-pianomotion-exact-source-event-bridge',
  items,sourceIdentityVerified:true,rawMidiSha256:sha,
  researchOnly:true,productionEligible:false,noteCount:items.length,
  scoreXmlSemanticValidation:false,pianistAccuracyValidated:false};
}
