import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Standalone production-app performance probe. Invoke manually after a fresh
// build and serial browser/audio gates; it is intentionally not in npm scripts.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const base='/play-along/';
const storageKey='playalong:smart-practice:v07';
const targetPrivateBytes=160*1024*1024;
const coldSampleCount=5;
const sampleIntervalMs=1000;
const settleMs=2000;
const processTreeRetryLimit=1;
const startedAt=new Date().toISOString();
const runId=`${startedAt.replace(/[:.]/g,'-')}-${process.pid}-${randomUUID()}`;
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const playwrightVersion=JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version;
const buildManifestPath='scripts/manifest.json';
const buildFeatures=JSON.parse(fs.readFileSync(path.join(root,buildManifestPath),'utf8')).features;
const sourceManifestPath='src/assets/audio/soundfont-manifest.json';
const distManifestPath='dist/assets/audio/soundfont-manifest.json';
const coreSourceFiles=['music-time.mjs','music-bars.mjs','finger-guidance-timeline.mjs','musicxml-note-identity.mjs',
 'finger-overrides.mjs','finger-override-history.mjs','finger-note-selection.mjs','sheet-fingering-overlay.mjs',
 'external-fingering-evaluation.mjs','finger-editor-geometry.mjs','fingering-coverage.mjs','library-section-layout.mjs']
 .map(name=>`src/core/${name}`);
const audioSourceFiles=fs.readdirSync(path.join(root,'src/audio')).filter(name=>name.endsWith('.js')).map(name=>`src/audio/${name}`);
const sourceFiles=[...new Set([
 'tests/audio-performance.real.test.mjs','package.json','package-lock.json','scripts/build.mjs',buildManifestPath,'scripts/audio-assets.mjs',
 'src/index.html','src/styles/app.css',...buildFeatures.map(name=>`src/legacy/parts/${name}`),...coreSourceFiles,
 ...audioSourceFiles,sourceManifestPath,'node_modules/spessasynth_core/package.json',
])];
const distFiles=[
 'dist/index.html','dist/assets/app.js','dist/assets/app.css',
 'dist/assets/audio/index.js','dist/assets/audio/sf01-synth-worklet.js',
 'dist/assets/audio/sf01-pcm-tap.js',distManifestPath,'dist/assets/audio/THIRD-PARTY-NOTICES.txt',
];
const expectedBankIds=['generaluser-gs-2.0.3-sf2','musescore-general-0.2-sf3'];
const timeouts={serverMs:15000,launchMs:30000,navigationMs:30000,hookMs:20000,readyMs:90000,
 playClickMs:15000,playReadyMs:60000,captureMs:20000,liveTrialMs:8000,powershellMs:45000};

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=(value,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)):null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function withTimeout(promise,ms,label){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${ms} ms`)),ms)})])
  .finally(()=>clearTimeout(timer));
}
function median(values){
 const sorted=[...values].filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function hashFile(relative){
 const file=path.join(root,relative);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return{path:relative,exists:false,bytes:null,sha256:null};
 const bytes=fs.readFileSync(file);
 return{path:relative,exists:true,bytes:bytes.byteLength,sha256:sha256(bytes)};
}
function captureCodeHashes(){
 return{source:Object.fromEntries(sourceFiles.map(file=>[file,hashFile(file)])),
  dist:Object.fromEntries(distFiles.map(file=>[file,hashFile(file)]))};
}
function loadBankInputs(){
 const sourceBytes=fs.readFileSync(path.join(root,sourceManifestPath));
 const distBytes=fs.readFileSync(path.join(root,distManifestPath));
 const sourceManifest=JSON.parse(sourceBytes.toString('utf8'));
 const distManifest=JSON.parse(distBytes.toString('utf8'));
 assert.equal(sha256(sourceBytes),sha256(distBytes),'Built SoundFont manifest must be the exact source manifest copy');
 assert.equal(sourceManifest.schemaVersion,distManifest.schemaVersion,'dist audio manifest schema must match source');
 assert.equal(sourceManifest.defaultBankId,distManifest.defaultBankId,'dist default bank must match source');
 const builtHtml=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 const builtApp=fs.readFileSync(path.join(root,'dist/assets/app.js'),'utf8');
 assert.ok(builtHtml.includes(`v${packageJson.version}`),`Built HTML version must match package ${packageJson.version}`);
 assert.ok(builtApp.includes(`window.__playAlongVersion='${packageJson.version}'`),`Built app bundle version must match package ${packageJson.version}`);
 const banks=[];
 for(const id of expectedBankIds){
  const source=sourceManifest.banks.find(bank=>bank.id===id);
  const built=distManifest.banks.find(bank=>bank.id===id);
  assert.ok(source&&built,`source and dist manifests must both contain ${id}`);
  assert.equal(source.bytes,built.bytes,`${id}: dist bytes differ from source manifest`);
  assert.equal(source.sha256,built.sha256,`${id}: dist hash differs from source manifest`);
  const sourceAsset=hashFile(`src/assets/audio/${source.filename}`);
  const distAsset=hashFile(`dist/assets/audio/${built.filename}`);
  assert.ok(sourceAsset.exists&&distAsset.exists,`${id}: source and dist bank assets must exist`);
  assert.equal(sourceAsset.bytes,source.bytes,`${id}: source bank byte count differs from manifest`);
  assert.equal(sourceAsset.sha256,source.sha256,`${id}: source bank hash differs from manifest`);
  assert.equal(distAsset.bytes,built.bytes,`${id}: dist bank byte count differs from manifest`);
  assert.equal(distAsset.sha256,built.sha256,`${id}: dist bank hash differs from manifest`);
  const bundlePaths=new Set([source.inventory?.catalogPath,...(source.noticeFiles||[]),source.license?.path,
   ...(source.attributionFiles||[]).map(file=>file.path)].filter(Boolean));
  const bundledMetadata=[...bundlePaths].map(relative=>{
   const sourceFile=hashFile(`src/assets/audio/${relative}`),distFile=hashFile(`dist/assets/audio/${relative}`);
   assert.ok(sourceFile.exists&&distFile.exists,`${id}: source and dist metadata file ${relative} must exist`);
   assert.equal(sourceFile.bytes,distFile.bytes,`${id}: ${relative} copied byte count differs`);
   assert.equal(sourceFile.sha256,distFile.sha256,`${id}: ${relative} was not copied bit-for-bit`);
   return{relativePath:relative,source:sourceFile,dist:distFile};
  });
  const expectedMetadata=[
   source.inventory?.catalogPath?{path:source.inventory.catalogPath,bytes:source.inventory.catalogBytes,sha256:source.inventory.catalogSha256}:null,
   source.license?{path:source.license.path,bytes:source.license.bytes,sha256:source.license.sha256}:null,
   ...(source.attributionFiles||[]).map(file=>({path:file.path,bytes:file.bytes,sha256:file.sha256})),
   source.deliveryNotice?{path:source.deliveryNotice.path,bytes:source.deliveryNotice.bytes,sha256:source.deliveryNotice.sha256}:null,
  ].filter(Boolean);
  for(const expected of expectedMetadata){
   const actual=bundledMetadata.find(item=>item.relativePath===expected.path)?.source;
   assert.ok(actual,`${id}: declared metadata input ${expected.path} is missing from the bundle snapshot`);
   assert.equal(actual.bytes,expected.bytes,`${id}: ${expected.path} byte count differs from manifest`);
   assert.equal(actual.sha256,expected.sha256,`${id}: ${expected.path} hash differs from manifest`);
  }
  banks.push({id,name:source.name,format:source.format,bytes:source.bytes,sha256:source.sha256,
   relativeUrl:source.url,sourceAsset,distAsset,catalog:source.inventory?{path:source.inventory.catalogPath,
    bytes:source.inventory.catalogBytes,sha256:source.inventory.catalogSha256}:null,bundledMetadata});
 }
 return{sourceManifest:{path:sourceManifestPath,bytes:sourceBytes.byteLength,sha256:sha256(sourceBytes),defaultBankId:sourceManifest.defaultBankId},
  distManifest:{path:distManifestPath,bytes:distBytes.byteLength,sha256:sha256(distBytes),defaultBankId:distManifest.defaultBankId},banks};
}

const PROCESS_TREE_QUERY=String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$rootPid = [int]$env:SF05_PERF_ROOT_PID
$expectedArgument = '--sf05-performance-tag=' + $env:SF05_PERF_TAG
$all = @(Get-CimInstance -ClassName Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
$byId = @{}
foreach ($item in $all) { $byId[[int]$item.ProcessId] = $item }
$root = $byId[$rootPid]
if ($null -eq $root -or $null -eq $root.CommandLine -or $root.CommandLine.IndexOf($expectedArgument, [StringComparison]::Ordinal) -lt 0) {
  throw "Launched Chromium PID $rootPid was not found with the unique probe argument."
}
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($rootPid)
$previousCount = -1
while ($previousCount -ne $ids.Count) {
  $previousCount = $ids.Count
  foreach ($item in $all) {
    $probeProcessId = [int]$item.ProcessId
    $parent = [int]$item.ParentProcessId
    if ($ids.Contains($parent)) { [void]$ids.Add($probeProcessId) }
  }
}
$records = @()
[long]$privateBytes = 0
[long]$workingSetBytes = 0
foreach ($probeProcessId in ($ids | Sort-Object)) {
  $item = $byId[$probeProcessId]
  if ($null -eq $item) { continue }
  $process = Get-Process -Id $probeProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) { continue }
  $private = [long]$process.PrivateMemorySize64
  $working = [long]$process.WorkingSet64
  $privateBytes += $private
  $workingSetBytes += $working
  $records += [pscustomobject]@{pid=$probeProcessId;parentPid=[int]$item.ParentProcessId;name=[string]$item.Name;privateBytes=$private;workingSetBytes=$working}
}
[pscustomobject]@{rootPid=$rootPid;uniqueArgumentMatched=$true;processCount=$records.Count;privateBytes=$privateBytes;workingSetBytes=$workingSetBytes;processes=$records} | ConvertTo-Json -Depth 5 -Compress
`;

function sampleProcessTree(rootPid,runTag){
 assert.equal(process.platform,'win32','Native process-tree memory sampling requires Windows');
 const encoded=Buffer.from(PROCESS_TREE_QUERY,'utf16le').toString('base64');
 const attempts=[];
 const boundedText=value=>{
  if(value==null)return null;
  const text=Buffer.isBuffer(value)?value.toString('utf8'):String(value);
  return text.length>4000?`${text.slice(0,4000)}...[truncated ${text.length-4000} chars]`:text;
 };
 let stdout,attempt=0;
 while(true){
  try{
   stdout=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{
    encoding:'utf8',windowsHide:true,timeout:timeouts.powershellMs,
    env:{...process.env,SF05_PERF_ROOT_PID:String(rootPid),SF05_PERF_TAG:runTag},
   });
   attempts.push({attempt:attempt+1,status:'completed'});
   break;
  }catch(error){
   const details={code:error?.code??null,status:Number.isInteger(error?.status)?error.status:null,
    signal:error?.signal??null,killed:Boolean(error?.killed),stdout:boundedText(error?.stdout),stderr:boundedText(error?.stderr),
    message:String(error?.message||error)};
   attempts.push({attempt:attempt+1,status:'failed',error:details});
   if(details.code==='ETIMEDOUT'&&attempt<processTreeRetryLimit){attempt+=1;continue}
   throw Object.assign(new Error(`Unable to sample the launched Chromium process tree: ${details.message}`),
    {nativeSamplerError:details,sampleAttempts:attempts});
  }
 }
 let parsed;
 try{parsed=JSON.parse(stdout.trim().replace(/^\uFEFF/,''))}
 catch(error){
  const details={stage:'parse-json',code:null,status:null,signal:null,killed:false,stdout:boundedText(stdout),stderr:null,
   message:String(error?.message||error)};
  throw Object.assign(new Error(`Unable to parse launched Chromium process-tree sample: ${details.message}`),
   {nativeSamplerError:details,sampleAttempts:attempts});
 }
 assert.equal(parsed.rootPid,rootPid,'process-tree reader returned a different root PID');
 assert.equal(parsed.uniqueArgumentMatched,true,'process-tree root did not match this probe run tag');
 assert.ok(parsed.processCount>0,'process-tree sample contains no live processes');
 return{...parsed,privateMiB:round(parsed.privateBytes/1048576),workingSetMiB:round(parsed.workingSetBytes/1048576),sampleAttempts:attempts};
}
async function captureMemory(rootPid,runTag,phase,label){
 const sample=sampleProcessTree(rootPid,runTag);
 return{phase,label,at:new Date().toISOString(),...sample};
}
async function captureWindow(rootPid,runTag,phase,count=5,intervalMs=1000){
 const samples=[],sampleFailures=[];
 for(let index=0;index<count;index+=1){
  try{samples.push(await captureMemory(rootPid,runTag,phase,`${phase}-${index+1}/${count}`))}
  catch(error){sampleFailures.push({sampleNumber:index+1,message:String(error?.message||error),
   nativeSamplerError:error?.nativeSamplerError||null,nativeSamplerErrors:error?.nativeSamplerErrors||null,
   sampleAttempts:error?.sampleAttempts||null})}
  if(index+1<count)await delay(intervalMs);
 }
 return{sampleCount:samples.length,privateMiBMedian:round(median(samples.map(sample=>sample.privateMiB)),3),
  requestedSampleCount:count,failedSampleCount:sampleFailures.length,sampleFailures,
  privateMiBMax:round(Math.max(...samples.map(sample=>sample.privateMiB)),3),samples};
}

const mimeTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm',
 '.sf2':'application/octet-stream','.sf3':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml',
 '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
function createStaticServer(){
 const server=http.createServer((request,response)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname)}catch{response.writeHead(400).end('bad url');return}
  if(pathname!==base&&!pathname.startsWith(base)){response.writeHead(404).end('outside production base');return}
  const relative=pathname===base?'index.html':pathname.slice(base.length);
  const filename=path.resolve(dist,relative);
  if(filename!==path.join(dist,'index.html')&&!filename.startsWith(dist+path.sep)){response.writeHead(404).end('outside dist');return}
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){response.writeHead(404).end('not found');return}
  response.writeHead(200,{'content-type':mimeTypes[path.extname(filename).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(filename).pipe(response);
 });
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Static server did not start in time')),timeouts.serverMs);
  server.once('error',error=>{clearTimeout(timer);reject(error)});
  server.listen(0,'127.0.0.1',()=>{clearTimeout(timer);resolve({server,origin:`http://127.0.0.1:${server.address().port}`})});
 });
}

async function readAppSnapshot(page){
 return page.evaluate(()=>{
  const app=window.__prototypeTest,audio=app?.audio,status=audio?.getStatus?.(),engine=audio?.engine||null;
  return{title:document.title,version:window.__playAlongVersion||null,hasEngine:!!engine,
   state:{volume:app?.state?.volume,audioSettings:app?.state?.audioSettings},
   status:status?{backend:status.backend,lifecycle:status.lifecycle,selectedBankId:status.selectedBankId,
    activeBankId:status.activeBank?.id||null,pendingBankId:status.pendingBank?.id||null,
    bank:status.activeBank?{id:status.activeBank.id,format:status.activeBank.format,bytes:status.activeBank.bytes,sha256:status.activeBank.sha256}:null,
    masterGain:status.masterGain,effects:status.effects,error:status.error?String(status.error.message||status.error):null}:null,
   engine:engine?{contextState:engine.context?.state||null,sampleRate:engine.context?.sampleRate||null,metrics:compactAudioMetrics(engine.getMetrics?.())}:null};
  function compactAudioMetrics(metrics){
   if(!metrics)return null;
   const keys=['initialized','initializationMs','loadCompletedAt','soundfontParseMs','soundfontLoadMs','fetchMs','integrityMs',
    'fetchedBytes','presetCount','masterGain','activeNotes','voiceCount','synthVoiceCount','channelCount','pendingEvents',
    'eventsScheduled','eventsApplied','eventsRejected','processorError','effects'];
   return Object.fromEntries(keys.filter(key=>Object.hasOwn(metrics,key)).map(key=>[key,metrics[key]]));
  }
 });
}
function makeSyntheticSong(index){
 const channel=index%16;
 const notes=Array.from({length:16},(_,noteIndex)=>({
  pitch:48+((index*7+noteIndex*3)%36),
  start:0.04+noteIndex*0.055,
  duration:0.24+(noteIndex%4)*0.035,
  velocity:68+((index*11+noteIndex*5)%54),
  track:0,channel,noteId:`sf05-synthetic-${index+1}-${noteIndex+1}`,
 }));
 const audioEvents=[...Array.from({length:16},(_,midiChannel)=>({type:'programChange',time:0,
  channel:midiChannel,bankMSB:0,bankLSB:0,program:0,isDrum:false,sequence:midiChannel})),
 ...notes.flatMap((note,noteIndex)=>[
  {type:'noteOn',time:note.start,channel,noteId:note.noteId,pitch:note.pitch,velocity:note.velocity,
   track:note.track,sequence:16+noteIndex*2,isDrum:false},
  {type:'noteOff',time:note.start+note.duration,channel,noteId:note.noteId,pitch:note.pitch,
   track:note.track,sequence:17+noteIndex*2},
 ])];
 return{id:`sf05-synthetic-song-${index+1}`,title:`Synthetic performance fixture ${index+1}`,
  author:'SF-05 controlled synthetic fixture',type:'import',format:'Synthetic MIDI shape',tempo:96,
  tracks:[{name:'Synthetic channel',notes}],audioEvents};
}
async function observeTrustedClick(page,selector,property){
 await page.evaluate(({selector,property})=>{
  const target=document.querySelector(selector);
  if(!target)throw new Error(`Missing trusted-click target: ${selector}`);
  window.__sf05TrustedClicks??={};
  target.addEventListener('click',event=>{window.__sf05TrustedClicks[property]=event.isTrusted},{once:true,capture:true});
 },{selector,property});
}
async function waitForReady(page,bankId){
 const handle=await page.waitForFunction(expected=>{
  const status=window.__prototypeTest?.audio?.getStatus?.();
  if(status?.lifecycle==='ready'&&status?.activeBank?.id===expected)return{kind:'ready'};
  if(status?.error||status?.lifecycle==='error')return{kind:'error',message:String(status.error?.message||status.error||status.lifecycle)};
  return false;
 },bankId,{timeout:timeouts.readyMs});
 const result=await handle.jsonValue();
 if(result?.kind!=='ready')throw new Error(`Production app did not prepare ${bankId}: ${result?.message||'unknown failure'}`);
}

