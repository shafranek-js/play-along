import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const base='/play-along/';
const requests=[];
let requestPhase='before-engine';
const startedAt=new Date().toISOString();
const runId=`${startedAt.replace(/[:.]/g,'-')}-${process.pid}`;
const sourceManifest=JSON.parse(fs.readFileSync(path.join(root,'src/assets/audio/soundfont-manifest.json'),'utf8'));
const sha256File=relative=>{
 const file=path.join(root,relative);
 return fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
};
const codeHashes={
 sourceEngine:sha256File('src/audio/index.js'),
 sourceSynthWorklet:sha256File('src/audio/synth-worklet.js'),
 sourcePcmTap:sha256File('src/audio/pcm-tap-worklet.js'),
 sourceBrowserHarness:sha256File('tests/audio-browser.real.test.mjs'),
 builtEngine:sha256File('dist/assets/audio/index.js'),
 builtSynthWorklet:sha256File('dist/assets/audio/sf01-synth-worklet.js'),
 builtPcmTap:sha256File('dist/assets/audio/sf01-pcm-tap.js'),
};
const browserBanks=sourceManifest.banks.map(({id,format,bytes,sha256})=>({id,format,bytes,sha256}));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.sf2':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith(base+'__phase/')){
  requestPhase=decodeURIComponent(url.pathname.slice((base+'__phase/').length));
  res.writeHead(204);res.end();return;
 }
 requests.push({path:url.pathname,method:req.method,phase:requestPhase});
 if(url.pathname===base+'audio-test.html'){
  res.writeHead(200,{'content-type':types['.html']});
  res.end('<!doctype html><meta charset="utf-8"><title>SF-01 browser verifier</title><button id="start">Start audio verification</button>');
  return;
 }
 if(!url.pathname.startsWith(base)){
  res.writeHead(404);res.end('outside /play-along/');return;
 }
 const rel=decodeURIComponent(url.pathname.slice(base.length));
 const file=path.resolve(dist,rel);
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end('not found');return;
 }
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
let runtime=null;
let runEvidence=null;
let runFailure=null;
const pageErrors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 runtime={browserName:'chromium',browserVersion:browser.version(),executablePath:chromium.executablePath(),playwrightVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version,nodeVersion:process.version,platform:process.platform,architecture:process.arch};
 const page=await browser.newPage();
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(origin+base+'audio-test.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  window.__sf01Complete=new Promise((resolve,reject)=>{
   document.querySelector('#start').addEventListener('click',async()=>{
    const context=new AudioContext({sampleRate:48000});
    let engine;
    let evidence;
    let failure;
    try{
     await caches.delete('play-along-soundfont-bank-v1');
     const entry=await import('/play-along/assets/audio/index.js');
     const catalog=await entry.getSoundfontCatalog();
     const banks=Array.isArray(catalog)?catalog:catalog.banks;
     if(!Array.isArray(banks)||banks.length===0)throw new Error('empty soundfont catalog');
     const generalUser=banks.find(bank=>bank.id==='generaluser-gs-2.0.3-sf2');
     const museScore=banks.find(bank=>bank.id==='musescore-general-0.2-sf3');
     if(!generalUser||!museScore)throw new Error('both pinned SF2 and SF3 banks must be switchable');
     engine=await entry.createPlaybackAudioEngine(context);
     await fetch('/play-along/__phase/before-general-load');
     const initial=engine.getState();
     if(!initial.engineReady||initial.bankIndexed||initial.lifecycle!=='engine-ready')throw new Error('initialized state must be distinct from bank indexing and patch readiness');
     const loaded=await engine.loadBank();
     if(loaded.id!==generalUser.id)throw new Error('manifest default bank is not GeneralUser');
     await fetch('/play-along/__phase/after-general-load');
     const indexed=engine.getState();
     if(!indexed.bankIndexed||indexed.preparedPatches.length!==0||indexed.lifecycle!=='bank-indexed')throw new Error('indexing must not imply patch preparation');
     const gm=loaded.presets.filter(p=>!p.isDrum&&p.bankMSB===0&&p.bankLSB===0&&p.program>=0&&p.program<=127);
     const programs=[...new Set(gm.map(p=>p.program))].sort((a,b)=>a-b);
     if(gm.length!==128||programs.length!==128||programs.some((p,i)=>p!==i))throw new Error('runtime GM bank 0 inventory is incomplete');

     // Initialize the optional diagnostic tap first; this does not prepare any bank sample.
     const tapWarmup=await engine.capturePcm({durationSeconds:0.1});
     if(tapWarmup.frames<=0||tapWarmup.channels!==2)throw new Error('optional PCM tap did not return stereo frames');
     const audition=async(noteId)=>{
      const capturePromise=engine.capturePcm({durationSeconds:1});
      await new Promise(resolve=>setTimeout(resolve,30));
      const at=context.currentTime+0.1;
      engine.scheduleEvent({group:'file',channel:0,at,type:'programChange',program:0});
      const sequence=engine.scheduleEvent({group:'file',channel:0,at,type:'noteOn',pitch:60,velocity:90,noteId});
      engine.scheduleEvent({group:'file',channel:0,at:at+0.38,type:'noteOff',pitch:60,noteId});
      const pcm=await capturePromise;
      const timing=engine.getMetrics().timingSamples.filter(sample=>sample.sequence===sequence);
      const begin=Math.max(0,Math.floor((at-pcm.startedAt)*pcm.sampleRate));
      const end=Math.min(pcm.frames,Math.ceil((at+0.38-pcm.startedAt)*pcm.sampleRate));
      let nonzero=0;
      for(const channel of pcm.samples)for(let i=begin;i<end;i++)if(channel[i]!==0)nonzero++;
      if(pcm.channels!==2||pcm.frames<=0||pcm.samples.some(channel=>channel.some(sample=>!Number.isFinite(sample)))||pcm.peak<=0||pcm.rms<=0||nonzero===0)throw new Error('scheduled note window lacks finite nonzero PCM');
      if(pcm.startedAt>at||pcm.endedAt<at+0.38||end<=begin)throw new Error('PCM capture missed part of the scheduled note interval');
      if(timing.length!==1||!Number.isFinite(timing[0].errorSeconds))throw new Error('scheduler telemetry is missing this NoteOn');
      return {sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,peak:pcm.peak,rms:pcm.rms,nonzeroNoteWindowSamples:nonzero,scheduledAt:at,appliedAt:timing[0].actualAt,schedulerErrorSeconds:timing[0].errorSeconds};
     };
     const cold=await audition('sf01-cold-note');
     const request=[{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:90}]}];
     const preparation=await engine.preparePatches(request);
     const prepared=engine.getState();
     if(!prepared.bankIndexed||prepared.preparedPatches.length===0||prepared.lifecycle!=='ready')throw new Error('preparation did not make the requested patch ready');
     const warm=await audition('sf01-warm-note');
     const preparationRepeat=await engine.preparePatches(request);
     const generalUserMetrics=engine.getMetrics();

     // Queue an old-bank NoteOn far enough ahead to overlap a bank replacement.
     // A successful replacement must clear it before the scheduled interval.
     await engine.setEffects({enabled:false,reverbGain:0.31,chorusGain:0.17});
     engine.setMasterGain(0.23);
     const activeCapturePromise=engine.capturePcm({durationSeconds:1});
     await new Promise(resolve=>setTimeout(resolve,30));
     const activeAt=context.currentTime+0.1;
     engine.scheduleEvent({group:'file',channel:0,at:activeAt,type:'programChange',program:0});
     engine.scheduleEvent({group:'file',channel:0,at:activeAt,type:'noteOn',pitch:60,velocity:100,noteId:'old-bank-active-note'});
     engine.scheduleEvent({group:'file',channel:0,at:activeAt+12,type:'noteOff',pitch:60,noteId:'old-bank-active-note'});
     const activePcm=await activeCapturePromise;
     const activeStart=Math.max(0,Math.floor((activeAt-activePcm.startedAt)*activePcm.sampleRate));
     const activeEnd=Math.min(activePcm.frames,Math.ceil((activeAt+0.38-activePcm.startedAt)*activePcm.sampleRate));
     let activeWindowNonzero=0;
     for(const channel of activePcm.samples)for(let i=activeStart;i<activeEnd;i++)if(channel[i]!==0)activeWindowNonzero++;
     if(activeWindowNonzero===0||activeEnd<=activeStart)throw new Error('positive control old-bank active voice did not reach PCM');
     const staleAt=context.currentTime+8;
     engine.scheduleEvent({group:'file',channel:0,at:staleAt,type:'programChange',program:0});
     engine.scheduleEvent({group:'file',channel:0,at:staleAt,type:'noteOn',pitch:60,velocity:100,noteId:'old-bank-queued-note'});
     engine.scheduleEvent({group:'file',channel:0,at:staleAt+0.4,type:'noteOff',pitch:60,noteId:'old-bank-queued-note'});
     await fetch('/play-along/__phase/before-muse-load');
     const museLoaded=await engine.loadBank(museScore.id);
     await fetch('/play-along/__phase/after-muse-load');
     const afterSwap=engine.getState();
     const afterSwapMetrics=engine.getMetrics();
     if(afterSwap.bankId!==museScore.id||!afterSwap.bankIndexed||afterSwap.preparedPatches.length!==0||afterSwap.lifecycle!=='bank-indexed')throw new Error('bank replacement must index the selected SF3 and clear old prepared state');
     if(afterSwapMetrics.masterGain!==0.23||afterSwapMetrics.effects.enabled!==false||afterSwapMetrics.effects.reverbGain!==0.31||afterSwapMetrics.effects.chorusGain!==0.17)throw new Error('bank replacement must retain app master gain and effects settings');
     await new Promise(resolve=>setTimeout(resolve,100));
     const postSwapTail=await engine.capturePcm({durationSeconds:0.8});
     let postSwapTailNonzero=0;
     for(const channel of postSwapTail.samples)for(const sample of channel)if(sample!==0)postSwapTailNonzero++;
     if(postSwapTailNonzero!==0)throw new Error('active voice from the old bank continued into post-swap PCM');
     const museGM=museLoaded.presets.filter(p=>!p.isDrum&&p.bankMSB===0&&p.bankLSB===0&&p.program>=0&&p.program<=127);
     const musePrograms=[...new Set(museGM.map(p=>p.program))].sort((a,b)=>a-b);
     if(museGM.length!==128||musePrograms.length!==128||musePrograms.some((p,i)=>p!==i))throw new Error('runtime MuseScore GM bank 0 inventory is incomplete');
     const museCold=await audition('sf01-muse-cold-note');
     const musePreparation=await engine.preparePatches(request);
     const musePrepared=engine.getState();
     if(!musePrepared.bankIndexed||musePrepared.preparedPatches.length===0||musePrepared.lifecycle!=='ready')throw new Error('MuseScore patch preparation did not update state');
     const museWarm=await audition('sf01-muse-warm-note');
     const musePreparationRepeat=await engine.preparePatches(request);
     const cache=await caches.open('play-along-soundfont-bank-v1');
     const cachedHashes=(await cache.keys()).map(key=>new URL(key.url).searchParams.get('__sf01_sha256')).filter(Boolean);
     if(!cachedHashes.includes(generalUser.sha256)||!cachedHashes.includes(museScore.sha256))throw new Error('each bank must have a content-hash cache entry');

     const waitUntil=Math.max(0,(staleAt-context.currentTime-0.12)*1000);
     if(waitUntil>0)await new Promise(resolve=>setTimeout(resolve,waitUntil));
     if(context.currentTime>=staleAt)throw new Error('browser run exceeded the old-bank queued event horizon');
     const silenceCapture=await engine.capturePcm({durationSeconds:0.8});
     const silenceStart=Math.max(0,Math.floor((staleAt-silenceCapture.startedAt)*silenceCapture.sampleRate));
     const silenceEnd=Math.min(silenceCapture.frames,Math.ceil((staleAt+0.4-silenceCapture.startedAt)*silenceCapture.sampleRate));
     let staleWindowNonzero=0;
     for(const channel of silenceCapture.samples)for(let i=silenceStart;i<silenceEnd;i++)if(channel[i]!==0)staleWindowNonzero++;
     if(silenceEnd<=silenceStart||silenceCapture.startedAt>staleAt||silenceCapture.endedAt<staleAt+0.4||staleWindowNonzero!==0)throw new Error('old-bank queued NoteOn leaked PCM after the SF3 bank swap');

     const cachedBankBuffer=async sha256=>{
      const cache=await caches.open('play-along-soundfont-bank-v1');
      const key=(await cache.keys()).find(request=>new URL(request.url).searchParams.get('__sf01_sha256')===sha256);
      if(!key)throw new Error('missing content-hash cache entry for supplied-buffer ownership check');
      const cached=await cache.match(key);
      if(!cached)throw new Error('cached bank response disappeared before supplied-buffer ownership check');
      return cached.arrayBuffer();
     };
     const transferredBankInput=await cachedBankBuffer(generalUser.sha256);
     const transferredBank=await engine.loadBank(generalUser.id,{bytes:transferredBankInput,transferOwnership:true});
     const transferredGM=transferredBank.presets.filter(p=>!p.isDrum&&p.bankMSB===0&&p.bankLSB===0&&p.program>=0&&p.program<=127);
     if(transferredBankInput.byteLength!==0)throw new Error('explicit transferOwnership must detach the supplied bank ArrayBuffer after posting');
     if(transferredBank.id!==generalUser.id||transferredGM.length!==128)throw new Error('the explicitly transferred real SF2 must still index all 128 runtime GM programs');

     const copiedBankInput=await cachedBankBuffer(museScore.sha256);
     const copiedInputBytes=copiedBankInput.byteLength;
     const copiedInputSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copiedBankInput)),byte=>byte.toString(16).padStart(2,'0')).join('');
     const copiedBank=await engine.loadBank(museScore.id,{bytes:copiedBankInput});
     const copiedInputShaAfter=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copiedBankInput)),byte=>byte.toString(16).padStart(2,'0')).join('');
     const copiedGM=copiedBank.presets.filter(p=>!p.isDrum&&p.bankMSB===0&&p.bankLSB===0&&p.program>=0&&p.program<=127);
     if(copiedBankInput.byteLength!==copiedInputBytes||copiedInputShaAfter!==copiedInputSha)throw new Error('default supplied-buffer loading must preserve all caller bytes');
     if(copiedBank.id!==museScore.id||copiedGM.length!==128)throw new Error('the copied real SF3 must still index all 128 runtime GM programs');
     const ownershipMetrics=engine.getMetrics();
     if(ownershipMetrics.masterGain!==0.23||ownershipMetrics.effects.enabled!==false||ownershipMetrics.effects.reverbGain!==0.31||ownershipMetrics.effects.chorusGain!==0.17)throw new Error('supplied-buffer bank swaps must retain master gain and effects settings');
     const ownership={transfer:{bankId:transferredBank.id,inputBytesAfterPost:transferredBankInput.byteLength,gmProgramCount:transferredGM.length},copy:{bankId:copiedBank.id,inputBytesBefore:copiedInputBytes,inputBytesAfter:copiedBankInput.byteLength,sha256Before:copiedInputSha,sha256After:copiedInputShaAfter,gmProgramCount:copiedGM.length},retainedMasterGain:ownershipMetrics.masterGain,effects:ownershipMetrics.effects};

     const metrics=engine.getMetrics();
     const disposeStarted=performance.now();
     await engine.dispose();
     const disposeMs=performance.now()-disposeStarted;
     const disposed=engine.getState();
     let postDisposeErrorCode;
     try{await engine.loadBank(generalUser.id);}catch(error){postDisposeErrorCode=error.code;}
     if(disposed.lifecycle!=='disposed'||postDisposeErrorCode!=='ENGINE_DISPOSED')throw new Error('dispose did not leave a bounded, terminal engine state');
     evidence={browser:{userAgent:navigator.userAgent,secureContext:isSecureContext,contextSampleRate:context.sampleRate},catalogBanks:banks.map(bank=>({id:bank.id,format:bank.format,bytes:bank.bytes})),generalUser:{id:loaded.id,format:loaded.format,bytes:loaded.bytes,sha256:loaded.sha256,presetCount:loaded.presets.length,gmProgramCount:programs.length,metrics:generalUserMetrics,preparation,preparationRepeat,cold,warm},museScore:{id:museLoaded.id,format:museLoaded.format,bytes:museLoaded.bytes,sha256:museLoaded.sha256,presetCount:museLoaded.presets.length,gmProgramCount:musePrograms.length,metrics:afterSwapMetrics,preparation:musePreparation,preparationRepeat:musePreparationRepeat,cold:museCold,warm:museWarm},stateBeforeLoad:initial,stateAfterIndex:indexed,stateAfterPrepare:prepared,stateAfterSwap:afterSwap,stateAfterMusePrepare:musePrepared,stateAfterDispose:disposed,activeWindowNonzero:activeWindowNonzero,postSwapTailNonzero,staleWindowNonzero,staleAt,cachedHashes,metrics,disposeMs,postDisposeErrorCode};
     evidence.ownership=ownership;
    }catch(error){failure=new Error(String(error?.stack||error));}
    try{if(engine)await engine.dispose();await context.close();}catch(error){failure??=new Error(String(error?.stack||error));}
    if(failure)reject(failure);else resolve(evidence);
   },{once:true});
  });
 });
 await page.locator('#start').click();
 let timeoutId;
 let evidence;
 try{
  evidence=await Promise.race([
   page.evaluate(()=>window.__sf01Complete),
   new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('SF-01 browser verification timed out')),60000);})
  ]);
  runEvidence=evidence;
 }finally{clearTimeout(timeoutId);}
 assert.equal(evidence.browser.secureContext,true,'localhost must provide secure-context AudioWorklet support');
 assert.equal(evidence.generalUser.bytes,32319396);
 assert.equal(evidence.generalUser.sha256,'9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe');
 assert.equal(evidence.museScore.bytes,39900972);
 assert.equal(evidence.museScore.sha256,'5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3');
 assert.equal(evidence.museScore.format,'SF3');
 assert.ok(evidence.generalUser.gmProgramCount===128&&evidence.museScore.gmProgramCount===128);
 assert.equal(evidence.ownership.transfer.inputBytesAfterPost,0,'explicit ownership transfer detaches the supplied buffer');
 assert.equal(evidence.ownership.transfer.gmProgramCount,128,'transferred real SF2 still indexes all 128 runtime GM programs');
 assert.equal(evidence.ownership.copy.inputBytesAfter,evidence.ownership.copy.inputBytesBefore,'default supplied-buffer loading preserves caller byte length');
 assert.equal(evidence.ownership.copy.sha256After,evidence.ownership.copy.sha256Before,'default supplied-buffer loading preserves caller content');
 assert.equal(evidence.ownership.copy.gmProgramCount,128,'copied real SF3 still indexes all 128 runtime GM programs');
 assert.ok(evidence.generalUser.cold.nonzeroNoteWindowSamples>0&&evidence.generalUser.warm.nonzeroNoteWindowSamples>0);
 assert.ok(evidence.museScore.cold.nonzeroNoteWindowSamples>0&&evidence.museScore.warm.nonzeroNoteWindowSamples>0);
 for(const sample of [evidence.generalUser.cold,evidence.generalUser.warm,evidence.museScore.cold,evidence.museScore.warm]){
  assert.ok(Number.isFinite(sample.appliedAt)&&Number.isFinite(sample.scheduledAt)&&Number.isFinite(sample.schedulerErrorSeconds),
   'scheduled and applied timestamps must share the AudioContext time basis');
  assert.ok(Math.abs((sample.appliedAt-sample.scheduledAt)-sample.schedulerErrorSeconds)<1e-9,
   'scheduler error must equal the measured AudioContext timestamp difference');
 }
 assert.ok(Array.isArray(evidence.metrics.preparations)&&evidence.metrics.preparations.length>=4,
  'first preparation and repeat preparation timings must be retained');
 assert.ok(evidence.metrics.preparations.filter(item=>item.preparationPass==='first-request').length>=2);
 assert.ok(evidence.metrics.preparations.filter(item=>item.preparationPass==='repeat-request').length>=2);
 assert.equal(evidence.staleWindowNonzero,0,'queued note from prior bank must not reach PCM after swap');
 assert.ok(evidence.activeWindowNonzero>0,'old-bank active-note negative-control window must be audible before swap');
 assert.equal(evidence.postSwapTailNonzero,0,'old-bank active-note tail must stop after replacement');
 assert.ok(evidence.disposeMs<5000,'engine dispose should acknowledge promptly; measured '+evidence.disposeMs+'ms');
 assert.equal(evidence.postDisposeErrorCode,'ENGINE_DISPOSED');
 assert.deepEqual([...evidence.cachedHashes].sort(),[
  '5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3',
  '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe',
 ].sort(),'both banks must be cached under their independent content hashes');
 assert.equal(pageErrors.length,0,'browser page errors: '+pageErrors.join('; '));
 const assetRequests=requests.filter(request=>request.path!==base+'audio-test.html');
 assert.ok(assetRequests.length>0,'browser test made no asset requests');
 assert.ok(assetRequests.every(request=>request.path.startsWith(base)),
  'entry, manifest, bank, and worklet requests must remain below /play-along/');
 const networkBanks=assetRequests.filter(request=>/\.sf[23]$/i.test(request.path));
 assert.deepEqual(networkBanks.map(request=>[path.posix.basename(request.path),request.phase]),[
  ['GeneralUser-GS-2.0.3.sf2','before-general-load'],
  ['MuseScore_General.sf3','before-muse-load'],
 ],'only the selected bank should be fetched for each explicit bank-load phase');
 console.log('SF01 REAL BROWSER:',JSON.stringify(evidence));
 console.log('SF01 SUBPATH REQUESTS:',JSON.stringify(assetRequests));
}catch(error){
 runFailure={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)};
 throw error;
}finally{
 try{if(browser)await browser.close();}catch(error){if(!runFailure)runFailure={name:error?.name||'Error',message:`Browser cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){if(!runFailure)runFailure={name:error?.name||'Error',message:`Server cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 const finishedAt=new Date().toISOString();
 const artifactDir=path.join(root,'artifacts','audio-sf01','runs');
 fs.mkdirSync(artifactDir,{recursive:true});
 const artifactPath=path.join(artifactDir,`real-browser-${runId}-${runFailure?'FAIL':'PASS'}.json`);
 fs.writeFileSync(artifactPath,JSON.stringify({schemaVersion:1,runId,test:'SF-01 both-bank real browser loader/PCM/ownership acceptance',status:runFailure?'FAIL':'PASS',startedAt,finishedAt,runtime,codeHashes,banks:browserBanks,evidence:runEvidence,pageErrors,requests,error:runFailure},null,2)+'\n');
 console.log('SF01 RUN ARTIFACT:',artifactPath);
}
