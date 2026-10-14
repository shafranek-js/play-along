/**
 * FG-04C9 browser-side independent source-identity gate for the ORIGINAL
 * PianoMotion Python output, not the Play Along JS Beam Search.
 * Nothing in this module changes score, track, author fingers, or audio.
 */
import {inspectFingeredMidi} from './handthesia-midi-alignment.mjs';
const fail=reason=>({ok:false,reason,candidates:[],researchOnly:true});
const goodId=id=>typeof id==='string'&&id.length>0&&id.length<512;
const seconds=(m,tick)=>{
 let prior=0,s=0,rate=500000;
 for(const e of m.tempoMap){
  if(e.tick>tick)break;
  s+=(e.tick-prior)*rate/(m.division*1e6);prior=e.tick;rate=e.micros;
 }
 return s+(tick-prior)*rate/(m.division*1e6);
};
const eq=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.00200001;
const identity=e=>e&&['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal']
 .every(k=>Number.isInteger(e[k])&&e[k]>=0);
const identical=(a,b)=>a&&b&&['midiTrackIndex','channel','noteOnOrdinal','noteOffOrdinal'].every(k=>a[k]===b[k]);
const signature=n=>[n.track,n.channel,n.pitch,n.startTick,n.endTick].join(':');
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))]
 .map(n=>n.toString(16).padStart(2,'0')).join('');

