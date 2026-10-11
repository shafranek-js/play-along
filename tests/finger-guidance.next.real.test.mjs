import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const f=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return}
 const types={'.js':'application/javascript','.css':'text/css','.png':'image/png','.html':'text/html'};
 res.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__fingerGuideTest&&window.__prototypeTest);
 await page.locator('#fingerGuideMode').selectOption('hands');

 // Anticipatory guidance in Listen: keep the first note at song start,
 // but never display a still-sounding note after its onset has passed.
 const frame=()=>page.evaluate(()=>window.__fingerGuideTest.frame);
 assert.deepEqual(await frame(),{current:0,next:.46});
 await page.evaluate(()=>window.__prototypeTest.seek(.1));
 assert.deepEqual(await frame(),{current:.46,next:.92});
 await page.evaluate(()=>window.__prototypeTest.seek(.46));
 assert.ok(await page.evaluate(()=>{const f=window.__fingerGuideTest.frame;return Math.abs(f.current-.92)<1e-6&&Math.abs(f.next-1.38)<1e-6;}));
 await page.evaluate(()=>window.__prototypeTest.seek(.92));
 const later=await frame();
 assert.ok(Math.abs(later.current-1.38)<1e-5&&Math.abs(later.next-1.84)<1e-5);

 // Wait: the clock freezes on the current task. Do not advance until the
 // expected MIDI chord notes have all been played, even with keys held.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet);
  window.__prototypeTest.setMode('wait');
  window.__prototypeTest.play();
 });
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying);
 assert.equal((await frame()).current,0);
 const before=await page.evaluate(()=>window.__fingerGuideTest.steps[0].notes.length);
 assert.equal(before,6,'Both hands remain represented at the shared chord onset');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 const first=await page.evaluate(()=>{
  const at=window.__fingerGuideTest.frame.current;
  const steps=window.__fingerGuideTest.steps;
  return {at,played:window.__prototypeTest.stats?.hits,group:steps[0].notes.length,
    currentNotes:window.__fingerGuideTest.preview};
 });
 assert.equal(first.at,0,'Partial chord must keep the current target');
 assert.equal(first.played,1);
 assert.ok(!first.currentNotes.some(n=>n.pitch===60),'A pressed key is removed from guidance');
 assert.ok(first.currentNotes.some(n=>n.pitch===64)&&first.currentNotes.some(n=>n.pitch===67),'Other chord keys remain');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.equal((await frame()).current,0,'Second chord note not enough to advance');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(67));
 assert.equal((await frame()).current,1.8,'Next future chord is shown immediately after final correct NoteOn');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.waitRelease?.start),0,
   'Wait release lock holds the old sounding chord while guidance has advanced');
 await page.evaluate(()=>{
  for(const p of [60,64,67])window.__prototypeTest.receiveNoteOff(p);
  window.__prototypeTest.pause();
 });

 // Loop: after last onset in selected interval, prepare first next-cycle note.
 await page.evaluate(()=>window.__prototypeTest.setMode('listen'));
 await page.evaluate(()=>window.__prototypeTest.seek(1.8));
 await page.locator('#loopStartBtn').click();
 await page.evaluate(()=>window.__prototypeTest.seek(5));
 await page.locator('#loopEndBtn').click();
 await page.locator('#loopBtn').click();
 assert.equal(await page.evaluate(()=>window.__prototypeTest.loop.enabled),true);
 await page.evaluate(()=>window.__prototypeTest.seek(3.6));
 assert.equal((await frame()).current,1.8,'Next loop iteration should be previewed');
 await page.locator('#loopBtn').click();

 // Near the end of a one-pass piece, don't show the previously sounding note.
 await page.evaluate(()=>window.__prototypeTest.seek(5.4));
 assert.equal((await frame()).current,null);
 assert.deepEqual(errors,[]);
 console.log('FG NEXT: Listen next-onset, Wait incomplete chord/held keys, loop wrap, end of score: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
