/**
 * FG-04B4-R3: INDEPENDENT, ORIGINAL SYNTHETIC hypothesis falsification.
 * - The piano hand separator is FROZEN (not trained or tuned here).
 * - Synthetic "truthHand" is authored by engineers, NOT pianist GT.
 * - Held-out truth NEVER enters the algorithm or structural classification.
 * - A model refusing a path is NOT a proof of physical impossibility.
 * - No note-level export, learner integration or licensed PianoVAM data.
 */
import {separateHandsResearch} from './fingering-hand-separation.mjs';

const SID='fg04b4-r3-independent-engineering-challenges-v1';
const HANDS=new Set(['RH','LH']);
const FAMILIES=new Set(['one-hand-anchor','two-hand-anchor','source-conflict','unanchored']);
const ERROR='INVALID_INDEPENDENT_SYNTHETIC_CHALLENGE';
const assert=(condition)=>{if(!condition)throw Error(ERROR)};
const count=(obj,key)=>{obj[key]=(obj[key]||0)+1};
const blank=()=>({cases:0,notes:0,anchors:0,heldout:0,
 proposed:0,correct:0,incorrect:0,abstained:0,modelNoFeasibleCases:0,
 modelNoFeasibleWithoutStructuralCertificate:0,
 structurallyAmbiguousCases:0,widerBeamChangedVerdict:0,
 largerHandChangedVerdict:0,diagnostics:{}});
const scoreSummary=(r,truth,anchors)=>{
 if(!r?.ok||!Array.isArray(r.items)||r.items.length!==truth.length)
  throw Error('SYNTHETIC_SOLVER_IDENTITY_FAILURE');
 const scored={proposed:0,correct:0,incorrect:0,abstained:0,heldout:0,anchors:anchors.size};
 for(let i=0;i<r.items.length;i++){
  const item=r.items[i];
  if(item.noteId!=='independent-'+i)throw Error('SYNTHETIC_RESULT_ID_CHANGED');
  if(anchors.has(i)){
   if(item.status!=='fixed'||item.hand!==truth[i])
    throw Error('SYNTHETIC_SOURCE_ANCHOR_CHANGED');
   continue;
  }
  scored.heldout++;
  if(item.status==='proposed'){
   assert(HANDS.has(item.hand)&&item.source==='research');
   scored.proposed++;
   if(item.hand===truth[i])scored.correct++;
   else scored.incorrect++;
  }else{
   if(item.status!=='unknown'||item.hand!==null)
    throw Error('SYNTHETIC_UNVERIFIED_HAND_PROPOSED');
   scored.abstained++;
  }
 }
 if(scored.heldout!==scored.proposed+scored.abstained||
    scored.proposed!==scored.correct+scored.incorrect)
  throw Error('SYNTHETIC_DENOMINATOR_MISMATCH');
 return scored;
};
/** Necessary **elementary two-hand, ten-finger model** constraints only.
 * True / false results are structural counterexamples or ambiguity flags,
 * never a certification of human physical reach or practical fingering.
 */
