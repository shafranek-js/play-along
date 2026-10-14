/** LAUNCH-02 real-browser test: actual original sprites fade/move in the canvas. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const f=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return;}
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');
 fs.createReadStream(f).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('finger-guidance/'))missing.push(r.url())});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__fingerGuideTest);
 await page.evaluate(()=>{
  const mk=(hand,pitches,start,duration)=>pitches.map((pitch,i)=>({
   pitch,start,duration,velocity:80,track:0,hand,
   finger:(hand==='RH'?[1,3,5]:[5,3,1])[i],
   fingeringSource:'musicxml',noteId:hand+'-'+start+'-'+i
  }));
  window.__prototypeTest.loadSong({
   id:'qa-crossfade',type:'import',title:'Two hands alternate',author:'QA',
   tracks:[{name:'Written RH + LH',
    notes:[...mk('RH',[60,64,67],0,.6),
           ...mk('LH',[48,52,55],1.15,.7),
           ...mk('RH',[65,69,72],2.25,.7)]}]
  });
  window.__prototypeTest.setMode('listen');
  window.__prototypeTest.seek(0);
  window.__fingerGuideTest.preloadAllPoses();
  window.__handPaint=[];
  const real=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(img,...args){
   const src=String(img?.src||'');
   if(src.includes('/finger-guidance/poses/') && (src.endsWith('-rest.png')||src.endsWith('-spread.png'))){
    window.__handPaint.push({src:src.split('/').at(-1),alpha:this.globalAlpha,x:args[0],
     y:args[1],at:performance.now()});
    if(window.__handPaint.length>1500)window.__handPaint.shift();
   }
   return real.call(this,img,...args);
  };
 });
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>Object.values(window.__fingerGuideTest.imageAssets)
  .every(poses=>Object.values(poses).every(p=>p.loaded)),null,{timeout:25000});
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.handBlends.LH.to),'rest');

 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,null,{timeout:60000});
 // Let the score physically release RH first, then start LH. The 200ms
 // transition is sampled by an actual browser animation frame, not a mocked
 // clock or a Seek that would intentionally cancel the animation.
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
   window.__fingerGuideTest.handBlends.RH.from==='spread'&&
   window.__fingerGuideTest.handBlends.RH.to==='rest',
  null,{timeout:20000,polling:'raf'});
 const release=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,blend:window.__fingerGuideTest.handBlends.RH,
  preview:window.__fingerGuideTest.preview
 }));
 assert.ok(release.pos>=.58&&release.pos<.95,'release is attached to real NoteOff');
 assert.deepEqual(release.preview,[],'no lingering pressed source-note marker after NoteOff');

 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
   window.__fingerGuideTest.handBlends.LH.from==='rest'&&
   window.__fingerGuideTest.handBlends.LH.to==='spread',
  null,{timeout:20000,polling:'raf'});
 // The first exact NoteOn frame starts at progress=0. Sample a later
 // browser frame too: opacity is intentionally still 0.70 at that instant.
 await page.waitForFunction(()=>window.__handPaint.some(p=>
  p.src==='left-rest.png'&&p.alpha<.69)&&window.__handPaint.some(p=>
  p.src==='left-spread.png'&&p.alpha>.5&&p.alpha<.87),
  null,{timeout:10000,polling:'raf'});
 const onset=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,blend:window.__fingerGuideTest.handBlends.LH,
  preview:window.__fingerGuideTest.preview,
  paint:window.__handPaint.slice()
 }));
 assert.ok(onset.pos>=1.14&&onset.pos<1.5,'entering pose is triggered by actual LH NoteOn');
 assert.ok(onset.preview.some(n=>n.pitch===48),'source keys turn on immediately');
 assert.ok(onset.paint.some(p=>p.src==='left-rest.png'&&p.alpha<.7),
  'rest PNG is faded in the actual Canvas');
 assert.ok(onset.paint.some(p=>p.src==='left-spread.png'&&p.alpha<.87),
  'working PNG is faded in the actual Canvas');
 assert.ok(onset.paint.some(p=>p.src==='right-spread.png'&&p.alpha<=.18),
  'released RH note uses only a faint, non-actionable visual trail');

 // Seek is a hard scene change: no stale transition from the old phrase.
 await page.evaluate(()=>window.__prototypeTest.seek(.2));
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>=.2&&window.__prototypeTest.pos<.5,null,{timeout:15000});
 const seeked=await page.evaluate(()=>window.__fingerGuideTest.handBlends);
 assert.equal(seeked.LH.from,null);
 assert.equal(seeked.RH.from,null);
 await page.evaluate(()=>{window.__prototypeTest.pause();window.__prototypeTest.setMode('wait');window.__prototypeTest.seek(0)});
 await page.waitForFunction(()=>window.__fingerGuideTest.handBlends.LH.from===null);
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.handBlends.LH.to),'rest');
 // Wait: crossfade is non-authoritative; still requires actual complete
 // correct chord input, never accepts a wrong pitch as completion.
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,null,{timeout:60000});
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(61));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.current),0,
  'wrong key must not advance Wait');
 await page.evaluate(()=>{for(const p of [60,64,67])window.__prototypeTest.receiveNoteOn(p)});
 await page.waitForFunction(()=>window.__fingerGuideTest.frame.current===1.15,null,{timeout:15000});
 // Wait's musical target is synchronous. The Canvas pose is updated on the
 // following requestAnimationFrame, so observe that actual painted frame.
 await page.waitForFunction(()=>window.__fingerGuideTest.handBlends.LH.to==='spread',
  null,{timeout:15000,polling:'raf'});
 const wait=await page.evaluate(()=>({
  blend:window.__fingerGuideTest.handBlends.LH,
  pitches:window.__fingerGuideTest.waitTargets.map(n=>n.pitch)
 }));
 assert.equal(wait.blend.to,'spread');
 assert.deepEqual(wait.pitches.sort((a,b)=>a-b),[48,52,55],
  'Wait target changes immediately, even if PNG is still fading');
 await page.evaluate(()=>window.__prototypeTest.pause());
 await page.emulateMedia({reducedMotion:'reduce'});
 // Reduced motion disables the animation at the next render.
 await page.evaluate(()=>window.__prototypeTest.seek(0));
 await page.waitForFunction(()=>window.__fingerGuideTest.handBlends.LH.from===null);
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 console.log('LAUNCH02_HAND_CROSSFADE_PASS',JSON.stringify({
  sourceNoteOnOff:true,actualPNGAlpha:true,perHandReleaseAndEntry:true,
  seekReset:true,waitUnchanged:true,reducedMotion:true,hardwareValidated:false
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
