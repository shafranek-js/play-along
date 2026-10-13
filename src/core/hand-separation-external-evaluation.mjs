/**
 * FG-04B4-R1 — independent REAL performer hand-label evaluation.
 * NONCOMMERCIAL research only (PianoVAM CC BY-NC-SA 4.0).
 *
 * No labels for held-out notes are given to separateHandsResearch.
 * This does not validate finger correctness, joint motion or teaching.
 * Return aggregate counts/reasons only, NEVER copied GT event data.
 */
import {separateHandsResearch} from './fingering-hand-separation.mjs';

const HANDS=new Set(['LH','RH']);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=code=>{throw Error(code)};
const bump=(x,k)=>{x[k]=(x[k]||0)+1};
const empty=()=>Object.create(null);
/* Fixed, non-adaptive research categories. They depend ONLY on note timings,
 * pitches and explicit oracle-seed identity; never hidden GT hand/finger.
 * A protocol's axes are separate marginals, NOT mutually exclusive totals.
 */
const AXES=Object.freeze({
 attackTexture:['simultaneous-onset','staggered-onset'],
 islandSize:['2-3','4-7','8+'],
 exposedHandAnchors:['none','one','both'],
 nearestExposedAnchorPitch:['none','0-4-semitones','5-12-semitones','13+-semitones'],
 heldSamePitchOverlap:['overlapping-physical-key','no-overlapping-physical-key']
});
const outcomes=['heldout','proposed','correct','incorrect','abstained'];
const counter=()=>({heldout:0,proposed:0,correct:0,incorrect:0,abstained:0});
export const externalHandDiagnosticAxes=Object.freeze(
 Object.fromEntries(Object.entries(AXES).map(([key,values])=>[key,[...values]]))
);
const initDiagnostics=()=>Object.fromEntries(Object.entries(AXES).map(([axis,values])=>[
 axis,Object.fromEntries(values.map(value=>[value,counter()]))
]));
const diagnosticCategories=(island,anchors,index)=>{
 const n=island[index],starts=new Map(),onset=n.start;
 for(const event of island)starts.set(event.start,(starts.get(event.start)||0)+1);
 const seedPitches=[...anchors].map(i=>island[i].pitch);
 const distance=seedPitches.length?Math.min(...seedPitches.map(p=>Math.abs(p-n.pitch))):null;
 const physicalOverlap=island.some((o,j)=>j!==index&&o.pitch===n.pitch&&
  o.start<n.start+n.duration-1e-6&&n.start<o.start+o.duration-1e-6);
 const handKinds=new Set([...anchors].map(i=>island[i].hand));
 return {
  attackTexture:(starts.get(onset)||0)>=2?'simultaneous-onset':'staggered-onset',
  islandSize:island.length<=3?'2-3':island.length<=7?'4-7':'8+',
  exposedHandAnchors:handKinds.size===0?'none':handKinds.size===1?'one':'both',
  nearestExposedAnchorPitch:distance===null?'none':
   distance<=4?'0-4-semitones':distance<=12?'5-12-semitones':'13+-semitones',
  heldSamePitchOverlap:physicalOverlap?'overlapping-physical-key':'no-overlapping-physical-key'
 };
};
const scoreDiagnostics=(stats,island,anchors,index,outcome)=>{
 if(!['proposed-correct','proposed-incorrect','abstained'].includes(outcome))
  fail('INVALID_DIAGNOSTIC_OUTCOME');
 for(const [axis,key] of Object.entries(diagnosticCategories(island,anchors,index))){
  const bucket=stats.diagnosticAxes[axis]?.[key];
  if(!bucket)fail('INVALID_DIAGNOSTIC_CATEGORY');
  bucket.heldout++;
  if(outcome==='abstained')bucket.abstained++;
  else{
   bucket.proposed++;
   if(outcome==='proposed-correct')bucket.correct++;
   else bucket.incorrect++;
  }
 }
};
const aggregate=()=>({
 islands:0,sourceNotes:0,anchors:0,heldout:0,
 correct:0,incorrect:0,proposed:0,abstained:0,
 anchorViolations:0,refusedIslands:0,refusalReasons:empty(),
 unresolvedReasons:empty(),wrongDirection:{'predicted-RH-actual-LH':0,'predicted-LH-actual-RH':0},
 diagnosticAxes:initDiagnostics()
});
const safeId=(id,i)=>'eval-'+i+'-'+id;
function validateIsland(island){
 if(!Array.isArray(island)||!island.length||island.length>2500)
  fail('INVALID_EXTERNAL_GT_ISLAND');
 const ids=new Set();
 for(const n of island){
  if(!Number.isInteger(n.id)||n.id<0||ids.has(n.id)||
   !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
   !finite(n.start)||n.start<0||!finite(n.duration)||n.duration<=0||
   !HANDS.has(n.hand)||!Number.isInteger(n.finger)||n.finger<1||n.finger>5||
   n.annotated!==true)
   fail('UNVERIFIED_EXTERNAL_HAND_LABEL');
  ids.add(n.id);
 }
}
function originalNotes(island,anchors){
 return island.map((n,i)=>({
  noteId:safeId(n.id,i),pitch:n.pitch,start:n.start,duration:n.duration,
  // This field is sourced EXCLUSIVELY from a specifically exposed GT anchor.
  ...(anchors.has(i)?{authorHand:n.hand}:{})
 }));
}
/** First chronologically observed ground-truth note for each hand is
 * revealed as ONE oracle seed. This is explicitly a separate, assisted
 * research protocol; it is not independent MIDI-only hand separation.
 */
