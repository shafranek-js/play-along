import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const startedAt=new Date().toISOString();
const runId=`${startedAt.replace(/[:.]/g,'-')}-${process.pid}`;
const sha256=relative=>{
 const file=path.join(root,relative);
 return fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
};
const codeHashes={harness:sha256('tests/practice-transport.real.test.mjs'),transport:sha256('src/legacy/parts/40-audio-transport.js'),engine:sha256('src/audio/index.js'),worklet:sha256('src/audio/synth-worklet.js'),builtEngine:sha256('dist/assets/audio/index.js'),builtWorklet:sha256('dist/assets/audio/sf01-synth-worklet.js')};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html'};
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
let runtime=null;
let evidence={};
let failure=null;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 runtime={browserName:'chromium',browserVersion:browser.version(),executablePath:chromium.executablePath(),playwrightVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version,nodeVersion:process.version,platform:process.platform,architecture:process.arch};
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong);
 const setup=async(mode,notes)=>{
  await page.evaluate(({mode,notes})=>{
   const app=window.__prototypeTest;
   app.pause();
   app.loadSong({id:'regression-'+mode,title:'Partial onset chord',author:'Fixture',
    type:'import',tracks:[{name:'Piano',notes:notes.map(n=>({
     pitch:n[0],start:n[1],duration:.4,velocity:85,track:0,channel:0
    }))}]});
   app.setMode(mode);
   app.seek(.02);
  },{mode,notes});
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>{
   const app=window.__prototypeTest;
   const audio=app?.audio?.getStatus?.();
   return app?.isPlaying===true&&audio?.lifecycle==='ready';
  },{timeout:60000});
  assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),true);
 };
 await setup('wait',[[60,0],[62,.02],[64,2]]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(62));
 const accepted=await page.evaluate(()=>{
  const a=window.__prototypeTest,s=a.session;
  return {hits:a.stats.hits,hold:a.hold,release:a.waitRelease,position:a.pos,
   first:{skipped:s.all[0].skipped,hit:s.all[0].hit},
   second:{hit:s.all[1].hit},next:s.nextGroup()?.start};
 });
 assert.equal(accepted.hits,1);
 assert.equal(accepted.release?.start,0,'Group retains its notated origin');
 assert.equal(accepted.position,.02,'Wait cursor must not rewind to skipped onset');
 assert.deepEqual(accepted.first,{skipped:true,hit:false});
 assert.equal(accepted.second.hit,true);
 assert.equal(accepted.next,2);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(62));
 await page.waitForTimeout(140);
 const resumed=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,hold:window.__prototypeTest.hold,
  release:window.__prototypeTest.waitRelease
 }));
 assert.ok(resumed.pos>.04,'Wait transport remains stuck after releasing the playable group');
 assert.equal(resumed.hold,false);
 assert.equal(resumed.release,null);
 await page.evaluate(()=>window.__prototypeTest.pause());
 await setup('tempo',[[60,0],[60,.02],[64,2]]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 const tempo=await page.evaluate(()=>({
  hits:window.__prototypeTest.stats.hits,
  skipped:window.__prototypeTest.session.all[0].skipped,
  skippedHit:window.__prototypeTest.session.all[0].hit,
  playableHit:window.__prototypeTest.session.all[1].hit
 }));
 assert.deepEqual(tempo,{hits:1,skipped:true,skippedHit:false,playableHit:true});
 evidence={wait:{accepted,resumed},tempo};
 await page.evaluate(()=>{
  window.__prototypeTest.receiveNoteOff(60);
  window.__prototypeTest.pause();
 });

 // Verify that speed changes preserve playback while scaling the live
 // AudioContext-backed cursor, and that seeking an active session restarts
 // from the requested score time instead of leaving old scheduled audio.
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.loadSong({id:'transport-speed-seek-loop',title:'Transport timing fixture',author:'Verifier',type:'import',tracks:[{name:'Piano',notes:[
   {pitch:60,start:0,duration:3,velocity:85,track:0,channel:0},
   {pitch:62,start:1,duration:2,velocity:85,track:0,channel:0},
   {pitch:64,start:2,duration:1,velocity:85,track:0,channel:0},
  ]}]});
  app.setMode('listen');app.seek(0);
 });
 const setSpeed=async value=>page.locator('#speed').evaluate((input,next)=>{input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}))},value);
 await setSpeed(100);
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
 await page.waitForTimeout(160);
 await setSpeed(50);
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.state.speed===50,null,{timeout:30000});
 const speedStart=await page.evaluate(()=>window.__prototypeTest.pos);
 await page.waitForTimeout(260);
 const speedEnd=await page.evaluate(()=>window.__prototypeTest.pos);
 const speedDelta=speedEnd-speedStart;
 assert.ok(speedDelta>.06&&speedDelta<.22,`50% speed should advance the audio-clock cursor proportionally; measured ${speedDelta}s over 260ms`);

 const epochBeforeSeek=await page.evaluate(()=>window.__prototypeTest.audio.engine.epochFor('file'));
 await page.evaluate(()=>window.__prototypeTest.seek(1.8));
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.pos>=1.8&&window.__prototypeTest.pos<2.05,null,{timeout:30000});
 const seekAfter=await page.evaluate(()=>({position:window.__prototypeTest.pos,epoch:window.__prototypeTest.audio.engine.epochFor('file')}));
 assert.ok(seekAfter.epoch>epochBeforeSeek,'active seek must invalidate the prior file event epoch');

 await setSpeed(100);
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.state.speed===100,null,{timeout:30000});
 await page.evaluate(()=>window.__prototypeTest.pause());
 await page.locator('#loopClearBtn').click();
 await page.evaluate(()=>window.__prototypeTest.seek(.2));
 await page.locator('#loopStartBtn').click();
 await page.evaluate(()=>window.__prototypeTest.seek(.65));
 await page.locator('#loopEndBtn').click();
 if(!(await page.evaluate(()=>window.__prototypeTest.loop.enabled)))await page.locator('#loopBtn').click();
 const loopBounds=await page.evaluate(()=>window.__prototypeTest.loop);
 assert.deepEqual(loopBounds,{start:.2,end:.65,enabled:true});
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
 await page.waitForFunction(({start,end})=>{
  const app=window.__prototypeTest,position=app.pos;
  window.__sfTransportLoopSeenEnd||=false;
  if(position>=end-.035)window.__sfTransportLoopSeenEnd=true;
  return window.__sfTransportLoopSeenEnd&&position<start+.12&&app.isPlaying;
 },{start:loopBounds.start,end:loopBounds.end},{timeout:10000});
 const loopAfter=await page.evaluate(()=>({position:window.__prototypeTest.pos,playing:window.__prototypeTest.isPlaying,loop:window.__prototypeTest.loop}));
 assert.ok(loopAfter.position>=loopBounds.start&&loopAfter.position<loopBounds.start+.12,'loop transport must wrap to its selected start');
 assert.equal(loopAfter.playing,true,'loop wrap must keep the transport active');
 await page.evaluate(()=>window.__prototypeTest.pause());
 await page.waitForFunction(()=>!window.__prototypeTest.isPlaying,null,{timeout:10000});

 // Render through the app's actual file timeline, seek replay and PCM tap.
 // A note released before pedal-down must stay ended after a seek; a note
 // released while sustain is down must resume until its later pedal-up.
 const makePedalEvents=(noteId,controls)=>[
  {type:'noteOn',time:0,channel:0,track:0,sourceTrack:0,sequence:0,noteId,pitch:60,velocity:85},
  ...controls.map(control=>({type:'cc',time:control.time,channel:0,sourceTrack:0,controller:64,value:control.value})),
  {type:'noteOff',time:1,channel:0,track:0,sourceTrack:0,sequence:controls.length+1,noteId,pitch:60,velocity:0},
 ].sort((a,b)=>a.time-b.time||(a.sequence??0)-(b.sequence??0)).map((event,sequence)=>({...event,sequence}));
 const measureCapture=async(slot,windows)=>page.evaluate(async({slot,windows})=>{
  const pcm=await window.__sf03SeekRuns[slot].capture;
  const epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
  const measure=({from,to,frequency=261.625565})=>{
   if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||pcm.startedAt>from+epsilon(from,pcm.startedAt)||pcm.endedAt<to-epsilon(to,pcm.endedAt))throw new Error(`seek PCM does not cover [${from}, ${to}]`);
   const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+epsilon((from-pcm.startedAt)*pcm.sampleRate));
   const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-epsilon((to-pcm.startedAt)*pcm.sampleRate));
   if(first<0||last>pcm.frames||last<=first)throw new Error('seek PCM sample interval is incomplete or empty');
   let energy=0,count=0,nonzero=0,q0=0,q1=0,q2=0;
   const coefficient=2*Math.cos(2*Math.PI*frequency/pcm.sampleRate);
   for(let index=first;index<last;index++){
    const left=pcm.samples[0][index],right=pcm.samples[1][index];
    if(!Number.isFinite(left)||!Number.isFinite(right))throw new Error('seek PCM has a non-finite sample');
    const sample=(left+right)*.5;
    energy+=left*left+right*right;count+=2;if(left!==0)nonzero++;if(right!==0)nonzero++;
    q0=sample+coefficient*q1-q2;q2=q1;q1=q0;
   }
   return {from,to,first,last,count,nonzero,rms:Math.sqrt(energy/count),fundamental:Math.sqrt(Math.max(0,q1*q1+q2*q2-coefficient*q1*q2))/(last-first)};
  };
  return {sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,windows:Object.fromEntries(Object.entries(windows).map(([name,range])=>[name,measure(range)]))};
 },{slot,windows});
 const runSeekPcmCase=async({slot,seekTo,controls,captureSeconds=1.8})=>{
  const noteId=`${slot}-c4`;
  const audioEvents=makePedalEvents(noteId,controls);
  await page.evaluate(async({slot,noteId,seekTo,audioEvents,captureSeconds})=>{
   const app=window.__prototypeTest,audio=app.audio;
   app.pause();await audio.panic({group:'all'});await audio.ensureReady();
   app.loadSong({id:slot,title:'Pedal seek PCM fixture',author:'Verifier',type:'import',tracks:[{name:'Piano',notes:[
    {pitch:60,start:0,duration:1,velocity:85,track:0,channel:0,noteId},
    {pitch:48,start:4,duration:.2,velocity:85,track:0,channel:1,noteId:`${slot}-duration-only`},
   ]}],audioEvents});
   app.setMode('listen');app.seek(0);
   const engine=audio.engine;await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});engine.setMasterGain(.25);
   await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:85}]}]);
   const capture=engine.capturePcm({durationSeconds:captureSeconds});
   window.__sf03SeekRuns??={};window.__sf03SeekRuns[slot]={engine,capture,seekTo};
  },{slot,noteId,seekTo,audioEvents,captureSeconds});
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
  await page.waitForTimeout(120);
  await page.evaluate(({slot,seekTo})=>{
   const run=window.__sf03SeekRuns[slot];run.seekRequestedAt=run.engine.context.currentTime;
   window.__prototypeTest.seek(seekTo);
  },{slot,seekTo});
  await page.waitForFunction(target=>{
   const app=window.__prototypeTest;
   return app.isPlaying&&Math.abs(app.pos-target)<.08;
  },seekTo,{timeout:30000});
  const resumedAt=await page.evaluate(slot=>{
   const run=window.__sf03SeekRuns[slot];run.resumedAt=run.engine.context.currentTime;return run.resumedAt;
  },slot);
  return {resumedAt,seekTo,audioEvents};
 };
 const latchedControls=[{time:.5,value:127},{time:2,value:0}];
 const latchedRun=await runSeekPcmCase({slot:'latched-note-seek-while-pedal-down',seekTo:1.5,controls:latchedControls});
 const latchedPcm=await measureCapture('latched-note-seek-while-pedal-down',{
  beforePedalOff:{from:latchedRun.resumedAt+.1,to:latchedRun.resumedAt+.28},
  afterPedalOff:{from:latchedRun.resumedAt+.68,to:latchedRun.resumedAt+.88},
 });
 assert.ok(latchedPcm.windows.beforePedalOff.nonzero>0&&latchedPcm.windows.beforePedalOff.fundamental>0,
  'a note released while CC64 is down must remain audible after seeking to 1.5 before pedal-up at 2');
 assert.ok(latchedPcm.windows.afterPedalOff.count>0,'the post-pedal-off PCM window must be fully measured');
 await page.evaluate(()=>window.__prototypeTest.pause());

 const endedBeforePedalRun=await runSeekPcmCase({slot:'released-before-later-pedal-down',seekTo:3,controls:[{time:2,value:127}]});
 const endedBeforePedalPcm=await measureCapture('released-before-later-pedal-down',{
  afterSeek:{from:endedBeforePedalRun.resumedAt+.1,to:endedBeforePedalRun.resumedAt+.3},
 });
 assert.ok(endedBeforePedalPcm.windows.afterSeek.rms<latchedPcm.windows.beforePedalOff.rms*.05,
  'a NoteOff at 1 must not be resurrected by a later pedal-down at 2 when seeking to 3');
 await page.evaluate(()=>window.__prototypeTest.pause());

 const endedAfterPedalRun=await runSeekPcmCase({slot:'released-after-pedal-up',seekTo:1.5,controls:[{time:.5,value:127},{time:1.2,value:0}]});
 const endedAfterPedalPcm=await measureCapture('released-after-pedal-up',{
  afterSeek:{from:endedAfterPedalRun.resumedAt+.1,to:endedAfterPedalRun.resumedAt+.3},
 });
 assert.ok(endedAfterPedalPcm.windows.afterSeek.rms<latchedPcm.windows.beforePedalOff.rms*.05,
  'a note released while pedal was down, then released by pedal-up at 1.2, must not be resurrected by seeking to 1.5');
 await page.evaluate(()=>window.__prototypeTest.pause());

 // A loop boundary clips/suppresses a notated NoteOff that lies beyond the
 // loop end while sustain is down. On the next iteration, the prior held
 // voice must be cancelled before the following iteration reaches the onset.
 const loopNoteId='loop-clipped-sustain-c4';
 const loopEvents=[
  {type:'cc',time:.35,channel:0,sourceTrack:0,sequence:0,controller:64,value:127},
  {type:'noteOn',time:.4,channel:0,track:0,sourceTrack:0,sequence:1,noteId:loopNoteId,pitch:60,velocity:85},
  {type:'cc',time:2,channel:0,sourceTrack:0,sequence:2,controller:64,value:0},
  {type:'noteOff',time:1.5,channel:0,track:0,sourceTrack:0,sequence:3,noteId:loopNoteId,pitch:60,velocity:0},
 ].sort((a,b)=>a.time-b.time||a.sequence-b.sequence).map((event,sequence)=>({...event,sequence}));
 await page.evaluate(async({loopEvents,loopNoteId})=>{
  const app=window.__prototypeTest,audio=app.audio;app.pause();await audio.panic({group:'all'});await audio.ensureReady();
  app.loadSong({id:'loop-clipped-sustain-pcm',title:'Loop clipped sustain PCM fixture',author:'Verifier',type:'import',tracks:[{name:'Piano',notes:[
   {pitch:60,start:.4,duration:1.1,velocity:85,track:0,channel:0,noteId:loopNoteId},
   {pitch:48,start:3,duration:.2,velocity:85,track:0,channel:1,noteId:'loop-clipped-duration-only'},
  ]}],audioEvents:loopEvents});
  app.setMode('listen');app.seek(.2);
  const engine=audio.engine;await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});engine.setMasterGain(.25);
  await engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:85}]}]);
  const run={engine,capture:null,baseAt:null,loopEnd:.85,sourceNoteOffTime:loopEvents.find(event=>event.type==='noteOff'&&event.noteId===loopNoteId)?.time??null,
   scheduled:[],cancellations:[],sawBoundary:false,boundaryObservedAt:null,wrapObservedAt:null};
  const originalScheduleEvent=engine.scheduleEvent.bind(engine),originalCancelGroup=engine.cancelGroup.bind(engine);
  run.originalScheduleEvent=originalScheduleEvent;run.originalCancelGroup=originalCancelGroup;
  engine.scheduleEvent=event=>{
   const epoch=event.epoch??engine.epochFor('file');
   const sequence=originalScheduleEvent(event);
   if(event.group==='file'&&event.channel===0&&event.noteId===loopNoteId&&['noteOn','noteOff'].includes(event.type))run.scheduled.push({...event,epoch,sequence});
   return sequence;
  };
  engine.cancelGroup=async(group,options={})=>{
   const before=engine.context.currentTime,result=await originalCancelGroup(group,options),after=engine.context.currentTime;
   if(group==='file')run.cancellations.push({group,before,after,requestedFromTime:options?.fromTime??before,epoch:Number.isInteger(result)?result:engine.epochFor('file')});
   return result;
  };
  window.__sf03LoopPcm=run;
 },{loopEvents,loopNoteId});
 await page.locator('#loopClearBtn').click();
 await page.evaluate(()=>window.__prototypeTest.seek(.2));
 await page.locator('#loopStartBtn').click();
 await page.evaluate(()=>window.__prototypeTest.seek(.85));
 await page.locator('#loopEndBtn').click();
 if(!(await page.evaluate(()=>window.__prototypeTest.loop.enabled)))await page.locator('#loopBtn').click();
 const sustainLoopBounds=await page.evaluate(()=>window.__prototypeTest.loop);
 assert.deepEqual(sustainLoopBounds,{start:.2,end:.85,enabled:true});
 await page.evaluate(()=>window.__prototypeTest.seek(.2));
 await page.evaluate(()=>{
  const run=window.__sf03LoopPcm;run.baseAt=run.engine.context.currentTime;
  run.capture=run.engine.capturePcm({durationSeconds:1.6});
 });
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
 await page.waitForFunction(({start,end})=>{
  const app=window.__prototypeTest,run=window.__sf03LoopPcm,position=app.pos;
  if(position>=end-.035&&!run.sawBoundary){run.sawBoundary=true;run.boundaryObservedAt=app.audio.engine.context.currentTime}
  if(run.sawBoundary&&position<start+.08&&app.isPlaying){run.wrapObservedAt??=app.audio.engine.context.currentTime;return true}
  return false;
 },{start:.2,end:.85},{timeout:10000});
 let nextLoopNoteWaitError=null;
 try{await page.waitForFunction(noteId=>window.__sf03LoopPcm.scheduled.filter(event=>event.type==='noteOn'&&event.noteId===noteId).length>=2,loopNoteId,{timeout:10000})}
 catch(error){nextLoopNoteWaitError=String(error?.message||error)}
 const loopPcm=await page.evaluate(async()=>{
  const run=window.__sf03LoopPcm,pcm=await run.capture,rate=pcm.sampleRate;
  const fixtureNoteId=run.scheduled.find(item=>item.type==='noteOn')?.noteId;
  const noteOns=run.scheduled.filter(event=>event.type==='noteOn'&&event.noteId===fixtureNoteId).sort((a,b)=>a.at-b.at);
  const firstNoteOn=noteOns[0]||null,secondNoteOn=noteOns[1]||null;
  const cancellation=firstNoteOn&&secondNoteOn?run.cancellations.find(item=>item.group==='file'&&item.before>firstNoteOn.at&&item.before<secondNoteOn.at)||null:null;
  const measure=(from,to)=>{
   const details={from,to,durationSeconds:to-from,first:null,last:null,count:0,nonzero:0,rms:null,ok:false};
   if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from){details.error='requested PCM interval is not positive';return details}
   const epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
   if(pcm.startedAt>from+epsilon(from,pcm.startedAt)||pcm.endedAt<to-epsilon(to,pcm.endedAt)){details.error='capture does not fully cover requested absolute interval';return details}
   const first=Math.floor((from-pcm.startedAt)*rate+epsilon((from-pcm.startedAt)*rate)),last=Math.ceil((to-pcm.startedAt)*rate-epsilon((to-pcm.startedAt)*rate));
   details.first=first;details.last=last;
   if(first<0||last>pcm.frames||last<=first){details.error='PCM frame interval is out of range or empty';return details}
   let energy=0,count=0,nonzero=0;
   for(let index=first;index<last;index++)for(const channel of pcm.samples){const sample=channel[index];if(!Number.isFinite(sample)){details.error=`non-finite PCM sample at frame ${index}`;return details}energy+=sample*sample;count++;if(sample!==0)nonzero++;}
   return {...details,count,nonzero,rms:Math.sqrt(energy/count),ok:count>0};
  };
  let active=null,quietGap=null,oldEpochNoteOffs=[],lateOldEpochNoteOffs=[];
  if(firstNoteOn&&secondNoteOn&&cancellation){
   const activeTo=cancellation.before-.04,activeFrom=Math.max(firstNoteOn.at+.03,activeTo-.14);
   const quietFrom=cancellation.after+.04,quietTo=secondNoteOn.at-.02;
   active=measure(activeFrom,activeTo);quietGap=measure(quietFrom,quietTo);
   oldEpochNoteOffs=run.scheduled.filter(event=>event.type==='noteOff'&&event.noteId===firstNoteOn.noteId&&event.epoch===firstNoteOn.epoch).sort((a,b)=>a.at-b.at);
   const epsilon=8*Number.EPSILON*Math.max(1,Math.abs(cancellation.before),...oldEpochNoteOffs.map(event=>Math.abs(event.at)));
   lateOldEpochNoteOffs=oldEpochNoteOffs.filter(event=>event.at>cancellation.before+epsilon);
  }
  return {sampleRate:rate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt,captureArmedAt:run.baseAt,loopEnd:run.loopEnd,sourceNoteOffTime:run.sourceNoteOffTime,
   firstNoteOn,secondNoteOn,cancellation,oldEpochNoteOffs,lateOldEpochNoteOffs,boundaryObservedAt:run.boundaryObservedAt,wrapObservedAt:run.wrapObservedAt,
   observedEvents:run.scheduled.map(event=>({type:event.type,sequence:event.sequence,at:event.at,epoch:event.epoch,group:event.group,channel:event.channel,pitch:event.pitch,noteId:event.noteId})),
   cancellations:run.cancellations,active,quietGap,windowDerivation:'active immediately before observed file cancellation; quiet after cancellation acknowledgement and before the next loop NoteOn'};
 });
 loopPcm.nextLoopNoteWaitError=nextLoopNoteWaitError;
 evidence.loopClippedSustain={bounds:sustainLoopBounds,pcm:loopPcm};
 assert.ok(loopPcm.firstNoteOn&&loopPcm.secondNoteOn&&loopPcm.cancellation,'the loop fixture must observe both actual scheduled NoteOns and the file-group cancel between them');
 assert.ok(loopPcm.cancellation.epoch>loopPcm.firstNoteOn.epoch,'the loop boundary cancellation must advance the file event epoch');
 assert.equal(loopPcm.secondNoteOn.epoch,loopPcm.cancellation.epoch,'the next loop iteration NoteOn must use the new file cancellation epoch');
 assert.ok(loopPcm.sourceNoteOffTime>loopPcm.loopEnd,'fixture source NoteOff must lie beyond the selected loop end');
 assert.equal(loopPcm.lateOldEpochNoteOffs.length,0,'a NoteOff from the cancelled iteration must not remain queued after the loop boundary; the app may omit it or clip it to the boundary');
 assert.ok(loopPcm.active?.ok&&loopPcm.active.nonzero>0&&loopPcm.active.rms>0,'loop sustain PCM positive control must capture the held first iteration note before cancellation');
 assert.ok(loopPcm.quietGap?.ok&&loopPcm.quietGap.count>0,'the post-cancel pre-onset interval must contain a fully covered nonempty sample window');
 assert.ok(loopPcm.quietGap.rms<loopPcm.active.rms*.05,`loop-clipped NoteOff under sustain must be silent after cancellation and before the next onset: active=${loopPcm.active.rms}, quiet=${loopPcm.quietGap.rms}`);
 await page.evaluate(()=>{
  const run=window.__sf03LoopPcm;
  run.engine.scheduleEvent=run.originalScheduleEvent;
  run.engine.cancelGroup=run.originalCancelGroup;
 });
 await page.evaluate(()=>window.__prototypeTest.pause());
 await page.locator('#loopClearBtn').click();

 // A drum-only canonical event fixture has no bank/program event. The app
 // must initialize channel 9 from its normalized runtime drum inventory,
 // then render real kit samples for kick and both closed/open hat pitches.
 const drumFixture=await page.evaluate(async()=>{
  const app=window.__prototypeTest,audio=app.audio;app.pause();await audio.panic({group:'all'});await audio.ensureReady();
  const status=audio.getStatus(),kits=audio.listPresets({group:'drums',bankId:status.activeBank.id});
  const patch=kits.find(item=>item.bankMSB===0&&item.bankLSB===0&&item.program===0)||kits[0];
  if(!patch?.isDrum)throw new Error('The active runtime bank has no normalized drum kit');
  for(const field of ['bankMSB','bankLSB','program'])if(!Number.isInteger(patch[field])||patch[field]<0||patch[field]>127)throw new Error(`Runtime drum ${field} is outside MIDI range`);
  const pitches=[36,42,46],notes=pitches.map((pitch,index)=>({pitch,start:.12+index*.48,duration:.18,velocity:85,track:0,sourceTrack:0,channel:9,noteId:`sf03-drum-${pitch}`}));
  const audioEvents=[];let sequence=0;
  for(const note of notes){audioEvents.push({type:'noteOn',time:note.start,channel:9,track:0,sourceTrack:0,sequence:sequence++,noteId:note.noteId,pitch:note.pitch,velocity:note.velocity});audioEvents.push({type:'noteOff',time:note.start+note.duration,channel:9,track:0,sourceTrack:0,sequence:sequence++,noteId:note.noteId,pitch:note.pitch,velocity:0});}
  const engine=audio.engine;await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});engine.setMasterGain(.25);
  await engine.preparePatches([{bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:true,notes:pitches.map(pitch=>({pitch,velocity:85}))}]);
  app.loadSong({id:'sf03-channel-9-drum-only',title:'Channel 9 drum-only fixture',author:'Verifier',type:'import',tracks:[{name:'Drums',notes}],audioEvents});
  app.setMode('listen');app.seek(0);
  const original=engine.scheduleEvent.bind(engine);window.__sf03DrumScheduleOriginal=original;window.__sf03DrumEvents=[];
  engine.scheduleEvent=event=>{const seq=original(event);if(event.group==='file'&&event.channel===9&&['programChange','noteOn','noteOff'].includes(event.type))window.__sf03DrumEvents.push({...event,sequence:seq});return seq};
  const capture=engine.capturePcm({durationSeconds:2.2}),baseAt=engine.context.currentTime;
  window.__sf03DrumRun={engine,capture,baseAt,patch,notes,audioEvents};
  return {bankId:status.activeBank.id,patch,notes,audioEvents,contextState:engine.context.state,baseAt};
 });
 assert.equal(drumFixture.audioEvents.some(event=>event.type==='programChange'),false,'fixture must exercise the real channel-9 default without an explicit program change');
 assert.ok(drumFixture.patch.isDrum&&drumFixture.contextState==='running','drum fixture must use a selected runtime kit on a running audio context');
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>{
  const events=window.__sf03DrumEvents||[];
  return events.filter(event=>event.type==='noteOn').length>=3&&events.some(event=>event.type==='programChange');
 },null,{timeout:30000});
 const drumPcm=await page.evaluate(async()=>{
  const run=window.__sf03DrumRun,pcm=await run.capture,events=window.__sf03DrumEvents||[];
  const firstNote=events.find(event=>event.type==='noteOn');
  const initialProgram=events.find(event=>event.type==='programChange'&&event.at<=firstNote?.at);
  if(!initialProgram)throw new Error('No channel-9 program initialization preceded the first drum NoteOn');
  const epsilon=(...values)=>8*Number.EPSILON*Math.max(1,...values.map(Math.abs));
  const measure=event=>{
   const from=event.at+.015,to=event.at+.12;
   if(pcm.startedAt>from+epsilon(pcm.startedAt,from)||pcm.endedAt<to-epsilon(pcm.endedAt,to))throw new Error(`file drum PCM does not cover [${from}, ${to}]`);
   const first=Math.floor((from-pcm.startedAt)*pcm.sampleRate+epsilon((from-pcm.startedAt)*pcm.sampleRate));
   const last=Math.ceil((to-pcm.startedAt)*pcm.sampleRate-epsilon((to-pcm.startedAt)*pcm.sampleRate));
   if(first<0||last>pcm.frames||last<=first)throw new Error(`file drum PCM window is incomplete: ${first}..${last}/${pcm.frames}`);
   let energy=0,count=0,nonzero=0;
   for(let index=first;index<last;index++)for(const channel of pcm.samples){const sample=channel[index];if(!Number.isFinite(sample))throw new Error('file drum PCM contains a non-finite sample');energy+=sample*sample;count++;if(sample!==0)nonzero++;}
   return {pitch:event.pitch,at:event.at,noteId:event.noteId,first,last,count,nonzero,rms:Math.sqrt(energy/count)};
  };
  const noteOns=events.filter(event=>event.type==='noteOn');
  return {bankId:run.patch.bankId??null,patch:run.patch,programEvent:{sequence:initialProgram.sequence,at:initialProgram.at,channel:initialProgram.channel,bankMSB:initialProgram.bankMSB,bankLSB:initialProgram.bankLSB,program:initialProgram.program,isDrum:initialProgram.isDrum},pcm:{sampleRate:pcm.sampleRate,frames:pcm.frames,startedAt:pcm.startedAt,endedAt:pcm.endedAt},windows:noteOns.map(measure)};
 });
 assert.equal(drumPcm.programEvent.channel,9);
 assert.deepEqual({bankMSB:drumPcm.programEvent.bankMSB,bankLSB:drumPcm.programEvent.bankLSB,program:drumPcm.programEvent.program,isDrum:drumPcm.programEvent.isDrum},
  {bankMSB:drumFixture.patch.bankMSB,bankLSB:drumFixture.patch.bankLSB,program:drumFixture.patch.program,isDrum:true},'channel 9 must receive the normalized runtime kit tuple, never raw SoundFont bank 128');
 assert.deepEqual(drumPcm.windows.map(window=>window.pitch),[36,42,46]);
 for(const window of drumPcm.windows)assert.ok(window.count>0&&window.nonzero>0&&window.rms>0,`file drum pitch ${window.pitch} must render finite nonzero PCM`);
 await page.evaluate(()=>{window.__prototypeTest.pause();const engine=window.__prototypeTest.audio.engine;if(window.__sf03DrumScheduleOriginal)engine.scheduleEvent=window.__sf03DrumScheduleOriginal;});
 evidence={wait:{accepted,resumed},tempo,speed:{start:speedStart,end:speedEnd,delta:speedDelta},seek:{epochBefore:epochBeforeSeek,...seekAfter},loop:{bounds:loopBounds,...loopAfter},
  pedalSeek:{latched:{run:latchedRun,pcm:latchedPcm},releasedBeforeLaterPedal:{run:endedBeforePedalRun,pcm:endedBeforePedalPcm},releasedThenPedalUp:{run:endedAfterPedalRun,pcm:endedAfterPedalPcm}},
  loopClippedSustain:{bounds:sustainLoopBounds,pcm:loopPcm},drumOnly:{fixture:{bankId:drumFixture.bankId,patch:drumFixture.patch,notes:drumFixture.notes,audioEvents:drumFixture.audioEvents},pcm:drumPcm}};
 assert.deepEqual(errors,[]);
 console.log('B01/B02: actual Chromium Wait release, Tempo unison, speed scaling, active seek epoch and loop wrap: PASS');
}catch(error){
 failure={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)};
 throw error;
}finally{
 try{if(browser)await browser.close()}catch(error){failure??={name:error?.name||'Error',message:`Browser cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)}}
 try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}catch(error){failure??={name:error?.name||'Error',message:`Server cleanup failed: ${error?.message||error}`,stack:String(error?.stack||error)}}
 const artifactDir=path.join(root,'artifacts','audio-sf03','runs');
 fs.mkdirSync(artifactDir,{recursive:true});
 const artifactPath=path.join(artifactDir,`practice-transport-${runId}-${failure?'FAIL':'PASS'}.json`);
 fs.writeFileSync(artifactPath,JSON.stringify({schemaVersion:1,runId,test:'SF-03 real-app Wait/Tempo, speed, seek, loop, sustain replay PCM',status:failure?'FAIL':'PASS',startedAt,finishedAt:new Date().toISOString(),runtime,codeHashes,evidence,error:failure},null,2)+'\n');
 console.log('SF03 TRANSPORT ARTIFACT:',artifactPath);
}
