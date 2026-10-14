/**
 * Genuine module Worker + blocked CDN: no mocked Worker or fabricated result.
 * The first Python download fails, and the UI must show an actionable
 * network explanation without mutating source notes or enabling Apply/Export.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 const file=resolve(dist,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(dist+sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.json')?'application/json':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 let blocked=0;
 await context.route('**/pyodide/v314.0.7/full/pyodide.mjs',route=>{
  blocked++;return route.abort('failed');
 });
 const page=await context.newPage();
 const workers=[];
 page.on('worker',w=>workers.push(w.url()));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__prototypeTest);
 const loaded=await page.evaluate(async()=>{
  const bytes=Uint8Array.from([
   77,84,104,100,0,0,0,6,0,0,0,1,1,224,
   77,84,114,107,0,0,0,13,
   0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
  ]);
  const song=await window.__libraryV08.songFromBuffer('network-test.mid',bytes.buffer);
  window.__prototypeTest.loadSong(song);
  window.__launchOfflineSource=song;
  return JSON.stringify(song.tracks.map(t=>t.notes.map(n=>
   [n.noteId,n.pitch,n.start,n.duration,n.finger??null])));
 });
 await page.evaluate(()=>document.getElementById('pianoMotionCalculate').click());
 try{
  await page.waitForFunction(()=>
   (document.getElementById('pianoMotionStatus')?.textContent||'')
    .includes('PYODIDE_RUNTIME_DOWNLOAD_FAILED'),null,{timeout:50000});
 }catch{
  throw Error('OFFLINE_FAILED_TO_RECOVER: '+
   String(await page.locator('#pianoMotionStatus').textContent()).slice(0,320));
 }
 const observed=await page.evaluate(()=>{
  const source=window.__launchOfflineSource;
  return {status:document.getElementById('pianoMotionStatus').textContent,
   calculateEnabled:!document.getElementById('pianoMotionCalculate').disabled,
   cancelHidden:document.getElementById('pianoMotionCancel').hidden,
   applyDisabled:document.getElementById('pianoMotionApply').disabled,
   exportDisabled:document.getElementById('pianoMotionExportXML').disabled,
   source:JSON.stringify(source.tracks.map(t=>t.notes.map(n=>
    [n.noteId,n.pitch,n.start,n.duration,n.finger??null])))};
 });
 assert.equal(blocked,1,'real pinned CDN module request must be intercepted once');
 assert.ok(workers.some(url=>url.includes('pianomotion-engine-worker.js')),
  'original production Worker must run');
 assert.match(observed.status,/подключение к интернету/);
 assert.equal(observed.calculateEnabled,true);
 assert.equal(observed.cancelHidden,true);
 assert.equal(observed.applyDisabled,true);
 assert.equal(observed.exportDisabled,true);
 assert.equal(observed.source,loaded);
 console.log('LAUNCH01_PYODIDE_OFFLINE_PASS',JSON.stringify({
  realWorker:true,blockedCDNRequests:blocked,actionableError:true,
  retryEnabled:true,sourceUnmodified:true,noGuessApplied:true}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
