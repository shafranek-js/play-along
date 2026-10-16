import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const n=(pitch,finger)=>
 '<note><pitch><step>'+pitch+'</step><octave>4</octave></pitch>'+
 '<duration>480</duration><type>quarter</type><voice>1</voice><staff>1</staff>'+
 (finger?'<notations><technical><fingering>'+finger+'</fingering></technical></notations>':'')+
 '</note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1">'+
 '<part-name>Piano</part-name></score-part></part-list><part id="P1">'+
 '<measure number="1"><attributes><divisions>480</divisions><staves>2</staves></attributes>'+
 n('C',1)+n('D',null)+n('E',3)+'</measure></part></score-partwise>';

await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&window.__prototypeTest&&window.__fingerGuideTest);
 await page.evaluate(source=>{
  window.__prototypeTest.loadSong(window.__libraryV08.readMusicXML(source,'scene-fingering.musicxml'));
  window.__prototypeTest.seek(0);
 },xml);
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===3);
 const ids=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 const source=await page.evaluate(()=>window.__prototypeTest.song.notationXML);
 assert.equal(ids.length,3);
 assert.equal(await page.locator('#sceneFingerMode').isEnabled(),true);
 const rollCanvasBefore=await page.locator('#roll').evaluate(el=>{
  el.dataset.keepSceneIdentity='same-persistent-canvas';return el.dataset.keepSceneIdentity;
 });
 const startingPos=await page.evaluate(()=>window.__prototypeTest.pos);
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMode').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerTools').isVisible(),true);
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),false);
 assert.equal(await page.locator('#roll').evaluate(el=>el.dataset.keepSceneIdentity),rollCanvasBefore);
 await page.locator('#roll').focus();
 const boxes=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const box=boxes.find(b=>b.id===ids[0]);
 assert.ok(box);
 const canvas=await page.locator('#roll').boundingBox();
 await page.mouse.click(canvas.x+box.x+box.w/2,canvas.y+box.y+box.h/2);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[ids[0]]);
 await page.locator('#sceneFingerAutoAdvance').check();
 await page.locator('#roll').focus();
 await page.keyboard.press('2');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[0]].finger,2);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[ids[1]]);
 const history1=await page.evaluate(()=>window.__fingerGuideTest.history);
 assert.equal(history1.past,1);
 // Reassign finger from the on-scene toolbar. Finger button focus should be
 // compatible with the same underlying selection/history as keyboard input.
 await page.locator('[data-scene-finger="4"]').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[1]].finger,4);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[ids[2]]);
 await page.locator('#roll').focus();
 await page.keyboard.press('3'); // Already-authored third note, no extra Undo.
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.history)).past,2);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[ids[2]]);
 await page.keyboard.press('l');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[2]].hand,'LH');
 const historyAfterHand=await page.evaluate(()=>window.__fingerGuideTest.history);
 assert.equal(historyAfterHand.past,3);
 await page.keyboard.press('Control+z');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[2]],undefined);
 await page.keyboard.press('Control+y');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[2]].hand,'LH');
 await page.locator('#sceneFingerAutoAdvance').uncheck();
 await page.locator('#roll').focus();
 await page.keyboard.press('Control+a');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds)).length,3);
 await page.keyboard.press('5');
 const afterBatch=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.ok(ids.every(id=>afterBatch[id].finger===5));
 const historyAfterBatch=await page.evaluate(()=>window.__fingerGuideTest.history);
 assert.equal(historyAfterBatch.past,4,'batch assignment is exactly one Undo');
 await page.keyboard.press('Control+z');
 const afterUndo=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(afterUndo[ids[0]].finger,2);
 assert.equal(afterUndo[ids[1]].finger,4);
 assert.equal(afterUndo[ids[2]].hand,'LH');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),source);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),startingPos,
  'Fingering steps and mode switch cannot seek the transport');

 // Independent viewport pans only the NOTE region. 88 physical keys and
 // the real playback cursor remain unchanged during all editor interactions.
 const sceneRead=()=>page.evaluate(()=>window.__fingerGuideTest.sceneViewport);
 const keysBefore=await page.evaluate(()=>
  window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w]));
 assert.equal((await sceneRead()).follow,false,
  'chronological note navigation detaches the score view without a transport seek');
 await page.locator('#sceneFingerFollow').click();
 assert.equal((await sceneRead()).follow,true);
 assert.equal((await sceneRead()).viewTime,startingPos);
 const keyboardTop=await page.evaluate(()=>window.__prototypeTest.keyboardTop);
 const b=await page.locator('#roll').boundingBox();
 await page.mouse.move(b.x+b.width*.48,b.y+Math.max(55,keyboardTop*.52));
 await page.mouse.wheel(0,400);
 await page.waitForFunction(()=>!window.__fingerGuideTest.sceneViewport.follow);
 const panned=await sceneRead();
 assert.ok(panned.viewTime>startingPos,'wheel changes the note display window');
 assert.equal(panned.transport,startingPos,'wheel must never seek');
 assert.equal(panned.windowSeconds,6);
 await page.keyboard.down('Control');
 await page.mouse.wheel(0,-240);
 await page.keyboard.up('Control');
 await page.waitForFunction(()=>window.__fingerGuideTest.sceneViewport.windowSeconds<6);
 const zoomed=await sceneRead();
 assert.ok(zoomed.windowSeconds>=2&&zoomed.windowSeconds<6);
 assert.equal(zoomed.transport,startingPos,'zoom must never seek');
 assert.deepEqual(await page.evaluate(()=>
  window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w])),
  keysBefore,'time zoom may not distort the 88-key piano');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),source);
 await page.locator('#sceneFingerFollow').click();
 assert.equal((await sceneRead()).viewTime,startingPos);
 assert.equal((await sceneRead()).follow,true);
 assert.equal(await page.locator('#sceneFingerFollow').isDisabled(),true);

 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMode').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#sceneFingerTools').isVisible(),false);
 assert.equal(await page.locator('#roll').evaluate(el=>el.dataset.keepSceneIdentity),rollCanvasBefore);
 // Advanced research/editing remains accessible; no duplicated Python actions.
 await page.locator('#viewFingerEditor').click();
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 assert.equal(await page.locator('#fingerEditorCanvas').isVisible(),true);
 assert.equal(await page.locator('#pianoMotionCalculate').count(),1);
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerTools').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),afterUndo);
 assert.deepEqual(errors,[]);
 console.log('UNIFIED_FINGERING_SCENE_REAL_PASS: one canvas, source anchored edits, step entry, atomic Undo/Redo, transport, advanced preserved');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
