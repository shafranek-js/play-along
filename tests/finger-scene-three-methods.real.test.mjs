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
 assert.equal(await page.locator('#sceneFingerMethod').isVisible(),false,
  'ordinary users should not see a technical method dropdown');
 assert.equal(await page.locator('#sceneFingerAdvanced').isVisible(),false);
 assert.equal(await page.locator('#sceneFingerManualButton').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerPianoMotionButton').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerBeamButton').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerManualButton').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'manual');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerAutomatic').isVisible(),false);
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0);
 const saved=()=>page.evaluate(()=>window.__fingerGuideTest.userCorrections);
 const original=await page.evaluate(()=>window.__prototypeTest.song.notationXML);
 const originalTransport=await page.evaluate(()=>window.__prototypeTest.pos);
 const originalKeys=await page.evaluate(()=>window.__prototypeTest.pianoGeometry.whites.map(k=>k.w));
 const old=await saved();
 // No real Python runtime required to check that the SINGLE existing
 // handler is used by clicking a direct user-facing algorithm button.
 await page.evaluate(()=>{window.__testOriginalWorker=window.Worker;window.Worker=undefined});
 await page.locator('#sceneFingerPianoMotionButton').click();
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),false);
 assert.equal(await page.locator('#sceneFingerAutomatic').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerPianoMotionButton').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#pianoMotionStatus').innerText(),/не поддерживает Web Worker/);
 assert.match(await page.locator('#sceneFingerAutoStatus').innerText(),/не поддерживает Web Worker/);
 assert.deepEqual(await saved(),old,'algorithm launch cannot automatically apply fingers');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0,
  'an unavailable Python Worker must not manufacture finger proposals');
 await page.locator('#roll').focus();
 await page.keyboard.press('5');
 assert.deepEqual(await saved(),old,'manual step-entry must be disabled in automatic mode');
 await page.evaluate(()=>{window.Worker=window.__testOriginalWorker});

 // Beam Search must use its existing classic Web Worker, no duplicate
 // algorithm, and make no source/override changes until explicit acceptance.
 await page.evaluate(()=>{
  const el=document.getElementById('fingerBrowserAssumeStaves');
  el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.locator('#sceneFingerBeamButton').click();
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),false);
 assert.equal(await page.locator('#sceneFingerBeamButton').getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>/Вычислено локально|Отказ|Ошибка|Рука/.test(
  document.getElementById('fingerBrowserStatus').textContent),null,{timeout:20000});
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(el=>el.open),false,
  'shared learner stage never expands developer research panels');
 assert.equal(await page.locator('#fingerBrowserConfirm').isChecked(),false);
 assert.deepEqual(await saved(),old,'Beam preview cannot silently apply fingers');
 const stageBeam=await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates);
 assert.equal(stageBeam.method,'beam');
 if(/Вычислено локально/.test(await page.locator('#fingerBrowserStatus').innerText())){
  assert.ok(stageBeam.count>0,'Beam candidates should appear on the common stage');
  assert.ok(stageBeam.notes.every(n=>n.finger>=1&&n.finger<=5&&
   ['LH','RH'].includes(n.hand)));
  assert.ok(!stageBeam.notes.some(n=>n.pitch===60&&n.start===0),
   'source-authored C4 must never be painted as an unconfirmed proposal');
  assert.match(await page.locator('#sceneFingerAutoStatus').innerText(),/фиолетовый пунктир/);
 }else assert.equal(stageBeam.count,0,'refused calculation has no stage candidates');
 assert.equal(await page.locator('#rollWrap').isVisible(),true,
  'workers run without replacing shared performance canvas');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pos),originalTransport);
 assert.deepEqual(await page.evaluate(()=>
  window.__prototypeTest.pianoGeometry.whites.map(k=>k.w)),originalKeys);
 await page.locator('#sceneFingerReview').click();
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),false,
  'ordinary Verify must never navigate away from the shared stage');
 assert.equal(await page.locator('#sceneFingerReviewPanel').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true,
  'calculation alone cannot commit anything');
 if(stageBeam.count){
  await page.locator('#sceneFingerReviewAll').click();
  assert.match(await page.locator('#sceneFingerReviewCounts').innerText(),
   new RegExp('выбрано '+stageBeam.count));
  assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true);
  await page.locator('#sceneFingerReviewConfirm').check();
  await page.locator('#sceneFingerReviewApply').click();
  assert.ok(Object.keys(await saved()).length>0,
   'stage Beam uses original atomic saved user corrections');
  assert.equal(await page.locator('#rollWrap').isVisible(),true);
  assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true);
  await page.locator('#sceneFingerUndo').click();
  assert.deepEqual(await saved(),old,'stage Undo restores exact prior corrections');
 }
 assert.equal(await page.locator('#fingerResearchPanel').evaluate(el=>el.open),false,
  'shared learner stage never expands developer research panels');
 assert.equal(await page.locator('#pianoMotionCalculate').count(),1);
 assert.equal(await page.locator('#fingerBrowserCalculate').count(),1);
 await page.locator('#sceneFingerReviewClose').click();
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'beam',
  'returning to same source keeps the selected fingering method');
 await page.locator('#sceneFingerManualButton').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0,
  'switching to Manual hides all automatic proposals without deleting them');
 assert.equal(await page.locator('#sceneFingerManual').isVisible(),true);
 // The ordinary one-click reset opens the same two-scope confirmed workflow.
 assert.equal(await page.locator('#sceneFingerReset').isEnabled(),true);
 await page.locator('#sceneFingerReset').click();
 assert.equal(await page.locator('#fingerResetDialog').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#fingerResetDialog').isVisible(),true,
  'original reset modal opens directly over the roll');
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 await page.locator('#fingerResetCancel').click();
 assert.equal(await page.locator('#fingerResetDialog').evaluate(el=>el.open),false);
 await page.locator('#sceneFingerMode').click();
 assert.deepEqual(await saved(),old);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.notationXML),original);

 // Real MIDI import: Manual and PianoMotion enabled on the same 88-key stage.
 const imported=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer(
   'stage-methods.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  return {format:song.format,count:song.tracks.flatMap(t=>t.notes).length};
 },[...midi]);
 assert.deepEqual(imported,{format:'MIDI',count:2});
 // Loading a new source while actively editing retains the shared scene
 // (and selects its eligible automatic method). Do not accidentally turn
 // off that already-active scene by clicking the toggle again.
 if(await page.locator('#sceneFingerMode').getAttribute('aria-pressed')==='false')
  await page.locator('#sceneFingerMode').click();
 assert.equal(await page.locator('#sceneFingerMode').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#sceneFingerMethod').inputValue(),'manual');
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.sceneCandidates)).count,0,
  'new MIDI source must not inherit previous MusicXML proposal IDs');
 assert.equal(await page.locator('#sceneFingerMethod option[value="manual"]').evaluate(el=>el.disabled),false,
  'Manual supports a source-addressable MIDI');
 assert.equal(await page.locator('#sceneFingerMethod option[value="beam"]').evaluate(el=>el.disabled),false,
  'Beam is selectable on original MIDI, but unknown hand assignments must be refused');
 assert.equal(await page.locator('#sceneFingerPianoMotionButton').isEnabled(),true);
 assert.equal(await page.locator('#sceneFingerManualButton').isEnabled(),true);
 assert.equal(await page.locator('#sceneFingerBeamButton').isEnabled(),true);
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 const midiIds=await page.evaluate(()=>window.__fingerGuideTest.sourceOrder);
 assert.equal(midiIds.length,2,'MIDI must expose both stable source note IDs');
 assert.ok(midiIds.every(id=>/^midi:[0-9]+:[0-9]+$/.test(id)));
 assert.equal(await page.locator('#sceneFingerExport').isDisabled(),true,
  'unexported manual MIDI work must not masquerade as ready MusicXML');
 const midiSource=await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.map(t=>t.notes.map(n=>[
  n.noteId,n.pitch,n.start,n.duration,n.finger??null]))));
 const midiRects=await page.evaluate(()=>window.__fingerGuideTest.noteRects);
 const pick=midiRects.find(n=>n.id===midiIds[0]);
 assert.ok(pick);
 const rollBox=await page.locator('#roll').boundingBox();
 await page.mouse.click(rollBox.x+pick.x+pick.w/2,rollBox.y+pick.y+pick.h/2);
 const pointerSelected=await page.evaluate(()=>window.__fingerGuideTest.selectedNoteIds);
 assert.deepEqual(pointerSelected,[midiIds[0]],
  'MIDI note click must select intended imported source note');
 await page.locator('[data-scene-hand="RH"]').click();
 await page.locator('[data-scene-finger="3"]').click();
 const midiDebug=await page.evaluate(()=>({
  selected:window.__fingerGuideTest.selectedNoteIds,
  key:window.__prototypeTest.song.midiFingerWorkKey,
  edits:window.__fingerGuideTest.userCorrections,
  history:window.__fingerGuideTest.history,
  stage:document.getElementById('sceneFingerSelection').textContent
 }));
 assert.equal(midiDebug.edits[midiIds[0]]?.finger,3,JSON.stringify(midiDebug));
 // FG-05: a confirmed MANUAL finger on imported original MIDI now
 // enables direct on-stage MusicXML download (previously blocked).
 assert.equal(await page.locator('#sceneFingerExport').isEnabled(),true);
 const midiManualExport=await page.evaluate(async()=>{
  const oldCreate=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click;
  let exported=null,downloadName=null;
  try{
   URL.createObjectURL=blob=>{exported=blob;return 'blob:manual-midi-fingering-qa'};
   HTMLAnchorElement.prototype.click=function(){downloadName=this.download};
   document.getElementById('sceneFingerExport').click();
   const xml=exported?await exported.text():null;
   const doc=xml?new DOMParser().parseFromString(xml,'application/xml'):null;
   const reloaded=xml?window.__libraryV08.readMusicXML(xml,'manual-midi.musicxml'):null;
   const notes=reloaded?.tracks.flatMap(t=>t.notes)||[];
   return {
    downloaded:!!xml,downloadName,
    marker:doc?.querySelector('miscellaneous-field[name="play-along-user-fingering"]')?.textContent||'',
    digits:[...(doc?.getElementsByTagName('fingering')||[])].map(n=>n.textContent),
    imported:notes.map(n=>[n.pitch,n.finger??null,n.fingeringSource??null]),
    warning:reloaded?.warnings.some(w=>w.includes('пользовательских правках')),
    format:window.__prototypeTest.song.format,
    sameStage:!document.getElementById('rollWrap').classList.contains('hidden')
   };
  }finally{
   URL.createObjectURL=oldCreate;
   HTMLAnchorElement.prototype.click=oldClick;
  }
 });
 assert.equal(midiManualExport.downloaded,true,JSON.stringify(midiManualExport));
 assert.match(midiManualExport.downloadName,/-manual-fingering\.musicxml$/);
 assert.match(midiManualExport.marker,/quantized\/approximate/);
 assert.deepEqual(midiManualExport.digits,['3']);
 assert.deepEqual(midiManualExport.imported,[
  [60,3,'musicxml-user-export-unverified'],[64,null,null]
 ]);
 assert.equal(midiManualExport.warning,true);
 assert.equal(midiManualExport.format,'MIDI','original source is still MIDI');
 assert.equal(midiManualExport.sameStage,true);
 assert.equal(await page.locator('#sceneFingerUndo').isEnabled(),true);
 await page.locator('#sceneFingerUndo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[midiIds[0]]?.finger??null,null);
 await page.locator('#sceneFingerRedo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[midiIds[0]].finger,3);
 // Re-import exact bytes (possibly with a different title) -> restored user finger.
 // Different source bytes -> cannot inherit the same stored finger.
 const sameMIDI=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('renamed.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  return window.__fingerGuideTest.userCorrections;
 },[...midi]);
 assert.equal(sameMIDI[midiIds[0]].finger,3);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.map(t=>t.notes.map(n=>[
  n.noteId,n.pitch,n.start,n.duration,n.finger??null])))),midiSource,
  'fingering overrides never change source MIDI note content');
 const changedBytes=Uint8Array.from(midi);
 changedBytes[changedBytes.indexOf(0x90)+1]=61;
 const changedEdits=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('different.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  return window.__fingerGuideTest.userCorrections;
 },[...changedBytes]);
 assert.deepEqual(changedEdits,{},'different MIDI bytes cannot adopt other score corrections');
 // Return to the original, demonstrate same-scene confirmed MIDI reset.
 await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('again.mid',Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);
 },[...midi]);
 if(await page.locator('#sceneFingerMode').getAttribute('aria-pressed')==='false')
  await page.locator('#sceneFingerMode').click();
 await page.locator('#sceneFingerReset').click();
 assert.equal(await page.locator('#fingerResetDialog').evaluate(el=>el.open),true);
 await page.locator('#fingerResetConfirm').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[midiIds[0]]?.finger??null,null);
 await page.locator('#sceneFingerUndo').click();
 assert.equal((await page.evaluate(()=>window.__fingerGuideTest.userCorrections))[midiIds[0]].finger,3,
  'confirmed MIDI reset must be one Undo operation');
 // No Python worker is invoked only to inspect the same stage review UI.
 await page.evaluate(()=>{
  const el=document.getElementById('sceneFingerMethod');
  el.value='pianomotion';el.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.locator('#sceneFingerReview').click();
 assert.equal(await page.locator('#sceneFingerReviewPanel').isVisible(),true);
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),false);
 assert.equal(await page.locator('#sceneFingerReviewApply').isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.song.format),'MIDI');
 // Developer controls are a local presentation preference, not permissions.
 await page.evaluate(()=>{
  const toggle=document.getElementById('developerToolsToggle');
  toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
 });
 assert.equal(await page.locator('#sceneFingerMethod').isVisible(),true);
 assert.equal(await page.locator('#sceneFingerAdvanced').isVisible(),true);
 await page.evaluate(()=>{
  const toggle=document.getElementById('developerToolsToggle');
  toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));
 });
 assert.equal(await page.locator('#sceneFingerMethod').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('THREE_FINGERING_METHODS_REAL_PASS: same-screen review, Beam selection/apply/Undo, original Python/Beam handlers, MIDI, safe reset, source immutable');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
