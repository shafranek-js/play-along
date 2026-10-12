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
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 '<note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration>'+
 '<notations><technical><fingering>1</fingering></technical></notations></note>'+
 '<note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration></note>'+
 '<note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration></note>'+
 '</measure></part></score-partwise>';
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 const original=await page.evaluate(source=>{
  const score=window.__libraryV08.readMusicXML(source,'multi-undo.musicxml');
  window.__prototypeTest.loadSong(score);
  return score.tracks.flatMap(t=>t.notes).map(n=>({id:n.noteId,pitch:n.pitch,finger:n.finger??null}));
 },xml);
 assert.equal(original.length,3);
 const select=async i=>{
  assert.equal(await page.evaluate(id=>window.__fingerGuideTest.selectAuthoredNote(id),original[i].id),true);
  await page.locator('.fingerCorrection').waitFor();
 };
 const save=async(finger,hand='RH')=>{
  await page.locator('.fingerCorrection select').first().selectOption(String(finger));
  await page.locator('.fingerCorrection select').nth(1).selectOption(hand);
  await page.getByRole('button',{name:'Сохранить правку'}).click();
 };
 const corrections=()=>page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 const history=()=>page.evaluate(()=>window.__fingerGuideTest.history);
 const undo=()=>page.getByRole('button',{name:'Отменить правку'}).click();
 const redo=()=>page.getByRole('button',{name:'Повторить правку'}).click();
 await select(0);await save(3,'RH');
 await select(1);await save(5,'LH');
 await select(2);await save(4,'RH');
 assert.deepEqual((await history()).past,3);
 assert.equal((await history()).future,0);
 assert.equal(await page.getByRole('button',{name:'Повторить правку'}).isDisabled(),true);
 // Undo changes the most recently edited score note, even while another
 // score note is selected. Source-authored values never change.
 await select(0);await undo();
 assert.equal((await corrections())[original[2].id],undefined);
 assert.equal((await history()).past,2);assert.equal((await history()).future,1);
 await undo();
 assert.equal((await corrections())[original[1].id],undefined);
 await redo();await redo();
 assert.equal((await corrections())[original[2].id].finger,4);
 assert.equal((await corrections())[original[1].id].hand,'LH');
 assert.equal((await history()).future,0);
 await undo();await select(2);await save(2,'LH');
 assert.equal((await history()).future,0,'New manual edit must clear redo history');
 assert.equal(await page.getByRole('button',{name:'Повторить правку'}).isDisabled(),true);
 await page.getByRole('button',{name:'Вернуть автора'}).click();
 assert.equal((await corrections())[original[2].id],undefined);
 await undo();
 assert.equal((await corrections())[original[2].id].finger,2,
  'Source reset must be undoable without changing the author');
 assert.equal(original[0].finger,1);
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.authoredSelection)).finger,null);
 assert.match(await page.locator('.fingerCorrectionHistory').innerText(),/История этого произведения/);
 const json=await page.evaluate(()=>JSON.parse(localStorage.getItem('playalong:smart-practice:v07')));
 assert.ok(json.fingerOverrides,'Corrections persisted');
 assert.equal(json.fingerOverrideHistories,undefined,'Transient edit history never enters backup/settings');
 // Page reload keeps choices but starts with a new, empty session history.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08&&window.__fingerGuideTest);
 await page.evaluate(source=>{
  window.__prototypeTest.loadSong(window.__libraryV08.readMusicXML(source,'multi-undo.musicxml'));
 },xml);
 await select(2);
 assert.equal((await corrections())[original[2].id].finger,2);
 assert.deepEqual(await history(),{past:0,future:0,limit:40});
 assert.equal(await page.getByRole('button',{name:'Отменить правку'}).isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('FG-03C2B1: three-note Undo/Redo, divergent redo cleared, reset undoable, author preserved, reload persistence: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
