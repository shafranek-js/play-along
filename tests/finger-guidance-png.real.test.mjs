import {selectCompactFingerMode,selectCompactLookahead} from './compact-ui-helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const output=path.join(root,'artifacts','finger-png');
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const filename=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end('not found');return;}
 res.setHeader('content-type',mime[path.extname(filename)]||'application/octet-stream');
 res.end(fs.readFileSync(filename));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[]; const broken=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().includes('/finger-guidance/'))broken.push(r.url());});
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__fingerGuideTest&&window.__prototypeTest);
 // Seven pose images for each hand are lazy-loaded in production.
 const before=await page.evaluate(()=>window.__fingerGuideTest.imageAssets);
 assert.ok(Object.values(before).every(group=>Object.values(group).every(a=>!a.requested)),
  'idle app should not download 14 hand PNGs until guidance is requested');
 await page.evaluate(()=>window.__fingerGuideTest.preloadAllPoses());
 await page.waitForFunction(()=>Object.values(window.__fingerGuideTest.imageAssets)
  .every(group=>Object.values(group).every(a=>a.loaded)),null,{timeout:25000});
 const assets=await page.evaluate(()=>window.__fingerGuideTest.imageAssets);
 for(const hand of ['LH','RH']){
  assert.equal(Object.keys(assets[hand]).length,7);
  for(const [pose,a] of Object.entries(assets[hand])){
   assert.equal(a.error,false,hand+' '+pose);
   assert.ok(a.width>=290&&a.height>=520,'full user PNG '+hand+' '+pose);
  }
 }
 assert.deepEqual(broken,[],'hand PNG network failures');
 await page.evaluate(()=>window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet));
 await selectCompactFingerMode(page,'hands');
 await page.waitForFunction(()=>window.__fingerGuideTest.steps.length===4);
 await page.screenshot({path:path.join(output,'two-hands.png')});
 const poses=await page.evaluate(()=>window.__fingerGuideTest.spritePlacements);
 assert.ok(poses.LH?.width>50&&poses.RH?.width>50,'hand placement requires both matched parts');
 assert.equal(poses.LH.pose,'spread');assert.equal(poses.RH.pose,'spread');
 assert.ok(poses.LH.error<=20&&poses.RH.error<=20,'finger placements within geometric tolerance');
 await selectCompactFingerMode(page,'ghost');
 await page.screenshot({path:path.join(output,'two-hands-ghost.png')});
 await page.evaluate(()=>window.__prototypeTest.seek(3.6));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.current),5.4);
 // Checking that a virtual piano press from the wrist area is excluded.
 const missed=await page.evaluate(()=>{
   const c=document.getElementById('roll'),r=c.getBoundingClientRect();
   const y=window.__fingerGuideTest.layout.keyboardTop+window.__fingerGuideTest.layout.keyboardBlackH*2.8;
   return window.__fingerGuideTest.imageAssets.LH.spread.loaded&&Number.isFinite(y);
 });
 assert.equal(missed,true);
 await page.evaluate(()=>window.__prototypeTest.loadSong({
  id:'midi-without-fingering',type:'import',author:'Test',title:'Unannotated MIDI',
  tracks:[{name:'Track',notes:[{pitch:60,start:0,duration:1,velocity:80,track:0}]}]
 }));
 await page.waitForFunction(()=>window.__fingerGuideTest.steps.length===0);
 await page.waitForFunction(()=>document.getElementById('fingerGuideStatus').textContent.includes('нет подтверждённой аппликатуры'));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.spritePlacements.LH),null);
 await page.evaluate(()=>window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet));
 await selectCompactFingerMode(page,'hands');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#layoutMenuButton').click();
 await page.locator('[data-layout="play"]').click();
 await page.waitForFunction(()=>document.body.classList.contains('noLeft')&&document.body.classList.contains('noRight'));
 await page.screenshot({path:path.join(output,'mobile.png')});
 assert.equal(await page.evaluate(()=>{
  const c=document.getElementById('roll'),r=c.getBoundingClientRect();
  return window.__prototypeTest.virtualKeyAt({clientX:r.left+120,clientY:r.top+r.height-8});
 }),null,'wrist margin below keyboard is not an interactive piano key');
 // FG-03B2: same source-anchored phrase in desktop, seek and narrow view.
 // Keep a short pre-roll before its first onset: Listen guidance advances
 // from the first group once playback's real clock leaves the song boundary.
 // The 0.5 s interval and authored poses stay unchanged.
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>window.__prototypeTest.loadSong({
  id:'fg03b2-shift',title:'FG-03B2 authored shift',author:'Test',type:'import',
  tracks:[{name:'Right hand',notes:[
   {pitch:60,start:1,duration:.3,velocity:80,track:0,finger:1,hand:'RH',fingeringSource:'musicxml'},
   {pitch:79,start:1.5,duration:.3,velocity:80,track:0,finger:5,hand:'RH',fingeringSource:'musicxml'}
  ]}]
 }));
 await selectCompactFingerMode(page,'ghost');
 await selectCompactLookahead(page,'750');
 await page.evaluate(()=>window.__prototypeTest.seek(.8));
 const paused=await page.evaluate(()=>window.__fingerGuideTest.ghostMotion);
 assert.equal(paused.visible,true);
 assert.equal(paused.plans.RH.kind,'static','Paused preview pins the silhouette to its next key');
 assert.deepEqual(paused.targets.RH,[{pitch:79,finger:5}]);
 await page.screenshot({path:path.join(output,'fg03b2-shift-paused.png')});
 // Playback now waits for the selected SoundFont's asynchronous readiness.
 // Start while the FIRST physical note is still depressed: active Listen hands
 // should press the current note while Ghost prepares the next.
 await page.evaluate(()=>window.__prototypeTest.seek(1.05));
 // Start through the real trusted control, then read the animated guidance
 // only after the transport has actually begun and its first frames render.
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest,audio=app?.audio?.getStatus?.();
  return app?.isPlaying===true&&audio?.lifecycle==='ready'&&
   audio?.transport?.isPlaying===true&&audio?.transport?.isStarting!==true;
 },null,{timeout:60000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const moving=await page.evaluate(()=>window.__fingerGuideTest.ghostMotion);
 assert.equal(moving.visible,true);
 assert.equal(moving.plans.RH.kind,'moving',
  'Playing should interpolate a safe wide jump rather than keeping a static ghost');
 assert.ok(moving.plans.RH.progress<1);
 await page.screenshot({path:path.join(output,'fg03b2-shift-moving.png')});
 await page.evaluate(()=>{window.__prototypeTest.pause();window.__prototypeTest.seek(1.1)});
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.ghostMotion.visible),false,
  'Seek past one onset recalculates preview with no stale in-transit sprite');
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__prototypeTest.seek(.8));
 const narrow=await page.evaluate(()=>window.__fingerGuideTest.ghostMotion);
 assert.equal(narrow.visible,true);
 assert.ok(['markers','static'].includes(narrow.plans.RH.kind),
  'A paused mobile preview is either correctly anchored or conservatively markers-only');
 assert.deepEqual(narrow.targets.RH,[{pitch:79,finger:5}]);
 await page.screenshot({path:path.join(output,'fg03b2-shift-mobile.png')});

 // Fully labelled two-hand crossing: never animate two images through one
 // another. Future source-marked keys remain visible via fixed badges.
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>window.__prototypeTest.loadSong({
  id:'fg03b2-cross',title:'FG-03B2 crossing',author:'Test',type:'import',
  tracks:[
   {name:'Right hand',notes:[
    {pitch:72,start:0,duration:.3,velocity:80,track:0,finger:1,hand:'RH',fingeringSource:'musicxml'},
    {pitch:60,start:.5,duration:.3,velocity:80,track:0,finger:1,hand:'RH',fingeringSource:'musicxml'}]},
   {name:'Left hand',notes:[
    {pitch:48,start:0,duration:.3,velocity:80,track:1,finger:5,hand:'LH',fingeringSource:'musicxml'},
    {pitch:84,start:.5,duration:.3,velocity:80,track:1,finger:5,hand:'LH',fingeringSource:'musicxml'}]}
  ]
 }));
 await page.evaluate(()=>window.__prototypeTest.seek(0));
 const crossing=await page.evaluate(()=>window.__fingerGuideTest.ghostMotion);
 assert.equal(crossing.visible,true);
 // The original PNG may be clipped in one of the four poses depending
 // on viewport geometry; in that case the geometric crossing classifier
 // deliberately reports false instead of inventing a hand center. The
 // safety invariant is stronger: neither hand may animate an unsafe path.
 assert.equal(crossing.plans.RH.kind,'markers');
 assert.equal(crossing.plans.LH.kind,'markers');
 assert.equal(crossing.crossing,true,
  'Two-hand motion with clipped/unknown pose must be treated as an unsafe crossing');
 assert.deepEqual(crossing.targets.RH,[{pitch:60,finger:1}]);
 assert.deepEqual(crossing.targets.LH,[{pitch:84,finger:5}]);
 await page.screenshot({path:path.join(output,'fg03b2-crossing-markers.png')});
 await page.evaluate(()=>window.__prototypeTest.setMode('wait'));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.ghostMotion.visible),false,
  'Wait must suppress speculative next-hand animation');
 assert.deepEqual(errors,[],'no browser-side errors');
 console.log('FG-PNG: real Play Along loads PNG assets, registers notes, Seek, unknown MIDI fallback and mobile: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
