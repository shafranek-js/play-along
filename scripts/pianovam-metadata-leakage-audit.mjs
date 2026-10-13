/**
 * FG-04B4-R6: exact-revision PianoVAM publisher metadata overlap audit.
 * Original human reviewed 11 performances remain sealed from pseudo pool.
 * Only full-cohort and pilot aggregated metadata overlap counts are emitted.
 * Do not upload pianist names, compositions, raw metadata or event labels.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PINNED_REVISION,EXPECTED_NAMES}
 from './fingering-polyphony-alignment-probe.mjs';
import {treeAtPin} from './pianovam-pseudo-disjoint-pilot.mjs';
import {auditPublisherMetadataDisjointness}
 from '../src/core/pianovam-metadata-leakage-gate.mjs';

const fail=code=>{throw Error('R6_'+code)};
const url='https://huggingface.co/datasets/PianoVAM/PianoVAM_v1/resolve/'+
 PINNED_REVISION+'/metadata.json';
export async function auditPinnedPublisherMetadata({
 fetcher=globalThis.fetch
}={}){
 const [sourceTree,pseudoTree,humanTree,response]=await Promise.all([
  treeAtPin('TSV',fetcher),treeAtPin('Fingering',fetcher),
  treeAtPin('Fingering_GT',fetcher),
  fetcher(url,{signal:AbortSignal.timeout(25000),
   headers:{accept:'application/json,text/plain'}})
 ]);
 if(!response?.ok)fail('PINNED_METADATA_UNAVAILABLE');
 const len=response.headers?.get?.('content-length');
 if(len&&Number(len)>150000)fail('OVERSIZED_PUBLISHER_METADATA');
 const raw=await response.text();
 if(raw.length<100||raw.length>150000)
  fail('INVALID_PINNED_METADATA_SIZE');
 let metadata;
 try{metadata=JSON.parse(raw)}catch{fail('BAD_PINNED_METADATA_JSON')}
 const result=auditPublisherMetadataDisjointness({
  metadata,sourceTree,pseudoTree,humanTree,previouslyInspected:EXPECTED_NAMES
 });
 if(result.sourceCounts.sourceTSVRecords!==107||
    result.sourceCounts.upstreamAutomaticRecords!==106||
    result.referenceHumanGTRecords!==11||
    result.fullPseudoOnlyCohort.recordings!==95||
    result.unchangedEightRecordingPilot.recordings!==8)
  fail('PINNED_PUBLISHER_POPULATION_CHANGED');
 return {
  schema:'fg04b4-r6-publisher-performer-work-leakage-audit-v1',
  source:'PianoVAM/PianoVAM_v1',
  revision:PINNED_REVISION,
  canonicalMetadataSha256:createHash('sha256').update(raw).digest('hex'),
  license:'CC BY-NC-SA 4.0',
  permittedUse:'NONCOMMERCIAL SOURCE RESEARCH ONLY',
  ...result,
  reportExcludesNamesTitlesFilesAndRawMetadata:true,
  independentExpertFingerGroundTruthEstablished:false,
  automaticHandLabelsUsedAsHumanGroundTruth:false,
  action:'DO NOT PROMOTE pseudo-only recordings to independent source GT',
  productionEligible:false
 };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  const report=await auditPinnedPublisherMetadata();
  if(process.env.FG04B4_R6_REPORT){
   const filename=path.resolve(process.env.FG04B4_R6_REPORT);
   fs.mkdirSync(path.dirname(filename),{recursive:true});
   fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
  }
  console.log('FG-04B4-R6 aggregate publisher metadata overlap: ',
   JSON.stringify({originalSource:report.sourceCounts.sourceTSVRecords,
    humanGT:report.referenceHumanGTRecords,
    pseudoOnly:report.fullPseudoOnlyCohort,
    unchangedPilot:report.unchangedEightRecordingPilot,
    referenceMetadataComplete:report.referenceMetadataComplete,
    release:'RESEARCH ONLY, LEARNER NO-GO'},null,2));
 }catch(error){
  console.error('FG-04B4-R6 pinned source metadata audit blocked:',error.message);
  process.exitCode=1;
 }
}
