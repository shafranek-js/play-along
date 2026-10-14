/**
 * FG-04C7: run the ACTUAL owner-authorized PianoMotion Python algorithm
 * inside a local-only, SHA-verified Pyodide browser Worker.
 * Runtime files are staged opt-in, NEVER committed to the public repo.
 */
const base=new URL('./pianomotion/',import.meta.url);
const MAX_BYTES=4000000;
let runtimePromise=null,busy=false;
const hashed=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sane=s=>typeof s==='string'&&s.length<=240&&!s.startsWith('/')&&
 !s.includes('\\')&&s.split('/').every(x=>x&&x!=='.'&&x!=='..');
const fail=(id,reason)=>self.postMessage({id,type:'error',reason});
const progress=(id,message)=>self.postMessage({id,type:'progress',message});
async function sha(buffer){
 const digest=await crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function get(path,expected){
 if(!sane(path)||!hashed(expected))throw Error('INVALID_ASSET_PATH');
 const response=await fetch(new URL(path,base),{cache:'no-store'});
 if(!response.ok)throw Error('LOCAL_RUNTIME_ASSET_MISSING');
 const b=await response.arrayBuffer();
 if(await sha(b)!==expected)throw Error('ASSET_SHA_MISMATCH');
 return b;
}
async function initialize(id){
 const response=await fetch(new URL('staged-manifest.json',base),{cache:'no-store'});
 if(!response.ok)throw Error('PIANOMOTION_LOCAL_RUNTIME_NOT_STAGED');
 const pinned=await response.json();
 if(pinned.schemaVersion!==1||pinned.runtimeVersion!=='314.0.7'||
  pinned.localOnly!==true||pinned.publicRedistributionApproved!==false)
  throw Error('LOCAL_DEVELOPMENT_BUNDLE_ONLY');
 const core=pinned.sourceManifest,assets=pinned.assetManifest;
 if(core?.schemaVersion!==1||!hashed(core.engineVersion)||
  !core.files||typeof core.files!=='object'||Array.isArray(core.files))
  throw Error('INVALID_PIANOMOTION_SOURCE');
 const entries=Object.entries(core.files).sort(([a],[b])=>a<b?-1:a>b?1:0);
 if(entries.length<8||entries.some(([name,hash])=>
   !/^handthesia_core\/[a-z_]+\.py$/.test(name)||!hashed(hash)))
  throw Error('INVALID_PYTHON_SOURCE');
 if(await sha(new TextEncoder().encode(JSON.stringify({files:Object.fromEntries(entries)})))!==
   core.engineVersion||pinned.engineVersion!==core.engineVersion)
  throw Error('PIANOMOTION_ENGINE_DIGEST_MISMATCH');
 if(assets?.runtime?.version!=='314.0.7'||!Array.isArray(assets.files)||
    !Array.isArray(assets.purePythonWheels))
  throw Error('INVALID_PYODIDE_CATALOG');
 const byPath=new Map(assets.files.map(f=>[f.path,f]));
 const entry=byPath.get('pyodide/pyodide.mjs');
 if(!entry||!hashed(entry.sha256))throw Error('PYODIDE_MODULE_UNVERIFIED');
 await get(entry.path,entry.sha256);
 progress(id,'Загружаю оригинальную среду Pyodide…');
 const module=await import(new URL('pyodide/pyodide.mjs',base).href);
 if(module.version!=='314.0.7')throw Error('PYODIDE_VERSION_MISMATCH');
 const py=await module.loadPyodide({indexURL:new URL('pyodide/',base).href});
 progress(id,'Загружаю исходные зависимости Python…');
 await py.loadPackage(['micropip','numpy','packaging','six'],{checkIntegrity:true});
 const wheels=[],allowed=['pretty-midi','mido','importlib-resources'];
 py.FS.mkdirTree('/pm-wheels');
 for(const name of allowed){
  const wheel=assets.purePythonWheels.find(x=>x.name===name);
  if(!wheel||!sane(wheel.file)||wheel.file.includes('/')||!hashed(wheel.sha256))
   throw Error('PINNED_PYTHON_WHEEL_MISSING');
  const destination='/pm-wheels/'+wheel.file;
  py.FS.writeFile(destination,new Uint8Array(await get('pyodide/wheels/'+wheel.file,wheel.sha256)));
  wheels.push('emfs:'+destination);
 }
 py.globals.set('__pm_wheels',JSON.stringify(wheels));
 try{
  await py.runPythonAsync('import json\nimport micropip\nawait micropip.install(json.loads(__pm_wheels),deps=False)');
 }finally{py.globals.delete('__pm_wheels')}
 progress(id,'Проверяю оригинальный код PianoMotion…');
 py.FS.mkdirTree('/python-core');
 py.FS.mkdirTree('/python-core/handthesia_core');
 for(const [path,hash] of entries){
  py.FS.writeFile('/python-core/'+path,new Uint8Array(await get('python-core/'+path,hash)));
 }
 py.FS.writeFile('/python-core/handthesia_core/source_manifest.json',
  new TextEncoder().encode(JSON.stringify(core)));
 await py.runPythonAsync('import sys\nsys.path.insert(0,"/python-core")\nimport handthesia_core.api');
 return {py,engineVersion:core.engineVersion};
}
const ORIGINAL_ANALYSIS=[
 'import json',
 'from handthesia_core.api import analyze_midi',
 'with open(__pm_input,"rb") as __file:',
 '    __source=__file.read()',
 '__result=analyze_midi(__source,json.loads(__pm_options))',
 'json.dumps(__result,separators=(",",":"),allow_nan=False)'
].join('\n');
async function analyze(id,bytes){
 if(busy){fail(id,'PIANOMOTION_ENGINE_BUSY');return}
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<22||bytes.byteLength>MAX_BYTES){
  fail(id,'INVALID_OR_OVERSIZED_MIDI');return;
 }
 if(String.fromCharCode(...new Uint8Array(bytes).slice(0,4))!=='MThd'){
  fail(id,'NOT_A_STANDARD_MIDI_FILE');return;
 }
 busy=true;
 try{
  if(!runtimePromise)runtimePromise=initialize(id);
  const {py,engineVersion}=await runtimePromise;
  const hash=await sha(bytes),filename='/tmp/pm-'+id+'.mid';
  const opts={fixtureId:'imported-midi',projectId:'play-along-fg04c7',
   revision:0,requestId:'play-along-'+id,engineVersion,sampleDense:false,sampleTimes:[]};
  py.FS.writeFile(filename,new Uint8Array(bytes));
  py.globals.set('__pm_input',filename);
  py.globals.set('__pm_options',JSON.stringify(opts));
  progress(id,'Рассчитываю аппликатуру настоящим PianoMotion…');
  let response;
  try{response=String(await py.runPythonAsync(ORIGINAL_ANALYSIS))}
  finally{
   py.FS.unlink(filename);
   py.globals.delete('__pm_input');py.globals.delete('__pm_options');
   try{py.runPython("globals().pop('__file',None);globals().pop('__source',None);globals().pop('__result',None)")}catch{}
  }
  const result=JSON.parse(response);
  if(result.rawBaseline?.status!=='loaded'||result.rawBaseline.inputSha256!==hash||
    (result.rawBaseline.identityLosses?.length??0)>0||
    !Array.isArray(result.document?.notes)||
    !Array.isArray(result.fingeringPlan?.assignments))
   throw Error('ORIGINAL_MIDI_PROVENANCE_UNVERIFIED');
  const docs=new Map(result.document.notes.map(n=>[n.noteId,n]));
  const assignments=[];
  for(const item of result.fingeringPlan.assignments){
   const n=docs.get(item.noteId);
   if(!n||!['right','left'].includes(item.hand)||!Number.isInteger(n.pitch)||
     n.pitch<0||n.pitch>127||!Number.isFinite(n.startSeconds)||
     !Number.isFinite(n.endSeconds)||n.endSeconds<=n.startSeconds||
     !(item.finger===null||Number.isInteger(item.finger)&&item.finger>=1&&item.finger<=5))
    throw Error('PIANOMOTION_NOTE_RESULT_INVALID');
   assignments.push({pitch:n.pitch,start:n.startSeconds,end:n.endSeconds,
    hand:item.hand==='right'?'RH':'LH',finger:item.finger,
    disposition:item.disposition==='played'?'played':'unresolved'});
  }
  if(assignments.length!==docs.size)throw Error('PIANOMOTION_NOTE_IDENTITY_LOST');
  self.postMessage({id,type:'result',result:{
   engine:'PianoMotion Studio · original Python/Pyodide',
   engineVersion,rawMidiSha256:hash,total:assignments.length,
   playable:assignments.filter(n=>n.disposition==='played').length,
   unresolved:assignments.filter(n=>n.disposition!=='played').length,
   suggestions:assignments.slice(0,60),
   researchOnly:true,productionEligible:false,sourceNoteMappingVerified:false,
   expertValidated:false
  }});
 }catch(err){
  runtimePromise=null;
  fail(id,typeof err?.message==='string'&&/^[A-Z0-9_]{5,70}$/.test(err.message)?
   err.message:'PIANOMOTION_RUNTIME_FAILED');
 }finally{busy=false}
}
self.onmessage=e=>{
 const {id,type,midiBytes}=e.data??{};
 if(!Number.isSafeInteger(id)||id<=0||type!=='analyze-midi')return;
 void analyze(id,midiBytes);
};
