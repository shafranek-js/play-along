/**
 * LAUNCH-01 REAL Pyodide WebWorker, not a mocked result or native Python CLI.
 *
 * Temporary, immutable CC-BY-SA-4.0 Piano Protege source text is fetched
 * from its pinned SHA and converted to finger-free MIDI. This test executes
 * shipped src/workers/pianomotion-engine.worker.mjs in real Chromium,
 * downloading actual official Pyodide + wheels over the internet.
 *
 * The score is NEVER committed or bundled. We don't compare accuracy to its
 * hidden reference fingers: the test only checks real execution and roundtrip.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {corpus,loadRepertoireSource} from '../scripts/fingering-repertoire-benchmark.mjs';
import {makeP0A2Cohort} from '../src/core/p0a2-fingering-cohort.mjs';

const dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const entry=corpus.cases.find(c=>c.id==='au-clair-de-la-lune');
assert.ok(entry,'published pinned test-piece manifest must exist');
const fetched=await loadRepertoireSource(entry);
const cohort=makeP0A2Cohort(fetched.parsed);
assert.equal(cohort.ok,true,JSON.stringify(cohort));
assert.equal(cohort.noteCount,entry.expectedNotes);
const originalHash=createHash('sha256').update(cohort.midiBytes).digest('hex');
const server=http.createServer((req,res)=>{
 let url;
 try{url=new URL(req.url,'http://127.0.0.1')}
 catch{res.writeHead(400);res.end();return}
 const filename=resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!filename.startsWith(dist+sep)||!fs.existsSync(filename)||
    !fs.statSync(filename).isFile()){res.writeHead(404);res.end();return}
 res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':
  filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':
  filename.endsWith('.py')?'text/plain':'text/html');
 res.end(fs.readFileSync(filename));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const pageErrors=[],workerUrls=[],pyodideRequests=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('worker',w=>workerUrls.push(w.url()));
 page.on('request',r=>{
  if(r.url().includes('/pyodide/v314.0.7/'))pyodideRequests.push(r.url());
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__prototypeTest);
 const initial=await page.evaluate(async source=>{
  const data=Uint8Array.from(source);
  const song=await window.__libraryV08.songFromBuffer('au-clair-de-la-lune.mid',data.buffer);
  window.__prototypeTest.loadSong(song);
  window.__launch01TestOriginalSong=song;
  const notes=song.tracks.flatMap(t=>t.notes);
  return {count:notes.length,
   hasPreexistingFingers:notes.some(n=>Number.isInteger(n.finger)),
   sourceTiming:JSON.stringify(notes.map(n=>[n.noteId,n.pitch,n.start,n.duration,n.channel])),
   originalArrayTracks:song.tracks.length};
 },[...cohort.midiBytes]);
 assert.equal(initial.count,cohort.noteCount);
 assert.equal(initial.hasPreexistingFingers,false);
 // v0.10.118: the original PianoMotion controls live in one central view.
 // A narrower viewport uses the visible compact select, not the hidden
 // desktop-only score-view button. Exercise the real user-facing control.
 const desktopTab=page.locator('#viewFingerEditor');
 const compactSelect=page.locator('#compactViewSelect');
 if(await desktopTab.isVisible()){
  await desktopTab.click();
 }else{
  assert.equal(await compactSelect.isVisible(),true,
   'responsive score view selector must expose Fingering');
  await compactSelect.selectOption('editor');
 }
 await page.waitForFunction(()=>
  !document.getElementById('fingerEditorWrap')?.classList.contains('hidden'));
 assert.equal(await page.locator('#fingerEditorWrap #pianoMotionCalculate').isVisible(),true);
 // Floating panels cover the score with a real pointer-intercepting scrim.
 // Dismiss this user-visible overlay through its normal close action.
 const scrim=page.locator('#panelScrim');
 if(await scrim.isVisible()){
  await scrim.click();
  await scrim.waitFor({state:'hidden'});
 }
 await page.locator('#pianoMotionCalculate').click();
 // This wait must not succeed for a synthetic Worker; the network request
 // list is also checked below. Abort on real UI errors with a useful code.
 try{
  await page.waitForFunction(()=>{
   const t=document.getElementById('pianoMotionStatus')?.textContent||'';
   return /Оригинальный PianoMotion Python · \d+ нот/.test(t)||
    /^PianoMotion: /.test(t)||/Ошибка браузерного Python Worker/.test(t);
  },undefined,{timeout:260000});
 }catch(error){
  const status=await page.locator('#pianoMotionStatus').textContent();
  throw Error('LIVE_PYODIDE_TIMED_OUT: '+String(status).slice(0,380));
 }
 const status=await page.locator('#pianoMotionStatus').textContent();
 assert.match(status,/Оригинальный PianoMotion Python · \d+ нот/,
  'real worker must complete with actual original Python fingering: '+status);
 assert.ok(workerUrls.some(u=>u.includes('pianomotion-engine-worker.js')),
  'shipped ESM Worker must actually start');
 assert.ok(pyodideRequests.some(u=>u.endsWith('/pyodide.mjs')),
  'real pinned Pyodide browser ES module must be downloaded (no stub)');
 const review=await page.evaluate(()=>{
  const apply=document.getElementById('pianoMotionApply');
  const rows=[...document.querySelectorAll('#pianoMotionReviewList label')];
  return {applyEnabled:!apply.disabled,reviewVisible:
    !document.getElementById('pianoMotionReview').hidden,
   selected:rows.length,blocked:rows.filter(x=>x.classList.contains('physicalConflict')).length,
   cancelHidden:document.getElementById('pianoMotionCancel').hidden};
 });
 assert.equal(review.applyEnabled,true,'note identities must be validated to enable Apply');
 assert.equal(review.reviewVisible,true);
 assert.ok(review.selected>0);
 assert.equal(review.cancelHidden,true);
 await page.locator('#pianoMotionSelectAll').click();
 await page.locator('#pianoMotionApply').click();
 const after=await page.evaluate(()=>{
  const song=window.__prototypeTest?.currentSong?.()||null;
  const status=document.getElementById('pianoMotionStatus').textContent;
  const exportReady=!document.getElementById('pianoMotionExportXML').disabled;
  const notes=window.__launch01TestOriginalSong.tracks.flatMap(t=>t.notes);
  const sourceTiming=JSON.stringify(notes.map(n=>[
   n.noteId,n.pitch,n.start,n.duration,n.channel]));
  return {exportReady,status,sourceTiming,
   generatedFingers:notes.filter(n=>n.fingeringSource==='pianomotion'&&
    Number.isInteger(n.finger)).length};
 });
 assert.equal(after.exportReady,true,
  'some actually playable assignments must be accepted and exportable: '+after.status);
 assert.equal(after.sourceTiming,initial.sourceTiming,
  'genuine Python Apply must change only fingers, never source pitch/onset/release');
 assert.ok(after.generatedFingers>0,'real Python generated finger values must be applied');
 const downloadPromise=page.waitForEvent('download',{timeout:20000});
 await page.locator('#pianoMotionExportXML').click();
 const download=await downloadPromise;
 assert.match(download.suggestedFilename(),/-fingering\.musicxml$/);
 const exported=await readFile(await download.path(),'utf8');
 assert.match(exported,/play-along-user-fingering/);
 assert.match(exported,/<fingering>[1-5]<\/fingering>/);
 const roundtrip=await page.evaluate(xml=>{
  const score=window.__libraryV08.readMusicXML(xml,'roundtrip.musicxml');
  return {notes:score.tracks.flatMap(t=>t.notes).length,
   marked:score.tracks.flatMap(t=>t.notes).filter(n=>
    n.fingeringSource==='musicxml-user-export-unverified').length,
   author:score.tracks.flatMap(t=>t.notes).filter(n=>n.fingeringSource==='musicxml').length};
 },exported);
 assert.equal(roundtrip.notes,cohort.noteCount);
 assert.ok(roundtrip.marked>0);
 assert.equal(roundtrip.author,0,'generated notes must never become composer annotations');
 assert.deepEqual(pageErrors,[],'no JavaScript page crashes');
 console.log('LAUNCH01_REAL_BROWSER_PYODIDE_PASS',JSON.stringify({
  source:'CC-BY-SA-4.0:pinned-pig:au-clair-de-la-lune',
  sourceSHA256:fetched.sha256,midiSHA256:originalHash,
  originalNotes:initial.count,realBrowserWorker:true,
  officialPyodideModuleDownloaded:true,sourceMapping:true,
  physicalConflicts:review.blocked,exportedNotes:roundtrip.notes,
  unverifiedFingersOnReimport:roundtrip.marked,
  inputNoteTimingUnchanged:true,appliedFingers:after.generatedFingers,
  genuinePythonNoMock:true,independentPianistValidation:false
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
