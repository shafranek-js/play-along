/**
 * FG-04D3: source-bound, session-only review of PianoMotion proposals.
 * Selected proposals are one atomic Undo/Redo step; no hidden edits to the
 * author/user layer and no inference of physical pianist finger truth.
 */
export const PIANOMOTION_HISTORY_LIMIT=40;
export const pianoMotionEmptyHistory=()=>({past:[],future:[]});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export function pianoMotionNoteState(n){
 return {hasFinger:own(n,'finger'),finger:n.finger??null,
  hasHand:own(n,'hand'),hand:n.hand??null,
  hasSource:own(n,'fingeringSource'),source:n.fingeringSource??null};
}
export function pianoMotionStateEqual(a,b){
 return a.hasFinger===b.hasFinger&&a.finger===b.finger&&
  a.hasHand===b.hasHand&&a.hand===b.hand&&
  a.hasSource===b.hasSource&&a.source===b.source;
}
function restore(note,s){
 if(s.hasFinger)note.finger=s.finger;else delete note.finger;
 if(s.hasHand)note.hand=s.hand;else delete note.hand;
 if(s.hasSource)note.fingeringSource=s.source;else delete note.fingeringSource;
}
export function pianoMotionProposeBatch(alignment,indices,userEdits={}){
 const fail=reason=>({ok:false,reason});
 if(!alignment?.ok||!Array.isArray(alignment.matches)||!Array.isArray(indices)||
  indices.length>30000||!userEdits||typeof userEdits!=='object')
  return fail('INVALID_REVIEW_SELECTION');
 const unique=new Set(indices);
 if(unique.size!==indices.length||[...unique].some(i=>!Number.isInteger(i)||
   i<0||i>=alignment.matches.length))return fail('INVALID_REVIEW_SELECTION');
 const patches=[];let protectedCount=0,unresolved=0,unchanged=0;
 for(const i of unique){
  const {note:n,suggestion:s}=alignment.matches[i]||{};
  if(!n||!s||!['RH','LH'].includes(s.hand)||
    !(s.finger===null||Number.isInteger(s.finger)&&s.finger>=1&&s.finger<=5))
   return fail('INVALID_REVIEW_NOTE');
  if(s.finger===null){unresolved++;continue;}
  if(n.noteId&&own(userEdits,n.noteId)||
     n.fingeringSource!=='pianomotion'&&
     (n.finger!=null||n.fingeringSource==='musicxml'||n.fingeringSource==='user')){
   protectedCount++;continue;
  }
  const before=pianoMotionNoteState(n);
  const after={hasFinger:true,finger:s.finger,hasHand:true,hand:s.hand,
    hasSource:true,source:'pianomotion'};
  if(pianoMotionStateEqual(before,after)){unchanged++;continue;}
  patches.push({note:n,before,after,index:i});
 }
 return {ok:true,patches,protectedCount,unresolved,unchanged};
}
export function pianoMotionCommitBatch(history,batch){
 if(!batch?.ok||!Array.isArray(batch.patches)||!batch.patches.length)
  return {ok:false,reason:'NOTHING_TO_APPLY'};
 if(batch.patches.some(p=>!p.note||!p.before||!p.after||
  !pianoMotionStateEqual(pianoMotionNoteState(p.note),p.before)))
  return {ok:false,reason:'STALE_REVIEW'};
 for(const p of batch.patches)restore(p.note,p.after);
 const h=history||pianoMotionEmptyHistory();
 return {ok:true,history:{past:[...h.past,batch.patches].slice(-PIANOMOTION_HISTORY_LIMIT),future:[]},
  count:batch.patches.length};
}
export function pianoMotionTravelHistory(history,direction){
 const h=history||pianoMotionEmptyHistory();
 const undo=direction==='undo',redo=direction==='redo';
 if(!undo&&!redo)return {ok:false,reason:'INVALID_HISTORY_DIRECTION'};
 const stack=undo?h.past:h.future,step=stack[stack.length-1];
 if(!Array.isArray(step)||!step.length)return {ok:false,reason:'EMPTY_HISTORY'};
 if(step.some(p=>!p.note||!p.before||!p.after||
  !pianoMotionStateEqual(pianoMotionNoteState(p.note),undo?p.after:p.before)))
  return {ok:false,reason:'STALE_REVIEW'};
 for(const p of step)restore(p.note,undo?p.before:p.after);
 return {ok:true,count:step.length,history:undo?
  {past:h.past.slice(0,-1),future:[...h.future,step].slice(-PIANOMOTION_HISTORY_LIMIT)}:
  {past:[...h.past,step].slice(-PIANOMOTION_HISTORY_LIMIT),future:h.future.slice(0,-1)}};
}
/** Safe, finite visualization window: return original note indices, not copies. */
export function pianoMotionWindow(alignment,offset=0,limit=24){
 if(!alignment?.ok||!Array.isArray(alignment.matches))return [];
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>64)return [];
 return alignment.matches.slice(offset,offset+limit).map((entry,i)=>({...entry,index:offset+i}));
}
