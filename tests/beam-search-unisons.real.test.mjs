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
 assert.match(status,/1 перекрывающихся унисонных нот исключены/);
 const metrics=await page.locator('#fingerBrowserMetrics').innerText();
 assert.match(metrics,/Всего нот: 4/);
 assert.match(metrics,/Для расчёта: 3/);
 assert.match(metrics,/Для ручной проверки: 1/);
 assert.match(metrics,/Обычная модель: 3 предложений/);
 assert.match(metrics,/Анатомическая модель: 3 предложений/);
 const skipped=await page.locator('#fingerBrowserCandidates').innerText();
 assert.match(skipped,/Не рассчитаны/);
 assert.match(skipped,/D4/);
 const after=await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  staff:n.staff,voice:n.voice,finger:n.finger??null
 })));
 assert.deepEqual(after,source,'no score notes or timings may be silently mutated');
 assert.deepEqual(errors,[]);
 console.log('BEAM_SEARCH_MUSICXML_UNISON_PASS '+JSON.stringify({
  imported:4,proposed:3,manual:1,originalUnchanged:true}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
