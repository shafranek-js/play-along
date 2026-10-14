/**
 * LAUNCH-01: user can cancel a long-running genuine Worker invocation,
 * and late responses cannot mutate the score / enable Apply or Export.
 * Browser is REAL Chromium; Worker only is a deterministic test double.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {resolve,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://127.0.0.1').pathname;
 const file=resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest);
 const outcome=await page.evaluate(async ()=>{
  const bytes=Uint8Array.from([
   77,84,104,100,0,0,0,6,0,0,0,1,1,224,
   77,84,114,107,0,0,0,13,
   0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
  ]);
  const song=await window.__libraryV08.songFromBuffer('cancel.mid',bytes.buffer);
  window.__prototypeTest.loadSong(song);
  const snapshot=JSON.stringify(song.tracks.map(t=>t.notes));
  const OriginalWorker=window.Worker,created=[];
  window.Worker=class{
   terminated=false;
   constructor(){created.push(this)}
   postMessage(m){this.message=m}
   terminate(){this.terminated=true}
  };
  const calculate=document.getElementById('pianoMotionCalculate');
  const cancel=document.getElementById('pianoMotionCancel');
  const apply=document.getElementById('pianoMotionApply');
  const exportButton=document.getElementById('pianoMotionExportXML');
  calculate.click();
  const started={count:created.length,calculateDisabled:calculate.disabled,
   cancelVisible:!cancel.hidden,cancelEnabled:!cancel.disabled};
  cancel.click();
  const aborted={terminated:created[0]?.terminated,
   calculateEnabled:!calculate.disabled,cancelHidden:cancel.hidden,
   cancelDisabled:cancel.disabled,status:document.getElementById('pianoMotionStatus').textContent};
  // The browser may have queued a result BEFORE termination: ignore it.
  created[0].onmessage?.({data:{id:created[0].message.id,type:'result',
   result:{total:1,playable:1,unresolved:0,
    suggestions:[{pitch:60,start:0,end:.5,hand:'RH',finger:1}]}}});
  const ignored={applyDisabled:apply.disabled,exportDisabled:exportButton.disabled,
   status:document.getElementById('pianoMotionStatus').textContent,
   songUnchanged:JSON.stringify(song.tracks.map(t=>t.notes))===snapshot};
  window.Worker=class{
   constructor(){created.push(this)}
   postMessage(m){
    const n=song.tracks[0].notes[0];
    queueMicrotask(()=>this.onmessage({data:{id:m.id,type:'result',
     result:{total:1,playable:1,unresolved:0,
      suggestions:[{pitch:n.pitch,start:n.start,end:n.start+n.duration,
       hand:'RH',finger:3,disposition:'played'}]}}}));
   }
   terminate(){}
  };
  calculate.click();
  await new Promise(ok=>setTimeout(ok,40));
  const retried={workersCreated:created.length,
   suggestionVisible:!document.getElementById('pianoMotionReview').hidden,
   canApply:!apply.disabled,cancelHidden:cancel.hidden,
   unchangedBeforeApply:JSON.stringify(song.tracks.map(t=>t.notes))===snapshot};
  window.Worker=OriginalWorker;
  return {started,aborted,ignored,retried};
 });
 assert.deepEqual(errors,[]);
 assert.deepEqual(outcome.started,{count:1,calculateDisabled:true,
  cancelVisible:true,cancelEnabled:true});
 assert.equal(outcome.aborted.terminated,true);
 assert.equal(outcome.aborted.calculateEnabled,true);
 assert.equal(outcome.aborted.cancelHidden,true);
 assert.equal(outcome.aborted.cancelDisabled,true);
 assert.match(outcome.aborted.status,/отменён/);
 assert.equal(outcome.ignored.applyDisabled,true);
 assert.equal(outcome.ignored.exportDisabled,true);
 assert.equal(outcome.ignored.status,outcome.aborted.status);
 assert.equal(outcome.ignored.songUnchanged,true);
 assert.deepEqual(outcome.retried,{workersCreated:2,
  suggestionVisible:true,canApply:true,cancelHidden:true,unchangedBeforeApply:true});
 console.log('LAUNCH-01 Chromium: cancel long PianoMotion Worker, suppress stale results, retry successfully, preserve MIDI PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
