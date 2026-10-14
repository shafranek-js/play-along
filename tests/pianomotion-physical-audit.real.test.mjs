/** P0-A1: genuine Chromium MIDI import/UI Apply, simulated conflicting Python output. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const name=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!name.startsWith(dist+path.sep)||!fs.existsSync(name)){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('content-type',name.endsWith('.js')?'application/javascript':
  name.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(name));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const browserErrors=[];page.on('pageerror',e=>browserErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest);
 const result=await page.evaluate(async()=>{
  // Valid format-0 SMF, two independent black/white keys held at the same time.
  const bytes=Uint8Array.from([
   77,84,104,100,0,0,0,6,0,0,0,1,1,224,
   77,84,114,107,0,0,0,21,
   0,0x90,60,90,0,0x90,64,90,
   0x81,0x70,0x80,60,0,0,0x80,64,0,0,0xff,0x2f,0
  ]);
  const song=await window.__libraryV08.songFromBuffer('two-key-chord.mid',bytes.buffer);
  window.__prototypeTest.loadSong(song);
  const source=JSON.stringify(song.tracks.map(t=>t.notes.map(n=>[n.pitch,n.start,n.duration])));
  const Native=window.Worker;
  let contradictory=true;
  window.Worker=class{
   constructor(){}terminate(){}
   postMessage(m){
    const notes=song.tracks[0].notes;
    const suggestions=notes.map((n,i)=>({pitch:n.pitch,start:n.start,
     end:n.start+n.duration,hand:'RH',finger:contradictory?2:[1,3][i]}));
    queueMicrotask(()=>this.onmessage({data:{id:m.id,type:'result',result:{
     total:suggestions.length,playable:2,unresolved:0,suggestions
    }}}));
   }
  };
  const calculate=document.getElementById('pianoMotionCalculate');
  const apply=document.getElementById('pianoMotionApply');
  const exportButton=document.getElementById('pianoMotionExportXML');
  calculate.click();await new Promise(resolve=>setTimeout(resolve,30));
  const warning=document.getElementById('pianoMotionStatus').textContent;
  const flagCount=document.querySelectorAll('.pianoMotionReviewRow.physicalConflict').length;
  apply.click();
  const afterBlocked=song.tracks[0].notes.filter(n=>n.finger!=null).length;
  const blockedExplanation=document.getElementById('pianoMotionStatus').textContent;
  const blockedExport=exportButton.disabled;
  contradictory=false;
  calculate.click();await new Promise(resolve=>setTimeout(resolve,30));
  const clear=document.querySelectorAll('.pianoMotionReviewRow.physicalConflict').length;
  apply.click();
  const afterSafe=song.tracks[0].notes.filter(n=>n.finger!=null).length;
  const safeExport=!exportButton.disabled;
  const sourceUnchanged=source===JSON.stringify(song.tracks.map(t=>
   t.notes.map(n=>[n.pitch,n.start,n.duration])));
  window.Worker=Native;
  return {noteCount:song.tracks[0].notes.length,warning,flagCount,afterBlocked,
   blockedExplanation,blockedExport,clear,afterSafe,safeExport,sourceUnchanged};
 });
 assert.deepEqual(browserErrors,[]);
 assert.equal(result.noteCount,2);
 assert.match(result.warning,/Физические противоречия: 2/);
 assert.equal(result.flagCount,2);
 assert.equal(result.afterBlocked,0);
 assert.match(result.blockedExplanation,/конфликтных 2/);
 assert.equal(result.blockedExport,true);
 assert.equal(result.clear,0);
 assert.equal(result.afterSafe,2);
 assert.equal(result.safeExport,true);
 assert.equal(result.sourceUnchanged,true);
 console.log('P0-A1 Chromium: two held keys on one finger rejected; nonconflicting fingers accepted; source events unchanged PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
