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
// A non-computable chord / overlap island must not invalidate every independent
// phrase of a 400+ note score. Keep all source identities and author labels,
// remove only the WHOLE refused, temporally connected island from a COPY,
// and rerun the original unmodified solver on the remainder. No fabricated
// fingers, softened span thresholds, MIDI length edits or hidden fallback.
const RECOVERABLE_ISLAND_FAILURES=new Set(['NO_VALID_PATH','TOO_MANY_SIMULTANEOUS_KEYS']);
function solveModelWithIsolatedAbstentions(parts,{costModel,handSize}){
 const remaining={RH:parts.RH.slice(),LH:parts.LH.slice()};
 const excluded=[],excludedGroups=[];
 const maxPasses=Math.min(64,parts.RH.length+parts.LH.length);
 for(let pass=0;pass<=maxPasses;pass++){
  const result=proposeHybridScoreFingering(remaining,{costModel,handSize,beamWidth:40});
  if(result.ok)return {ok:true,result,remaining,excluded,excludedGroups};
  if(!RECOVERABLE_ISLAND_FAILURES.has(result.reason)||
     !['RH','LH'].includes(result.hand)||
     !Array.isArray(result.segmentNoteIds)||!result.segmentNoteIds.length)
   return {ok:false,reason:result.reason,excluded,excludedGroups,
    ...(result.failureAt?{failureAt:result.failureAt}:{})};
  const blocked=new Set(result.segmentNoteIds);
  const removed=remaining[result.hand].filter(n=>blocked.has(n.noteId));
  // Fail closed if the router did not identify one recoverable source island.
  if(!removed.length||removed.length!==blocked.size||pass===maxPasses)
   return {ok:false,reason:'PARTIAL_ISLAND_MAPPING_FAILED',excluded,excludedGroups};
  remaining[result.hand]=remaining[result.hand].filter(n=>!blocked.has(n.noteId));
  excludedGroups.push({hand:result.hand,reason:result.reason,notes:removed.length,
   ...(result.failureAt?{failureAt:result.failureAt}:{})});
  excluded.push(...removed.map(n=>({
   noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   hand:n.hand,staff:n.staff??'',voice:n.voice??'',
   reason:result.reason
  })));
  if(!remaining.RH.length&&!remaining.LH.length)
   return {ok:false,reason:'NO_COMPUTABLE_ISLANDS',excluded,excludedGroups};
 }
 return {ok:false,reason:'PARTIAL_ISLAND_PASS_LIMIT',excluded,excludedGroups};
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
  const attempt=solveModelWithIsolatedAbstentions(parts,{costModel,handSize});
  if(!attempt.ok){
   results[costModel]={status:'refused',reason:attempt.reason,
    proposed:0,physicalViolations:null,warnings:null,
    omittedCount:attempt.excluded.length,omittedNotes:attempt.excluded,
    omittedGroups:attempt.excludedGroups,
    ...(attempt.failureAt?{failureAt:attempt.failureAt}:{})};
   continue;
  }
  const r=attempt.result,solved=attempt.remaining;
  const eligible=[...solved.RH,...solved.LH];
  const items=[...r.hands.RH,...r.hands.LH];
  const perHand=['RH','LH'].map(h=>auditFingeringAssignments(solved[h],r.hands[h],{
   handSize,spanModel:costModel}));
  const physicalViolations=perHand.flatMap(x=>x.violations);
  if(physicalViolations.length){
   results[costModel]={status:'refused',reason:'INDEPENDENT_PHYSICAL_AUDIT_FAILED',
    proposed:0,physicalViolations:physicalViolations.length,warnings:null};
   continue;
  }
  const byId=new Map(items.map(n=>[n.noteId,n]));
  if(byId.size!==eligible.length||eligible.some(n=>!byId.has(n.noteId))){
   results[costModel]={status:'refused',reason:'SOURCE_IDENTITY_LOST',
    proposed:0,physicalViolations:null,warnings:null};
   continue;
  }
  const proposed=eligible.filter(n=>n.finger==null).map(n=>({
    noteId:n.noteId,hand:n.hand,pitch:n.pitch,start:n.start,
    finger:byId.get(n.noteId).finger
  }));
  results[costModel]={status:'computed',reason:null,
   proposed:proposed.length,physicalViolations:0,
   warnings:(r.diagnostics?.warnings.RH?.length||0)+(r.diagnostics?.warnings.LH?.length||0),
   omittedCount:attempt.excluded.length,
   omittedNotes:attempt.excluded,
   eligibleCount:eligible.length,omittedGroups:attempt.excludedGroups,
   coveragePercent:Math.round(100*eligible.length/original.length*10)/10,
   candidates:proposed};
 }
 const l=results.legacy,a=results.anatomical;
 let disagreements=null;
 if(l.status==='computed'&&a.status==='computed'){
  const amap=new Map(a.candidates.map(n=>[n.noteId,n.finger]));
  disagreements=l.candidates.filter(n=>amap.has(n.noteId)&&
   amap.get(n.noteId)!==n.finger).length;
 }
 return {ok:true,researchOnly:true,productionEligible:false,
  expertValidated:false,engine:'Play Along · FG-02I Beam Search',
  noteCount:original.length,eligibleCount:prepared.notes.length,
  omittedCount:prepared.omitted.length,omittedNotes:prepared.omitted,
  // Model-specific physical abstentions are reported independently. The
  // selected model owns its own review set; never pretend both agree.
  anchored:original.filter(n=>n.finger!=null).length,
  disagreements,models:results};
}
