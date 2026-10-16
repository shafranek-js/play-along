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
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return;}
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':
  f.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(f));
});
const note=(step,tie='')=>'<note>'+
 (tie?'<tie type="'+tie+'"/>':'')+
 '<pitch><step>'+step+'</step><octave>4</octave></pitch>'+
 '<duration>1920</duration><type>whole</type><voice>1</voice><staff>1</staff>'+
 (tie?'<notations><tied type="'+tie+'"/></notations>':'')+'</note>';
const xml=sequence=>'<?xml version="1.0" encoding="utf-8"?>'+
 '<score-partwise version="4.0"><work><work-title>Tied Edition Demo</work-title></work>'+
 '<movement-title>Tied Edition Demo</movement-title>'+
 '<identification><creator type="composer">Demo Composer</creator></identification>'+
 '<part-list><score-part id="P1"><part-name>Right Hand</part-name></score-part></part-list>'+
 '<part id="P1">'+sequence.map(([pitch,tie],i)=>'<measure number="'+(i+1)+'">'+
 (i===0?'<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
 note(pitch,tie)+'</measure>').join('')+'</part></score-partwise>';
const oldXml=xml([['C',''],['D','start'],['D','stop'],['G','']]);
const newXml=xml([['C',''],['E',''],['D','start'],['D','stop'],['G','']]);
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
 const from=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'older.musicxml');
  window.__prototypeTest.loadSong(song);
  const notes=song.tracks.flatMap(t=>t.notes);
  return notes.map(n=>({id:n.noteId,pitch:n.pitch,ids:n.sourceNoteIds}));
 },oldXml);
 assert.equal(from.length,3,'Importer merges both D tie segments to one sustained note');
 assert.equal(from[1].pitch,62);
 assert.equal(from[1].ids.length,2);
 await page.locator('#developerToolsToggle').evaluate(el=>{if(!el.checked)el.click()});
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerEditorAll').click();
 await page.locator('#fingerEditorFinger').selectOption('3');
 await page.locator('#fingerEditorApply').click();
 assert.equal(Object.keys(await page.evaluate(()=>window.__fingerGuideTest.userCorrections)).length,3);
 const target=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'newer.musicxml');
  window.__prototypeTest.loadSong(song);
  const notes=song.tracks.flatMap(t=>t.notes);
  return {notes:notes.map(n=>({id:n.noteId,pitch:n.pitch,ids:n.sourceNoteIds})),
   xml:song.notationXML,events:JSON.stringify(song.audioEvents)};
 },newXml);
 assert.equal(target.notes.length,4);
 assert.equal(target.notes[2].ids.length,2);
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerEditionPanel summary').click();
 await page.locator('#fingerEditionOldFile').setInputFiles({
  name:'older.musicxml',mimeType:'application/xml',buffer:Buffer.from(oldXml)
 });
 await page.locator('#fingerEditionCompare').click();
 await page.waitForFunction(()=>document.querySelector('#fingerEditionStatus').textContent.includes('Готовы к ручному выбору'));
 const rows=page.locator('#fingerEditionManualCandidates .fingerEditionManualRow');
 assert.equal(await rows.count(),1,'Only original tied D is unsolved');
 assert.match(await rows.first().innerText(),/лига 2 фрагментов/);
 const selection=rows.first().locator('select');
 assert.equal(await selection.inputValue(),'','Tied note never selected implicitly');
 await selection.selectOption(target.notes[2].id);
 assert.equal(await page.locator('#fingerEditionApplyManual').isDisabled(),true);
 await rows.first().locator('input[type="checkbox"]').first().check();
 await page.locator('#fingerEditionApplyManual').click();
 const applied=await page.evaluate(()=>{
  const song=window.__prototypeTest.song;
  return {xml:song.notationXML,events:JSON.stringify(song.audioEvents),
   corrections:window.__fingerGuideTest.userCorrections,
   history:window.__fingerGuideTest.history};
 });
 assert.equal(applied.xml,target.xml,'Original MusicXML must be preserved');
 assert.equal(applied.events,target.events,'All original MIDI note and pedal timing preserved');
 assert.deepEqual(Object.keys(applied.corrections),[target.notes[2].id]);
 assert.equal(applied.corrections[target.notes[2].id].finger,3);
 assert.equal(applied.history.past,1,'Manual tie review is one atomic Undo step');
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.deepEqual(errors,[]);
 console.log('FG-03C2B7 browser: original two-measure tie → one sustained note, inserted measure shift, human-only match, one Undo, XML/MIDI preserved PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
