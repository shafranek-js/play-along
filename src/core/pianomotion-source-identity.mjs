/**
 * FG-04D0B: reattach ORIGINAL PrettyMIDI source timing after PianoMotion's
 * internal minimum-duration normalization (50ms by default).
 *
 * No proximity guess: the algorithm's sourceNoteIds must form an exact
 * bijection with the raw source inventory. Reject merges, missing source
 * aliases, duplicate IDs, unexpected timing changes, or note pitch edits.
 */
export function pianoMotionSourceAlignedAssignments(result) {
 const raw=result?.rawBaseline;
 const source=raw?.sourceNotes;
 const notes=result?.document?.notes;
 const fingers=result?.fingeringPlan?.assignments;
 const fail=reason=>({ok:false,reason});
 if(raw?.status!=='loaded'||!Array.isArray(source)||!Array.isArray(notes)||
    !Array.isArray(fingers)||!source.length||source.length!==notes.length||
    source.length!==fingers.length||(raw.identityLosses?.length??0)!==0)
  return fail('PIANOMOTION_SOURCE_NOTE_COUNT_OR_IDENTITY');
 const rawById=new Map();
 for(const s of source){
  if(typeof s?.noteId!=='string'||!s.noteId||rawById.has(s.noteId)||
     !Number.isInteger(s.pitch)||s.pitch<0||s.pitch>127||
     !Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start)
   return fail('PIANOMOTION_RAW_NOTE_INVALID');
  rawById.set(s.noteId,s);
 }
 const documentById=new Map(),sourceIds=new Set();
 for(const n of notes){
  if(typeof n?.noteId!=='string'||documentById.has(n.noteId)||
     !Array.isArray(n.sourceNoteIds)||n.sourceNoteIds.length!==1)
   return fail('PIANOMOTION_NORMALIZED_IDENTITY_AMBIGUOUS');
  const rawId=n.sourceNoteIds[0],s=rawById.get(rawId);
  if(!s||sourceIds.has(rawId)||n.pitch!==s.pitch||
     !Number.isFinite(n.startSeconds)||!Number.isFinite(n.endSeconds)||
     Math.abs(n.startSeconds-s.start)>0.005||
     n.endSeconds<s.end-0.005||
     n.endSeconds>Math.max(s.end,s.start+0.05)+0.005)
   return fail('PIANOMOTION_SOURCE_TIME_OR_PITCH_MISMATCH');
  sourceIds.add(rawId);documentById.set(n.noteId,{doc:n,source:s});
 }
 if(sourceIds.size!==rawById.size)return fail('PIANOMOTION_SOURCE_NOTES_UNACCOUNTED');
 const used=new Set(),suggestions=[];
 for(const a of fingers){
  const entry=documentById.get(a?.noteId);
  if(!entry||used.has(a.noteId)||!['right','left'].includes(a.hand)||
     !(a.finger===null||Number.isInteger(a.finger)&&a.finger>=1&&a.finger<=5))
   return fail('PIANOMOTION_ASSIGNMENT_INVALID');
  used.add(a.noteId);
  const s=entry.source;
  suggestions.push({noteId:s.noteId,pitch:s.pitch,start:s.start,end:s.end,
   hand:a.hand==='right'?'RH':'LH',finger:a.finger,
   disposition:a.disposition==='played'?'played':'unresolved'});
 }
 if(used.size!==documentById.size)return fail('PIANOMOTION_ASSIGNMENTS_INCOMPLETE');
 return {ok:true,suggestions,sourceNoteMappingVerified:true};
}
