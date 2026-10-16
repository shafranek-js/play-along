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
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('missing');return}
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,22,
 0,0x90,60,80,0x83,0x60,0x80,60,0,
 0,0x90,64,80,0x83,0x60,0x80,64,0,
 0,0xff,0x2f,0,
]);
const note=(p,f=null)=>'<note><pitch><step>'+p+
 '</step><octave>4</octave></pitch><duration>480</duration>'+
 '<type>quarter</type><voice>1</voice><staff>1</staff>'+
 (f===null?'':'<notations><technical><fingering>'+f+'</fingering></technical></notations>')+
 '</note>';
const xml='<score-partwise version="4.0"><part-list><score-part id="P1">'+
 '<part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">'+
 '<attributes><divisions>480</divisions><staves>2</staves></attributes>'+
 note('C',1)+note('D')+note('E')+note('F')+'</measure></part></score-partwise>';

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&
  window.__prototypeTest&&window.__fingerGuideTest);
 const loaded=await page.evaluate(source=>{
  const song=window.__libraryV08.readMusicXML(source,'three-methods.musicxml');
  window.__prototypeTest.loadSong(song);window.__prototypeTest.seek(0);
  return {format:song.format,notes:song.tracks.flatMap(t=>t.notes).length};
 },xml);
 assert.deepEqual(loaded,{format:'MusicXML',notes:4});
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'manual');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerAutomatic').isVisible(),false);
 const saved=()=>page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 const original=await page.evaluate(()=>window.__prototypeTest.song.notationXML);
 const originalTransport=await page.evaluate(()=>window.__prototypeTest.pos);
 const originalKeys=await page.evaluate(()=>window.__prototypeTest.pianoGeometry.whites.map(k=>k.w));
 await page.locator('#sceneFingerMethod').selectOption('pianomotion');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),false);
 assert.equal(await page.locator('#sceneFingerAutomatic').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerCalculate').isEnabled(),true);
 const old=await saved();
 // No real Python runtime required to check that the existing SINGLE
 // handler is used. Force its well-known no-Worker early-exit path.
 await page.evaluate(()=>{window.__testOriginalWorker=window.Worker;window.Worker=undefined});
 await page.locator('#sceneFingerCalculate').click();
 assert.match(await page.locator('#pianoMotionStatus').innerText(),/не поддерживает Web Worker/);
 assert.match(await page.locator('#sceneFingerAutoStatus').innerText(),/не поддерживает Web Worker/);
 assert.deepEqual(await saved(),old,'algorithm launch cannot automatically apply fingers');
 await page.locator('#roll').focus();
 await page.keyboard.press('5');
 assert.deepEqual(await saved(),old,'manual step-entry must be disabled in automatic mode');
 await page.evaluate(()=>{window.Worker=window.__testOriginalWorker});

 // Beam Search must use its existing classic Web Worker, no duplicate
 // algorithm, and make no source/override changes until explicit acceptance.
 await page.locator('#sceneFingerMethod').selectOption('beam');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),false);
 await page.evaluate(()=>{
  const el=document.getElementById('fingerBrowserAssumeStaves');
  el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.locator('#sceneFingerCalculate').click();
 await page.waitForFunction(()=>/Вычислено локально|Отказ|Ошибка|Рука/.test(
  document.getElementById('fingerBrowserStatus').textContent),null,{timeout:20000});
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#fingerBrowserConfirm').isChecked(),false);
 assert.deepEqual(await saved(),old,'Beam preview cannot silently apply fingers');
 assert.equal(await page.locator('#rollWrap').isVisible(),true,
  'workers run without replacing shared performance canvas');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),originalTransport);
 assert.deepEqual(await page.evaluate(()=>
  window.__prototypeTest.pianoGeometry.whites.map(k=>k.w)),originalKeys);
 await page.locator('#sceneFingerReview').click();
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#pianoMotionCalculate').count(),1);
 assert.equal(await page.locator('#fingerBrowserCalculate').count(),1);
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'beam',
  'returning to same source keeps the selected fingering method');
 await page.locator('#sceneFingerMethod').selectOption('manual');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),true);
 assert.deepEqual(await saved(),old);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),original);

 // Real MIDI import: only the PianoMotion method should be enabled on stage.
 const imported=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer(
   'stage-methods.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  return {format:song.format,count:song.tracks.flatMap(t=>t.notes).length};
 },[...midi]);
 assert.deepEqual(imported,{format:'MIDI',count:2});
 await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'pianomotion');
 assert.equal(await page.locator('#sceneFingerMethod option[value="manual"]').isDisabled(),true);
 assert.equal(await page.locator('#sceneFingerMethod option[value="beam"]').isDisabled(),true);
 assert.equal(await page.locator('#sceneFingerCalculate').isEnabled(),true);
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 await page.locator('#sceneFingerReview').click();
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 assert.equal(await page.locator('#pianoMotionPanel').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.format),'MIDI');
 assert.deepEqual(errors,[]);
 console.log('THREE_FINGERING_METHODS_REAL_PASS: stage method switching, original Python and Beam handlers, MIDI support, no silent apply, source safe');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
