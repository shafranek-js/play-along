/**
 * P0-A2b: blinded, SOURCE-ID-LOCKED independent reviewer adjudication.
 * This is an offline research workflow, NOT expert evidence by itself.
 * No solver learns/reference-fingers are passed to the source packet.
 * Caller must separately verify reviewer independence, rights and competence.
 */
import {createHash} from 'node:crypto';
const fail=reason=>({ok:false,reason,independentlyValidated:false,productionEligible:false});
const SHA=/^[0-9a-f]{64}$/,ID=/^[a-z0-9][a-z0-9._:-]{0,120}$/i;
const hands=new Set(['RH','LH']),tags=new Set([
 'chord','inversion','arpeggio','thumb-under','repeated-note',
 'held-voice','crossing','fast-passage','wide-span','other'
]);
const finger=n=>Number.isInteger(n)&&n>=1&&n<=5;
const keys=o=>Object.keys(o||{});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const cleanLabels=n=>!['finger','referenceFinger','authorFinger','userFinger','truth',
 'acceptable','expected','groundTruth'].some(k=>own(n,k));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const percent=(n,d)=>d?Math.round(n/d*10000)/100:null;
const permittedTags=v=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(t=>tags.has(t));
export function makeP0A2bBlindPacket(source){
 if(source?.schema!=='p0a2b-curated-source-v1'||!ID.test(source.cohortId||'')||
  !ID.test(source.groupId||'')||!['development','heldout'].includes(source.split)||
  !['supplied-hands','blind-hands'].includes(source.handMode)||
  typeof source.rightsStatus!=='string'||source.rightsStatus!=='verified-by-owner'||
  !SHA.test(source.scoreSha256||'')||
  !Array.isArray(source.notes)||!source.notes.length||source.notes.length>2500)
  return fail('INVALID_OR_UNAUTHORIZED_SOURCE');
 const seen=new Set(),notes=[];
 for(const n of source.notes){
  if(!n||!ID.test(n.noteId||'')||seen.has(n.noteId)||
     !Number.isInteger(n.pitch)||n.pitch<21||n.pitch>108||
     !Number.isFinite(n.start)||n.start<0||
     !Number.isFinite(n.duration)||n.duration<=0||
     !permittedTags(n.tags)||!cleanLabels(n)||
     source.handMode==='supplied-hands'&&!hands.has(n.hand)||
     source.handMode==='blind-hands'&&n.hand!=null)
   return fail('INVALID_OR_LEAKING_SOURCE_NOTE');
  seen.add(n.noteId);
  notes.push({noteId:n.noteId,pitch:n.pitch,start:n.start,
   duration:n.duration,tags:[...n.tags],
   ...(source.handMode==='supplied-hands'?{hand:n.hand}:{})});
 }
 // Finger numbers, reviewer labels and solver predictions are absent.
 const packet={schema:'p0a2b-blind-packet-v1',cohortId:source.cohortId,
  groupId:source.groupId,split:source.split,handMode:source.handMode,
  scoreSha256:source.scoreSha256,notes,rightsStatus:'verified-by-owner',
  containsFingerAnswers:false,containsEnginePredictions:false};
 return {ok:true,packet:{...packet,packetSha256:sha(packet)},
  independentlyValidated:false,productionEligible:false};
}
function validPacket(p){
 if(p?.schema!=='p0a2b-blind-packet-v1'||!SHA.test(p.packetSha256||'')||
    p.containsFingerAnswers!==false||p.containsEnginePredictions!==false||
    !Array.isArray(p.notes)||!p.notes.length||p.notes.length>2500)
  return false;
 const {packetSha256,...unsigned}=p;
 return makeP0A2bBlindPacket({...unsigned,
  schema:'p0a2b-curated-source-v1',
  rightsStatus:p.rightsStatus}).ok&&sha(unsigned)===packetSha256;
}
const token=a=>a.hand+':'+a.finger;
function validateReview(packet,review,role){
 if(review?.schema!=='p0a2b-blind-review-v1'||review.packetSha256!==packet.packetSha256||
  review.cohortId!==packet.cohortId||!ID.test(review.reviewerCode||'')||
  review.role!==role||review.blindToAlgorithms!==true||
  !Array.isArray(review.decisions)||review.decisions.length!==packet.notes.length)
  return null;
 const known=new Set(packet.notes.map(n=>n.noteId)),decisions=new Map();
 for(const d of review.decisions){
  if(!known.has(d?.noteId)||decisions.has(d.noteId)||
    !Array.isArray(d.acceptable)||d.acceptable.length>10||
    d.uncertain!==true&&d.uncertain!==false||
    (d.uncertain&&d.acceptable.length!==0)||
    (!d.uncertain&&!d.acceptable.length)||
    (role==='adjudicator'&&typeof d.rationale!=='string'))
   return null;
  const values=new Set();
  for(const a of d.acceptable){
   if(!hands.has(a?.hand)||!finger(a.finger))return null;
   if(packet.handMode==='supplied-hands'&&
     a.hand!==packet.notes.find(n=>n.noteId===d.noteId).hand)return null;
   if(values.has(token(a)))return null;
   values.add(token(a));
  }
  decisions.set(d.noteId,{acceptable:values,uncertain:d.uncertain,
   rationale:d.rationale??''});
 }
 return decisions;
}
export function adjudicateP0A2b(packet,reviews,{adjudicator=null}={}){
 if(!validPacket(packet))return fail('UNVERIFIED_PACKET');
 if(!Array.isArray(reviews)||reviews.length!==2)return fail('TWO_REVIEWS_REQUIRED');
 const codes=new Set(reviews.map(r=>r?.reviewerCode));
 if(codes.size!==2)return fail('DUPLICATE_REVIEWER');
 const [left,right]=reviews.map(r=>validateReview(packet,r,'independent'));
 if(!left||!right)return fail('INVALID_BLIND_REVIEW');
 if(adjudicator&&(!ID.test(adjudicator.reviewerCode||'')||
    codes.has(adjudicator.reviewerCode)))
  return fail('ADJUDICATOR_NOT_INDEPENDENT');
 const third=adjudicator?validateReview(packet,adjudicator,'adjudicator'):null;
 if(adjudicator&&!third)return fail('INVALID_ADJUDICATION');
 const accepted=new Map();const stats={reviewed:packet.notes.length,
  agreed:0,disputed:0,adjudicated:0,unresolved:0,ambiguousAlternatives:0};
 const reasonCounts={};
 for(const note of packet.notes){
  const a=left.get(note.noteId),b=right.get(note.noteId);
  const overlap=new Set([...a.acceptable].filter(x=>b.acceptable.has(x)));
  let chosen=null;
  if(!a.uncertain&&!b.uncertain&&overlap.size){
   stats.agreed++;
   chosen=overlap;
  }else{
   stats.disputed++;
   const c=third?.get(note.noteId);
   if(c&&!c.uncertain&&c.acceptable.size&&c.rationale.trim().length>=12){
    // Third expert explicitly adjudicates disputed opinions; no automatic
    // majority vote silently changes physical technique variants.
    chosen=c.acceptable;stats.adjudicated++;
   }else{
    stats.unresolved++;
    reasonCounts[c?.uncertain?'THIRD_UNCERTAIN':
     !c?'NO_ADJUDICATOR':'ADJUDICATION_RATIONALE_MISSING']=
     (reasonCounts[c?.uncertain?'THIRD_UNCERTAIN':!c?
       'NO_ADJUDICATOR':'ADJUDICATION_RATIONALE_MISSING']||0)+1;
   }
  }
  if(chosen){accepted.set(note.noteId,chosen);
   if(chosen.size>1)stats.ambiguousAlternatives++;}
 }
 // Return no finger vectors, even in memory, to an aggregate report caller.
 return {ok:true,status:stats.unresolved?'REVIEW_INCOMPLETE':'LABELS_ADJUDICATED',
  stats,reasonCounts,accepted,packetSha256:packet.packetSha256,
  declaredReviewerCount:2+(adjudicator?1:0),
  reviewerIndependenceExternallyVerified:false,
  rightsExternallyVerified:false,independentlyValidated:false,
  productionEligible:false};
}
export function evaluateP0A2bEngines(packet,adjudication,engines){
 if(!validPacket(packet)||!adjudication?.ok||
    adjudication.packetSha256!==packet.packetSha256||
    !(adjudication.accepted instanceof Map))
  return fail('EVALUATION_SOURCE_OR_REVIEW_MISMATCH');
 if(!engines||!Array.isArray(engines.playAlong)||!Array.isArray(engines.pianoMotion))
  return fail('BOTH_ENGINE_OUTPUTS_REQUIRED');
 const lookup=new Map(packet.notes.map(n=>[n.noteId,n])),reviewed=adjudication.accepted;
 const validSource=new Set(packet.notes.map(n=>n.noteId));
 if(adjudication.accepted.size>packet.notes.length||
    [...adjudication.accepted].some(([id,choices])=>
      !validSource.has(id)||!(choices instanceof Set)||!choices.size||
      [...choices].some(choice=>!/^(?:RH|LH):[1-5]$/.test(choice))))
  return fail('INVALID_ADJUDICATED_REFERENCE');
 const results={};
 for(const name of ['playAlong','pianoMotion']){
  const predictions=engines[name],map=new Map();
  if(predictions.length>packet.notes.length)return fail('TOO_MANY_PREDICTIONS');
  for(const p of predictions){
   const n=lookup.get(p?.noteId);
   if(!n||map.has(p.noteId)||p.pitch!==n.pitch||
      Math.abs(p.start-n.start)>0.002||
      Math.abs(p.duration-n.duration)>0.002||
      !hands.has(p.hand)||!(p.finger===null||finger(p.finger))||
      packet.handMode==='supplied-hands'&&p.hand!==n.hand)
    return fail('ENGINE_SOURCE_IDENTITY_OR_HAND_MISMATCH');
   map.set(p.noteId,p);
  }
  const summary={eligible:reviewed.size,proposed:0,abstained:0,
   acceptable:0,disagree:0,byTechnique:{},byHand:{RH:{eligible:0,proposed:0,acceptable:0},
    LH:{eligible:0,proposed:0,acceptable:0}}};
  for(const n of packet.notes){
   const expected=reviewed.get(n.noteId);if(!expected)continue;
   const p=map.get(n.noteId),proposed=!!p&&finger(p.finger);
   const isAccepted=proposed&&expected.has(token(p));
   if(proposed)summary.proposed++;else summary.abstained++;
   if(isAccepted)summary.acceptable++;else if(proposed)summary.disagree++;
   for(const tag of n.tags){
    const stat=summary.byTechnique[tag]??={eligible:0,proposed:0,acceptable:0};
    stat.eligible++;if(proposed)stat.proposed++;if(isAccepted)stat.acceptable++;
   }
   const handsFor=[...expected].map(x=>x.slice(0,2)),expectedHand=
    new Set(handsFor).size===1?handsFor[0]:null;
   if(expectedHand){
    summary.byHand[expectedHand].eligible++;
    if(proposed)summary.byHand[expectedHand].proposed++;
    if(isAccepted)summary.byHand[expectedHand].acceptable++;
   }
  }
  summary.eligible=reviewed.size;
  if(summary.eligible!==summary.proposed+summary.abstained||
     summary.proposed!==summary.acceptable+summary.disagree)
   return fail('SCORING_ACCOUNTING_FAILED');
  summary.coveragePct=percent(summary.proposed,summary.eligible);
  summary.agreementEligiblePct=percent(summary.acceptable,summary.eligible);
  summary.agreementProposedPct=percent(summary.acceptable,summary.proposed);
  results[name]=summary;
 }
 return {ok:true,status:adjudication.status,
  sourceNotes:packet.notes.length,scoredNotes:reviewed.size,
  review:adjudication.stats,engines:results,split:packet.split,
  withheldSet:packet.split==='heldout',
  independentlyValidated:false,productionEligible:false,
  noteFingerVectorsDisclosed:false};
}
export function validateP0A2bStudy(packets){
 if(!Array.isArray(packets)||!packets.length)return fail('NO_COHORT');
 const groups=new Map(),shaSet=new Set(),notes=new Set();
 for(const p of packets){
  if(!validPacket(p))return fail('INVALID_PACKET_IN_STUDY');
  if(shaSet.has(p.scoreSha256)||shaSet.has(p.packetSha256))
   return fail('DUPLICATE_SOURCE_IN_STUDY');
  shaSet.add(p.scoreSha256);shaSet.add(p.packetSha256);
  if(groups.has(p.groupId)&&groups.get(p.groupId)!==p.split)
   return fail('DEVELOPMENT_HELDOUT_GROUP_LEAKAGE');
  groups.set(p.groupId,p.split);
  for(const n of p.notes){
   // Shared literal note IDs may be legitimate inside a piece; across
   // pieces only the tuple (cohortId, noteId) must be unique.
   const k=p.cohortId+':'+n.noteId;
   if(notes.has(k))return fail('DUPLICATE_STUDY_NOTE_ID');
   notes.add(k);
  }
 }
 return {ok:true,packets:packets.length,groups:groups.size,
  development:packets.filter(p=>p.split==='development').length,
  heldout:packets.filter(p=>p.split==='heldout').length,
  independentExpertsAvailable:false,productionEligible:false};
}
