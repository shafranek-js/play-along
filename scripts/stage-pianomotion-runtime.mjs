/**
 * FG-04C7: opt-in, LOCAL DEVELOPMENT ONLY staging of the original,
 * owner-authorized PianoMotion Pyodide runtime into an already-built Play Along
 * dist. NOT run by npm build, CI or Pages. Do not deploy staged results before
 * external code/wheel/SoundFont redistribution rights are reviewed.
 *
 *   npm run build
 *   node scripts/stage-pianomotion-runtime.mjs --local-only ../pianomotion-studio
 *
 * PianoMotion must have already run npm run prepare:m1:assets in its own repo.
 */
import {createHash} from 'node:crypto';
import {copyFile,readFile,mkdir,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outRoot=path.join(root,'dist','assets','pianomotion');
const HEX=/^[a-f0-9]{64}$/;
const HASHED_SOURCE=/^handthesia_core\/[a-z_]+\.py$/;
const sane=e=>typeof e==='string'&&e.length<=240&&
 !e.startsWith('/')&&!e.includes('\\')&&
 e.split('/').every(v=>v&&v!=='.'&&v!=='..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const refuse=reason=>{throw Error('PIANOMOTION_STAGE_'+reason)};

/** Pure validation: source hash, path and runtime semantics must not be forged. */
export function validatePianoMotionStaging(core,assets){
 if(!core||core.schemaVersion!==1||!HEX.test(core.engineVersion)||
  typeof core.files!=='object'||Array.isArray(core.files)||
  !core.files||Object.keys(core.files).length<8)
  return {ok:false,reason:'INVALID_CORE_MANIFEST'};
 const entries=Object.entries(core.files).sort(([a],[b])=>a.localeCompare(b,'en'));
 for(const [file,hash] of entries)
  if(!HASHED_SOURCE.test(file)||!HEX.test(hash)||!sane(file))
   return {ok:false,reason:'UNSAFE_OR_UNHASHED_CORE_FILE'};
 if(!entries.some(([p])=>p==='handthesia_core/api.py')||
   !entries.some(([p])=>p==='handthesia_core/fingering.py')||
   !entries.some(([p])=>p==='handthesia_core/hand_split.py'))
  return {ok:false,reason:'MISSING_ORIGINAL_ENGINE_COMPONENT'};
 const canonical=JSON.stringify({files:Object.fromEntries(entries)});
 if(sha(Buffer.from(canonical))!==core.engineVersion)
  return {ok:false,reason:'CORE_ENGINE_VERSION_MISMATCH'};
 if(!assets||assets.schemaVersion!==1||
  assets.runtime?.version!=='314.0.7'||
  assets.runtime?.pythonVersion!=='3.14.2'||
  !Array.isArray(assets.files)||!Array.isArray(assets.purePythonWheels))
  return {ok:false,reason:'UNSUPPORTED_PYODIDE_RUNTIME'};
 const files=new Map();
 for(const f of assets.files){
  if(!f||!sane(f.path)||!f.path.startsWith('pyodide/')||
   !HEX.test(f.sha256)||files.has(f.path)||
   !Number.isSafeInteger(f.sizeBytes)||f.sizeBytes<=0)
   return {ok:false,reason:'INVALID_RUNTIME_FILE'};
  files.set(f.path,f);
 }
 for(const key of ['pyodide/pyodide.mjs','pyodide/pyodide.asm.mjs',
  'pyodide/pyodide.asm.wasm','pyodide/python_stdlib.zip',
  'pyodide/pyodide-lock.json'])
  if(!files.has(key))return {ok:false,reason:'RUNTIME_BOOT_FILE_MISSING'};
 const wheels=[];
 for(const w of assets.purePythonWheels){
  if(!w||!sane(w.file)||w.file.includes('/')||
   !HEX.test(w.sha256)||!['pretty-midi','mido','importlib-resources'].includes(w.name)||
   wheels.some(x=>x.name===w.name))
   return {ok:false,reason:'INVALID_PYTHON_WHEEL'};
  const stored=files.get('pyodide/wheels/'+w.file);
  if(!stored||stored.sha256!==w.sha256)
   return {ok:false,reason:'PYTHON_WHEEL_PIN_MISMATCH'};
  wheels.push({name:w.name,file:w.file,sha256:w.sha256});
 }
 if(wheels.length!==3)return {ok:false,reason:'REQUIRED_PYTHON_WHEELS_MISSING'};
 return {ok:true,engineVersion:core.engineVersion,entries,files:[...files.values()],wheels};
}

export async function stageLocalPianoMotionRuntime(checkout,dest=outRoot){
 if(process.env.CI==='true')refuse('DISALLOWED_IN_CI');
 if(typeof checkout!=='string'||!checkout.trim())refuse('SOURCE_CHECKOUT_REQUIRED');
 const prepared=path.resolve(checkout,'apps/client/public');
 const core=JSON.parse(await readFile(path.join(prepared,'python-core/source_manifest.json'),'utf8'));
 const assets=JSON.parse(await readFile(path.join(prepared,'pyodide/asset-manifest.json'),'utf8'));
 const valid=validatePianoMotionStaging(core,assets);
 if(!valid.ok)refuse(valid.reason);
 const copied=[];
 // Validate ALL bytes before touching the old staged destination.
 for(const [file,expected] of valid.entries){
  const bytes=await readFile(path.join(prepared,'python-core',...file.split('/')));
  if(sha(bytes)!==expected)refuse('CORE_SHA_MISMATCH_'+file);
  copied.push({file:'python-core/'+file,bytes});
 }
 for(const item of valid.files){
  const bytes=await readFile(path.join(prepared,...item.path.split('/')));
  if(bytes.length!==item.sizeBytes||sha(bytes)!==item.sha256)
   refuse('RUNTIME_SHA_MISMATCH_'+item.path);
  copied.push({file:item.path,bytes});
 }
 const dist=path.resolve(dest);
 // Do not overwrite a previously staged build; user must explicitly remove it.
 try{await stat(dist);refuse('DESTINATION_ALREADY_EXISTS')}catch(e){
  if(e?.message?.startsWith('PIANOMOTION_STAGE_'))throw e;
  if(e?.code!=='ENOENT')throw e;
 }
 let completed=false;
 try{
  await mkdir(dist,{recursive:true});
  for(const item of copied){
   const file=path.join(dist,...item.file.split('/'));
   await mkdir(path.dirname(file),{recursive:true});
   await writeFile(file,item.bytes,{flag:'wx'});
  }
  const snapshot={
   schemaVersion:1,
   source:'owner-authorized-pianomotion-studio-local-only',
   runtimeVersion:'314.0.7',
   engineVersion:valid.engineVersion,
   fileCount:copied.length,
   sourceManifest:core,
   assetManifest:assets,
   localOnly:true,
   publicRedistributionApproved:false
  };
  await writeFile(path.join(dist,'staged-manifest.json'),
   JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
  completed=true;
  return {ok:true,engineVersion:valid.engineVersion,fileCount:copied.length,
   localOnly:true,publicRedistributionApproved:false};
 }finally{if(!completed)await rm(dist,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='--local-only'||process.argv.length!==4)
  refuse('EXPLICIT_LOCAL_ONLY_FLAG_REQUIRED');
 const r=await stageLocalPianoMotionRuntime(process.argv[3]);
 process.stdout.write(JSON.stringify(r,null,2)+'\n');
}
