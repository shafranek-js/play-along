/**
 * FG-04B4-R6: pinned publisher metadata leakage probe.
 *
 * Deliberately NO raw performer names, compositions, filenames, original
 * event rows, pseudolabels, or per-recording slices in the report.
 * Filename-disjoint recording cohorts are not performer/composition-disjoint.
 * This is research and a SOURCE METADATA overlap check, not an identity
 * verification service or proof of independent ground truth.
 */
import {createHash} from 'node:crypto';
import {partitionSourcePseudolabelRecordings}
 from './pianovam-pseudo-cohort-gate.mjs';

const fail=code=>{throw Error('R6_'+code)};
const fingerprint=value=>createHash('sha256').update(value).digest('hex');
const recording=/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const categories=['train','valid','test','ext-train','special(blurry)','special(4hands)'];
const norm=value=>{
 if(typeof value!=='string')return null;
 const x=value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
 return x&&!['none','unknown','n/a','na','-','undetermined'].includes(x)?x:null;
};
const counted=(obj,key)=>{obj[key]=(obj[key]||0)+1};
const emptyGroup=()=>({
 recordings:0,sharedPerformer:0,sharedWork:0,bothShared:0,
 performerOnly:0,workOnly:0,noExactOverlap:0,
 unknownPerformer:0,unknownWork:0,unknownEither:0,
 claimedIndependentPerformers:0,
 splitCounts:Object.fromEntries(categories.map(x=>[x,0]).concat([['unrecognized',0]]))
});
const sumRow=(tot,r)=>{
 tot.recordings++;
 if(r.sharedPerformer)tot.sharedPerformer++;
 if(r.sharedWork)tot.sharedWork++;
 if(r.sharedPerformer&&r.sharedWork)tot.bothShared++;
 else if(r.sharedPerformer)tot.performerOnly++;
 else if(r.sharedWork)tot.workOnly++;
 if(!r.performerKnown)tot.unknownPerformer++;
 if(!r.workKnown)tot.unknownWork++;
 if(!r.performerKnown||!r.workKnown)tot.unknownEither++;
 if(r.performerKnown&&r.workKnown&&!r.sharedPerformer&&!r.sharedWork)tot.noExactOverlap++;
 counted(tot.splitCounts,r.split);
};
const verify=(g)=>{
 if(g.recordings!==g.bothShared+g.performerOnly+g.workOnly+
  g.recordings-g.bothShared-g.performerOnly-g.workOnly)return fail('INVALID_GROUP_COUNTS');
 if(g.recordings!==Object.values(g.splitCounts).reduce((a,b)=>a+b,0))
  fail('INVALID_METADATA_SPLIT_TOTAL');
 if(g.sharedPerformer!==g.bothShared+g.performerOnly||
    g.sharedWork!==g.bothShared+g.workOnly||
    g.noExactOverlap>g.recordings-g.unknownEither||
    g.claimedIndependentPerformers!==0)fail('INVALID_METADATA_TOTALS');
};
function processOriginalPublisherMetadata(metadata,sourceFiles){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))
  fail('INVALID_CANONICAL_METADATA');
 const values=Object.values(metadata);
 if(values.length!==sourceFiles.length)fail('CANONICAL_METADATA_SOURCE_COUNT_MISMATCH');
 const byName=new Map();
 for(const item of values){
  if(!item||typeof item!=='object'||Array.isArray(item)||
   typeof item.record_time!=='string'||!recording.test(item.record_time)||
   byName.has(item.record_time))fail('INVALID_OR_DUPLICATE_METADATA_RECORD_TIME');
  byName.set(item.record_time,item);
 }
 for(const entry of sourceFiles){
  if(entry?.type!=='file'||typeof entry.path!=='string'||
   !entry.path.startsWith('TSV/')||!entry.path.endsWith('.tsv'))continue;
  const name=entry.path.slice(4,-4);
  if(!byName.has(name))fail('MISSING_CANONICAL_SOURCE_METADATA');
 }
 return byName;
}
const performerKeys=item=>{
 if(!item)return null;
 const primary=norm(item.P1_name),secondary=norm(item.P2_name);
 // An explicitly absent P2 is fine; an unknown P1 is not proof of
 // participant disjointness. Multi-hand performance includes both players.
 if(!primary)return null;
 return [...new Set([primary,...(secondary?[secondary]:[])])];
};
const workKey=item=>{
 const c=norm(item?.composer),p=norm(item?.piece);
 return c&&p?c+'\0'+p:null;
};
const project=item=>{
 const names=performerKeys(item),work=workKey(item);
 const split=categories.includes(item?.split)?item.split:'unrecognized';
 return {performers:names,work,split};
};
/**
 * Original reference is ALWAYS the previously inspected 11 human GT
 * recordings. If a reference performer/piece is unknown, exact disjointness
 * can never be claimed; the entire candidate population abstains.
 *
 * Per-candidate *known* overlaps are recorded without leaking private
 * performer identities or music titles. Absence of an exact match is only
 * "no metadata collision", never a certified new pianist or composition.
 */
