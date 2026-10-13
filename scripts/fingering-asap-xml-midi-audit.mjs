/**
 * FG-04B3b: real ASAP MusicXML-score to MIDI-score compatibility experiment.
 * ASAP CC BY-NC-SA 4.0: noncommercial research only, no raw data persisted.
 *
 * All source bytes are independently verified against immutable Git blob
 * hashes BEFORE parsing. Refusals count as findings, not fake alignments.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {realCorpusManifest,validateRealCorpusManifest,gitBlobHash}
 from './fingering-asap-real-score-audit.mjs';
import {compareRawMusicXmlToScoreMidi} from '../src/core/musicxml-score-midi-bridge.mjs';
import {compareAsapAuditBaseline} from '../src/core/asap-audit-triage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO='fosfrancesco/asap-dataset';
const REV='afc815c75c42e83a79c03feb6da8a35e77d4c6b8';
const fail=reason=>{throw Error(reason)};
const urlOf=f=>'https://raw.githubusercontent.com/'+REPO+'/'+REV+'/'+f.path;

export async function loadVerifiedScorePair(manifest,entry,{fetcher=globalThis.fetch}={}){
 validateRealCorpusManifest(manifest);
 const approved=manifest.cases.find(e=>e.id===entry?.id);
 if(!approved||JSON.stringify(approved)!==JSON.stringify(entry))
  fail('UNAPPROVED_SCORE_PAIR');
 const pull=async f=>{
  const url=urlOf(f);
  const res=await fetcher(url,{signal:AbortSignal.timeout(40000),
   headers:{accept:'application/octet-stream'}});
  if(!res?.ok)fail('SCORE_SOURCE_FETCH_FAILED:'+entry.id);
  if(res.url&&res.url!==url)fail('SCORE_SOURCE_REDIRECT_UNPINNED');
  const declared=Number(res.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>f.bytes)fail('SCORE_SOURCE_OVERSIZED');
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length!==f.bytes||gitBlobHash(bytes)!==f.blobSha)
   fail('SCORE_SOURCE_HASH_OR_SIZE_MISMATCH:'+entry.id);
  return bytes;
 };
 const [xml,midi]=await Promise.all([pull(entry.musicxml),pull(entry.midiScore)]);
 return {xml:new TextDecoder('utf-8',{fatal:true}).decode(xml),midi};
}

export function publicAuditSummary(results){
 if(!Array.isArray(results)||results.length!==16)fail('INCOMPLETE_REAL_SCORE_AUDIT');
 const seen=new Set(),reasons={};
 let aligned=0,rejected=0,validatedXmlNotes=0,validatedMidiNotes=0;
 const cases=[];
 for(const r of results){
  if(!r||typeof r.id!=='string'||seen.has(r.id)||
    !['aligned','rejected'].includes(r.status)||
    r.productionAutoFingeringAllowed!==false)fail('INVALID_AUDIT_RESULT');
  seen.add(r.id);
  if(r.status==='aligned'){
   aligned++;
   validatedXmlNotes+=r.summary?.sourceNoteCount??0;
   validatedMidiNotes+=r.summary?.midiNotes??0;
  }else{
   rejected++;
   if(typeof r.reason!=='string'||!r.reason)fail('UNKNOWN_REJECTION_REASON');
   reasons[r.reason]=(reasons[r.reason]??0)+1;
  }
  // Exclude all note IDs/pitches, original XML/MIDI bytes, and generated
  // fingering proposals from the public research evidence artifact.
  cases.push({id:r.id,status:r.status,reason:r.status==='rejected'?r.reason:null,
   scoreNotes:r.summary?.sourceNoteCount??null,
   midiNotes:r.summary?.midiNotes??null});
 }
 return {schema:'fg04b3b-asap-xml-score-midi-audit-v1',
  status:'ALL_16_PINNED_SCORE_PAIRS_EVALUATED',total:16,aligned,rejected,
  reasons,validatedXmlNotes,validatedMidiNotes,
  noteLevelCoveragePercent:aligned===16?100:null,
  scoreTempoIndependentlyValidated:false,
  allPairsAligned:aligned===16,independentPianistReview:false,
  externalFingeringCandidatesEvaluated:0,
  productionAutoFingeringAllowed:false,cases};
}

export async function auditAsapRawScoreMidi({manifest=realCorpusManifest(),
 fetcher=globalThis.fetch,concurrency=2}={}){
 validateRealCorpusManifest(manifest);
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)
  fail('INVALID_AUDIT_CONCURRENCY');
 const results=new Array(manifest.cases.length);
 let next=0;
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(next<results.length){
   const idx=next++,entry=manifest.cases[idx];
   // Network/content-integrity errors are fatal. Parsing refusals are
   // accurately recorded with reasons and never treated as validation.
   const source=await loadVerifiedScorePair(manifest,entry,{fetcher});
   const comparison=compareRawMusicXmlToScoreMidi(source.xml,source.midi);
   results[idx]={id:entry.id,status:comparison.status,
    reason:comparison.reason,summary:comparison.summary,
    productionAutoFingeringAllowed:comparison.productionAutoFingeringAllowed};
  }
 }));
 const summary=publicAuditSummary(results);
 const baseline=JSON.parse(fs.readFileSync(
  path.join(root,'research/fg04b3c-asap-audit-baseline.json'),'utf8'));
 const triage=compareAsapAuditBaseline(baseline,summary,
  {sourceRevision:manifest.source.revision});
 // Prior successful score cannot disappear quietly under a "green" CI build.
 if(triage.regressions.length)
  fail('ASAP_MUSICAL_ALIGNMENT_REGRESSION:'+triage.regressions.join(','));
 return {...summary,sourceRevision:manifest.source.revision,
  license:manifest.source.license,usage:manifest.source.usage,
  provenance:'ASAP 2020 original MusicXML and score MIDI; no third-party finger data',
  fg04b3cTriage:triage};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const result=await auditAsapRawScoreMidi();
  const reportFile=process.env.FG04B3C_REPORT||process.env.FG04B3B_REPORT;
  if(reportFile){
   const location=path.resolve(reportFile);
   fs.mkdirSync(path.dirname(location),{recursive:true});
   fs.writeFileSync(location,JSON.stringify(result,null,2)+'\n');
  }
  console.log('FG-04B3b real ASAP XML-MIDI study',JSON.stringify({
   total:result.total,aligned:result.aligned,rejected:result.rejected,
   refusalsByReason:result.reasons,
   baselineAligned:result.fg04b3cTriage.baselineAligned,
   newlyAligned:result.fg04b3cTriage.newlyAligned,
   priorAlignmentRegressions:result.fg04b3cTriage.regressions,
   refusalsByFamily:result.fg04b3cTriage.refusalsByFamily,
   // These are approved score identifiers and refusal categories only:
   cases:result.cases.map(({id,status,reason})=>({id,status,reason})),
   learnerAutoFingeringAllowed:false},null,2));
 }catch(e){
  console.error('FG-04B3b SOURCE INTEGRITY FAILURE:',e.message);
  process.exitCode=1;
 }
}
