import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const f=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',f.endsWith('.js')?'text/javascript':
  f.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(f));
});
const xml=(marker)=>'<score-partwise version="4.0">'+
 '<work><work-title>Author Provenance</work-title></work>'+
 '<movement-title>Author Provenance</movement-title>'+
 '<identification><creator type="composer">Composer</creator>'+
 (marker?'<miscellaneous><miscellaneous-field name="play-along-user-fingering">'+
 'User-edited numeric fingering, not original composer notation</miscellaneous-field></miscellaneous>':'')+
 '</identification>'+
 '<part-list><score-part id="P1"><part-name>Right hand</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 '<note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration>'+
 '<voice>1</voice><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations></note>'+
 '<note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration>'+
 '<voice>1</voice><staff>1</staff><notations><technical><fingering>2</fingering></technical></notations></note>'+
 '</measure><measure number="2">'+
 '<note><pitch><step>F</step><octave>4</octave></pitch><duration>1920</duration><tie type="start"/>'+
 '<voice>1</voice><staff>1</staff></note></measure><measure number="3">'+
 '<note><pitch><step>F</step><octave>4</octave></pitch><duration>1920</duration><tie type="stop"/>'+
 '<voice>1</voice><staff>1</staff><notations><technical><fingering>4</fingering></technical>'+
 '<tied type="stop"/></notations></note></measure></part></score-partwise>';
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__fingerGuideTest);
 const pair=await page.evaluate(({authored,edited})=>{
  const load=(src)=>{
   const song=window.__libraryV08.readMusicXML(src,'provenance-test.musicxml');
   window.__prototypeTest.loadSong(song);
   return {
    sources:song.tracks.flatMap(t=>t.notes.map(n=>({
     id:n.noteId,pitch:n.pitch,finger:n.finger??null,hand:n.hand??null,
     source:n.fingeringSource??null,segments:n.sourceNoteIds
    }))),
    events:song.audioEvents.map(e=>({
     type:e.type,time:e.time,pitch:e.pitch,velocity:e.velocity,noteId:e.noteId
    })),
    steps:window.__fingerGuideTest.steps,
    warning:song.warnings.some(w=>w.includes('пользовательских правках'))
   };
  };
  return {authored:load(authored),edited:load(edited)};
 },{authored:xml(false),edited:xml(true)});
 assert.equal(pair.authored.sources.length,3,'Two ordinary notes and one merged tied note');
 assert.equal(pair.edited.sources.length,3);
 assert.equal(pair.authored.sources[2].segments.length,2,'Tie merged as one MIDI-held note');
 assert.deepEqual(pair.authored.sources.map(n=>[n.id,n.pitch,n.finger,n.hand]),
  pair.edited.sources.map(n=>[n.id,n.pitch,n.finger,n.hand]),
  'User export does not change the visible numbers, IDs or pitches');
 assert.deepEqual(pair.authored.events,pair.edited.events,'Source MIDI timeline is exactly unchanged');
 assert.deepEqual(pair.authored.sources.map(x=>x.source),['musicxml','musicxml','musicxml']);
 assert.deepEqual(pair.edited.sources.map(x=>x.source),[
  'musicxml-user-export-unverified',
  'musicxml-user-export-unverified',
  'musicxml-user-export-unverified'
 ],'Even tie-stop-only author-like digits are unverified after user export');
 assert.ok(pair.authored.steps.length>=2,'Original authored score provides source-author steps');
 assert.equal(pair.edited.steps.length,0,'No learner hand/numeric guidance from unverified user-export XML');
 assert.equal(pair.edited.warning,true);
 assert.equal(pair.authored.warning,false);
 assert.deepEqual(errors,[]);
 console.log('FG-04D1 Chromium: original MusicXML fingers remain authored; marked user-export digits including merged ties are unverified, no learner guidance, original MIDI unchanged PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
