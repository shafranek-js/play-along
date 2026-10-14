import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
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
 const failures=[];page.on('pageerror',e=>failures.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__fingerGuideTest);
 assert.equal(await page.locator('#fingerSpanToggle').isVisible(),true,'Calibration is available even without a MusicXML file');
 const before=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'browser-finger.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes).map(n=>({
   id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   finger:n.finger??null,hand:n.hand??null
  }));
 },xml);
 assert.equal(before.length,4);
 assert.ok(before.every(n=>n.hand===null&&n.finger===null));
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerResearchPanel > summary').click();
 await page.locator('#fingerBrowserToggle').click();
 await page.locator('#fingerSpanEditorOpen').click();
 assert.equal(await page.locator('#fingerSpanContents').isVisible(),true,'Editor shortcut opens global Practice calibration');
 await page.locator('#fingerBrowserCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus').textContent.includes('Рука некоторых нот'),null,{timeout:8000});
 await page.locator('#fingerBrowserAssumeStaves').check();
 await page.locator('#fingerBrowserCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus').textContent.includes('Вычислено локально'),null,{timeout:15000});
 assert.match(await page.locator('#fingerBrowserMetrics').innerText(),/Обычная модель: 4 предложений/);
 assert.match(await page.locator('#fingerBrowserMetrics').innerText(),/Анатомическая модель: 4 предложений/);
 assert.equal(await page.locator('#fingerBrowserCandidates li').count(),4);
 const after=await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  finger:n.finger??null,hand:n.hand??null
 })));
 assert.deepEqual(after,before,'Worker suggestions do not change source notes or hands');
 const corrections=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.deepEqual(corrections,{});
 await page.locator('#fingerBrowserHandSize').selectOption('XS');
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),/Повторите расчёт/);
 assert.equal(await page.locator('#fingerBrowserCandidates li').count(),0,'old candidate list must be invalidated');
 await page.locator('#fingerBrowserCalculate').click();
 await page.waitForFunction(()=>document.querySelector('#fingerBrowserStatus').textContent.includes('Вычислено локально'),null,{timeout:15000});
 // FG-04C5: interactive two-hand self-report and persistent application.
 await page.locator('#fingerSpanRH').selectOption('tenth');
 await page.locator('#fingerSpanLH').selectOption('tenth');
 await page.locator('#fingerSpanRecommend').click();
 assert.match(await page.locator('#fingerSpanResult').innerText(),/Рекомендация: L/);
 assert.equal(await page.locator('#fingerSpanApply').isEnabled(),true);
 await page.locator('#fingerSpanApply').click();
 assert.equal(await page.locator('#fingerBrowserHandSize').inputValue(),'L');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playalong:smart-practice:v07')).fingerBrowserHandSize),'L');
 assert.equal(await page.locator('#fingerBrowserCandidates li').count(),0,
  'calibrated size invalidates previous candidate suggestions');
 await page.locator('#fingerSpanLH').selectOption('octave');
 await page.locator('#fingerSpanRecommend').click();
 assert.match(await page.locator('#fingerSpanResult').innerText(),/Рекомендация: S/);
 await page.locator('#fingerSpanApply').click();
 assert.equal(await page.locator('#fingerBrowserHandSize').inputValue(),'S',
  'smaller comfortable LH span controls the shared setting');
 await page.locator('#fingerSpanLHComfort').selectOption('pain');
 await page.locator('#fingerSpanRecommend').click();
 assert.match(await page.locator('#fingerSpanResult').innerText(),/Размер не назначен/);
 assert.equal(await page.locator('#fingerSpanApply').isDisabled(),true);
 assert.equal(await page.locator('#fingerBrowserHandSize').inputValue(),'S',
  'pain must never auto-enlarge a stored profile');
 await page.reload();
 await page.waitForFunction(()=>window.__fingerGuideTest&&window.__prototypeTest);
 assert.equal(await page.locator('#fingerBrowserHandSize').inputValue(),'S',
  'size calibration persists after a fresh browser session');
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'hand span calibration must not create score finger overrides');
 assert.deepEqual(failures,[],'No unhandled page exceptions');
 console.log('FG-04C4 browser Worker, explicit research staff assumption, result/stale-data integrity: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