async function prepareLiveLatencyProbe(page,bank){
 return page.evaluate(async({bankId})=>{
  const audio=window.__prototypeTest?.audio,engine=audio?.engine,status=audio?.getStatus?.();
  if(!engine||status?.activeBank?.id!==bankId||status?.backend!=='soundfont')throw new Error('Live latency probe needs the prepared SoundFont bank');
  const livePreset=status.livePreset;
  if(!livePreset||livePreset.bankMSB!==0||livePreset.bankLSB!==0||livePreset.program!==0||livePreset.isDrum!==false)
   throw new Error('Live latency probe requires the selected default GM Acoustic Grand patch');
  if(engine.context?.state!=='running')throw new Error('Live latency probe needs the already running app AudioContext');
  await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
  await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:85}]}]);
  await engine.ensurePcmTap();
  const probe={engine,originalScheduleEvent:engine.scheduleEvent,wrapper:null,activeTrialId:null,events:[]};
  probe.wrapper=function(event){
   const contextTime=this.context.currentTime,performanceTime=performance.now();
   const sequence=probe.originalScheduleEvent.call(this,event);
   if(probe.activeTrialId!==null&&event?.type==='noteOn'&&event.group==='live'&&event.channel===0&&event.pitch===60){
    probe.events.push({trialId:probe.activeTrialId,sequence,noteId:event.noteId,velocity:event.velocity,
     dispatchContextTime:contextTime,dispatchPerformanceTime:performanceTime,scheduledAt:event.at});
   }
   return sequence;
  };
  window.__sf05LiveLatencyProbe=probe;
  engine.scheduleEvent=probe.wrapper;
  return{bankId,livePreset:{bankMSB:livePreset.bankMSB,bankLSB:livePreset.bankLSB,program:livePreset.program,
    isDrum:livePreset.isDrum,name:livePreset.name||null},contextState:engine.context.state,sampleRate:engine.context.sampleRate,
   effects:engine.getMetrics?.().effects||status.effects,preparedPatch:{bankMSB:0,bankLSB:0,program:0,isDrum:false,
    pitch:60,velocity:85},pcmTapInitialized:true};
 },{bankId:bank.id});
}

