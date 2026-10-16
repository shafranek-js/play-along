import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const f=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':
  f.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(f));
});
const note=p=>'<note><pitch><step>'+p+'</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>';
const xml=pitches=>'<?xml version="1.0" encoding="utf-8"?>'+
 '<score-partwise version="4.0"><work><work-title>Migration Demo</work-title></work>'+
 '<movement-title>Migration Demo</movement-title>'+
 '<identification><creator type="composer">Demo Composer</creator></identification>'+
 '<part-list><score-part id="P1"><part-name>Right Hand</part-name></score-part></part-list>'+
 '<part id="P1">'+pitches.map((p,i)=>'<measure number="'+(i+1)+'">'+
 (i===0?'<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
 note(p)+'</measure>').join('')+'</part></score-partwise>';
const oldXml=xml(['C','D']),newXml=xml(['C','E','D']);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.abort('blockedbyclient'));
 await page.route('https://unpkg.com/**',r=>r.abort('blockedbyclient'));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 const oldIds=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'previous-edition.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes.map(n=>n.noteId));
 },oldXml);
 assert.equal(oldIds.length,2);
 await page.locator('#developerToolsToggle').evaluate(el=>{if(!el.checked)el.click()});
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerEditorAll').click();
 await page.locator('#fingerEditorFinger').selectOption('3');
 await page.locator('#fingerEditorApply').click();
 const prior=await page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 assert.equal(Object.keys(prior).length,2,'Prior edits must be saved by original XML fingerprint');
 const currentSource=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'new-edition.musicxml');
  window.__prototypeTest.loadSong(song);
  return {xml:song.notationXML,events:JSON.stringify(song.audioEvents),
   ids:song.tracks.flatMap(t=>t.notes.map(n=>n.noteId))};
 },newXml);
 assert.equal(currentSource.ids.length,3);
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerEditionPanel summary').click();
 await page.locator('#fingerEditionOldFile').setInputFiles({
  name:'previous-edition.musicxml',mimeType:'application/xml',buffer:Buffer.from(oldXml)
 });
 await page.locator('#fingerEditionCompare').click();
 await page.waitForFunction(()=>document.querySelector('#fingerEditionStatus').textContent.includes('Готовы к ручному выбору'));
 const status=await page.locator('#fingerEditionStatus').innerText();
 assert.match(status,/Готовы к ручному выбору: 2/);
 const options=page.locator('#fingerEditionCandidates input[type="checkbox"]');
 assert.equal(await options.count(),2,'Only strict unchanged source measures may map');
 assert.equal(await page.locator('#fingerEditionApply').isDisabled(),true,
  'No automatic cross-edition application');
 await options.nth(1).check();
 await page.locator('#fingerEditionApply').click();
 const applied=await page.evaluate(()=>{
  const song=window.__prototypeTest.song;
  return {xml:song.notationXML,events:JSON.stringify(song.audioEvents),
   corrections:window.__fingerGuideTest.userCorrections,
   history:window.__fingerGuideTest.history};
 });
 assert.equal(applied.xml,currentSource.xml,'No XML source rewriting');
 assert.equal(applied.events,currentSource.events,'MIDI event timeline untouched');
 assert.deepEqual(Object.keys(applied.corrections),[currentSource.ids[2]],
  'Explicitly selected revised source note only');
 assert.equal(applied.corrections[currentSource.ids[2]].finger,3);
 assert.equal(applied.history.past,1,'A complete migration is one Undo step');
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.deepEqual(errors,[],'No browser page errors');
 console.log('FG-03C2B5 browser: exact old source lookup, shifted measure, manual checkbox consent, atomic Undo, original MIDI/XML preserved PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
