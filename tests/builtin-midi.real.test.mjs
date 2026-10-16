import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const f=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',f.endsWith('.html')?'text/html':
  f.endsWith('.js')?'application/javascript':
  f.endsWith('.json')?'application/json':
  f.endsWith('.css')?'text/css':'application/octet-stream');
 res.end(fs.readFileSync(f));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];
 page.on('request',req=>{if(req.url().includes('/builtin-midi/'))requests.push(req.url())});
 await page.goto(url);
 await page.waitForFunction(()=>window.__prototypeTest&&
  document.getElementById('libV8Counts')?.textContent.includes('162 встроенных MIDI'));
 assert.equal(await page.locator('#librarySourceSelect option[value="builtin"]').textContent(),
  'Встроенные MIDI');
 assert.equal(requests.filter(x=>x.endsWith('/collection.zlib')).length,0,
  'MIDI archive must be lazy-loaded only after a user opens a piece');
 await page.locator('#librarySourceSelect').selectOption('builtin');
 await page.locator('#librarySearch').fill('Amazing Grace');
 await page.waitForFunction(()=>document.querySelectorAll('#songList .libv8-row').length===1);
 assert.match(await page.locator('#libraryCount').textContent(),/1 \/ \d+/);
 await page.locator('#songList .libv8-main').click();
 const first=await page.evaluate(()=>({
  title:window.__prototypeTest.song.title,
  format:window.__prototypeTest.song.format,
  notes:window.__prototypeTest.song.tracks.flatMap(t=>t.notes).length,
  sourceId:window.__prototypeTest.song.midiFingerWorkKey,
  source:window.__prototypeTest.song.type
 }));
 assert.equal(first.title,'Amazing Grace');
 assert.equal(first.format,'MIDI');
 assert.ok(first.notes>0);
 assert.match(first.sourceId,/^mid:[0-9]+:[a-f0-9]{16}$/);
 assert.equal(first.source,'builtin');
 assert.equal(requests.filter(x=>x.endsWith('/collection.zlib')).length,1,
  'Only one download of compressed archive on first selection');
 // Reopen another original, with no refetch: there is one and only one
 // independently source-fingerprinted original session MIDI per work.
 await page.locator('#librarySearch').fill('Megalovania');
 await page.waitForFunction(()=>document.querySelectorAll('#songList .libv8-row').length===1);
 await page.locator('#songList .libv8-main').click();
 const second=await page.evaluate(()=>({
  title:window.__prototypeTest.song.title,
  format:window.__prototypeTest.song.format,
  notes:window.__prototypeTest.song.tracks.flatMap(t=>t.notes).length,
  sourceId:window.__prototypeTest.song.midiFingerWorkKey
 }));
 assert.equal(second.title,'Megalovania');
 assert.equal(second.format,'MIDI');
 assert.ok(second.notes>0);
 assert.match(second.sourceId,/^mid:/);
 assert.notEqual(second.sourceId,first.sourceId);
 assert.equal(requests.filter(x=>x.endsWith('/collection.zlib')).length,1);
 assert.deepEqual(errors,[]);
 console.log('FG-05 built-in MIDI: 162 catalogued; lazy 1x pack fetch; two original MIDI parsed and verified PASS');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