async function runLiveLatencyTrial(page,trialNumber){
 return page.evaluate(async({trialNumber,captureSeconds,preInputSeconds,postInputSeconds,noteHoldSeconds,
  silenceThreshold,trialTimeoutMs})=>{
  const audio=window.__prototypeTest?.audio,app=window.__prototypeTest,probe=window.__sf05LiveLatencyProbe;
  const engine=probe?.engine,context=engine?.context;
  const row={trialNumber,valid:false,invalidReasons:[],inputPath:'__prototypeTest.receiveNoteOn(60) default velocity 85',
   capture:{requestedDurationSeconds:captureSeconds,preInputRequiredSeconds:preInputSeconds,
    postInputRequiredSeconds:postInputSeconds,silenceThreshold},scheduleDispatch:null,input:null};
  let capturePromise=null,inputSent=false;
  const addInvalid=reason=>{if(!row.invalidReasons.includes(reason))row.invalidReasons.push(reason)};
  const waitUntilContextTime=async(target,deadline,label)=>{
   while(context.currentTime<target){
    if(performance.now()>deadline)throw new Error(`${label} timed out`);
    await new Promise(resolve=>requestAnimationFrame(resolve));
   }
  };
  try{
   if(!audio||!engine||!context||!probe||app?.state?.audioSettings?.backend!=='soundfont')throw new Error('Live probe bridge is unavailable');
   if(context.state!=='running')throw new Error('The shared AudioContext is not running');
   await audio.panic({group:'all'});
   if(app.midiHeld?.includes(60))throw new Error('Pitch 60 remained held after acknowledged Panic');
   probe.events.length=0;probe.activeTrialId=trialNumber;
   const captureArmContextTime=context.currentTime;
   capturePromise=engine.capturePcm({durationSeconds:captureSeconds,timeoutMs:5000})
    .then(pcm=>({pcm})).catch(error=>({error:String(error?.message||error)}));
   await waitUntilContextTime(captureArmContextTime+preInputSeconds,performance.now()+trialTimeoutMs,'Pre-input capture window');
   const inputAt=context.currentTime,inputPerformanceTime=performance.now();
   row.input={contextTime:inputAt,performanceTime:inputPerformanceTime,signatureVelocity:85};
   inputSent=true;
   app.receiveNoteOn(60);
   const scheduleDeadline=performance.now()+1500;
   while(!probe.events.some(event=>event.trialId===trialNumber)){
    if(performance.now()>scheduleDeadline){addInvalid('live-note-on-was-not-queued');break}
    await new Promise(resolve=>requestAnimationFrame(resolve));
   }
   const queued=probe.events.find(event=>event.trialId===trialNumber)||null;
   if(queued){
    row.scheduleDispatch={sequence:queued.sequence,noteId:queued.noteId,velocity:queued.velocity,
     dispatchContextTime:queued.dispatchContextTime,dispatchPerformanceTime:queued.dispatchPerformanceTime,
     scheduledAt:queued.scheduledAt,
     inputToDispatchContextMs:(queued.dispatchContextTime-inputAt)*1000,
     inputToQueuedWallMs:queued.dispatchPerformanceTime-inputPerformanceTime,
     scheduledLeadMs:(queued.scheduledAt-queued.dispatchContextTime)*1000};
    if(queued.velocity!==85)addInvalid('scheduled-velocity-was-not-default-85');
   }
   if(queued){
    await waitUntilContextTime(inputAt+noteHoldSeconds,performance.now()+trialTimeoutMs,'Stable NoteOn hold');
    app.receiveNoteOff(60);inputSent=false;
   }
   const captureResult=await capturePromise;
   if(captureResult.error)throw new Error(`PCM capture failed: ${captureResult.error}`);
   const pcm=captureResult.pcm;
   const sampleRate=pcm.sampleRate,epsilon=Number.isFinite(sampleRate)&&sampleRate>0?1/sampleRate:null;
   const expectedFrames=Number.isFinite(sampleRate)&&sampleRate>0?Math.ceil(captureSeconds*sampleRate):null;
   let finite=true,firstNonzeroBeforeInputAt=null,firstNonzeroAfterInputAt=null;
   let preInputNonzeroSamples=0,preInputQuietSamples=0,totalSamples=0,nonzeroAfterInputSamples=0;
   const samples=pcm.samples||[];
   const frameCount=Math.min(pcm.frames||0,...(samples.length?samples.map(channel=>channel.length):[0]));
   for(let frame=0;frame<frameCount;frame+=1){
    const sampleTime=pcm.startedAt+frame/sampleRate;
    const beforeInput=sampleTime<inputAt;
    for(const channel of samples){
     const value=channel[frame];totalSamples+=1;
     if(!Number.isFinite(value)){finite=false;continue}
     if(Math.abs(value)>silenceThreshold){
      if(beforeInput){preInputNonzeroSamples+=1;if(firstNonzeroBeforeInputAt===null)firstNonzeroBeforeInputAt=sampleTime}
      else{nonzeroAfterInputSamples+=1;if(firstNonzeroAfterInputAt===null)firstNonzeroAfterInputAt=sampleTime}
     }else if(beforeInput)preInputQuietSamples+=1;
    }
   }
   const preInputCoverageSeconds=inputAt-pcm.startedAt,postInputCoverageSeconds=pcm.endedAt-inputAt;
   const hasExpectedPcm=pcm.channels===2&&pcm.frames===expectedFrames&&totalSamples===pcm.frames*pcm.channels;
   const fullCaptureWindow=epsilon!==null&&preInputCoverageSeconds>=preInputSeconds-epsilon
    &&postInputCoverageSeconds>=postInputSeconds-epsilon;
   const preInputQuiet=preInputNonzeroSamples===0&&preInputQuietSamples>0;
   const inputToFirstPcmNonzeroMs=firstNonzeroAfterInputAt===null?null:(firstNonzeroAfterInputAt-inputAt)*1000;
   row.capture={requestedDurationSeconds:captureSeconds,startedAt:pcm.startedAt,endedAt:pcm.endedAt,
    sampleRate,channels:pcm.channels,frames:pcm.frames,expectedFrames,totalSamples,finite,hasExpectedPcm,
    preInputRequiredSeconds:preInputSeconds,preInputCoverageSeconds,preInputQuietSamples,preInputNonzeroSamples,
    firstNonzeroBeforeInputAt,preInputQuiet,postInputRequiredSeconds:postInputSeconds,postInputCoverageSeconds,
    fullCaptureWindow,coverageEpsilonSeconds:epsilon,firstNonzeroAfterInputAt,inputToFirstPcmNonzeroMs,
    nonzeroAfterInputSamples,silenceThreshold};
   if(!hasExpectedPcm)addInvalid('pcm-frame-or-channel-count-mismatch');
   if(!finite)addInvalid('non-finite-pcm');
   if(!fullCaptureWindow)addInvalid('capture-does-not-cover-full-pre-and-post-input-windows');
   if(!preInputQuiet)addInvalid(preInputNonzeroSamples?'nonzero-pcm-before-input':'pre-input-quiet-window-not-observed');
   if(firstNonzeroAfterInputAt===null)addInvalid('no-nonzero-pcm-after-input');
   if(!queued)addInvalid('missing-schedule-dispatch-record');
   if(inputSent){app.receiveNoteOff(60);inputSent=false}
  }catch(error){
   row.error=String(error?.message||error);addInvalid('probe-trial-error');
  }finally{
   probe.activeTrialId=null;
   if(inputSent||app?.midiHeld?.includes(60)){try{app.receiveNoteOff(60)}catch(error){row.cleanupError=String(error?.message||error)}}
   if(capturePromise)await capturePromise;
   if(audio)try{await audio.panic({group:'all'})}catch(error){row.cleanupError=String(error?.message||error);addInvalid('panic-cleanup-failed')}
  }
  const latency=row.capture.inputToFirstPcmNonzeroMs;
  row.valid=row.invalidReasons.length===0;
  row.within10msObservation=row.valid&&Number.isFinite(latency)&&latency>=0&&latency<=10;
  return row;
 },{trialNumber,captureSeconds:0.18,preInputSeconds:0.04,postInputSeconds:0.1,noteHoldSeconds:0.06,
  silenceThreshold:1e-8,trialTimeoutMs:3000});
}

function percentile(values,fraction){
 const sorted=values.filter(Number.isFinite).sort((left,right)=>left-right);
 if(!sorted.length)return null;
 const position=(sorted.length-1)*fraction,lower=Math.floor(position),upper=Math.ceil(position);
 return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}
function summarizeLiveLatency(trials){
 const valid=trials.filter(trial=>trial.valid);
 const stats=read=>{
  const values=valid.map(read).filter(Number.isFinite);
  return{count:values.length,p50Ms:round(median(values),3),p95Ms:round(percentile(values,.95),3),maxMs:values.length?round(Math.max(...values),3):null};
 };
 const within=valid.filter(trial=>trial.within10msObservation).length;
 return{attemptedTrials:trials.length,validTrials:valid.length,invalidTrials:trials.length-valid.length,
  invalidReasons:trials.filter(trial=>!trial.valid).map(trial=>({trialNumber:trial.trialNumber,reasons:trial.invalidReasons,error:trial.error||null})),
  inputToFirstPcmNonzero:stats(trial=>trial.capture?.inputToFirstPcmNonzeroMs),
  inputToScheduleDispatchContext:stats(trial=>trial.scheduleDispatch?.inputToDispatchContextMs),
  inputToScheduleQueuedWall:stats(trial=>trial.scheduleDispatch?.inputToQueuedWallMs),
  scheduledLead:stats(trial=>trial.scheduleDispatch?.scheduledLeadMs),
  targetObservation:{thresholdMs:10,validTrialsWithinThreshold:within,
   allTwentyTrialsValidAndWithinThreshold:valid.length===20&&within===20},
  hardwareOutput:'not measured; latency ends at the first nonzero sample in the browser PCM tap'};
}

async function restoreLiveLatencyProbe(page){
 if(!page)return;
 await withTimeout(page.evaluate(async()=>{
  const probe=window.__sf05LiveLatencyProbe;
  if(!probe)return;
  probe.activeTrialId=null;
  const app=window.__prototypeTest,audio=app?.audio,engine=probe.engine;
  try{
   if(app?.midiHeld?.includes(60))app.receiveNoteOff(60);
   if(audio)await audio.panic({group:'all'});
  }finally{
   if(engine?.scheduleEvent===probe.wrapper)engine.scheduleEvent=probe.originalScheduleEvent;
   delete window.__sf05LiveLatencyProbe;
  }
 }),5000,'Restore live-latency instrumentation').catch(()=>{});
}

