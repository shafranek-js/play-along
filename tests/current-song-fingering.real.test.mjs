import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const uri=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(uri==='/'?'/index.html':uri));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
});
const note=(step,oct,staff,voice)=>'<note><pitch><step>'+step+'</step><octave>'+oct+
 '</octave></pitch><duration>480</duration><voice>'+voice+
 '</voice><type>quarter</type><staff>'+staff+'</staff></note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions><staves>2</staves>'+
 '<time><beats>2</beats><beat-type>4</beat-type></time></attributes>'+
 note('C',4,1,1)+note('E',4,1,1)+'<backup><duration>960</duration></backup>'+
 note('C',3,2,2)+note('E',3,2,2)+'</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__fingerGuideTest);
 const src=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'current-fingering.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes).map(n=>({id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,finger:n.finger??null}));
 },xml);
 assert.equal(src.length,4);
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerCurrentCalculate').click();
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),/Рука некоторых нот/);
 assert.equal(await page.locator('#fingerBrowserContents').isVisible(),true,'one click reveals status');
 await page.locator('#fingerBrowserAssumeStaves').check();
 await page.locator('#fingerCurrentCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus').textContent.includes('Вычислено локально'),null,{timeout:20000});
 assert.equal(await page.locator('#fingerBrowserReject').isEnabled(),true,'preview exists');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'preview cannot silently write finger numbers');
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isDisabled(),true,'must explicitly confirm and select');
 await page.locator('#fingerEditorAll').click();
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isDisabled(),true,'selection alone does not confirm');
 await page.locator('#fingerBrowserConfirm').check();
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isEnabled(),true);
 await page.locator('#fingerBrowserAcceptSelected').click();
 const saved=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(Object.keys(saved).length,4,'all four suggestions saved only as user corrections');
 assert.ok(Object.values(saved).every(x=>Number.isInteger(x.finger)&&x.finger>=1&&x.finger<=5));
 // Re-running after confirming fingers must not manufacture "new" fingers.
 // It must explain existing anchors, and keep a separate non-applicable
 // comparison path for users who want to compare original models again.
 await page.locator('#fingerCurrentCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus')?.textContent?.includes('Вычислено локально'),null,{timeout:20000});
 assert.match(await page.locator('#fingerBrowserMetrics').innerText(),/Уже сохранено пользователем: 4/);
 assert.match(await page.locator('#fingerBrowserMetrics').innerText(),/Учитывается как закреплённое в расчёте: 4/);
 assert.match(await page.locator('#fingerBrowserMetrics').innerText(),/Анатомическая модель: 0 предложений/);
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isDisabled(),true);
 await page.locator('#fingerBrowserCompareSaved').check();
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),/Режим сравнения изменён/);
 await page.locator('#fingerCurrentCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus')?.textContent?.includes('РЕЖИМ СРАВНЕНИЯ'),null,{timeout:20000});
 const comparison=await page.locator('#fingerBrowserMetrics').innerText();
 assert.match(comparison,/Уже сохранено пользователем: 4/);
 assert.match(comparison,/Учитывается как закреплённое в расчёте: 0/);
 assert.match(comparison,/Обычная модель: 4 предложений/);
 assert.match(comparison,/Анатомическая модель: 4 предложений/);
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isDisabled(),true);
 assert.equal(await page.locator('#fingerBrowserConfirm').isDisabled(),true);
 assert.equal(await page.locator('#fingerBrowserReject').isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),saved,
  'diagnostics must preserve all previously saved fingers byte for byte');
 await page.locator('#fingerBrowserCompareSaved').uncheck();
 assert.equal(await page.locator('#fingerBrowserConfirm').isEnabled(),true);

 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,finger:n.finger??null
 }))),src,'source remains unchanged after user confirms');
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'one undo reverts entire batch');
 await page.locator('#fingerCurrentCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus').textContent.includes('Вычислено локально'),null,{timeout:20000});
 await page.locator('#fingerBrowserReject').click();
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.deepEqual(errors,[]);
 console.log('FG-04C6 existing MusicXML → one-click calculated preview → selected confirmation → atomic Undo → reject: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