function earliestPerHand(island){
 const indices=[...island.keys()].sort((a,b)=>island[a].start-island[b].start||
  island[a].pitch-island[b].pitch||island[a].id-island[b].id);
 const hands=new Set(),out=new Set();
 for(const i of indices){
  if(!hands.has(island[i].hand)){out.add(i);hands.add(island[i].hand)}
 }
 return out;
}
function record(result,island,anchors,stats){
 stats.islands++;stats.sourceNotes+=island.length;
 stats.anchors+=anchors.size;stats.heldout+=island.length-anchors.size;
 if(result.ok!==true){
  stats.refusedIslands++;
  bump(stats.refusalReasons,result.reason||'UNSPECIFIED_REFUSAL');
  stats.abstained+=island.length-anchors.size;
  for(let i=0;i<island.length;i++)if(!anchors.has(i))
   scoreDiagnostics(stats,island,anchors,i,'abstained');
  return;
 }
 if(!Array.isArray(result.items)||result.items.length!==island.length)
  fail('INVALID_CANDIDATE_RESULT_SHAPE');
 const noteIds=new Set();
 for(let i=0;i<result.items.length;i++){
  const item=result.items[i],expected=safeId(island[i].id,i);
  if(!item||item.noteId!==expected||noteIds.has(item.noteId))
   fail('MISMATCHED_PREDICTION_SOURCE_ID');
  noteIds.add(item.noteId);
  if(anchors.has(i)){
   if(item.status!=='fixed'||item.hand!==island[i].hand){
    stats.anchorViolations++;
    fail('EXPOSED_GT_ANCHOR_CHANGED');
   }
   continue;
  }
  if(item.status==='proposed'){
   if(!HANDS.has(item.hand)||item.source!=='research')
    fail('UNAUTHORIZED_SOURCE_HAND_PROPOSAL');
   stats.proposed++;
   if(item.hand===island[i].hand){
    stats.correct++;
    scoreDiagnostics(stats,island,anchors,i,'proposed-correct');
   }else{
    stats.incorrect++;
    const key=item.hand==='RH'?'predicted-RH-actual-LH':'predicted-LH-actual-RH';
    stats.wrongDirection[key]++;
    scoreDiagnostics(stats,island,anchors,i,'proposed-incorrect');
   }
  }else if(item.status==='unknown'&&item.hand===null){
   stats.abstained++;
   scoreDiagnostics(stats,island,anchors,i,'abstained');
   bump(stats.unresolvedReasons,item.reason||'UNSPECIFIED_ABSTENTION');
  }else fail('UNAUTHORIZED_UNSEEDED_GT_LABEL');
 }
}
const pct=(num,den)=>den?+(100*num/den).toFixed(2):null;
function finalize(stats){
 if(stats.heldout!==stats.proposed+stats.abstained||
  stats.proposed!==stats.correct+stats.incorrect||
  Object.values(stats.wrongDirection).reduce((a,b)=>a+b,0)!==stats.incorrect)
  fail('INVALID_EVALUATION_DENOMINATOR');
 for(const categories of Object.values(stats.diagnosticAxes)){
  const total=counter();
  for(const bucket of Object.values(categories)){
   if(bucket.heldout!==bucket.proposed+bucket.abstained||
      bucket.proposed!==bucket.correct+bucket.incorrect)
    fail('INVALID_DIAGNOSTIC_DENOMINATOR');
   for(const key of outcomes)total[key]+=bucket[key];
  }
  if(outcomes.some(k=>total[k]!==stats[k]))
   fail('INVALID_DIAGNOSTIC_MARGINAL_TOTAL');
 }
 return {
  ...stats,
  coveragePct:pct(stats.proposed,stats.heldout),
  abstentionPct:pct(stats.abstained,stats.heldout),
  accuracyAmongProposedPct:pct(stats.correct,stats.proposed),
  errorAmongProposedPct:pct(stats.incorrect,stats.proposed),
  correctAmongAllHeldoutPct:pct(stats.correct,stats.heldout),
  refusalReasons:Object.fromEntries(Object.entries(stats.refusalReasons).sort()),
  unresolvedReasons:Object.fromEntries(Object.entries(stats.unresolvedReasons).sort())
 };
}
/**
 * Evaluate previously verified fully annotated, concurrently held same-hand
 * islands with two protocols: (1) zero GT anchors (true MIDI-only hand ID);
 * (2) at most one revealed source-hand label per hand (ORACLE ASSISTED).
 *
 * The same-held-note GT is used only after candidate output to score it.
 * Source fingers are NEVER used by either candidate, even for anchors.
 */
export function evaluateExternalHandIslands(islands,{handSize='M'}={}){
 if(!Array.isArray(islands)||islands.length>10000)
  fail('INVALID_EXTERNAL_GT_POPULATION');
 const noAnchor=aggregate(),oracleSeeded=aggregate();
 for(const island of islands){
  validateIsland(island);
  // Freeze labels ONLY in the output comparator; the solver sees a new
  // minimal object which has no finger, GT hand or annotation flags.
  record(separateHandsResearch(originalNotes(island,new Set()),{handSize}),
   island,new Set(),noAnchor);
  const anchors=earliestPerHand(island);
  record(separateHandsResearch(originalNotes(island,anchors),{handSize}),
   island,anchors,oracleSeeded);
 }
 return {
  schema:'fg04b4-real-hand-label-benchmark-v1',
  scope:'Fully GT-covered held-key polyphony islands only; not all performance notes',
  protocols:{
   unanchored:{...finalize(noAnchor),description:'True no-source-hand-label baseline'},
   oracleSeeded:{...finalize(oracleSeeded),
    description:'One original external hand label per observed hand given to the solver; source-assisted upper bound, not automatic hand discovery'}
  },
  independentlyVerifiedFingerAccuracy:null,
  physicalMotionAccuracy:null,
  expertPedagogyApproved:false,
  productionEligible:false,researchOnly:true
 };
}