async function runDenseFixture(page,bank){
 return page.evaluate(async({bankId,bankSha256})=>{
  const rounded=(value,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)):null;
  const compactEngineMetrics=metrics=>{
   if(!metrics)return null;
   const keys=['initialized','initializationMs','loadCompletedAt','soundfontParseMs','soundfontLoadMs','fetchMs','integrityMs',
    'fetchedBytes','presetCount','masterGain','activeNotes','voiceCount','synthVoiceCount','channelCount','pendingEvents',
    'eventsScheduled','eventsApplied','eventsRejected','processorError','effects'];
   return Object.fromEntries(keys.filter(key=>Object.hasOwn(metrics,key)).map(key=>[key,metrics[key]]));
  };
  const app=window.__prototypeTest,audio=app?.audio,engine=audio?.engine;
  if(!engine||audio.getStatus().activeBank?.id!==bankId)throw new Error('Dense fixture requires the target production bank');
  const volume=document.querySelector('#volume');
  if(!volume)throw new Error('Production master-volume slider is missing');
  volume.value='40';volume.dispatchEvent(new Event('input',{bubbles:true}));
  const setGain=engine.setMasterGain?.(0.4);
  if(setGain&&typeof setGain.then==='function')await setGain;
  await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
  const patch={bankMSB:0,bankLSB:0,program:0,isDrum:false};
  const pitches=Array.from({length:8},(_,index)=>48+index);
  const notes=pitches.map(pitch=>({pitch,velocity:100}));
  await engine.preparePatches([{...patch,notes}]);
  await engine.ensurePcmTap();
  const context=engine.context,at=context.currentTime+0.25,noteOffAt=at+0.85;
  const events=[];
  for(let channel=0;channel<16;channel+=1){
   events.push({type:'programChange',group:'file',channel,bankMSB:0,bankLSB:0,program:0,isDrum:false,at});
   for(const pitch of pitches){
    const noteId=`sf05-dense-${bankId}-${channel}-${pitch}`;
    events.push({type:'noteOn',group:'file',channel,noteId,pitch,velocity:100,at});
    events.push({type:'noteOff',group:'file',channel,noteId,pitch,at:noteOffAt});
   }
  }
  const noteOns=events.filter(event=>event.type==='noteOn');
  if(noteOns.length!==128||new Set(noteOns.map(event=>event.channel)).size!==16
    ||noteOns.some(event=>event.velocity!==100||event.pitch<48||event.pitch>55))
   throw new Error('Dense fixture must contain 128 NoteOns across all 16 logical channels');
  if(events.filter(event=>event.type==='programChange').some(event=>event.isDrum!==false))
   throw new Error('Every dense-fixture program change, including channel 9, must explicitly select melodic GM piano');
  const capturePromise=audio.capturePcm({durationSeconds:1.5});
  for(const event of events)audio.scheduleEvent(event);
  const activeAt=at+0.18;
  const activeDeadline=performance.now()+5000;
  while(context.currentTime<activeAt){
   if(performance.now()>activeDeadline)throw new Error('AudioContext did not advance through the dense fixture');
   await new Promise(resolve=>requestAnimationFrame(resolve));
  }
  const metricsSampleContextTime=context.currentTime;
  const metrics=engine.getMetrics?.()||null;
  const pcm=await capturePromise;
  let finite=true,nonzero=0,clippedSamples=0,peak=0,totalSamples=0;
  for(const channel of pcm.samples||[])for(const sample of channel){
   totalSamples+=1;
   if(!Number.isFinite(sample)){finite=false;continue}
   const magnitude=Math.abs(sample);
   if(magnitude>0)nonzero+=1;
   if(magnitude>=1)clippedSamples+=1;
   peak=Math.max(peak,magnitude);
  }
  const expectedFrames=Number.isFinite(pcm.sampleRate)&&pcm.sampleRate>0?Math.ceil(1.5*pcm.sampleRate):null;
  if(pcm.frames<=0||pcm.frames!==expectedFrames||pcm.channels!==2||totalSamples!==pcm.frames*pcm.channels
    ||!finite||nonzero===0||!Number.isFinite(peak))
   throw new Error('Dense fixture PCM must be finite, stereo, and nonzero');
  await audio.panic({group:'file'});
  const voiceCount=Number.isFinite(metrics?.voiceCount)?metrics.voiceCount:
   Number.isFinite(metrics?.synthVoiceCount)?metrics.synthVoiceCount:null;
  const coverageEpsilon=1/pcm.sampleRate;
  const captureCoversScheduledNotes=pcm.startedAt<=at+coverageEpsilon&&pcm.endedAt>=noteOffAt-coverageEpsilon;
  if(!captureCoversScheduledNotes)throw new Error(`PCM window [${pcm.startedAt}, ${pcm.endedAt}] does not cover scheduled NoteOns/NoteOffs [${at}, ${noteOffAt}]`);
  return{
   bankId,bankSha256,bankMatches:audio.getStatus().activeBank?.sha256===bankSha256,
   requestedNoteOns:noteOns.length,logicalChannels:[...new Set(noteOns.map(event=>event.channel))],
   metricsSampleContextTime,metricsSampleAfterFirstNoteOnSeconds:metricsSampleContextTime-at,
   pitches,velocity:100,allProgramsExplicitlyMelodic:events.filter(event=>event.type==='programChange').every(event=>event.isDrum===false),
   masterVolumePercent:app.state.volume,masterGain:engine.getMetrics?.().masterGain??audio.getStatus().masterGain,
   effects:engine.getMetrics?.().effects||audio.getStatus().effects,
   audio:{sampleRate:pcm.sampleRate,channels:pcm.channels,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,
    requestedDurationSeconds:1.5,expectedFrames,coverageEpsilonSeconds:coverageEpsilon,captureCoversScheduledNotes,scheduledNoteWindow:{start:at,end:noteOffAt},
    finite,nonzeroSamples:nonzero,totalSamples,peak:rounded(peak,6),clippedSamples,peakAtOrAboveFullScale:peak>=1},
   voiceCountObservation:{field:Number.isFinite(metrics?.voiceCount)?'voiceCount':Number.isFinite(metrics?.synthVoiceCount)?'synthVoiceCount':null,
    value:voiceCount,observedAtOrAboveRequestedNoteOnCount:voiceCount===null?null:voiceCount>=noteOns.length,
    activeNotes:metrics?.activeNotes??null,metrics:compactEngineMetrics(metrics),
    assertionMade:false},
  };
 },{bankId:bank.id,bankSha256:bank.sha256});
}

