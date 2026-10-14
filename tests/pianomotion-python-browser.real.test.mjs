/**
 * ACTUAL original PianoMotion Python in-browser smoke, no fake/stub Worker.
 * Tests a user-selected real MIDI and Pyodide 314.0.7 from pinned upstream.
 * Requires network on first launch; no source MIDI is sent to a server.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const midi=[77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0];
const server=http.createServer((req,res)=>{
 const uri=new URL(req.url,'http://localhost');
 const file=path.resolve(dist,'.'+(uri.pathname==='/'?'/index.html':uri.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('Not found');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.json')?'application/json':
  file.endsWith('.wasm')?'application/wasm':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest);
 const started=await page.evaluate(async bytes=>{
  const data=Uint8Array.from(bytes);
  const song=await window.__libraryV08.songFromBuffer('verified-smoke.mid',data.buffer);
  window.__prototypeTest.loadSong(song);
  return {format:song.format,hasMidi:window.__prototypeTest.originalMidiBytes?.length};
 },midi);
 assert.equal(started.hasMidi,midi.length,'selected MIDI must retain original bytes');
 await page.locator('#pianoMotionCalculate').click();
 await page.waitForFunction(()=>{
  const s=document.querySelector('#pianoMotionStatus')?.textContent??'';
  return s.includes('PianoMotion Python · проверено соответствие')||
    s.startsWith('PianoMotion:')||s.startsWith('Ошибка')||
    s.includes('не применён:')||s.includes('превышает ограничение');
 },null,{timeout:185000});
 const status=await page.locator('#pianoMotionStatus').innerText();
 assert.match(status,/PianoMotion Python · проверено соответствие 1 исходных нот/,
  'Actual browser engine and source join must work; received: '+status);
 assert.equal(await page.locator('#pianoMotionResults li').count(),1);
 assert.deepEqual(errors,[],'no browser JS exceptions');
 console.log('Real in-browser Pyodide/PianoMotion input, SHA source gate and MIDI preview: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
