import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const base='/play-along/';
const startedAt=new Date().toISOString();
const runId=`${startedAt.replace(/[:.]/g,'-')}-${process.pid}`;
const artifactDir=path.join(root,'artifacts','audio-sf04','runs');
const browserTarget=process.env.AUDIO_BROWSER||'chromium';
const browserTypes={chromium,firefox,webkit};
if(!Object.hasOwn(browserTypes,browserTarget))throw new Error('AUDIO_BROWSER must be chromium, firefox, or webkit');
const sha256=relative=>{
 const file=path.join(root,relative);
 return fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
};
const codeHashes={
 sourceAppHtml:sha256('src/index.html'),
 sourceAudioUi:sha256('src/legacy/parts/20-workspace-ui.js'),
 sourceAudioTransport:sha256('src/legacy/parts/40-audio-transport.js'),
 sourceBackup:sha256('src/legacy/parts/175-backup-recovery.js'),
 sourceRuntime:sha256('src/legacy/parts/00-runtime.js'),
 sourceEngine:sha256('src/audio/index.js'),
 sourceSynthWorklet:sha256('src/audio/synth-worklet.js'),
 sourceHarness:sha256('tests/audio-settings.real.test.mjs'),
 builtAppHtml:sha256('dist/index.html'),
 builtEngine:sha256('dist/assets/audio/index.js'),
 builtSynthWorklet:sha256('dist/assets/audio/sf01-synth-worklet.js'),
 builtPcmTap:sha256('dist/assets/audio/sf01-pcm-tap.js'),
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.sf2':'application/octet-stream','.sf3':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const requests=[];
let phase='startup';
let failNextMuse=false;
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1');
 if(url.pathname.startsWith(base+'__audit/phase/')){
  phase=decodeURIComponent(url.pathname.slice((base+'__audit/phase/').length));
  response.writeHead(204);response.end();return;
 }
 if(!url.pathname.startsWith(base)){response.writeHead(404);response.end('outside /play-along/');return;}
 const relative=decodeURIComponent(url.pathname.slice(base.length));
 if(relative===''){
  requests.push({path:url.pathname,phase,status:200});
  response.writeHead(200,{'content-type':mime['.html']});
  fs.createReadStream(path.join(dist,'index.html')).pipe(response);return;
 }
 const file=path.resolve(dist,relative);
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  requests.push({path:url.pathname,phase,status:404});response.writeHead(404);response.end('not found');return;
 }
 if(failNextMuse&&relative.endsWith('/MuseScore_General.sf3')){
  failNextMuse=false;requests.push({path:url.pathname,phase,status:503,deliberate:true});
  response.writeHead(503,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});response.end('deliberate one-shot SF-04 retry fixture');return;
 }
 requests.push({path:url.pathname,phase,status:200});
 response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
 fs.createReadStream(file).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
