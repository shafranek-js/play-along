import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_NAMES,PINNED_REVISION}
 from '../scripts/fingering-polyphony-alignment-probe.mjs';
import {auditPublisherMetadataDisjointness as audit}
 from '../src/core/pianovam-metadata-leakage-gate.mjs';
import {auditPinnedPublisherMetadata as run}
 from '../scripts/pianovam-metadata-leakage-audit.mjs';

const names=Array.from({length:96},(_,i)=>
 new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10)+'_01-02-03');
const all=[...EXPECTED_NAMES,...names];
const tree=(dir,n)=>n.map(x=>({type:'file',path:dir+'/'+x+'.tsv',size:2000}));
const sample=()=>{
 const metadata={};
 for(let i=0;i<all.length;i++){
  metadata[i]={record_time:all[i],
   P1_name:i<11?(i<6?'Original Performer A':'Original Performer B'):
    'UNSEEN SOURCE '+i,
   P2_name:null,composer:'composer '+i,piece:'work '+i,
   split:i%3===0?'train':i%3===1?'test':'valid',
   performance_method:'Solo'};
 }
 // Multiple distinct risks, all engineered on FICTIONAL SOURCE METADATA.
 metadata[11].P1_name='Original Performer A';                  // shared P only
 metadata[12].composer=metadata[0].composer;metadata[12].piece=metadata[0].piece; // work only
 metadata[13].P1_name='Original Performer B';metadata[13].composer=metadata[2].composer;
 metadata[13].piece=metadata[2].piece;                       // both
 metadata[14].P1_name='unknown';                              // unknown P
 metadata[15].performance_method='4hands';metadata[15].P2_name=null; // unknown P2
 metadata[16].piece=null;                                     // unknown W
 // Next solo performer distinct but a SECOND participant is shared.
 metadata[17].P2_name='Original Performer B';
 return {metadata,
  sourceTree:tree('TSV',all),
  pseudoTree:tree('Fingering',all.slice(0,-1)),
  humanTree:tree('Fingering_GT',EXPECTED_NAMES),
  previouslyInspected:[...EXPECTED_NAMES]};
};
test('R6: canonical 107-source metadata identifies filename-disjoint but shared performers, works and secondary players',()=>{
 const r=audit(sample());
 assert.equal(r.metadataRows,107);
 assert.equal(r.referenceMetadataComplete,true);
 assert.equal(r.fullPseudoOnlyCohort.recordings,95);
 assert.equal(r.fullPseudoOnlyCohort.sharedPerformer,3);
 assert.equal(r.fullPseudoOnlyCohort.sharedWork,2);
 assert.equal(r.fullPseudoOnlyCohort.bothShared,1);
 assert.equal(r.fullPseudoOnlyCohort.performerOnly,2);
 assert.equal(r.fullPseudoOnlyCohort.workOnly,1);
 assert.equal(r.fullPseudoOnlyCohort.unknownPerformer,2);
 assert.equal(r.fullPseudoOnlyCohort.unknownWork,1);
 assert.equal(r.fullPseudoOnlyCohort.unknownEither,3);
 assert.equal(r.fullPseudoOnlyCohort.noExactOverlap,88);
 assert.equal(r.fullPseudoOnlyCohort.claimedIndependentPerformers,0);
 assert.equal(r.externalPerformerIdentityVerified,false);
 assert.equal(r.publisherTrainValidTestAreIndependentPerformers,false);
 assert.equal(r.safeToTrainProductionModel,false);
 assert.equal(r.safeToUseAsIndependentEvaluation,false);
});
test('R6: sorting/order of opaque metadata object keys cannot affect aggregate risk or pilot',()=>{
 const s=sample(),b=structuredClone(s);
 b.metadata=Object.fromEntries(Object.entries(b.metadata).reverse());
 b.humanTree.reverse();b.sourceTree.reverse();b.pseudoTree.reverse();
 assert.deepEqual(audit(s),audit(b));
});
test('R6: publisher train/test distinction cannot hide overlap of SAME performer in other source split',()=>{
 const s=sample();
 const original=audit(s);
 s.metadata[11].split='ext-train';
 const changed=audit(s);
 assert.equal(changed.fullPseudoOnlyCohort.sharedPerformer,original.fullPseudoOnlyCohort.sharedPerformer);
 assert.equal(changed.safeToUseAsIndependentEvaluation,false);
});
test('R6: incompleteness in ANY prior human GT reference prevents independent claims for all candidates',()=>{
 const s=sample();s.metadata[0].piece=null;
 const r=audit(s);
 assert.equal(r.referenceMetadataComplete,false);
 assert.equal(r.fullPseudoOnlyCohort.noExactOverlap,0);
 assert.equal(r.fullPseudoOnlyCohort.unknownEither,95);
 assert.equal(r.safeToUseAsIndependentEvaluation,false);
});
test('R6: multi-performer metadata requires BOTH participants to be known, otherwise unknown rather than an invented solo',()=>{
 const s=sample(),r=audit(s);
 assert.equal(r.fullPseudoOnlyCohort.unknownPerformer,2);
 s.metadata[15].P2_name='Original Performer A';
 const q=audit(s);
 assert.equal(q.fullPseudoOnlyCohort.unknownPerformer,1);
 assert.equal(q.fullPseudoOnlyCohort.sharedPerformer,4);
});
test('R6: missing/extra/duplicated canonical timestamp or source row blocks release entirely',()=>{
 const s=sample();delete s.metadata[106];
 assert.throws(()=>audit(s),/R6_CANONICAL_METADATA_SOURCE_COUNT_MISMATCH/);
 const t=sample();t.metadata[106].record_time=t.metadata[105].record_time;
 assert.throws(()=>audit(t),/R6_INVALID_OR_DUPLICATE_METADATA_RECORD_TIME/);
 const z=sample();z.metadata[105].record_time='2028-01-01_00-00-00';
 assert.throws(()=>audit(z),/R6_MISSING_CANONICAL_SOURCE_METADATA/);
});
test('R6: unexpected reference GT set or missing pseudo partners cannot be hidden using publisher metadata',()=>{
 const s=sample();s.humanTree.push({type:'file',path:'Fingering_GT/'+names[4]+'.tsv'});
 assert.throws(()=>audit(s),/R5_ORIGINAL_MANUAL_GT_SPLIT_MISMATCH/);
 const x=sample();x.sourceTree=x.sourceTree.slice(1);
 assert.throws(()=>audit(x),/R5_SOURCE_OR_GT_NO_PSEUDO_PARTNER/);
});
test('R6: result is an anonymous aggregate, not raw publisher participant or music data',()=>{
 const r=audit(sample()),report=JSON.stringify(r);
 for(const personal of ['Original Performer A','Original Performer B','UNSEEN SOURCE',
  '"P1_name"','"P2_name"','"composer"','"piece"','"record_time"','2025-'])
  assert.ok(!report.includes(personal),personal+' leaked');
 assert.equal(r.unchangedEightRecordingPilot.recordings,8);
 assert.equal(Object.values(r.fullPseudoOnlyCohort.splitCounts).reduce((a,b)=>a+b,0),95);
 assert.equal(Object.values(r.unchangedEightRecordingPilot.splitCounts).reduce((a,b)=>a+b,0),8);
});
test('R6: unknown work values, unknown second performer, unsupported split are counted, not silently called independent',()=>{
 const s=sample();
 s.metadata[17].composer='N/A';
 s.metadata[18].split='secret internal person group';
 const r=audit(s);
 assert.ok(r.fullPseudoOnlyCohort.unknownWork>=2);
 assert.equal(r.fullPseudoOnlyCohort.splitCounts.unrecognized,1);
 assert.equal(r.safeToTrainProductionModel,false);
});
const fake=async(url)=>{
 const s=sample();
 if(url.includes('/tree/')){
  const dir=url.split('/').at(-1).split('?')[0];
  const source={TSV:s.sourceTree,Fingering:s.pseudoTree,
   Fingering_GT:s.humanTree}[dir];
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(source)};
 }
 if(url.includes('/metadata.json'))
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(s.metadata)};
 return {ok:false,status:404};
};
test('R6: end-to-end driver reads exactly ONE canonical metadata file from PINNED revision and original three R5 manifests',async()=>{
 const requests=[];
 const r=await run({fetcher:async url=>{requests.push(url);return fake(url)}});
 assert.equal(r.canonicalMetadataSha256.length,64);
 assert.equal(r.fullPseudoOnlyCohort.recordings,95);
 assert.equal(r.metadataRows,107);
 assert.equal(requests.length,4);
 assert.ok(requests.every(url=>url.includes(PINNED_REVISION)));
 assert.ok(requests.some(url=>url.endsWith('/metadata.json')));
 assert.equal(r.productionEligible,false);
 assert.equal(r.reportExcludesNamesTitlesFilesAndRawMetadata,true);
 assert.equal(r.independentExpertFingerGroundTruthEstablished,false);
});
test('R6: metadata fetch errors or unbounded payload block research rather than asserting zero leakage',async()=>{
 await assert.rejects(run({fetcher:async url=>
  url.includes('metadata.json')?{ok:false,status:503}:fake(url)
 }),/R6_PINNED_METADATA_UNAVAILABLE/);
 await assert.rejects(run({fetcher:async url=>
  url.includes('metadata.json')?{ok:true,headers:{get:()=>200000},
   text:async()=>JSON.stringify(sample().metadata)}:fake(url)
 }),/R6_OVERSIZED_PUBLISHER_METADATA/);
});

