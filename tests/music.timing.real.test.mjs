import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const score=`<?xml version="1.0"?>
<score-partwise version="4.0"><part-list>
<score-part id="P1"><part-name>Right</part-name></score-part>
<score-part id="P2"><part-name>Left</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<direction><sound tempo="120"/></direction>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><rest/><duration>480</duration><type>quarter</type></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><tie type="start"/><type>quarter</type></note>
</measure>
<measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
<direction><sound tempo="60"/></direction>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><tie type="stop"/><type>quarter</type></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
<note><rest/><duration>480</duration><type>quarter</type></note></measure>
</part>
<part id="P2">
<measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><type>whole</type></note></measure>
<measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
<note><rest measure="yes"/><duration>1440</duration></note></measure>
</part></score-partwise>`;
function midi(){
 const events=[
  0,255,81,3,7,161,32,0,144,60,95,131,96,128,60,0,
  0,255,81,3,15,66,64,0,144,62,95,131,96,128,62,0,0,255,47,0
 ];
 const header=Buffer.from('4d546864000000060000000101e0','hex');
 const track=Buffer.alloc(8);track.write('MTrk',0);track.writeUInt32BE(events.length,4);
 return [...header,...track,...events];
}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__scoreTest);
 const result=await page.evaluate(({score,midi})=>{
  const song=window.__libraryV08.readMusicXML(score,'timing.musicxml');
  const parsed=window.__prototypeTest.parseMidi(new Uint8Array(midi),'tempo.mid');
  const notes=song.tracks.flatMap(t=>t.notes).map(n=>({pitch:n.pitch,start:n.start,duration:n.duration})).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  const midiNotes=parsed.tracks.flatMap(t=>t.notes).map(n=>({pitch:n.pitch,start:n.start,duration:n.duration})).sort((a,b)=>a.start-b.start);
  const b2s=[0,1,2,3,4,5,6,7].map(b=>window.__scoreTest.scoreBeatToSecond(song,b));
  const s2b=[0,1,2,3,4,5].map(sec=>window.__scoreTest.scoreSecondToBeat(song,sec));
  return {notes,midiNotes,b2s,s2b,tempos:song.scoreTempoMap,tracks:song.tracks.length};
 },{score,midi:midi()});
 const byPitch=p=>result.notes.filter(n=>n.pitch===p);
 const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.0001,label+' expected '+expected+' got '+actual);
 assert.equal(result.tracks,2);
 near(byPitch(60)[0].start,0,'C4 start');near(byPitch(60)[0].duration,.5,'C4 length');
 assert.equal(byPitch(60).length,1);
 assert.equal(byPitch(64).length,1);near(byPitch(64)[0].start,1,'E4 after rest');near(byPitch(64)[0].duration,.5,'E4 quarter');
 near(byPitch(67)[0].start,1,'G4 chord onset');
 assert.equal(byPitch(65).length,1,'Tie must join two written F4 notes');
 near(byPitch(65)[0].start,1.5,'F4 onset');near(byPitch(65)[0].duration,1.5,'Tie across tempo transition');
 near(byPitch(62)[0].start,3,'D4 after 60bpm beat');near(byPitch(62)[0].duration,1,'D4 duration');
 near(byPitch(48)[0].duration,2,'Left-hand C3 whole duration');
 [0,.5,1,1.5,2,3,4,5].forEach((sec,i)=>near(result.b2s[i],sec,'beat '+i));
 [0,2,4,5,6,7].forEach((beat,i)=>near(result.s2b[i],beat,'second '+i));
 assert.deepEqual(result.midiNotes.map(n=>n.pitch),[60,62]);
 near(result.midiNotes[0].start,0,'MIDI first onset');near(result.midiNotes[0].duration,.5,'MIDI first length');
 near(result.midiNotes[1].start,.5,'MIDI tempo onset');near(result.midiNotes[1].duration,1,'MIDI tempo duration');
 // A dotted-quarter metronome marking in 6/8 is NOT quarter=60.
 // Dotted quarter = 60 means ordinary quarter = 90, so 1.5 quarters = 1 sec.
 const compound=`<?xml version="1.0"?>
 <score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1"><measure number="1">
 <attributes><divisions>480</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
 <direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>60</per-minute></metronome></direction-type></direction>
 <note><pitch><step>C</step><octave>4</octave></pitch><duration>720</duration><type>quarter</type><dot/></note>
 <note><pitch><step>D</step><octave>4</octave></pitch><duration>720</duration><type>quarter</type><dot/></note>
 </measure></part></score-partwise>`;
 const dotted=await page.evaluate(xml=>{
  const s=window.__libraryV08.readMusicXML(xml,'compound.musicxml');
  return {notes:s.tracks.flatMap(t=>t.notes),firstBeat:window.__scoreTest.scoreBeatToSecond(s,1.5),tempo:s.scoreTempoMap[0].tempo};
 },compound);
 near(dotted.notes[0].duration,1,'dotted-quarter C duration in 6/8');
 near(dotted.notes[1].start,1,'dotted-quarter D onset in 6/8');
 near(dotted.notes[1].duration,1,'dotted-quarter D duration in 6/8');
 near(dotted.firstBeat,1,'OSMD shared tempo map for dotted quarter');
 near(dotted.tempo,60000000/90,'quarter microseconds with dotted beat marking');
 // A conventional repeat spans measures 2–3. All parts must play
 // A B C B C, and OSMD must receive the same five-bar unfolded notation.
 function repeatScore({times=2,unsupported=false,noForward=false}={}){
  const staff=(id,octave)=>{
   const steps=['C','D','E'],measures=steps.map((step,i)=>{
    const left=i===1&&!noForward?'<barline location="left"><repeat direction="forward"/></barline>':'';
    const right=i===2?'<barline location="right"><repeat direction="backward" times="'+times+'"/></barline>':'';
    const ending=unsupported&&i===2?'<barline location="right"><ending number="1" type="start"/></barline>':'';
    return '<measure number="'+(i+1)+'">'+(i===0?'<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>':'')+left+
      '<note><pitch><step>'+step+'</step><octave>'+octave+'</octave></pitch><duration>1920</duration><type>whole</type></note>'+ending+right+'</measure>';
   }).join('');
   return '<part id="'+id+'">'+measures+'</part>';
  };
  return '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Right</part-name></score-part><score-part id="P2"><part-name>Left</part-name></score-part></part-list>'+
   staff('P1',4)+staff('P2',3)+'</score-partwise>';
 }
 const repeated=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'repeats.musicxml');
  const dom=new DOMParser().parseFromString(song.notationXML,'application/xml');
  const measures=dom.getElementsByTagName('part')[0].getElementsByTagName('measure');
  return {perPart:song.tracks.map(t=>t.notes.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration}))),measures:measures.length,
   originals:!!song.originalNotationXML,warnings:song.warnings,repeatsRemaining:dom.getElementsByTagName('repeat').length};
 },repeatScore());
 assert.equal(repeated.measures,5,'Repeat must unfold to five written bars');
 assert.equal(repeated.originals,true,'Original MusicXML must remain accessible');
 assert.equal(repeated.repeatsRemaining,0,'Expanded notation must not repeat a second time');
 assert.ok(repeated.warnings.some(s=>s.includes('развёрнута')));
 assert.equal(repeated.perPart.length,2);
 assert.deepEqual(repeated.perPart[0].map(n=>n.pitch),[60,62,64,62,64]);
 assert.deepEqual(repeated.perPart[1].map(n=>n.pitch),[48,50,52,50,52]);
 for(const part of repeated.perPart)part.forEach((note,i)=>{near(note.start,2*i,'repeat onset');near(note.duration,2,'repeat length')});
 const repeatedThree=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'triple.musicxml');
  return {pitches:song.tracks[0].notes.map(n=>n.pitch),bars:new DOMParser().parseFromString(song.notationXML,'application/xml').getElementsByTagName('part')[0].getElementsByTagName('measure').length};
 },repeatScore({times:3,noForward:true}));
 assert.deepEqual(repeatedThree.pitches,[60,62,64,60,62,64,60,62,64],'Backward repeat without a forward sign starts at beginning');
 assert.equal(repeatedThree.bars,9);
 const unsupported=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'volta.musicxml');
  return {count:song.tracks[0].notes.length,original:!!song.originalNotationXML,
    remaining:song.notationXML.includes('repeat direction="backward"'),warnings:song.warnings};
 },repeatScore({unsupported:true}));
 assert.equal(unsupported.count,3,'Unsupported volta must not be silently unfolded incorrectly');
 assert.equal(unsupported.original,false);
 assert.equal(unsupported.remaining,true);
 assert.ok(unsupported.warnings.some(s=>s.includes('не развёрнуты')));
 // The actual renderer must show the expanded execution order, not keep a
 // three-measure score while the sound plays five measures.
 await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'repeat-render.musicxml');
  window.__prototypeTest.loadSong(song);
  window.__scoreTest.scoreSetView('sheet');
 },repeatScore());
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded||
  document.querySelector('#sheetStatus').textContent.includes('Ошибка'),
  null,{timeout:30000});
 const rendered=await page.evaluate(()=>({
  svg:document.querySelectorAll('#sheetCanvas svg').length,
  cursorBeats:window.__scoreTest.cursorTimes.slice(),
  length:window.__prototypeTest.song.tracks[0].notes.length,
  warnings:window.__prototypeTest.song.warnings,
  label:document.querySelector('#sheetStatus').textContent
 }));
 assert.ok(rendered.svg>0,'OSMD failed to render expanded repeat');
 assert.ok(rendered.cursorBeats.length>=5,'OSMD cursor lacks repeated measures');
 assert.deepEqual(rendered.cursorBeats.slice(0,5),[0,4,8,12,16],
  'OSMD cursor timeline must follow unfolded measures');
 assert.equal(rendered.length,5);
 await page.evaluate(()=>window.__prototypeTest.seek(8));
 const afterRepeatSeek=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,
  cursorBeat:Number(window.__scoreTest.renderer.cursor.iterator.CurrentSourceTimestamp.RealValue)*4
 }));
 near(afterRepeatSeek.pos,8,'Repeat seek position');
 near(afterRepeatSeek.cursorBeat,16,'Repeat cursor beat at second pass');
 console.log('REAL OSMD SIMPLE REPEAT: five rendered measures and synced seek: PASS');
 // Sparse right-hand notation omits the trailing rest in measure 1.
 // The next normal 4/4 measure MUST still begin at t=2s, matching left hand.
 const sparse=`<?xml version="1.0"?>
 <score-partwise version="4.0"><part-list>
 <score-part id="R"><part-name>Right</part-name></score-part>
 <score-part id="L"><part-name>Left</part-name></score-part></part-list>
 <part id="R">
 <measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
 <note><pitch><step>C</step><octave>5</octave></pitch><duration>480</duration><type>quarter</type></note></measure>
 <measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch><duration>1920</duration><type>whole</type></note></measure>
 </part>
 <part id="L">
 <measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
 <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><type>whole</type></note></measure>
 <measure number="2"><note><pitch><step>D</step><octave>3</octave></pitch><duration>1920</duration><type>whole</type></note></measure>
 </part></score-partwise>`;
 const sparseResult=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'sparse.musicxml');
  return song.tracks.map(t=>t.notes.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration})));
 },sparse);
 assert.equal(sparseResult.length,2);
 near(sparseResult[0][1].start,2,'Right hand sparse measure must preserve 4/4 bar boundary');
 near(sparseResult[1][1].start,2,'Left hand normal measure boundary');
 near(sparseResult[0][0].duration,.5,'Sparse C5 duration remains a quarter');
 // A genuinely implicit pickup must remain short (one eighth at 120 BPM).
 const pickup=sparse.replace('<measure number="1">','<measure number="1" implicit="yes">')
  .replace('<duration>480</duration><type>quarter</type>','<duration>240</duration><type>eighth</type>');
 const pickupResult=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'pickup.musicxml');
  return song.tracks[0].notes.map(n=>({pitch:n.pitch,start:n.start,duration:n.duration}));
 },pickup);
 near(pickupResult[1].start,.25,'Implicit pickup must not be padded to a full measure');
 console.log('PART TIMING: incomplete 4/4 bar aligned across hands, implicit pickup preserved: PASS');

 // Standard two-ending volta: C D(first) C E(second) F, with two synchronized hands.
 const voltaXml=(malformed=false)=>{
  const staff=(id,octave)=>{
   const entries=['C','D','E','F'].map((step,i)=>{
    const attrs=i===0?'<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>':'';
    const forward=i===0?'<barline location="left"><repeat direction="forward"/></barline>':'';
    const firstStart=i===1?'<barline location="left"><ending number="1" type="start"/></barline>':'';
    const firstStop=i===1?'<barline location="right"><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline>':'';
    const secondStart=i===2?'<barline location="left"><ending number="2" type="start"/></barline>':'';
    const secondStop=i===2?'<barline location="right"><ending number="2" type="'+(malformed?'start':'discontinue')+'"/></barline>':'';
    return '<measure number="'+(i+1)+'">'+attrs+forward+firstStart+
     '<note><pitch><step>'+step+'</step><octave>'+octave+'</octave></pitch><duration>1920</duration><type>whole</type></note>'+
     firstStop+secondStart+secondStop+'</measure>';
   }).join('');
   return '<part id="'+id+'">'+entries+'</part>';
  };
  return '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="R"><part-name>Right</part-name></score-part>'+
   '<score-part id="L"><part-name>Left</part-name></score-part></part-list>'+staff('R',4)+staff('L',3)+'</score-partwise>';
 };
 const volta=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'volta-fixture.musicxml');
  const dom=new DOMParser().parseFromString(song.notationXML,'application/xml');
  return {pitches:song.tracks.map(t=>t.notes.map(n=>n.pitch)),
   onsets:song.tracks.map(t=>t.notes.map(n=>n.start)),
   bars:dom.getElementsByTagName('part')[0].getElementsByTagName('measure').length,
   endings:dom.getElementsByTagName('ending').length,repeats:dom.getElementsByTagName('repeat').length,
   original:!!song.originalNotationXML,warnings:song.warnings};
 },voltaXml());
 assert.deepEqual(volta.pitches,[[60,62,60,64,65],[48,50,48,52,53]]);
 assert.deepEqual(volta.onsets,[[0,2,4,6,8],[0,2,4,6,8]]);
 assert.equal(volta.bars,5);
 assert.equal(volta.endings,0);assert.equal(volta.repeats,0);
 assert.equal(volta.original,true);
 assert.ok(volta.warnings.some(x=>x.includes('развёрнута')));
 const brokenVolta=await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'volta-broken.musicxml');
  return {notes:song.tracks[0].notes.length,hasOriginal:!!song.originalNotationXML,
   warning:song.warnings.find(x=>x.includes('не развёрнуты'))};
 },voltaXml(true));
 assert.equal(brokenVolta.notes,4);
 assert.equal(brokenVolta.hasOriginal,false);
 assert.ok(brokenVolta.warning,'Malformed volta must remain unexpanded with warning');
 await page.evaluate(xml=>{
  const song=window.__libraryV08.readMusicXML(xml,'volta-osmd.musicxml');
  window.__prototypeTest.loadSong(song);
  window.__scoreTest.scoreSetView('sheet');
 },voltaXml());
 await page.waitForFunction(()=>window.__scoreTest.scoreLoaded||
  document.querySelector('#sheetStatus').textContent.includes('Ошибка'),null,{timeout:30000});
 const voltaRendered=await page.evaluate(()=>({
  svg:document.querySelectorAll('#sheetCanvas svg').length,
  beats:window.__scoreTest.cursorTimes.slice(0,5),
  count:window.__prototypeTest.song.tracks[0].notes.length
 }));
 assert.ok(voltaRendered.svg>0,'OSMD must render the expanded volta');
 assert.deepEqual(voltaRendered.beats,[0,4,8,12,16]);
 assert.equal(voltaRendered.count,5);
 await page.evaluate(()=>window.__prototypeTest.seek(8));
 const voltaCursor=await page.evaluate(()=>Number(window.__scoreTest.renderer.cursor.iterator.CurrentSourceTimestamp.RealValue)*4);
 near(voltaCursor,16,'Volta second-ending cursor alignment');
 console.log('REAL OSMD TWO ENDINGS: two hands, guards, five measures and cursor: PASS');
 console.log('SIMPLE REPEATS: two-part A B C B C, three-pass, first-bar fallback, volta guarded: PASS');
 assert.deepEqual(errs,[]);
 console.log('MUSIC REGRESSION: MusicXML rests, chord, tie, 4/4 to 3/4, tempo 120→60, left hand and MIDI tempo: PASS');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
