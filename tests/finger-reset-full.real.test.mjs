import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',filename.endsWith('.js')?'application/javascript':
  filename.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(filename));
});
const written=(step,oct,staff,voice,finger=null)=>
 '<note><pitch><step>'+step+'</step><octave>'+oct+
 '</octave></pitch><duration>480</duration><voice>'+voice+
 '</voice><type>quarter</type><staff>'+staff+'</staff>'+
 (finger===null?'':'<notations><technical><fingering>'+finger+
 '</fingering></technical></notations>')+'</note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1">'+
 '<part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions>'+
 '<staves>2</staves><time><beats>2</beats><beat-type>4</beat-type></time></attributes>'+
 written('C',4,1,1,1)+written('E',4,1,1,2)+
 '<backup><duration>960</duration></backup>'+
 written('C',3,2,2)+written('E',3,2,2)+
 '</measure></part></score-partwise>';

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&
  window.__prototypeTest&&window.__fingerGuideTest&&window.__scoreTest);
 const load=()=>page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'full-finger-reset.musicxml');
  window.__prototypeTest.loadSong(song);
  return song.tracks.flatMap(t=>t.notes).map(n=>({
   id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   finger:n.finger??null,hand:n.hand??null
  }));
 },xml);
 const original=await load();
 assert.equal(original.length,4);
 assert.deepEqual(original.filter(n=>n.finger!==null).map(n=>n.finger),[1,2]);
 await page.locator('#developerToolsToggle').evaluate(el=>{if(!el.checked)el.click()});
 await page.locator('#viewFingerEditor').click();
 const getSaved=()=>page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 const hist=()=>page.evaluate(()=>window.__fingerGuideTest.history);
 assert.deepEqual(await getSaved(),{});
 assert.equal(await page.locator('#fingerEditorResetFingering').isEnabled(),true,
  'author-only scores must allow full reset');
 await page.locator('#fingerEditorResetFingering').click();
 assert.equal(await page.locator('#fingerResetConfirm').isDisabled(),true,
  'user-only reset with no saved fingers must be disabled');
 await page.locator('input[name="fingerResetScope"][value="all"]').check();
 assert.match(await page.locator('#fingerResetCount').innerText(),/Скрыто авторских номеров: 2/);
 await page.locator('#fingerResetCancel').click();
 assert.deepEqual(await getSaved(),{},'cancel cannot modify author or saved fingers');
 assert.equal((await hist()).past,0);
 await page.locator('#fingerEditorResetFingering').click();
 await page.locator('input[name="fingerResetScope"][value="all"]').check();
 await page.locator('#fingerResetConfirm').click();
 const masked=await getSaved();
 assert.equal(Object.keys(masked).length,2);
 assert.ok(Object.values(masked).every(x=>
  x.finger===null&&x.hand===null&&x.suppressAuthor===true));
 assert.equal((await hist()).past,1,'full reset is a single Undo step');
 // Confirm one Undo/Redo before reload; history is intentionally ephemeral.
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await getSaved(),{},'one Undo restores original author labels');
 await page.locator('#fingerEditorRedo').click();
 assert.deepEqual(await getSaved(),masked,'one Redo reapplies both author masks');
 const preview=await page.evaluate(()=>window.__scoreTest.previewFingerOverlay(
  window.__fingerGuideTest.userCorrections));
 assert.equal(preview.status,'applied');
 assert.equal(preview.suppressed,2);
 assert.equal(preview.fingeringTags,0,
  'detached score overlay must hide original author fingering too');
 const downloadPending=page.waitForEvent('download');
 await page.locator('#fingerEditorDownloadXML').click();
 const copy=fs.readFileSync(await (await downloadPending).path(),'utf8');
 assert.equal(copy.split('<fingering>').length-1,0,
  'downloaded MusicXML copy may omit original fingering but never modify source');
 assert.match(copy,/source-author fingering hidden in downloaded copy: 2/);
 assert.deepEqual(await page.evaluate(()=>window.__prototypeTest.song.tracks.flatMap(t=>t.notes).map(n=>({
  id:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
  finger:n.finger??null,hand:n.hand??null
 }))),original,'original MIDI/MusicXML note attributes never change');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),xml,
  'source XML must remain byte-for-byte original');

 // A fresh browser session must retain author suppression on this exact score.
 await page.reload();
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&window.__prototypeTest);
 assert.deepEqual(await load(),original);
 await page.locator('#viewFingerEditor').click();
 assert.deepEqual(await getSaved(),masked,'source-keyed author masks persist across reload');
 // The research controls start collapsed after reloading this piece.
 await page.locator('#fingerCurrentCalculate').click();
 await page.locator('#fingerBrowserAssumeStaves').check();
 await page.locator('#fingerCurrentCalculate').click();
 await page.waitForFunction(()=>/Предложения для 4 нот/.test(
  document.querySelector('#fingerBrowserStatus')?.textContent||''),null,{timeout:20000});
 const metrics=await page.locator('#fingerBrowserMetrics').innerText();
 assert.match(metrics,/Авторских обозначений: 0/);
 assert.match(metrics,/Учитывается как закреплённое в расчёте: 0/);
 assert.match(metrics,/Анатомическая модель: 4 предложений/);
 await page.locator('#fingerEditorAll').click();
 await page.locator('#fingerBrowserConfirm').check();
 assert.equal(await page.locator('#fingerBrowserAcceptSelected').isEnabled(),true,
  'fully reset authored notes can accept explicitly reviewed replacements');
 await page.locator('#fingerBrowserAcceptSelected').click();
 const applied=await getSaved();
 assert.equal(Object.keys(applied).length,4);
 assert.ok(Object.values(applied).every(x=>Number.isInteger(x.finger)));
 assert.ok(original.filter(x=>x.finger!==null).every(x=>applied[x.id].suppressAuthor===true),
  'new user digits cannot silently re-enable source-author fingering');
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await getSaved(),masked,'one Undo restores all hidden-raw-author masks');

 // Session history resets at reload by design; only the new 4-note
 // application is Undo-able in this session.
 await page.locator('#fingerEditorRedo').click();
 assert.deepEqual(await getSaved(),applied,'Redo restores all accepted proposals');
 await page.locator('#fingerEditorClear').click();
 await page.locator('#fingerEditorResetFingering').click();
 assert.match(await page.locator('#fingerResetCount').innerText(),/пользовательских номеров: 4/);
 await page.locator('#fingerResetConfirm').click();
 const userOnly=await getSaved();
 assert.equal(Object.values(userOnly).filter(x=>Number.isInteger(x.finger)).length,0);
 assert.ok(original.filter(n=>n.finger!==null).every(n=>userOnly[n.id]?.suppressAuthor===true),
  'user-only reset must not undo prior explicit author suppression');
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await getSaved(),applied,'single Undo restores user-only reset');
 assert.deepEqual(errors,[]);
 console.log('FINGER_RESET_ALL_OR_USER_REAL_PASS: author masks, browser reload, Beam replacement, two-step Undo/Redo, source immutable');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