test('R7: apparently reference-disjoint candidate performances may repeat the same pianist and work internally',()=>{
 const s=sample();
 // Entries 20/21/22 have no reference collision, but share a performer;
 // 20 and 22 also share the same work in different publisher splits.
 s.metadata[21].P1_name=s.metadata[20].P1_name;
 s.metadata[22].P1_name=s.metadata[20].P1_name;
 s.metadata[22].composer=s.metadata[20].composer;
 s.metadata[22].piece=s.metadata[20].piece;
 const r=audit(s),g=r.internalCandidateCollisions;
 assert.equal(g.candidates,88);
 assert.equal(g.comparedPairs,88*87/2);
 assert.equal(g.samePerformerPairs,3);
 assert.equal(g.sameWorkPairs,1);
 assert.equal(g.bothPairs,1);
 assert.equal(g.candidatesWithAnyInternalCollision,3);
 assert.equal(g.candidatesWithoutDetectedInternalCollision,85);
 assert.ok(g.crossSplitPairs>=1);
 assert.equal(g.verifiedIndependentPerformers,0);
 assert.equal(g.eligibleForLearnerUse,false);
 assert.ok(!JSON.stringify(g).includes('UNSEEN SOURCE'));
});
test('R7: incomplete reference metadata never yields a falsely clean internal candidate pool',()=>{
 const s=sample();s.metadata[0].P1_name=null;
 const g=audit(s).internalCandidateCollisions;
 assert.equal(g.candidates,0);
 assert.equal(g.comparedPairs,0);
 assert.equal(g.verifiedIndependentPerformers,0);
});
