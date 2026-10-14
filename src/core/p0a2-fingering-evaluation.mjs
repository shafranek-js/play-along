/**
 * P0-A2 blinded finger-only score evaluation and original-byte PianoMotion
 * bridge. Canonical hand labels are known to BOTH engines (RH/LH tracks).
 * Source finger reference stays withheld until both proposals exist.
 * Do not export source note/finger arrays in reports.
 */
import {createHash} from 'node:crypto';
import {pianoMotionSourceAlignedAssignments} from './pianomotion-source-identity.mjs';
import {pianoMotionAuditFingers} from './pianomotion-physical-audit.mjs';

const failure=reason=>({ok:false,reason});
const finite=Number.isFinite;
const eventKey=e=>[e?.midiTrackIndex,e?.channel,
 e?.noteOnOrdinal,e?.noteOffOrdinal].join(':');
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=.002;
const nice=(num,den)=>den?Math.round(10000*num/den)/100:null;
const validFinger=f=>Number.isInteger(f)&&f>=1&&f<=5;
export function importP0A2PianoMotion({cohort,midiBytes,analysis}={}){
 if(!cohort?.ok||!Array.isArray(cohort.locators)||!Array.isArray(cohort.source)||
  cohort.locators.length!==cohort.source.length)return failure('INVALID_COHORT');
 if(!(midiBytes instanceof Uint8Array))return failure('MIDI_BYTES_REQUIRED');
 const raw=analysis?.rawBaseline;
 if(raw?.status!=='loaded'||raw.inputSha256!==
  createHash('sha256').update(midiBytes).digest('hex'))
  return failure('PIANOMOTION_MIDI_SHA_MISMATCH');
 if((raw.identityLosses?.length??0)!==0||
  (raw.unmappedSourceNoteIds?.length??0)!==0||
  !Array.isArray(raw.identityMappings)||
  !Array.isArray(raw.sourceNotes)||
  raw.identityMappings.length!==cohort.source.length||
  raw.sourceNotes.length!==cohort.source.length)
  return failure('PIANOMOTION_RAW_SOURCE_INCOMPLETE');
 const joined=pianoMotionSourceAlignedAssignments(analysis);
 if(!joined.ok)return failure('PIANOMOTION_'+joined.reason);
 const byLocator=new Map(),seenEvent=new Set();
 for(const loc of cohort.locators){
  const key=eventKey(loc);
  if(seenEvent.has(key))return failure('CANONICAL_EVENT_DUPLICATE');
  seenEvent.add(key);byLocator.set(key,loc);
 }
 const byRawId=new Map(),seen=new Set();
 for(const n of raw.sourceNotes){
  if(typeof n?.noteId!=='string'||byRawId.has(n.noteId)||
    !n.sourceEvent||!byLocator.has(eventKey(n.sourceEvent)))
   return failure('RAW_EVENT_UNKNOWN_OR_DUPLICATE');
  const expected=byLocator.get(eventKey(n.sourceEvent));
  if(!expected||n.pitch!==expected.pitch||!near(n.start,expected.start)||
   !near(n.end,expected.end)||seen.has(expected.noteId))
   return failure('PIANOMOTION_MIDI_SOURCE_MISMATCH');
  byRawId.set(n.noteId,expected);seen.add(expected.noteId);
 }
 if(seen.size!==cohort.locators.length)return failure('CANONICAL_NOTES_UNACCOUNTED');
 const mapped=new Set();
 for(const m of raw.identityMappings){
  if(m?.status!=='exact'||typeof m.noteId!=='string'||
     !byRawId.has(m.noteId)||!Array.isArray(m.rawEvents)||
     m.rawEvents.length!==1||
     eventKey(m.rawEvents[0])!==eventKey(
      raw.sourceNotes.find(s=>s.noteId===m.noteId)?.sourceEvent)||
     mapped.has(m.noteId))return failure('PIANOMOTION_IDENTITY_MAPPING_NOT_EXACT');
  mapped.add(m.noteId);
 }
 if(mapped.size!==cohort.source.length)return failure('PIANOMOTION_IDENTITY_MAPPING_INCOMPLETE');
 const items=[],used=new Set();
 for(const s of joined.suggestions){
  const src=byRawId.get(s.noteId);
  if(!src||used.has(src.noteId)||s.pitch!==src.pitch||
   !near(s.start,src.start)||!near(s.end,src.end))
   return failure('PIANOMOTION_ASSIGNMENT_SOURCE_MISMATCH');
  used.add(src.noteId);
  items.push({noteId:src.noteId,hand:s.hand,finger:s.finger,
   pitch:src.pitch,start:src.start,duration:src.end-src.start});
 }
 if(items.length!==cohort.source.length||used.size!==cohort.source.length)
  return failure('INCOMPLETE_FINGER_ASSIGNMENTS');
 return {ok:true,items,method:'p0a2-exact-generated-smf-event-identity',
  provenSourceNotes:used.size,researchOnly:true,expertValidated:false};
}
/**
 * Only aggregate counters, including selection/accuracy denominators.
 * A rejected engine has zero eligible proposals; never count as evaluated.
 */
