import {selectCompactFingerMode,selectCompactLookahead} from './compact-ui-helpers.mjs';
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
 const f=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(f));
});
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Right hand</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 '<note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration>'+
 '<notations><technical><fingering>1</fingering></technical></notations></note>'+
 '<note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration></note>'+
 '</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 const load=()=>page.evaluate(source=>{
  const s=window.__libraryV08.readMusicXML(source,'finger-correction.musicxml');
  window.__prototypeTest.loadSong(s);
  return s.tracks.flatMap(t=>t.notes).map(n=>({id:n.noteId,pitch:n.pitch,finger:n.finger??null,hand:n.hand??null}));
 },xml);
 const originals=await load(),first=originals[0],second=originals[1];
 assert.deepEqual(originals.map(n=>n.finger),[1,null]);
 await selectCompactFingerMode(page,'numbers');
 const select=async noteId=>{
  assert.equal(await page.evaluate(id=>window.__fingerGuideTest.selectAuthoredNote(id),noteId),true);
  await page.locator('.fingerCorrection select').first().waitFor();
 };
 const set=async(finger,hand)=>{
  await page.locator('.fingerCorrection select').nth(0).selectOption(String(finger));
  await page.locator('.fingerCorrection select').nth(1).selectOption(hand);
  await page.getByRole('button',{name:'Сохранить правку'}).click();
 };
 const correction=()=>page.evaluate(()=>window.__fingerGuideTest.selectedCorrection);
 const steps=()=>page.evaluate(()=>window.__fingerGuideTest.steps);
 await select(first.id);
 assert.match(await page.locator('.fingerCorrection > p.small:not(.fingerCorrectionHistory)').innerText(),/Автор: палец 1/);
 await set(5,'LH');
 assert.deepEqual(await correction(),{finger:5,hand:'LH',source:'user'});
 assert.equal((await steps())[0].notes[0].finger,5);
 assert.equal((await steps())[0].notes[0].source,'user');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.authoredSelection)).finger,1,
  'MusicXML source must NOT be changed by the correction');
 await page.getByRole('button',{name:'Отменить правку'}).click();
 assert.equal(await correction(),null);
 assert.equal((await steps())[0].notes[0].finger,1);
 await set(3,'RH');
 await page.getByRole('button',{name:'Вернуть автора'}).click();
 assert.equal(await correction(),null);
 await select(second.id);
 assert.match(await page.locator('.fingerCorrection > p.small:not(.fingerCorrectionHistory)').innerText(),/палец не указан/);
 await set(2,'RH');
 assert.deepEqual((await steps())[1].notes.map(n=>n.finger),[2],
  'Explicitly corrected unannotated MusicXML note now has a trusted hint');
 assert.equal((await steps())[1].notes[0].source,'user');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.authoredSelection)).finger,null);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('playalong:smart-practice:v07')).fingerOverrides);
 assert.equal(Object.keys(saved).length,1);
 assert.equal(Object.keys(Object.values(saved)[0]).length,1);
 // Backup must contain user corrections; this data is separate from source.
 const download=page.waitForEvent('download');
 await page.locator('#backupExport').click();
 const backup=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
 assert.deepEqual(backup.settings.fingerOverrides,saved);
 // Invalid repair cannot pass strict backup validation or destroy known data.
 const malicious=structuredClone(backup);
 Object.values(malicious.settings.fingerOverrides)[0][second.id]={finger:7,hand:'RH'};
 await page.locator('#backupFile').setInputFiles({
  name:'invalid-override-backup.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(malicious))
 });
 await page.waitForFunction(()=>document.body.innerText.includes('Восстановление не выполнено'),null,{timeout:10000});
 assert.deepEqual(await correction(),{finger:2,hand:'RH',source:'user'});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 const importedAgain=await load();
 assert.deepEqual(importedAgain.map(n=>n.id),originals.map(n=>n.id),
  'Reimport preserves source IDs');
 await selectCompactFingerMode(page,'numbers');
 await select(second.id);
 assert.deepEqual(await correction(),{finger:2,hand:'RH',source:'user'},
  'Stored correction must survive a fresh page and identical XML import');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.authoredSelection)).finger,null,
  'Original author data survives localStorage restore');
 await page.getByRole('button',{name:'Вернуть автора'}).click();
 assert.equal(await correction(),null);
 assert.equal(Object.keys(await page.evaluate(()=>window.__fingerGuideTest.userCorrections)).length,0);
 assert.deepEqual(errors,[],'No runtime exceptions');
 console.log('FG-03C2A: editor, user provenance, undo, reset, unannotated notes, persist, backup/XSS validation: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
