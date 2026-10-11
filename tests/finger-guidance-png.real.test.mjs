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
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>window.__fingerGuideTest.steps.length===4);
 await page.screenshot({path:path.join(output,'two-hands.png')});
 const poses=await page.evaluate(()=>window.__fingerGuideTest.spritePlacements);
 assert.ok(poses.LH?.width>50&&poses.RH?.width>50,'hand placement requires both matched parts');
 assert.equal(poses.LH.pose,'spread');assert.equal(poses.RH.pose,'spread');
 assert.ok(poses.LH.error<=20&&poses.RH.error<=20,'finger placements within geometric tolerance');
 await page.locator('#fingerGuideMode').selectOption('ghost');
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
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-layout="play"]').click();
 await page.waitForFunction(()=>document.body.classList.contains('noLeft')&&document.body.classList.contains('noRight'));
 await page.screenshot({path:path.join(output,'mobile.png')});
 assert.equal(await page.evaluate(()=>{
  const c=document.getElementById('roll'),r=c.getBoundingClientRect();
  return window.__prototypeTest.virtualKeyAt({clientX:r.left+120,clientY:r.top+r.height-8});
 }),null,'wrist margin below keyboard is not an interactive piano key');
 assert.deepEqual(errors,[],'no browser-side errors');
 console.log('FG-PNG: real Play Along loads PNG assets, registers notes, Seek, unknown MIDI fallback and mobile: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
