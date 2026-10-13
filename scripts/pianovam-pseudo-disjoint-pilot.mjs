/**
 * FG-04B4-R5 — revision-pinned manifest census and eight independent
 * pseudolabel-only *recording* pilot inspections. NO training/evaluation
 * on the previously studied eleven manual GT recordings.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PINNED_REVISION,EXPECTED_NAMES,fetchBoundedTSV,parseTabularTSV}
 from './fingering-polyphony-alignment-probe.mjs';
import {partitionSourcePseudolabelRecordings,
 inspectPilotSourcePseudoPair,summarizeDisjointPilot}
 from '../src/core/pianovam-pseudo-cohort-gate.mjs';

const API='https://huggingface.co/api/datasets/PianoVAM/PianoVAM_v1/tree/';
const DIRS=['TSV','Fingering','Fingering_GT'];
const error=s=>{throw Error('R5_'+s)};
async function treeAtPin(directory,fetcher){
 const uri=API+PINNED_REVISION+'/'+directory+'?recursive=false&limit=1000';
 const res=await fetcher(uri,{signal:AbortSignal.timeout(25000),
  headers:{accept:'application/json'}});
 if(!res?.ok)error('SOURCE_MANIFEST_UNAVAILABLE:'+directory);
 if(res.headers?.get?.('link')?.includes('rel="next"'))
  error('SOURCE_MANIFEST_PAGINATED:'+directory);
 const text=await res.text();
 if(text.length>300000)error('SOURCE_MANIFEST_TOO_LARGE');
 let parsed;
 try{parsed=JSON.parse(text)}catch{error('BAD_SOURCE_MANIFEST_JSON')}
 if(!Array.isArray(parsed)||parsed.length>1000)error('INVALID_MANIFEST_DATA');
 return parsed;
}
export async function auditDisjointPianoVAMPseudoPilot({
 fetcher=globalThis.fetch,pilotSize=8,
 expectedPilotSourceNotes=null
}={}){
 const [sourceTree,pseudoTree,humanTree]=await Promise.all(
  DIRS.map(d=>treeAtPin(d,fetcher)));
 const partition=partitionSourcePseudolabelRecordings({
  sourceTree,pseudoTree,humanTree,previouslyInspected:EXPECTED_NAMES
 },{pilotSize});
 const counts=[],sha=[];
 for(const name of partition.pilotNames){
  if(EXPECTED_NAMES.includes(name))error('HUMAN_GT_SAMPLE_LEAK');
  const [source,auto]=await Promise.all([
   fetchBoundedTSV(PINNED_REVISION,'TSV',name,fetcher),
   fetchBoundedTSV(PINNED_REVISION,'Fingering',name,fetcher)
  ]);
  const original=parseTabularTSV(source.data,{annotated:false});
  const predicted=parseTabularTSV(auto.data,{annotated:true});
  counts.push(inspectPilotSourcePseudoPair(original,predicted));
  // Only content digests, no source rows, original notes or filenames in
  // emitted report. Internal pilot names are never returned to consumers.
  sha.push({originalTSVSha256:source.sha256,automaticTSVSha256:auto.sha256});
 }
 const totals=summarizeDisjointPilot(counts,partition.report);
 if(expectedPilotSourceNotes!==null&&totals.sourceEvents!==expectedPilotSourceNotes)
  error('PILOT_NOTE_POPULATION_CHANGED');
 return {
  schema:'fg04b4-r5-source-disjoint-pseudolabel-pilot-v1',
  source:'PianoVAM/PianoVAM_v1',revision:PINNED_REVISION,
  license:'CC-BY-NC-SA-4.0',usage:'NONCOMMERCIAL RESEARCH ONLY',
  cohort:partition.report,
  pilot:totals,
  pilotSourceContentSha256:sha,
  sampleIsRepresentativeOfAllPerformers:false,
  labelsManuallyValidatedInPilot:false,
  independentPianistHoldout:false,
  originalGT11EverUsedAsPseudoTraining:false,
  performerDisjointnessEstablished:false,
  commerciallyUsable:false,
  sourceDerivedFingeringAllowedInLearner:false,
  trainableModelCreated:false,
  productionEligible:false,researchOnly:true
 };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  const report=await auditDisjointPianoVAMPseudoPilot();
  if(process.env.FG04B4_R5_REPORT){
   const file=path.resolve(process.env.FG04B4_R5_REPORT);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  }
  console.log('FG-04B4-R5 noncommercial pseudolabel-only disjoint recording census and eight-source exact source pilot:',
   JSON.stringify({cohort:report.cohort,
    pilot:report.pilot,notIndependentGroundTruth:true,
    productionEligible:false},null,2));
 }catch(e){console.error('FG-04B4-R5 source cohort pilot refused:',e.message);process.exitCode=1}
}
