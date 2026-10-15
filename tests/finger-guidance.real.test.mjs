import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const releaseVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const file=path.resolve(dist,'.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript'};
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__fingerGuideTest);
 assert.ok((await page.title()).includes('v'+releaseVersion),
  'Browser tab should show the release declared in package.json');
 assert.equal(await page.locator('#topbar .brand span').textContent(),'Standalone · v'+releaseVersion,
  'User-visible release header must match package.json');
 assert.equal(await page.evaluate(()=>window.__playAlongVersion),releaseVersion,
  'Runtime bundle, published HTML and package version must match');
 const demoRows=await page.evaluate(()=>[...document.querySelectorAll('#songList .libv8-main')].map(r=>r.textContent));
 assert.ok(demoRows.some(t=>t.includes('две руки · C–F–G–C')),
  'Two-hand demo must be accessible from the song list: '+JSON.stringify(demoRows));

 // Existing app boots with no change in keyboard behavior.
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.mode),'off');
 const scale=await page.evaluate(()=>window.__fingerGuideTest.steps);
 assert.equal(scale.length,15);
 assert.deepEqual(scale.slice(0,5).map(g=>g.notes[0].finger),[1,2,3,1,2]);
 assert.equal(scale[3].notes[0].pitch,65);
 await page.locator('#fingerGuideMode').selectOption('ghost');
 assert.equal(await page.locator('#fingerGuideLookahead').isEnabled(),true);
 await page.locator('#fingerGuideLookahead').selectOption('900');
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.lookaheadMs),900);
 await page.waitForFunction(()=>document.querySelector('#fingerGuideStatus').textContent.includes('Демо-аппликатура'));
 const high=await page.evaluate(()=>window.__fingerGuideTest.layout);
 const expectedBlackH=await page.evaluate(()=>window.__prototypeTest.pianoGeometry.whites[0].w*5.5*.61);
 assert.ok(Math.abs(high.keyboardBlackH-expectedBlackH)<.5,
  'Black-key height follows proportional center width, including pinned panels');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.frame),{current:0,next:.46});
 await page.evaluate(()=>window.__prototypeTest.seek(.46));
 assert.ok(await page.evaluate(()=>{const f=window.__fingerGuideTest.frame;return Math.abs(f.current-.92)<1e-6&&Math.abs(f.next-1.38)<1e-6;}));
 await page.evaluate(()=>window.__prototypeTest.seek(.92));
 const third=await page.evaluate(()=>window.__fingerGuideTest.frame);
 assert.ok(Math.abs(third.current-1.38)<1e-6&&Math.abs(third.next-1.84)<1e-6);
 // The full 88-key keyboard must NEVER change key proportions when the
 // hands are toggled; only the guidance overlay is enabled/disabled.
 await page.locator('#fingerGuideMode').selectOption('off');
 assert.equal(await page.locator('#fingerGuideLookahead').isDisabled(),true);
 await page.waitForTimeout(50);
 const low=await page.evaluate(()=>window.__fingerGuideTest.layout);
 assert.ok(Math.abs(low.keyboardBlackH-high.keyboardBlackH)<.01,
  'virtual key geometry stays invariant when PNG guidance is toggled');
 // Return to a demo and confirm per-song guidance settings persist across reload.
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForTimeout(80);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__fingerGuideTest&&window.__prototypeTest);
 assert.equal(await page.locator('#fingerGuideMode').inputValue(),'hands');
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.mode),'hands');
 assert.equal(await page.locator('#fingerGuideLookahead').inputValue(),'900',
  'Lookahead setting must persist across reload without forcing Ghost mode');

 // A real two-track piece: each chord receives distinct LH/RH fingering.
 await page.evaluate(()=>{
  const demo=window.__fingerGuideTest.demoDuet;
  if(!demo)throw Error('Missing FG-00 duet demo');
  window.__prototypeTest.loadSong(demo);
 });
 await page.waitForFunction(()=>window.__prototypeTest.song?.id==='demo-finger-duet');
 const duet=await page.evaluate(()=>window.__fingerGuideTest.steps);
 assert.equal(duet.length,4);
 assert.deepEqual(duet[0].notes.filter(n=>n.hand==='RH').map(n=>n.finger),[1,3,5]);
 assert.deepEqual(duet[0].notes.filter(n=>n.hand==='LH').map(n=>n.finger),[5,3,1]);
 await page.locator('#fingerGuideMode').selectOption('ghost');
 await page.evaluate(()=>window.__prototypeTest.seek(1.8));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.current),3.6);
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.next),5.4);

 // Ordinary unannotated MIDI must not inherit the previous demo's fingers.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({id:'import-no-fingering',title:'Unannotated imported MIDI',
   author:'Test',type:'import',tracks:[{name:'Piano',notes:[
    {pitch:60,start:0,duration:1,velocity:80,track:0,channel:0}]}]});
 });
 await page.waitForFunction(()=>document.querySelector('#fingerGuideStatus').textContent.includes('нет подтверждённой аппликатуры'));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.steps.length),0);
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.current),null);

 // Non-original arrangement must not display a possibly incorrect manual preset.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet);
  window.__prototypeTest.setAdaptMode('transpose',12);
 });
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.steps.length),0);
 await page.waitForFunction(()=>document.querySelector('#fingerGuideStatus').textContent.includes('Адаптация'));
 assert.deepEqual(errors,[],'FG-00 must not generate JavaScript exceptions');
 console.log('FG-00 in real Play Along: demo presets, 2 hands, Seek, persistence, disabled unknown MIDI and adaptation: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
