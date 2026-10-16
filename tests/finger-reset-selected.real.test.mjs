import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const events=[
 0,0x90,60,90,0x83,0x60,0x80,60,0,
 0,0x90,64,90,0x83,0x60,0x80,64,0,
 0,0x90,67,90,0x83,0x60,0x80,67,0,
 0,0xff,0x2f,0
];
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,events.length,...events
]);
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__fingerGuideTest);
 const baseline=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('three-source.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  window.__prototypeTest.seek(0);
  window.Worker=class{
   postMessage(msg){queueMicrotask(()=>this.onmessage({data:{
    id:msg.id,type:'result',result:{
     engine:'PianoMotion test',total:3,playable:3,unresolved:0,
     suggestions:[60,64,67].map((pitch,i)=>({
      hand:'RH',pitch,start:i*.5,finger:[4,3,5][i],disposition:'played'
     }))
    }}}))}
   terminate(){}
  };
  return {
   ids:window.__fingerGuideTest.sourceOrder,
   events:JSON.stringify(song.audioEvents),
   notes:JSON.stringify(song.tracks.flatMap(t=>t.notes).map(n=>[
    n.noteId,n.pitch,n.start,n.duration
   ])),
   keys:window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w]),
   raw:Array.from(window.__prototypeTest.originalMidiBytes),
   pos:window.__prototypeTest.pos
  };
 },[...midi]);
 assert.equal(baseline.ids.length,3);
 await page.evaluate(()=>document.getElementById('pianoMotionCalculate').click());
 await page.waitForFunction(()=>!document.querySelector('#pianoMotionApply').disabled,
  null,{timeout:15000});
 await page.evaluate(()=>document.getElementById('pianoMotionApply').click());
 const read=()=>page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  id:n.noteId,finger:n.finger??null,hand:n.hand??null,source:n.fingeringSource??null
 })));
 assert.deepEqual((await read()).map(n=>n.finger),[4,3,5]);
 await page.locator('#sceneFingerMode').click();
 const rectangles=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 assert.equal(rectangles.length,3);
 const canvas=await page.locator('#roll').boundingBox();
 const click=async(i,modifier=false)=>{
  const b=rectangles.find(r=>r.id===baseline.ids[i]);
  assert.ok(b,'visible source note '+i);
  await page.mouse.click(canvas.x+b.x+b.w/2,canvas.y+b.y+b.h/2,{
   modifiers:modifier?['Control']:[]
  });
 };
 await click(0);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[baseline.ids[0]]);
 // Manual edit coexists with accepted Python on the SAME source note.
 await page.locator('[data-scene-finger="2"]').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[baseline.ids[0]].finger,2);
 await click(1,true);
 assert.deepEqual(new Set(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds)),
  new Set(baseline.ids.slice(0,2)));
 assert.equal(await page.locator('#sceneFingerClear').isEnabled(),true);
 await page.locator('#sceneFingerClear').click();
 assert.deepEqual((await read()).map(n=>n.finger),[null,null,5],
  'selected accepted Python cleared; unrelated Python finger must stay');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'selected manual digit removed in the same reset gesture');
 assert.equal(await page.locator('#sceneFingerExport').isEnabled(),true,
  'remaining accepted PianoMotion digit keeps existing export available');
 assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true);
 await page.locator('#sceneFingerUndo').click();
 assert.deepEqual((await read()).map(n=>n.finger),[4,3,5]);
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[baseline.ids[0]].finger,2,
  'one Undo restores manual override and Python together');
 await page.locator('#sceneFingerRedo').click();
 assert.deepEqual((await read()).map(n=>n.finger),[null,null,5]);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.deepEqual(await page.evaluate(()=>Array.from(window.__prototypeTest.originalMidiBytes)),baseline.raw);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),baseline.events);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.flatMap(
  t=>t.notes).map(n=>[n.noteId,n.pitch,n.start,n.duration]))),baseline.notes);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),baseline.pos);
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w])),baseline.keys);
 assert.deepEqual(errors,[]);
 console.log('FG-05 SELECTED RESET: one click clears selected manual/Python, keeps rest + export, atomic Undo/Redo, source/88 keys/transport intact PASS');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
