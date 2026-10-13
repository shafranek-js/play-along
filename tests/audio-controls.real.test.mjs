import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const startedAt=new Date().toISOString();
const runId=`${startedAt.replace(/[:.]/g,'-')}-${process.pid}`;
const browserTarget=process.env.AUDIO_BROWSER||'chromium';
const browserTypes={chromium,firefox,webkit};
if(!Object.hasOwn(browserTypes,browserTarget))throw new Error('AUDIO_BROWSER must be chromium, firefox, or webkit');
const sha256=relative=>{
 const file=path.join(root,relative);
 return fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
};
const codeHashes={
 sourceEngine:sha256('src/audio/index.js'),
 sourcePlanner:sha256('src/audio/note-lanes.js'),
 sourceWorklet:sha256('src/audio/synth-worklet.js'),
 sourceTransport:sha256('src/legacy/parts/40-audio-transport.js'),
 harness:sha256('tests/audio-controls.real.test.mjs'),
 builtEngine:sha256('dist/assets/audio/index.js'),
 builtWorklet:sha256('dist/assets/audio/sf01-synth-worklet.js'),
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.sf2':'application/octet-stream','.sf3':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((request,response)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname)}
 catch{response.writeHead(400);response.end('bad path');return;}
 if(pathname==='/sf03-audio-test.html'){
  response.writeHead(200,{'content-type':mime['.html']});
  response.end('<!doctype html><meta charset="utf-8"><title>SF-03 PCM control verifier</title><button id="start">Start real audio checks</button>');
  return;
 }
 const file=path.resolve(dist,'.'+pathname);
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  response.writeHead(404);response.end('not found');return;
 }
 response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
 fs.createReadStream(file).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
