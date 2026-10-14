/**
 * LAUNCH-01 beta regression against ORIGINAL, immutable upstream piano scores.
 * This is a NONCOMMERCIAL, ephemeral source-integrity/browser-compatibility
 * smoke test; no third-party MIDI/MusicXML bytes are committed or deployed.
 *
 * The REAL MusicXML and paired MIDI are independently imported. We expressly
 * do NOT claim their note-by-note performance alignment is verified.
 * The simulated Worker returns an explicit runtime error, NOT invented fingers.
 * This checks crash recovery, source preservation and no accidental Apply.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {realCorpusManifest,validateRealCorpusManifest,gitBlobHash}
 from '../scripts/fingering-asap-real-score-audit.mjs';
import {auditScoreMidiParity} from '../src/core/launch01-midi-xml-parity.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dist=join(root,'dist');
const corpus=realCorpusManifest();
validateRealCorpusManifest(corpus);
const ids=['bach-prelude-846','schubert-moment-musical-3'];
const fields=['musicxml','midiScore'];
const MAX=3_000_000;
async function pinnedSource(piece,field){
 const meta=piece[field];
 const url='https://raw.githubusercontent.com/'+corpus.source.repository+
  '/'+corpus.source.revision+'/'+meta.path;
 const res=await fetch(url,{signal:AbortSignal.timeout(40_000),headers:{accept:'application/octet-stream'}});
 assert.equal(res.ok,true,meta.path+' HTTP');
 if(res.url)assert.equal(res.url,url,'the pinned source may not redirect');
 const data=Buffer.from(await res.arrayBuffer());
 assert.ok(data.length<=MAX,'source must be bounded');
 assert.equal(data.length,meta.bytes,'source byte count pinned');
 assert.equal(gitBlobHash(data),meta.blobSha,'source Git blob hash pinned');
 return data;
}
const server=http.createServer((req,res)=>{
 let name;
 try{name=new URL(req.url,'http://127.0.0.1').pathname}
 catch{res.writeHead(400);res.end();return}
 const file=resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const origin='http://127.0.0.1:'+server.address().port;
 const cases=[];
 for(const id of ids){
  const piece=corpus.cases.find(x=>x.id===id);
  assert.ok(piece,'must be frozen in the known ASAP manifest');
  const [scoreBytes,midiBytes]=await Promise.all(fields.map(x=>pinnedSource(piece,x)));
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(scoreBytes);
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__libraryV08?.readMusicXML&&
     window.__libraryV08?.songFromBuffer&&window.__prototypeTest,{timeout:20000});
   const observed=await page.evaluate(async ({id,xml,smf})=>{
    const score=window.__libraryV08.readMusicXML(xml,id+'.musicxml');
    const bytes=Uint8Array.from(smf);
    const midi=await window.__libraryV08.songFromBuffer(id+'.mid',bytes.buffer);
    const summarize=song=>({
     format:song.format,
     tracks:song.tracks?.length||0,
     notes:song.tracks?.reduce((n,t)=>n+t.notes.length,0)||0,
     audioEvents:song.audioEvents?.length||0,
     badTiming:song.tracks?.some(t=>t.notes.some(n=>!Number.isFinite(n.start)||
      !Number.isFinite(n.duration)||n.duration<=0||n.pitch<0||n.pitch>127))||false,
     warnings:score===song?song.warnings?.length||0:undefined
    });
    const first=summarize(score),second=summarize(midi);
    // Aggregate-only diagnostics: note multiplicity and event-clock variation.
    // This does NOT imply MusicXML/MIDI note identity.
    const scan=song=>song.tracks.flatMap(t=>t.notes).slice().sort((a,b)=>
      a.pitch-b.pitch||a.start-b.start||a.duration-b.duration);
    const notesXml=scan(score),notesMidi=scan(midi);
    const byPitch=notes=>Object.fromEntries([...new Set(notes.map(n=>n.pitch))]
      .sort((a,b)=>a-b).map(p=>[p,notes.filter(n=>n.pitch===p).length]));
    const clocks=notes=>({first:Math.min(...notes.map(n=>n.start)),
      last:Math.max(...notes.map(n=>n.start)),
      endsAt:Math.max(...notes.map(n=>n.start+n.duration))});
    const alignmentDiagnostics={pitchHistEqual:JSON.stringify(byPitch(notesXml))===
       JSON.stringify(byPitch(notesMidi)),
      xmlClock:clocks(notesXml),midiClock:clocks(notesMidi),
      firstPitchDifferences:Object.keys(byPitch(notesXml)).filter(k=>
        (byPitch(notesXml)[k]||0)!==(byPitch(notesMidi)[k]||0)).slice(0,10)};
    const before=JSON.stringify(midi.tracks.map(t=>t.notes.map(n=>
     [n.pitch,n.start,n.duration,n.velocity,n.channel,n.finger??null])));
    window.__prototypeTest.loadSong(midi);
    let launches=0;
    const OriginalWorker=window.Worker;
    window.Worker=class{
     constructor(){launches++}
     postMessage(m){
      queueMicrotask(()=>this.onmessage({data:{id:m.id,type:'error',
       reason:'PIANOMOTION_RUNTIME_FAILED'}}));
     }
     terminate(){}
    };
    const calculate=document.getElementById('pianoMotionCalculate');
    calculate.click();
    await new Promise(done=>setTimeout(done,100));
    const status=document.getElementById('pianoMotionStatus').textContent;
    const disabledApply=document.getElementById('pianoMotionApply').disabled;
    const disabledExport=document.getElementById('pianoMotionExportXML').disabled;
    const calculateAgainEnabled=!calculate.disabled;
    const after=JSON.stringify(midi.tracks.map(t=>t.notes.map(n=>
     [n.pitch,n.start,n.duration,n.velocity,n.channel,n.finger??null])));
    window.Worker=OriginalWorker;
    return {first,second,
      alignmentNotes:{
       score:notesXml.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration})),
       midi:notesMidi.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration}))
      },
      alignmentDiagnostics,warnings:score.warnings,
      launches,status,disabledApply,disabledExport,
      calculateAgainEnabled,sourceUnchanged:before===after,
      betaWarning:document.getElementById('pianoMotionBetaNotice')?.textContent||''};
   },{id,xml,smf:[...midiBytes]});
   assert.ok(observed.first.tracks>0,'real MusicXML contains parts');
   assert.ok(observed.second.tracks>0,'real MIDI has tracks');
   assert.ok(observed.first.notes>40,'real MusicXML has genuine playable notes');
   assert.ok(observed.second.notes>40,'real MIDI has genuine playable notes');
   assert.equal(observed.first.badTiming,false,'MusicXML importer must not make negative/zero notes');
   assert.equal(observed.second.badTiming,false,'MIDI importer must not make negative/zero notes');
   assert.ok(observed.second.audioEvents>0,'MIDI playback events preserved');
   assert.equal(observed.launches,1,'real imported piano song must start exactly one Worker');
   assert.match(observed.status,/PIANOMOTION_RUNTIME_FAILED/);
   assert.equal(observed.disabledApply,true,'failure must not allow guessed fingers');
   assert.equal(observed.disabledExport,true,'failure must not allow guessed export');
   assert.equal(observed.calculateAgainEnabled,true,'user may retry after runtime failure');
   assert.equal(observed.sourceUnchanged,true,'failure must not rewrite original score notes');
   assert.match(observed.betaWarning,/не проверена профессиональным пианистом/);
   assert.deepEqual(pageErrors,[],'no browser JavaScript errors');
   const parity=auditScoreMidiParity(observed.alignmentNotes.score,
    observed.alignmentNotes.midi,{toleranceSeconds:.02});
   assert.equal(parity.ok,true);
   assert.equal(parity.noteCountScore,observed.first.notes);
   assert.equal(parity.noteCountMidi,observed.second.notes);
   cases.push({caseId:id,musicXmlNotes:observed.first.notes,midiNotes:observed.second.notes,
    musicXmlWarnings:observed.first.warnings,
    warningReasons:observed.warnings,alignmentDiagnostics:observed.alignmentDiagnostics,
    noteTimeParity:parity,
    midiSourceProtected:true,workerRetryAfterError:true});
  }finally{await page.close()}
 }
 // Do not put the original copyrighted XML or MIDI bytes in stdout.
 console.log('LAUNCH-01: two ORIGINAL source-pinned real piano MIDI/MusicXML files imported; simulated Python failure recovered; source unchanged; no Apply/Export PASS',cases);
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
