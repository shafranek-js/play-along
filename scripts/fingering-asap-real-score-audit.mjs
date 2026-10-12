/**
 * FG-04B1b: 16 real piano works (ASAP Dataset, CC BY-NC-SA 4.0).
 * Research only. Never persist or redistribute source MusicXML/MIDI bytes.
 * File integrity is not proof of musical alignment or fingering quality.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectFingeredMidi} from '../src/core/handthesia-midi-alignment.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO='fosfrancesco/asap-dataset';
const REV='afc815c75c42e83a79c03feb6da8a35e77d4c6b8';
const MAX_XML=4_000_000,MAX_MIDI=500_000;
const refuse=x=>{throw Error(x)};
export const realCorpusManifest=()=>JSON.parse(fs.readFileSync(
 path.join(root,'research/fg04b1b-asap-score-manifest.json'),'utf8'));
export function validateRealCorpusManifest(m){
 if(m?.schema!=='fg04b1b-asap-real-score-pairs-v1'||
    m.source?.repository!==REPO||m.source?.revision!==REV||
    m.source?.license!=='CC-BY-NC-SA-4.0'||
    m.source?.usage!=='noncommercial-research-only'||
    !Array.isArray(m.cases)||m.cases.length!==16)refuse('INVALID_ASAP_MANIFEST');
 const ids=new Set(),paths=new Set(),composers=new Set(),focus=new Set();
 for(const c of m.cases){
  if(typeof c?.id!=='string'||!/^[a-z0-9-]{3,60}$/.test(c.id)||
    ids.has(c.id)||typeof c.title!=='string'||c.title.length<5||
    typeof c.composer!=='string'||c.composer.length<3||
    !/^[a-z0-9-]{4,60}$/.test(c.focus??'')||
    c.kind!=='real-piano-score'||c.fingeringGroundTruth!=='unknown')
   refuse('INVALID_ASAP_CASE');
  ids.add(c.id);composers.add(c.composer);focus.add(c.focus);
  const xml=c.musicxml,midi=c.midiScore;
  const dir=xml?.path?.slice(0,-'xml_score.musicxml'.length);
  if(!dir||!/^([A-Za-z0-9_.-]+\/)+$/.test(dir)||
    xml.path!==dir+'xml_score.musicxml'||midi?.path!==dir+'midi_score.mid')
   refuse('INVALID_ASAP_PAIR_PATH');
  for(const [f,limit] of [[xml,MAX_XML],[midi,MAX_MIDI]]){
   if(paths.has(f.path)||!/^[a-f0-9]{40}$/.test(f.blobSha??'')||
     !Number.isInteger(f.bytes)||f.bytes<50||f.bytes>limit)
    refuse('INVALID_ASAP_PAIR_METADATA');
   paths.add(f.path);
  }
 }
 if(composers.size<7||focus.size<10)refuse('INSUFFICIENT_ASAP_DIVERSITY');
 return {realScores:16,sourcePairs:16,composers:composers.size,
  musicalCategories:focus.size,pianistVerifiedFingers:0,
  verifiedHandthesiaOutputs:0,productionAutoFingeringAllowed:false};
}
export function gitBlobHash(data){
 const buf=Buffer.from(data);
 return createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
}
const sha256=data=>createHash('sha256').update(data).digest('hex');
const sourceUrl=f=>'https://raw.githubusercontent.com/'+REPO+'/'+REV+'/'+f.path;
async function downloadPinned(file,{fetcher=globalThis.fetch}={}){
 const url=sourceUrl(file);
 const res=await fetcher(url,{signal:AbortSignal.timeout(40_000),
  headers:{accept:'application/octet-stream'}});
 if(!res?.ok)refuse('ASAP_HTTP_FAILED');
 if(res.url&&res.url!==url)refuse('ASAP_UNPINNED_REDIRECT');
 const declared=Number(res.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_XML)refuse('ASAP_OVERSIZED_DOWNLOAD');
 const raw=Buffer.from(await res.arrayBuffer());
 if(raw.length!==file.bytes||raw.length>MAX_XML)refuse('ASAP_SIZE_MISMATCH');
 if(gitBlobHash(raw)!==file.blobSha)refuse('ASAP_HASH_MISMATCH');
 return {bytes:raw,sha256:sha256(raw)};
}
export async function inspectAsapPair(manifest,entry,{fetcher=globalThis.fetch}={}){
 validateRealCorpusManifest(manifest);
 const exact=manifest.cases.find(x=>x.id===entry?.id);
 if(!exact||JSON.stringify(exact)!==JSON.stringify(entry))refuse('UNPINNED_ASAP_PAIR');
 const [xml,midi]=await Promise.all([exact.musicxml,exact.midiScore]
  .map(f=>downloadPinned(f,{fetcher})));
 const text=new TextDecoder('utf-8',{fatal:true}).decode(xml.bytes);
 // Text-level recognition only. No DTD fetch, external entity or XML import.
 if(!/<score-partwise(?:\s|>)/.test(text)||!/<part(?:\s|>)/.test(text)||
    /<!ENTITY\b/i.test(text))refuse('ASAP_NOT_PARTWISE_SCORE');
 const bytes=midi.bytes;
 if(bytes.length<14||bytes.toString('ascii',0,4)!=='MThd'||
    bytes.readUInt32BE(4)!==6)refuse('ASAP_NOT_STANDARD_MIDI');
 let readiness='READABLE',readinessReason=null,noteCount=null;
 try{noteCount=inspectFingeredMidi(bytes).notes.length}
 catch(e){readiness='NEEDS_ADAPTER_REVIEW';readinessReason=String(e.message).slice(0,100)}
 return {id:exact.id,composer:exact.composer,title:exact.title,focus:exact.focus,
  xml:{path:exact.musicxml.path,size:xml.bytes.length,sha256:xml.sha256,
   noteTags:(text.match(/<note(?:\s|>)/g)||[]).length,
   fingerTags:(text.match(/<fingering(?:\s|>)/g)||[]).length},
  midi:{path:exact.midiScore.path,size:bytes.length,sha256:midi.sha256,
   readiness,readinessReason,noteCount},
  xmlMidiNoteAlignmentProven:false,externalFingerCandidate:false,
  productionAutoFingeringAllowed:false};
}
export async function auditAsapRealCorpus({manifest=realCorpusManifest(),
 fetcher=globalThis.fetch,concurrency=3}={}){
 const scope=validateRealCorpusManifest(manifest);
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)
  refuse('INVALID_ASAP_CONCURRENCY');
 let index=0;
 const result=new Array(manifest.cases.length);
 await Promise.all(Array.from({length:Math.min(concurrency,result.length)},async()=>{
  while(index<result.length){
   const i=index++;
   result[i]=await inspectAsapPair(manifest,manifest.cases[i],{fetcher});
  }
 }));
 const ready=result.filter(x=>x.midi.readiness==='READABLE').length;
 return {schema:'fg04b1b-asap-source-audit-v1',status:'REAL_SCORE_PAIRS_PINNED',
  sourceRevision:REV,license:manifest.source.license,
  usage:'noncommercial-research-only',attribution:manifest.source.attribution,
  scope,verifiedPairs:result.length,xmlBytes:result.reduce((n,x)=>n+x.xml.size,0),
  midiBytes:result.reduce((n,x)=>n+x.midi.size,0),
  midiParserReady:ready,midiParserNeedsReview:result.length-ready,
  xmlMidiSemanticAlignmentVerified:false,pianistFingeringValidated:false,
  handthesiaCandidateOutputs:0,productionAutoFingeringAllowed:false,scores:result};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const report=await auditAsapRealCorpus();
  if(process.env.FG04B1B_REPORT){
   const dest=path.resolve(process.env.FG04B1B_REPORT);
   fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify({status:report.status,scores:report.verifiedPairs,
   composers:report.scope.composers,midiParserReady:report.midiParserReady,
   realFingerLabels:0,automaticTeaching:false},null,2));
 }catch(e){console.error('FG-04B1b source audit failed:',e.message);process.exitCode=1}
}
