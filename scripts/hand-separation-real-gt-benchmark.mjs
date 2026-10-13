/**
 * FG-04B4-R1: real PianoVAM performer RH/LH labels, strict zero-leakage
 * research benchmark. 11 revision-pinned TSV+GT pairs, NC-SA rights.
 *
 * Borrow the already independently tested exact five-field GT-to-source
 * matching and closed overlap population from FG-02J; NEVER copy event-level
 * labels/notes into the report or Play Along's product code.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PINNED_REVISION,EXPECTED_NAMES,parseTabularTSV,fetchBoundedTSV}
 from './fingering-polyphony-alignment-probe.mjs';
import {bindGTToSource,closedPolyphonicIslands}
 from './fingering-independent-polyphony-benchmark.mjs';
import {evaluateExternalHandIslands}
 from '../src/core/hand-separation-external-evaluation.mjs';

const rawKey=r=>['onset','key_offset','frame_offset','note','velocity']
 .map(k=>Number(r[k]).toFixed(6)).join('|');
const count=(target,k,n=1)=>{target[k]=(target[k]??0)+n};
/** Exact duplicate underlying MIDI/TSV event keys cannot identify WHICH
 * source note carries a particular hand label. Erase every such annotation
 * from ALL matching originals before building any eligible chord island.
 * The only allowed resolution is abstention, not arbitrary row order.
 */