export function auditPublisherMetadataDisjointness({
 metadata,sourceTree,pseudoTree,humanTree,previouslyInspected
},{pilotSize=8}={}){
 const gate=partitionSourcePseudolabelRecordings({
  sourceTree,pseudoTree,humanTree,previouslyInspected
 },{pilotSize});
 const originalNames=sourceTree.filter(x=>x?.type==='file'&&
  x.path.startsWith('TSV/')&&x.path.endsWith('.tsv'))
  .map(x=>x.path.slice(4,-4)).sort();
 if(originalNames.length!==gate.report.sourceTSVRecords)
  fail('SOURCE_MANIFEST_IDENTITY_CHANGED');
 const index=processOriginalPublisherMetadata(metadata,sourceTree);
 if(originalNames.length!==index.size)fail('CANONICAL_METADATA_EXTRA_RECORDING');
 const human=new Set(previouslyInspected);
 const autoOnly=pseudoTree.filter(x=>x?.type==='file'&&x.path.startsWith('Fingering/')&&x.path.endsWith('.tsv'))
  .map(x=>x.path.slice('Fingering/'.length,-4))
  .filter(name=>!human.has(name)).sort();
 if(autoOnly.length!==gate.report.pseudolabelOnlyRecordings)
  fail('AUTO_ONLY_MANIFEST_DRIFT');
 const references=previouslyInspected.map(x=>project(index.get(x)));
 const referenceMetadataComplete=references.every(x=>x.performers&&x.work);
 const knownPerformers=new Set(references.flatMap(x=>x.performers??[]));
 const knownWorks=new Set(references.map(x=>x.work).filter(Boolean));
 // We intentionally do not expose any of these strings, nor hashes of
 // dictionary-small performer names/composer/piece labels.
 const view=name=>{
  const d=project(index.get(name));
  const performerKnown=Boolean(d.performers)&&referenceMetadataComplete;
  const workKnown=Boolean(d.work)&&referenceMetadataComplete;
  return {performerKnown,workKnown,
   sharedPerformer:Boolean(d.performers?.some(x=>knownPerformers.has(x))),
   sharedWork:Boolean(d.work&&knownWorks.has(d.work)),split:d.split};
 };
 const entire=emptyGroup(),pilot=emptyGroup();
 for(const name of autoOnly)sumRow(entire,view(name));
 for(const name of gate.pilotNames){
  if(human.has(name)||!autoOnly.includes(name))fail('PILOT_MANUAL_GT_LEAK');
  sumRow(pilot,view(name));
 }
 verify(entire);verify(pilot);
 return {
  schema:'fg04b4-r6-canonical-publisher-metadata-overlap-v1',
  sourceCounts:{
   ...gate.report,
   splitIdentitySha256:gate.report.splitIdentitySha256,
  },
  metadataRows:index.size,
  referenceHumanGTRecords:previouslyInspected.length,
  referenceMetadataComplete,
  fullPseudoOnlyCohort:entire,
  unchangedEightRecordingPilot:pilot,
  metadataNormalization:'NFKC, lowercase, whitespace collapse, exact performer name and composer+piece comparison; no fuzzy identity',
  metadataLevelIndependenceOnly:true,
  externalPerformerIdentityVerified:false,
  compositionEditionIdentityVerified:false,
  publisherTrainValidTestAreIndependentPerformers:false,
  expertGroundTruthOnPseudoOnly:false,
  sourceFingerLabelsAreAuthoritative:false,
  safeToUseAsIndependentEvaluation:false,
  safeToTrainProductionModel:false,
  safeToPublishToLearner:false,
  productionEligible:false,researchOnly:true
 };
}
