/**
 * FG-04D2 deterministic real-Chromium integration:
 * Format-1 guitar + flute MIDI (547 selected guitar notes), short notes,
 * same-onset guitar chords, calculated preview -> Apply -> XML download ->
 * independent re-import. The actual Python runtime is NOT exercised here;
 * its audited note-identity adapter has separate pure tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const u16=n=>[(n>>>8)&255,n&255];
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function vlq(n){
 const bytes=[n&127];while((n>>=7)>0)bytes.unshift((n&127)|128);
 return bytes;
}
function smf(){
 const guitar=[{tick:0,priority:0,b:[0xff,0x03,0x0f,...Buffer.from('Acoustic Guitar')]},
  {tick:0,priority:0,b:[0xc0,24]}];
 for(let i=0;i<547;i++){
  // Multi-note chords, fast repetitions and independent durations.
  const tick=Math.floor(i/9)*2160+(i%9===0?0:(i%9)*240);
  const pitch=48+(i%27);
  const duration=i%11===0?28:i%7===0?55:170;
  guitar.push({tick,priority:2,b:[0x90,pitch,90]});
  guitar.push({tick:tick+duration,priority:1,b:[0x80,pitch,0]});
 }
 const flute=[{tick:0,priority:0,b:[0xff,0x03,0x05,...Buffer.from('Flute')]},
  {tick:0,priority:0,b:[0xc1,73]}];
 for(let i=0;i<12;i++){
  flute.push({tick:i*1100,priority:2,b:[0x91,100+i%7,85]});
  flute.push({tick:i*1100+350,priority:1,b:[0x81,100+i%7,0]});
 }
 const encode=events=>{
  events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority);
  const body=[];let last=0;
  for(const e of events){body.push(...vlq(e.tick-last),...e.b);last=e.tick}
  body.push(0,0xff,0x2f,0);
  return [...Buffer.from('MTrk'),...u32(body.length),...body];
 };
 return Uint8Array.from([...Buffer.from('MThd'),...u32(6),...u16(1),...u16(2),
  ...u16(480),...encode(guitar),...encode(flute)]);
}
const midi=smf();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':file.endsWith('.xml')?'application/xml':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest);
 const result=await page.evaluate(async input=>{
  const arr=Uint8Array.from(input);
  const song=await window.__libraryV08.songFromBuffer('guitar-flute.mid',arr.buffer);
  window.__prototypeTest.loadSong(song);
  const snapshot=JSON.stringify(song.tracks.map(t=>t.notes.map(n=>
   [n.pitch,n.start,n.duration,n.velocity,n.channel])));
  const tracksBefore=song.tracks.map(t=>({name:t.name,count:t.notes.length}));
  const NativeWorker=window.Worker;
  let analysisRequests=0,derivedBytes=0;
  window.Worker=class{
   constructor(){}terminate(){}
   postMessage(request){
    analysisRequests++;
    derivedBytes=request.midiBytes.byteLength;
    const notes=song.tracks[0].notes;
    const suggestions=notes.map(n=>({pitch:n.pitch,start:n.start,
      end:n.start+n.duration,hand:n.pitch<60?'LH':'RH',
      finger:1+n.pitch%5,disposition:'played'}));
    queueMicrotask(()=>this.onmessage({data:{id:request.id,type:'result',
      result:{total:suggestions.length,playable:suggestions.length,unresolved:0,
       suggestions,sourceNoteMappingVerified:true}}}));
   }
  };
  document.getElementById('pianoMotionCalculate').click();
  await new Promise(ok=>setTimeout(ok,50));
  const statusBefore=document.getElementById('pianoMotionStatus').textContent;
  const apply=document.getElementById('pianoMotionApply');
  const exportButton=document.getElementById('pianoMotionExportXML');
  const applyEnabled=!apply.disabled,exportInitiallyDisabled=exportButton.disabled;
  apply.click();
  const appliedCount=song.tracks[0].notes.filter(n=>Number.isInteger(n.finger)).length;
  const didNotAssignFlute=song.tracks[1].notes.every(n=>n.finger==null);
  const exportEnabled=!exportButton.disabled;
  const originalCreate=URL.createObjectURL;
  const nativeClick=HTMLAnchorElement.prototype.click;
  let promise=null;
  URL.createObjectURL=blob=>{promise=blob.text();return 'blob:test'};
  HTMLAnchorElement.prototype.click=function(){
   if(!this.download?.endsWith('-fingering.musicxml'))nativeClick.call(this);
  };
  exportButton.click();
  const xml=promise?await promise:null;
  URL.createObjectURL=originalCreate;
  HTMLAnchorElement.prototype.click=nativeClick;
  const sourceUnchanged=JSON.stringify(song.tracks.map(t=>t.notes.map(n=>
   [n.pitch,n.start,n.duration,n.velocity,n.channel])))===snapshot;
  const imported=xml?window.__libraryV08.readMusicXML(xml,'roundtrip.musicxml'):null;
  const reimportNotes=imported?.tracks.flatMap(t=>t.notes)||[];
  window.Worker=NativeWorker;
  return {
   tracksBefore,analysisRequests,derivedBytes,statusBefore,applyEnabled,
   exportInitiallyDisabled,appliedCount,didNotAssignFlute,exportEnabled,
   sourceUnchanged,xmlHasMarker:!!xml?.includes('name="play-along-user-fingering"'),
   xmlHasGeneratedDigits:!!xml?.includes('<fingering>'),
   scoreNoteCount:reimportNotes.length,
   scoreUnverifiedCount:reimportNotes.filter(n=>
    n.fingeringSource==='musicxml-user-export-unverified').length,
   scoreAuthoredCount:reimportNotes.filter(n=>n.fingeringSource==='musicxml').length,
   selectedOnly:reimportNotes.every(n=>n.pitch<90),
   hasProvenanceWarning:!!imported?.warnings?.some(n=>n.includes('пользовательских правках')),
   exportLength:xml?.length||0
  };
 },[...midi]);
 assert.deepEqual(errors,[],'no browser JS runtime errors');
 assert.equal(result.tracksBefore[0].count,547,'source guitar track is complete');
 assert.equal(result.tracksBefore[1].count,12,'flute has its own track');
 assert.equal(result.analysisRequests,1,'only one PianoMotion worker request');
 assert.ok(result.derivedBytes>20,'guitar is processed as one temporary piano MIDI');
 assert.match(result.statusBefore,/547 нот/);
 assert.equal(result.applyEnabled,true,'all 547 source notes must align');
 assert.equal(result.exportInitiallyDisabled,true,'export needs Apply');
 assert.equal(result.appliedCount,547,'all source guitar notes assigned');
 assert.equal(result.didNotAssignFlute,true,'other instrument remains unchanged');
 assert.equal(result.exportEnabled,true,'export enabled after Apply');
 assert.equal(result.sourceUnchanged,true,'source timing/pitch/velocity unchanged');
 assert.equal(result.xmlHasMarker,true,'export declares generated fingers');
 assert.equal(result.xmlHasGeneratedDigits,true);
 assert.equal(result.scoreNoteCount,547,'reimport retains every selected guitar note');
 assert.equal(result.scoreUnverifiedCount,547,'reimport does NOT treat generated fingers as author');
 assert.equal(result.scoreAuthoredCount,0);
 assert.equal(result.selectedOnly,true,'foreign flute excluded from piano score');
 assert.equal(result.hasProvenanceWarning,true);
 console.log('FG-04D2 real Chromium: 547-note guitar + flute MIDI -> calculate mock -> apply -> XML -> reimport unverified; source timing preserved PASS',result);
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
