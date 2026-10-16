import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost').pathname;
 const filename=path.resolve(dist,'.'+(url==='/'?'/index.html':url));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':
  filename.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(filename));
});
const events=[
 0,0x90,60,85,0x83,0x60,0x80,60,0,
 0,0x90,64,85,0x83,0x60,0x80,64,0,
 0,0xff,0x2f,0
];
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,events.length,...events
]);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>{
  // Explicit supported simple fallback: real native WebAudio oscillator.
  localStorage.setItem('playalong:smart-practice:v07',JSON.stringify({
   audioSettings:{backend:'simple',bankId:null,
    livePreset:{bankMSB:0,bankLSB:0,program:0,isDrum:false},
    useFilePrograms:true},volume:75
  }));
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong&&
  window.__libraryV08?.songFromBuffer&&window.__fingerGuideTest?.noteRects);
 const app=page.locator('#roll');
 assert.equal(await page.locator('#viewFingerEditor').isVisible(),false,
  'legacy editor must not compete with shared Fingering button');
 assert.equal(await page.locator('#compactLegacyFingerOption').evaluate(el=>el.hidden),true);
 const baseline=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer(
   'note-audition.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  window.__prototypeTest.seek(0);
  return {pos:window.__prototypeTest.pos,
   raw:Array.from(window.__prototypeTest.originalMidiBytes),
   events:JSON.stringify(song.audioEvents),
   stats:JSON.stringify(window.__prototypeTest.stats),
   backend:window.__prototypeTest.state.audioSettings.backend,
   ids:window.__fingerGuideTest.sourceOrder};
 },[...midi]);
 assert.equal(baseline.backend,'simple');
 assert.equal(baseline.ids.length,2);
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===2);
 const boxes=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const rect=await app.boundingBox();
 const click=async id=>{
  const b=boxes.find(box=>box.id===id);
  assert.ok(b,'source note rectangle');
  await page.mouse.click(rect.x+b.x+b.w/2,rect.y+b.y+b.h/2);
 };
 await click(baseline.ids[0]);
 const first=await page.evaluate(()=>window.__prototypeTest.scheduledVoices);
 assert.ok(first.some(v=>v.pitch===60&&v.start===null),
  'actual click creates the exact C4 oscillator, without transport source');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),false);
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.midiHeld),[]);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[baseline.ids[0]]);
 await click(baseline.ids[1]);
 const second=await page.evaluate(()=>window.__prototypeTest.scheduledVoices);
 assert.ok(second.some(v=>v.pitch===64&&v.start===null),
  'clicking D/E block auditions its OWN pitch, not previous note or whole score');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[baseline.ids[1]]);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),baseline.pos,
  'preview must not seek, start or change song time');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.stats)),baseline.stats);
 await page.waitForTimeout(900);
 const b=boxes.find(x=>x.id===baseline.ids[0]);
 await page.mouse.move(rect.x+b.x+b.w/2,rect.y+b.y+b.h/2);
 await page.mouse.down();
 await page.mouse.move(rect.x+b.x+b.w/2+24,rect.y+b.y+b.h/2+12,{steps:5});
 await page.mouse.up();
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.scheduledVoices),[],
  'drag-to-select must not audition a note');
 assert.deepEqual(await page.evaluate(()=>Array.from(window.__prototypeTest.originalMidiBytes)),
  baseline.raw,'MIDI bytes unchanged');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),
  baseline.events,'musical events unchanged');

 // The user can still open the retained technical tools explicitly.
 await page.locator('#developerToolsToggle').evaluate(el=>el.click());
 assert.equal(await page.locator('#viewFingerEditor').isVisible(),true);
 assert.equal(await page.locator('#compactLegacyFingerOption').evaluate(el=>el.hidden),false);
 await page.locator('#viewFingerEditor').click();
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 await page.locator('#developerToolsToggle').evaluate(el=>el.click());
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 assert.equal(await page.locator('#viewFingerEditor').isVisible(),false);

 // Noncanonical demo notes cannot enter source edits but must still sound.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'audition-demo',type:'demo',title:'Demo',author:'QA',
   tracks:[{name:'Piano',notes:[{
    noteId:'uncanonical-note',pitch:72,start:1,duration:.6,track:0,velocity:90
   }]}]
  });
  window.__prototypeTest.seek(0);
 });
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===1);
 const demo=await page.evaluate(()=>window.__fingerGuideTest.noteRects[0]);
 const demoCanvas=await app.boundingBox();
 await page.mouse.click(demoCanvas.x+demo.x+demo.w/2,
  demoCanvas.y+demo.y+demo.h/2);
 assert.ok((await page.evaluate(()=>window.__prototypeTest.scheduledVoices))
  .some(v=>v.pitch===72),'fallback note-block click auditions demo pitch');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),false);
 assert.deepEqual(errors,[]);
 console.log('P0 UI NOTE AUDITION PASS: exact real audio pitch on source and demo click; selections/drag/scoring/transport untouched; developer legacy view preserved');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
