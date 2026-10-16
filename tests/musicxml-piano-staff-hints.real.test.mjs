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
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const note=(step,octave,staff,voice)=>
 '<note><pitch><step>'+step+'</step><octave>'+octave+
 '</octave></pitch><duration>480</duration><voice>'+voice+
 '</voice><type>quarter</type><staff>'+staff+'</staff></note>';
const pianoPart=name=>'<part id="P1"><measure number="1"><attributes><divisions>480</divisions><staves>2</staves>'+
 '<time><beats>2</beats><beat-type>4</beat-type></time></attributes>'+
 note('C',4,1,1)+note('E',4,1,1)+
 '<backup><duration>960</duration></backup>'+
 note('C',3,2,2)+note('E',3,2,2)+'</measure></part>';
const mix=instrumentName=>
 '<score-partwise version="4.0"><part-list>'+
 '<score-part id="P1"><part-name>'+instrumentName+'</part-name></score-part>'+
 '<score-part id="P2"><part-name>Violin</part-name></score-part>'+
 '</part-list>'+pianoPart(instrumentName)+
 '<part id="P2"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 note('G',5,1,1)+'</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&window.__prototypeTest&&window.__fingerGuideTest);
 const original=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'piano-and-violin.musicxml');
  window.__prototypeTest.loadSong(song);
  window.__prototypeTest.seek(0);
  return {parts:song.pianoGrandStaffParts,notes:song.tracks.flatMap(t=>t.notes).map(n=>[
   n.noteId,n.partId,n.staff,n.pitch,n.start,n.duration,n.hand??null,n.finger??null
  ])};
 },mix('Piano'));
 assert.deepEqual(original.parts,['P1']);
 assert.equal(original.notes.length,5);
 assert.ok(original.notes.every(n=>n[6]===null&&n[7]===null),
  'editorial staff hypothesis is never put into original song notes');
 await page.locator('#sceneFingerMode').click();
 await page.locator('#sceneFingerBeamButton').click();
 await page.waitForFunction(()=>document.getElementById('fingerBrowserStatus')?.
  textContent?.includes('Вычислено локально'),null,{timeout:20000});
 const status=await page.locator('#fingerBrowserStatus').innerText();
 assert.match(status,/предварительно по нотным станам фортепиано \(4 нот\)/);
 assert.match(status,/1 нот других инструментов исключено/);
 const suggestions=await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates);
 assert.equal(suggestions.count,4,'piano part only; violin should not gain a virtual hand');
 assert.ok(suggestions.notes.every(n=>original.notes.some(a=>a[0]===n.id&&a[1]==='P1')));
 assert.equal(await page.locator('#fingerBrowserAssumeStaves').isChecked(),false);
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(e=>e.open),false);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>[
  n.noteId,n.partId,n.staff,n.pitch,n.start,n.duration,n.hand??null,n.finger??null
 ])),original.notes,'source piano and violin source notes stay immutable');
 // A non-piano grand staff must never inherit this keyboard hypothesis.
 const organ=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'organ-and-violin.musicxml');
  window.__prototypeTest.loadSong(song);
  return {pianoParts:song.pianoGrandStaffParts,
   originalHands:song.tracks.flatMap(t=>t.notes).map(n=>n.hand??null)};
 },mix('Organ'));
 assert.deepEqual(organ.pianoParts,[]);
 assert.ok(organ.originalHands.every(h=>h===null));
 if(await page.locator('#sceneFingerMode').getAttribute('aria-pressed')==='false')
  await page.locator('#sceneFingerMode').click();
 await page.locator('#sceneFingerBeamButton').click();
 assert.match(await page.locator('#fingerBrowserStatus').innerText(),/Рука некоторых нот не определена/);
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0);
 assert.deepEqual(errors,[]);
 console.log('MusicXML piano grand staff => provisional two-hand Beam, nonpiano/orchestral excluded, source unchanged PASS');
}finally{
 await browser?.close();
 await new Promise(ok=>server.close(ok));
}
