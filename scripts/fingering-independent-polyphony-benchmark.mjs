/**
 * FG-02J externally sourced, strictly covered real polyphonic evaluation.
 * PianoVAM CC BY-NC-SA 4.0: NONCOMMERCIAL RESEARCH ONLY.
 *
 * Annotations are sparse (1,800 GT of ~32,525 original MIDI events).
 * Eligible overlapping-note components contain ALL of their original
 * MIDI events in the GT; incomplete chords are NEVER benchmarked.
 * Per-event original pitch/timing/finger/hand records are not published.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeHybridScoreFingering} from '../src/core/fingering-score-router.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';
import {PINNED_REVISION,EXPECTED_NAMES,fetchBoundedTSV,
 parseTabularTSV,evaluateEventCorrespondence}
 from './fingering-polyphony-alignment-probe.mjs';

const FIELDS=['onset','key_offset','frame_offset','note','velocity'];
const key=r=>FIELDS.map(k=>Number(r[k]).toFixed(6)).join('|');
const isOverlap=(a,b)=>a.start<b.end-.002&&b.start<a.end-.002;
export function bindGTToSource(sourceRows,gtRows){
 const comparison=evaluateEventCorrespondence(sourceRows,gtRows);
 if(comparison.extraGTEvents||comparison.matched!==gtRows.length)
  throw Error('GT_NOT_A_SUBSET_OF_MIDI_EVENTS');
 const pools=new Map(),notes=sourceRows.map((r,i)=>{
  const k=key(r),a=pools.get(k)??[];a.push(i);pools.set(k,a);
  return {id:i,pitch:Number(r.note),start:Number(r.onset),
   duration:Number(r.key_offset)-Number(r.onset),
   end:Number(r.key_offset),annotated:false};
 });
 for(const row of gtRows){
  if(!['L','R'].includes(row.hand)||!['1','2','3','4','5'].includes(row.finger))
   throw Error('UNKNOWN_SOURCE_FINGER_CODING');
  const idx=pools.get(key(row))?.shift();
  if(idx===undefined)throw Error('GT_MIDI_NOTE_AMBIGUOUS');
  notes[idx].annotated=true;
  notes[idx].hand=row.hand==='R'?'RH':'LH';
  notes[idx].finger=Number(row.finger);
 }
 return notes;
}
export function closedPolyphonicIslands(source){
 const sorted=source.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.id-b.id);
 const groups=[],eps=.002;
 let component=[],right=-Infinity;
 const flush=()=>{if(component.length)groups.push(component);component=[];right=-Infinity};
 for(const n of sorted){
  if(component.length&&n.start>=right-eps)flush();
  component.push(n);right=Math.max(right,n.end);
 }
 flush();
 const summary={
  allSourceNotes:source.length,annotatedNotes:source.filter(n=>n.annotated).length,
  totalOverlapComponents:groups.length,closedComponents:0,
  completeAnnotatedNotes:0,polyphonicComponents:0,polyphonicNotes:0,
  skippedPartialGTNotes:0,uncoveredSourceNotes:0,
  duplicateUnisonComponents:0
 };
 const eligible=[];
 for(const group of groups){
  const marked=group.filter(n=>n.annotated);
  if(marked.length!==group.length){
   summary.skippedPartialGTNotes+=marked.length;
   summary.uncoveredSourceNotes+=group.length-marked.length;
   continue;
  }
  summary.closedComponents++;
  summary.completeAnnotatedNotes+=marked.length;
  // Actual concurrently sounding *different physical keys of the same
  // explicitly annotated hand*. Mere RH+LH unison is NOT per-hand polyphony.
  let poly=false,unison=false;
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i],b=group[j];
   if(a.hand!==b.hand||!isOverlap(a,b))continue;
   if(a.pitch===b.pitch){unison=true;continue}
   poly=true;
  }
  if(unison)summary.duplicateUnisonComponents++;
  if(!poly)continue;
  summary.polyphonicComponents++;
  summary.polyphonicNotes+=group.length;
  eligible.push(group);
 }
 return {summary,eligible};
}
export function evaluatePolyphonicGroundTruth(sourceRows,gtRows){
 const source=bindGTToSource(sourceRows,gtRows);
 const {summary,eligible}=closedPolyphonicIslands(source);
 const metrics={eligibleIslands:eligible.length,eligibleNotes:0,
  proposedMatched:0,proposedAccepted:0,proposedRejectedIslands:0,
  pinnedAccepted:0,pinnedRejectedIslands:0,sourceAnchorOverrides:0,
  proposedExactIslands:0,pinnedExactIslands:0,modeledConflicts:0,
  unsafeUnverifiedTransitions:0,
  proposedRejectionReasons:{},pinnedRejectionReasons:{}};
 const details=[];
 for(const [islandIndex,island] of eligible.entries()){
  if(island.length>2500)throw Error('POLYPHONY_COMPONENT_TOO_LARGE');
  const partitions={RH:[],LH:[]},pinned={RH:[],LH:[]};
  for(const n of island){
   const src={pitch:n.pitch,start:n.start,duration:n.duration,
    hand:n.hand,noteId:'g'+islandIndex+'-'+n.id};
   partitions[n.hand].push(src);
   pinned[n.hand].push({...src,finger:n.finger});
  }
  const prediction=proposeHybridScoreFingering(partitions);
  const authored=proposeHybridScoreFingering(pinned);
  metrics.eligibleNotes+=island.length;
  let proposalMatch=0;
  if(prediction.ok){
   const byId=new Map([...prediction.hands.RH,...prediction.hands.LH]
    .map(n=>[n.noteId,n.finger]));
   proposalMatch=island.filter(n=>byId.get('g'+islandIndex+'-'+n.id)===n.finger).length;
   metrics.proposedMatched+=proposalMatch;
   metrics.proposedAccepted+=island.length;
   if(proposalMatch===island.length)metrics.proposedExactIslands++;
   if([...prediction.diagnostics.warnings.RH,...prediction.diagnostics.warnings.LH]
      .some(w=>w.code==='SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED'))
    metrics.unsafeUnverifiedTransitions++;
   for(const h of ['RH','LH']){
    const checked=auditFingeringAssignments(partitions[h],prediction.hands[h]);
    if(!checked.valid)metrics.modeledConflicts++;
   }
  }else{
   metrics.proposedRejectedIslands++;
   metrics.proposedRejectionReasons[prediction.reason]=(metrics.proposedRejectionReasons[prediction.reason]??0)+1;
  }
  let pinnedMatches=0;
  if(authored.ok){
   const byId=new Map([...authored.hands.RH,...authored.hands.LH]
    .map(n=>[n.noteId,n.finger]));
   pinnedMatches=island.filter(n=>byId.get('g'+islandIndex+'-'+n.id)===n.finger).length;
   metrics.pinnedAccepted+=island.length;
   metrics.sourceAnchorOverrides+=island.length-pinnedMatches;
   if(pinnedMatches===island.length)metrics.pinnedExactIslands++;
  }else{
   metrics.pinnedRejectedIslands++;
   metrics.pinnedRejectionReasons[authored.reason]=(metrics.pinnedRejectionReasons[authored.reason]??0)+1;
  }
  // Strict aggregate evidence only. Do not publish raw performer notes,
  // individual source GT finger assignments, or timestamps.
  details.push({islandIndex,notes:island.length,
   hands:{RH:partitions.RH.length,LH:partitions.LH.length},
   proposed:prediction.ok?'ACCEPTED':prediction.reason,
   proposedMatchingNotes:proposalMatch,
   pinned:authored.ok?'ACCEPTED':authored.reason,
   modeledFingerConflicts:prediction.ok?0:null});
 }
 metrics.proposedNoteAgreementPct=metrics.eligibleNotes?
  +(100*metrics.proposedMatched/metrics.eligibleNotes).toFixed(2):null;
 metrics.proposedCoveragePct=metrics.eligibleNotes?
  +(100*metrics.proposedAccepted/metrics.eligibleNotes).toFixed(2):null;
 metrics.pinnedCoveragePct=metrics.eligibleNotes?
  +(100*metrics.pinnedAccepted/metrics.eligibleNotes).toFixed(2):null;
 return {sourceCoverage:summary,metrics,details};
}
export async function runIndependentPolyphonyBenchmark({fetcher=globalThis.fetch}={}){
 const perRecording=[],totals={
  sourceEvents:0,gtEvents:0,eligibleIslands:0,eligibleNotes:0,
  proposedMatched:0,proposedAccepted:0,pinnedAccepted:0,
  proposedRejectedIslands:0,pinnedRejectedIslands:0,
  sourceAnchorOverrides:0,modeledConflicts:0,
  annotatedNotesInIncompleteContext:0,proposedRejectionReasons:{},pinnedRejectionReasons:{}
 };
 for(const name of EXPECTED_NAMES){
  const [ground,raw]=await Promise.all([
   fetchBoundedTSV(PINNED_REVISION,'Fingering_GT',name,fetcher),
   fetchBoundedTSV(PINNED_REVISION,'TSV',name,fetcher)]);
  const gt=parseTabularTSV(ground.data,{annotated:true});
  const tsv=parseTabularTSV(raw.data,{annotated:false});
  const r=evaluatePolyphonicGroundTruth(tsv,gt);
  totals.sourceEvents+=tsv.length;totals.gtEvents+=gt.length;
  for(const k of ['eligibleIslands','eligibleNotes','proposedMatched',
   'proposedAccepted','pinnedAccepted','proposedRejectedIslands',
   'pinnedRejectedIslands','sourceAnchorOverrides','modeledConflicts'])
   totals[k]+=r.metrics[k];
  totals.annotatedNotesInIncompleteContext+=r.sourceCoverage.skippedPartialGTNotes;
  for(const type of ['proposedRejectionReasons','pinnedRejectionReasons'])
   for(const [reason,count] of Object.entries(r.metrics[type]))
    totals[type][reason]=(totals[type][reason]??0)+count;
  perRecording.push({id:name,sourceSha256:raw.sha256,gtSha256:ground.sha256,
   sourceCoverage:r.sourceCoverage,metrics:r.metrics});
 }
 totals.annotatedCoveragePct=+(100*totals.gtEvents/totals.sourceEvents).toFixed(2);
 totals.closedPolyphonicNotePctOfGT=+(100*totals.eligibleNotes/totals.gtEvents).toFixed(2);
 totals.proposedAgreementPct=totals.eligibleNotes?
  +(100*totals.proposedMatched/totals.eligibleNotes).toFixed(2):null;
 totals.agreementWithinAcceptedPct=totals.proposedAccepted?
  +(100*totals.proposedMatched/totals.proposedAccepted).toFixed(2):null;
 totals.pinnedCoveragePct=totals.eligibleNotes?
  +(100*totals.pinnedAccepted/totals.eligibleNotes).toFixed(2):null;
 totals.proposedCoveragePct=totals.eligibleNotes?
  +(100*totals.proposedAccepted/totals.eligibleNotes).toFixed(2):null;
 const verifiedPolyphonicSource=totals.eligibleIslands>0&&totals.eligibleNotes>0;
 return {schema:'fg02j-independent-piano-polyphony-v1',
  source:'PianoVAM/PianoVAM_v1',revision:PINNED_REVISION,
  license:'cc-by-nc-sa-4.0',usage:'NONCOMMERCIAL research, no raw GT redistribution',
  noteProvenance:'GT events individually match the five original TSV key-on/key-offset/pitch/velocity fields; partial original source events are always excluded from incomplete overlap groups.',
  sourceReadyForResearch:verifiedPolyphonicSource,
  evaluationPopulation:'Fully GT-covered physical-key-overlap components containing 2+ distinct held keys in the SAME explicit hand',
  caveat:'Source finger labels are not pianist-consensus teaching gold standards. Unmatched/unsupported groups remain in coverage denominator. Performance-motion crossing and inter-component continuity not adjudicated.',
  totals,perRecording,
  gates:{automaticLearnerFingering:false,independentExpertPedagogyApproved:false,
   commercialDataUseApproved:false}
 };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 let r;
 try{r=await runIndependentPolyphonyBenchmark();}
 catch(e){
  r={schema:'fg02j-independent-piano-polyphony-v1',status:'BLOCKED',
   reason:String(e.message),gates:{automaticLearnerFingering:false}};
 }
 console.log('FG-02J new-source closed polyphonic chord evaluation:',
  JSON.stringify({status:r.status??'COMPUTED_RESEARCH_ONLY',
   reason:r.reason??null,sourceReadyForResearch:r.sourceReadyForResearch??false,
   totals:r.totals??null,gates:r.gates},null,2));
 if(process.env.FG02J_POLYPHONY_REPORT){
  const dest=path.resolve(process.env.FG02J_POLYPHONY_REPORT);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(r,null,2)+'\n');
 }
 console.log('FG-02J production release: NO-GO.');
}
