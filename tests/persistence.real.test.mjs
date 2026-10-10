import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const xml=`<?xml version="1.0"?><score-partwise version="4.0">
<work><work-title>Persistent Piano Piece</work-title></work>
<movement-title>Persistent Piano Piece</movement-title>
<identification><creator type="composer">Play Along Test</creator></identification>
<part-list><score-part id="P1"><part-name>Right</part-name></score-part>
<score-part id="P2"><part-name>Left</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><pitch><step>F</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note></measure></part>
<part id="P2"><measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><type>whole</type></note></measure></part>
</score-partwise>`;
const secondXml=xml.replaceAll('Persistent Piano Piece','Second Piece').replaceAll('Play Along Test','Other Composer');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=path.resolve(dist,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1400,height:950}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__scoreTest);
 await page.locator('#importMusicInput').setInputFiles({name:'persistent.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await page.waitForFunction(()=>window.__libraryV08.collection.length===1&&window.__prototypeTest.song?.title==='Persistent Piano Piece');
 const initial=await page.evaluate(()=>({id:window.__prototypeTest.song.id,tracks:window.__prototypeTest.song.tracks.length}));
 assert.ok(initial.id.startsWith('saved-'),`unstable imported file ID: ${initial.id}`);
 assert.equal(initial.tracks,2);
 // A library index must not hold ArrayBuffers for every saved work.
 assert.equal(await page.evaluate(()=>window.__libraryV08.collection[0]?.data),undefined);
 assert.ok(await page.evaluate(()=>window.__libraryV08.collection[0]?.dataSize)>0);

 await page.locator('#trackSelect').selectOption('1');
 await page.locator('#bottomMode').selectOption('wait');
 await page.locator('#speed').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#allTracks').uncheck();
 await page.locator('#viewSheet').click();
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded,null,{timeout:25000});
 await page.locator('#sheetZoomIn').click();
 await page.locator('#sheetFollow').uncheck();
 await page.locator('#labels').uncheck();
 await page.locator('#volume').evaluate(el=>{el.value='27';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.waitForTimeout(300);
 const beforeSwitch=await page.evaluate(()=>({song:window.__prototypeTest.song?.id,preferences:window.__prototypeTest.state.songSettings[window.__prototypeTest.song.id]}));
 assert.equal(beforeSwitch.preferences.track,1);
 assert.equal(beforeSwitch.preferences.mode,'wait');
 assert.equal(beforeSwitch.preferences.speed,65);
 assert.equal(beforeSwitch.preferences.scoreView,'sheet');
 await page.locator('[data-page="library"]').first().click();
 await page.locator('#librarySourceSelect').selectOption('demo');
 await page.locator('#songList .libv8-main').first().click();
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.mode),'listen');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.speed),100);
 await page.locator('[data-page="library"]').first().click();
 await page.locator('#librarySourceSelect').selectOption('saved');
 await page.locator('#songList .libv8-main').first().click();
 await page.waitForFunction(()=>window.__prototypeTest.song?.title==='Persistent Piano Piece');
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded,null,{timeout:25000});
 const afterSwitch=await page.evaluate(()=>({id:window.__prototypeTest.song.id,mode:window.__prototypeTest.state.mode,track:window.__prototypeTest.state.track,speed:window.__prototypeTest.state.speed}));
 assert.equal(afterSwitch.id,initial.id);
 assert.equal(afterSwitch.mode,'wait');
 assert.equal(afterSwitch.track,1);
 assert.equal(afterSwitch.speed,65);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.song?.title==='Persistent Piano Piece',null,{timeout:25000});
 const restored=await page.evaluate(()=>({
   id:window.__prototypeTest.song.id,
   selected:window.__prototypeTest.state.selected,
   count:window.__libraryV08.collection.length,
   mode:window.__prototypeTest.state.mode,
   speed:window.__prototypeTest.state.speed,
   track:window.__prototypeTest.state.track,
   allTracks:window.__prototypeTest.state.allTracks,
   scoreView:window.__prototypeTest.state.scoreView,
   sheetZoom:window.__prototypeTest.state.sheetZoom,
   sheetFollow:window.__prototypeTest.state.sheetFollow,
   labels:window.__prototypeTest.state.labels,
   volume:window.__prototypeTest.state.volume,
   page:window.__prototypeTest.state.page,
   trackSelect:document.querySelector('#trackSelect').value,
   speedControl:document.querySelector('#speed').value,
 }));
 console.log('RESTORED AFTER RELOAD',restored);
 assert.equal(restored.id,initial.id);
 assert.equal(restored.selected,initial.id);
 assert.equal(restored.count,1);
 assert.equal(restored.mode,'wait');
 assert.equal(restored.speed,65);
 assert.equal(restored.track,1);
 assert.equal(restored.allTracks,false);
 assert.equal(restored.scoreView,'sheet');
 assert.equal(restored.sheetZoom,110);
 assert.equal(restored.sheetFollow,false);
 assert.equal(restored.labels,false);
 assert.equal(restored.volume,27);
 assert.equal(restored.trackSelect,'1');
 assert.equal(restored.speedControl,'65');
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded,null,{timeout:25000});
 assert.ok(await page.locator('#sheetCanvas svg path').count()>4);
 // Another upload must not overwrite the first song or its independent settings.
 await page.locator('#importMusicInput').setInputFiles({name:'second.musicxml',mimeType:'application/xml',buffer:Buffer.from(secondXml)});
 await page.waitForFunction(()=>window.__libraryV08.collection.length===2&&window.__prototypeTest.song?.title==='Second Piece');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.mode),'listen');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.speed),100);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.song?.title==='Second Piece');
 assert.equal(await page.evaluate(()=>window.__libraryV08.collection.length),2);
 // A complete portable backup can recreate the saved library after browser data is wiped.
 await page.locator('#speed').evaluate(el=>{el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.locator('#bottomMode').selectOption('tempo');
 await page.evaluate(()=>localStorage.setItem('playalong:smart:mastery:v07',JSON.stringify({testMastery:{value:88}})));
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#backupExport').click();
 const download=await downloadPromise;
 const backupData=fs.readFileSync(await download.path());
 const backup=JSON.parse(backupData.toString('utf8'));
 assert.equal(backup.format,'play-along-backup');
 assert.equal(backup.works.length,2);
 assert.equal(backup.settings.speed,75);
 assert.equal(backup.settings.mode,'tempo');
 assert.deepEqual(backup.smartMastery.testMastery,{value:88});
 assert.equal(await page.evaluate(async ()=>{const request=indexedDB.open('playalong-library-v08');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});await new Promise((resolve,reject)=>{const tx=db.transaction(['works','prefs'],'readwrite');tx.objectStore('works').clear();tx.objectStore('prefs').clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();localStorage.clear();return true}),true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.collection.length===0);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#backupFile').setInputFiles({name:'play-along-backup.json',mimeType:'application/json',buffer:backupData});
 await page.waitForFunction(()=>window.__libraryV08?.collection.length===2&&window.__prototypeTest?.song?.title==='Second Piece',null,{timeout:25000});
 const recovered=await page.evaluate(()=>({mode:window.__prototypeTest.state.mode,speed:window.__prototypeTest.state.speed,mastery:JSON.parse(localStorage.getItem('playalong:smart:mastery:v07'))}));
 assert.equal(recovered.mode,'tempo');assert.equal(recovered.speed,75);
 assert.equal(recovered.mastery.testMastery.value,88);
 // Reset Layout must never touch practice preferences.
 await page.locator('#resetUI').evaluate(el=>el.click());
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.mode),'tempo');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.speed),75);
 // Verify true 3/4 measure navigation, including the previous-measure button.
 const score34=`<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1440</duration><type>half</type><dot/></note></measure><measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>1440</duration><type>half</type><dot/></note></measure><measure number="3"><note><pitch><step>E</step><octave>4</octave></pitch><duration>1440</duration><type>half</type><dot/></note></measure></part></score-partwise>`;
 await page.evaluate(xml=>window.__prototypeTest.loadSong(window.__libraryV08.readMusicXML(xml,'meter-34.musicxml')),score34);
 await page.locator('#sheetBarNext').evaluate(el=>el.click());
 const atSecond=await page.evaluate(()=>window.__prototypeTest.pos);
 assert.ok(Math.abs(atSecond-1.5)<0.03,'3/4 next bar must land at 1.5 sec, got '+atSecond);
 await page.locator('#sheetBarBack').evaluate(el=>el.click());
 assert.ok(await page.evaluate(()=>window.__prototypeTest.pos)<0.01,'Previous bar should return to first bar');
 // More than thirty attempts must survive reload in IndexedDB.
 await page.evaluate(()=>{
  for(let i=0;i<35;i++){
   window.__prototypeTest.setMode('wait');
   window.__prototypeTest.play();
   window.__prototypeTest.receiveNoteOn(60);
   window.__prototypeTest.receiveNoteOff(60);
   window.__prototypeTest.finishPerformance('manual');
   window.__prototypeTest.pause();
  }
 });
 const countHistory=async()=>page.evaluate(async()=>{
  const request=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  try{
   const tx=db.transaction('performances','readonly'),q=tx.objectStore('performances').count();
   return await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  }finally{db.close()}
 });
 await page.waitForFunction(async()=>{
  const q=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  const count=await new Promise((resolve,reject)=>{const r=db.transaction('performances','readonly').objectStore('performances').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  db.close();return count>=35;
 },null,{timeout:25000});
 assert.ok(await countHistory()>=35,'Full attempt history did not reach IndexedDB');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.performances.length>=35,null,{timeout:15000});
 assert.ok(await page.evaluate(()=>window.__prototypeTest.performances.length)>=35,'History was truncated at 30 on reload');
 const fullBackupPromise=page.waitForEvent('download');
 await page.locator('#backupExport').click();
 const fullBackup=JSON.parse(fs.readFileSync(await (await fullBackupPromise).path(),'utf8'));
 assert.ok(fullBackup.performances.length>=35,'Backup contains only the legacy 30-attempt cache');
 console.log('PERFORMANCE HISTORY: 35+ attempts survive reload and export');
 assert.deepEqual(errors,[]);
 console.log('Persistence + backup round-trip + 3/4 navigation + layout-only reset: PASS');
} finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