export function structuralHandModelWitness(sourceNotes){
 assert(Array.isArray(sourceNotes)&&sourceNotes.length>0&&sourceNotes.length<=128);
 const edges=new Set();
 for(const n of sourceNotes){
  assert(Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&
   Number.isFinite(n.start)&&n.start>=0&&
   Number.isFinite(n.duration)&&n.duration>0);
  edges.add(n.start);edges.add(n.start+n.duration);
 }
 const ticks=[...edges].sort((a,b)=>a-b),witnesses=new Set();
 let peakKeys=0,peakAnchoredLH=0,peakAnchoredRH=0;
 for(let i=0;i<ticks.length-1;i++){
  const t=(ticks[i]+ticks[i+1])/2;
  const active=sourceNotes.filter(n=>n.start<=t&&n.start+n.duration>t);
  if(!active.length)continue;
  peakKeys=Math.max(peakKeys,active.length);
  if(active.length>10)witnesses.add('MORE_THAN_TEN_SIMULTANEOUS_EVENTS');
  if(new Set(active.map(n=>n.pitch)).size!==active.length)
   witnesses.add('CONCURRENT_SAME_PHYSICAL_KEY');
  const a=active.filter(n=>n.authorHand==='LH').length;
  const b=active.filter(n=>n.authorHand==='RH').length;
  peakAnchoredLH=Math.max(peakAnchoredLH,a);
  peakAnchoredRH=Math.max(peakAnchoredRH,b);
  if(a>5||b>5)witnesses.add('MORE_THAN_FIVE_ANCHORED_KEYS_IN_ONE_HAND');
 }
 return {codes:[...witnesses].sort(),peakSimultaneousEvents:peakKeys,
  peakAnchoredLH,peakAnchoredRH,
  physicalHumanFeasibilityCertified:false,
  noContradictionDoesNotProveFeasible:true};
}
export function inspectHandSeparationSyntheticCase(testCase){
 assert(testCase&&typeof testCase.id==='string'&&testCase.id.length<100&&
  /^[a-z0-9-]+$/.test(testCase.id)&&FAMILIES.has(testCase.family)&&
  Array.isArray(testCase.events)&&testCase.events.length>0&&
  testCase.events.length<=128);
 const notes=[],truth=[],anchors=new Set();
 for(let i=0;i<testCase.events.length;i++){
  const e=testCase.events[i];
  assert(e&&HANDS.has(e.truthHand)&&typeof e.anchor==='boolean');
  const n={noteId:'independent-'+i,pitch:e.pitch,
   start:e.start,duration:e.duration};
  if(e.anchor){n.authorHand=e.truthHand;anchors.add(i)}
  notes.push(n);truth.push(e.truthHand);
 }
 // The only input to the solver or our pre-outcome witness is the original
 // pitch/time/duration and the explicitly revealed source anchor hand.
 // A truth-hand relabeling with fixed anchors must not change these results.
 const witness=structuralHandModelWitness(notes);
 const base=separateHandsResearch(notes);
 const wider=separateHandsResearch(notes,{beamWidth:128});
 const larger=separateHandsResearch(notes,{handSize:'XXL'});
 const scored=scoreSummary(base,truth,anchors);
 const outcome=r=>r.ok?r.diagnostics?.[0]?.code||'PATH_EVALUATED':r.reason||'INVALID_INPUT';
 const ordinary=outcome(base);
 const noPath=ordinary==='NO_FEASIBLE_HAND_PATH';
 return {id:testCase.id,family:testCase.family,
  notes:notes.length,anchors:anchors.size,scored,
  heldout:scored.heldout,proposed:scored.proposed,
  correct:scored.correct,incorrect:scored.incorrect,abstained:scored.abstained,
  witness,sourceStructuralFlags:witness.codes,
  witnessedStructuralConflict:witness.codes.length>0,
  solverVerdict:ordinary,modelNoFeasible:noPath,
  modelNoFeasibleWithoutStructuralCertificate:noPath&&witness.codes.length===0,
  widerBeamChangedVerdict:outcome(wider)!==ordinary,
  largerHandChangedVerdict:outcome(larger)!==ordinary,
  independentRealPerformerGroundTruth:false,
  physicalHumanFeasibilityCertified:false,
  source:'ORIGINAL_SYNTHETIC_ONLY',productionEligible:false};
}
export function evaluateIndependentHandStructuralChallenges(manifest){
 assert(manifest?.schema===SID&&manifest.externalSourceGTAllowed===false&&
  manifest.rights==='CC0-1.0 for these original fictional event fixtures'&&
  Array.isArray(manifest.cases)&&manifest.cases.length===15);
 const seen=new Set(),sum=blank(),families={};
 const cases=[];
 for(const c of manifest.cases){
  assert(!seen.has(c.id));seen.add(c.id);
  const r=inspectHandSeparationSyntheticCase(c);
  cases.push(r);
  const bins=[sum,(families[c.family]??=blank())];
  for(const b of bins){
   b.cases++;
   b.notes+=r.notes;b.anchors+=r.anchors;
   for(const name of ['heldout','proposed','correct','incorrect','abstained'])
    b[name]+=r.scored[name];
   if(r.modelNoFeasible)b.modelNoFeasibleCases++;
   if(r.modelNoFeasibleWithoutStructuralCertificate)
    b.modelNoFeasibleWithoutStructuralCertificate++;
   if(r.witnessedStructuralConflict)b.structurallyAmbiguousCases++;
   if(r.widerBeamChangedVerdict)b.widerBeamChangedVerdict++;
   if(r.largerHandChangedVerdict)b.largerHandChangedVerdict++;
   count(b.diagnostics,r.solverVerdict);
  }
 }
 for(const bucket of [sum,...Object.values(families)]){
  if(bucket.proposed+bucket.abstained!==bucket.heldout||
   bucket.correct+bucket.incorrect!==bucket.proposed)
   throw Error('SYNTHETIC_AUDIT_DENOMINATOR_MISMATCH');
  bucket.diagnostics=Object.fromEntries(Object.entries(bucket.diagnostics).sort());
 }
 // Do NOT publish source pitch, note/timing, raw predictions, or hidden
 // authored ground-truth hands; even here the fixture is CC0 original.
 const cleaned=cases.map(x=>{
  const {scored,witness,...safe}=x;
  return {...safe,heldout:scored.heldout,proposed:scored.proposed,
   correct:scored.correct,incorrect:scored.incorrect,abstained:scored.abstained,
   sourceStructuralFlags:witness.codes};
 });
 return {schema:'fg04b4-r3-structural-falsification-v1',
  originalFixtureSource:manifest.source,
  comparator:'unchanged-FG-04B4-beam-search',
  sourceLicence:'CC0-1.0-original-synthetic-fixtures',
  groundTruthKind:'ENGINEERING_CONSTRUCTED_NOT_REAL_PERFORMER',
  totals:sum,families:Object.fromEntries(Object.entries(families).sort()),cases:cleaned,
  comparedCandidateAlternativesOnly:'beamWidth=128 and handSize=XXL; sensitivity only, never chosen as optimal',
  physicalHumanFeasibilityCertified:false,professionalPianistValidated:false,
  autonomousLearnerHandHintsEnabled:false,automaticFingerHintsEnabled:false,
  productionEligible:false,researchOnly:true};
}
