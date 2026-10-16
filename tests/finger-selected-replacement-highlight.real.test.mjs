import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':
  filename.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(filename));
});
const note=(step,octave,staff,voice,finger=null)=>
 '<note><pitch><step>'+step+'</step><octave>'+octave+'</octave></pitch>'+
 '<duration>480</duration><type>quarter</type><staff>'+staff+
 '</staff><voice>'+voice+'</voice>'+
 (finger===null?'':'<notations><technical><fingering>'+finger+
 '</fingering></technical></notations>')+'</note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1">'+
 '<part-name>Piano</part-name></score-part></part-list><part id="P1">'+
 '<measure number="1"><attributes><divisions>480</divisions><staves>2</staves>'+
 '<time><beats>2</beats><beat-type>4</beat-type></time></attributes>'+
 note('C',4,1,1,5)+note('E',4,1,1)+
 '<backup><duration>960</duration></backup>'+
 note('C',3,2,2)+note('E',3,2,2)+'</measure></part></score-partwise>';

await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&window.__fingerGuideTest);
 const original=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'selected-replace.musicxml');
  window.__prototypeTest.loadSong(song);window.__prototypeTest.seek(0);
  return {source:song.notationXML,
   notes:JSON.stringify(song.tracks.flatMap(t=>t.notes).map(n=>[
    n.noteId,n.pitch,n.start,n.duration,n.finger??null,n.hand??null
   ])),
   events:JSON.stringify(song.audioEvents),
   pos:window.__prototypeTest.pos,
   piano:window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w])};
 },xml);
 await page.locator('#sceneFingerMode').click();
 const ids=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 assert.equal(ids.length,4);
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===4);
 const boxes=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const canvas=await page.locator('#roll').boundingBox();
 const tap=async(index,ctrl=false)=>{
  const b=boxes.find(x=>x.id===ids[index]);assert.ok(b);
  if(ctrl)await page.keyboard.down('Control');
  try{await page.mouse.click(canvas.x+b.x+b.w/2,canvas.y+b.y+b.h/2)}
  finally{if(ctrl)await page.keyboard.up('Control')}
 };
 const active=async(kind,value)=>page.locator(
  kind==='hand'?'[data-scene-hand="'+value+'"]':'[data-scene-finger="'+value+'"]'
 ).getAttribute('aria-pressed');
 await tap(0);
 assert.equal(await active('finger',5),'true','author fingering highlighted after selecting source note');
 assert.equal(await active('finger',1),'false');
 assert.equal(await active('hand','RH'),'false','staff guess is not persisted hand');
 await page.locator('[data-scene-hand="RH"]').click();
 assert.equal(await active('hand','RH'),'true');
 assert.equal(await active('finger',5),'true');
 await page.locator('[data-scene-finger="4"]').click();
 assert.equal(await active('finger',4),'true');
 assert.equal(await active('finger',5),'false');
 await page.locator('#sceneFingerUndo').click();
 assert.equal(await active('finger',5),'true');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[ids[0]].hand,'RH');
 await page.locator('#sceneFingerUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.equal(await active('hand','RH'),'false');
 assert.equal(await active('finger',5),'true');
 await tap(1);
 assert.equal(await active('finger',5),'false','new unannotated selection clears highlight');
 await tap(0,true);
 assert.equal(await active('finger',5),'false','mixed selections must not imply one finger');
 // Select only the authored note and request an alternative from REAL Beam.
 await tap(0);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[ids[0]]);
 await page.locator('#sceneFingerBeamButton').click();
 await page.waitForFunction(()=>/Вычислено локально|Отказ|Ошибка/.test(
  document.querySelector('#fingerBrowserStatus')?.textContent||''),null,{timeout:20000});
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),/Вычислено локально/);
 const proposals=await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates);
 assert.equal(proposals.method,'beam');
 assert.equal(proposals.count,1,'replace only the selected authored note, not other piano notes');
 assert.equal(proposals.notes[0].id,ids[0]);
 assert.notEqual(proposals.notes[0].finger,5,'original author finger was released for alternative Beam calculation');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'calculating alternative cannot mutate source or corrections');
 await page.locator('#sceneFingerReview').click();
 assert.match(await page.locator('#sceneFingerReviewCounts').innerText(),/Замена назначенных пальцев/);
 assert.match(await page.locator('#sceneFingerReviewPanel').innerText(),/разрешаю заменить пальцы/);
 assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true);
 await page.locator('#sceneFingerReviewAll').click();
 assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true,
  'explicit review confirmation remains mandatory for author replacement');
 await page.locator('#sceneFingerReviewConfirm').check();
 await page.locator('#sceneFingerReviewApply').click();
 const edits=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(edits[ids[0]].finger,proposals.notes[0].finger);
 assert.equal(edits[ids[0]].hand,'RH');
 assert.equal(Object.keys(edits).length,1,'no other authored or unassigned notes modified');
 assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true);
 await page.locator('#sceneFingerUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 await page.locator('#sceneFingerRedo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),edits);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),original.source);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),original.events);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.flatMap(
  t=>t.notes).map(n=>[n.noteId,n.pitch,n.start,n.duration,n.finger??null,n.hand??null]))),
  original.notes);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),original.pos);
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.pianoGeometry.whites.map(k=>[k.x,k.w])),original.piano);
 assert.deepEqual(errors,[]);
 console.log('FG05_REPLACE_AND_HIGHLIGHT_PASS: original Beam, author replacement only by confirmation, live RH+finger highlight, Undo/Redo, source invariant');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
