/**
 * Local-only FG-04C2 comparison. Never copies MIDI or hands into the repo.
 * Usage: node scripts/fingering-engine-comparison.mjs local-input.json
 * JSON shape: {source:[...],pianoMotion?:[...],truth?:[...],handSize?:'M'}
 * Output is anonymous aggregate metrics ONLY, no individual note vectors.
 */
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {compareFingeringEnginesResearch as compare,
 runExistingPlayAlongFingeringResearch as runPlayAlong}
 from '../src/core/fingering-engine-comparison.mjs';

const MAX_BYTES=5_000_000;
export async function runLocalComparison(path){
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
 const baseline=runPlayAlong(source.source,{handSize:source.handSize??'M'});
 const result=compare({
  source:source.source,
  playAlong:baseline.ok?baseline.items:null,
  pianoMotion:source.pianoMotion??null,
  truth:source.truth,
  handSize:source.handSize??'M'
 });
 if(!result.ok)return result;
 return {...result,playAlong:{
  ...result.playAlong,
  ...(baseline.ok?{}:{status:'not-run',reason:baseline.reason,summary:null})
 }};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
 const report=await runLocalComparison(process.argv[2]);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(!report.ok)process.exitCode=1;
}
