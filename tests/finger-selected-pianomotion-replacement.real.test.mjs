import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const filename=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':
  filename.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(filename));
});
const notes=[
 0,0x90,60,85,0x83,0x60,0x80,60,0,
 0,0x90,64,85,0x83,0x60,0x80,64,0,
 0,0x90,67,85,0x83,0x60,0x80,67,0,
 0,0xff,0x2f,0
];
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,notes.length,...notes
]);
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__fingerGuideTest);
 const baseline=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('replace-saved.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);window.__prototypeTest.seek(0);
  window.Worker=class{
   postMessage(payload){
    queueMicrotask(()=>this.onmessage({data:{id:payload.id,type:'result',result:{
     engine:'PianoMotion source-alignment simulation for UI',total:3,playable:3,unresolved:0,
     suggestions:[60,64,67].map((pitch,i)=>({
      hand:'RH',pitch,start:i*.5,finger:i+1,disposition:'played'
     }))
    }}}));
   }
   terminate(){}
  };
  return {original:Array.from(window.__prototypeTest.originalMidiBytes),
   events:JSON.stringify(song.audioEvents),
   source:JSON.stringify(song.tracks.flatMap(t=>t.notes).map(n=>[
    n.noteId,n.pitch,n.start,n.duration
   ]))};
 },[...midi]);
 // First accept the authentic source-aligned Python batch. Recalculation
 // must preserve these already-applied digits on the two untouched notes.
 await page.evaluate(()=>document.getElementById('pianoMotionCalculate').click());
 await page.waitForFunction(()=>!document.getElementById('pianoMotionApply').disabled,
  null,{timeout:15000});
 await page.evaluate(()=>document.getElementById('pianoMotionApply').click());
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(
  t=>t.notes).map(n=>n.finger)),[1,2,3]);
 await page.locator('#sceneFingerMode').click();
 await page.locator('#sceneFingerManualButton').click();
 const [id]=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 const rectangles=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const target=rectangles.find(x=>x.id===id);assert.ok(target);
 const canvas=await page.locator('#roll').boundingBox();
 await page.mouse.click(canvas.x+target.x+target.w/2,canvas.y+target.y+target.h/2);
 await page.locator('[data-scene-hand="RH"]').click();
 await page.locator('[data-scene-finger="5"]').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[id].finger,5);
 assert.equal(await page.locator('[data-scene-finger="5"]').getAttribute('aria-pressed'),'true');
 await page.locator('#sceneFingerPianoMotionButton').click();
 await page.waitForFunction(()=>document.getElementById('pianoMotionStatus').textContent
  .includes('Оригинальный PianoMotion Python'),null,{timeout:15000});
 const candidates=await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates);
 assert.equal(candidates.count,1,'replacement preview is restricted to selected saved finger');
 assert.equal(candidates.notes[0].id,id);
 assert.equal(candidates.notes[0].finger,1);
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[id].finger,5,
  'no automatic overwrite before consent');
 await page.locator('#sceneFingerReview').click();
 await page.locator('#sceneFingerReviewAll').click();
 assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true);
 await page.locator('#sceneFingerReviewConfirm').check();
 await page.locator('#sceneFingerReviewApply').click();
 const replacement=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(replacement[id].finger,1);
 assert.equal(Object.keys(replacement).length,1);
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(
  t=>t.notes).map(n=>n.finger)),[1,2,3],
  'accepted Python fingers, including other notes, remain intact');
 assert.equal(await page.locator('#sceneFingerExport').isEnabled(),true,
  'revalidated Python export remains available after selected replacement');
 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:12000}),page.locator('#sceneFingerExport').click()
 ]);
 const exported=fs.readFileSync(await download.path(),'utf8');
 assert.equal((exported.match(/<fingering>/g)||[]).length,3,
  'export must include both untouched Python fingers plus selected user replacement');
 await page.locator('#sceneFingerUndo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[id].finger,5);
 await page.locator('#sceneFingerRedo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[id].finger,1);
 await page.locator('#sceneFingerManualButton').click();
 assert.equal(await page.locator('[data-scene-finger="1"]').getAttribute('aria-pressed'),'true',
  'toolbar now tracks chosen replacement');
 assert.deepEqual(await page.evaluate(()=>Array.from(window.__prototypeTest.originalMidiBytes)),baseline.original);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),baseline.events);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.flatMap(
  t=>t.notes).map(n=>[n.noteId,n.pitch,n.start,n.duration]))),baseline.source);
 assert.deepEqual(errors,[]);
 console.log('FG05_PIANOMOTION_REPLACE_PASS: source-aligned audited proposal, selected saved replacement, required consent, Undo/Redo, toolbar+MIDI invariant');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
