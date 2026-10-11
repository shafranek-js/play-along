/**
 * FG-02G research-only benchmark for short, hand-annotated real-piece excerpts.
 * Source files fetched from fixed Hugging Face commit; not stored in repo.
 * Dataset: Piano Protege Curriculum stage3_pieces (CC BY-SA 4.0).
 * The fingering labels were hand-authored by the dataset contributor, not
 * adjudicated as uniquely optimal by independent pianist evaluators.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parsePIGFingering,partitionMonophonicHand} from '../src/core/fingering-repertoire-pig.mjs';
import {proposeMonophonicFingering} from '../src/core/fingering-dp.mjs';
import {proposeGeneralizedMonophonicFingering} from '../src/core/fingering-generalized.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const corpus=JSON.parse(fs.readFileSync(path.join(root,'research/fg02g-repertoire-manifest.json'),'utf8'));
const BASE='https://huggingface.co/datasets/riyaranjan/piano-protege-curriculum/resolve/';
const ORIGIN='https://huggingface.co';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function loadRepertoireSource(entry,{download=globalThis.fetch}={}){
 // Reject arbitrary URLs even if a source manifest were modified. Only the
 // pinned revision, validated stage3 path and official domain are eligible.
 if(!/^[0-9a-f]{40}$/.test(corpus.revision)||
   !/^stage3_pieces\/piece_[a-z0-9_]+\.fingering\.txt$/.test(entry.path))
  throw Error('SOURCE_MANIFEST_INVALID:'+entry.id);
 const link=BASE+corpus.revision+'/'+entry.path;
 let failure;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await download(link,{
    redirect:'follow',signal:AbortSignal.timeout(20_000),
    headers:{accept:'text/plain'}
   });
   if(!response.ok)throw Error('SOURCE_FETCH_HTTP_'+response.status);
   if(!response.url.startsWith(ORIGIN)&&
      // Small HF text files normally remain on huggingface.co; strict pin
      // and content validation still apply after a signed CDN redirect.
      !/^https:\/\/(?:cdn-lfs(?:-[a-z-]+)?\.huggingface\.co|cas-bridge\.xethub\.hf\.co)\//.test(response.url))
    throw Error('UNEXPECTED_SOURCE_REDIRECT');
   const text=await response.text();
   const digest=createHash('sha256').update(text,'utf8').digest('hex');
   const parsed=parsePIGFingering(text,{sourceId:entry.id});
   if(parsed.notes.length!==entry.expectedNotes)
    throw Error('SOURCE_NOTE_COUNT_CHANGED:'+entry.id+
     ':expected='+entry.expectedNotes+':actual='+parsed.notes.length);
   return {parsed,sha256:digest,sourceUrl:link,license:corpus.license};
  }catch(e){
   failure=e;
   // Only transport failures are retried. Bad source contents or a changed
   // note count are hard errors: never silently replace gold labels.
   if(/^(SOURCE_NOTE_COUNT_CHANGED|INVALID_PIG|UNSUPPORTED_PIG|DUPLICATE_PIG|NON_MONOTONIC_PIG|EMPTY_PIG|INVALID_PITCH|PITCH_OUT_OF_RANGE|SOURCE_MANIFEST_INVALID)/.test(String(e.message)))
    break;
   if(attempt<2)await delay(500*(attempt+1));
  }
 }
 throw Error('SOURCE_UNAVAILABLE:'+entry.id+':'+String(failure?.message));
}
const forEngine=(runs,hand,pinned,engine)=>{
 let attempted=0,matched=0,exactRuns=0,computedRuns=0,rejectedRuns=0,anchorViolations=0,
 physicalConflicts=0,elapsedMs=0;
 const details=[];
 for(const run of runs){
  const input=run.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,
   hand,noteId:n.noteId,...(pinned?{finger:n.referenceFinger}:{})}));
  const start=performance.now();
  const r=engine==='baseline'?
   proposeMonophonicFingering(input,{hand,handSize:'M'}):
   proposeGeneralizedMonophonicFingering(input,{hand,handSize:'M'});
  elapsedMs+=performance.now()-start;
  const noteIds=run.map(n=>n.noteId),reference=run.map(n=>n.referenceFinger);
  if(!r.ok){
   rejectedRuns++;
   details.push({noteIds,reference,status:'REJECTED',reason:r.reason,
    strategy:'none',actual:null});
   continue;
  }
  const independent=auditFingeringAssignments(input,r.items,{handSize:'M'});
  const actual=r.items.map(n=>n.finger);
  attempted+=run.length;
  computedRuns++;
  const matches=actual.filter((n,i)=>n===reference[i]).length;
  matched+=matches;
  if(matches===run.length)exactRuns++;
  if(!independent.valid)physicalConflicts++;
  if(pinned&&actual.some((n,i)=>n!==reference[i]))anchorViolations++;
  details.push({noteIds,reference,actual,
   status:independent.valid?'COMPARED':'PHYSICAL_CONFLICT',
   strategy:r.strategy??'original-fg02a',matched:matches,notes:run.length,
   audit:independent.violations});
 }
 return {attempted,matched,exactRuns,computedRuns,rejectedRuns,anchorViolations,
  physicalConflicts,elapsedMs:+elapsedMs.toFixed(3),details};
};
const combine=sets=>{
 const names=['attempted','matched','exactRuns','computedRuns','rejectedRuns','anchorViolations','physicalConflicts'];
 const summary=Object.fromEntries(names.map(k=>[k,sets.reduce((s,x)=>s+x[k],0)]));
 summary.matchPercent=summary.attempted?+(100*summary.matched/summary.attempted).toFixed(2):null;
 summary.elapsedMs=+sets.reduce((s,x)=>s+x.elapsedMs,0).toFixed(3);
 return summary;
};
export function compareRepertoire(parsed,entry){
 const partitions=['RH','LH'].map(hand=>partitionMonophonicHand(parsed.notes,hand));
 const baseline=partitions.map(p=>forEngine(p.runs,p.hand,false,'baseline'));
 const generalized=partitions.map(p=>forEngine(p.runs,p.hand,false,'generalized'));
 const pinned=partitions.map(p=>forEngine(p.runs,p.hand,true,'generalized'));
 const sourceNotes=parsed.notes.length;
 const excluded=partitions.flatMap(p=>p.skipped);
 const considered=partitions.reduce((n,p)=>n+p.runs.flat().length,0);
 if(sourceNotes!==considered+excluded.length)
  throw Error('SEGMENT_ACCOUNTING_ERROR:'+entry.id);
 return {
  id:entry.id,label:entry.label,sourceNotes,
  noteOwnership:{RH:partitions[0].total,LH:partitions[1].total},
  segmented:{runs:partitions.reduce((s,x)=>s+x.runs.length,0),
   eligibleNotes:considered,excludedNotes:excluded.length,exclusions:excluded,
   fullCorpusCoveragePct:+(100*considered/sourceNotes).toFixed(2)},
  baseline:combine(baseline),generalized:combine(generalized),
  authorPinned:combine(pinned),
  byHand:partitions.map((p,i)=>({hand:p.hand,total:p.total,
   eligible:p.runs.flat().length,excluded:p.skipped.length,
   baseline:baseline[i],generalized:generalized[i],authorPinned:pinned[i]}))
 };
}
const sumMetrics=(cases,name)=>{
 const keys=['attempted','matched','computedRuns','rejectedRuns','physicalConflicts',
  'anchorViolations','exactRuns'];
 const r=Object.fromEntries(keys.map(k=>[k,cases.reduce((n,c)=>n+c[name][k],0)]));
 r.matchPct=r.attempted?+(100*r.matched/r.attempted).toFixed(2):null;
 return r;
};
export async function runRepertoireBenchmark({download}={}){
 const cases=[];
 for(const entry of corpus.cases){
  const source=await loadRepertoireSource(entry,{download});
  const result=compareRepertoire(source.parsed,entry);
  cases.push({...result,sha256:source.sha256,sourceUrl:source.sourceUrl,license:source.license});
 }
 const annotated=cases.reduce((n,c)=>n+c.sourceNotes,0);
 const excluded=cases.reduce((n,c)=>n+c.segmented.excludedNotes,0);
 const stats={pieces:cases.length,annotatedNotes:annotated,
  benchmarkableNotes:annotated-excluded,excludedNotes:excluded,
  coveragePct:+(100*(annotated-excluded)/annotated).toFixed(2),
  baseline:sumMetrics(cases,'baseline'),generalized:sumMetrics(cases,'generalized'),
  authorPinned:sumMetrics(cases,'authorPinned')};
 return {
  schema:'fg02g-real-piece-v1',license:corpus.license,attribution:corpus.attribution,
  pinnedRevision:corpus.revision,
  methodologicalCaveat:'Small Stage 3 hand-authored arrangements: no independent pianist panel. Note accuracy is exact agreement with THIS source, not unique physical/pedagogical truth.',
  scope:'Strict monophonic runs segmented from BOTH HANDS, no guessed hand/pitch. Chords/overlap and short fragments explicitly excluded and counted.',
  stats,cases,
  gate:{allowProductionAutoFingering:false,
   humanJudgedAccuracy:false,fullRepertoireValidated:false,
   completePolyphonicCoverage:false}
 };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const r=await runRepertoireBenchmark();
 console.log('FG-02G SOURCE/ATTRIBUTION',r.license,r.pinnedRevision);
 console.log('FG-02G FIVE REAL-PIECE REPORT',JSON.stringify(r.stats));
 for(const c of r.cases){
  console.log('FG-02G',c.id,'notes='+c.sourceNotes,'RH='+c.noteOwnership.RH,
   'LH='+c.noteOwnership.LH,'eligible='+c.segmented.eligibleNotes,
   'skipped='+c.segmented.excludedNotes,'sha256='+c.sha256);
  console.log(' FG-02A:',JSON.stringify(c.baseline));
  console.log(' FG-02F:',JSON.stringify(c.generalized));
  console.log(' FG-02F pinned:',JSON.stringify(c.authorPinned));
 }
 console.log('FG-02G GATE',JSON.stringify(r.gate));
 if(process.env.FG02G_REPORT){
  const dest=path.resolve(process.env.FG02G_REPORT);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(r,null,2)+'\n');
 }
 console.log('FG-02G DECISION: RESEARCH_ONLY. NO automatic Play Along finger hints.');
}
