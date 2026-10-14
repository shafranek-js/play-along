/**
 * LAUNCH-02: actual production Chromium fingering review UX.
 * The Python Worker is deterministic test double; the real Python execution
 * and score identity adapter have independent real-Pyodide browser gates.
 * Verify that ineligible notes cannot be selected or silently applied.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const vlq=n=>{const result=[n&127];while((n>>=7)>0)result.unshift((n&127)|128);return result};
function midi(){
 const events=[];
 const note=(pitch,start,end)=>{
  events.push({at:start,order:1,bytes:[0x90,pitch,90]});
  events.push({at:end,order:0,bytes:[0x80,pitch,0]});
 };
 note(60,0,240);note(64,0,240);note(67,480,720);
 note(72,960,1200);note(74,1440,1680);
 events.sort((a,b)=>a.at-b.at||a.order-b.order);
 const track=[];let prev=0;
 for(const event of events){track.push(...vlq(event.at-prev),...event.bytes);prev=event.at}
 track.push(0,0xff,0x2f,0);
 return Uint8Array.from([
  77,84,104,100,0,0,0,6,0,0,0,1,1,224,
  77,84,114,107,...u32(track.length),...track,
 ]);
}
const server=http.createServer((request,response)=>{
 const uri=new URL(request.url,'http://127.0.0.1').pathname;
 const file=path.resolve(dist,'.'+(uri==='/'?'/index.html':uri));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  response.writeHead(404);response.end('not found');return;
 }
 response.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest);
 const info=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('launch02-review.mid',new Uint8Array(bytes).buffer);
  window.__prototypeTest.loadSong(song);
  const notes=song.tracks[0].notes;
  if(notes.length!==5)throw Error('Fixture needs 5 independently parsed MIDI notes: '+notes.length);
  // Source annotation is simulated only to test the protected-author UI.
  notes[2].finger=2;notes[2].hand='RH';notes[2].fingeringSource='musicxml';
  const originalTiming=JSON.stringify(song.tracks.flatMap(t=>t.notes.map(n=>[n.pitch,n.start,n.duration])));
  const originalEvents=JSON.stringify(song.audioEvents);
  const RealWorker=window.Worker;
  window.__launch02Review={song,RealWorker,originalTiming,originalEvents};
  window.Worker=class{
   postMessage(message){
    const suggestions=notes.map((n,i)=>({
     pitch:n.pitch,start:n.start,end:n.start+n.duration,
     hand:i===4?'LH':'RH',finger:i===3?null:i===4?3:i===2?2:1,
    }));
    queueMicrotask(()=>this.onmessage?.({data:{
     id:message.id,type:'result',result:{
      total:suggestions.length,playable:4,unresolved:1,suggestions,
     }
    }}));
   }
   terminate(){}
  };
  return {pitches:notes.map(n=>n.pitch),originalTiming};
 },[...midi()]);
 assert.deepEqual(info.pitches,[60,64,67,72,74]);
 await page.evaluate(()=>document.getElementById('pianoMotionCalculate').click());
 await page.waitForFunction(()=>!document.getElementById('pianoMotionReview').hidden,null,{timeout:15000});
 const initial=await page.evaluate(()=>{
  const root=document.getElementById('pianoMotionReview');
  return {summary:document.getElementById('pianoMotionReviewStats').textContent,
   rows:[...root.querySelectorAll('.pianoMotionReviewRow')].map(row=>({
    status:row.dataset.reviewStatus,disabled:row.querySelector('input').disabled,
   })),
   applyDisabled:document.getElementById('pianoMotionApply').disabled,
  };
 });
 assert.deepEqual(initial.rows.map(r=>r.status),
  ['conflict','conflict','protected','unresolved','eligible']);
 assert.deepEqual(initial.rows.map(r=>r.disabled),[true,true,true,true,false]);
 assert.match(initial.summary,/Применимо: 1/);
 assert.match(initial.summary,/защищено: 1/);
 assert.match(initial.summary,/конфликты: 2/);
 assert.match(initial.summary,/без пальца: 1/);
 assert.equal(initial.applyDisabled,false);

 await page.evaluate(()=>document.getElementById('pianoMotionSelectAll').click());
 const selected=await page.evaluate(()=>[...document.querySelectorAll('.pianoMotionReviewRow input:checked')].map(input=>
  [...input.closest('.pianoMotionReviewList').querySelectorAll('.pianoMotionReviewRow')].indexOf(input.closest('.pianoMotionReviewRow'))));
 assert.deepEqual(selected,[4],'select all eligible must not check protected, blocked or unresolved notes');
 assert.equal(await page.locator('#pianoMotionApplySelected').isEnabled(),true);
 await page.evaluate(()=>document.getElementById('pianoMotionApplySelected').click());
 const committed=await page.evaluate(()=>{
  const {song,originalTiming,originalEvents}=window.__launch02Review;
  const notes=song.tracks[0].notes;
  return {
   fingers:notes.map(n=>n.finger??null),
   sources:notes.map(n=>n.fingeringSource??null),
   sourceTimingUnchanged:originalTiming===JSON.stringify(song.tracks.flatMap(t=>t.notes.map(n=>[n.pitch,n.start,n.duration]))),
   sourceEventsUnchanged:originalEvents===JSON.stringify(song.audioEvents),
   selectedCount:document.querySelectorAll('.pianoMotionReviewRow input:checked').length,
   eligibleButtonDisabled:document.getElementById('pianoMotionSelectAll').disabled,
   bulkApplyDisabled:document.getElementById('pianoMotionApply').disabled,
   appliedRow:document.querySelectorAll('.pianoMotionReviewRow')[4].dataset.reviewStatus,
   summary:document.getElementById('pianoMotionReviewStats').textContent,
  };
 });
 assert.deepEqual(committed.fingers,[null,null,2,null,3]);
 assert.equal(committed.sources[2],'musicxml');
 assert.equal(committed.sources[4],'pianomotion');
 assert.equal(committed.sourceTimingUnchanged,true);
 assert.equal(committed.sourceEventsUnchanged,true);
 assert.equal(committed.selectedCount,0);
 assert.equal(committed.eligibleButtonDisabled,true);
 assert.equal(committed.bulkApplyDisabled,true);
 assert.equal(committed.appliedRow,'applied');
 assert.match(committed.summary,/уже применено: 1/);
 await page.evaluate(()=>document.getElementById('pianoMotionUndo').click());
 const undo=await page.evaluate(()=>{
  const {song}=window.__launch02Review;
  return {finger:song.tracks[0].notes[4].finger??null,
   selectable:document.querySelectorAll('.pianoMotionReviewRow')[4].dataset.reviewStatus,
   summary:document.getElementById('pianoMotionReviewStats').textContent};
 });
 assert.equal(undo.finger,null);
 assert.equal(undo.selectable,'eligible');
 assert.match(undo.summary,/Применимо: 1/);
 await page.evaluate(()=>document.getElementById('pianoMotionRedo').click());
 assert.equal(await page.evaluate(()=>window.__launch02Review.song.tracks[0].notes[4].finger),3);
 await page.evaluate(()=>{window.Worker=window.__launch02Review.RealWorker});
 assert.deepEqual(errors,[],'no browser page errors');
 console.log('LAUNCH02_FINGERING_REVIEW_PASS',JSON.stringify({
  statuses:initial.rows,selectable:1,protected:1,blocked:2,unresolved:1,
  sourceUnaffected:true,atomicUndoRedo:true,physicalPianistValidated:false,
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
