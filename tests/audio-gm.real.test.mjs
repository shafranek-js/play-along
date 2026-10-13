import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// Presence smoke test: one equal-velocity central note for every GM program.
// This does not rate timbre or prove the instrument's full keyboard range.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const base='/play-along/';
const startedAt=new Date().toISOString();
const runId=startedAt.replace(/[:.]/g,'-')+'-'+process.pid;
const hashes=Object.fromEntries(['assets/audio/index.js','assets/audio/sf01-synth-worklet.js','assets/audio/sf01-pcm-tap.js'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(dist,name))).digest('hex')]));
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname===base+'gm-smoke.html'){
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><title>GM sound presence</title><button id="start">Start</button>');return;
 }
 if(!pathname.startsWith(base)){res.writeHead(404);res.end();return;}
 const filename=path.resolve(dist,decodeURIComponent(pathname.slice(base.length)));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':filename.endsWith('.js')?'application/javascript':filename.endsWith('.json')?'application/json':'application/octet-stream'});
 fs.createReadStream(filename).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,evidence,error,runtime;
const pageErrors=[];
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 runtime={browserName:'chromium',browserVersion:browser.version(),executablePath:chromium.executablePath(),nodeVersion:process.version,platform:process.platform,architecture:process.arch,playwrightVersion:JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright/package.json'),'utf8')).version};
 const page=await browser.newPage();
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+base+'gm-smoke.html');
 await page.evaluate(()=>{
  document.querySelector('#start').onclick=()=>{
   window.gmContext=new AudioContext({sampleRate:48000});
   window.gmContext.resume();
  };
 });
 await page.click('#start');
 evidence=await page.evaluate(async()=>{
  const {createPlaybackAudioEngine,getSoundfontCatalog}=await import('./assets/audio/index.js');
  const context=window.gmContext;
  const engine=await createPlaybackAudioEngine(context,{masterGain:0.16});
  const catalog=await getSoundfontCatalog();
  const results=[];
  try{
   await engine.setEffects({enabled:false,reverbGain:0,chorusGain:0});
   await engine.capturePcm({durationSeconds:0.05});
   for(const bank of catalog.banks){
    const inventory=await engine.loadBank(bank.id);
    const presets=inventory.presets.filter(p=>!p.isDrum&&p.bankMSB===0&&p.bankLSB===0).sort((a,b)=>a.program-b.program);
    if(presets.length!==128||presets.some((p,i)=>p.program!==i))throw Error('GM inventory incomplete: '+bank.id);
    const rows=[];
    for(const preset of presets){
     await engine.cancelGroup('live');
     await engine.preparePatches([{bankMSB:0,bankLSB:0,program:preset.program,isDrum:false,notes:[{pitch:60,velocity:100}]}]);
     const capture=engine.capturePcm({durationSeconds:0.24});
     await new Promise(resolve=>setTimeout(resolve,15));
     const at=context.currentTime+0.045;
     engine.scheduleEvent({group:'live',channel:0,type:'programChange',bankMSB:0,bankLSB:0,program:preset.program,isDrum:false,at});
     engine.scheduleEvent({group:'live',channel:0,type:'noteOn',pitch:60,velocity:100,noteId:'gm-'+preset.program,at});
     engine.scheduleEvent({group:'live',channel:0,type:'noteOff',pitch:60,noteId:'gm-'+preset.program,at:at+0.14});
     const pcm=await capture;
     if(pcm.startedAt>at||pcm.endedAt<at+0.14)throw Error('Capture does not cover note: '+bank.id+'/'+preset.program);
     const begin=Math.max(0,Math.floor((at-pcm.startedAt)*pcm.sampleRate));
     const end=Math.min(pcm.frames,Math.ceil((at+0.14-pcm.startedAt)*pcm.sampleRate));
     let nonzero=0,sum=0,peak=0;
     for(const channel of pcm.samples){
      for(const value of channel)if(!Number.isFinite(value))throw Error('Non-finite PCM: '+bank.id+'/'+preset.program);
      for(let i=begin;i<end;i++){const value=channel[i];if(value!==0)nonzero++;sum+=value*value;peak=Math.max(peak,Math.abs(value));}
     }
     if(nonzero===0||!(sum>0))throw Error('No GM sound: '+bank.id+'/'+preset.program+' '+preset.name);
     rows.push({program:preset.program,name:preset.name,pitch:60,velocity:100,nonzero,peak,rms:Math.sqrt(sum/((end-begin)*pcm.channels))});
    }
    await engine.cancelAll();
    results.push({bankId:bank.id,sha256:bank.sha256,programCount:rows.length,programs:rows});
   }
   return {sampleRate:context.sampleRate,banks:results};
  }finally{await engine.dispose();await context.close();}
 });
 assert.equal(evidence.banks.length,2);
 assert.ok(evidence.banks.every(bank=>bank.programCount===128));
 assert.deepEqual(pageErrors,[]);
 console.log('GM real PCM: 128/128 programs in each of two banks: PASS');
}catch(e){error={message:String(e.message||e),stack:String(e.stack||e)};throw e;}
finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 const dir=path.join(root,'artifacts/audio-sf05/runs');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'gm-'+runId+'-'+(error?'FAIL':'PASS')+'.json');
 fs.writeFileSync(file,JSON.stringify({startedAt,finishedAt:new Date().toISOString(),status:error?'FAIL':'PASS',runtime,hashes,evidence,pageErrors,error},null,2)+'\n');
 console.log('GM report: '+file);
}