let page=null;
let runtime=null;
let evidence=null;
let failure=null;
const pageErrors=[];
let pageDiagnostics=null;
let lastPageError=null;
try{
 const browserType=browserTypes[browserTarget];
 browser=await browserType.launch({headless:true,...(browserTarget==='chromium'?{args:['--no-sandbox']}:{})});
 runtime={browserName:browserTarget,browserVersion:browser.version(),executablePath:browserType.executablePath(),playwrightVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version,nodeVersion:process.version,platform:process.platform,architecture:process.arch};
  page=await browser.newPage();
 page.on('pageerror',error=>{pageErrors.push(error.message);lastPageError=error.message;});
 page.on('console',message=>{
  const text=message.text();
  if(!text.startsWith('__SF03_DIAG__'))return;
  try{pageDiagnostics=JSON.parse(text.slice('__SF03_DIAG__'.length));}catch{}
 });
 await page.goto(origin+'/sf03-audio-test.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(target=>{window.__sf03BrowserTarget=target;},browserTarget);
 await page.evaluate(()=>{
  window.__sf03Diagnostics={stage:'awaiting-trusted-start',contextState:null,currentTime:null};
  console.debug('__SF03_DIAG__'+JSON.stringify(window.__sf03Diagnostics));
  window.__sf03Complete=new Promise((resolve,reject)=>{
   document.querySelector('#start').addEventListener('click',async()=>{
    let context=null,engine=null,result=null,primaryError=null;
    let partialEvidence=null;
    const cleanupErrors=[];
    const runStartedAt=performance.now();
    const mark=(stage,details={})=>{
     const snapshot={stage,elapsedMs:performance.now()-runStartedAt,contextState:context?.state||null,currentTime:context?.currentTime??null,partialEvidence,...details};
     window.__sf03Diagnostics=snapshot;
     console.debug('__SF03_DIAG__'+JSON.stringify(snapshot));
    };
    const boundedCleanup=async(name,operation,timeoutMs=4000)=>{
     let timer;
     try{
      await Promise.race([
       Promise.resolve().then(operation),
       new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${name} exceeded ${timeoutMs}ms cleanup bound`)),timeoutMs);}),
      ]);
     }catch(error){cleanupErrors.push({name,message:String(error?.message||error)});}
     finally{clearTimeout(timer);}
    };
    try{
    mark('creating-audio-context');
    context=new AudioContext({sampleRate:48000});
    mark('resuming-audio-context');
    await context.resume();
    mark('audio-context-resumed');
    const wait=ms=>new Promise(resolveWait=>setTimeout(resolveWait,ms));
    const endpointEpsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
    const assertWindowCovered=(pcm,from,to)=>{
     const eps=endpointEpsilon(from,to,pcm.startedAt,pcm.endedAt);
     if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||pcm.startedAt>from+eps||pcm.endedAt<to-eps)
      throw new Error(`PCM capture does not cover [${from}, ${to}]: [${pcm.startedAt}, ${pcm.endedAt}]`);
      const frameEpsilon=eps*pcm.sampleRate;
      const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+frameEpsilon);
      const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-frameEpsilon);
     if(first<0||last>pcm.frames||last<=first)throw new Error(`PCM sample coverage is incomplete: ${first}..${last} of ${pcm.frames}`);
     return {first,last};
    };
    const coverageSelfCheck=()=>{
     const origin=23,rate=48000,exactEnd=origin+5760/rate;
     const synthetic={startedAt:origin,endedAt:exactEnd,sampleRate:rate,frames:5760};
     assertWindowCovered(synthetic,origin,exactEnd);
     let rejected=false;
     try{assertWindowCovered(synthetic,origin,exactEnd+1/rate)}catch{rejected=true;}
     if(!rejected)throw new Error('PCM coverage self-check accepted a genuine one-frame end gap');
     return {exactEndpointAccepted:true,oneFrameGapRejected:rejected,origin,exactEnd,oneFrameGap:exactEnd+1/rate};
    };
    const sampleWindow=(pcm,from,to)=>{
     const {first,last}=assertWindowCovered(pcm,from,to);
     let energy=0,nonzero=0,count=0;
     for(let i=first;i<last;i++)for(const channel of pcm.samples){
      const sample=channel[i];
      if(!Number.isFinite(sample))throw new Error('non-finite captured PCM');
      energy+=sample*sample;count+=1;if(sample!==0)nonzero+=1;
     }
     return {first,last,count,nonzero,rms:Math.sqrt(energy/count)};
    };
    const alignedDifference=(a,b,fromOffset,toOffset)=>{
     const fromA=a.base+fromOffset,toA=a.base+toOffset,fromB=b.base+fromOffset,toB=b.base+toOffset;
     const rangeA=assertWindowCovered(a.pcm,fromA,toA),rangeB=assertWindowCovered(b.pcm,fromB,toB);
     if(a.pcm.sampleRate!==b.pcm.sampleRate)throw new Error('matched PCM comparison windows have different sample rates');
     const requestedA=rangeA.last-rangeA.first,requestedB=rangeB.last-rangeB.first;
     if(requestedA<=0||requestedA!==requestedB)throw new Error(`matched PCM sample counts differ or are empty: ${requestedA} vs ${requestedB}`);
     const firstA=rangeA.first,firstB=rangeB.first,requested=requestedA;
     let referenceEnergy=0,errorEnergy=0,dot=0,energyA=0,energyB=0;
     for(let i=0;i<requested;i++){
      for(let channel=0;channel<2;channel++){
       const x=a.pcm.samples[channel][firstA+i],y=b.pcm.samples[channel][firstB+i];
       referenceEnergy+=x*x;errorEnergy+=(x-y)*(x-y);dot+=x*y;energyA+=x*x;energyB+=y*y;
      }
     }
     return {samples:requested,relativeRmsError:Math.sqrt(errorEnergy/Math.max(referenceEnergy,1e-24)),correlation:dot/Math.sqrt(Math.max(energyA*energyB,1e-24)),referenceEnergy,actualEnergy:energyB};
    };
    const goertzel=(pcm,frequency,from,to)=>{
     const {first,last}=assertWindowCovered(pcm,from,to);
     if(last-first<16)throw new Error('frequency analysis window is too short');
     const omega=2*Math.PI*frequency/pcm.sampleRate,coefficient=2*Math.cos(omega);
     let q0=0,q1=0,q2=0;
     for(let i=first;i<last;i++){
      const sample=(pcm.samples[0][i]+pcm.samples[1][i])*0.5;
      q0=sample+coefficient*q1-q2;q2=q1;q1=q0;
     }
     return Math.sqrt(Math.max(0,q1*q1+q2*q2-coefficient*q1*q2))/(last-first);
    };
    const expectedEvents=[
     {type:'noteOn',time:0,channel:0,pitch:60,velocity:75,noteId:'cross-long',sequence:1},
     {type:'noteOn',time:.2,channel:0,pitch:60,velocity:75,noteId:'cross-short',sequence:2},
     {type:'noteOff',time:.5,channel:0,pitch:60,velocity:0,noteId:'cross-short',sequence:3},
     {type:'noteOff',time:1,channel:0,pitch:60,velocity:0,noteId:'cross-long',sequence:4},
    ];
     const coverageCheck=coverageSelfCheck();
     mark('importing-audio-module');
     const entry=await import('/assets/audio/index.js');
     mark('audio-module-imported');
     mark('loading-catalog');
     const catalog=await entry.getSoundfontCatalog();
     mark('catalog-loaded',{bankCount:(Array.isArray(catalog)?catalog:catalog.banks)?.length??null,defaultBankId:catalog.defaultBankId??null});
     const banks=Array.isArray(catalog)?catalog:catalog.banks;
     const selected=banks.find(bank=>bank.id===catalog.defaultBankId)||banks[0];
     if(!selected)throw new Error('default bank is absent from the delivered catalog');
     mark('initializing-engine');
     engine=await entry.createPlaybackAudioEngine(context);
     mark('engine-initialized',{lifecycle:engine.getState?.()?.lifecycle??null});
     mark('loading-default-bank',{bankId:selected.id});
     const loaded=await engine.loadBank(selected.id);
     mark('default-bank-indexed',{bankId:loaded.id,format:loaded.format,bytes:loaded.bytes});
     const requestedVelocities=[75];
     mark('preparing-patches');
     await engine.preparePatches(requestedVelocities.map(velocity=>({bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity},{pitch:73,velocity}]})));
     mark('patches-prepared');
     await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
     engine.setMasterGain(.25);
     mark('arming-pcm-tap');
     const tapWarmup=await engine.capturePcm({durationSeconds:.05});
     if(tapWarmup.frames<=0||tapWarmup.samples.some(channel=>channel.length===0))throw new Error('real PCM tap did not capture samples');
     mark('pcm-tap-ready',{sampleRate:tapWarmup.sampleRate,frames:tapWarmup.frames});
     const reset=async()=>{await engine.cancelAll();await wait(90);};
     const schedulePatch=(group,channel,at)=>{
      // cancelAll releases voices but intentionally does not reset MIDI
      // channel state. Reset controllers and then explicitly establish every
      // state used by these fixtures so each reference starts identically.
      engine.scheduleEvent({type:'cc',group,channel,at,controller:121,value:0});
      for(const [controller,value] of [[101,127],[100,127],[99,127],[98,127]])
       engine.scheduleEvent({type:'cc',group,channel,at,controller,value});
      engine.scheduleEvent({type:'programChange',group,channel,at,program:0,bankMSB:0,bankLSB:0,isDrum:false});
      for(const [controller,value] of [
       [1,0],[2,0],[4,0],[5,0],[6,0],[7,100],[8,64],[10,64],[11,127],
       [16,0],[17,0],[18,0],[19,0],[64,0],[65,0],[66,0],[67,0],[68,0],[69,0],
       [70,64],[71,64],[72,64],[73,64],[74,64],[75,64],[76,64],[77,64],[78,64],[79,64],
       [80,0],[81,0],[82,0],[83,0],[84,0],[91,0],[92,0],[93,0],[94,0],[95,0],
       [38,0],
      ])
       engine.scheduleEvent({type:'cc',group,channel,at,controller,value});
      engine.scheduleEvent({type:'pitchWheel',group,channel,at,value:8192});
      engine.scheduleEvent({type:'channelPressure',group,channel,at,value:0});
      for(const pitch of [60,73])engine.scheduleEvent({type:'polyPressure',group,channel,at,pitch,value:0});
     };
     if(window.__sf03BrowserTarget!=='chromium'){
      const smoke=async(bankId,noteId)=>{
       mark(`cross-browser-${bankId}:reset`);
       await engine.cancelAll();
       const pcmPromise=engine.capturePcm({durationSeconds:.72});
       const at=context.currentTime+.12;
       mark(`cross-browser-${bankId}:capture-armed`,{at,durationSeconds:.72});
       schedulePatch('file',0,at-.02);
       engine.scheduleEvent({group:'file',channel:0,at,type:'noteOn',pitch:60,velocity:100,noteId});
       engine.scheduleEvent({group:'file',channel:0,at:at+.5,type:'noteOff',pitch:60,noteId});
       const pcm=await pcmPromise;
       mark(`cross-browser-${bankId}:pcm-captured`,{frames:pcm.frames,sampleRate:pcm.sampleRate});
       const window=sampleWindow(pcm,at,at+.49);
       if(window.nonzero===0||window.rms===0)throw new Error(`${bankId} cross-browser smoke note did not produce PCM`);
       return {bankId,sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,window};
      };
      const sf2=await smoke(selected.id,'sf03-cross-browser-sf2');
      const sf3=banks.find(bank=>bank.format==='SF3');
      if(!sf3)throw new Error('the second bank must be available for the cross-browser switch smoke');
      mark('loading-cross-browser-sf3',{bankId:sf3.id});
      const sf3Loaded=await engine.loadBank(sf3.id);
      if(sf3Loaded.id!==sf3.id)throw new Error('cross-browser bank selector did not load the requested SF3');
      mark('preparing-cross-browser-sf3');
      await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:100}]}]);
      const sf3Pcm=await smoke(sf3.id,'sf03-cross-browser-sf3');
      result={browser:{userAgent:navigator.userAgent,secureContext:isSecureContext,sampleRate:context.sampleRate},coverage:'cross-browser initial SF2 real PCM plus SF3 switch/prepare/real PCM only; full SF-03 control protocol is Chromium-only',banks:[{id:loaded.id,format:loaded.format,bytes:loaded.bytes,sha256:loaded.sha256},{id:sf3Loaded.id,format:sf3Loaded.format,bytes:sf3Loaded.bytes,sha256:sf3Loaded.sha256}],sf2,sf3:sf3Pcm};
     }else{
     let renderStep=0;
     const render=async(schedule,durationSeconds=1.45,label=`render-${++renderStep}`)=>{
      mark(`${label}:reset`);
      await reset();
      const pcmPromise=engine.capturePcm({durationSeconds});
      const base=context.currentTime+.18;
      mark(`${label}:capture-armed`,{base,durationSeconds});
      schedule(base);
      mark(`${label}:awaiting-pcm`);
      const pcm=await pcmPromise;
      mark(`${label}:pcm-captured`,{frames:pcm.frames,sampleRate:pcm.sampleRate,startedAt:pcm.startedAt,endedAt:pcm.endedAt});
      if(pcm.frames<=0||pcm.channels!==2||pcm.samples.length!==2||pcm.samples.some(channel=>channel.some(sample=>!Number.isFinite(sample))))throw new Error('real engine returned invalid stereo Float32 PCM');
      assertWindowCovered(pcm,base+.02,base+1.02);
      const total=sampleWindow(pcm,base+.02,base+1.02);
      if(total.nonzero===0||total.rms===0)throw new Error('scheduled notes produced no measured PCM samples');
      return {pcm,base,total};
     };
     const plan=entry.planNoteLanes(expectedEvents);
     const assignments=Object.fromEntries(plan.assignments.map(item=>[item.noteId,item]));
     const planChannels=[assignments['cross-long'].channel,assignments['cross-short'].channel];
     const planLanes=[assignments['cross-long'].lane,assignments['cross-short'].lane];
     if(planLanes[0]===planLanes[1])throw new Error('crossing NoteOffs were assigned to one FIFO lane');
     mark('planned-crossing');
     const laneRendered=await render(base=>{
      schedulePatch('file',0,base-.025);
      for(const event of expectedEvents){
       const assignment=assignments[event.noteId];
       engine.scheduleEvent({group:'file',channel:event.channel,lane:assignment.lane,at:base+event.time,type:event.type,pitch:event.pitch,velocity:event.velocity,noteId:event.noteId});
      }
     },1.45,'planned-crossing');
     const referenceRendered=await render(base=>{
      schedulePatch('file',0,base-.025);
      schedulePatch('file',1,base+.175);
      engine.scheduleEvent({group:'file',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'reference-long'});
      engine.scheduleEvent({group:'file',channel:1,at:base+.2,type:'noteOn',pitch:60,velocity:75,noteId:'reference-short'});
      engine.scheduleEvent({group:'file',channel:1,at:base+.5,type:'noteOff',pitch:60,noteId:'reference-short'});
      engine.scheduleEvent({group:'file',channel:0,at:base+1,type:'noteOff',pitch:60,noteId:'reference-long'});
     },1.45,'separate-channel-reference');
     const crossingMatch=alignedDifference(laneRendered,referenceRendered,.25,.95);
     if(crossingMatch.samples===0||crossingMatch.referenceEnergy===0)throw new Error('crossing-note comparison has no positive PCM reference samples');

     // A single logical file-channel stream must update all overflow lanes.
     // Compare it with the same controls sent independently to two matched
     // reference channels carrying the same crossing-note phrase.
     const fanoutControls=[
      {type:'cc',controller:101,value:0,offset:.04},
      {type:'cc',controller:100,value:0,offset:.04},
      {type:'cc',controller:6,value:12,offset:.04},
      {type:'cc',controller:38,value:0,offset:.04},
      {type:'pitchWheel',value:9000,offset:.05},
      {type:'channelPressure',value:72,offset:.06},
      {type:'polyPressure',pitch:60,value:55,offset:.07},
      {type:'cc',controller:64,value:127,offset:.08},
      {type:'cc',controller:1,value:44,offset:.09},
      {type:'cc',controller:74,value:80,offset:.1},
      {type:'cc',controller:64,value:0,offset:.72},
     ];
     const scheduleFanoutPhrase=(base,channels)=>{
      for(const channel of channels)schedulePatch('file',channel,base-.025);
      for(const control of fanoutControls){
       const {offset,...payload}=control;
       for(const channel of channels)engine.scheduleEvent({group:'file',channel,at:base+offset,...payload});
      }
      for(const event of expectedEvents){
       const channel=channels.length===1?0:channels[event.noteId==='cross-long'?0:1];
       const lane=channels.length===1?assignments[event.noteId].lane:0;
       engine.scheduleEvent({group:'file',channel,lane,at:base+event.time,type:event.type,pitch:event.pitch,velocity:event.velocity,noteId:`fanout-${channels.length}-${event.noteId}`});
      }
     };
     const fanoutRendered=await render(base=>scheduleFanoutPhrase(base,[0]),1.45,'controller-fanout');
     const fanoutReference=await render(base=>scheduleFanoutPhrase(base,[0,1]),1.45,'controller-reference');
     const controllerFanout=alignedDifference(fanoutReference,fanoutRendered,.12,.95);
     if(controllerFanout.samples===0||controllerFanout.referenceEnergy===0)throw new Error('controller-fanout comparison lacks matched reference PCM');

     // Intentional negative control: ordinary same-channel MIDI NoteOff has
     // no per-voice handle, so it releases the oldest matching pitch. The
     // short note's NoteOff therefore releases the long note first while the
     // newer short voice continues. The PCM comparison must detect that.
     const fifoRendered=await render(base=>{
      schedulePatch('live',0,base-.025);
      engine.scheduleEvent({group:'live',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'fifo-long'});
      engine.scheduleEvent({group:'live',channel:0,at:base+.2,type:'noteOn',pitch:60,velocity:75,noteId:'fifo-short'});
      engine.scheduleEvent({group:'live',channel:0,at:base+.5,type:'noteOff',pitch:60,noteId:'fifo-short'});
      engine.scheduleEvent({group:'live',channel:0,at:base+1,type:'noteOff',pitch:60,noteId:'fifo-long'});
     },1.45,'fifo-negative-control');
     const fifoControl=alignedDifference(referenceRendered,fifoRendered,.62,.92);
     if(fifoControl.samples===0||fifoControl.relativeRmsError<.04)throw new Error('FIFO negative control did not diverge from the separate-channel PCM reference');

     // A live controller/program burst is intentionally sent before the same
     // file phrase. It must not alter the file channel’s waveform or state.
     const fileOnly=await render(base=>{
      schedulePatch('file',0,base-.025);
      engine.scheduleEvent({group:'file',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'file-only-note'});
      engine.scheduleEvent({group:'file',channel:0,at:base+1,type:'noteOff',pitch:60,noteId:'file-only-note'});
     },1.45,'file-only-reference');
     const liveControllers=await render(base=>{
      schedulePatch('file',0,base-.025);
      engine.scheduleEvent({group:'live',channel:0,at:base-.04,type:'programChange',program:40,isDrum:false});
      for(const [controller,value] of [[7,0],[10,127],[11,0],[64,127],[1,127],[74,0],[101,0],[100,0],[6,24],[38,0]])
       engine.scheduleEvent({group:'live',channel:0,at:base-.04,type:'cc',controller,value});
      engine.scheduleEvent({group:'live',channel:0,at:base-.04,type:'pitchWheel',value:16383});
      engine.scheduleEvent({group:'live',channel:0,at:base-.04,type:'channelPressure',value:100});
      engine.scheduleEvent({group:'live',channel:0,at:base-.04,type:'polyPressure',pitch:60,value:100});
      engine.scheduleEvent({group:'file',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'file-during-live-controls'});
      engine.scheduleEvent({group:'file',channel:0,at:base+1,type:'noteOff',pitch:60,noteId:'file-during-live-controls'});
     },1.45,'live-file-isolation');
     const isolation=alignedDifference(fileOnly,liveControllers,.1,.85);
     if(isolation.samples===0||isolation.referenceEnergy===0||isolation.relativeRmsError>.03)throw new Error('live program/controllers changed the same-phase file PCM reference');

     // Cancellation is selective across the two disjoint 16-channel groups.
     const cancelTrial=async cancel=>{
      mark(cancel?'selective-cancellation:reset':'cancellation-reference:reset');
      await reset();
      const pcmPromise=engine.capturePcm({durationSeconds:1.5});
      const base=context.currentTime+.18;
      let cancelAt=null;
      mark(cancel?'selective-cancellation:capture-armed':'cancellation-reference:capture-armed',{base,durationSeconds:1.5});
      schedulePatch('file',0,base-.025);
      schedulePatch('live',0,base-.025);
      engine.scheduleEvent({group:'file',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'cancel-file-c4'});
      engine.scheduleEvent({group:'file',channel:0,at:base+1.3,type:'noteOff',pitch:60,noteId:'cancel-file-c4'});
      engine.scheduleEvent({group:'live',channel:0,at:base,type:'noteOn',pitch:73,velocity:75,noteId:'preserved-live-f5'});
      engine.scheduleEvent({group:'live',channel:0,at:base+1.3,type:'noteOff',pitch:73,noteId:'preserved-live-f5'});
      if(cancel){
       const waitUntil=Math.max(0,(base+.58-context.currentTime)*1000);
       if(waitUntil)await wait(waitUntil);
       cancelAt=context.currentTime;
       mark('selective-cancellation:cancel-requested',{cancelAt,base});
       await engine.cancelGroup('file');
      }
      mark(cancel?'selective-cancellation:awaiting-pcm':'cancellation-reference:awaiting-pcm');
      return {pcm:await pcmPromise,base,cancelAt};
     };
     const fullGroups=await cancelTrial(false);
     const fileCancelled=await cancelTrial(true);
     const measureGroups=trial=>({
      fileBefore:goertzel(trial.pcm,261.625565,trial.base+.25,trial.base+.48),
      fileAfter:goertzel(trial.pcm,261.625565,trial.base+.88,trial.base+1.18),
      liveBefore:goertzel(trial.pcm,554.365262,trial.base+.25,trial.base+.48),
      liveAfter:goertzel(trial.pcm,554.365262,trial.base+.88,trial.base+1.18),
     });
     const fullMeasure=measureGroups(fullGroups),cancelMeasure=measureGroups(fileCancelled);
     const cancellation={fileBeforeRatio:cancelMeasure.fileBefore/Math.max(fullMeasure.fileBefore,1e-12),fileAfterRatio:cancelMeasure.fileAfter/Math.max(fullMeasure.fileAfter,1e-12),liveBeforeRatio:cancelMeasure.liveBefore/Math.max(fullMeasure.liveBefore,1e-12),liveAfterRatio:cancelMeasure.liveAfter/Math.max(fullMeasure.liveAfter,1e-12)};
     const pcmSummary=trial=>({sampleRate:trial.pcm.sampleRate,frames:trial.pcm.frames,startedAt:trial.pcm.startedAt,endedAt:trial.pcm.endedAt,peak:trial.pcm.peak,rms:trial.pcm.rms,base:trial.base,cancelAt:trial.cancelAt});
     let cancellationMetrics;
     try{cancellationMetrics=engine.getMetrics();}catch(metricsError){cancellationMetrics={captureError:String(metricsError?.message||metricsError)};}
     partialEvidence={cancellation:{...cancellation,windows:{fileBefore:[fullGroups.base+.25,fullGroups.base+.48],fileAfter:[fullGroups.base+.88,fullGroups.base+1.18],liveBefore:[fullGroups.base+.25,fullGroups.base+.48],liveAfter:[fullGroups.base+.88,fullGroups.base+1.18]},fullMeasure,cancelMeasure,fullPcm:pcmSummary(fullGroups),cancelPcm:pcmSummary(fileCancelled),metrics:cancellationMetrics}};
     mark('selective-cancellation:measured',partialEvidence);
     if(cancellation.fileBeforeRatio<.65||cancellation.liveBeforeRatio<.65)throw new Error('cancellation positive-control voices were not both present before the boundary');
     if(cancellation.fileAfterRatio>.35)throw new Error('file-group cancellation left substantial C4 PCM after the boundary');
     if(cancellation.liveAfterRatio<.65)throw new Error('file-group cancellation also silenced the independent live group');

     // Both captures include the same old voice, CC123, new voice and natural
     // release tail. Only the first capture adds a delayed NoteOff for the
     // identity that CC123 already invalidated.
     const resetTrial=async({staleOldOff=false,releaseNewEarly=false}={})=>await render(base=>{
      schedulePatch('file',0,base-.025);
      engine.scheduleEvent({group:'file',channel:0,at:base,type:'noteOn',pitch:60,velocity:75,noteId:'reset-old-note'});
      engine.scheduleEvent({group:'file',channel:0,at:base+.5,type:'cc',controller:123,value:0});
      engine.scheduleEvent({group:'file',channel:0,at:base+.6,type:'noteOn',pitch:60,velocity:75,noteId:'reset-new-note'});
      if(staleOldOff)engine.scheduleEvent({group:'file',channel:0,at:base+.9,type:'noteOff',pitch:60,noteId:'reset-old-note'});
      engine.scheduleEvent({group:'file',channel:0,at:base+(releaseNewEarly?0.9:1.2),type:'noteOff',pitch:60,noteId:'reset-new-note'});
     },1.45,staleOldOff?'cc123-stale-noteoff':releaseNewEarly?'cc123-early-new-noteoff-negative-control':'cc123-reference');
     const resetReference=await resetTrial();
     const resetWithStale=await resetTrial({staleOldOff:true});
     const resetEarlyNewOff=await resetTrial({releaseNewEarly:true});
     const staleOffSuppression=alignedDifference(resetReference,resetWithStale,.68,1.05);
     const staleOffSensitivity=alignedDifference(resetReference,resetEarlyNewOff,.68,1.05);
     const cc123Metrics={
      window:[resetReference.base+.68,resetReference.base+1.05],
      sameOldVoiceAndCc123InEveryTrial:true,
      differingEvent:'stale NoteOff for reset-old-note at +0.9 after CC123 at +0.5',
      noStaleOffReference:staleOffSuppression,
      earlyNewNoteOffNegativeControl:staleOffSensitivity,
      pcm:{reference:pcmSummary(resetReference),withStaleOff:pcmSummary(resetWithStale),negativeControl:pcmSummary(resetEarlyNewOff)},
      metrics:engine.getMetrics(),
     };
     partialEvidence={...partialEvidence,cc123:cc123Metrics};
     mark('cc123:measured',partialEvidence);
     if(staleOffSuppression.samples===0||staleOffSuppression.referenceEnergy===0||staleOffSuppression.relativeRmsError>.03)
      throw new Error('CC123 invalidated-note stale NoteOff changed the new same-pitch voice PCM');
     if(staleOffSensitivity.samples===0||staleOffSensitivity.referenceEnergy===0||staleOffSensitivity.relativeRmsError<.04)
      throw new Error('CC123 early-new-NoteOff negative control was not detected by the matched PCM comparison');

     const metrics=engine.getMetrics();
     result={
      browser:{userAgent:navigator.userAgent,secureContext:isSecureContext,sampleRate:context.sampleRate},
      bank:{id:loaded.id,format:loaded.format,bytes:loaded.bytes,sha256:loaded.sha256},
      planner:plan,
      crossing:{lanes:planLanes,logicalChannels:planChannels,positiveReference:crossingMatch,fifoNegativeControl:fifoControl,liveWireBehavior:'same-channel NoteOff releases the oldest matching pitch; the newer short voice remains after the short-note NoteOff'},
      controlFanout:{events:fanoutControls,comparison:controllerFanout},
      groupIsolation:{comparison:isolation,liveControllerState:{program:40,cc7:0,cc10:127,cc11:0,cc64:127,pitchWheel:16383}},
      cancellation:{...cancellation,fullReference:fullMeasure,cancelled:cancelMeasure,cc123StaleNoteOff:staleOffSuppression,cc123NegativeControl:staleOffSensitivity},
      pcmCoverageSelfCheck:coverageCheck,
      pcm:{sampleRate:laneRendered.pcm.sampleRate,channels:laneRendered.pcm.channels,frames:laneRendered.pcm.frames,startedAt:laneRendered.pcm.startedAt,endedAt:laneRendered.pcm.endedAt,positiveWindow:laneRendered.total},
      metrics:{eventsApplied:metrics.eventsApplied,pendingEvents:metrics.pendingEvents,cancelledEvents:metrics.cancelledEvents,deferredNoteOffs:metrics.deferredNoteOffs,channelCount:metrics.channelCount,timingSamples:metrics.timingSamples.length},
     };
     }
     if(!isSecureContext||context.sampleRate<8000)throw new Error('AudioWorklet browser context is not valid for real rendering');
     mark('real-pcm-checks-complete');
    }catch(cause){
     primaryError=cause instanceof Error?cause:new Error(String(cause));
     mark('failed',{error:{name:primaryError.name,message:primaryError.message}});
    }finally{
     if(engine){mark('disposing-engine');await boundedCleanup('engine.dispose',()=>engine.dispose());}
     if(context){mark('closing-audio-context');await boundedCleanup('context.close',()=>context.close());}
     mark('settled',{originalError:primaryError?{name:primaryError.name,message:primaryError.message}:null,cleanupErrors,partialEvidence});
    }
    if(primaryError)reject(primaryError);
    else if(cleanupErrors.length)reject(new Error(`Audio cleanup failed: ${JSON.stringify(cleanupErrors)}`));
    else resolve(result);
   },{once:true});
  });
 });
 await page.locator('#start').click();
 let timer;
 try{
  evidence=await Promise.race([
   page.evaluate(()=>window.__sf03Complete),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`SF-03 real PCM controls timed out after 90000ms; lastStage=${JSON.stringify(pageDiagnostics)}; lastPageError=${JSON.stringify(lastPageError)}`)),90000);}),
  ]);
 }finally{clearTimeout(timer);}
 assert.equal(evidence.browser.secureContext,true);
 if(browserTarget==='chromium'){
  assert.equal(evidence.bank.id,'generaluser-gs-2.0.3-sf2');
  assert.equal(new Set(evidence.crossing.lanes).size,2,'planned crossing notes must use two FIFO-safe lanes');
  assert.ok(evidence.pcm.positiveWindow.nonzero>0&&evidence.pcm.positiveWindow.count>0);
  assert.ok(evidence.crossing.positiveReference.correlation>.98,'planned crossing phrase must match the separate-channel PCM reference');
  assert.ok(evidence.crossing.positiveReference.relativeRmsError<.08,'same-phase lane output must remain close to its reference');
  assert.ok(evidence.crossing.fifoNegativeControl.relativeRmsError>=.04,'raw same-channel FIFO negative control must be detected');
  assert.ok(evidence.controlFanout.comparison.correlation>.98,'one logical controller stream must match the same controls on both reference channels');
  assert.ok(evidence.controlFanout.comparison.relativeRmsError<.08,'file controller, sustain, bend and pressure fanout must preserve the matched reference');
  assert.ok(evidence.groupIsolation.comparison.relativeRmsError<.03,'live program/controllers must preserve the file-only PCM waveform');
  assert.ok(evidence.cancellation.cc123StaleNoteOff.relativeRmsError<.03,'CC123 stale NoteOff must not change the new same-pitch voice PCM');
  assert.equal(evidence.pcmCoverageSelfCheck.oneFrameGapRejected,true);
  assert.ok(evidence.cancellation.fileBeforeRatio>.65&&evidence.cancellation.liveBeforeRatio>.65);
  assert.ok(evidence.cancellation.fileAfterRatio<.35,'file cancellation must release only the file voice');
  assert.ok(evidence.cancellation.liveAfterRatio>.65,'file cancellation must preserve the live voice');
 }else{
  assert.match(evidence.coverage,/cross-browser initial SF2 real PCM plus SF3 switch/);
  assert.ok(evidence.sf2.window.nonzero>0&&evidence.sf3.window.nonzero>0);
 }
 assert.deepEqual(pageErrors,[],'browser page errors: '+pageErrors.join('; '));
}catch(error){
 if(page){
  try{
   const current=await Promise.race([
    page.evaluate(()=>window.__sf03Diagnostics),
    new Promise(resolve=>setTimeout(()=>resolve(null),1000)),
   ]);
   if(current)pageDiagnostics=current;
  }catch{}
 }
 failure={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error),lastStage:pageDiagnostics,lastPageError};
 throw error;
}finally{
 try{if(browser)await browser.close();}catch(error){failure??={name:error?.name||'Error',message:`Browser cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){failure??={name:error?.name||'Error',message:`Server cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)};}
 const finishedAt=new Date().toISOString();
 const artifactDir=path.join(root,'artifacts','audio-sf03','runs');
 fs.mkdirSync(artifactDir,{recursive:true});
 const artifactPath=path.join(artifactDir,`real-pcm-controls-${browserTarget}-${runId}-${failure?'FAIL':'PASS'}.json`);
 fs.writeFileSync(artifactPath,JSON.stringify({schemaVersion:1,runId,test:'SF-03 real PCM crossing-lane, live/file isolation, and selective cancellation',status:failure?'FAIL':'PASS',startedAt,finishedAt,runtime,codeHashes,evidence,pageDiagnostics,lastPageError,pageErrors,error:failure},null,2)+'\n');
 console.log('SF03 REAL PCM ARTIFACT:',artifactPath);
}
