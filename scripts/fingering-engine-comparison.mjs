/**
 * Local-only FG-04C2 comparison. Never copies MIDI or hands into the repo.
 * Usage: node scripts/fingering-engine-comparison.mjs local-input.json [original.mid]
 * JSON shape: {source:[...],pianoMotion?:[...],pianoMotionAnalysis?:{...},truth?:[...],handSize?:'M'}
 * Output is anonymous aggregate metrics ONLY, no individual note vectors.
 */
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compareFingeringEnginesResearch as compare,
 runExistingPlayAlongFingeringResearch as runPlayAlong}
 from '../src/core/fingering-engine-comparison.mjs';
import {importPianoMotionAnalysisResearch} from '../src/core/pianomotion-fingering-import.mjs';

const MAX_BYTES=5_000_000;
export async function runLocalComparison(path,originalMidiPath=null){
 if(typeof path!=='string'||!path.trim())
  return {ok:false,reason:'LOCAL_JSON_FILE_REQUIRED'};
 let source;
 try{
  const filepath=resolve(path);
  const info=await stat(filepath);
  if(!info.isFile()||info.size>MAX_BYTES)return {ok:false,reason:'FILE_NOT_SUPPORTED'};
  source=JSON.parse(await readFile(filepath,'utf8'));
 }catch{return {ok:false,reason:'JSON_FILE_UNREADABLE'};}
 if(!source||typeof source!=='object'||Array.isArray(source))
  return {ok:false,reason:'INVALID_BUNDLE'};
 if(source.pianoMotionAnalysis!==undefined&&source.pianoMotion!==undefined)
  return {ok:false,reason:'MIXED_PIANOMOTION_OUTPUT_MODES'};
 let pianoMotion=source.pianoMotion??null,importStatus=null;
 if(source.pianoMotionAnalysis!==undefined){
  if(typeof originalMidiPath!=='string'||!originalMidiPath.trim())
   return {ok:false,reason:'ORIGINAL_MIDI_PATH_REQUIRED'};
  let bytes;
  try{
   const file=resolve(originalMidiPath),meta=await stat(file);
   if(!meta.isFile()||meta.size>4000000)return {ok:false,reason:'MIDI_FILE_NOT_SUPPORTED'};
   bytes=new Uint8Array(await readFile(file));
  }catch{return {ok:false,reason:'ORIGINAL_MIDI_UNREADABLE'};}
  const converted=importPianoMotionAnalysisResearch({
   source:source.source,midiBytes:bytes,analysis:source.pianoMotionAnalysis
  });
  if(!converted.ok)return {ok:false,reason:'PIANOMOTION_IMPORT_'+converted.reason,
   pianoMotionImport:{status:'rejected',reason:converted.reason}};
  pianoMotion=converted.items;
  importStatus={status:'verified',noteCount:converted.noteCount,
   inputSha256:converted.rawMidiSha256};
 }
 const baseline=runPlayAlong(source.source,{handSize:source.handSize??'M'});
 const result=compare({
  source:source.source,
  playAlong:baseline.ok?baseline.items:null,
  pianoMotion,
  truth:source.truth,
  handSize:source.handSize??'M'
 });
 if(!result.ok)return result;
 return {...result,...(importStatus?{pianoMotionImport:importStatus}:{}),playAlong:{
  ...result.playAlong,
  ...(baseline.ok?{}:{status:'not-run',reason:baseline.reason,summary:null})
 }};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=await runLocalComparison(process.argv[2],process.argv[3]);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(!report.ok)process.exitCode=1;
}
