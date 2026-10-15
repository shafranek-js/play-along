import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
// Two voices in the upper staff repeat a still-sustained D4; one bass
// staff note is independent. Never bundle the user-submitted Bach MXL.
const N=(step,oct,dur,voice,staff,type='quarter')=>
 '<note><pitch><step>'+step+'</step><octave>'+oct+
 '</octave></pitch><duration>'+dur+'</duration><voice>'+voice+
 '</voice><type>'+type+'</type><staff>'+staff+'</staff></note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1">'+
 '<part-name>Piano</part-name></score-part></part-list><part id="P1">'+
 '<measure number="1"><attributes><divisions>480</divisions><staves>2</staves>'+
 '<time><beats>4</beats><beat-type>4</beat-type></time></attributes>'+
 N('D',4,1920,1,1,'whole')+
 '<backup><duration>1920</duration></backup>'+
 N('C',4,480,2,1)+N('D',4,480,2,1)+
 '<note><rest/><duration>960</duration><voice>2</voice><type>half</type><staff>1</staff></note>'+
 '<backup><duration>1920</duration></backup>'+
 N('G',3,1920,5,2,'whole')+
 '</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&window.__prototypeTest);
 const source=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'unison-voices.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes).map(n=>({
   noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   staff:n.staff,voice:n.voice,finger:n.finger??null
  }));
 },xml);
 assert.equal(source.length,4);
 await page.locator('#viewFingerEditor').click();
 if(!await page.locator('#fingerResearchPanel').evaluate(e=>e.open))
  await page.locator('#fingerResearchPanel > summary').click();
 if(!await page.locator('#fingerBrowserContents').isVisible())
  await page.locator('#fingerBrowserToggle').click();
 await page.locator('#fingerBrowserAssumeStaves').check();
 await page.locator('#fingerBrowserCalculate').click();
 await page.waitForFunction(()=>
  document.getElementById('fingerBrowserStatus')?.textContent?.includes('Вычислено локально'),
  null,{timeout:20000});
 const status=await page.locator('#fingerBrowserStatus').innerText();
 assert.match(status,/3 нот/);
 assert.match(status,/1 наложенных унисона для ручной проверки/);
 const metrics=await page.locator('#fingerBrowserMetrics').innerText();
 assert.match(metrics,/Всего нот: 4/);
 assert.match(metrics,/После проверки унисонов: 3/);
 assert.match(metrics,/Потребуют ручной проверки \(выбранная модель\): 1/);
 assert.match(metrics,/Обычная модель: 3 предложений/);
 assert.match(metrics,/Анатомическая модель: 3 предложений/);
 const skipped=await page.locator('#fingerBrowserCandidates').innerText();
 assert.match(skipped,/Ноты для ручной проверки/);
 assert.match(skipped,/D4/);
 const after=await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  staff:n.staff,voice:n.voice,finger:n.finger??null
 })));
 assert.deepEqual(after,source,'no score notes or timings may be silently mutated');
 // Another fully original MusicXML: an impossible physical B3–F5 chord
 // must not cancel the nearby, otherwise solvable musical phrase.
 const wideXml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'+
 N('C',4,480,1,1)+N('D',4,480,1,1)+
 '<note><rest/><duration>960</duration><voice>1</voice><type>half</type><staff>1</staff></note>'+
 '</measure><measure number="2">'+
 N('B',3,1920,1,1,'whole')+
 '<note><chord/><pitch><step>F</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type><staff>1</staff></note>'+
 '</measure></part></score-partwise>';
 const wideBefore=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'wide-physical-chord.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes).map(n=>({
   noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   staff:n.staff,voice:n.voice,finger:n.finger??null
  }));
 },wideXml);
 assert.equal(wideBefore.length,4);
 // Loading another piece resets the research panel state. Open the user-facing
 // editor and the panel again, rather than force-clicking hidden controls.
 await page.locator('#viewFingerEditor').click();
 if(!await page.locator('#fingerResearchPanel').evaluate(e=>e.open))
  await page.locator('#fingerResearchPanel > summary').click();
 if(!await page.locator('#fingerBrowserContents').isVisible())
  await page.locator('#fingerBrowserToggle').click();
 await page.locator('#fingerBrowserAssumeStaves').check();
 await page.locator('#fingerBrowserCalculate').click();
 await page.waitForFunction(()=>
  /Предложения для 2 нот/.test(document.getElementById('fingerBrowserStatus')?.textContent||''),
  null,{timeout:20000});
 const wideStatus=await page.locator('#fingerBrowserStatus').innerText();
 assert.match(wideStatus,/2 нот в сложных участках исключены только из расчёта/);
 const wideMetrics=await page.locator('#fingerBrowserMetrics').innerText();
 assert.match(wideMetrics,/Всего нот: 4/);
 assert.match(wideMetrics,/Потребуют ручной проверки \(выбранная модель\): 2/);
 assert.match(wideMetrics,/Обычная модель: 2 предложений · 2 сложных нот без расчёта/);
 assert.match(wideMetrics,/Анатомическая модель: 2 предложений · 2 сложных нот без расчёта/);
 assert.match(wideMetrics,/Охват обычной модели: 50\.0% \(2\/4 нот\)/);
 assert.match(wideMetrics,/Охват анатомической модели: 50\.0% \(2\/4 нот\)/);
 assert.match(wideMetrics,/Расширенный поиск · обычная: 0 участков · 0 нот/);
 assert.match(wideMetrics,/Расширенный поиск · анатомическая: 0 участков · 0 нот/);
 const diagnostics=await page.locator('#fingerBrowserCandidates').innerText();
 assert.match(diagnostics,/B3/);
 assert.match(diagnostics,/F5/);
 assert.match(diagnostics,/Такт 2/);
 assert.match(diagnostics,/Обычная модель · 1 проблемных участков/);
 assert.match(diagnostics,/Анатомическая модель · 1 проблемных участков/);
 assert.match(diagnostics,/ноты при отказе: B3, F5/);
 assert.match(diagnostics,/охват кисти или порядок пальцев/);
 assert.match(diagnostics,/поиск при ширине 40 → 80 → 128 не помог/);
 const wideAfter=await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  staff:n.staff,voice:n.voice,finger:n.finger??null
 })));
 assert.deepEqual(wideAfter,wideBefore,'even impossible held chords remain exactly in source');
 assert.deepEqual(errors,[]);
 console.log('BEAM_SEARCH_COMPLEX_ISLAND_PARTIAL_PASS '+JSON.stringify({
  imported:4,solved:2,manual:2,originalUnchanged:true}));
 console.log('BEAM_SEARCH_MUSICXML_UNISON_PASS '+JSON.stringify({
  imported:4,proposed:3,manual:1,originalUnchanged:true}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
