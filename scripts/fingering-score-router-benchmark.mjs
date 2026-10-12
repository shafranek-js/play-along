/**
 * FG-02I research-only real-piece regression. The 5 hand-annotated Stage 3
 * excerpts were seen in FG-02G/H, so this is RETROSPECTIVE, not a holdout.
 * Strictly reuses the existing pinned revision, source fingerprints, signed
 * finger convention and source licensing. Does not vendor source music.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {corpus,loadRepertoireSource} from './fingering-repertoire-benchmark.mjs';
import {compareContextualToSource} from './fingering-contextual-benchmark.mjs';
import {proposeHybridScoreFingering} from '../src/core/fingering-score-router.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

function count(result,parts,{pinned=false}={}){
 const ref=parts.RH.concat(parts.LH);
 if(!result.ok)return {ok:false,reason:result.reason,
  eligible:ref.length,accepted:0,matched:0,
  warnings:[],conflicts:[],fingerPairs:[]};
 const actual=result.hands.RH.concat(result.hands.LH);
 if(ref.length!==actual.length)throw Error('BENCHMARK_OUTPUT_LENGTH_MISMATCH');
 const audits=['RH','LH'].map(hand=>auditFingeringAssignments(parts[hand],
   result.hands[hand]));
 const issues=audits.flatMap(x=>x.violations);
 const matched=ref.filter((n,i)=>actual[i].finger===n.referenceFinger).length;
 const skipped=ref.filter((n,i)=>pinned&&actual[i].finger!==n.referenceFinger);
 if(skipped.length)throw Error('BENCHMARK_PINNED_OVERRIDE');
 return {ok:true,eligible:ref.length,accepted:ref.length,matched,
  warnings:result.diagnostics.warnings.RH.concat(result.diagnostics.warnings.LH),
  conflicts:issues,
  fingerPairs:ref.map((n,i)=>({
   noteId:n.noteId,hand:n.hand,pitch:n.pitch,
   reference:n.referenceFinger,actual:actual[i].finger,
   provenance:actual[i].source
  })),
  routes:result.methods,segmentCount:result.segments.RH.length+result.segments.LH.length};
}
export function compareHybridToRepertoire(parsed,entry){
 const RH=parsed.notes.filter(n=>n.hand==='RH');
 const LH=parsed.notes.filter(n=>n.hand==='LH');
 const convert=(notes,pinned)=>notes.map(n=>({
  pitch:n.pitch,start:n.start,duration:n.duration,hand:n.hand,noteId:n.noteId,
  ...(pinned?{finger:n.referenceFinger}:{})
 }));
 const parts={RH:convert(RH,false),LH:convert(LH,false)};
 const pinned={RH:convert(RH,true),LH:convert(LH,true)};
 const unannotated=count(proposeHybridScoreFingering(parts),{RH,LH});
 const authored=count(proposeHybridScoreFingering(pinned),{RH,LH},{pinned:true});
 const old=compareContextualToSource(parsed,entry);
 return {
  id:entry.id,notes:parsed.notes.length,
  fg02hSourceMatched:old.fg02h.matched,
  fg02hPinnedCoverage:old.fg02hPinned.attempted,
  hybrid:unannotated,hybridPinned:authored
 };
}
const totals=(cases,field)=>{
 const rows=cases.map(c=>c[field]),matched=rows.reduce((n,x)=>n+x.matched,0);
 const eligible=rows.reduce((n,x)=>n+x.eligible,0),
  accepted=rows.reduce((n,x)=>n+x.accepted,0);
 return {cases:rows.length,eligible,accepted,matched,
  agreementPct:eligible?+(100*matched/eligible).toFixed(2):null,
  coveragePct:eligible?+(100*accepted/eligible).toFixed(2):null,
  modeledConflicts:rows.reduce((n,x)=>n+x.conflicts.length,0),
  warningCount:rows.reduce((n,x)=>n+x.warnings.length,0),
  failedCases:rows.filter(x=>!x.ok).length};
};
export async function runHybridRepertoireBenchmark({download}={}){
 const cases=[];
 for(const entry of corpus.cases){
  const source=await loadRepertoireSource(entry,{download});
  cases.push({...compareHybridToRepertoire(source.parsed,entry),
   sourceSha256:source.sha256,sourceUrl:source.sourceUrl});
 }
 return {
  schema:'fg02i-retrospective-real-piece-v1',
  sourceRevision:corpus.revision,license:corpus.license,
  attribution:corpus.attribution,
  evidence:'Retrospective: corpus already reviewed in FG-02G/H, not independent',
  previous:{
   fg02hMatched:cases.reduce((n,c)=>n+c.fg02hSourceMatched,0),
   fg02hPinnedAccepted:cases.reduce((n,c)=>n+c.fg02hPinnedCoverage,0)
  },
  hybrid:totals(cases,'hybrid'),hybridPinned:totals(cases,'hybridPinned'),
  scope:'This 5-piece corpus has no per-hand chord islands; chord/voice improvements require separate annotated real-polyphony scores and expert review.',
  gates:{productionAutoFingering:false,expertPianistValidated:false,
   independentPolyphonicCorpusPassed:false},
  cases
 };
}
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const r=await runHybridRepertoireBenchmark();
 console.log('FG-02I source fixed revision',r.sourceRevision);
 console.log('FG-02H benchmark baseline',JSON.stringify(r.previous));
 console.log('FG-02I hybrid unannotated',JSON.stringify(r.hybrid));
 console.log('FG-02I hybrid fully authored',JSON.stringify(r.hybridPinned));
 for(const c of r.cases)console.log('FG-02I',c.id,
   'hybrid='+c.hybrid.matched+'/'+c.hybrid.eligible,
   'sourcePinned='+c.hybridPinned.accepted+'/'+c.hybridPinned.eligible,
   'proposedRoute='+JSON.stringify(c.hybrid.routes),
   'warnings='+c.hybrid.warnings.length);
 console.log('FG-02I RELEASE GATE',JSON.stringify(r.gates));
 if(process.env.FG02I_REPORT){
  const file=path.resolve(process.env.FG02I_REPORT);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
 }
}
