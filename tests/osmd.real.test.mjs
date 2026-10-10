import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const SCORE="<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<score-partwise version=\"4.0\">\n  <work><work-title>OSMD Acceptance Test</work-title></work><movement-title>OSMD Acceptance Test</movement-title>\n  <part-list><score-part id=\"P1\"><part-name>Right Hand</part-name></score-part><score-part id=\"P2\"><part-name>Left Hand</part-name></score-part></part-list>\n  <part id=\"P1\">\n   <measure number=\"1\"><attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>\n    <direction placement=\"above\"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo=\"120\"/></direction>\n    <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>\n    <note><rest/><duration>480</duration><type>quarter</type></note>\n    <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>\n    <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>\n    <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>\n   </measure>\n   <measure number=\"2\">\n    <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><type>whole</type></note>\n   </measure>\n  </part>\n  <part id=\"P2\">\n   <measure number=\"1\"><attributes><divisions>480</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>\n    <note><pitch><step>C</step><octave>3</octave></pitch><duration>960</duration><type>half</type></note>\n    <note><rest/><duration>960</duration><type>half</type></note>\n   </measure>\n   <measure number=\"2\"><note><rest measure=\"yes\"/><duration>1920</duration></note></measure>\n  </part>\n</score-partwise>";
function makeZip(name,contents){
 const nameBytes=Buffer.from(name),unpacked=Buffer.from(contents,'utf8'),packed=deflateRawSync(unpacked);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(unpacked.length,22);local.writeUInt16LE(nameBytes.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(unpacked.length,24);central.writeUInt16LE(nameBytes.length,28);
 const offset=local.length+nameBytes.length+packed.length;const tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50,0);tail.writeUInt16LE(1,8);tail.writeUInt16LE(1,10);tail.writeUInt32LE(central.length+nameBytes.length,12);tail.writeUInt32LE(offset,16);
 return Buffer.concat([local,nameBytes,packed,central,nameBytes,tail]);
}
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),file=path.resolve(dist,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:950}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.route('https://cdn.jsdelivr.net/**',r=>r.abort('blockedbyclient'));
 page.route('https://unpkg.com/**',r=>r.abort('blockedbyclient'));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__scoreTest&&window.__prototypeTest&&window.__libraryV08);
 assert.equal(await page.evaluate(()=>window.__playAlongVersion),'0.10.0');
 const zip=makeZip('score.musicxml',SCORE).toString('base64');
 const result=await page.evaluate(async ({xml,zip})=>{
   const arr=Uint8Array.from(atob(zip),c=>c.charCodeAt(0));
   const mxl=await window.__libraryV08.songFromBuffer('score.mxl',arr.buffer);
   const raw=window.__libraryV08.readMusicXML(xml,'score.musicxml');
   window.__prototypeTest.loadSong(mxl);
   window.__scoreTest.scoreSetView('sheet');
   return {mxlTracks:mxl.tracks.length,rawTracks:raw.tracks.length,notation:!!mxl.notationXML};
 },{xml:SCORE,zip});
 assert.equal(result.mxlTracks,2);
 assert.equal(result.rawTracks,2);
 assert.ok(result.notation);
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded||document.querySelector('#sheetStatus').textContent.includes('Ошибка'),null,{timeout:30000});
 const scoreState=await page.evaluate(()=>({
   status:document.querySelector('#sheetStatus').textContent,
   notice:document.querySelector('#sheetNotice').textContent,
   svgCount:document.querySelectorAll('#sheetCanvas svg').length,
   svgPaths:document.querySelectorAll('#sheetCanvas svg path').length,
   renderer:window.__scoreTest.renderer?.constructor?.name,
   cursorTimes:window.__scoreTest.cursorTimes.length,
   vendor:!!window.opensheetmusicdisplay?.OpenSheetMusicDisplay,
 }));
 console.log('REAL OSMD:',scoreState);
 assert.ok(scoreState.vendor,'The REAL OSMD browser library did not load');
 assert.ok(scoreState.svgCount>0&&scoreState.svgPaths>4,'Real OSMD failed to draw music');
 assert.ok(scoreState.cursorTimes>=3,'OSMD cursor indexing failed');
 assert.ok(!scoreState.status.includes('Ошибка'),scoreState.notice);
 await page.locator('#viewRoll').click();
 assert.equal(await page.locator('#rollWrap').isVisible(),true);
 await page.locator('#viewSheet').click();
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded);
 await page.locator('#sheetZoomIn').click();
 await page.waitForTimeout(350);
 assert.equal(await page.locator('#sheetZoomLabel').innerText(),'110%');
 await page.evaluate(()=>window.__prototypeTest.setMode('wait'));
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.hold===true);
 const before=await page.evaluate(()=>window.__prototypeTest.stats.hits);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 const active=await page.evaluate(()=>({hits:window.__prototypeTest.stats.hits,release:window.__prototypeTest.waitRelease,pos:window.__prototypeTest.pos}));
 assert.equal(active.hits,before+1);
 assert.ok(active.release);
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.stats.hits),before+1,'Held key incorrectly advances multiple notes');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(60));
 assert.equal(await page.evaluate(()=>window.__prototypeTest.waitRelease),null);
 await page.locator('#playBtn').click();
 assert.deepEqual(errors,[],'Browser Javascript errors');
 console.log('REAL OSMD + MXL + cursor + Wait: PASS');
} finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
