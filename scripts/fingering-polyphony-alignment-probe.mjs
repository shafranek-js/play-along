/**
 * FG-02J independent-source alignment probe (noncommercial research).
 * Inspect only 11 small annotated TSV files and corresponding MIDI-derived
 * TSV files. Never publish source rows, identity, key-by-key actual fingers.
 * Does NOT mark an unverified hand/finger convention as "ground truth".
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectPianoVAM,sourceReadinessGate,policy}
 from './fingering-polyphony-source-discovery.mjs';

export const PINNED_REVISION='1f039ab9d6128626bff708faad6472d220b50eaa';
const SOURCE_URL='https://huggingface.co/datasets/PianoVAM/PianoVAM_v1/resolve/';
const NAMES=[
 '2024-02-15_20-07-54','2024-02-15_21-40-43','2024-02-15_21-57-38',
 '2024-02-17_21-44-37','2024-02-17_22-33-45','2024-02-22_11-58-09',
 '2024-03-11_22-23-29','2024-04-08_22-49-18','2024-09-02_14-10-41',
 '2024-09-04_19-52-57','2024-09-05_13-25-10'];
export const EXPECTED_NAMES=Object.freeze(NAMES);
const CORE=['onset','key_offset','frame_offset','note','velocity'];
const GT=[...CORE,'hand','finger'];
const EXCLUDE_FROM_REPORT=['note','onset','key_offset','frame_offset','velocity'];
export function parseTabularTSV(source,{annotated}={}){
 if(typeof source!=='string'||source.length>350_000)
  throw Error('TSV_INVALID_SIZE');
 const lines=source.trim().split(/\r?\n/).filter(x=>x.trim());
 const header=lines.shift()?.trim().replace(/^#\s*/,'').split(/\s+/)??[];
 const expected=annotated?GT:CORE;
 if(JSON.stringify(header)!==JSON.stringify(expected))
  throw Error('TSV_UNEXPECTED_SCHEMA:'+header.join(','));
 const out=[];
 for(let i=0;i<lines.length;i++){
  const fields=lines[i].trim().split(/\s+/);
  if(fields.length!==expected.length)throw Error('TSV_UNEXPECTED_FIELD_COUNT:'+i);
  const e=Object.fromEntries(expected.map((k,j)=>[k,fields[j]]));
  for(const k of CORE){
   if(!Number.isFinite(Number(e[k])))throw Error('TSV_NON_NUMERIC_EVENT:'+i+':'+k);
  }
  if(!Number.isInteger(Number(e.note))||Number(e.note)<0||Number(e.note)>127||
   Number(e.onset)<0||Number(e.key_offset)<=Number(e.onset)||
   Number(e.frame_offset)<Number(e.key_offset) - .01)
    throw Error('TSV_INVALID_PHYSICAL_EVENT:'+i);
  if(annotated&&(!e.hand||!e.finger))throw Error('TSV_MISSING_FINGER_OR_HAND:'+i);
  out.push(e);
 }
 return out;
}
const fingerprint=e=>CORE.map(x=>Number(e[x]).toFixed(6)).join('|');
export function evaluateEventCorrespondence(sourceRows,gtRows){
 const pool=new Map();
 for(const e of sourceRows){const k=fingerprint(e);pool.set(k,(pool.get(k)??0)+1)}
 let matched=0,extras=0;
 for(const e of gtRows){
  const k=fingerprint(e),count=pool.get(k)??0;
  if(count){matched++;pool.set(k,count-1)}else extras++;
 }
 const missing=[...pool.values()].reduce((a,b)=>a+b,0);
 return {source:sourceRows.length,groundTruth:gtRows.length,matched,
  missingSourceAnnotations:missing,extraGTEvents:extras,
  bijective:missing===0&&extras===0&&matched===sourceRows.length};
}
function histogram(rows,key){
 const h={};
 for(const r of rows){const val=r[key];h[val]=(h[val]??0)+1}
 return Object.fromEntries(Object.entries(h).sort(([a],[b])=>a.localeCompare(b)));
}
async function fetchBoundedTSV(pinned,folder,name,fetcher){
 const file=folder+'/'+name+'.tsv',
  url=SOURCE_URL+pinned+'/'+file;
 const response=await fetcher(url,{signal:AbortSignal.timeout(25_000),
  headers:{accept:'text/tab-separated-values,text/plain'}});
 if(!response.ok)throw Error('SOURCE_HTTP_'+response.status+':'+folder);
 const data=await response.text();
 if(data.length>350_000)throw Error('SOURCE_TOO_LARGE:'+folder);
 return {data,sha256:createHash('sha256').update(data).digest('hex')};
}
export async function auditPianoVAMAlignment({fetcher=globalThis.fetch,
 discover=inspectPianoVAM}={}){
 const source=await discover({fetcher,expectedRevision:PINNED_REVISION});
 if(!source.revision||source.revision!==PINNED_REVISION||
  source.declaredLicense!==policy.license)
  return {status:'BLOCKED',reason:source.reason??'SOURCE_PRECHECK_FAILED',
   pinnedRevision:PINNED_REVISION,eligibility:sourceReadinessGate(source)};
 const names=source.candidates?.map(x=>x.path)
  .filter(x=>x.startsWith('Fingering_GT/')&&x.endsWith('.tsv'))
  .map(x=>x.slice('Fingering_GT/'.length,-'.tsv'.length))??[];
 if(names.length!==NAMES.length||NAMES.some(x=>!names.includes(x)))
  return {status:'BLOCKED',reason:'PINNED_SOURCE_MANIFEST_CHANGED',
   pinnedRevision:PINNED_REVISION,fileCount:names.length};
 const rows=[],summary={recordings:0,sourceEvents:0,gtEvents:0,
  matchedEvents:0,missingAnnotations:0,extraGTEvents:0};
 for(const name of NAMES){
  let ground,reference;
  try{
   [ground,reference]=await Promise.all([
    fetchBoundedTSV(PINNED_REVISION,'Fingering_GT',name,fetcher),
    fetchBoundedTSV(PINNED_REVISION,'TSV',name,fetcher)
   ]);
  }catch(e){return {status:'BLOCKED',reason:'SOURCE_PAIR_UNAVAILABLE',
   file:name,error:String(e.message),pinnedRevision:PINNED_REVISION,
   processed:summary.recordings};}
  let g,t;
  try{
   g=parseTabularTSV(ground.data,{annotated:true});
   t=parseTabularTSV(reference.data,{annotated:false});
  }catch(e){return {status:'BLOCKED',reason:'INVALID_SOURCE_TSV',
    file:name,error:String(e.message),pinnedRevision:PINNED_REVISION};}
  const m=evaluateEventCorrespondence(t,g);
  const record={
   recording:name,
   gtSha256:ground.sha256,tsvSha256:reference.sha256,
   ...m,handValues:histogram(g,'hand'),
   fingerValues:histogram(g,'finger')
  };
  rows.push(record);summary.recordings++;
  summary.sourceEvents+=m.source;summary.gtEvents+=m.groundTruth;
  summary.matchedEvents+=m.matched;
  summary.missingAnnotations+=m.missingSourceAnnotations;
  summary.extraGTEvents+=m.extraGTEvents;
 }
 const align=rows.every(x=>x.bijective);
 return {status:align?'EVENTS_MATCHED_HAND_CONVENTION_NOT_YET_VALIDATED':
   'BLOCKED',reason:align?'NEEDS_HAND_FINGER_CODING_AND_CHORD_COVERAGE':
   'GROUND_TRUTH_NOT_BIJECTIVE_WITH_TSV',
  pinnedRevision:PINNED_REVISION,license:policy.license,
  summary,recordings:rows,perNoteHandFingerReady:false,
  polyphonicCoverageVerified:false,
  productionAutoFingeringAllowed:false};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const report=await auditPianoVAMAlignment();
 console.log('FG-02J annotation↔MIDI alignment research result:',JSON.stringify({
  status:report.status,reason:report.reason,revision:report.pinnedRevision,
  summary:report.summary,
  handValues:report.recordings?.reduce((all,r)=>{for(const [k,v] of Object.entries(r.handValues))
   all[k]=(all[k]??0)+v;return all},{})??null,
  fingerValues:report.recordings?.reduce((all,r)=>{for(const [k,v] of Object.entries(r.fingerValues))
   all[k]=(all[k]??0)+v;return all},{})??null
 },null,2));
 console.log('FG-02J RELEASE: NO-GO. No learner-facing auto-finger hints.');
 if(process.env.FG02J_ALIGNMENT_REPORT){
  const dest=path.resolve(process.env.FG02J_ALIGNMENT_REPORT);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
 }
}
