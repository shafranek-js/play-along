/**
 * LAUNCH-02: both original REST PNG assets are actually rendered when
 * one of two source-annotated hands is inactive. Chromium tests the real
 * production canvas, not just a generated positional plan.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const f=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('missing');return;}
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');
 fs.createReadStream(f).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('finger-guidance/poses'))missing.push(r.url())});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__fingerGuideTest);
 const saved=await page.evaluate(()=>{
  const notes=[
   {pitch:60,start:0,duration:1.2,finger:1,hand:'RH',track:0,velocity:90,fingeringSource:'musicxml',noteId:'rh-c'},
   {pitch:64,start:0,duration:1.2,finger:3,hand:'RH',track:0,velocity:90,fingeringSource:'musicxml',noteId:'rh-e'},
   {pitch:67,start:0,duration:1.2,finger:5,hand:'RH',track:0,velocity:90,fingeringSource:'musicxml',noteId:'rh-g'},
   {pitch:48,start:1.7,duration:1,finger:5,hand:'LH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'lh-c'},
   {pitch:52,start:1.7,duration:1,finger:3,hand:'LH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'lh-e'},
   {pitch:55,start:1.7,duration:1,finger:1,hand:'LH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'lh-g'}
  ];
  const app=window.__prototypeTest;
  app.loadSong({id:'launch02-rest-two-hands',title:'Alternating piano hands',
   author:'QA',type:'import',tracks:[{name:'Two hands',notes}]});
  app.setMode('listen');app.seek(0);
  // Record actual calls to draw the PNG on the visible piano canvas.
  const native=CanvasRenderingContext2D.prototype.drawImage;
  window.__restPaint=[];
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
   const src=String(image?.src||'');
   if(src.endsWith('-rest.png'))window.__restPaint.push(src);
   return native.call(this,image,...args);
  };
  return JSON.stringify(app.song.tracks[0].notes.map(n=>[n.pitch,n.start,n.duration,n.hand,n.finger]));
 });
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>window.__fingerGuideTest.imageAssets.LH.rest.loaded,null,{timeout:15000});
 const initial=await page.evaluate(()=>{
  const f=window.__fingerGuideTest;
  return {rests:f.passivePlacements,active:f.spritePlacements,
   loaded:f.imageAssets.LH.rest.loaded,paint:window.__restPaint};
 });
 assert.equal(initial.rests.LH?.pose,'rest','left hand must hover while only right hand plays');
 assert.equal(initial.rests.LH?.pitch,48,'first future LH source pitch anchors the resting hand');
 assert.equal(initial.rests.RH,null);
 assert.equal(initial.active.LH,null);
 assert.ok(initial.active.RH?.pose==='spread');
 assert.ok(initial.paint.some(p=>p.endsWith('/left-rest.png')),
  'actual original left rest PNG must be drawn on canvas');
 assert.ok(initial.rests.LH.width>25&&initial.rests.LH.height>40);
 const stationary=await page.evaluate(()=>{
  const app=window.__prototypeTest;
  const start=window.__fingerGuideTest.passivePlacements.LH;
  app.seek(.45);
  const later=window.__fingerGuideTest.passivePlacements.LH;
  return {x0:start.x,x1:later.x,y0:start.y,y1:later.y};
 });
 assert.deepEqual([stationary.x0,stationary.y0],[stationary.x1,stationary.y1],
  'rest PNG must not jump around while the other hand continues playing');

 // Advance Listen transport to the left-hand-only phrase: RH must now use
 // its own original resting asset at its preceding right-hand source keys.
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,null,{timeout:60000});
 await page.evaluate(()=>window.__prototypeTest.seek(1.87));
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>1.87&&window.__prototypeTest.pos<2.5,null,{timeout:10000});
 await page.waitForFunction(()=>window.__fingerGuideTest.imageAssets.RH.rest.loaded,null,{timeout:15000});
 const listening=await page.evaluate(()=>{
  const f=window.__fingerGuideTest;
  return {rests:f.passivePlacements,active:f.spritePlacements,
   pressed:f.preview.map(n=>n.pitch),paint:window.__restPaint};
 });
 assert.equal(listening.rests.RH?.pose,'rest');
 assert.equal(listening.rests.RH?.anchorStart,0,
  'idle RH remains near its previous notes rather than jumping to a future chord');
 assert.equal(listening.rests.LH,null);
 assert.equal(listening.active.RH,null);
 assert.ok(listening.active.LH,'left hand is actively playing');
 assert.ok(listening.pressed.some(p=>p===48),'listening still follows actual left-hand contacts');
 assert.ok(listening.paint.some(p=>p.endsWith('/right-rest.png')),
  'actual original right rest PNG must be drawn on canvas');

 // Wait targets the next undone group; idle hand remains a passive rest.
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.pause();app.setMode('wait');app.seek(0);
 });
 const waitStart=await page.evaluate(()=>window.__fingerGuideTest.passivePlacements);
 assert.equal(waitStart.LH?.pose,'rest');
 assert.equal(waitStart.RH,null);
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,null,{timeout:60000});
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.receiveNoteOn(60);app.receiveNoteOn(64);app.receiveNoteOn(67);
 });
 await page.waitForFunction(()=>window.__fingerGuideTest.frame.current===1.7,null,{timeout:10000});
 const afterChord=await page.evaluate(()=>{
  const f=window.__fingerGuideTest;
  return {rests:f.passivePlacements,preview:f.preview.map(n=>n.pitch)};
 });
 assert.equal(afterChord.rests.RH?.pose,'rest','after finishing RH chord, RH must become passive');
 assert.equal(afterChord.rests.LH,null);
 assert.deepEqual(afterChord.preview.sort((a,b)=>a-b),[48,52,55]);
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  for(const p of [60,64,67])app.receiveNoteOff(p);
  app.pause();
  app.loadSong({id:'one-hand',title:'Solo',author:'QA',type:'import',tracks:[
   {name:'Solo',notes:[{pitch:60,start:0,duration:.5,finger:1,hand:'RH',
    fingeringSource:'musicxml',velocity:80,track:0}]}
  ]});
 });
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.passivePlacements),
  {LH:null,RH:null},'a one-hand score must not invent a passive second hand');
 assert.deepEqual(missing,[],'no rest pose asset 404');
 assert.deepEqual(errors,[],'no Chromium runtime errors');
 assert.equal(saved.includes('[60,0,1.2,"RH",1]'),true);
 console.log('LAUNCH02_REST_HAND_PASS',JSON.stringify({
  bothOriginalRestPNGsRendered:true,stableAnchor:true,
  listenFollowsPhysicalKeys:true,waitTargetsUnfinishedChord:true,
  oneHandNeverInventsSecondHand:true,hardwareValidated:false
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
