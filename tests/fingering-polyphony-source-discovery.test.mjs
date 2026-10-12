import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPianoVAM,sourceReadinessGate,policy}
 from '../scripts/fingering-polyphony-source-discovery.mjs';

const SHA='a'.repeat(40);
const mkFetch=(objects)=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  const response=objects.find(x=>url.includes(x.match));
  if(!response)return {ok:false,status:404,json:async()=>null,
    text:async()=>'',headers:{get:()=>null}};
  return {ok:response.status!==404,status:response.status??200,
   json:async()=>response.data,text:async()=>response.text??'',
   headers:{get:()=>response.bytes??'300'}};
 };
 return {fetcher,calls};
};
const sample=[
 {match:'/api/datasets/PianoVAM/PianoVAM_v1/tree/',data:[
  {type:'file',path:'Fingering_GT/source.csv',size:230}]},
 {match:'/api/datasets/PianoVAM/PianoVAM_v1',data:{
  sha:SHA,cardData:{license:'cc-by-nc-sa-4.0'}}},
 {match:'/resolve/',text:'onset,key_offset,note,finger,hand\n0,1,60,1,RH\n'}
];
test('FG-02J metadata-only source discovery does not claim independently verified alignment',async()=>{
 const {fetcher,calls}=mkFetch(sample);
 const r=await inspectPianoVAM({fetcher});
 assert.equal(r.revision,SHA);
 assert.equal(r.metadataFileCount,1);
 assert.equal(r.sample.format,'.csv');
 assert.equal(r.sample.firstLineColumns[3],'finger');
 assert.equal(r.eligible,false);
 assert.equal(r.perNoteHandFingerReady,false);
 assert.equal(r.polyphonicCoverageVerified,false);
 assert.equal(sourceReadinessGate(r).eligible,false);
 assert(calls.every(x=>x.startsWith('https://huggingface.co/')));
});
test('FG-02J publisher license drift blocks metadata even when fields look usable',async()=>{
 const stub=sample.map(x=>({...x,data:x.data&& !Array.isArray(x.data)?
  {...x.data,cardData:{license:'mit'}}:x.data}));
 assert.equal((await inspectPianoVAM({fetcher:mkFetch(stub).fetcher})).reason,
  'LICENSE_NOT_VERIFIED');
});
test('FG-02J pinned commit mismatch blocks a moved source baseline',async()=>{
 const r=await inspectPianoVAM({fetcher:mkFetch(sample).fetcher,
  expectedRevision:'b'.repeat(40)});
 assert.equal(r.reason,'DATASET_REVISION_CHANGED');
});
test('FG-02J does not silently accept empty ground truth folder',async()=>{
 const stub=sample.map(x=>x.match.includes('/tree/')?{...x,data:[]}:x);
 assert.equal((await inspectPianoVAM({fetcher:mkFetch(stub).fetcher})).reason,
  'NO_PUBLISHED_FINGERING_GROUND_TRUTH_FILES');
});
test('FG-02J large or non-text source never downloaded for discovery',async()=>{
 const stub=sample.map(x=>x.match.includes('/tree/')?
  {...x,data:[{type:'file',path:'Fingering_GT/huge.csv',size:15_000_000}]}:x);
 const {fetcher,calls}=mkFetch(stub);
 const r=await inspectPianoVAM({fetcher});
 assert.equal(r.reason,'NO_BOUNDED_INSPECTABLE_GT_FILE');
 assert.equal(calls.filter(x=>x.includes('/resolve/')).length,0);
});
test('FG-02J source is not even research-eligible without numeric event coverage',()=>{
 const base={revision:SHA,declaredLicense:policy.license,
  perNoteHandFingerReady:true,polyphonicCoverageVerified:true};
 assert.equal(sourceReadinessGate(base).reason,'NOTE_COUNT_OR_COVERAGE_NOT_VERIFIED');
 assert.equal(sourceReadinessGate({...base,sourceNoteCount:12,matchedNoteCount:13}).eligible,false);
 assert.equal(sourceReadinessGate({...base,sourceNoteCount:12,matchedNoteCount:11}).eligible,true);
 assert.equal(sourceReadinessGate({...base,sourceNoteCount:12,matchedNoteCount:11}).productionAllowed,false);
});
test('FG-02J noncommercial licensing is explicit even for research-eligible records',()=>{
 assert.equal(policy.license,'cc-by-nc-sa-4.0');
 assert.match(policy.permittedScope,/noncommercial/);
 assert.equal(policy.noLearnerAutoFingering,true);
 assert.equal(policy.requiresIndependentExpertAdjudication,true);
});
test('FG-02J network errors fail closed and never forge source results',async()=>{
 const r=await inspectPianoVAM({fetcher:async()=>{throw Error('network unavailable')}});
 assert.equal(r.eligible,false);
 assert.equal(r.reason,'SOURCE_METADATA_UNAVAILABLE');
});
