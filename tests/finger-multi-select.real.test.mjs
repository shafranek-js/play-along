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
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const notes=['C','D','E','F','G'].map((pitch,i)=>'<note><pitch><step>'+pitch+'</step><octave>4</octave></pitch>'+
 '<duration>480</duration>'+
 ([0,2].includes(i)?'<notations><technical><fingering>'+(i===0?1:3)+'</fingering></technical></notations>':'')+
 '</note>').join('');
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+notes+
 '</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'multi-select.xml');
  window.__prototypeTest.loadSong(song);window.__prototypeTest.seek(0);
 },xml);
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length>=5);
 const ids=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 assert.equal(ids.length,5);
 const rect=await page.locator('#roll').boundingBox();
 const getBoxes=()=>page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const selected=()=>page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds);
 const corrections=()=>page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 const history=()=>page.evaluate(()=>window.__fingerGuideTest.history);
 const click=async(i,modifiers=[])=>{
  const box=(await getBoxes()).find(b=>b.id===ids[i]);
  assert.ok(box,'Note '+i+' must be visible');
  for(const key of modifiers)await page.keyboard.down(key);
  await page.mouse.click(rect.x+box.x+box.w/2,rect.y+box.y+box.h/2);
  for(const key of modifiers.reverse())await page.keyboard.up(key);
 };
 await click(0);
 assert.deepEqual(await selected(),[ids[0]],'Ordinary click selects one note');
 await click(2,['Control']);
 assert.deepEqual(new Set(await selected()),new Set([ids[0],ids[2]]));
 await click(2,['Control']);
 assert.deepEqual(await selected(),[ids[0]],'Ctrl-click same note toggles off');
 await click(4,['Shift']);
 assert.deepEqual(new Set(await selected()),new Set(ids),'Shift extends by score order');
 await click(0);
 assert.equal((await selected()).length,1);
 // Ctrl+A is scoped to the focused Piano Roll, not a global text select.
 await page.locator('#roll').focus();
 await page.keyboard.press('Control+a');
 assert.deepEqual(new Set(await selected()),new Set(ids));
 assert.equal(await page.locator('.fingerCorrectionGroup').count(),1);
 await page.locator('.fingerCorrectionGroup select').first().focus();
 await page.keyboard.press('Control+a');
 assert.equal((await selected()).length,5,'Text/input focused shortcuts must not touch selection');
 // A drag rectangle selects precisely overlapping visible note blocks.
 const first=(await getBoxes()).find(b=>b.id===ids[0]);
 const second=(await getBoxes()).find(b=>b.id===ids[1]);
 await page.mouse.move(rect.x+first.x-3,rect.y+Math.min(first.y,second.y)-3);
 await page.mouse.down();
 // End inside note 2, never past its edge: proportional docked keys may leave
 // less than 3 CSS pixels before the adjacent third note.
 await page.mouse.move(rect.x+second.x+second.w/2,rect.y+Math.max(first.y+first.h,second.y+second.h)+3,{steps:9});
 await page.mouse.up();
 assert.deepEqual(new Set(await selected()),new Set([ids[0],ids[1]]),'Drag marquee selects first two');
 await page.locator('#roll').focus();
 await page.keyboard.press('Control+a');
 await page.locator('.fingerCorrectionGroup select').nth(1).selectOption('LH');
 await page.getByRole('button',{name:'Применить ко всем'}).click();
 const map=await corrections();
 assert.equal(Object.keys(map).length,5);
 assert.deepEqual(ids.map(id=>map[id].hand),['LH','LH','LH','LH','LH']);
 assert.equal(map[ids[0]].finger,1,'Known author finger remains 1');
 assert.equal(map[ids[2]].finger,3,'Known author finger remains 3');
 assert.equal(map[ids[1]].finger,null,'Hand-only change does not invent finger');
 assert.equal((await history()).past,1,'One batch operation is a single undo step');
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks[0].notes.map(n=>n.finger??null)),
  [1,null,3,null,null],'Author source data remains intact');
 await page.getByRole('button',{name:'Отменить правку'}).click();
 assert.equal(Object.keys(await corrections()).length,0,'Undo reverts entire batch');
 await page.getByRole('button',{name:'Повторить правку'}).click();
 assert.equal(Object.keys(await corrections()).length,5);
 await page.locator('.fingerCorrectionGroup select').first().selectOption('4');
 await page.getByRole('button',{name:'Применить ко всем'}).click();
 const updated=await corrections();
 assert.deepEqual(ids.map(id=>updated[id].finger),Array(5).fill(4),
  'Explicit finger assignment updates all selected notes');
 assert.equal((await history()).past,2);
 await page.getByRole('button',{name:'Отменить правку'}).click();
 const restored=await corrections();
 assert.equal(restored[ids[0]].finger,1);
 assert.equal(restored[ids[1]].finger,null);
 await page.getByRole('button',{name:'Вернуть автора для выбранных'}).click();
 assert.equal(Object.keys(await corrections()).length,0);
 await page.getByRole('button',{name:'Отменить правку'}).click();
 assert.equal(Object.keys(await corrections()).length,5,'Group reset also one undoable operation');
 assert.deepEqual(errors,[],'No unexpected browser errors');
 console.log('FG MULTI SELECT: ctrl/shift/canvas drag/all, bulk hand/finger, atomic undo-redo, source protection: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