export async function verifyPianoMotionBrowserAnalysis({midiBytes,analysis,sourceSong,sourceIndex=null}={}){
 const bytes=midiBytes instanceof Uint8Array?midiBytes:
  midiBytes instanceof ArrayBuffer?new Uint8Array(midiBytes):null;
 if(!bytes||bytes.length<22||bytes.length>4000000)return fail('ORIGINAL_MIDI_REQUIRED');
 const raw=analysis?.rawBaseline,doc=analysis?.document,plan=analysis?.fingeringPlan;
 if(!raw||raw.status!=='loaded'||!doc||!Array.isArray(doc.notes)||
    !plan||!Array.isArray(plan.assignments)||plan.kind!=='fingering'||
    doc.schemaVersion!==1||plan.schemaVersion!==1||
    plan.projectId!==doc.projectId||plan.inputRevision!==doc.revision)
  return fail('INCOMPLETE_PIANOMOTION_ANALYSIS');
 const sha=await hash(bytes);
 if(sha!==raw.inputSha256)return fail('ORIGINAL_MIDI_SHA_MISMATCH');
 if(!Array.isArray(raw.identityMappings)||!Array.isArray(raw.sourceNotes)||
    (raw.identityLosses?.length??0)||(raw.unmappedSourceNoteIds?.length??0)||
    raw.identityMappings.length!==raw.sourceNotes.length||
    doc.notes.length!==raw.sourceNotes.length||doc.notes.length!==plan.assignments.length)
  return fail('PIANOMOTION_IDENTITY_LOSS');
 let midi;
 try{midi=inspectFingeredMidi(bytes)}
 catch(e){return fail('MIDI_PARSE_'+String(e.message))}
 if(midi.notes.length!==doc.notes.length||midi.notes.length>2500)
  return fail('MIDI_NOTE_COUNT_MISMATCH');
 const rawById=new Map(),normalized=new Map(),assigned=new Map();
 for(const n of raw.sourceNotes){
  if(!goodId(n?.noteId)||rawById.has(n.noteId)||!identity(n.sourceEvent))
   return fail('PIANOMOTION_RAW_SOURCE_INVALID');
  rawById.set(n.noteId,n);
 }
 for(const m of raw.identityMappings){
  if(!m||m.status!=='exact'||!goodId(m.normalizedNoteId)||
     normalized.has(m.normalizedNoteId)||!rawById.has(m.noteId)||
     !Array.isArray(m.rawEvents)||m.rawEvents.length!==1||
     !identical(m.rawEvents[0],rawById.get(m.noteId).sourceEvent))
   return fail('PIANOMOTION_SOURCE_MAPPING_INVALID');
  normalized.set(m.normalizedNoteId,m);
 }
 for(const a of plan.assignments){
  if(!goodId(a?.noteId)||assigned.has(a.noteId)||!['left','right'].includes(a.hand)||
     !['played','unplayable','glissando'].includes(a.disposition)||
     (a.disposition==='played'?!Number.isInteger(a.finger)||a.finger<1||a.finger>5:a.finger!==null))
   return fail('PIANOMOTION_FINGER_INVALID');
  assigned.set(a.noteId,a);
 }
 const events=midi.notes.map((n,i)=>({
  i,n,start:seconds(midi,n.startTick),end:seconds(midi,n.endTick)
 }));
 const songNotes=sourceSong?.tracks?.flatMap((t,track)=>t.notes.map((n,i)=>({n,track,i})))??[];
 const used=new Set(),songUsed=new Set(),proposals=[];
 for(const n of doc.notes){
  const mapping=normalized.get(n?.noteId),a=assigned.get(n?.noteId);
  if(!mapping||!a||!identity(n.sourceEvent)||
     !identical(n.sourceEvent,mapping.rawEvents[0])||
     !Array.isArray(n.sourceNoteIds)||n.sourceNoteIds.length!==1||
     n.sourceNoteIds[0]!==mapping.noteId||a.hand!==n.hand||
     !Number.isInteger(n.pitch)||!Number.isFinite(n.startSeconds)||
     !Number.isFinite(n.endSeconds)||n.endSeconds<=n.startSeconds)
   return fail('PIANOMOTION_DOCUMENT_INTEGRITY_FAILED');
  const rawNote=rawById.get(mapping.noteId);
  if(n.pitch!==rawNote.pitch||!eq(n.startSeconds,rawNote.start)||
     !eq(n.endSeconds,rawNote.end))
   return fail('PIANOMOTION_CHANGED_ORIGINAL_NOTE');
  const matches=events.filter(({n:e,start,end})=>
   e.track===n.sourceEvent.midiTrackIndex&&
   e.channel===n.sourceEvent.channel&&e.pitch===n.pitch&&
   eq(start,n.startSeconds)&&eq(end,n.endSeconds));
  if(matches.length!==1)return fail('ORIGINAL_MIDI_EVENT_AMBIGUOUS');
  const event=matches[0];
  if(used.has(event.i))return fail('DUPLICATE_MIDI_EVENT');
  used.add(event.i);
  let id=null;
  if(sourceIndex){
   const key=signature(event.n);
   id=sourceIndex[key]??null;
   if(!goodId(id))return fail('SYNTHESIZED_SOURCE_ID_UNMAPPED');
  } else {
   const candidates=songNotes.filter(({n:note})=>
    note.pitch===n.pitch&&eq(note.start,event.start)&&
    eq(note.start+note.duration,event.end)&&
    !songUsed.has(note));
   if(candidates.length!==1)return fail('SELECTED_SONG_EVENT_AMBIGUOUS');
   const src=candidates[0];songUsed.add(src.n);
   id=goodId(src.n.noteId)?src.n.noteId:'midi:'+src.track+':'+src.i;
  }
  const source=songNotes.filter(({n:sn,track,i})=>
   (goodId(sn.noteId)?sn.noteId:'note:'+track+':'+i)===id||
   id==='midi:'+track+':'+i);
  if(source.length!==1)return fail('MISSING_OPEN_SONG_SOURCE');
  const original=source[0].n;
  if(original.hand==='RH'&&a.hand!=='right'||original.hand==='LH'&&a.hand!=='left')
   return fail('SOURCE_HAND_CONFLICT');
  // Author or manually corrected fingering is not replaced by automation.
  proposals.push({noteId:id,sourceNote:original,pitch:n.pitch,start:event.start,
   duration:event.end-event.start,hand:a.hand==='right'?'RH':'LH',
   finger:a.disposition==='played'?a.finger:null,
   provenance:'PianoMotion-original-Python',verifiedSource:true});
 }
 if(used.size!==events.length)return fail('MIDI_EVENTS_LEFT_UNMAPPED');
 return {ok:true,engine:'PianoMotion Studio · Python/Pyodide',
  candidates:proposals,originalMidiSha256:sha,researchOnly:true,
  productionEligible:false,sourceMappingVerified:true,expertValidated:false};
}
