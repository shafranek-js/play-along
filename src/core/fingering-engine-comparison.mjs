/**
 * FG-04C2: score-identity-locked comparative harness, research only.
 * Runs Play Along's EXISTING finger router when requested. PianoMotion
 * predictions are supplied separately, never impersonated by a fixture.
 * Do not feed independently withheld truth to either solver.
 */
import {proposeHybridScoreFingering} from './fingering-score-router.mjs';
import {auditFingeringAssignments} from './fingering-audit.mjs';

const HANDS=new Set(['RH','LH']);
const SIZES=new Set(['XXS','XS','S','M','L','XL','XXL']);
const MAX_NOTES=2500,EPS=1e-8;
const finger=n=>Number.isInteger(n)&&n>=1&&n<=5;
const time=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const failure=reason=>({ok:false,reason,researchOnly:true,productionEligible:false});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const anchor=n=>n.userFinger??n.authorFinger??null;
const sorted=(a,b)=>a.start-b.start||a.pitch-b.pitch||a.noteId.localeCompare(b.noteId);

function validateSource(source){
 if(!Array.isArray(source)||!source.length||source.length>MAX_NOTES)return 'INVALID_SOURCE_SIZE';
 const ids=new Set();
 for(const n of source){
  if(!n||typeof n.noteId!=='string'||!n.noteId.trim()||ids.has(n.noteId))
   return 'MISSING_OR_DUPLICATE_SOURCE_ID';
  ids.add(n.noteId);
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
     !time(n.start)||!Number.isFinite(n.duration)||n.duration<=0||
     !HANDS.has(n.hand))return 'INVALID_SOURCE_EVENT';
  if(n.authorFinger!=null&&!finger(n.authorFinger)||
     n.userFinger!=null&&!finger(n.userFinger))return 'INVALID_SOURCE_ANCHOR';
  if(n.sourceNoteIds!==undefined&&
     (!Array.isArray(n.sourceNoteIds)||!n.sourceNoteIds.length||
      n.sourceNoteIds.some(id=>typeof id!=='string'||!id.trim())))
   return 'INVALID_SOURCE_SEGMENTS';
 }
 return null;
}

function validateTruth(source,truth){
 if(truth===undefined)return {map:new Map(),error:null};
 if(!Array.isArray(truth)||truth.length>source.length)return {error:'INVALID_WITHHELD_TRUTH'};
 const src=new Map(source.map(n=>[n.noteId,n])),seen=new Map();
 for(const t of truth){
  if(!t||!src.has(t.noteId)||seen.has(t.noteId)||!finger(t.finger)||
     !HANDS.has(t.hand)||src.get(t.noteId).hand!==t.hand||
     anchor(src.get(t.noteId))!=null)return {error:'INVALID_OR_LEAKING_WITHHELD_TRUTH'};
  seen.set(t.noteId,t);
 }
 return {map:seen,error:null};
}

const unacceptable=reason=>({status:'rejected',reason,summary:null,
 expertValidated:false,productionEligible:false});
/**
 * Input engine rows must carry pitch/start/duration/hand and immutable noteId.
 * Additional part/staff/voice/tie segment metadata are compared if supplied;
 * absence is reported as unverified, never filled with copied source metadata.
 */
