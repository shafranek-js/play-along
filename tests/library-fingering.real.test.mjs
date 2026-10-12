import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const requestPath=new URL(req.url,'http://127.0.0.1').pathname;
 const file=path.resolve(dist,'.'+(requestPath==='/'?'/index.html':requestPath));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const piece=(title,fingers)=>{
 const notes=fingers.map((f,i)=>'<note><pitch><step>'+['C','D'][i]+'</step><octave>4</octave></pitch><duration>480</duration>'+
  (f?'<notations><technical><fingering>'+f+'</fingering></technical></notations>':'')+'</note>').join('');
 return '<score-partwise version="4.0"><work><work-title>'+title+'</work-title></work>'+
  '<movement-title>'+title+'</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
  '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+notes+'</measure></part></score-partwise>';
};
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08?.collection&&window.__fingerGuideTest);
 await page.locator('[data-page="library"]').click();
 const docs=[
  {name:'Full Coverage.musicxml',content:piece('Full Coverage',[1,2])},
  {name:'Partial Coverage.musicxml',content:piece('Partial Coverage',[1,null])},
  {name:'No Coverage.musicxml',content:piece('No Coverage',[null,null])}
 ];
 await page.evaluate(async docs=>{
  const files=docs.map(d=>new File([d.content],d.name,{type:'application/xml'}));
  await window.__libraryV08.importMusicFiles(files);
 },docs);
 await page.waitForFunction(()=>window.__libraryV08.collection.length===3);
 const selected=page.locator('#libraryFingeringSelect');
 await page.locator('#librarySourceSelect').selectOption('saved');
 const getVisible=()=>page.locator('#songList .libv8-row .libv8-main strong').allTextContents();
 const getStatus=()=>page.locator('#songList .libFingerStatus').allTextContents();
 await selected.selectOption('all');
 const titles=await getVisible(),labels=await getStatus();
 assert.equal(titles.length,3);
 assert.ok(labels.some(x=>x==='Аппликатура: Есть · 2/2 (100%)'),JSON.stringify(labels));
 assert.ok(labels.some(x=>x==='Аппликатура: Частично · 1/2 (50%)'));
 assert.ok(labels.some(x=>x==='Аппликатура: Нет · 0/2 (0%)'));
 for(const [filter,expect] of [['full','Full Coverage'],['partial','Partial Coverage'],['none','No Coverage']]){
  await selected.selectOption(filter);
  assert.deepEqual(await getVisible(),[expect],filter+' must match exactly');
 }
 await selected.selectOption('unknown');
 assert.deepEqual(await getVisible(),[], 'Already indexed saved XML is verified, never unknown');
 await selected.selectOption('partial');
 const partial=await page.evaluate(()=>window.__libraryV08.collection.find(e=>e.title==='Partial Coverage'));
 assert.equal(partial.fingeringCoverage.marked,1);
 // Real manual correction from FG-03C2A must dynamically promote partial -> full.
 await page.evaluate(async id=>{
  const meta=window.__libraryV08.collection.find(x=>x.id===id);
  const bin=await (async()=>{
   const req=indexedDB.open('playalong-library-v08');
   const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)});
   const tx=db.transaction('works','readonly'),get=tx.objectStore('works').get(id);
   const value=await new Promise((ok,fail)=>{get.onsuccess=()=>ok(get.result);get.onerror=()=>fail(get.error)});
   db.close();return value;
  })();
  await window.__libraryV08.libraryLoadFile(meta.name,bin.data,id,{title:meta.title,author:meta.author,type:'saved'});
 },partial.id);
 await page.locator('#fingerGuideMode').selectOption('numbers');
 const id=await page.evaluate(()=>window.__prototypeTest.song.tracks[0].notes.find(n=>!n.finger).noteId);
 assert.equal(await page.evaluate(id=>window.__fingerGuideTest.selectAuthoredNote(id),id),true);
 await page.locator('.fingerCorrection select').first().selectOption('3');
 await page.locator('.fingerCorrection select').nth(1).selectOption('RH');
 await page.getByRole('button',{name:'Сохранить правку'}).click();
 await page.waitForFunction(id=>window.__libraryV08.collection.find(x=>x.id===id)?.fingeringCoverage?.marked===2,partial.id);
 await page.locator('[data-page="library"]').click();
 await selected.selectOption('full');
 assert.ok((await getVisible()).includes('Partial Coverage'),'Correction upgrades library status to full');
 // Simulate a prior version's IndexedDB v3 metadata lacking coverage; backfill
 // must examine ONLY the saved local file and persist small index metadata.
 await page.evaluate(async id=>{
  const req=indexedDB.open('playalong-library-v08');
  const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)});
  const tx=db.transaction('workIndex','readwrite');
  const store=tx.objectStore('workIndex');
  const record=await new Promise((ok,fail)=>{const get=store.get(id);get.onsuccess=()=>ok(get.result);get.onerror=()=>fail(get.error)});
  delete record.fingeringCoverage;store.put(record);
  await new Promise((ok,fail)=>{tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});
  db.close();
 },partial.id);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(id=>window.__libraryV08?.collection.find(x=>x.id===id)?.fingeringCoverage?.marked===2,partial.id,{timeout:30000});
 await page.locator('[data-page="library"]').click();
 await page.locator('#librarySourceSelect').selectOption('saved');
 await page.locator('#libraryFingeringSelect').selectOption('full');
 assert.ok((await getVisible()).includes('Partial Coverage'),'Legacy local record re-indexed with override');
 // Online catalog items are never marked "none" simply for having no catalog
 // fingering field; they remain explicitly unchecked until parsed.
 await page.locator('#librarySourceSelect').selectOption('all');
 await page.locator('#libraryFingeringSelect').selectOption('unknown');
 assert.ok((await getStatus()).some(x=>x==='Аппликатура: Не проверено'),
  'Remote catalog scores must not be silently represented as having no fingering');
 assert.deepEqual(errors,[],'No unhandled browser exceptions');
 console.log('LIBRARY FINGERING: status/percent, full/partial/none filter, user edits, legacy re-index, online unknown: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
