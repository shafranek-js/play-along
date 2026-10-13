/**
 * FG-04C2: invoke owner's actual PianoMotion core from a LOCAL authorized
 * checkout, without copying/adapting its source into Play Along.
 * node scripts/fg04c2-run-pianomotion.mjs PM/python-core original.mid analysis.json
 */
import {existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const PYTHON_RUN="import hashlib\nimport json\nimport os\nfrom pathlib import Path\nimport sys\ncore=Path(sys.argv[1]).resolve(strict=True)\nsource=Path(sys.argv[2]).resolve(strict=True)\nout=Path(sys.argv[3]).resolve()\nsys.path.insert(0,str(core))\nfrom handthesia_core.api import analyze_midi\ndata=source.read_bytes()\nsha=hashlib.sha256(data).hexdigest()\nresult=analyze_midi(data,{\n    \"fixtureId\":\"fg04c2-private-comparison\",\n    \"projectId\":\"play-along-fg04c2\",\n    \"revision\":0,\n    \"requestId\":\"fg04c2-local\",\n    \"engineVersion\":\"from-pianomotion-source-manifest\",\n    \"sampleTimes\":[],\n})\nraw=result.get(\"rawBaseline\",{})\nif result.get(\"status\")==\"invalid\" or result.get(\"fingeringPlan\") is None:\n    raise ValueError(\"PianoMotion did not produce a fingering plan\")\nif raw.get(\"inputSha256\")!=sha or raw.get(\"status\")!=\"loaded\":\n    raise ValueError(\"PianoMotion original MIDI hash mismatch or repaired source\")\npayload=json.dumps(result,ensure_ascii=False,separators=(\",\",\":\")).encode(\"utf-8\")\nfd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)\ntry:\n    with os.fdopen(fd,\"wb\") as stream:\n        stream.write(payload)\nexcept BaseException:\n    out.unlink(missing_ok=True)\n    raise\nprint(\"Actual PianoMotion analysis saved locally;\",len(result[\"document\"][\"notes\"]),\"notes; SHA-256:\",sha)";
const help='Usage: node scripts/fg04c2-run-pianomotion.mjs /path/to/pianomotion-studio/python-core original.mid analysis.json';
export function runPianoMotionLocally(args,{python=process.env.PYTHON||'python'}={}){
 if(!Array.isArray(args)||args.length!==3)return {ok:false,reason:'THREE_PATHS_REQUIRED'};
 const [core,midi,out]=args.map(p=>typeof p==='string'?resolve(p):'');
 if(!core||!midi||!out||out===midi)return {ok:false,reason:'INVALID_PATHS'};
 if(!existsSync(resolve(core,'handthesia_core','api.py'))||
    !existsSync(resolve(core,'handthesia_core','source_manifest.json')))
  return {ok:false,reason:'PIANOMOTION_CORE_NOT_FOUND'};
 if(!['.mid','.midi'].includes(extname(midi).toLowerCase()))
  return {ok:false,reason:'ORIGINAL_MIDI_REQUIRED'};
 try{
  const info=statSync(midi);
  if(!info.isFile()||info.size<22||info.size>4000000)
   return {ok:false,reason:'INVALID_ORIGINAL_MIDI'};
 }catch{return {ok:false,reason:'ORIGINAL_MIDI_UNREADABLE'};}
 if(existsSync(out))return {ok:false,reason:'OUTPUT_ALREADY_EXISTS'};
 const proc=spawnSync(python,['-c',PYTHON_RUN,core,midi,out],{
  encoding:'utf8',shell:false,timeout:120000,maxBuffer:1024*1024,windowsHide:true
 });
 if(proc.error)return {ok:false,reason:'PYTHON_INVOCATION_FAILED'};
 if(proc.status!==0)return {ok:false,reason:'PIANOMOTION_ENGINE_FAILED',
  message:'Check your local Python dependencies and original source MIDI'};
 return {ok:true,stdout:proc.stdout.trim(),output:out,sourceUnchanged:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.includes('--help')||process.argv.includes('-h')){
  process.stdout.write(help+'\n');
 }else{
  const result=runPianoMotionLocally(process.argv.slice(2));
  process.stdout.write(result.ok?result.stdout+'\n':result.reason+'\n');
  if(!result.ok)process.exitCode=1;
 }
}