let context;
let page;
let runtime=null;
let evidence=null;
let failure=null;
let failureSnapshot=null;
let failureScreenshot=null;
let failureScreenshotError=null;
const screenshots={};
const activePlaybackResults=[];
const pageErrors=[];
const partialEvidence={liveDrums:[]};
try{
 const browserType=browserTypes[browserTarget];
 browser=await browserType.launch({headless:true,...(browserTarget==='chromium'?{args:['--no-sandbox']}:{})});
 runtime={browserName:browserTarget,browserVersion:browser.version(),executablePath:browserType.executablePath(),playwrightVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version,nodeVersion:process.version,platform:process.platform,architecture:process.arch};
 context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 page=await context.newPage();
 page.on('pageerror',error=>pageErrors.push(error.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('__sf04-seeded-fallback'))return;
  const key='playalong:smart-practice:v07';
  const saved=JSON.parse(localStorage.getItem(key)||'{}');
  saved.audioSettings={backend:'soundfont',bankId:null,livePreset:{bankMSB:127,bankLSB:127,program:0,isDrum:false},useFilePrograms:true};
  localStorage.setItem(key,JSON.stringify(saved));
  sessionStorage.setItem('__sf04-seeded-fallback','yes');
 });
 await page.goto(origin+base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.audio?.getStatus&&window.__prototypeTest?.state);
 const audioCapabilities=await page.evaluate(()=>({
  audioContext:typeof window.AudioContext,
  webkitAudioContext:typeof window.webkitAudioContext,
  audioWorkletNode:typeof window.AudioWorkletNode,
  isSecureContext:window.isSecureContext===true,
 }));
 runtime.audioCapabilities=audioCapabilities;
 const hasAudioContext=audioCapabilities.audioContext==='function'||audioCapabilities.webkitAudioContext==='function';
 if(browserTarget!=='chromium'&&(!hasAudioContext||audioCapabilities.audioWorkletNode!=='function'||!audioCapabilities.isSecureContext)){
  const error=new Error(`UNSUPPORTED_ENVIRONMENT: real Web Audio worklets unavailable in ${browserTarget}: ${JSON.stringify(audioCapabilities)}`);
  error.code='UNSUPPORTED_ENVIRONMENT';
  throw error;
 }
 const waitForAudioReady=async(bankId,{timeout=90000}={})=>{
  const handle=await page.waitForFunction(expectedBankId=>{
   const app=window.__prototypeTest,status=app?.audio?.getStatus?.();
   if(status?.lifecycle==='ready'&&status?.activeBank?.id===expectedBankId)
    return {kind:'ready',bankId:status.activeBank.id};
   if(status?.error!=null||status?.lifecycle==='error'){
    const error=status?.error;
    let serializedError='';
    try{serializedError=JSON.stringify(error);}catch{}
    const message=typeof error==='string'?error:error?.message||error?.code||serializedError||String(error)||'unknown audio readiness error';
    return {kind:'error',message,status:{lifecycle:status?.lifecycle,selectedBankId:status?.selectedBankId,activeBankId:status?.activeBank?.id,pendingBankId:status?.pendingBank?.id,request:status?.request,error,diagnostics:status?.diagnostics}};
   }
   return false;
  },bankId,{timeout});
  const outcome=await handle.jsonValue();
  if(outcome?.kind==='error')throw new Error(`Audio readiness failed for ${bankId}: ${outcome.message}; status=${JSON.stringify(outcome.status)}`);
  return outcome;
 };
 const prepareAudioThroughUiIfIdle=async bankId=>{
  const current=await page.evaluate(()=>{
   const status=window.__prototypeTest?.audio?.getStatus?.();
   return {lifecycle:status?.lifecycle,activeBankId:status?.activeBank?.id,request:status?.request,pendingBankId:status?.pendingBank?.id};
  });
  if(current.lifecycle==='ready'&&current.activeBankId===bankId)return current;
  if(current.request||current.pendingBankId)return waitForAudioReady(bankId);
  const prepare=page.locator('#audioRetry');
  if(!(await prepare.isVisible())||!(await prepare.isEnabled()))throw new Error(`Cannot prepare ${bankId} from idle UI state: ${JSON.stringify(current)}`);
  await prepare.click();
  return waitForAudioReady(bankId);
 };
 await page.locator('[data-righttab="midi"]').click();
 assert.equal(await page.locator('#audioStatus').getAttribute('role'),'status');
 assert.equal(await page.locator('#audioBankSelect').inputValue(),'generaluser-gs-2.0.3-sf2');

 await page.request.get(origin+base+'__audit/phase/initial-selected-bank');
 await page.locator('#audioRetry').click();
 await waitForAudioReady('generaluser-gs-2.0.3-sf2');
 const initialFallback=await page.evaluate(()=>{
  const status=window.__prototypeTest.audio.getStatus();
  const notice=status.notice;
  return {livePreset:status.livePreset,notice:typeof notice==='string'?notice:notice?.message||'',noticeCode:typeof notice==='object'?notice?.code||null:null,
   detail:document.querySelector('#audioStatusDetail')?.textContent||''};
 });
 assert.deepEqual(initialFallback.livePreset,{bankMSB:0,bankLSB:0,program:0,isDrum:false},'an unavailable saved patch must normalize to the real GM piano preset');
 assert.match(initialFallback.detail,/127:127:0/,'the live status region must disclose the concrete unavailable saved patch');
 assert.match(initialFallback.detail,/Grand Piano/,'the live status region must name the selected fallback preset');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.audio?.getStatus&&window.__prototypeTest?.state);
 const normalizedAfterReload=await page.evaluate(()=>window.__prototypeTest.state.audioSettings.livePreset);
 assert.deepEqual(normalizedAfterReload,{bankMSB:0,bankLSB:0,program:0,isDrum:false},'the normalized piano patch must survive reload');
 await page.locator('#audioRetry').click();
 await waitForAudioReady('generaluser-gs-2.0.3-sf2');
 const fallbackAfterReload=await page.evaluate(()=>{
  const status=window.__prototypeTest.audio.getStatus();
  const notice=status.notice;
  return {notice:typeof notice==='string'?notice:notice?.message||'',detail:document.querySelector('#audioStatusDetail')?.textContent||''};
 });
 assert.ok(!fallbackAfterReload.notice.includes('127:127:0')&&!fallbackAfterReload.detail.includes('127:127:0'),'a successfully normalized fallback notice must not repeat after reload');
 const initialBankRequests=requests.filter(item=>item.phase==='initial-selected-bank'&&/\.sf[23]$/i.test(item.path));
 assert.ok(initialBankRequests.some(item=>item.path.endsWith('GeneralUser-GS-2.0.3.sf2')&&item.status===200),'the selected default SF2 must be requested successfully');
 assert.ok(!initialBankRequests.some(item=>item.path.endsWith('MuseScore_General.sf3')),'the unselected SF3 must not be requested at startup');

 const gmOptions=await page.locator('#audioLivePresetSelect option').evaluateAll(options=>options.map(option=>({value:option.value,label:option.textContent.trim()})));
 const gmPrograms=[...new Set(gmOptions.map(option=>Number(option.value.split(':')[2])))].sort((a,b)=>a-b);
 assert.equal(gmOptions.length,128,'UI GM selector must expose the complete runtime bank-0 list');
 assert.deepEqual(gmPrograms,Array.from({length:128},(_,index)=>index));
 const status=await page.evaluate(()=>window.__prototypeTest.audio.getStatus());
 assert.equal(status.backend,'soundfont');

 // Use the keyboard on the native select, then assert its asynchronous patch
 // preparation completed and persisted through the real UI handler.
 const preset=page.locator('#audioLivePresetSelect');
 await preset.focus();
 const beforeKeyboardValue=await preset.inputValue();
 await preset.press('End');
 await preset.press('Enter');
 await page.waitForFunction(previousValue=>{
  const control=document.querySelector('#audioLivePresetSelect');
  const value=control?.value||'',selected=value.split(':').map(Number);
  const status=window.__prototypeTest?.audio?.getStatus?.(),live=status?.livePreset;
  return value!==previousValue&&!control?.disabled&&selected.length===4&&status?.lifecycle==='ready'&&!status.pendingBank&&!status.request&&
   live?.bankMSB===selected[0]&&live?.bankLSB===selected[1]&&live?.program===selected[2]&&Number(live?.isDrum)===selected[3];
 },beforeKeyboardValue,{timeout:30000});
 const keyboardSelected=await preset.inputValue();
 assert.notEqual(keyboardSelected,beforeKeyboardValue,'keyboard navigation must select a different available GM preset');
 await page.locator('#audioLivePresetSearch').fill(gmOptions[0].label.trim().split(/\s+/)[0]);
 const filtered=await page.locator('#audioLivePresetSelect option').evaluateAll(options=>options.map(option=>option.textContent.trim()));
 assert.ok(filtered.length>0&&filtered.every(label=>label.toLocaleLowerCase().includes(gmOptions[0].label.trim().split(/\s+/)[0].toLocaleLowerCase())),
  'preset search must filter the actual native selector options');
 await page.locator('#audioLivePresetSearch').fill('');

 // Force one real selected-bank request to fail. The visible selector should
 // return to the committed old bank, while Retry remembers the failed target.
 failNextMuse=true;
 await page.request.get(origin+base+'__audit/phase/muse-first-attempt');
 await page.locator('#audioBankSelect').selectOption('musescore-general-0.2-sf3');
 await page.waitForFunction(()=>{
  const status=window.__prototypeTest?.audio?.getStatus?.();
  const region=document.querySelector('#audioStatus');
  const wording=`${document.querySelector('#audioStatusTitle')?.textContent||''} ${document.querySelector('#audioStatusDetail')?.textContent||''}`;
  return status?.error!=null&&!status.pendingBank&&!status.request&&region?.dataset.tone==='error'&&/банк/i.test(wording);
 },null,{timeout:15000});
 const failedStatus=await page.evaluate(()=>window.__prototypeTest.audio.getStatus());
 assert.equal(failedStatus.activeBank?.id,'generaluser-gs-2.0.3-sf2','failed replacement must preserve the previously committed bank');
 assert.equal(await page.locator('#audioBankSelect').inputValue(),'generaluser-gs-2.0.3-sf2','failed selector change must return to the active bank');
 assert.equal(await page.locator('#audioRetry').isVisible(),true,'recoverable failure must expose a Retry control');
 const failedMuseRequests=requests.filter(item=>item.phase==='muse-first-attempt'&&item.path.endsWith('MuseScore_General.sf3'));
 assert.equal(failedMuseRequests.length,1);
 assert.equal(failedMuseRequests[0].status,503);
 await page.request.get(origin+base+'__audit/phase/muse-retry');
 await page.locator('#audioRetry').click();
 await page.waitForFunction(()=>{
  const current=window.__prototypeTest?.audio?.getStatus?.();
  return current?.lifecycle==='ready'&&current?.activeBank?.id==='musescore-general-0.2-sf3';
 },null,{timeout:90000});
 const retriedStatus=await page.evaluate(()=>window.__prototypeTest.audio.getStatus());
 assert.equal(await page.locator('#audioBankSelect').inputValue(),'musescore-general-0.2-sf3','Retry must load the remembered failed choice');
 assert.equal(retriedStatus.activeBank.id,'musescore-general-0.2-sf3');
 const museRetryRequests=requests.filter(item=>item.phase==='muse-retry'&&item.path.endsWith('MuseScore_General.sf3'));
 assert.ok(museRetryRequests.length>=1&&museRetryRequests.every(item=>item.status===200),'Retry must fetch and commit the selected SF3');
 const museOptions=await page.locator('#audioLivePresetSelect option').evaluateAll(options=>options.map(option=>option.value));
 assert.equal(museOptions.length,128,'SF3 bank switch must preserve the complete runtime GM selector');

 if(browserTarget==='chromium'){
  const beginFilePlayback=async(slot,durationSeconds=1.6)=>{
   await page.evaluate(async({slot,durationSeconds})=>{
    const app=window.__prototypeTest,audio=app.audio;
    app.pause();
    await audio.panic({group:'all'});
    await audio.ensureReady();
    app.loadSong({id:`sf04-${slot}`,title:'SoundFont cancellation fixture',author:'Verifier',type:'import',tracks:[{name:'Piano',notes:[{pitch:60,start:0,duration:8,velocity:85,track:0,channel:0,noteId:`${slot}-c4`}]}]});
    app.setMode('listen');
    app.seek(0);
    const engine=audio.engine;
    await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
    engine.setMasterGain(.25);
    await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:85},{pitch:67,velocity:85}]}]);
    const capture=engine.capturePcm({durationSeconds});
    window.__sf04PlaybackRuns??={};
    window.__sf04PlaybackRuns[slot]={engine,capture,noteAt:engine.context.currentTime,epochBefore:engine.epochFor('file')};
   },{slot,durationSeconds});
   await page.locator('#playBtn').click();
   await page.waitForFunction(()=>{
    const app=window.__prototypeTest;
    return app?.isPlaying===true&&app?.audio?.getStatus?.()?.transport?.isPlaying===true;
   },null,{timeout:60000});
   await page.waitForTimeout(300);
   return page.evaluate(slot=>({noteAt:window.__sf04PlaybackRuns[slot].noteAt,epochBefore:window.__sf04PlaybackRuns[slot].epochBefore,position:window.__prototypeTest.pos}),slot);
  };
  const measurePlaybackCapture=async(slot,stopAt,pendingAt=null)=>page.evaluate(async({slot,stopAt,pendingAt})=>{
   const run=window.__sf04PlaybackRuns[slot],pcm=await run.capture;
   const epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
   const measure=(from,to)=>{
    if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||pcm.startedAt>from+epsilon(from,pcm.startedAt)||pcm.endedAt<to-epsilon(to,pcm.endedAt))throw new Error(`UI cancellation PCM does not cover [${from}, ${to}]`);
    const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+epsilon((from-pcm.startedAt)*pcm.sampleRate));
    const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-epsilon((to-pcm.startedAt)*pcm.sampleRate));
    if(first<0||last>pcm.frames||last<=first)throw new Error(`UI cancellation PCM sample interval is incomplete: ${first}..${last}/${pcm.frames}`);
    let energy=0,count=0,nonzero=0;
    for(let index=first;index<last;index++)for(const channel of pcm.samples){const sample=channel[index];if(!Number.isFinite(sample))throw new Error('UI cancellation PCM has a non-finite sample');energy+=sample*sample;count++;if(sample!==0)nonzero++;}
    return {from,to,first,last,count,nonzero,rms:Math.sqrt(energy/count)};
   };
   return {sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,
    positive:measure(run.noteAt+.08,run.noteAt+.25),after:measure(stopAt+.12,stopAt+.34),
    pending:pendingAt==null?null:measure(pendingAt+.04,pendingAt+.24)};
  },{slot,stopAt,pendingAt});

  // The setting change must stop active file voices and keep the transport
  // paused; the pre-toggle PCM interval is a real-signal positive control.
  const toggleStart=await beginFilePlayback('active-program-toggle');
  const toggleBefore=await page.evaluate(()=>({position:window.__prototypeTest.pos,epoch:window.__prototypeTest.audio.engine.epochFor('file')}));
  assert.ok(toggleBefore.position>0&&toggleBefore.epoch>=toggleStart.epochBefore);
  await page.locator('#audioUseFilePrograms').uncheck();
  await page.waitForFunction(()=>window.__prototypeTest.isPlaying===false&&window.__prototypeTest.state.audioSettings.useFilePrograms===false,null,{timeout:30000});
  const toggleAfter=await page.evaluate(()=>({position:window.__prototypeTest.pos,epoch:window.__prototypeTest.audio.engine.epochFor('file'),at:window.__prototypeTest.audio.engine.context.currentTime}));
  const togglePcm=await measurePlaybackCapture('active-program-toggle',toggleAfter.at);
  assert.ok(togglePcm.positive.nonzero>0&&togglePcm.positive.rms>0,'file-program toggle PCM positive control must contain the playing file note');
  assert.ok(toggleAfter.epoch>toggleBefore.epoch,'changing file-program policy during playback must cancel the old file timeline');
  assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),false,'file-program toggle must not auto-resume playback');
  assert.ok(togglePcm.after.rms<togglePcm.positive.rms*.05,'file-program toggle must silence the active file voice in real PCM');
  activePlaybackResults.push({case:'active-file-program-toggle',start:toggleStart,before:toggleBefore,after:toggleAfter,pcm:togglePcm});
  await page.locator('#audioUseFilePrograms').check();
  await page.waitForFunction(()=>window.__prototypeTest.state.audioSettings.useFilePrograms===true);

  // Switching a bank while a file note is physically sounding must cancel
  // its old scheduled voice and leave playback paused after the new bank is
  // ready. The selected SF2/SF3 switch is driven through the actual control.
  const swapStart=await beginFilePlayback('active-bank-switch',2.5);
  const swapBefore=await page.evaluate(()=>({bank:window.__prototypeTest.audio.getStatus().activeBank.id,epoch:window.__prototypeTest.audio.engine.epochFor('file'),position:window.__prototypeTest.pos}));
  assert.equal(swapBefore.bank,'musescore-general-0.2-sf3');
  const pendingAt=await page.evaluate(()=>{
   const engine=window.__prototypeTest.audio.engine,at=engine.context.currentTime+.8;
   engine.scheduleEvent({group:'file',channel:0,at,type:'noteOn',pitch:67,velocity:85,noteId:'sf04-stale-after-bank-switch'});
   engine.scheduleEvent({group:'file',channel:0,at:at+.6,type:'noteOff',pitch:67,noteId:'sf04-stale-after-bank-switch'});
   return at;
  });
  const swapRequestedAt=await page.evaluate(()=>window.__prototypeTest.audio.engine.context.currentTime);
  await page.locator('#audioBankSelect').selectOption('generaluser-gs-2.0.3-sf2');
  await page.waitForFunction(()=>{
   const app=window.__prototypeTest,status=app?.audio?.getStatus?.();
   return app?.isPlaying===false&&status?.lifecycle==='ready'&&status?.activeBank?.id==='generaluser-gs-2.0.3-sf2';
  },null,{timeout:90000});
  const swapAfter=await page.evaluate(()=>({bank:window.__prototypeTest.audio.getStatus().activeBank.id,epoch:window.__prototypeTest.audio.engine.epochFor('file'),at:window.__prototypeTest.audio.engine.context.currentTime,position:window.__prototypeTest.pos}));
  const swapPcm=await measurePlaybackCapture('active-bank-switch',swapRequestedAt,pendingAt);
  assert.ok(swapPcm.positive.nonzero>0&&swapPcm.positive.rms>0,'bank-switch PCM positive control must contain the playing file note');
  assert.ok(swapAfter.epoch>swapBefore.epoch,'successful bank replacement during playback must invalidate the previous file epoch');
  assert.equal(swapAfter.bank,'generaluser-gs-2.0.3-sf2');
  assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),false,'bank replacement must leave transport paused');
  assert.ok(swapPcm.after.rms<swapPcm.positive.rms*.05,'bank replacement must cancel old file PCM rather than leave a stale voice sounding');
  assert.ok(swapPcm.pending.rms<swapPcm.positive.rms*.05,'bank replacement must purge a queued future file NoteOn before it can sound');
  activePlaybackResults.push({case:'active-bank-switch',start:swapStart,requestedAt:swapRequestedAt,before:swapBefore,after:swapAfter,pcm:swapPcm});

  // Select a real normalized drum preset from the runtime inventory, then
  // drive the app's live-note path and verify that kick/hat samples produce
  // finite, covered PCM. SF2 header bank 128 is never used as a MIDI bank.
  const priorLivePreset=await page.evaluate(()=>({...window.__prototypeTest.audio.getStatus().livePreset}));
  const runtimeDrumPreset=await page.evaluate(()=>{
   const audio=window.__prototypeTest.audio,status=audio.getStatus();
   const presets=audio.listPresets({group:'drums',bankId:status.activeBank.id});
   return presets.find(preset=>preset.bankMSB===0&&preset.bankLSB===0&&preset.program===0)||presets[0]||null;
  });
  assert.ok(runtimeDrumPreset?.isDrum,'the selected runtime bank must expose at least one normalized drum kit');
  for(const field of ['bankMSB','bankLSB','program'])assert.ok(Number.isInteger(runtimeDrumPreset[field])&&runtimeDrumPreset[field]>=0&&runtimeDrumPreset[field]<=127,`runtime drum ${field} must be a MIDI-range value`);
  await page.locator('#audioMorePresets').evaluate(element=>{element.open=true});
  await page.evaluate(()=>{
   const engine=window.__prototypeTest.audio.engine,original=engine.scheduleEvent.bind(engine);
   window.__sf04LiveDrumEvents=[];window.__sf04OriginalScheduleEvent=original;
   engine.scheduleEvent=event=>{
    const sequence=original(event);
    if(event.group==='live'&&['programChange','noteOn','noteOff'].includes(event.type))window.__sf04LiveDrumEvents.push({...event,sequence});
    return sequence;
   };
  });
  const drumPresetValue=`${runtimeDrumPreset.bankMSB}:${runtimeDrumPreset.bankLSB}:${runtimeDrumPreset.program}:1`;
  await page.locator('#audioExtraPresetSelect').selectOption(drumPresetValue);
  await page.waitForFunction(expected=>{
   const selected=window.__prototypeTest?.audio?.getStatus?.()?.livePreset;
   return selected?.isDrum===true&&selected.bankMSB===expected.bankMSB&&selected.bankLSB===expected.bankLSB&&selected.program===expected.program;
  },{bankMSB:runtimeDrumPreset.bankMSB,bankLSB:runtimeDrumPreset.bankLSB,program:runtimeDrumPreset.program},{timeout:30000});
  const drumProgramEvents=await page.evaluate(()=>window.__sf04LiveDrumEvents.filter(event=>event.type==='programChange'&&event.isDrum===true));
  assert.ok(drumProgramEvents.some(event=>event.bankMSB===runtimeDrumPreset.bankMSB&&event.bankLSB===runtimeDrumPreset.bankLSB&&event.program===runtimeDrumPreset.program),
   'the actual live preset selection must send the runtime inventory tuple, including isDrum, to the engine');
  const liveDrumPcm=[];
  for(const pitch of [36,42,46]){
   await page.evaluate(async({pitch,patch})=>{
    const app=window.__prototypeTest,audio=app.audio,engine=audio.engine;
    await audio.panic({group:'all'});
    await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});engine.setMasterGain(.25);
    await engine.preparePatches([{...patch,notes:[{pitch,velocity:85}]}]);
    const eventCount=window.__sf04LiveDrumEvents.length,capture=engine.capturePcm({durationSeconds:.8});
    window.__sf04LiveDrumRuns??={};window.__sf04LiveDrumRuns[pitch]={capture,eventCount,pitch,patch:{...patch},startedAt:engine.context.currentTime};
    app.receiveNoteOn(pitch);
   },{pitch,patch:{bankMSB:runtimeDrumPreset.bankMSB,bankLSB:runtimeDrumPreset.bankLSB,program:runtimeDrumPreset.program,isDrum:true}});
   await page.waitForFunction(expected=>window.__sf04LiveDrumEvents.some((event,index)=>index>=window.__sf04LiveDrumRuns[expected.pitch].eventCount&&event.type==='noteOn'&&event.pitch===expected.pitch&&event.group==='live'),{pitch},{timeout:10000});
   const onsetEvent=await page.evaluate(pitch=>window.__sf04LiveDrumEvents.find((event,index)=>index>=window.__sf04LiveDrumRuns[pitch].eventCount&&event.type==='noteOn'&&event.pitch===pitch&&event.group==='live'),pitch);
   assert.equal(onsetEvent.lane,undefined,'live-group MIDI NoteOn must not carry the file-only lane field');
   await page.waitForTimeout(140);
   await page.evaluate(pitch=>window.__prototypeTest.receiveNoteOff(pitch),pitch);
   const pcmSummary=await page.evaluate(async({pitch,onsetEvent})=>{
    const run=window.__sf04LiveDrumRuns[pitch],pcm=await run.capture;
    const from=onsetEvent.at+.015,to=onsetEvent.at+.12,epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
    if(pcm.startedAt>from+epsilon(pcm.startedAt,from)||pcm.endedAt<to-epsilon(pcm.endedAt,to))throw new Error(`live drum PCM does not cover [${from}, ${to}]`);
    const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+epsilon((from-pcm.startedAt)*pcm.sampleRate));
    const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-epsilon((to-pcm.startedAt)*pcm.sampleRate));
    if(first<0||last>pcm.frames||last<=first)throw new Error(`live drum PCM window is incomplete: ${first}..${last}/${pcm.frames}`);
    let energy=0,count=0,nonzero=0;
    for(let index=first;index<last;index++)for(const channel of pcm.samples){const sample=channel[index];if(!Number.isFinite(sample))throw new Error('live drum PCM contains a non-finite sample');energy+=sample*sample;count++;if(sample!==0)nonzero++;}
    return {pitch,patch:run.patch,noteEvent:{sequence:onsetEvent.sequence,at:onsetEvent.at,noteId:onsetEvent.noteId},sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,window:{from,to,first,last,count,nonzero,rms:Math.sqrt(energy/count)}};
   },{pitch,onsetEvent});
   liveDrumPcm.push(pcmSummary);
   partialEvidence.liveDrums.push(pcmSummary);
   assert.ok(pcmSummary.window.count>0&&pcmSummary.window.nonzero>0&&pcmSummary.window.rms>0,`runtime drum pitch ${pitch} must render finite nonzero PCM`);
  }
  assert.deepEqual(liveDrumPcm.map(item=>item.pitch),[36,42,46]);
  if(priorLivePreset.isDrum){await page.locator('#audioExtraPresetSelect').selectOption(`${priorLivePreset.bankMSB}:${priorLivePreset.bankLSB}:${priorLivePreset.program}:1`)}
  else{await page.locator('#audioLivePresetSelect').selectOption(`${priorLivePreset.bankMSB}:${priorLivePreset.bankLSB}:${priorLivePreset.program}:0`)}
  await page.waitForFunction(expected=>{
   const selected=window.__prototypeTest?.audio?.getStatus?.()?.livePreset;
   return selected?.bankMSB===expected.bankMSB&&selected?.bankLSB===expected.bankLSB&&selected?.program===expected.program&&selected?.isDrum===expected.isDrum;
  },priorLivePreset,{timeout:30000});
  await page.evaluate(()=>{const engine=window.__prototypeTest.audio.engine;if(window.__sf04OriginalScheduleEvent)engine.scheduleEvent=window.__sf04OriginalScheduleEvent;});

  // Panic is exercised with real held file and live voices, then measured at
  // the actual post-master PCM tap. The pre-panic interval is a positive control.
  await page.evaluate(async()=>{
   const engine=window.__prototypeTest.audio.getStatus()&&window.__prototypeTest.audio.engine;
   await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
   engine.setMasterGain(.25);
   await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:75}]}]);
   window.__sf04PanicEpoch={file:engine.epochFor('file'),live:engine.epochFor('live')};
   window.__sf04PanicPlan={engine,at:engine.context.currentTime+.12,
    capture:engine.capturePcm({durationSeconds:1.1})};
   const {at}=window.__sf04PanicPlan;
   engine.scheduleEvent({group:'file',channel:0,at:at-.03,type:'programChange',program:0,isDrum:false});
   engine.scheduleEvent({group:'file',channel:0,at,type:'noteOn',pitch:60,velocity:75,noteId:'sf04-panic-file'});
   engine.scheduleEvent({group:'file',channel:0,at:at+2,type:'noteOff',pitch:60,noteId:'sf04-panic-file'});
   engine.scheduleEvent({group:'live',channel:0,at,type:'noteOn',pitch:73,velocity:75,noteId:'sf04-panic-live'});
   engine.scheduleEvent({group:'live',channel:0,at:at+2,type:'noteOff',pitch:73,noteId:'sf04-panic-live'});
  });
  await new Promise(resolve=>setTimeout(resolve,330));
  await page.locator('#audioPanic').click();
  const panicEpoch=await page.evaluate(()=>({file:window.__prototypeTest.audio.engine.epochFor('file'),live:window.__prototypeTest.audio.engine.epochFor('live'),clock:window.__prototypeTest.audio.engine.context.currentTime}));
  const panicPcm=await page.evaluate(()=>window.__sf04PanicPlan.capture);
  const panicCapture=await page.evaluate(({pcm,plan})=>{
   const epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
   const windowRms=(from,to)=>{
    if(pcm.startedAt>from+epsilon(from,pcm.startedAt)||pcm.endedAt<to-epsilon(to,pcm.endedAt))throw new Error('panic PCM capture missed a requested window');
    const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+epsilon((from-pcm.startedAt)*pcm.sampleRate));
    const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-epsilon((to-pcm.startedAt)*pcm.sampleRate));
    if(first<0||last>pcm.frames||last<=first)throw new Error('panic PCM window is incomplete or empty');
    let sum=0,count=0,nonzero=0;
    for(let i=first;i<last;i++)for(const channel of pcm.samples){const sample=channel[i];if(!Number.isFinite(sample))throw new Error('panic PCM contains non-finite samples');sum+=sample*sample;count++;if(sample!==0)nonzero++;}
    return {from,to,first,last,count,nonzero,rms:Math.sqrt(sum/count)};
   };
   const pre=windowRms(plan.at+.02,plan.at+.24);
   const after=windowRms(plan.panicAt+.12,plan.panicAt+.38);
   return {sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,pre,after};
  },{pcm:panicPcm,plan:{at:await page.evaluate(()=>window.__sf04PanicPlan.at),panicAt:panicEpoch.clock}});
  assert.ok(panicCapture.pre.nonzero>0&&panicCapture.pre.rms>0,'Panic PCM positive control must contain both held voices');
  assert.ok(panicCapture.after.rms<panicCapture.pre.rms*.05,'Panic must silence active SoundFont voices in measured PCM');
  assert.ok(panicEpoch.file>0&&panicEpoch.live>0,'Panic button must cancel both file and live groups');

  // A failed selected-bank retry already ran above. Verify settings survive a
  // reload and the real v1 backup flow round-trips current and legacy values.
  await page.locator('#audioUseFilePrograms').uncheck();
  await page.waitForFunction(()=>window.__prototypeTest.state.audioSettings.useFilePrograms===false);
  const selectedPresetValue=await page.locator('#audioLivePresetSelect').inputValue();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__prototypeTest?.audio?.getStatus&&window.__prototypeTest?.state);
  const reloadedSettings=await page.evaluate(()=>window.__prototypeTest.state.audioSettings);
  assert.equal(reloadedSettings.bankId,'generaluser-gs-2.0.3-sf2');
  assert.equal(reloadedSettings.useFilePrograms,false);
  assert.equal(`${reloadedSettings.livePreset.bankMSB}:${reloadedSettings.livePreset.bankLSB}:${reloadedSettings.livePreset.program}:${Number(reloadedSettings.livePreset.isDrum)}`,selectedPresetValue);

  await page.locator('[data-page="library"]').click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#backupExport').click();
  const download=await downloadPromise;
  const backupPath=await download.path();
  const currentBackup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  assert.equal(currentBackup.format,'play-along-backup');
  assert.equal(currentBackup.version,1);
  assert.equal(currentBackup.settings.audioSettings.bankId,'generaluser-gs-2.0.3-sf2');
  assert.equal(currentBackup.settings.audioSettings.useFilePrograms,false);
  assert.ok(fs.statSync(backupPath).size<1024*1024,'backup should contain settings/repertoire data, not embedded SoundFont binaries');
  assert.ok(!JSON.stringify(currentBackup).includes('RIFFsfbk'),'backup must not embed bank binary bytes');

  const changeCurrentSettings=async()=>{
   await page.locator('[data-page="practice"]').click();
   await page.locator('[data-righttab="midi"]').click();
   await page.locator('#audioUseFilePrograms').check();
   await page.locator('#audioBankSelect').selectOption('generaluser-gs-2.0.3-sf2');
   await prepareAudioThroughUiIfIdle('generaluser-gs-2.0.3-sf2');
  };
  const restoreBackup=async payload=>{
   const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});
   await page.locator('#backupFile').setInputFiles({name:'sf04-settings-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
   await navigation;
   await page.waitForFunction(()=>window.__prototypeTest?.audio?.getStatus&&window.__prototypeTest?.state);
  };
  await changeCurrentSettings();
  await restoreBackup(currentBackup);
  const restoredCurrent=await page.evaluate(()=>window.__prototypeTest.state.audioSettings);
  assert.equal(restoredCurrent.bankId,'generaluser-gs-2.0.3-sf2');
  assert.equal(restoredCurrent.useFilePrograms,false);
  assert.equal(restoredCurrent.livePreset.program,currentBackup.settings.audioSettings.livePreset.program);

  const legacyBackup=structuredClone(currentBackup);
  delete legacyBackup.settings.audioSettings;
  await changeCurrentSettings();
  await restoreBackup(legacyBackup);
  const restoredLegacy=await page.evaluate(()=>window.__prototypeTest.state.audioSettings);
  assert.deepEqual(restoredLegacy,{backend:'soundfont',bankId:null,livePreset:{bankMSB:0,bankLSB:0,program:0,isDrum:false},useFilePrograms:true},
   'v1 backups without audioSettings must restore the documented audio defaults');
  await page.locator('[data-page="practice"]').click();
  await page.locator('[data-righttab="midi"]').click();
  await prepareAudioThroughUiIfIdle('generaluser-gs-2.0.3-sf2');
  await page.setViewportSize({width:1440,height:1000});
  screenshots.desktop=path.join(artifactDir,`settings-ui-${browserTarget}-${runId}-desktop.png`);
  fs.mkdirSync(artifactDir,{recursive:true});
  await page.screenshot({path:screenshots.desktop,fullPage:true,timeout:10000});
  evidence={coverage:'full Chromium SF-04 UI, retry, runtime drum-kit selector and live kick/hat PCM, real toggle/bank-switch/Panic PCM, persistence and backup flows',browser:{userAgent:await page.evaluate(()=>navigator.userAgent),secureContext:await page.evaluate(()=>isSecureContext)},initialBankRequests,initialFallback,fallbackAfterReload,failedMuseRequests,museRetryRequests,gmOptionCount:gmOptions.length,keyboardSelected:{before:beforeKeyboardValue,after:keyboardSelected},filteredPresetCount:filtered.length,failedStatus:{activeBank:failedStatus.activeBank?.id,selector:await page.locator('#audioBankSelect').inputValue()},retriedBank:retriedStatus.activeBank.id,activePlayback:activePlaybackResults,liveDrums:{preset:runtimeDrumPreset,programEvents:drumProgramEvents,pcm:liveDrumPcm},panic:{...panicCapture,epochs:panicEpoch},reloadedSettings,backup:{bytes:fs.statSync(backupPath).size,current:currentBackup.settings.audioSettings,restoredCurrent,restoredLegacy},pageErrors};
 }else{
  // The cross-browser slice verifies only real UI readiness, native bank
  // selection, a completed SF3 switch, and the GM selector after replacement.
  evidence={coverage:'focused cross-browser SF-04 readiness, native selector, and successful SF3 switch; Chromium-only retry/Panic/backup details omitted',browser:{userAgent:await page.evaluate(()=>navigator.userAgent),secureContext:await page.evaluate(()=>isSecureContext)},initialBankRequests,gmOptionCount:gmOptions.length,retriedBank:retriedStatus.activeBank.id};
 }
 if(browserTarget==='chromium'){
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-righttab="midi"]').click();
  const mobile=await page.evaluate(()=>{
   const ids=['audioBankSelect','audioStatus','audioLivePresetSearch','audioLivePresetSelect','audioUseFilePrograms','audioRetry','audioPanic'];
   const controls=Object.fromEntries(ids.map(id=>{const el=document.getElementById(id),rect=el.getBoundingClientRect();return[id,{visible:!!(rect.width&&rect.height),left:rect.left,right:rect.right,width:rect.width,disabled:el.disabled??false}]}));
   return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,controls};
  });
  assert.equal(mobile.viewport,390);
  assert.ok(mobile.documentWidth<=mobile.viewport+1,'audio settings must not create page-level horizontal overflow at 390px');
  assert.ok(mobile.controls.audioStatus.visible&&mobile.controls.audioBankSelect.visible&&mobile.controls.audioPanic.visible,'status, bank selector and Panic must remain visible on mobile');
  for(const [id,control] of Object.entries(mobile.controls))if(control.visible)assert.ok(control.left>=-1&&control.right<=390+1,`${id} must fit within the mobile viewport`);
  evidence.mobile=mobile;
  screenshots.mobile=path.join(artifactDir,`settings-ui-${browserTarget}-${runId}-mobile-390.png`);
  await page.screenshot({path:screenshots.mobile,fullPage:true,timeout:10000});
  evidence.screenshots={desktop:screenshots.desktop,mobile:screenshots.mobile};
 }
 assert.deepEqual(pageErrors,[],'browser page errors: '+pageErrors.join('; '));
}catch(error){
 failure={name:error?.name||'Error',code:error?.code||null,classification:error?.code==='UNSUPPORTED_ENVIRONMENT'?'UNSUPPORTED_ENVIRONMENT':'FAIL',message:String(error?.message||error),stack:String(error?.stack||error)};
 if(page){
  fs.mkdirSync(artifactDir,{recursive:true});
  try{
   const snapshotPromise=page.evaluate(()=>{
    const app=window.__prototypeTest,audio=app?.audio,engine=audio?.engine;
    const safe=value=>{
     const seen=new WeakSet();
     try{return JSON.parse(JSON.stringify(value,(key,item)=>{
      if(item instanceof Error)return {name:item.name,message:item.message,code:item.code};
      if(item&&typeof item==='object'){if(seen.has(item))return '[Circular]';seen.add(item);}
      return item;
     }));}
     catch(serializeError){return String(serializeError?.message||serializeError);}
    };
    let status=null,metrics=null,settings=null,context=null;
    try{status=safe(audio?.getStatus?.()??null);}catch(statusError){status={snapshotError:String(statusError?.message||statusError)};}
    try{metrics=safe(engine?.getMetrics?.()??null);}catch(metricsError){metrics={snapshotError:String(metricsError?.message||metricsError)};}
    try{settings=safe(app?.state?.audioSettings??null);}catch(settingsError){settings={snapshotError:String(settingsError?.message||settingsError)};}
    try{context=engine?.context?{state:engine.context.state,currentTime:engine.context.currentTime,sampleRate:engine.context.sampleRate,baseLatency:engine.context.baseLatency??null,outputLatency:engine.context.outputLatency??null}:null;}catch(contextError){context={snapshotError:String(contextError?.message||contextError)};}
    const statusElement=document.querySelector('#audioStatus');
    return {capturedAt:new Date().toISOString(),url:location.href,title:document.title,readyState:document.readyState,
     appState:{transport:{isPlaying:app?.isPlaying??null,isStarting:app?.isStarting??null,pos:app?.pos??null},settings},status,context,metrics,
     statusUi:{role:statusElement?.getAttribute('role')??null,text:statusElement?.textContent?.trim()??'',title:document.querySelector('#audioStatusTitle')?.textContent?.trim()??'',detail:document.querySelector('#audioStatusDetail')?.textContent?.trim()??'',bankValue:document.querySelector('#audioBankSelect')?.value??null}};
   });
   failureSnapshot=await Promise.race([snapshotPromise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('failure snapshot timed out after 5000 ms')),5000))]);
  }catch(snapshotError){failureSnapshot={snapshotError:String(snapshotError?.message||snapshotError)};}
  try{
   failureScreenshot=path.join(artifactDir,`settings-ui-${browserTarget}-${runId}-FAIL.png`);
   await page.screenshot({path:failureScreenshot,fullPage:true,timeout:5000});
  }catch(screenshotError){failureScreenshotError=String(screenshotError?.message||screenshotError);failureScreenshot=null;}
 }
 failure.snapshot=failureSnapshot;
 failure.screenshot=failureScreenshot?path.relative(root,failureScreenshot).replaceAll('\\','/'):null;
 if(failureScreenshotError)failure.screenshotError=failureScreenshotError;
 throw error;
}finally{
 try{if(context)await context.close();}catch(error){failure??={name:error?.name||'Error',message:`Browser context cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 try{if(browser)await browser.close();}catch(error){failure??={name:error?.name||'Error',message:`Browser cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){failure??={name:error?.name||'Error',message:`Server cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 const finishedAt=new Date().toISOString();
 const resultStatus=failure?.code==='UNSUPPORTED_ENVIRONMENT'?'UNSUPPORTED_ENVIRONMENT':failure?'FAIL':'PASS';
 fs.mkdirSync(artifactDir,{recursive:true});
 const artifactPath=path.join(artifactDir,`settings-ui-${browserTarget}-${runId}-${resultStatus}.json`);
 fs.writeFileSync(artifactPath,JSON.stringify({schemaVersion:1,runId,test:'SF-04 SoundFont settings UI, bank retry, panic PCM, persistence and backups',status:resultStatus,startedAt,finishedAt,runtime,codeHashes,evidence,partialEvidence,screenshots,failureSnapshot,failureScreenshot:failureScreenshot?path.relative(root,failureScreenshot).replaceAll('\\','/'):null,failureScreenshotError,requests,pageErrors,error:failure},null,2)+'\n');
 console.log('SF04 SETTINGS UI ARTIFACT:',artifactPath);
}
