/**
 * FG-04D0 — RESEARCH ONLY. A one-way provenance firewall between three
 * independent solvers: experimental hand separation, finger planning and
 * visual hand-motion screening. NEVER imported by the learner/player.
 *
 * Only explicit, same-layer author or user-verified hand+finger pairs can
 * reach Motion Feasibility. Neither experimental solver may authorize motion.
 * Caller must supply canonical source events and trusted task completion
 * state; this pure probe cannot authenticate arbitrary external input.
 */
import {separateHandsResearch} from './fingering-hand-separation.mjs';
import {proposeHybridScoreFingering} from './fingering-score-router.mjs';
import {planAnticipatoryHandMotion} from './hand-motion-feasibility.mjs';

const MAX_NOTES=128;
const HANDS=new Set(['RH','LH']);
const RESEARCH={productionEligible:false,expertValidated:false,researchOnly:true};
const validTime=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const hand=n=>HANDS.has(n);
const finger=n=>Number.isInteger(n)&&n>=1&&n<=5;
const forbidden=(reason,extra={})=>({ok:false,reason,...extra,...RESEARCH});

/** Deliberately reject an unpaired user correction. Never borrow a finger
 * from author notation when the user changed the hand (or vice versa). */
function verified(note){
 const hasUser=note.userHand!=null||note.userFinger!=null;
 if(hasUser)return hand(note.userHand)&&finger(note.userFinger)
  ?{hand:note.userHand,finger:note.userFinger,source:'user',verification:'user-verified'}:null;
 return hand(note.authorHand)&&finger(note.authorFinger)
  ?{hand:note.authorHand,finger:note.authorFinger,source:'musicxml',verification:'source-author'}:null;
}
const effectiveHand=n=>n.userHand??n.authorHand??null;
const summaryOnly=result=>({
 ok:result.ok===true,reason:result.reason??null,
 fixed:result.summary?.fixed??0,proposed:result.summary?.proposed??0,
 unknown:result.summary?.unknown??0,productionEligible:false
});
const accepted=(group,verifiedNotes,completed)=>({
 onset:group.onset,totalNotes:group.notes.length,
 isNextUnfinished:true,
 ...(group.iteration!=null?{iteration:group.iteration}:{}),
 notes:group.notes.map(n=>({
  noteId:n.noteId,pitch:n.pitch,duration:n.duration,
  ...verifiedNotes.get(n.noteId),completed:completed.has(n.noteId)
 }))
});

/**
 * @param {Object} args
 * notes: canonical unique score noteIds (max 128) with original pitch/start/
 * duration; optional authorHand+authorFinger or userHand+userFinger overrides.
 * targetNoteId: any PENDING note of the actual earliest incomplete onset.
 * completedNoteIds: authoritative, source-derived list of completed IDs.
 * hand: requested RH/LH. geometry/viewport/transport are passed read-only.
 * Result contains no generated finger numbers or source-mutating references.
 */