export function evaluateP0A2Case({source,reference,items=null,handSize='M',engineStatus=null}={}){
 if(!Array.isArray(source)||!source.length||source.length>2500||
    !Array.isArray(reference)||reference.length!==source.length)
  return failure('INVALID_EVALUATION_INPUT');
 const src=new Map(),gold=new Map();
 for(const s of source){
  if(typeof s?.noteId!=='string'||!s.noteId||src.has(s.noteId)||
   !['RH','LH'].includes(s.hand)||!Number.isInteger(s.pitch)||s.pitch<21||s.pitch>108||
   !finite(s.start)||s.start<0||!finite(s.duration)||s.duration<=0||
   s.authorFinger!=null||s.userFinger!=null)
   return failure('INVALID_BLINDED_SOURCE');
  src.set(s.noteId,s);
 }
 for(const r of reference){
  if(!src.has(r?.noteId)||gold.has(r.noteId)||
     !validFinger(r.finger)||r.hand!==src.get(r.noteId).hand)
   return failure('INVALID_OR_LEAKED_REFERENCE');
  gold.set(r.noteId,r);
 }
 if(gold.size!==source.length)return failure('REFERENCE_NOT_COMPLETE');
 const base={eligible:source.length,proposed:0,abstained:source.length,
  handCorrect:0,handWrong:0,fingerCorrectAmongCorrectHand:0,
  jointCorrect:0,jointWrong:0,physicalBlocked:0,
  coveragePercent:0,jointAgreementEligiblePercent:0,
  jointAgreementProposedPercent:null,referenceSource:'pinned-pig-hand-authored',
  independentPianistConsensus:false,researchOnly:true,expertValidated:false,
  productionEligible:false};
 if(items===null)return {ok:true,status:'not-run',reason:engineStatus||'ENGINE_NOT_RUN',...base};
 if(!Array.isArray(items)||items.length>source.length)
  return failure('INVALID_ENGINE_OUTPUT');
 const mapped=new Map();
 for(const n of items){
  const s=src.get(n?.noteId);
  if(!s||mapped.has(n.noteId)||n.pitch!==s.pitch||
   !near(n.start,s.start)||!near(n.duration,s.duration)||
   !['RH','LH'].includes(n.hand)||
   !(n.finger===null||validFinger(n.finger)))
   return failure('FOREIGN_OR_CHANGED_SOURCE_NOTE');
  mapped.set(n.noteId,n);
 }
 let handCorrect=0,fingerCorrect=0,jointCorrect=0,proposed=0;
 const matches=[];
 for(const [i,s] of source.entries()){
  const p=mapped.get(s.noteId);if(!p||p.finger===null)continue;
  proposed++;
  const correctHand=p.hand===s.hand,correctFinger=p.finger===gold.get(s.noteId).finger;
  if(correctHand)handCorrect++;
  if(correctHand&&correctFinger){fingerCorrect++;jointCorrect++;}
  matches.push({note:{pitch:s.pitch,start:s.start,duration:s.duration},
   suggestion:{hand:p.hand,finger:p.finger}});
 }
 const audit=matches.length?pianoMotionAuditFingers({ok:true,matches}):null;
 if(audit&&!audit.ok)return failure('INDEPENDENT_AUDIT_'+audit.reason);
 return {ok:true,status:'evaluated',
  ...base,proposed,abstained:source.length-proposed,
  handCorrect,handWrong:proposed-handCorrect,
  fingerCorrectAmongCorrectHand:fingerCorrect,jointCorrect,
  jointWrong:proposed-jointCorrect,
  physicalBlocked:audit?.blocked.length??0,
  coveragePercent:nice(proposed,source.length),
  jointAgreementEligiblePercent:nice(jointCorrect,source.length),
  jointAgreementProposedPercent:nice(jointCorrect,proposed)};
}
export function summarizeP0A2(cases){
 if(!Array.isArray(cases)||!cases.length||
    cases.some(c=>!c||!c.playAlong||!c.pianoMotion))
  return failure('INVALID_COMPARISON_CASES');
 const sum=engine=>{
  const fields=['eligible','proposed','abstained','handCorrect','handWrong',
   'fingerCorrectAmongCorrectHand','jointCorrect','jointWrong','physicalBlocked'];
  const counts=Object.fromEntries(fields.map(k=>[k,cases.reduce((n,c)=>n+(c[engine][k]||0),0)]));
  return {...counts,casesEvaluated:cases.filter(c=>c[engine].status==='evaluated').length,
   casesNotRun:cases.filter(c=>c[engine].status!=='evaluated').length,
   coveragePercent:nice(counts.proposed,counts.eligible),
   jointAgreementEligiblePercent:nice(counts.jointCorrect,counts.eligible),
   jointAgreementProposedPercent:nice(counts.jointCorrect,counts.proposed)};
 };
 return {ok:true,caseCount:cases.length,playAlong:sum('playAlong'),pianoMotion:sum('pianoMotion'),
  researchOnly:true,expertValidated:false,productionEligible:false,
  independentPianistConsensus:false};
}