async function runBankProbe(bank,origin){
 const runTag=`${runId}-${bank.id}-${randomUUID()}`;
 const result={bank,runTag,status:'RUNNING',startedAt:new Date().toISOString(),browser:null,app:null,
  prepare:null,memory:{coldPage:null,engineReady:null,syntheticAppSongChanges:[],denseBefore:null,denseAfter:null},
  liveLatency:null,denseFixture:null,pageErrors:[],externalRequestsBlocked:[],failures:[]};
 let browserServer,browser,context,page,browserRootPid;
 try{
  browserServer=await withTimeout(chromium.launchServer({headless:true,host:'127.0.0.1',port:0,timeout:timeouts.launchMs,
   args:['--no-sandbox',`--sf05-performance-tag=${runTag}`]}),timeouts.launchMs,'Playwright Chromium launch');
  const processInfo=browserServer.process();
  browserRootPid=processInfo?.pid;
  assert.ok(Number.isInteger(browserRootPid)&&browserRootPid>0,'Playwright did not return the launched Chromium PID');
  browser=await withTimeout(chromium.connect(browserServer.wsEndpoint()),timeouts.launchMs,'Playwright Chromium connection');
  result.browser={name:'chromium',version:browser.version(),executablePath:processInfo?.spawnfile||null,
   rootPid:browserRootPid,runTag,processProfile:'fresh Playwright launchServer process and isolated BrowserContext'};
  context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  await context.addInitScript(({bankId})=>{
   const key='playalong:smart-practice:v07';
   let settings={};try{settings=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
   settings.volume=40;
   settings.right=true;
   settings.rightTab='midi';
   settings.autoMidi=false;
   settings.audioSettings={backend:'soundfont',bankId,livePreset:{bankMSB:0,bankLSB:0,program:0,isDrum:false},useFilePrograms:true};
   localStorage.setItem(key,JSON.stringify(settings));
  },{bankId:bank.id});
  await context.route('**/*',async route=>{
   const requestUrl=new URL(route.request().url());
   if(requestUrl.origin!==origin){result.externalRequestsBlocked.push({url:requestUrl.href,resourceType:route.request().resourceType()});await route.abort('blockedbyclient');return}
   await route.continue();
  });
  page=await context.newPage();
  page.on('pageerror',error=>result.pageErrors.push(String(error.message||error)));
  await page.goto(`${origin}${base}`,{waitUntil:'load',timeout:timeouts.navigationMs});
  await page.waitForFunction(()=>Boolean(window.__prototypeTest?.audio?.getStatus&&window.__prototypeTest?.state),null,{timeout:timeouts.hookMs});
  result.app=await readAppSnapshot(page);
  assert.equal(result.app.hasEngine,false,'Cold page must be sampled before AudioContext or SoundFont engine creation');
  assert.equal(result.app.status?.activeBankId,null,'Cold page must not have an active bank');
  await delay(settleMs);
  result.memory.coldPage=await captureWindow(browserRootPid,runTag,'coldPage',coldSampleCount,sampleIntervalMs);

  await observeTrustedClick(page,'#audioRetry','prepare');
  const prepareStart=await page.evaluate(()=>performance.now());
  await page.locator('#audioRetry').click({timeout:timeouts.playClickMs});
  await waitForReady(page,bank.id);
  const readyAfterClick=await page.evaluate(start=>({elapsedMs:performance.now()-start,
   trustedClick:window.__sf05TrustedClicks?.prepare===true}),prepareStart);
  assert.equal(readyAfterClick.trustedClick,true,'Prepare must be started by a trusted UI click');
  result.prepare={bankId:bank.id,elapsedToUiReadyMs:round(readyAfterClick.elapsedMs,2),
   readinessDefinition:'trusted click on production Retry/Prepare control until active bank lifecycle is ready',
   engineStatus:await readAppSnapshot(page)};
  assert.equal(result.prepare.engineStatus.status?.activeBankId,bank.id,'Production UI prepared a different bank');
  assert.equal(result.prepare.engineStatus.status?.bank?.sha256,bank.sha256,'Active bank hash does not match the pinned manifest');
  result.memory.engineReady=await captureMemory(browserRootPid,runTag,'engineReady','ready-private-bytes');

  const app=await page.evaluate(()=>({appVersion:window.__playAlongVersion||null,
   userAgent:navigator.userAgent,status:window.__prototypeTest.audio.getStatus(),state:window.__prototypeTest.state}));
  result.app={...result.app,version:app.appVersion,userAgent:app.userAgent};
  assert.equal(app.state.volume,40,'Probe fixture must use production volume state 40%');
  assert.equal(app.status.masterGain,0.4,'Engine master gain must match 40% application volume');
  const startupSnapshot=await page.evaluate(()=>{
   const engine=window.__prototypeTest.audio.engine,metrics=engine?.getMetrics?.();
   const keys=['initialized','initializationMs','loadCompletedAt','soundfontParseMs','soundfontLoadMs','fetchMs','integrityMs',
    'fetchedBytes','presetCount','masterGain','activeNotes','voiceCount','synthVoiceCount','channelCount','pendingEvents',
    'eventsScheduled','eventsApplied','eventsRejected','processorError','effects'];
   const compactMetrics=metrics?Object.fromEntries(keys.filter(key=>Object.hasOwn(metrics,key)).map(key=>[key,metrics[key]])):null;
   return{contextState:engine?.context?.state||null,sampleRate:engine?.context?.sampleRate||null,metrics:compactMetrics};
  });
  result.prepare.contextState=startupSnapshot.contextState;
  result.prepare.sampleRate=startupSnapshot.sampleRate;
  result.prepare.engineMetrics=startupSnapshot.metrics;
  assert.equal(startupSnapshot.contextState,'running','AudioContext must be running after trusted preparation');

  result.liveLatency={status:'RUNNING',bankId:bank.id,setup:null,trials:[],summary:null,
   observationOnly:true,targetMs:10};
  result.liveLatency.setup=await prepareLiveLatencyProbe(page,bank);
  for(let trialNumber=1;trialNumber<=20;trialNumber+=1){
   try{
    const trial=await withTimeout(runLiveLatencyTrial(page,trialNumber),timeouts.liveTrialMs,
     `Live input-to-PCM trial ${trialNumber} for ${bank.id}`);
    result.liveLatency.trials.push(trial);
   }catch(error){
    result.liveLatency.trials.push({trialNumber,valid:false,invalidReasons:['trial-evaluation-failed'],
     error:String(error?.message||error),observationOnly:true});
    result.liveLatency.status='FAILED';
    throw error;
   }
  }
  result.liveLatency.summary=summarizeLiveLatency(result.liveLatency.trials);
  result.liveLatency.status='COMPLETED';

  for(let index=0;index<20;index+=1){
   const song=makeSyntheticSong(index);
   const change={index:index+1,songId:song.id,noteCount:song.tracks[0].notes.length,channel:song.tracks[0].notes[0].channel,
    label:'synthetic application song load / trusted play-to-ready / pause; not an imported file or bank replacement'};
   change.pre=await captureMemory(browserRootPid,runTag,'syntheticAppSongChange','before-'+song.id);
   await page.evaluate(songData=>window.__prototypeTest.loadSong(songData),song);
   await observeTrustedClick(page,'#playBtn',`play-${index+1}`);
   const playStart=await page.evaluate(()=>performance.now());
   await page.locator('#playBtn').click({timeout:timeouts.playClickMs});
   await page.waitForFunction(()=>window.__prototypeTest?.isPlaying===true,null,{timeout:timeouts.playReadyMs});
   const playKey=`play-${index+1}`;
   const playReady=await page.evaluate(({start,key})=>({elapsedMs:performance.now()-start,
    trustedClick:window.__sf05TrustedClicks?.[key]===true,
    contextTime:window.__prototypeTest.audio.engine?.context?.currentTime??null}),{start:playStart,key:playKey});
   change.trustedPlayReadyMs=round(playReady.elapsedMs,2);
   change.trustedPlay=playReady.trustedClick;
   change.playContextTime=playReady.contextTime;
   assert.equal(change.trustedPlay,true,`Synthetic song ${index+1} Play must use a trusted UI click`);
   await delay(120);
   await observeTrustedClick(page,'#playBtn',`pause-${index+1}`);
   await page.locator('#playBtn').click({timeout:timeouts.playClickMs});
   await page.waitForFunction(()=>window.__prototypeTest?.isPlaying===false,null,{timeout:timeouts.playReadyMs});
   const pauseKey=`pause-${index+1}`;
   change.trustedPause=await page.evaluate(key=>window.__sf05TrustedClicks?.[key]===true,pauseKey);
   assert.equal(change.trustedPause,true,`Synthetic song ${index+1} Pause must use a trusted UI click`);
   change.post=await captureMemory(browserRootPid,runTag,'syntheticAppSongChange','after-'+song.id);
   change.privateDeltaBytes=change.post.privateBytes-change.pre.privateBytes;
   change.privateDeltaMiB=round(change.privateDeltaBytes/1048576,3);
   result.memory.syntheticAppSongChanges.push(change);
  }

  result.memory.denseBefore=await captureMemory(browserRootPid,runTag,'dense128','before-dense-fixture');
  result.denseFixture=await withTimeout(runDenseFixture(page,bank),timeouts.captureMs,'Dense 128-note PCM fixture');
  assert.equal(result.denseFixture.requestedNoteOns,128);
  assert.equal(result.denseFixture.logicalChannels.length,16);
  assert.equal(result.denseFixture.allProgramsExplicitlyMelodic,true);
  assert.equal(result.denseFixture.audio.finite,true);
  assert.ok(result.denseFixture.audio.nonzeroSamples>0);
  assert.equal(result.denseFixture.audio.captureCoversScheduledNotes,true);
  result.memory.denseAfter=await captureMemory(browserRootPid,runTag,'dense128','after-dense-fixture');
  if(result.pageErrors.length)throw new Error(`Browser page errors: ${result.pageErrors.join(' | ')}`);
  result.status='COMPLETED';
 }catch(error){
  result.failures.push({message:String(error?.message||error),stack:String(error?.stack||error),
   nativeSamplerError:error?.nativeSamplerError||null,nativeSamplerErrors:error?.nativeSamplerErrors||null,
   sampleAttempts:error?.sampleAttempts||null});
  result.status='FAILED';
  try{if(page)result.failureSnapshot=await readAppSnapshot(page)}catch{}
 }finally{
  if(page)await restoreLiveLatencyProbe(page);
  if(page)await page.close().catch(()=>{});
  if(context)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(browserServer)await browserServer.close().catch(()=>{});
  result.finishedAt=new Date().toISOString();
 }
 result.memorySummary=summarizeMemory(result.memory);
 return result;
}
function summarizeMemory(memory){
 const coldSamples=memory.coldPage?.samples||[];
 const coldMedianBytes=median(coldSamples.map(sample=>sample.privateBytes));
 const allSamples=[...coldSamples];
 if(memory.engineReady)allSamples.push(memory.engineReady);
 for(const change of memory.syntheticAppSongChanges||[]){if(change.pre)allSamples.push(change.pre);if(change.post)allSamples.push(change.post)}
 if(memory.denseBefore)allSamples.push(memory.denseBefore);
 if(memory.denseAfter)allSamples.push(memory.denseAfter);
 const peak=allSamples.reduce((best,sample)=>!best||sample.privateBytes>best.privateBytes?sample:best,null);
 const deltaBytes=coldMedianBytes===null||!peak?null:peak.privateBytes-coldMedianBytes;
 const coldWindowComplete=coldSamples.length===coldSampleCount&&memory.coldPage?.failedSampleCount===0;
 return{metric:'summed Windows PrivateMemorySize64 across the launched Chromium PID and descendants',
  unit:'bytes; MiB is bytes / 1,048,576',coldSampleCount:coldSamples.length,coldMedianPrivateBytes:coldMedianBytes,
  requestedColdSampleCount:coldSampleCount,coldWindowComplete,
  coldMedianPrivateMiB:coldMedianBytes===null?null:round(coldMedianBytes/1048576),observedSampledPeakPrivateBytes:peak?.privateBytes??null,
  observedSampledPeakPrivateMiB:peak?round(peak.privateBytes/1048576):null,peakSamplePhase:peak?.phase||null,
  additionalPrivateBytesFromColdMedian:deltaBytes,additionalPrivateMiBFromColdMedian:deltaBytes===null?null:round(deltaBytes/1048576),
  targetPrivateBytes, targetPrivateMiB:160,
  budgetPassed:deltaBytes===null||!coldWindowComplete?null:deltaBytes<=targetPrivateBytes,
  budgetEvaluation:deltaBytes===null?'not evaluable because the cold baseline or sampled peak is unavailable':!coldWindowComplete?'not evaluable because the five-sample cold window was incomplete':deltaBytes<=targetPrivateBytes?'passed':'failed',
  sampledPeakCaveat:'Discrete process snapshots; not a continuous monitor or guarantee of instantaneous peak.',
  songChangeCount:memory.syntheticAppSongChanges?.length||0,
  songChangesAreBankReplacements:false};
}

const report={schemaVersion:1,runId,startedAt,status:'RUNNING',purpose:'SF-05 real production app performance, native-memory and dense-PCM evidence',
 runtime:{node:process.version,playwright:playwrightVersion,platform:process.platform,architecture:process.arch,
  osRelease:os.release(),cpuModel:os.cpus()[0]?.model||null,physicalMemoryMiB:round(os.totalmem()/1048576,2),
  appVersion:packageJson.version,browser:'Playwright Chromium bundled by the installed playwright dependency',
  basePath:base,server:'localhost serving only the already-built local dist tree; no network download'},
 artifacts:null,banks:[],failures:[],bankSelection:null,method:{coldPage:'Production dist page before creating AudioContext or synthesizer; target 5 native process-tree snapshots 1 second apart after 2 second settle. Failed samples are retained and the window continues; if no samples succeed, later probe phases continue and the memory budget remains unevaluable.',
  prepare:'Trusted click on production Prepare/Retry UI; time until chosen bank is indexed, prepared, and lifecycle ready.',
  memory:'Sum PrivateMemorySize64 over the launched Chromium root PID and recursively discovered Win32_Process descendants. Root PID must match unique --sf05-performance-tag. PowerShell progress output is suppressed; each CIM sample has a 45 second timeout and at most one documented ETIMEDOUT retry. Structured bounded sampler errors are retained in the report.',
  syntheticAppSongChanges:'20 distinct synthetic song objects loaded through the real app hook, each played to ready and paused through trusted Play-button clicks; these are not bank replacements or imported real songs.',
  liveInputToPcmOnset:'Per bank, 20 production app receiveNoteOn(60) trials at default velocity 85 on the already prepared GM Acoustic Grand patch. Effects are disabled; the exact note patch and PCM tap are prepared once before counting. Each trial acknowledges all-group Panic, arms a 0.18 second PCM capture, requires at least 40 ms of fully covered quiet before input and 100 ms after, then records context time immediately before the app input call and the delegated engine scheduleEvent dispatch. Latency ends at the first finite PCM sample above 1e-8; pre-input nonzero PCM invalidates the trial. The 10 ms comparison is an observation only. No hardware output latency is measured.',
  denseFixture:'128 real engine NoteOns (16 logical channels × 8 pitches), program 0 with isDrum=false on every channel including 9, velocity 100, app volume 40%, effects disabled; finite/nonzero PCM, peak and |sample|>=1 count recorded.',
  memoryBudget:'Maximum observed sampled process-tree private bytes minus five-sample cold-page median <=160 MiB. Threshold unchanged.',
  voiceCount:'Record the actual exposed metric if present; requested NoteOn count does not prove that 128 synth voices were instantiated.',
  claims:{soundQuality:'not assessed',physicalMidiLatency:'not measured; live input-to-PCM software latency is reported separately as an observation',instantaneousPeak:'not guaranteed by discrete sampling'}}};
let server;
let outputPath;
let processExitCode=0;
const preflightOnly=process.argv.includes('--preflight-only');
const bankArguments=process.argv.filter(argument=>argument.startsWith('--bank='));
const requestedBankId=bankArguments.length?bankArguments[0].slice('--bank='.length):null;
const selectedBankIds=requestedBankId===null?expectedBankIds:[requestedBankId];
const bankSelectionIsSubset=requestedBankId!==null;
report.bankSelection={requestedBankId,scope:bankSelectionIsSubset?'subset':'all-expected-banks',
 selectedBankIds:[...selectedBankIds],measuredBankIds:[],selectionMeasurementCompleted:false,fullExpectedSetCompleted:false};
function compactPreflightSummary(){
 const artifacts=report.artifacts;
 const sourceHashes=artifacts?.codeHashes?.source||{},distHashes=artifacts?.codeHashes?.dist||{};
 return{status:report.status==='FAILED'?'FAILED':'PREFLIGHT_ONLY',measurementsPerformed:false,
  appVersion:packageJson.version,
  sourceInputs:{fileCount:Object.keys(sourceHashes).length,missing:Object.values(sourceHashes).filter(file=>!file.exists).map(file=>file.path)},
  builtInputs:{fileCount:Object.keys(distHashes).length,missing:Object.values(distHashes).filter(file=>!file.exists).map(file=>file.path),
   appBundleSha256:distHashes['dist/assets/app.js']?.sha256||null,audioModuleSha256:distHashes['dist/assets/audio/index.js']?.sha256||null},
  sourceManifest:artifacts?.sourceManifest||null,distManifest:artifacts?.distManifest||null,
  bankSelection:{...report.bankSelection},
  banks:Array.isArray(artifacts?.banks)?artifacts.banks.map(bank=>({id:bank.id,format:bank.format,bytes:bank.bytes,
   sha256:bank.sha256,sourceSha256:bank.sourceAsset?.sha256||null,distSha256:bank.distAsset?.sha256||null,
   catalog:bank.catalog,metadataFileCount:bank.bundledMetadata?.length||0})):[],
  failures:report.failures.map(failure=>failure.message)};
}
try{
 assert.ok(bankArguments.length<=1,'Pass at most one --bank=<id> option');
 if(bankSelectionIsSubset)assert.ok(expectedBankIds.includes(requestedBankId),`Unknown --bank id: ${requestedBankId}`);
 const codeHashes=captureCodeHashes();
 const bankInputs=loadBankInputs();
 report.artifacts={codeHashes,...bankInputs};
 const missing=[...Object.values(report.artifacts.codeHashes.source),...Object.values(report.artifacts.codeHashes.dist)].filter(item=>!item.exists);
 assert.deepEqual(missing,[],'Source and production dist hash inputs must all exist');
 assert.ok(Array.isArray(report.artifacts.banks),'Bank inputs must be an iterable array');
 assert.equal(report.artifacts.banks.length,expectedBankIds.length,'Both expected bank inputs must be captured');
 for(let index=0;index<expectedBankIds.length;index+=1){
  const bank=report.artifacts.banks[index];
  assert.equal(bank.id,expectedBankIds[index],`Bank input ${index+1} has the wrong stable ID`);
  assert.ok(['SF2','SF3'].includes(bank.format)&&bank.bytes>0&&/^[a-f0-9]{64}$/i.test(bank.sha256),`${bank.id} has incomplete capture metadata`);
  assert.equal(bank.sourceAsset?.sha256,bank.sha256,`${bank.id} source bank hash does not match the capture`);
  assert.equal(bank.distAsset?.sha256,bank.sha256,`${bank.id} dist bank hash does not match the capture`);
  assert.ok(bank.catalog?.path&&bank.catalog.bytes>0&&/^[a-f0-9]{64}$/i.test(bank.catalog.sha256),`${bank.id} catalog capture is incomplete`);
  assert.ok(Array.isArray(bank.bundledMetadata)&&bank.bundledMetadata.length>0,`${bank.id} metadata file capture is empty`);
 }
 if(preflightOnly){
  report.status='PREFLIGHT_ONLY';
 }else{
  assert.equal(process.platform,'win32','This probe requires Windows PrivateMemorySize64 counters');
  const {server:staticServer,origin}=await createStaticServer();server=staticServer;report.runtime.origin=origin;
  for(const bank of report.artifacts.banks.filter(item=>selectedBankIds.includes(item.id))){
   const bankResult=await runBankProbe(bank,origin);
   report.banks.push(bankResult);
  }
  const selectedCompleted=report.banks.length===selectedBankIds.length&&report.banks.every(bank=>bank.status==='COMPLETED');
  const fullSetCompleted=!bankSelectionIsSubset&&selectedCompleted&&report.banks.length===expectedBankIds.length
   &&expectedBankIds.every(id=>report.banks.some(bank=>bank.bank?.id===id));
  const selectedBudgetResults=report.banks.map(bank=>bank.memorySummary?.budgetPassed??null);
  const budgetPassedForSelection=!selectedCompleted?null:selectedBudgetResults.every(value=>value===true)?true:
   selectedBudgetResults.some(value=>value===false)?false:null;
  report.bankSelection.measuredBankIds=report.banks.map(bank=>bank.bank?.id).filter(Boolean);
  report.bankSelection.selectionMeasurementCompleted=selectedCompleted;
  report.bankSelection.fullExpectedSetCompleted=fullSetCompleted;
  report.budgetPassedForSelection=budgetPassedForSelection;
  report.budgetPassed=fullSetCompleted?budgetPassedForSelection:null;
  report.acceptance={measurementCompleted:fullSetCompleted,measurementCompletedForSelection:selectedCompleted,
   fullExpectedSetCompleted:fullSetCompleted,memoryBudgetPassed:report.budgetPassed,
   memoryBudgetPassedForSelection:budgetPassedForSelection,
   readinessElapsedMs:report.banks.map(bank=>({bankId:bank.bank?.id,elapsedMs:bank.prepare?.elapsedToUiReadyMs??null})),
   densePcmFiniteNonzero:selectedCompleted&&report.banks.every(bank=>bank.denseFixture?.audio?.finite===true&&bank.denseFixture?.audio?.nonzeroSamples>0),
   denseClipping:report.banks.map(bank=>({bankId:bank.bank?.id,peak:bank.denseFixture?.audio?.peak??null,clippedSamples:bank.denseFixture?.audio?.clippedSamples??null})),
   observedVoiceCounts:report.banks.map(bank=>({bankId:bank.bank?.id,...(bank.denseFixture?.voiceCountObservation||{field:null,value:null,assertionMade:false})})),
   soundQuality:'not assessed',physicalMidiLatency:'not measured'};
  report.status=selectedCompleted?(fullSetCompleted?'COMPLETED':'COMPLETED_SUBSET'):'FAILED';
  if(!selectedCompleted){processExitCode=1;report.failures.push({message:'One or more selected bank runs did not complete all technical observations.'})}
  else if(budgetPassedForSelection===false){processExitCode=2;report.failures.push({message:'Measurement completed for the selected bank scope, but the unchanged 160 MiB private-memory budget was not met.'})}
  else if(budgetPassedForSelection===null){processExitCode=1;report.failures.push({message:'Selected bank observations completed, but the 160 MiB memory budget could not be evaluated because native-memory samples were incomplete.'})}
 }
}catch(error){
 report.status='FAILED';processExitCode=1;
 report.failures.push({message:String(error?.message||error),stack:String(error?.stack||error)});
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(preflightOnly){
  if(report.status==='RUNNING')report.status='PREFLIGHT_ONLY';
  if(report.status==='FAILED')processExitCode=1;
  console.log(JSON.stringify(compactPreflightSummary(),null,2));
 }else{
 report.finishedAt=new Date().toISOString();
 report.exitMeaning=processExitCode===2?'Completed measurement for the selected bank scope with one or more budget failures.':processExitCode===1?'Probe did not complete successfully.':report.status==='COMPLETED_SUBSET'?'Completed only the explicitly selected bank; full two-bank acceptance is incomplete.':'Completed.';
 const reportDir=path.join(root,'artifacts/audio-sf05/runs');
 fs.mkdirSync(reportDir,{recursive:true});
 outputPath=path.join(reportDir,`audio-performance-${runId}-${report.status}.json`);
 fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
 console.log(`SF-05 performance probe ${report.status}; selectedBankBudgetPassed=${report.budgetPassedForSelection??'not evaluated'}; fullSetBudgetPassed=${report.budgetPassed??'not evaluated'}`);
 console.log(`Report: ${outputPath}`);
 }
}
if(processExitCode)process.exitCode=processExitCode;
