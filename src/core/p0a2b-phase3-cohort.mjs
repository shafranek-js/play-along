/**
 * P0-A2b Phase 3: honest pre-registration of REAL score screening candidates.
 * This NEVER qualifies music for inference or supplies pianist ground truth.
 * Existing upstream ASAP blob hashes are checked; actual score-byte identity,
 * exact excerpt windows and local rights review remain separate gates.
 */
import {createHash} from 'node:crypto';

const fail=reason=>({ok:false,reason,expertValidated:false,productionEligible:false});
const hex40=/^[a-f0-9]{40}$/;
const id=/^[a-z0-9][a-z0-9-]{2,80}$/;
const hypotheses=new Set(['chord','inversion','arpeggio','thumb-under',
 'repeated-note','held-voice','crossing','wide-span']);
const required=new Set(['chord','inversion','arpeggio','thumb-under',
 'repeated-note','held-voice','crossing']);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function auditP0A2bPhase3Screening(plan,upstream){
 if(plan?.schema!=='p0a2b-phase3-real-score-screening-v1'||
    plan.sourceManifest!=='research/fg04b1b-asap-score-manifest.json'||
    plan.sourceRevision!=='afc815c75c42e83a79c03feb6da8a35e77d4c6b8'||
    plan.license!=='CC-BY-NC-SA-4.0'||
    plan.purpose!=='noncommercial private research candidate screening, not approved expert material'||
    plan.splitPolicy!=='composer-disjoint-frozen-before-algorithm-evaluation'||
    plan.labelsStatus!=='unverified-screening-hypotheses-only'||
    plan.sourceBytesDownloaded!==false||
    plan.musicxmlMidiEventIdentityVerified!==false||
    plan.humanTechniqueScreeningCompleted!==false||
    plan.independentPianistReviews!==0||
    plan.expertAdjudicatedNotes!==0||
    plan.productionEligible!==false)
  return fail('UNVERIFIED_PLAN_OR_FALSE_EVIDENCE');
 if(upstream?.schema!=='fg04b1b-asap-real-score-pairs-v1'||
    upstream.source?.repository!=='fosfrancesco/asap-dataset'||
    upstream.source.revision!==plan.sourceRevision||
    upstream.source.license!==plan.license||
    upstream.source.usage!=='noncommercial-research-only'||
    !Array.isArray(upstream.cases)||upstream.cases.length!==16)
  return fail('UNVERIFIED_UPSTREAM_MANIFEST');
 const upstreamById=new Map();
 for(const row of upstream.cases){
  if(!id.test(row?.id||'')||upstreamById.has(row.id)||
     row.kind!=='real-piano-score'||row.fingeringGroundTruth!=='unknown'||
     !row.composer||!row.title||
     !hex40.test(row.musicxml?.blobSha||'')||
     !hex40.test(row.midiScore?.blobSha||'')||
     !row.musicxml.path.endsWith('/xml_score.musicxml')||
     row.midiScore.path!==row.musicxml.path.replace(/xml_score\.musicxml$/,'midi_score.mid'))
   return fail('INVALID_SOURCE_PIN');
  upstreamById.set(row.id,row);
 }
 if(!Array.isArray(plan.selections)||plan.selections.length!==8)
  return fail('SCREENING_COHORT_SIZE_CHANGED');
 const used=new Set(),byComposer=new Map(),counts={development:0,heldout:0},
  coverage=Object.fromEntries([...hypotheses].map(x=>[x,0]));
 for(const selection of plan.selections){
  const row=upstreamById.get(selection?.caseId);
  if(!row||used.has(row.id)||!['development','heldout'].includes(selection.split)||
     !id.test(selection.groupId||'')||
     selection.groupId!=='composer-'+slug(row.composer)||
     !Array.isArray(selection.techniqueTargets)||
     !selection.techniqueTargets.length||
     selection.techniqueTargets.some(x=>!hypotheses.has(x))||
     new Set(selection.techniqueTargets).size!==selection.techniqueTargets.length||
     Object.keys(selection).some(x=>!['caseId','split','groupId','techniqueTargets'].includes(x)))
   return fail('INVALID_OR_DUPLICATED_SELECTION');
  used.add(row.id);
  if(byComposer.has(row.composer)&&byComposer.get(row.composer)!==selection.split)
   return fail('COMPOSER_DEVELOPMENT_HELDOUT_LEAKAGE');
  byComposer.set(row.composer,selection.split);
  counts[selection.split]++;
  for(const target of selection.techniqueTargets)coverage[target]++;
 }
 if(counts.development!==4||counts.heldout!==4||
    [...required].some(x=>coverage[x]===0))
  return fail('INSUFFICIENT_SPLIT_OR_TECHNIQUE_SCREENING');
 return {
  ok:true,status:'REAL_SCORE_SCREENING_QUEUE_ONLY',
  schema:'p0a2b-phase3-screening-audit-v1',
  planSha256:sha(plan),sourceRevision:plan.sourceRevision,
  candidateRealWorks:used.size,development:counts.development,
  heldout:counts.heldout,composerGroups:byComposer.size,
  targetedCategories:coverage,
  hypothesesNotExpertLabels:true,
  upstreamLicense:'CC-BY-NC-SA-4.0',
  noncommercialResearchOnly:true,
  originalMusicXmlMidiAlignmentVerified:false,
  excerptWindowsCurated:false,
  reviewerIndependenceExternallyVerified:false,
  independentlyReviewedNotes:0,
  algorithmsComparedOnThisCohort:false,
  expertValidated:false,productionEligible:false
 };
}
