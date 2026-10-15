/**
 * Browser FG-04C4: pure comparison of the EXISTING Play Along research solver.
 * Both variants run in a dedicated Worker. This is NOT PianoMotion Python/IK
 * and cannot override author/user MusicXML instructions or playback timing.
 */
import {proposeHybridScoreFingering} from './fingering-score-router.mjs';
import {auditFingeringAssignments} from './fingering-audit.mjs';

const fail=reason=>({ok:false,reason,productionEligible:false,researchOnly:true});
const finger=n=>Number.isInteger(n)&&n>=1&&n<=5;
const hand=h=>h==='RH'||h==='LH';
/**
 * Source-only, calculation-only screen for overlapping same-key re-attacks.
 *
 * The score may legitimately notate separate voices playing the same key
 * during one held gate. Assigning a new finger without releasing the key
 * would be fabricated. Preserve the earlier sounding note for the solver,
 * leave later distinct-onset notes untouched in MusicXML for manual review.
 * Same-onset unisons in one hand are supported by FG-02B as one key; a
 * two-hand same-onset unison is ambiguous and must fail closed.
 */
export function prepareBrowserFingeringUnisons(notes){
 const sorted=[...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch||
  a.noteId.localeCompare(b.noteId));
 const held=new Map(),kept=[],omitted=[];
 for(const n of sorted){
  const prior=held.get(n.pitch),end=n.start+n.duration;
  if(prior&&n.start<prior.end-.002){
   if(n.start<=prior.start+.012){
    if(prior.hand!==n.hand)return {ok:false,
     reason:'AMBIGUOUS_CROSS_HAND_SAME_ONSET_UNISON'};
    kept.push(n);prior.end=Math.max(prior.end,end);
   }else{
    omitted.push({noteId:n.noteId,pitch:n.pitch,start:n.start,
     duration:n.duration,hand:n.hand,
     ...(n.staff?{staff:n.staff}:{}),...(n.voice?{voice:n.voice}:{}),
     reason:'HELD_KEY_REARTICULATION_REVIEW'});
   }
   continue;
  }
  kept.push(n);
  held.set(n.pitch,{start:n.start,end,hand:n.hand});
 }
 return {ok:true,notes:kept,omitted};
}
export function compareBrowserFingeringResearch({notes,handSize='M'}={}){
 if(!Array.isArray(notes)||notes.length<1||notes.length>2500)
  return fail('INVALID_NOTE_COUNT');
 if(!['XXS','XS','S','M','L','XL','XXL'].includes(handSize))
  return fail('INVALID_HAND_SIZE');
 const ids=new Set(),original=[];
 for(const n of notes){
  if(!n||typeof n.noteId!=='string'||!n.noteId.startsWith('xml:')||
    ids.has(n.noteId))return fail('SOURCE_ID_REQUIRED_OR_DUPLICATE');
  ids.add(n.noteId);
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
    !Number.isFinite(n.start)||n.start<0||
    !Number.isFinite(n.duration)||n.duration<=0)return fail('INVALID_SCORE_EVENT');
  if(!hand(n.hand))return fail('HAND_NOT_SOURCE_VERIFIED');
  if(n.authorFinger!=null&&!finger(n.authorFinger)||
     n.userFinger!=null&&!finger(n.userFinger))return fail('INVALID_ANCHOR');
  const fixed=n.userFinger??n.authorFinger??null;
  const copy={noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,hand:n.hand,
   ...(fixed!==null?{finger:fixed}:{}),
   ...(typeof n.staff==='string'?{staff:n.staff}:{}),
   ...(typeof n.voice==='string'?{voice:n.voice}:{})};
  original.push(copy);
 }
 const prepared=prepareBrowserFingeringUnisons(original);
 if(!prepared.ok)return fail(prepared.reason);
 if(!prepared.notes.length)return fail('NO_UNAMBIGUOUS_NOTES');
 const parts={RH:[],LH:[]};
 for(const n of prepared.notes)parts[n.hand].push(n);
 const results={};
 for(const costModel of ['legacy','anatomical']){
  const r=proposeHybridScoreFingering(parts,{costModel,handSize,beamWidth:40});
  if(!r.ok){
   results[costModel]={status:'refused',reason:r.reason,
    proposed:0,physicalViolations:null,warnings:null};
   continue;
  }
  const items=[...r.hands.RH,...r.hands.LH];
  const perHand=['RH','LH'].map(h=>auditFingeringAssignments(parts[h],r.hands[h],{
   handSize,spanModel:costModel}));
  const physicalViolations=perHand.flatMap(x=>x.violations);
  if(physicalViolations.length){
   results[costModel]={status:'refused',reason:'INDEPENDENT_PHYSICAL_AUDIT_FAILED',
    proposed:0,physicalViolations:physicalViolations.length,warnings:null};
   continue;
  }
  const byId=new Map(items.map(n=>[n.noteId,n]));
  if(byId.size!==prepared.notes.length||prepared.notes.some(n=>!byId.has(n.noteId))){
   results[costModel]={status:'refused',reason:'SOURCE_IDENTITY_LOST',
    proposed:0,physicalViolations:null,warnings:null};
   continue;
  }
  const proposed=prepared.notes.filter(n=>n.finger==null).map(n=>({
    noteId:n.noteId,hand:n.hand,pitch:n.pitch,start:n.start,
    finger:byId.get(n.noteId).finger
  }));
  results[costModel]={status:'computed',reason:null,
   proposed:proposed.length,physicalViolations:0,
   warnings:(r.diagnostics?.warnings.RH?.length||0)+(r.diagnostics?.warnings.LH?.length||0),
   candidates:proposed};
 }
 const l=results.legacy,a=results.anatomical;
 let disagreements=null;
 if(l.status==='computed'&&a.status==='computed'){
  const amap=new Map(a.candidates.map(n=>[n.noteId,n.finger]));
  disagreements=l.candidates.filter(n=>amap.get(n.noteId)!==n.finger).length;
 }
 return {ok:true,researchOnly:true,productionEligible:false,
  expertValidated:false,engine:'Play Along · FG-02I Beam Search',
  noteCount:original.length,eligibleCount:prepared.notes.length,
  omittedCount:prepared.omitted.length,omittedNotes:prepared.omitted,
  anchored:original.filter(n=>n.finger!=null).length,
  disagreements,models:results};
}
