import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('missing');return;}
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,22,
 0,0x90,60,80,0x83,0x60,0x80,60,0,
 0,0x90,64,80,0x83,0x60,0x80,64,0,
 0,0xff,0x2f,0,
]);
const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions><staves>2</staves><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>960</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>480</duration><voice>2</voice><type>quarter</type><staff>2</staff></note><note><pitch><step>G</step><octave>3</octave></pitch><duration>480</duration><voice>2</voice><type>quarter</type><staff>2</staff></note></measure></part></score-partwise>';
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08);
 assert.equal(await page.locator('#pianoMotionCalculate').count(),1,'single real PianoMotion action');
 assert.equal(await page.locator('#pianoMotionPanel').count(),1,'one attached original calculation panel');
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionPanel').count(),1,'the calculation is in Fingering workspace');
 assert.equal(await page.locator('#rightPanel #pianoMotionCalculate').count(),0,'no duplicated right-sidebar calculation');
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionApplySelected').count(),1);
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionUndo').count(),1);
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionExportXML').count(),1);
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionMidiPanel').count(),1,'research-only MIDI panel is inside Fingering');
 assert.equal(await page.locator('#fingeringMidiResearch').isVisible(),false,'no unpublished local-only research in public build');

 // MIDI: primary calculation is available, author-only editing is not.
 const read=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('fingering-work.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);return {format:song.format,notes:song.tracks.flatMap(t=>t.notes).length};
 },[...midi]);
 assert.equal(read.format,'MIDI');
 assert.equal(read.notes,2);
 await page.locator('#viewFingerEditor').click();
 await page.waitForFunction(()=>!document.getElementById('fingerEditorWrap').classList.contains('hidden'));
 assert.equal(await page.locator('#pianoMotionCalculate').isVisible(),true,'MIDI primary calculation must be user-clickable');
 assert.equal(await page.locator('#pianoMotionCalculate').isEnabled(),true);
 assert.equal(await page.locator('#fingeringAuthorTools').isVisible(),false,'MIDI does not present composer manual editor');
 assert.equal(await page.locator('#fingerEditorScroller').isVisible(),false);
 assert.match(await page.locator('#fingeringSourceHint').textContent(),/MIDI.*исходным MIDI/);
 const documentBefore=await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks));

 // Keep the real event handler; fake only the Python worker to verify review
 // routes through the unified UI without accepting guessed finger numbers.
 await page.evaluate(()=>{
  const RealWorker=window.Worker;
  window.__unifiedTestWorker=RealWorker;
  window.Worker=class{
   postMessage(message){
    const notes=window.__prototypeTest.song.tracks.flatMap(t=>t.notes);
    const suggestions=notes.map(n=>({
     pitch:n.pitch,start:n.start,end:n.start+n.duration,hand:'RH',finger:1
    }));
    queueMicrotask(()=>this.onmessage?.({data:{id:message.id,type:'result',result:{
     total:suggestions.length,playable:suggestions.length,unresolved:0,suggestions,
    }}}));
   }
   terminate(){}
  };
 });
 await page.locator('#pianoMotionCalculate').click();
 await page.waitForFunction(()=>!document.getElementById('pianoMotionReview').hidden,null,{timeout:15000});
 assert.equal(await page.locator('#pianoMotionReview').isVisible(),true,'review appears inside Fingering');
 assert.equal(await page.locator('#pianoMotionApplySelected').isVisible(),true);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks)),documentBefore,
  'preview does not silently alter notes or author fingering');
 await page.evaluate(()=>window.Worker=window.__unifiedTestWorker);

 // MusicXML: original author controls and research become available in same tab.
 const score=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'fingering-score.musicxml');
  window.__prototypeTest.loadSong(song);
  return {format:song.format,notes:song.tracks.flatMap(t=>t.notes).length};
 },xml);
 assert.equal(score.format,'MusicXML');assert.equal(score.notes,4);
 await page.waitForFunction(()=>document.getElementById('fingeringFormatBadge').textContent==='MusicXML');
 await page.locator('#viewFingerEditor').click();
 assert.equal(await page.locator('#pianoMotionCalculate').isVisible(),true);
 assert.equal(await page.locator('#fingeringAuthorTools').isVisible(),true);
 assert.equal(await page.locator('#fingerEditorScroller').isVisible(),true);
 assert.equal(await page.locator('#fingerCurrentCalculate').isVisible(),true,'secondary Beam Search remains under author controls');
 assert.equal(await page.locator('#fingerEditorAll').isVisible(),true);
 assert.equal(await page.locator('#fingerEditionPanel').count(),1);
 assert.equal(await page.locator('#fingerResearchPanel').count(),1);
 const sourceXML=await page.evaluate(()=>window.__prototypeTest.song.notationXML);
 await page.locator('#fingerEditorAll').click();
 await page.locator('#fingerEditorFinger').selectOption('2');
 await page.locator('#fingerEditorApply').click();
 assert.ok(Object.keys(await page.evaluate(()=>window.__fingerGuideTest.userCorrections)).length>0);
 await page.locator('#fingerEditorUndo').click();
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.userCorrections),{});
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),sourceXML,
  'original score stays bit-for-bit unchanged');

 // Switching back does not leak author-only actions or duplicate main buttons.
 await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('other.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
 },[...midi]);
 await page.locator('#viewFingerEditor').click();
 assert.equal(await page.locator('#fingeringAuthorTools').isVisible(),false);
 assert.equal(await page.locator('#pianoMotionCalculate').isVisible(),true);
 assert.equal(await page.locator('#pianoMotionCalculate').count(),1);
 assert.deepEqual(errors,[],'No runtime errors');
 console.log('UNIFIED FINGERING: single main PianoMotion, MIDI vs MusicXML actions, real preview, protected source/Undo: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
