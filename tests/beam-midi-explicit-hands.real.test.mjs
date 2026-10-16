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
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,22,
 0,0x90,60,80,0x83,0x60,0x80,60,0,
 0,0x90,64,80,0x83,0x60,0x80,64,0,
 0,0xff,0x2f,0,
]);
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 await page.evaluate(async b=>{
  const song=await window.__libraryV08.songFromBuffer('real-midi-no-hands.mid',Uint8Array.from(b).buffer);
  window.__prototypeTest.loadSong(song);
  window.__prototypeTest.seek(0);
 },[...midi]);
 const source=await page.evaluate(()=>JSON.stringify(
  window.__prototypeTest.song.tracks.map(t=>t.notes.map(n=>[
   n.noteId,n.pitch,n.start,n.duration,n.finger??null,n.hand??null
  ]))));
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerBeamButton').isEnabled(),true,
  'Beam button can be clicked on source-verified original MIDI');
 assert.equal(await page.locator('#sceneFingerMethod').isVisible(),false,
  'ordinary user is not forced to pick an algorithm mode');
 await page.locator('#sceneFingerBeamButton').click();
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),
  /MIDI не определяет левую и правую руку/,
  'source MIDI without hand labels must fail closed, not guess');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0);
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 await page.locator('#sceneFingerManualButton').click();
 const ordered=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 assert.equal(ordered.length,2);
 const mark=async(id,hand)=>{
  const rect=await page.evaluate(id=>window.__fingerGuideTest.noteRects.find(x=>x.id===id),id);
  assert.ok(rect,'MIDI note must remain selectable');
  const bounds=await page.locator('#roll').boundingBox();
  await page.mouse.click(bounds.x+rect.x+rect.w/2,bounds.y+rect.y+rect.h/2);
  assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[id]);
  await page.locator('[data-scene-hand="'+hand+'"]').click();
 };
 await mark(ordered[0],'RH');await mark(ordered[1],'LH');
 const beforeBeam=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(beforeBeam[ordered[0]].hand,'RH');
 assert.equal(beforeBeam[ordered[1]].hand,'LH');
 assert.equal(beforeBeam[ordered[0]].finger,null);
 assert.equal(beforeBeam[ordered[1]].finger,null);
 await page.locator('#sceneFingerBeamButton').click();
 await page.waitForFunction(()=>document.getElementById('fingerBrowserStatus')?.textContent?.includes('Вычислено локально'),null,{timeout:18000});
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,2,
  'worker must project original MIDI note IDs, not guessed/foreign source IDs');
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(x=>x.open),false,
  'ordinary user remains on 88-key stage, research diagnostics stay folded');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),beforeBeam,
  'calculating candidates never writes stored fingers');
 await page.locator('#sceneFingerReview').click();
 await page.locator('#sceneFingerReviewAll').click();
 await page.locator('#sceneFingerReviewConfirm').check();
 await page.locator('#sceneFingerReviewApply').click();
 const after=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.ok(ordered.every(id=>Number.isInteger(after[id].finger)&&after[id].finger>=1&&after[id].finger<=5));
 assert.equal(after[ordered[0]].hand,'RH');
 assert.equal(after[ordered[1]].hand,'LH');
 assert.equal(await page.locator('#sceneFingerExport').isEnabled(),true,
  'committed Beam MIDI corrections can be exported on same stage');
 assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true);
 await page.locator('#sceneFingerUndo').click();
 const undone=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.deepEqual(undone,beforeBeam,'one Undo restores original hand-only assignments');
 await page.locator('#sceneFingerRedo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),after);
 const exported=await page.evaluate(async()=>{
  const old=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
  let blob=null;try{
   URL.createObjectURL=b=>{blob=b;return 'blob:beam-midi-tested'};
   HTMLAnchorElement.prototype.click=function(){};
   document.getElementById('sceneFingerExport').click();
   const xml=blob?await blob.text():null;
   const loaded=xml?window.__libraryV08.readMusicXML(xml,'beam-midi.musicxml'):null;
   return {ok:!!xml,marker:xml?.includes('name="play-along-user-fingering"'),
    notes:loaded?.tracks.flatMap(t=>t.notes).map(n=>({
     pitch:n.pitch,finger:n.finger,source:n.fingeringSource
    }))};
  }finally{URL.createObjectURL=old;HTMLAnchorElement.prototype.click=click}
 });
 assert.equal(exported.ok,true,JSON.stringify(exported));
 assert.equal(exported.marker,true);
 assert.equal(exported.notes.length,2);
 assert.ok(exported.notes.every(n=>Number.isInteger(n.finger)&&
  n.source==='musicxml-user-export-unverified'));
 assert.equal(await page.evaluate(()=>JSON.stringify(
  window.__prototypeTest.song.tracks.map(t=>t.notes.map(n=>[
   n.noteId,n.pitch,n.start,n.duration,n.finger??null,n.hand??null
  ])))),source,'source MIDI notes and authentic bytes never mutated');
 assert.deepEqual(errors,[],'no browser JS runtime errors');
 console.log('MIDI Beam: unknown hands abstain -> user RH/LH -> real Beam -> in-place Apply, Undo/Redo and XML source-safe export PASS');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
