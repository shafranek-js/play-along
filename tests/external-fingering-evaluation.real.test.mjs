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
const XML_HEAD='<?xml version="1.0" encoding="utf-8"?>';
const note=(pitch,finger=null,extra='')=>'<note><pitch><step>'+pitch+'</step><octave>4</octave></pitch>'+
 '<duration>480</duration><type>quarter</type>'+extra+
 (finger===null?'':'<notations><technical><fingering>'+finger+'</fingering></technical></notations>')+
 '</note>';
const score=(notes,label='Piano')=>XML_HEAD+'<score-partwise version="4.0">'+
 '<part-list><score-part id="P1"><part-name>'+label+'</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 notes.join('')+'</measure></part></score-partwise>';
const original=score([note('C',1),note('D'),note('E')],'Right Hand');
const candidate=score([note('C',1),note('D',3),note('E')],'Right Hand');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__scoreTest);
 const originalFingerprint=await page.evaluate(xml=>{
  const s=window.__libraryV08.readMusicXML(xml,'author-score.musicxml');
  window.__prototypeTest.loadSong(s);
  return {xml:s.notationXML,notes:s.tracks.flatMap(t=>t.notes).map(n=>({id:n.noteId,finger:n.finger??null}))};
 },original);
 await page.locator('#viewFingerEditor').click();
 await page.locator('#fingerResearchPanel summary').click();
 const input=page.locator('#fingerResearchFile');
 const run=async(content,engine='MasterPiano')=>{
  await page.locator('#fingerResearchEngine').selectOption(engine);
  await input.setInputFiles({name:'generated.musicxml',mimeType:'application/xml',buffer:Buffer.from(content)});
  await page.locator('#fingerResearchCompare').click();
  await page.waitForFunction(()=>!document.querySelector('#fingerResearchSummary').textContent.includes('Проверка партитуры'));
  return await page.locator('#fingerResearchSummary').innerText();
 };
 assert.match(await run(candidate),/Сопоставление партитуры пройдено/);
 assert.match(await page.locator('#fingerResearchDetails').innerText(),/Новых предложений: 1/);
 assert.match(await page.locator('#fingerResearchDetails').innerText(),/Авторские пальцы сохранены: 1/);
 const download=page.waitForEvent('download');
 await page.locator('#fingerResearchExport').click();
 const saved=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
 assert.equal(saved.schema,'play-along-fingering-evaluation-v1');
 assert.equal(saved.engine,'MasterPiano');
 assert.equal(saved.status,'compatible');
 assert.deepEqual(saved.summary,{total:3,author:1,generated:1,preserved:1,
  conflicts:0,removedAuthor:0,missing:1,handUnknown:0,withProposals:2});
 assert.equal(saved.notes.length,3);
 assert.equal(saved.notes.filter(n=>n.classification==='generated').length,1);
 assert.deepEqual((await page.evaluate(()=>window.__prototypeTest.song.notationXML)),originalFingerprint.xml);
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{},
  'Research reports cannot mutate user-confirmed override map');
 // Overwriting an existing author digit is a conflict, never auto-accepted.
 const conflict=score([note('C',2),note('D',3),note('E')],'Right Hand');
 assert.match(await run(conflict,'PianoPlayer'),/НЕ ПРИНЯТО/);
 const badDownload=page.waitForEvent('download');
 await page.locator('#fingerResearchExport').click();
 const conflicted=JSON.parse(fs.readFileSync(await (await badDownload).path(),'utf8'));
 assert.equal(conflicted.status,'conflicts');
 assert.equal(conflicted.summary.conflicts,1);
 assert.equal(conflicted.summary.generated,1);
 // Note and nonfingering metadata changes reject the entire comparison.
 assert.match(await run(score([note('C',1),note('F',3),note('E')],'Right Hand')),/ОТКЛОНЕНО/);
 assert.match(await run(score([note('C',1),note('D',3),note('E')],'Left Hand')),/ОТКЛОНЕНО/);
 // Untrusted alternate/ambiguous candidate fingers are not silently accepted.
 const ambiguous=candidate.replace('<fingering>3</fingering>',
  '<fingering alternate="yes">3</fingering>');
 assert.match(await run(ambiguous),/ОТКЛОНЕНО/);
 const invalid=candidate.replace('<fingering>3</fingering>','<fingering>8</fingering>');
 assert.match(await run(invalid),/ОТКЛОНЕНО/);
 // Ignore raw file contents after source switches: previously imported
 // candidate report must never claim applicability to another score.
 await page.evaluate(xml=>{
  const s=window.__libraryV08.readMusicXML(xml,'another-score.musicxml');
  window.__prototypeTest.loadSong(s);
 },score([note('G',5),note('A')],'Right Hand'));
 await page.waitForFunction(()=>document.querySelector('#fingerResearchExport').disabled);
 assert.equal(await page.locator('#fingerResearchFile').inputValue(),'');
 assert.deepEqual(errors,[]);
 console.log('FG-04A external candidate: same-score structural validation, new fingers, author conflicts, report JSON, no overwrite, ambiguity refusal, source reset: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