function scoreEngine(source,items,truthMap,handSize){
 if(items==null)return {status:'not-run',reason:'ENGINE_OUTPUT_NOT_PROVIDED',
  summary:null,expertValidated:false,productionEligible:false};
 if(!Array.isArray(items)||items.length>source.length)return unacceptable('INVALID_ENGINE_OUTPUT');
 const src=new Map(source.map(n=>[n.noteId,n])),rows=new Map();
 let contextUnverified=0;
 for(const n of items){
  if(!n||typeof n.noteId!=='string'||rows.has(n.noteId)||!src.has(n.noteId))
   return unacceptable('DUPLICATE_OR_UNKNOWN_CANDIDATE_ID');
  rows.set(n.noteId,n);
  const old=src.get(n.noteId);
  if(n.pitch!==old.pitch||n.start!==old.start||n.duration!==old.duration||
     n.hand!==old.hand)return unacceptable('SCORE_EVENT_OR_HAND_CHANGED');
  if(n.finger!=null&&!finger(n.finger))return unacceptable('INVALID_PROPOSED_FINGER');
  const fields=['partId','staff','voice','sourceNoteIds'];
  let complete=true;
  for(const field of fields){
   if(old[field]!==undefined){
    if(n[field]===undefined){complete=false;continue}
    if(!same(n[field],old[field]))return unacceptable('SCORE_CONTEXT_CHANGED');
   }
  }
  if(!complete)contextUnverified++;
 }
 for(const old of source){
  const fixed=anchor(old),candidate=rows.get(old.noteId);
  if(fixed!=null&&candidate?.finger!==fixed)
   return unacceptable('AUTHOR_OR_USER_ANCHOR_CHANGED_OR_MISSING');
 }
 const covered=source.filter(n=>finger(rows.get(n.noteId)?.finger));
 const proposed=covered.filter(n=>anchor(n)==null);
 const missing=source.length-covered.length,anchors=source.length-
  source.filter(n=>anchor(n)==null).length;
 const eligible=source.length-anchors;
 const truthEligible=source.filter(n=>truthMap.has(n.noteId));
 const truthProposed=truthEligible.filter(n=>finger(rows.get(n.noteId)?.finger));
 const truthCorrect=truthProposed.filter(n=>rows.get(n.noteId).finger===truthMap.get(n.noteId).finger).length;
 const subInput=covered.map(n=>({...n,finger:anchor(n)}));
 const subOutput=covered.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,
  hand:rows.get(n.noteId).hand,finger:rows.get(n.noteId).finger}));
 const audited=auditFingeringAssignments(subInput,subOutput,{handSize});
 const violations=audited.violations.map(v=>v.code);
 // Different hands cannot each claim a separately sounding same MIDI key.
 for(let i=0;i<covered.length;i++)for(let j=i+1;j<covered.length;j++){
  const a=covered[i],b=covered[j];
  if(a.hand!==b.hand&&a.pitch===b.pitch&&
   a.start<b.start+b.duration-EPS&&b.start<a.start+a.duration-EPS)
   violations.push('CROSS_HAND_SAME_KEY_OVERLAP');
 }
 const counts=Object.create(null);
 for(const v of violations)counts[v]=(counts[v]||0)+1;
 const summary={
  total:source.length,anchors,eligible,proposed:proposed.length,
  abstained:eligible-proposed.length,coverage:eligible?proposed.length/eligible:null,
  sourceContextUnverified:contextUnverified,
  truthEligible:truthEligible.length,truthProposed:truthProposed.length,
  truthCorrect,truthWrong:truthProposed.length-truthCorrect,
  truthAbstained:truthEligible.length-truthProposed.length,
  truthAgreementProposed:truthProposed.length?truthCorrect/truthProposed.length:null,
  truthAgreementEligible:truthEligible.length?truthCorrect/truthEligible.length:null,
  physicallyAudited:covered.length,physicalViolationCount:violations.length,
  physicalViolations:{...counts},
 };
 return {status:violations.length?'physical-conflicts':'evaluated',
  summary,expertValidated:false,productionEligible:false};
}

/**
 * Returns aggregate-only reports. Never exports note/finger vectors, GT data,
 * copyrighted musical events, performer identities or individual cases.
 */
export function compareFingeringEnginesResearch({
 source,playAlong=null,pianoMotion=null,truth,handSize='M'
}={}){
 const err=validateSource(source);
 if(err)return failure(err);
 if(!SIZES.has(handSize))return failure('INVALID_HAND_SIZE');
 const check=validateTruth(source,truth);
 if(check.error)return failure(check.error);
 const result={
  ok:true,method:'fg04c2-score-matched-comparison',
  playAlong:scoreEngine(source,playAlong,check.map,handSize),
  pianoMotion:scoreEngine(source,pianoMotion,check.map,handSize),
  researchOnly:true,productionEligible:false,expertValidated:false
 };
 return result;
}

/**
 * Run only our actual FG-02I solver; return raw candidate rows for a separate
 * comparison call. It does not execute or simulate PianoMotion's Python core.
 * Caller must obtain an independently computed PianoMotion output separately.
 */
export function runExistingPlayAlongFingeringResearch(source,{handSize='M',beamWidth=40}={}){
 const err=validateSource(source);
 if(err)return failure(err);
 if(!SIZES.has(handSize))return failure('INVALID_HAND_SIZE');
 const parts={RH:[],LH:[]};
 for(const n of source)parts[n.hand].push({noteId:n.noteId,pitch:n.pitch,start:n.start,
  duration:n.duration,hand:n.hand,...(anchor(n)!=null?{finger:anchor(n)}:{})});
 const proposed=proposeHybridScoreFingering(parts,{handSize,beamWidth});
 if(!proposed.ok)return failure('PLAY_ALONG_'+proposed.reason);
 return {ok:true,method:proposed.method,
  items:[...proposed.hands.RH,...proposed.hands.LH].map(n=>({
   noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   hand:n.hand,finger:n.finger
  })),researchOnly:true,productionEligible:false};
}
