import {selectCompactFingerMode,selectCompactLookahead} from './compact-ui-helpers.mjs';
/**
 * LAUNCH-02 v0.10.112: real production Chromium, solo-rest continuity and
 * nearby active-to-active hand motion. No fake NoteOn or extra unknown hand.
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
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',
  f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':
  f.endsWith('.png')?'image/png':'text/html');
 fs.createReadStream(f).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},
  reducedMotion:'no-preference'});
 const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('finger-guidance'))missing.push(r.url())});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__fingerGuideTest);
 await page.evaluate(()=>{
  window.__originalHandDraws=[];
  const native=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(img,...args){
   const src=String(img?.src||'');
   if(src.includes('/finger-guidance/poses/')){
    window.__originalHandDraws.push({
     asset:src.split('/').at(-1),alpha:this.globalAlpha,
     x:args[0],scoreTime:window.__prototypeTest?.pos??null
    });
    if(window.__originalHandDraws.length>2000)window.__originalHandDraws.shift();
   }
   return native.call(this,img,...args);
  };
  const note=(pitch,start,duration,finger)=>({pitch,start,duration,finger,
   fingeringSource:'musicxml',hand:'RH',track:0,velocity:80,
   noteId:'solo-'+pitch+'-'+start});
  window.__prototypeTest.loadSong({
   id:'qa-continuous-solo',title:'Solo rest and consecutive notes',author:'QA',type:'import',
   tracks:[{name:'Right hand only',notes:[
    note(60,0,.5,2),note(64,1,.5,3),note(67,1.5,.6,4)
   ]}]
  });
  window.__prototypeTest.setMode('listen');
  window.__prototypeTest.seek(0);
  window.__fingerGuideTest.preloadAllPoses();
 });
 await selectCompactFingerMode(page,'hands');
 await page.waitForFunction(()=>Object.values(window.__fingerGuideTest.imageAssets)
  .every(group=>Object.values(group).every(item=>item.loaded)),null,{timeout:25000});
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,
  null,{timeout:60000});
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>.64&&window.__prototypeTest.pos<.91&&
  window.__fingerGuideTest.handBlends.RH.to==='rest',
  null,{timeout:10000,polling:'raf'});
 const silence=await page.evaluate(()=>({
  poses:window.__fingerGuideTest.handBlends,
  notes:window.__fingerGuideTest.preview,
  images:window.__originalHandDraws.filter(n=>n.scoreTime>.55&&n.scoreTime<.92)
 }));
 assert.equal(silence.poses.RH.to,'rest','known solo hand remains at rest between notes');
 assert.equal(silence.poses.LH.to,null,'do not invent a second hand');
 assert.deepEqual(silence.notes,[],'the original score has no pressed keys in rest');
 assert.ok(silence.images.some(n=>n.asset==='right-rest.png'&&n.alpha>.1),
  'real original rest PNG is drawn during the score silence');
 assert.ok(!silence.images.some(n=>n.asset==='left-rest.png'),
  'no fabricated left hand PNG in solo');

 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>1.5&&window.__prototypeTest.pos<1.62&&
  window.__fingerGuideTest.handBlends.RH.from==='middle'&&
  window.__fingerGuideTest.handBlends.RH.to==='ring',
  null,{timeout:10000,polling:'raf'});
 await page.waitForFunction(()=>window.__originalHandDraws.some(n=>
  n.asset==='right-middle.png'&&n.scoreTime>1.5&&n.alpha>0&&n.alpha<=.12)&&
  window.__originalHandDraws.some(n=>
  n.asset==='right-ring.png'&&n.scoreTime>1.5&&Math.abs(n.alpha-.87)<.001),
  null,{timeout:3000,polling:'raf'});
 const moving=await page.evaluate(()=>({
  notes:window.__fingerGuideTest.preview,
  poses:window.__fingerGuideTest.handBlends,
  alpha:window.__originalHandDraws.filter(n=>n.scoreTime>1.5&&n.scoreTime<1.64&&
   ['right-middle.png','right-ring.png'].includes(n.asset)).slice(-30)
 }));
 assert.deepEqual(moving.notes.map(n=>n.pitch),[67],
  'new actual source-note contact is immediately 67 only');
 assert.equal(moving.poses.RH.to,'ring');
 assert.ok(moving.alpha.some(n=>n.asset==='right-ring.png'&&Math.abs(n.alpha-.87)<.001));
 assert.ok(moving.alpha.some(n=>n.asset==='right-middle.png'&&n.alpha<=.12));
 await page.evaluate(()=>window.__prototypeTest.seek(.2));
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>.2&&window.__prototypeTest.pos<.5,null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.handBlends.RH.from),null,
  'Seek resets unfinished active movement');

 // Unannotated MIDI cannot conjure either active or resting visual hand.
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.pause();
  app.loadSong({id:'qa-unknown-midi',type:'import',title:'Unknown',
   author:'QA',tracks:[{name:'Unannotated',notes:[
    {pitch:60,start:0,duration:.8,velocity:80,track:0}
   ]}]});
  app.setMode('listen');
 });
 await page.waitForFunction(()=>window.__fingerGuideTest.steps.length===0);
 await page.evaluate(()=>window.__prototypeTest.seek(0));
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&
  window.__prototypeTest.pos>.05&&window.__prototypeTest.pos<.5,
  null,{timeout:10000,polling:'raf'});
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.handBlends),{
  LH:{from:null,to:null,startedMs:null,poseX:null,poseY:null},
  RH:{from:null,to:null,startedMs:null,poseX:null,poseY:null}
 },'unknown MIDI never receives a guessed finger or hand pose');

 assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
 console.log('LAUNCH02_CONTINUOUS_HAND_PASS',JSON.stringify({
  soloRestRendered:true,noImaginarySecondHand:true,originalPNGActiveTrace:true,
  exactSourceNoteOn:true,explicitSeekReset:true,unknownMIDIRefused:true,
  physicalHardwareValidation:false
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