export function disqualifyAmbiguousExternalGT(sourceRows,bound){
 if(!Array.isArray(sourceRows)||!Array.isArray(bound)||
  sourceRows.length!==bound.length)throw Error('HAND_GT_SOURCE_COUNT_MISMATCH');
 const counts=new Map();
 for(const r of sourceRows){const k=rawKey(r);counts.set(k,(counts.get(k)||0)+1)}
 const ambiguous=new Set([...counts].filter(([,n])=>n>1).map(([k])=>k));
 let masked=0;
 const notes=bound.map((n,i)=>{
  if(!ambiguous.has(rawKey(sourceRows[i])))return n;
  if(n.annotated)masked++;
  const {annotated,hand,finger,...rest}=n;
  return {...rest,annotated:false};
 });
 return {notes,ambiguousEventGroups:ambiguous.size,ambiguousGTRowsMasked:masked};
}
export async function runRealHandSeparationBenchmark({
 fetcher=globalThis.fetch,handSize='M'
}={}){
 const totals={
  recordings:0,sourceNotes:0,externalGTNotes:0,maskedAmbiguousGT:0,
  GTAlignedToSource:0,closedPolyphonyIslands:0,closedPolyphonyNotes:0,
  partialGTExcluded:0,protocols:{
   unanchored:{},oracleSeeded:{}
  }
 };
 const rec=[];
 const sumKeys=['islands','sourceNotes','anchors','heldout','correct','incorrect',
  'proposed','abstained','anchorViolations','refusedIslands'];
 const merge=(target,from)=>{
  for(const k of sumKeys)target[k]=(target[k]||0)+from[k];
  for(const f of ['refusalReasons','unresolvedReasons']){
   target[f]||={};
   for(const [reason,n] of Object.entries(from[f]))count(target[f],reason,n);
  }
 };
 const pct=(n,d)=>d?+(100*n/d).toFixed(2):null;
 for(const name of EXPECTED_NAMES){
  const [source,ground]=await Promise.all([
   fetchBoundedTSV(PINNED_REVISION,'TSV',name,fetcher),
   fetchBoundedTSV(PINNED_REVISION,'Fingering_GT',name,fetcher)
  ]);
  const raw=parseTabularTSV(source.data,{annotated:false});
  const gt=parseTabularTSV(ground.data,{annotated:true});
  const bound=bindGTToSource(raw,gt);
  const dedup=disqualifyAmbiguousExternalGT(raw,bound);
  const closed=closedPolyphonicIslands(dedup.notes);
  const evaluated=evaluateExternalHandIslands(closed.eligible,{handSize});
  totals.recordings++;
  totals.sourceNotes+=raw.length;
  totals.externalGTNotes+=gt.length;
  totals.GTAlignedToSource+=gt.length;
  totals.maskedAmbiguousGT+=dedup.ambiguousGTRowsMasked;
  totals.closedPolyphonyIslands+=closed.eligible.length;
  totals.closedPolyphonyNotes+=closed.summary.polyphonicNotes;
  totals.partialGTExcluded+=closed.summary.skippedPartialGTNotes;
  for(const protocol of ['unanchored','oracleSeeded'])
   merge(totals.protocols[protocol],evaluated.protocols[protocol]);
  rec.push({
   // No raw performance note rows or ground-truth hand/finger streams.
   recording:name,sourceSha256:source.sha256,gtSha256:ground.sha256,
   sourceNotes:raw.length,externalGTNotes:gt.length,
   ambiguousGTMasked:dedup.ambiguousGTRowsMasked,
   eligibleIslands:closed.eligible.length,
   eligibleNotes:closed.summary.polyphonicNotes,
   protocols:evaluated.protocols
  });
 }
 for(const protocol of ['unanchored','oracleSeeded']){
  const m=totals.protocols[protocol];
  if(m.proposed+m.abstained!==m.heldout||
     m.correct+m.incorrect!==m.proposed||m.anchorViolations!==0)
   throw Error('HAND_GT_BENCHMARK_DENOMINATOR_CORRUPT');
  m.coveragePct=pct(m.proposed,m.heldout);
  m.abstentionPct=pct(m.abstained,m.heldout);
  m.accuracyAmongProposedPct=pct(m.correct,m.proposed);
  m.errorAmongProposedPct=pct(m.incorrect,m.proposed);
  m.correctAmongAllHeldoutPct=pct(m.correct,m.heldout);
  for(const f of ['refusalReasons','unresolvedReasons'])
   m[f]=Object.fromEntries(Object.entries(m[f]||{}).sort());
 }
 totals.externalGTCoveragePct=pct(totals.externalGTNotes,totals.sourceNotes);
 totals.eligibleGTNotePct=pct(totals.closedPolyphonyNotes,totals.externalGTNotes);
 return {
  schema:'fg04b4-real-performer-hand-separation-v1',
  source:'PianoVAM/PianoVAM_v1',revision:PINNED_REVISION,
  license:'CC-BY-NC-SA-4.0',usage:'NONCOMMERCIAL RESEARCH ONLY',
  methods:{
   unanchored:'No GT hand ever given to splitter; all source notes provided without ground-truth labels',
   oracleSeeded:'Reveal first chronologically observed source GT hand per distinct hand per eligible island; evaluate ONLY remaining heldout notes. A source-assisted oracle protocol, not a production hand-discovery method'
  },
  totals,recordings:rec,
  independentExpertPedagogy:false,sourceFingersEvaluated:false,
  biomechanicalMotionEvaluated:false,
  learnerAutomaticHandHintsAllowed:false,
  learnerAutomaticFingeringAllowed:false,
  commercialSourceRedistributionAllowed:false,
  productionEligible:false,researchOnly:true
 };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const r=await runRealHandSeparationBenchmark();
  if(process.env.FG04B4_REAL_HAND_REPORT){
   const dst=path.resolve(process.env.FG04B4_REAL_HAND_REPORT);
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   fs.writeFileSync(dst,JSON.stringify(r,null,2)+'\n');
  }
  console.log('FG-04B4 real performer hand identity research only',
   JSON.stringify({recordings:r.totals.recordings,source:r.totals.sourceNotes,
    GT:r.totals.externalGTNotes,eligible:r.totals.closedPolyphonyNotes,
    unanchored:r.totals.protocols.unanchored,
    oracleSeeded:r.totals.protocols.oracleSeeded,production:false},null,2));
 }catch(e){console.error('FG-04B4 independent hand GT FAILED:',e.message);process.exitCode=1}
}
