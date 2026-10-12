import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),f=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));
});
const scale=['C','D','E','F','G','A','B'];
const note=i=>'<note><pitch><step>'+scale[i%7]+'</step><octave>4</octave></pitch>'+
 '<duration>480</duration><type>quarter</type>'+
 (i<2?'<notations><technical><fingering>'+(i+1)+'</fingering></technical></notations>':'')+
 '</note>';
const measures=Array.from({length:16},(_,m)=>'<measure number="'+(m+1)+'">'+
 (m===0?'<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
 Array.from({length:4},(_,n)=>note(m*4+n)).join('')+'</measure>').join('');
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Right Hand</part-name></score-part></part-list><part id="P1">'+measures+'</part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.abort('blockedbyclient'));
 await page.route('https://unpkg.com/**',r=>r.abort('blockedbyclient'));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__scoreTest&&window.__fingerGuideTest);
 const original=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'long-finger-work.musicxml');
  window.__prototypeTest.loadSong(song);
  return {notes:song.tracks.flatMap(t=>t.notes).map(n=>({id:n.noteId,finger:n.finger??null})),xml:song.notationXML};
 },xml);
 assert.equal(original.notes.length,64);
 await page.locator('#viewFingerEditor').click();
 await page.waitForFunction(()=>window.__scoreTest.editor.visible&&window.__scoreTest.editor.notes===64);
 const first=await page.evaluate(()=>window.__scoreTest.editor);
 assert.ok(first.totalWidth>page.viewportSize().width/2,'Timeline must extend beyond current viewport');
 assert.ok(first.boxes.length<64,'Editor must draw only the visible portion of the music');
 assert.ok(first.boxes.length>1);
 const firstBox=first.firstBox,canvas=await page.locator('#fingerEditorCanvas').boundingBox();
 await page.mouse.click(canvas.x+firstBox.x+Math.min(8,firstBox.w/2),canvas.y+firstBox.y+firstBox.h/2);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds),[firstBox.id]);
 await page.locator('#fingerEditorCanvas').focus();
 await page.keyboard.press('Control+a');
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds.length),64,
  'Editor Ctrl+A must include all 64 notes across unrendered measures');
 assert.match(await page.locator('#fingerEditorCount').innerText(),/64 выбрано из 64/);
 await page.locator('#fingerEditorHand').selectOption('LH');
 await page.locator('#fingerEditorApply').click();
 const saved=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(Object.keys(saved).length,64);
 assert.equal(saved[original.notes[0].id].finger,1);
 assert.equal(saved[original.notes[1].id].finger,2);
 assert.equal(saved[original.notes[63].id].finger,null,'Hand-only group edit must not invent missing finger');
 assert.ok(Object.values(saved).every(v=>v.hand==='LH'));
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.history)).past,1);
 assert.equal((await page.evaluate(()=>window.__prototypeTest.song.notationXML)),original.xml,
  'Original MusicXML text must be bit-for-bit untouched');
 await page.locator('#fingerEditorUndo').click();
 assert.equal(Object.keys(await page.evaluate(()=>window.__fingerGuideTest.userCorrections)).length,0,
  'Undo restores entire 64-note group');
 await page.locator('#fingerEditorRedo').click();
 assert.equal(Object.keys(await page.evaluate(()=>window.__fingerGuideTest.userCorrections)).length,64);
 await page.locator('#fingerEditorFinger').selectOption('4');
 await page.locator('#fingerEditorApply').click();
 assert.ok(Object.values(await page.evaluate(()=>window.__fingerGuideTest.userCorrections))
  .every(v=>v.finger===4&&v.hand==='LH'),'Finger assignment must apply to the full set');
 await page.locator('#fingerEditorUndo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[original.notes[63].id].finger,null);
 await page.locator('#fingerEditorZoom').selectOption('120');
 await page.locator('#fingerEditorScroller').evaluate(el=>{el.scrollLeft=el.scrollWidth-el.clientWidth});
 await page.waitForFunction(()=>window.__scoreTest.editor.scroll>100);
 const last=await page.evaluate(()=>window.__scoreTest.editor);
 assert.ok(last.boxes.some(b=>b.id===original.notes[63].id),
  'The end of the full score must be accessible after horizontal scrolling');
 await page.locator('#viewSheet').click();
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded||document.querySelector('#sheetStatus').textContent.includes('Ошибка'),null,{timeout:30000});
 const overlay=await page.evaluate(()=>window.__scoreTest.overlay);
 assert.deepEqual({status:overlay.status,count:overlay.count,handOnly:overlay.handOnly},
  {status:'applied',count:2,handOnly:62},'Author-labelled notes show corrected hand without inventing fingers');
 assert.equal(await page.locator('#sheetCanvas svg').count()>0,true,'Real OSMD sheet must render');
 assert.match(await page.locator('#sheetFingerStatus').innerText(),/Пользовательские/);
 // Verify generated score XML against all source IDs, and fail closed for
 // unknown/ambiguous target rather than placing a misleading finger.
 const preview=await page.evaluate(()=>{
  const changes=window.__fingerGuideTest.userCorrections;
  const get=(edits)=>window.__scoreTest.previewFingerOverlay(edits);
  return {
   valid:get(changes),
   missing:get({'xml:unknown:0:0:900':{finger:4,hand:'RH'}})
  };
 });
 assert.equal(preview.valid.status,'applied');
 assert.equal(preview.missing.status,'skipped');
 assert.deepEqual(errors,[]);
 console.log('FINGER EDITOR & OSMD SHEET: viewport, full score Ctrl+A, grouped hand/finger, undo/redo, horizontal scroll, original-preserving SVG annotation and fail-closed validation PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
