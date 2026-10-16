import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,
 0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
]);
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__prototypeTest);
 const initial=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('reset-applied.mid',new Uint8Array(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  const native=window.Worker;
  window.Worker=class{
   postMessage(msg){queueMicrotask(()=>this.onmessage({data:{
    id:msg.id,type:'result',result:{
     engine:'PianoMotion test',total:1,playable:1,unresolved:0,
     suggestions:[{hand:'RH',pitch:60,start:0,finger:4,disposition:'played'}]
    }}}))}
   terminate(){}
  };
  window.__resetWorkerNative=native;
  return {events:JSON.stringify(song.audioEvents),
   source:Array.from(window.__prototypeTest.originalMidiBytes??[])};
 },Array.from(midi));
 assert.deepEqual(initial.source,Array.from(midi),'MIDI source bytes unchanged on load');
 await page.locator('#pianoMotionCalculate').click();
 await page.waitForFunction(()=>!document.querySelector('#pianoMotionApply').disabled,
  null,{timeout:15000});
 await page.locator('#pianoMotionApply').click();
 const getNote=()=>page.evaluate(()=>{
  const note=window.__prototypeTest.song.tracks[0].notes[0];
  return {finger:note.finger??null,hand:note.hand??null,source:note.fingeringSource??null};
 });
 assert.deepEqual(await getNote(),{finger:4,hand:'RH',source:'pianomotion'});
 await page.locator('#sceneFingerMode').click();
 await page.locator('#sceneFingerReset').click();
 assert.match(await page.locator('#fingerResetCount').innerText(),/Применённых PianoMotion: 1/);
 assert.equal(await page.locator('#fingerResetConfirm').isEnabled(),true,
  'Python-only reset must not be disabled merely because manual layer is empty');
 await page.locator('#fingerResetConfirm').click();
 assert.deepEqual(await getNote(),{finger:null,hand:'RH',source:null},
  'reset removes applied Python finger and source but retains hand');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0,
  'old calculated preview must be invalidated');
 assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true,
  'one-step Undo remains enabled even for Python-only reset');
 await page.locator('#sceneFingerUndo').click();
 assert.deepEqual(await getNote(),{finger:4,hand:'RH',source:'pianomotion'},
  'one Undo recovers the applied Python finger');
 await page.locator('#sceneFingerRedo').click();
 assert.deepEqual(await getNote(),{finger:null,hand:'RH',source:null},
  'one Redo clears the note again');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),
  initial.events,'raw source musical events cannot change due to reset');
 assert.deepEqual(await page.evaluate(()=>Array.from(window.__prototypeTest.originalMidiBytes??[])),
  Array.from(midi),'reset must not modify original MIDI bytes');
 assert.deepEqual(errors,[]);
 console.log('FG-05 applied PianoMotion reset: no lingering digits, reversible Undo/Redo, original MIDI invariant PASS');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
