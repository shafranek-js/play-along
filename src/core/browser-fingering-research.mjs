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
export function compareBrowserFingeringResearch({notes,handSize='M'}={}){
 if(!Array.isArray(notes)||notes.length<1||notes.length>2500)
  return fail('INVALID_NOTE_COUNT');
 if(!['XXS','XS','S','M','L','XL','XXL'].includes(handSize))
  return fail('INVALID_HAND_SIZE');
 const ids=new Set(),parts={RH:[],LH:[]},original=[];
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
   ...(fixed!==null?{finger:fixed}:{})};
  parts[n.hand].push(copy);original.push(copy);
 }
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
  if(byId.size!==original.length||original.some(n=>!byId.has(n.noteId))){
   results[costModel]={status:'refused',reason:'SOURCE_IDENTITY_LOST',
    proposed:0,physicalViolations:null,warnings:null};
   continue;
  }
  const proposed=original.filter(n=>n.finger==null).map(n=>({
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
  noteCount:original.length,anchored:original.filter(n=>n.finger!=null).length,
  disagreements,models:results};
}