export function inspectGuidanceResearchBridge({
 notes,hand:requestedHand,targetNoteId,completedNoteIds=[],
 geometry,viewport,transport,handSize='M'
}={}){
 if(!Array.isArray(notes)||notes.length<1||notes.length>MAX_NOTES)
  return forbidden('invalid-scope');
 if(!hand(requestedHand)||typeof targetNoteId!=='string'||!targetNoteId)
  return forbidden('invalid-request');
 if(!Array.isArray(completedNoteIds)||completedNoteIds.length>MAX_NOTES)
  return forbidden('invalid-completion');
 const ids=new Set(),buckets=new Map();
 for(const n of notes){
  if(!n||typeof n.noteId!=='string'||!n.noteId.trim()||ids.has(n.noteId)||
   !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
   !validTime(n.start)||!Number.isFinite(n.duration)||n.duration<=0)
   return forbidden('invalid-source-event');
  ids.add(n.noteId);
  if((n.authorHand!=null&&!hand(n.authorHand))||
     (n.userHand!=null&&!hand(n.userHand))||
     (n.authorFinger!=null&&!finger(n.authorFinger))||
     (n.userFinger!=null&&!finger(n.userFinger)))
   return forbidden('invalid-provenance');
  const tick=Math.round(n.start*1000);
  if(!buckets.has(tick))buckets.set(tick,{onset:n.start,notes:[]});
  const group=buckets.get(tick);
  // Never combine two distinct exact score onsets just to match visual ms.
  if(group.onset!==n.start)return forbidden('millisecond-onset-collision');
  group.notes.push(n);
 }
 const completed=new Set(completedNoteIds);
 if(completed.size!==completedNoteIds.length||
  [...completed].some(id=>!ids.has(id)))return forbidden('invalid-completion');
 if(!ids.has(targetNoteId)||completed.has(targetNoteId))
  return forbidden('target-not-pending');

 const groups=[...buckets.values()].sort((a,b)=>a.onset-b.onset);
 const index=groups.findIndex(g=>g.notes.some(n=>!completed.has(n.noteId)));
 if(index<0)return forbidden('all-tasks-complete');
 const current=groups[index];
 if(!current.notes.some(n=>n.noteId===targetNoteId&&!completed.has(n.noteId)))
  return forbidden('skipped-unfinished-onset');

 // Research splitter proposals remain observable only as aggregate counts.
 // No generated hand or finger is ever written to a motion input.
 const h=separateHandsResearch(notes.map(n=>({
  noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  ...(n.authorHand!=null?{authorHand:n.authorHand}:{}),
  ...(n.userHand!=null?{userHand:n.userHand}:{}),
  ...(n.partId!=null?{partId:n.partId}:{}),
  ...(n.staff!=null?{staff:n.staff}:{}),
  ...(n.voice!=null?{voice:n.voice}:{})
 })),{handSize});
 const handResearch=summaryOnly(h);
 // Finger-solver predictions are computed only for independently fixed hands,
 // then summarized and discarded. Their note/finger values cannot escape.
 const hands={RH:[],LH:[]};
 const allHandsKnown=notes.every(n=>hand(effectiveHand(n)));
 let fingerResearch={status:'skipped-unknown-hand',productionEligible:false};
 if(allHandsKnown){
  for(const n of notes){
   const known=verified(n);
   hands[effectiveHand(n)].push({
    pitch:n.pitch,start:n.start,duration:n.duration,noteId:n.noteId,
    hand:effectiveHand(n),finger:known?.finger??null
   });
  }
  const f=proposeHybridScoreFingering(hands,{handSize});
  fingerResearch={status:f.ok?'research-only':'refused',
   reason:f.ok?null:f.reason,
   proposed:f.ok?[...f.hands.RH,...f.hands.LH]
    .filter(n=>n.source==='proposed-research').length:0,
   productionEligible:false};
 }
 const evidence=new Map(notes.map(n=>[n.noteId,verified(n)]));
 if(current.notes.some(n=>!evidence.get(n.noteId)))
  return forbidden('unverified-target-group',{handResearch,fingerResearch});
 const target=accepted(current,evidence,completed);
 if(!target.notes.some(n=>n.hand===requestedHand&&!n.completed))
  return forbidden('requested-hand-not-pending',{handResearch,fingerResearch});
 // Derive origin from source order; the caller cannot substitute a
 // convenient earlier pose in order to make an unsafe motion seem reachable.
 const previous=(forHand)=>{
  for(let i=index-1;i>=0;i--){
   const g=groups[i];
   const matching=g.notes.filter(n=>evidence.get(n.noteId)?.hand===forHand);
   if(!matching.length)continue;
   if(matching.some(n=>!completed.has(n.noteId)))return null;
   return {onset:g.onset,totalNotes:matching.length,
    notes:matching.map(n=>({noteId:n.noteId,pitch:n.pitch,duration:n.duration,
     ...evidence.get(n.noteId),completed:true}))};
  }
  return null;
 };
 const origin=previous(requestedHand);
 const otherHand=requestedHand==='RH'?'LH':'RH';
 const hasOther=target.notes.some(n=>n.hand===otherHand);
 const otherOrigin=hasOther?previous(otherHand):null;
 const opposite=hasOther&&otherOrigin?{origin:otherOrigin,target}:undefined;
 // A two-hand onset without independently verified opposite origin is not a
 // safe crossing signal: never assert oppositeHandClear in its place.
 const cleared=hasOther?{...transport,oppositeHandClear:false}:transport;
 const motion=hasOther&&!otherOrigin
  ?{kind:'markers',reason:'opposite-origin-unverified',researchOnly:true,keys:[]}
  :planAnticipatoryHandMotion({
    hand:requestedHand,target,origin,opposite,geometry,viewport,
    transport:cleared
   });
 return {ok:true,handResearch,fingerResearch,
  motion,sourceEvents:notes.length,targetOnset:current.onset,
  targetNoteIds:current.notes.map(n=>n.noteId),
  trustedMotionNotes:current.notes.length,
  ...RESEARCH};
}
