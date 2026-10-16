/**
 * FG-05 — combine already ACCEPTED PianoMotion notes with validated manual
 * corrections for a SEPARATE MusicXML download. No source or history mutation.
 * Manual numeric digits win on the same source note. A hand-only correction
 * preserves an applied finger; no unaccepted suggestion is considered.
 */
export function pianoMotionComposeExport(song,includedTracks,overrides,{effective}={}){
 const reject=reason=>({ok:false,reason});
 if(!song||!Array.isArray(song.tracks)||!Array.isArray(includedTracks)||
    !includedTracks.length||typeof effective!=='function'||
    !overrides||typeof overrides!=='object'||Array.isArray(overrides))
  return reject('INVALID_EXPORT_INPUT');
 const from=new Map();
 for(const track of song.tracks){
  for(const note of track.notes||[]){
   if(typeof note?.noteId!=='string'||from.has(note.noteId))
    return reject('SOURCE_NOTE_ID_MISSING_OR_DUPLICATED');
   from.set(note.noteId,note);
  }
 }
 const selected=new Set();
 for(const track of includedTracks){
  if(!Array.isArray(track?.notes))return reject('INVALID_INCLUDED_TRACK');
  for(const note of track.notes){
   if(!note||from.get(note.noteId)!==note||selected.has(note.noteId))
    return reject('UNVERIFIED_SELECTED_NOTE');
   selected.add(note.noteId);
  }
 }
 let manualCount=0,solverCount=0,handOnly=0;
 const validEdits=new Map();
 for(const [id,raw] of Object.entries(overrides)){
  if(!from.has(id))return reject('MANUAL_CORRECTION_SOURCE_MISMATCH');
  if(!selected.has(id))return reject('MANUAL_CORRECTION_OUTSIDE_EXPORTED_PIANO_PART');
  const value=effective(from.get(id),raw);
  if(!value)return reject('INVALID_MANUAL_CORRECTION');
  validEdits.set(id,value);
 }
 const tracks=includedTracks.map(track=>({...track,notes:track.notes.map(note=>{
  const manual=validEdits.get(note.noteId);
  const numeric=Number.isInteger(manual?.finger)&&manual.finger>=1&&manual.finger<=5;
  const original=Number.isInteger(note.finger)&&note.finger>=1&&note.finger<=5;
  if(numeric)manualCount++;else if(original)solverCount++;
  if(manual&&!numeric&&manual.hand)handOnly++;
  const finger=numeric?manual.finger:original?note.finger:null;
  const hand=manual?.hand==='RH'||manual?.hand==='LH'?manual.hand:
   note.hand==='RH'||note.hand==='LH'?note.hand:null;
  return {...note,finger,hand,
   fingeringSource:numeric?'user':note.fingeringSource??null};
 })}));
 return {ok:true,tracks,manualCount,solverCount,handOnly,
  totalNumbers:manualCount+solverCount,sourceNotes:selected.size};
}
