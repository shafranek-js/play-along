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
const PYODIDE_URL='https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
async function initialize(id){
 progress(id,'Проверяю оригинальное Python-ядро PianoMotion…');
 const [coreReply,pinsReply]=await Promise.all([
  fetch(new URL('python-core/handthesia_core/source_manifest.json',base)),
  fetch(new URL('pyodide-runtime-manifest.json',base))
 ]);
 if(!coreReply.ok||!pinsReply.ok)throw Error('PIANOMOTION_SOURCE_ASSETS_MISSING');
 const core=await coreReply.json(),pins=await pinsReply.json();
 if(core?.schemaVersion!==1||!hashed(core.engineVersion)||
    !core.files||typeof core.files!=='object'||Array.isArray(core.files))
  throw Error('PIANOMOTION_SOURCE_MANIFEST_INVALID');
 const entries=Object.entries(core.files).sort(([a],[b])=>a<b?-1:a>b?1:0);
 if(entries.length!==12||entries.some(([name,hash])=>
   !/^handthesia_core\/[a-z_]+\.py$/.test(name)||!hashed(hash)))
  throw Error('ORIGINAL_PIANOMOTION_SOURCE_INCOMPLETE');
 if(await sha(new TextEncoder().encode(JSON.stringify({files:Object.fromEntries(entries)})))!==
    core.engineVersion)throw Error('PIANOMOTION_SOURCE_VERSION_MISMATCH');
 if(pins.runtime?.version!=='314.0.7'||pins.schemaVersion!==1||
    !Array.isArray(pins.purePythonWheels)||
    !Array.isArray(pins.catalogPackages))
  throw Error('PYODIDE_VERSION_PIN_MISMATCH');
 progress(id,'Загружаю Python 3.14 (Pyodide/WebAssembly) в браузере…');
 const module=await import(/* @vite-ignore */ PYODIDE_URL+'pyodide.mjs');
 if(module.version!=='314.0.7')throw Error('PYODIDE_RUNTIME_VERSION_MISMATCH');
 const py=await module.loadPyodide({indexURL:PYODIDE_URL});
 const packages=['micropip','numpy','packaging','six'];
 const pinsByName=new Map(pins.catalogPackages.map(p=>[p.name,p]));
 if(packages.some(n=>!pinsByName.has(n)))throw Error('PYODIDE_DEPENDENCY_MANIFEST_INCOMPLETE');
 progress(id,'Устанавливаю проверенные MIDI/Python-зависимости…');
 await py.loadPackage(packages,{checkIntegrity:true});
 py.FS.mkdirTree('/pm-wheels');
 const wheels=[];
 for(const name of ['pretty-midi','mido','importlib-resources']){
  const wheel=pins.purePythonWheels.find(w=>w.name===name);
  if(!wheel||!/^https:\/\/files\.pythonhosted\.org\//.test(wheel.url)||
     !hashed(wheel.sha256)||!sane(wheel.file)||wheel.file.includes('/'))
   throw Error('PIANOMOTION_WHEEL_PIN_MISSING');
  const reply=await fetch(wheel.url,{cache:'force-cache'});
  if(!reply.ok)throw Error('PYTHON_DEPENDENCY_UNAVAILABLE');
  const bytes=await reply.arrayBuffer();
  if(await sha(bytes)!==wheel.sha256)throw Error('PYTHON_DEPENDENCY_HASH_MISMATCH');
  const dst='/pm-wheels/'+wheel.file;
  py.FS.writeFile(dst,new Uint8Array(bytes));
  wheels.push('emfs:'+dst);
 }
 py.globals.set('__pm_wheels',JSON.stringify(wheels));
 try{await py.runPythonAsync('import json\nimport micropip\nawait micropip.install(json.loads(__pm_wheels),deps=False)')}
 finally{py.globals.delete('__pm_wheels')}
 progress(id,'Загружаю 12 оригинальных Python-модулей PianoMotion…');
 py.FS.mkdirTree('/python-core/handthesia_core');
 for(const [relative,expected] of entries){
  const src=await get('python-core/'+relative,expected);
  py.FS.writeFile('/python-core/'+relative,new Uint8Array(src));
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
  if(assignments.length!==docs.size||
   docs.size!==result.fingeringPlan.assignments.length||
   assignments.length>2500)throw Error('PIANOMOTION_NOTE_IDENTITY_LOST');
  self.postMessage({id,type:'result',result:{
   engine:'PianoMotion Studio · original Python/Pyodide',
   engineVersion,rawMidiSha256:hash,total:assignments.length,
   playable:assignments.filter(n=>n.disposition==='played').length,
   unresolved:assignments.filter(n=>n.disposition!=='played').length,
   suggestions:assignments.slice(0,60),
   // Do not strip exact identity: the browser must verify the complete source
   // event provenance before it can display a candidate on a user note.
   analysis:{rawBaseline:result.rawBaseline,
    document:result.document,fingeringPlan:result.fingeringPlan},
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
