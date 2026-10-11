/**
 * FG-02H research comparator: original FG-02G control remains untouched.
 * Reuse its pinned, SHA-checked download and hand segmentation.
 * The Stage 3 sources were previously observed in FG-02G, so results below
 * are retrospective diagnostics, NOT fresh blind predictive accuracy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {corpus,loadRepertoireSource,compareRepertoire} from './fingering-repertoire-benchmark.mjs';
import {partitionMonophonicHand} from '../src/core/fingering-repertoire-pig.mjs';
import {proposeContextualMonophonicFingering} from '../src/core/fingering-contextual.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

function compareRun(run,hand,{anchors=false}={}){
 const input=run.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,
  noteId:n.noteId,hand,...(anchors?{finger:n.referenceFinger}:{})}));
 const t=performance.now(),res=proposeContextualMonophonicFingering(input,{hand});
 const elapsedMs=+(performance.now()-t).toFixed(3);
 if(!res.ok)return {status:'REJECTED',reason:res.reason,
  noteIds:run.map(x=>x.noteId),sourceFingers:run.map(x=>x.referenceFinger),
  notes:run.length,matched:0,elapsedMs};
 const audit=auditFingeringAssignments(input,res.items);
 const actual=res.items.map(x=>x.finger);
 return {status:audit.valid?'COMPARED':'PHYSICAL_CONFLICT',
  notes:run.length,matched:actual.filter((x,i)=>x===run[i].referenceFinger).length,
  noteIds:run.map(x=>x.noteId),sourceFingers:run.map(x=>x.referenceFinger),
  actualFingers:actual,sourceOwned:res.items.filter(x=>x.source==='anchor').length,
  anchorViolations:input.filter((x,i)=>x.finger!=null&&x.finger!==actual[i]).length,
  warnings:res.diagnostics.warnings,boundaries:res.diagnostics.boundaries,
  violations:audit.violations,elapsedMs};
}
function total(runs){
 const answered=runs.filter(x=>x.status==='COMPARED'||x.status==='PHYSICAL_CONFLICT');
 const attempted=answered.reduce((n,r)=>n+r.notes,0);
 const sourceNotes=runs.reduce((n,r)=>n+r.notes,0),matched=answered.reduce((n,r)=>n+r.matched,0);
 const rejected=sourceNotes-attempted;
 return {
  runs:runs.length,sourceNotes,attempted,matched,
  rejectedNotes:rejected,rejectedRuns:runs.length-answered.length,
  exactRuns:answered.filter(x=>x.matched===x.notes).length,
  modeledConflicts:runs.filter(x=>x.status==='PHYSICAL_CONFLICT').length,
  anchorViolations:answered.reduce((n,r)=>n+r.anchorViolations,0),
  unverifiedAnchorSlides:runs.flatMap(x=>x.warnings??[])
   .filter(x=>x.code==='AUTHOR_ANCHOR_SLIDE_UNVERIFIED').length,
  acceptedCoveragePct:sourceNotes?+(100*attempted/sourceNotes).toFixed(2):null,
  overallAgreementPct:sourceNotes?+(100*matched/sourceNotes).toFixed(2):null,
  matchedOfAcceptedPct:attempted?+(100*matched/attempted).toFixed(2):null,
  elapsedMs:+runs.reduce((n,r)=>n+r.elapsedMs,0).toFixed(3)
 };
}
function aggregate(items,which){
 const runs=items.flatMap(x=>x[which].details);
 const s=total(runs);
 return {...s};
}
export function compareContextualToSource(parsed,entry){
 const original=compareRepertoire(parsed,entry);
 const partitions=['RH','LH'].map(hand=>partitionMonophonicHand(parsed.notes,hand));
 const candidateByHand=partitions.map(p=>({
  hand:p.hand,
  unannotated:p.runs.map(r=>compareRun(r,p.hand)),
  pinned:p.runs.map(r=>compareRun(r,p.hand,{anchors:true}))
 }));
 const allUnannotated=candidateByHand.flatMap(h=>h.unannotated);
 const allPinned=candidateByHand.flatMap(h=>h.pinned);
 const candidate=total(allUnannotated),pinned=total(allPinned);
 const eligible=original.segmented.eligibleNotes;
 if(eligible!==candidate.sourceNotes||eligible!==pinned.sourceNotes)
  throw Error('COVERAGE_ACCOUNTING_MISMATCH:'+entry.id);
 return {
  id:entry.id,sourceNotes:parsed.notes.length,
  left:original.noteOwnership.LH,right:original.noteOwnership.RH,
  sourceExcluded:original.segmented.excludedNotes,
  fg02a:original.baseline,fg02f:original.generalized,
  fg02fPinned:original.authorPinned,
  fg02h:candidate,fg02hPinned:pinned,candidateByHand
 };
}
const combine=(cases,key)=>{
 const runs=cases.flatMap(c=>c.candidateByHand.flatMap(h=>h[key]));
 return total(runs);
};
export async function runContextualRepertoireBenchmark({download}={}){
 const cases=[];
 for(const entry of corpus.cases){
  const source=await loadRepertoireSource(entry,{download});
  cases.push({...compareContextualToSource(source.parsed,entry),sha256:source.sha256});
 }
 const previous={
  fg02aMatched:cases.reduce((n,c)=>n+c.fg02a.matched,0),
  fg02fMatched:cases.reduce((n,c)=>n+c.fg02f.matched,0),
  fg02fPinnedAccepted:cases.reduce((n,c)=>n+c.fg02fPinned.attempted,0)
 };
 return {schema:'fg02h-retrospective-repertoire-v1',
  inputCorpus:corpus.repository,revision:corpus.revision,
  license:corpus.license,attribution:corpus.attribution,
  evidence:'RETROSPECTIVE: FG-02G output inspected BEFORE FG-02H; not new independent validation',
  previous,
  fg02h:combine(cases,'unannotated'),
  fg02hPinned:combine(cases,'pinned'),
  gate:{learnerFacingAutoFingering:false,
   professionalReviewComplete:false,
   newProspectiveHoldoutPassed:false,
   physicalFingerIdentificationAvailable:false},
  cases};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const r=await runContextualRepertoireBenchmark();
 console.log('FG-02H ANNOTATED REAL-PIECE SOURCES',r.revision,r.license);
 console.log('FG-02H FG-02G BASELINE',JSON.stringify(r.previous));
 console.log('FG-02H NEW MIXED DIRECTION',JSON.stringify(r.fg02h));
 console.log('FG-02H FULL AUTHOR PINNED',JSON.stringify(r.fg02hPinned));
 for(const c of r.cases){
  console.log('FG-02H',c.id,'new='+c.fg02h.matched+'/'+c.fg02h.sourceNotes,
   'pinned='+c.fg02hPinned.attempted+'/'+c.fg02hPinned.sourceNotes,
   'warningSlips='+c.fg02hPinned.unverifiedAnchorSlides);
 }
 console.log('FG-02H NO-GO',JSON.stringify(r.gate));
 if(process.env.FG02H_REPORT){
  const target=path.resolve(process.env.FG02H_REPORT);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(r,null,2)+'\n');
 }
}
