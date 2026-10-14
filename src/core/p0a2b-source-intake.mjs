/**
 * P0-A2b phase 2: extract FINGERLESS *candidate* from actual parsed MusicXML.
 * This does not invent pianist-labelled fingers or infer hand ownership.
 *
 * Chord and overlap flags indicate objective source-event relationships;
 * 'inversion', 'thumb-under', 'crossing', 'wide-span', and arpeggio
 * techniques MUST be reviewed by musicians before a study is registered.
 */
const fail=(reason,extra={})=>({ok:false,reason,...extra,expertValidated:false,productionEligible:false});
const identity=/^[a-z0-9][a-z0-9._:-]{0,120}$/i;
export function p0a2bCandidateFromSong(song,{cohortId,groupId,split='development',
 scoreSha256,rightsConfirmed=false,maxNotes=2500}={}){
 if(!song||song.format!=='MusicXML'||!Array.isArray(song.tracks)||
   !identity.test(cohortId||'')||!identity.test(groupId||'')||
   !['development','heldout'].includes(split)||
   !/^[a-f0-9]{64}$/.test(scoreSha256||'')||rightsConfirmed!==true)
  return fail('SOURCE_OR_RIGHTS_NOT_CONFIRMED');
 const warnings=Array.isArray(song.warnings)?song.warnings:[];
 if(warnings.some(w=>/пропущен|пропущены|не развёрнут|не поддерж|не распознан|не определён|содержат разные номера|неоднознач/i.test(w)))
  return fail('SCORE_IMPORT_IS_LOSSY',{warningCount:warnings.length});
 const rows=song.tracks.flatMap((t,i)=>(t.notes||[]).map(n=>({n,track:i})));
 if(!rows.length||rows.length>maxNotes||!Number.isInteger(maxNotes)||maxNotes>2500)
  return fail('SOURCE_NOTE_COUNT_UNSUPPORTED');
 const seen=new Set(),notes=[];
 for(const {n} of rows){
  if(!identity.test(n?.noteId||'')||seen.has(n.noteId)||
    !Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108||
    !Number.isFinite(n.start)||n.start<0||
    !Number.isFinite(n.duration)||n.duration<=0||
    n.isDrum===true)
   return fail('MISSING_OR_CHANGED_SOURCE_NOTE');
  if(!Array.isArray(n.sourceNoteIds)||!n.sourceNoteIds.length||
    n.sourceNoteIds[0]!==n.noteId||
    n.sourceNoteIds.some(id=>typeof id!=='string'||!id))
   return fail('SOURCE_SEGMENT_IDS_NOT_VERIFIED');
  seen.add(n.noteId);
  notes.push({noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   tags:[],sourceSegments:n.sourceNoteIds.length});
 }
 notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch||
   a.noteId.localeCompare(b.noteId));
 // Every source note must have consistent physical key-up in original song
 // audio event stream; unlike acoustic pedal, key release is authoritative.
 const audio=(song.audioEvents||[]).filter(e=>e?.type==='noteOn'||e?.type==='noteOff');
 if(audio.length!==notes.length*2)return fail('SOURCE_KEY_EVENT_COUNT_MISMATCH');
 const byId=new Map();
 for(const e of audio){
  if(typeof e.noteId!=='string'||!seen.has(e.noteId)||
    !Number.isFinite(e.time)||e.pitch==null)
   return fail('SOURCE_KEY_EVENT_IDENTITY_INVALID');
  const pair=byId.get(e.noteId)||{};if(pair[e.type])return fail('DUPLICATE_KEY_EVENT');
  pair[e.type]=e;byId.set(e.noteId,pair);
 }
 for(const n of notes){
  const e=byId.get(n.noteId);
  if(!e?.noteOn||!e?.noteOff||e.noteOn.pitch!==n.pitch||
   e.noteOff.pitch!==n.pitch||
   Math.abs(e.noteOn.time-n.start)>.001||
   Math.abs(e.noteOff.time-n.start-n.duration)>.001)
   return fail('SOURCE_PHYSICAL_KEY_TIMING_MISMATCH');
 }
 let chords=0,held=0,repeated=0;
 for(const n of notes){
  const overlaps=notes.filter(x=>x!==n&&x.start<n.start+n.duration-.002&&
   n.start<x.start+x.duration-.002);
  if(overlaps.some(x=>x.pitch!==n.pitch&&Math.abs(x.start-n.start)<.002)){
   n.tags.push('chord');chords++;
  }
  if(overlaps.some(x=>x.pitch!==n.pitch&&Math.abs(x.start-n.start)>=.002)){
   n.tags.push('held-voice');held++;
  }
  if(notes.some(x=>x!==n&&x.pitch===n.pitch&&x.start<n.start&&
   n.start-(x.start+x.duration)>=-.002&&n.start-(x.start+x.duration)<.35)){
   n.tags.push('repeated-note');repeated++;
  }
  // Nontrivial musical semantics (inversion / thumb / crossings) deliberately
  // stay UNLABELED until a human review of the actual musical score.
 }
 return {ok:true,source:{
  schema:'p0a2b-curated-source-v1',cohortId,groupId,split,
  handMode:'blind-hands',rightsStatus:'verified-by-owner',
  scoreSha256,
  notes:notes.map(n=>({noteId:n.noteId,pitch:n.pitch,start:n.start,
    duration:n.duration,tags:n.tags}))
 },summary:{notes:notes.length,chordNotes:chords,heldVoiceNotes:held,
  repeatedNoteCandidates:repeated,tiedSourceNotes:notes.filter(n=>n.sourceSegments>1).length,
  warningCount:warnings.length,handLabelsProvided:false,
  techniqueTagsHumanReviewed:false},
 candidateOnly:true,expertValidated:false,productionEligible:false};
}
