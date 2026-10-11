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
 await page.waitForFunction(()=>window.__scoreTest&&window.__prototypeTest&&window.__libraryV08,null,{timeout:5000}).catch(async err=>{
   console.log('BOOT ERRORS:',errors);
   console.log('BACKUP CONTROL COUNT:',await page.locator('#backupExport').count());
   console.log('PAGE DIAGNOSTIC:',await page.evaluate(()=>({ready:document.readyState,script:!!document.querySelector('script[src*="app.js"]'),state:typeof window.__prototypeTest,library:typeof window.__libraryV08})));
   throw err;
 });
 assert.equal(await page.evaluate(()=>window.__playAlongVersion),JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
 const zip=makeZip('score.musicxml',SCORE).toString('base64');
 const result=await page.evaluate(async ({xml,zip})=>{
   const arr=Uint8Array.from(atob(zip),c=>c.charCodeAt(0));
   const mxl=await window.__libraryV08.songFromBuffer('score.mxl',arr.buffer);
   const raw=window.__libraryV08.readMusicXML(xml,'score.musicxml');
   window.__prototypeTest.loadSong(mxl);
   window.__scoreTest.scoreSetView('sheet');
   return {mxlTracks:mxl.tracks.length,rawTracks:raw.tracks.length,notation:!!mxl.notationXML};
 },{xml:SCORE,zip});
 // Reject malformed central directories and compressed payloads that attempt
 // to inflate beyond the declared safe limit (ZIP bomb with forged size).
 const malformed=Buffer.from(makeZip('score.musicxml',SCORE));
 malformed.fill(0,malformed.length-22); // invalidate end-of-central-directory
 const forged=(name)=>{
  const zip=makeZip(name,'X'.repeat(16*1024*1024));
  const nameLength=Buffer.byteLength(name),central=30+nameLength+zip.readUInt32LE(18);
  zip.writeUInt32LE(1,central+24); // lie about raw size to exercise streaming limit
  return zip.toString('base64');
 };
 const hostile=await page.evaluate(async ({broken,mxl,mscz})=>{
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
  const attempt=async(fn,data)=>{try{await fn(decode(data));return 'ACCEPTED'}catch(e){return String(e?.message||e)}};
  return {
   malformedMXL:await attempt(window.__libraryV08.zipUnpackMXL,broken),
   malformedMSCZ:await attempt(window.__libraryV08.zipUnpackMuseScore,broken),
   oversizedMXL:await attempt(window.__libraryV08.zipUnpackMXL,mxl),
   oversizedMSCZ:await attempt(window.__libraryV08.zipUnpackMuseScore,mscz),
  };
 },{broken:malformed.toString('base64'),mxl:forged('score.musicxml'),mscz:forged('bad.mscx')});
 console.log('ARCHIVE REJECTION:',hostile);
 for(const [scenario,result] of Object.entries(hostile))
  assert.notEqual(result,'ACCEPTED',scenario+' incorrectly accepted a hostile archive');
 assert.match(hostile.oversizedMXL,/лимит|большой|превышает/i);
 assert.match(hostile.oversizedMSCZ,/лимит|большой|превышает/i);
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
 // Verify physical articulation rather than waiting for unrelated key releases.
 await page.locator('#viewRoll').click();
 await page.evaluate(()=>{
  const notes=[60,62,64,64,67,69].map((pitch,i)=>({
   pitch,start:i*.65,duration:.45,velocity:82,track:0
  }));
  window.__prototypeTest.loadSong({
   id:'legato-ci',title:'Legato CI',author:'CI',type:'demo',tempo:120,
   tracks:[{name:'Melody',notes}]
  });
  window.__prototypeTest.setMode('wait');window.__prototypeTest.play();
 });
 await page.waitForFunction(()=>window.__prototypeTest.hold===true);
 const hits=()=>page.evaluate(()=>window.__prototypeTest.stats.hits);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 assert.equal(await hits(),1);
 // C stays held throughout D and E: successive new pitches must count.
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(62));
 assert.equal(await hits(),2,'Legato note D missed while C held');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.equal(await hits(),3,'Early E missed while D held');
 // Repeating E without releasing it is NOT a new physical press.
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.equal(await hits(),3,'Held E advanced repeated note');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(64));
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.equal(await hits(),4,'Rearticulated E not scored');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(67));
 assert.equal(await hits(),5);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(69));
 assert.equal(await hits(),6);
 await page.evaluate(()=>{
  for(const note of [60,62,64,67,69])window.__prototypeTest.receiveNoteOff(note);
  window.__prototypeTest.pause();
  window.__prototypeTest.loadSong({
   id:'chord-ci',title:'Chord CI',author:'CI',type:'demo',tempo:120,
   tracks:[{name:'Chords',notes:[
    ...[60,64,67].map(pitch=>({pitch,start:0,duration:.8,velocity:80,track:0})),
    {pitch:69,start:1,duration:.8,velocity:80,track:0}
   ]}]
  });
  window.__prototypeTest.setMode('wait');window.__prototypeTest.play();
 });
 await page.waitForFunction(()=>window.__prototypeTest.hold===true);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.equal(await hits(),2,'Partial chord must count two voices only');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(67));
 assert.equal(await hits(),3,'Full chord must count all notes');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(69));
 assert.equal(await hits(),4,'Legato after completed chord must count next note');
 await page.evaluate(()=>{for(const n of [60,64,67,69])window.__prototypeTest.receiveNoteOff(n);window.__prototypeTest.pause()});
 // Polyphony regression: unison voices with the same pitch/onset are
 // one physical key press. Distinct chord keys still need their own presses.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'tempo-unison-ci',title:'Polyphonic unison',author:'CI',type:'demo',tempo:120,
   tracks:[{name:'Unison and chord',notes:[
    {pitch:60,start:0,duration:.5,velocity:80,track:0},
    {pitch:60,start:0,duration:1,velocity:80,track:0},
    {pitch:64,start:0,duration:.5,velocity:80,track:0},
    {pitch:60,start:1.5,duration:.5,velocity:80,track:0}
   ]}]
  });
  window.__prototypeTest.setMode('tempo');window.__prototypeTest.play();
 });
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 assert.equal(await hits(),2,'Tempo must credit both C4 voices from one physical press');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.performedNoteRefs.length),2,
  'Both performed unison voices must light up on the Piano Roll');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 assert.equal(await hits(),2,'Held-key repeat must not credit another note');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 const polyAfterChord=await page.evaluate(()=>window.__prototypeTest.stats);
 assert.equal(polyAfterChord.hits,3,'The E4 key must complete the chord');
 assert.equal(polyAfterChord.goodChords,1,'Unison voices should not create extra chord grades');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(60));
 const unisonReleases=await page.evaluate(()=>{
  const notes=window.__prototypeTest.session.all.filter(n=>n.pitch===60&&n.start===0);
  return notes.map(n=>({off:n.off,ratio:n.holdRatio,graded:n.durationErrorMs!==null}));
 });
 assert.equal(unisonReleases.length,2);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.performedNoteRefs.length),1,
  'Releasing the unison key must preserve only the still-held E4 highlighting');
 assert.ok(unisonReleases.every(n=>n.off&&n.graded&&Number.isFinite(n.ratio)),
  'A single C4 NoteOff must evaluate both held unison voices');
 assert.equal(await hits(),3,'Releasing C4 must not create another onset');
 await page.evaluate(()=>{
  window.__prototypeTest.receiveNoteOff(64);
  window.__prototypeTest.pause();
  const session=window.__prototypeTest.session;
  session.seek(0);
  session.inputOn(60,0,1000);
  session.inputOff(60,.5);
  session.inputOn(60,1.5,2500);
 });
 const repeats=await page.evaluate(()=>({
  hits:window.__prototypeTest.stats.hits,
  later:window.__prototypeTest.session.all.find(n=>n.pitch===60&&n.start===1.5)?.hit
 }));
 assert.equal(repeats.hits,3,'Later C4 must require and accept a separate NoteOn');
 assert.equal(repeats.later,true);
 await page.evaluate(()=>{
  const song=window.__prototypeTest.song;
  window.__prototypeTest.setMode('wait');
  window.__prototypeTest.play();
 });
 await page.waitForFunction(()=>window.__prototypeTest.hold===true);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 assert.equal(await hits(),2,'Wait must credit both simultaneous C4 voices');
 await page.evaluate(()=>{window.__prototypeTest.receiveNoteOff(60);window.__prototypeTest.pause()});
 // A08: A held note must be closed when transport pauses. Releasing
 // the physical key after pause cannot leave stale duration measurements,
 // even if the following note uses that same pitch.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'paused-noteoff-fixture',title:'Pause lifecycle',type:'demo',tempo:120,
   tracks:[{name:'Piano',notes:[
    {pitch:60,start:0,duration:.5,velocity:80,track:0},
    {pitch:60,start:2,duration:.5,velocity:80,track:0}
   ]}]
  });
  window.__prototypeTest.setMode('tempo');
  window.__prototypeTest.play();
  window.__prototypeTest.receiveNoteOn(60);
  window.__prototypeTest.pause();
 });
 const closedAtPause=await page.evaluate(()=>({
  active:window.__prototypeTest.session.played.size,
  first:window.__prototypeTest.session.all[0].off
 }));
 assert.deepEqual(closedAtPause,{active:0,first:true},
  'Pausing must close and clear the first held note');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(60));
 assert.equal(await page.evaluate(()=>window.__prototypeTest.session.played.size),0,
  'Key-up after pause must not leave stale measurements');
 await page.evaluate(()=>{
  window.__prototypeTest.play();
  window.__prototypeTest.receiveNoteOn(60);
  window.__prototypeTest.receiveNoteOff(60);
  window.__prototypeTest.pause();
 });
 assert.equal(await page.evaluate(()=>window.__prototypeTest.session.played.size),0);
 // A09: accompaniment on exactly the same musical downbeat must start
 // when the player accepts that group, even if the following note is legato.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'wait-accompaniment-ci',title:'Accompaniment downbeats',author:'CI',type:'demo',tempo:120,
   tracks:[
    {name:'Played',notes:[
     {pitch:60,start:0,duration:.5,velocity:90,track:0},
     {pitch:62,start:2,duration:.5,velocity:90,track:0}
    ]},
    {name:'Accompaniment',notes:[
     {pitch:48,start:0,duration:1,velocity:90,track:1},
     {pitch:50,start:2,duration:1,velocity:90,track:1}
    ]}
   ]
  });
  const box=document.querySelector('#accompany');
  box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  window.__prototypeTest.setMode('wait');
  window.__prototypeTest.play();
 });
 await page.waitForFunction(()=>window.__prototypeTest.hold===true);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 await page.waitForTimeout(70);
 let voices=await page.evaluate(()=>window.__prototypeTest.scheduledVoices);
 assert.equal(voices.filter(v=>v.pitch===48&&v.start===0).length,1,
  'Accompaniment on the accepted Wait downbeat must be scheduled once');
 // Repeated physical key-on must not replay accompaniment.
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 voices=await page.evaluate(()=>window.__prototypeTest.scheduledVoices);
 assert.equal(voices.filter(v=>v.pitch===48&&v.start===0).length,1,
  'Held note duplicated the accompaniment');
 // Legato: C4 is still physically held when the next played D4 arrives.
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(62));
 await page.waitForTimeout(70);
 voices=await page.evaluate(()=>window.__prototypeTest.scheduledVoices);
 assert.equal(voices.filter(v=>v.pitch===50&&v.start===2).length,1,
  'Next accompaniment downbeat was skipped on legato transition');
 await page.evaluate(()=>{for(const pitch of [60,62])window.__prototypeTest.receiveNoteOff(pitch);window.__prototypeTest.pause()});
 console.log('WAIT ACCOMPANIMENT: accepted downbeats and legato schedule exactly once: PASS');

 // A10: a long accompaniment or melody note still has audible time left
 // when playback resumes from a position inside the note.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'resume-sustain-ci',title:'Sustain resume',author:'CI',type:'demo',tempo:120,
   tracks:[{name:'Long note',notes:[
    {pitch:65,start:0,duration:10,velocity:90,track:0},
    {pitch:67,start:10,duration:.5,velocity:90,track:0}
   ]}]
  });
  window.__prototypeTest.setMode('listen');
  window.__prototypeTest.seek(5);
  window.__prototypeTest.play();
 });
 await page.waitForTimeout(70);
 let sustain=await page.evaluate(()=>({
  keys:window.__prototypeTest.soundingKeys,
  voices:window.__prototypeTest.scheduledVoices
 }));
 assert.ok(sustain.keys.includes(65),'Seeking into a held melody note left silence');
 let recovered=sustain.voices.find(v=>v.pitch===65&&v.start===0);
 assert.ok(recovered,'Long melody was not restored');
 assert.ok(recovered.endTime-recovered.startTime>4.7&&recovered.endTime-recovered.startTime<5.1,
  'Resumed note must play only its remaining ~5 seconds');
 await page.evaluate(()=>window.__prototypeTest.pause());
 assert.ok(!(await page.evaluate(()=>window.__prototypeTest.soundingKeys)).includes(65),
  'Pausing must stop recovered voices');
 await page.evaluate(()=>window.__prototypeTest.play());
 await page.waitForTimeout(70);
 assert.ok((await page.evaluate(()=>window.__prototypeTest.soundingKeys)).includes(65),
  'Resume after pause must still sound the sustained note');
 await page.evaluate(()=>window.__prototypeTest.pause());
 // A note whose off-event already passed must not be restarted.
 await page.evaluate(()=>{window.__prototypeTest.seek(10.2);window.__prototypeTest.play()});
 await page.waitForTimeout(70);
 assert.equal((await page.evaluate(()=>window.__prototypeTest.scheduledVoices)).filter(v=>v.pitch===65).length,0,
  'Fully finished note was incorrectly retriggered');
 await page.evaluate(()=>window.__prototypeTest.pause());
 console.log('SEEK / RESUME: sustained notes recover remaining duration without restarting ended notes: PASS');
 // A11: Transpose must compute its arrangement AFTER normalizing the
 // selected shift. A low C2 (36) must be transposed to C3 (48) in preview25.
 await page.evaluate(()=>{
  window.__prototypeTest.loadSong({
   id:'transpose-shift-fixture',title:'Transpose shift',type:'demo',tempo:120,
   tracks:[{name:'Piano',notes:[
    {pitch:36,start:0,duration:.5,velocity:90,track:0}
   ]}]
  });
  window.__prototypeTest.setMode('tempo');
  window.__prototypeTest.setTarget('preview25','transpose');
 });
 const shifted=await page.evaluate(()=>({
  selected:window.__prototypeTest.state.adaptShift,
  ui:document.querySelector('#adaptShift').value,
  feasible:window.__prototypeTest.capability.arrangement.feasible,
  plan:window.__prototypeTest.capability.arrangement.notes.map(n=>n.pitch),
  actual:window.__prototypeTest.adaptedNotes.map(n=>n.pitch)
 }));
 assert.deepEqual(shifted,{selected:12,ui:'12',feasible:true,plan:[48],actual:[48]},
  'Transpose must use one feasible +12 shift for UI, plan, and playback');
 await page.evaluate(()=>window.__prototypeTest.play());
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),true,
  'An incorrectly stale infeasible plan blocked Play');
 await page.evaluate(()=>window.__prototypeTest.pause());
 console.log('TRANSPOSE: corrected +12 shift is feasible in UI, adapted notes and playback: PASS');
 console.log('MIDI PAUSE REGRESSION: held note closes on pause; late NoteOff cannot corrupt next note: PASS');
 console.log('POLYPHONY REGRESSION: Tempo+Wait unison, key release, repeated pitch and chord: PASS');
 console.log('WAIT REGRESSION: legato, early onset, repeated note, chord: PASS');
 assert.deepEqual(errors,[],'Browser Javascript errors');
 console.log('REAL OSMD + MXL + cursor + Wait: PASS');
} finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
