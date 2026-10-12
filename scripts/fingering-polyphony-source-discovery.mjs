/**
 * FG-02J research-only discovery of genuinely independent fingering sources.
 *
 * Never downloads video, audio, user identifiers or an entire dataset.
 * It checks whether source fingering ground truth is actually available
 * and machine-alignable to MIDI notes; otherwise declares NO-GO.
 *
 * Source: PianoVAM v1.1, CC BY-NC-SA 4.0 — noncommercial research only.
 * No such source is used in the production Play Along app.
 */
import fs from 'node:fs';
import path from 'node:path';
const ORIGIN='https://huggingface.co';
const REPO='PianoVAM/PianoVAM_v1';
const API=ORIGIN+'/api/datasets/'+REPO;
const allowedSuffix=/\.(?:csv|tsv|txt|json)$/i;
export const policy={
 source:'PianoVAM',
 url:ORIGIN+'/datasets/'+REPO,
 license:'cc-by-nc-sa-4.0',
 permittedScope:'noncommercial research, subject to upstream terms; no redistribution',
 requiresIndependentExpertAdjudication:true,
 noLearnerAutoFingering:true,
 conditions:['fixed source revision','verified annotation fields',
  'explicit per-note hand and finger','MIDI event alignment',
  'documented source note coverage','overlap coverage','source provenance',
  'no data copying into production']
};
const fail=(reason,extra={})=>({eligible:false,reason,...extra});
const take=()=>({signal:AbortSignal.timeout(25_000),headers:{accept:'application/json'}});
export async function inspectPianoVAM({fetcher=globalThis.fetch,expectedRevision=null}={}){
 const json=async url=>{
  const response=await fetcher(url,take());
  if(!response.ok)throw Error('FETCH_'+response.status+':'+new URL(url).pathname);
  const data=await response.json();
  return data;
 };
 let details;
 try{details=await json(API);}
 catch(e){return fail('SOURCE_METADATA_UNAVAILABLE',{error:String(e.message)});}
 const revision=details.sha;
 if(!/^[0-9a-f]{40}$/.test(revision??''))
  return fail('UNVERIFIED_DATASET_REVISION');
 if(expectedRevision&&revision!==expectedRevision)
  return fail('DATASET_REVISION_CHANGED',{expectedRevision,revision});
 const license=(details.cardData?.license??details.card_data?.license??'').toLowerCase();
 if(license!==policy.license)
  return fail('LICENSE_NOT_VERIFIED',{revision,declaredLicense:license});
 const url=API+'/tree/'+revision+'/Fingering_GT?recursive=false&limit=100';
 let tree;
 try{tree=await json(url);}
 catch(e){return fail('FINGERING_GROUND_TRUTH_DIRECTORY_UNAVAILABLE',{revision,error:String(e.message)});}
 if(!Array.isArray(tree)||!tree.length)
  return fail('NO_PUBLISHED_FINGERING_GROUND_TRUTH_FILES',{revision});
 const files=tree.filter(f=>f.type==='file'&&allowedSuffix.test(f.path??''))
  .map(f=>({path:f.path,size:f.size,lfs:!!f.lfs}))
  .sort((a,b)=>a.path.localeCompare(b.path));
 if(!files.length)return fail('NO_SUPPORTED_FINGERING_GROUND_TRUTH_FILES',{
  revision,entries:tree.map(x=>({name:x.path,type:x.type}))});
 const small=files.find(x=>x.size>0&&x.size<=500_000);
 const result={eligible:false,reason:'SCHEMA_ALIGNMENT_NOT_VERIFIED',
  revision,declaredLicense:license,metadataFileCount:files.length,
  candidates:files,sourceNoteCount:null,matchedNoteCount:null,
  perNoteHandFingerReady:false,polyphonicCoverageVerified:false};
 if(!small)return {...result,reason:'NO_BOUNDED_INSPECTABLE_GT_FILE'};
 // Inspect just one bounded small text source to discover field names,
 // never copy annotated records into GitHub artifacts or application.
 const rawUrl=ORIGIN+'/datasets/'+REPO+'/resolve/'+revision+'/'+
  small.path.split('/').map(encodeURIComponent).join('/');
 let response;
 try{response=await fetcher(rawUrl,{signal:AbortSignal.timeout(25_000),
    headers:{accept:'text/plain'}});
  if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
  if(Number(response.headers?.get?.('content-length')??0)>500_000)
   return {...result,reason:'SAMPLE_TOO_LARGE',samplePath:small.path};
  const raw=await response.text();
  if(raw.length>500_000)return {...result,reason:'SAMPLE_TOO_LARGE',samplePath:small.path};
  const line=raw.split(/\r?\n/).filter(x=>x.trim()).slice(0,2);
  if(small.path.endsWith('.json')){
   const obj=JSON.parse(raw);
   const sample=Array.isArray(obj)?obj[0]:obj;
   const fields=sample&&typeof sample==='object'?
     Object.keys(sample).slice(0,35):[];
   result.sample={path:small.path,format:'json',fields};
  }else{
   // Only emit header columns, length & row estimate. No performance data.
   result.sample={path:small.path,format:path.extname(small.path),
    firstLineColumns:line[0]?.split(/[\t,]/).map(s=>s.trim()).slice(0,30),
    textLines:raw.split(/\r?\n/).length};
  }
 }catch(e){return {...result,reason:'SAMPLE_SCHEMA_INSPECTION_FAILED',
   samplePath:small.path,error:String(e.message)};}
 return result;
}
export function sourceReadinessGate(record){
 const mandatory=['revision','declaredLicense','perNoteHandFingerReady',
  'polyphonicCoverageVerified'];
 if(!record||mandatory.some(x=>record[x]===undefined))
  return fail('INCOMPLETE_SOURCE_EVIDENCE');
 if(record.declaredLicense!==policy.license)
  return fail('LICENSE_NOT_VERIFIED');
 if(!/^[0-9a-f]{40}$/.test(record.revision))
  return fail('UNVERIFIED_DATASET_REVISION');
 if(record.perNoteHandFingerReady!==true||record.polyphonicCoverageVerified!==true)
  return fail('MISSING_VERIFIED_FINGER_TO_MIDI_POLYPHONY_ALIGNMENT');
 if(!Number.isInteger(record.sourceNoteCount)||record.sourceNoteCount<=0||
    !Number.isInteger(record.matchedNoteCount)||record.matchedNoteCount<0||
    record.matchedNoteCount>record.sourceNoteCount)
  return fail('NOTE_COUNT_OR_COVERAGE_NOT_VERIFIED');
 return {eligible:true,reason:'DATASET_STRUCTURALLY_ELIGIBLE_FOR_RESEARCH_ONLY',
  productionAllowed:false};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(direct){
 const r=await inspectPianoVAM({
  expectedRevision:process.env.FG02J_PINNED_SOURCE_REVISION??null
 });
 console.log('FG-02J independent annotated polyphony source discovery:');
 console.log(JSON.stringify(r,null,2));
 console.log('FG-02J source readiness:',JSON.stringify(sourceReadinessGate(r)));
 console.log('FG-02J release decision: NO-GO. Research only; no production automatic finger hints.');
 if(process.env.FG02J_DISCOVERY_REPORT){
  const dest=path.resolve(process.env.FG02J_DISCOVERY_REPORT);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify({policy,discovery:r,
   sourceGate:sourceReadinessGate(r)},null,2)+'\n');
 }
}
