/**
 * FG-04B4-R4 exact-revision raw PianoVAM source TSV + automatic Fingering/
 * + original human Fingering_GT/ contrast. Noncommercial research ONLY.
 * Evaluation uses the ORIGINAL manually reviewed 1,800 labels, not newly
 * trained test labels. Entirely separate from hand splitter/player.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PINNED_REVISION,EXPECTED_NAMES,fetchBoundedTSV,parseTabularTSV}
 from './fingering-polyphony-alignment-probe.mjs';
import {comparePseudoHandLabels,summarizePseudoHandEvidence}
 from '../src/core/hand-pseudolabel-evidence.mjs';

export async function auditPianoVAMAutoHandPseudoLabels({
 fetcher=globalThis.fetch,names=EXPECTED_NAMES,
 expectedSourceNotes=32525,expectedHumanGTNotes=1800
}={}){
 if(!Array.isArray(names)||names.length!==11||
  new Set(names).size!==11||
  EXPECTED_NAMES.some(name=>!names.includes(name)))
  throw Error('R4_UNEXPECTED_HUMAN_GT_HOLDOUT');
 const metrics=[],sources=[];
 for(const name of EXPECTED_NAMES){
  const [source,pseudo,human]=await Promise.all([
   fetchBoundedTSV(PINNED_REVISION,'TSV',name,fetcher),
   fetchBoundedTSV(PINNED_REVISION,'Fingering',name,fetcher),
   fetchBoundedTSV(PINNED_REVISION,'Fingering_GT',name,fetcher)
  ]);
  const original=parseTabularTSV(source.data,{annotated:false});
  const auto=parseTabularTSV(pseudo.data,{annotated:true});
  const manual=parseTabularTSV(human.data,{annotated:true});
  const evaluated=comparePseudoHandLabels(original,auto,manual);
  metrics.push(evaluated);
  sources.push({
   recording:name,sourceSha256:source.sha256,
   automaticFingeringSha256:pseudo.sha256,humanGTSha256:human.sha256,
   sourceRows:original.length,manualGTNumber:manual.length
   // Never release per-recording hand-label errors or sparse raw
   // annotation predictions. Full-sample aggregate only.
  });
 }
 const totals=summarizePseudoHandEvidence(metrics);
 if(totals.manualGTNotes!==expectedHumanGTNotes||totals.sourceNotes!==expectedSourceNotes)
  throw Error('R4_PINNED_SOURCE_POPULATION_CHANGED');
 return {
  schema:'fg04b4-r4-automatic-vs-human-hand-label-evidence-v1',
  source:'PianoVAM/PianoVAM_v1',revision:PINNED_REVISION,
  license:'CC-BY-NC-SA-4.0',usage:'NONCOMMERCIAL RESEARCH ONLY',
  automaticLabelProvenance:'Fingering/ contains VIDEO-DERIVED PSEUDOLABELS, not expert piano fingering ground truth',
  humanLabelProvenance:'Fingering_GT/ contains separately human-reviewed partial source labels, already used in R1/R2',
  population:'11 frozen manual-GT PianoVAM recordings, NOT all 106 automatically labeled recordings',
  totals,recordings:sources,
  pseudoLabelsAreTeacherApproved:false,
  newIndependentRealPerformerHoldout:false,
  metricsCannotBeReusedAsBlindValidation:true,
  expertPianistApproval:false,
  usePseudoLabelsToInferProductionHand:false,
  commercialSourceRedistributionAllowed:false,
  productionEligible:false,researchOnly:true
 };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  const r=await auditPianoVAMAutoHandPseudoLabels();
  if(process.env.FG04B4_R4_REPORT){
   const file=path.resolve(process.env.FG04B4_R4_REPORT);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
  }
  console.log('FG-04B4-R4 source-verified upstream automatic pseudo hands compared to human GT:',
   JSON.stringify({total:r.totals,production:false,automaticModelNotIndependentGT:true},null,2));
 }catch(e){console.error('FG-04B4-R4 exact GT source failure:',e.message);process.exitCode=1}
}
