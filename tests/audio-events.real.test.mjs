import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');

function vlq(value){
 const bytes=[value&0x7f];
 while((value=Math.floor(value/128))>0)bytes.unshift((value&0x7f)|0x80);
 return bytes;
}

function midiTrack(events){
 const bytes=[];let previousTick=0;
 for(const event of events){
  bytes.push(...vlq(event.tick-previousTick));previousTick=event.tick;
  if(event.meta){bytes.push(0xff,event.meta,...vlq(event.data.length),...event.data);continue;}
  bytes.push(event.status,...event.data);
 }
 bytes.push(0,0xff,0x2f,0);
 const chunk=Buffer.alloc(8);chunk.write('MTrk',0,'ascii');chunk.writeUInt32BE(bytes.length,4);
 return Buffer.concat([chunk,Buffer.from(bytes)]);
}

function midiFixture(){
 const controls=midiTrack([
  {tick:0,status:0xb0,data:[0,1]},
  {tick:0,status:0xb0,data:[32,2]},
  {tick:0,status:0xc0,data:[12]},
  {tick:0,status:0xd0,data:[21]},
  {tick:240,status:0xa0,data:[60,73]},
  {tick:480,meta:0x51,data:[0x0f,0x42,0x40]},
  {tick:480,status:0xb0,data:[7,99]},
  {tick:480,status:0xe0,data:[1,64]},
 ]);
 const notes=midiTrack([
  {tick:0,status:0xc0,data:[40]},
  {tick:0,status:0x90,data:[60,100]},
  {tick:0,status:0x90,data:[67,70]},
  {tick:0,status:0x80,data:[67,0]},
  {tick:120,status:0x90,data:[60,80]},
  {tick:240,status:0x90,data:[60,0]},
  {tick:360,status:0x80,data:[60,45]},
  {tick:480,status:0xc0,data:[41]},
  {tick:480,status:0x90,data:[64,90]},
  {tick:960,status:0x80,data:[64,32]},
 ]);
 const header=Buffer.alloc(14);header.write('MThd',0,'ascii');header.writeUInt32BE(6,4);header.writeUInt16BE(1,8);header.writeUInt16BE(2,10);header.writeUInt16BE(480,12);
 return Buffer.concat([header,controls,notes]);
}

const musicXml=`<?xml version="1.0"?>
<score-partwise version="4.0">
 <part-list><score-part id="P1"><part-name>XML instruments</part-name>
  <score-instrument id="I1"><instrument-name>Clarinet</instrument-name></score-instrument>
  <score-instrument id="I2"><instrument-name>Unpitched percussion</instrument-name></score-instrument>
  <score-instrument id="I3"><instrument-name>Center pan</instrument-name></score-instrument>
  <score-instrument id="I4"><instrument-name>Right pan</instrument-name></score-instrument>
  <score-instrument id="I5"><instrument-name>Rear pan</instrument-name></score-instrument>
  <score-instrument id="I6"><instrument-name>Rear pan left boundary</instrument-name></score-instrument>
  <score-instrument id="I7"><instrument-name>Rear pan right boundary</instrument-name></score-instrument>
  <midi-instrument id="I1"><midi-channel>2</midi-channel><midi-program>41</midi-program><midi-bank>129</midi-bank><volume>75</volume><pan>-90</pan></midi-instrument>
  <midi-instrument id="I2"><midi-channel>10</midi-channel><midi-program>1</midi-program><midi-unpitched>36</midi-unpitched></midi-instrument>
  <midi-instrument id="I3"><midi-channel>3</midi-channel><midi-program>1</midi-program><pan>0</pan></midi-instrument>
  <midi-instrument id="I4"><midi-channel>4</midi-channel><midi-program>1</midi-program><pan>90</pan></midi-instrument>
  <midi-instrument id="I5"><midi-channel>5</midi-channel><midi-program>1</midi-program><pan>135</pan></midi-instrument>
  <midi-instrument id="I6"><midi-channel>6</midi-channel><midi-program>1</midi-program><pan>-180</pan></midi-instrument>
  <midi-instrument id="I7"><midi-channel>7</midi-channel><midi-program>1</midi-program><pan>180</pan></midi-instrument>
 </score-part></part-list>
 <part id="P1"><measure number="1">
  <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><instrument id="I1"/><notations><technical><fingering>2</fingering></technical></notations></note>
  <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>480</duration><instrument id="I2"/></note>
  <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><instrument id="I3"/></note>
  <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><instrument id="I4"/></note>
 </measure></part>
</score-partwise>`;

const mscx=`<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.6"><Score>
 <metaTag name="workTitle">MSCX audio events</metaTag>
 <Part id="P1"><trackName>Drum staff</trackName><Instrument id="instrument-1"><trackName>Drum staff</trackName><useDrumset>1</useDrumset>
  <Channel><program value="40"/><controller ctrl="0" value="1"/><controller ctrl="32" value="2"/><controller ctrl="7" value="100"/></Channel>
 </Instrument><Staff id="1"/></Part>
 <Staff id="1"><Measure len="1/1"><voice><TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
  <Chord><durationType>quarter</durationType><Note><pitch>36</pitch></Note></Chord>
  <Chord><durationType>quarter</durationType><Note><pitch>38</pitch></Note></Chord>
 </voice></Measure></Staff>
</Score></museScore>`;

const allocationParts=Array.from({length:15},(_,index)=>`P${index+1}`);
const xmlChannelAllocation=`<?xml version="1.0"?><score-partwise version="4.0"><part-list>${allocationParts.map(id=>`<score-part id="${id}"><part-name>${id}</part-name></score-part>`).join('')}</part-list>${allocationParts.map(id=>`<part id="${id}"><measure number="1"><attributes><divisions>480</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration></note></measure></part>`).join('')}</score-partwise>`;

const mscxChannelAllocation=`<?xml version="1.0"?><museScore version="3.6"><Score>${allocationParts.map((id,index)=>`<Part id="${id}"><Instrument id="instrument-${id}"><trackName>${id}</trackName></Instrument><Staff id="${index+1}"/></Part>`).join('')}${allocationParts.map((id,index)=>`<Staff id="${index+1}"><Measure len="1/1"><voice><Chord><durationType>quarter</durationType><Note><pitch>${36+index}</pitch></Note></Chord></voice></Measure></Staff>`).join('')}</Score></museScore>`;

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1');
 const relative=url.pathname==='/'?'/index.html':url.pathname;
 const file=path.resolve(dist,'.'+relative);
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  response.writeHead(404);response.end('not found');return;
 }
 response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
 fs.createReadStream(file).pipe(response);
});

await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest,{timeout:15000});
 const results=await page.evaluate(({midi,xml,score,allocation,museAllocation})=>{
  const midiSong=window.__prototypeTest.parseMidi(new Uint8Array(midi),'audio-events.mid');
  const midiRepeat=window.__prototypeTest.parseMidi(new Uint8Array(midi),'audio-events-repeat.mid');
  const xmlSong=window.__libraryV08.readMusicXML(xml,'audio-events.musicxml');
  const mscxSong=window.__libraryV08.museRead(score,'audio-events.mscx');
  const allocationSong=window.__libraryV08.readMusicXML(allocation,'audio-channel-allocation.musicxml');
  const museAllocationSong=window.__libraryV08.museRead(museAllocation,'audio-channel-allocation.mscx');
  return {
   midi:{events:midiSong.audioEvents,repeatNoteOnIds:midiRepeat.audioEvents.filter(event=>event.type==='noteOn').map(event=>event.noteId),notes:midiSong.tracks.flatMap(track=>track.notes),tracks:midiSong.tracks.map(track=>track.name),tempo:midiSong.scoreTempoMap},
   musicXml:{events:xmlSong.audioEvents,notes:xmlSong.tracks.flatMap(track=>track.notes),warnings:xmlSong.warnings},
   mscx:{events:mscxSong.audioEvents,notes:mscxSong.tracks.flatMap(track=>track.notes),warnings:mscxSong.warnings},
   allocation:{events:allocationSong.audioEvents,notes:allocationSong.tracks.flatMap(track=>track.notes),trackCount:allocationSong.tracks.length},
   museAllocation:{events:museAllocationSong.audioEvents,notes:museAllocationSong.tracks.flatMap(track=>track.notes),trackCount:museAllocationSong.tracks.length},
  };
 },{midi:Array.from(midiFixture()),xml:musicXml,score:mscx,allocation:xmlChannelAllocation,museAllocation:mscxChannelAllocation});

 const midi=results.midi.events;
 assert.ok(midi.length>0,'MIDI parser must produce canonical audio events');
 assert.deepEqual(midi.map(event=>[event.time,event.sequence]),[...midi].sort((a,b)=>a.time-b.time||a.sequence-b.sequence).map(event=>[event.time,event.sequence]),
  'MIDI events must be sorted by seconds then stable sequence');
 assert.equal(results.midi.tracks.length,1,'control-only source tracks must not become score tracks');
 const controls=midi.filter(event=>event.sourceTrack===0);
 assert.ok(controls.length>0);
 assert.ok(controls.every(event=>event.track===null),'control-only source track maps to null score track');
 assert.ok(controls.some(event=>event.type==='cc'&&event.controller===0&&event.value===1));
 assert.ok(controls.some(event=>event.type==='cc'&&event.controller===32&&event.value===2));
 assert.ok(controls.some(event=>event.type==='channelPressure'&&event.value===21));
 assert.ok(controls.some(event=>event.type==='polyPressure'&&event.pitch===60&&event.value===73));
 assert.ok(controls.some(event=>event.type==='pitchWheel'&&event.value===8193));
 assert.ok(controls.some(event=>event.type==='programChange'&&event.program===12));
 const midiNotes=midi.filter(event=>event.type==='noteOn'||event.type==='noteOff');
 assert.ok(midiNotes.every(event=>event.sourceTrack===1&&event.track===0));
 const unisonOns=midi.filter(event=>event.type==='noteOn'&&event.pitch===60);
 const unisonOffs=midi.filter(event=>event.type==='noteOff'&&event.pitch===60);
 const unisonOnIds=unisonOns.map(event=>event.noteId);
 assert.equal(new Set(unisonOnIds).size,2,'overlapping same-pitch NoteOns must have unique identities');
 assert.deepEqual(midi.filter(event=>event.type==='noteOn').map(event=>event.noteId),results.midi.repeatNoteOnIds,
  'event identities must remain deterministic across parses');
 assert.deepEqual(unisonOffs.map(event=>event.noteId),unisonOnIds,'overlapping same-pitch notes must pair NoteOffs FIFO by their NoteOn identities');
 assert.ok(unisonOnIds.every(noteId=>results.midi.notes.some(note=>note.noteId===noteId&&note.pitch===60)),
  'paired event identities must resolve to their corresponding score notes');
 assert.equal(unisonOffs[0].velocity,0,'velocity-zero NoteOn encoding must become NoteOff');
 assert.equal(unisonOffs[1].velocity,45,'explicit NoteOff release velocity is preserved');
 const zeroTickOn=midi.find(event=>event.type==='noteOn'&&event.pitch===67);
 const zeroTickOff=midi.find(event=>event.type==='noteOff'&&event.pitch===67);
 assert.deepEqual([zeroTickOn.time,zeroTickOff.time],[0,0],'zero-tick MIDI NoteOn/Off retains simultaneous event time');
 assert.ok(zeroTickOn.sequence<zeroTickOff.sequence,'zero-tick note preserves NoteOn-before-NoteOff sequence');
 assert.equal(results.midi.notes.find(note=>note.noteId===zeroTickOn.noteId).duration,.025,
  'the score projection applies its existing 25 ms minimum without changing raw audio event timing');
 const programAtZero=midi.find(event=>event.sourceTrack===1&&event.time===0&&event.type==='programChange');
 const noteAtZero=midi.find(event=>event.sourceTrack===1&&event.time===0&&event.type==='noteOn');
 assert.ok(programAtZero.sequence<noteAtZero.sequence,'same-tick program change must precede its note');
 const programAtHalf=midi.find(event=>event.sourceTrack===1&&Math.abs(event.time-.5)<1e-9&&event.type==='programChange');
 const noteAtHalf=midi.find(event=>event.sourceTrack===1&&Math.abs(event.time-.5)<1e-9&&event.type==='noteOn');
 assert.ok(programAtHalf.sequence<noteAtHalf.sequence,'same-tick program change after a tempo change must precede its note');
 assert.ok(Math.abs(noteAtHalf.time-.5)<1e-9,'tick 480 follows the initial 120 BPM tempo');
 assert.ok(Math.abs(midi.find(event=>event.type==='noteOff'&&event.pitch===64).time-1.5)<1e-9,
  'tick 960 follows the 60 BPM tempo transition at tick 480');
 for(const id of unisonOns.map(event=>event.noteId)){
  const on=midi.find(event=>event.type==='noteOn'&&event.noteId===id);
  const off=midi.find(event=>event.type==='noteOff'&&event.noteId===id);
  assert.ok(on&&off&&off.time>on.time,`paired MIDI note lifecycle ${id}`);
 }

 const xmlEvents=results.musicXml.events;
 assert.ok(xmlEvents.length>0,'MusicXML parser must produce canonical audio events');
 const xmlInstrument=xmlEvents.find(event=>event.type==='programChange'&&event.program===40);
 assert.ok(xmlInstrument,'MusicXML midi-program 41 must map to zero-based program 40');
 assert.deepEqual([xmlInstrument.channel,xmlInstrument.bankMSB,xmlInstrument.bankLSB],[1,1,0],
  'MusicXML midi-channel 2 and one-based midi-bank 129 map to channel 1, bank 1:0');
 const percussionProgram=xmlEvents.find(event=>event.type==='programChange'&&event.isDrum);
 assert.ok(percussionProgram&&percussionProgram.channel===9,'MusicXML channel 10/midi-unpitched maps to zero-based percussion channel 9');
 assert.ok(xmlEvents.some(event=>event.type==='cc'&&event.controller===7&&event.value===95));
 assert.deepEqual(xmlEvents.filter(event=>event.type==='cc'&&event.controller===10).map(event=>event.value).sort((a,b)=>a-b),[0,64,64,64,95,127],
  'MusicXML -90/0/+90 pan maps to hard-left/center/hard-right, with rear-half and ±180 projection');
 assert.ok(results.musicXml.warnings.some(warning=>warning.includes('позади слушателя')&&warning.includes('стерео')),
  'rear-half pan projection must disclose loss of surround positioning');
 assert.equal(xmlInstrument.isDrum,false,'MusicXML melodic program changes must retain drum classification');
 assert.ok(xmlInstrument.bankMSB===1&&xmlInstrument.bankLSB===0,'MusicXML patch bank is carried on its program event');
 const xmlClarinet=results.musicXml.notes.find(note=>note.instrumentId==='I1');
 const xmlPercussion=results.musicXml.notes.find(note=>note.instrumentId==='I2');
 assert.ok(xmlClarinet&&xmlPercussion,'MusicXML note instrument IDs must select their matching MIDI instruments');
 assert.deepEqual([xmlClarinet.channel,xmlClarinet.pitch,xmlClarinet.finger,xmlClarinet.fingeringSource,xmlClarinet.sourceTrack],[1,60,2,'musicxml',0]);
 assert.deepEqual([xmlPercussion.channel,xmlPercussion.pitch,xmlPercussion.isDrum,xmlPercussion.sourceTrack],[9,35,true,0]);
 for(const note of [xmlClarinet,xmlPercussion]){
  const on=xmlEvents.find(event=>event.type==='noteOn'&&event.noteId===note.noteId);
  const off=xmlEvents.find(event=>event.type==='noteOff'&&event.noteId===note.noteId);
  assert.ok(on&&off,'MusicXML note metadata must be retained on paired audio events');
 }

 const mscxEvents=results.mscx.events;
 assert.ok(mscxEvents.length>0,'MSCX reader must produce canonical audio events');
 assert.ok(mscxEvents.some(event=>event.type==='programChange'&&event.program===40&&event.channel===9&&event.isDrum),
  'MSCX Channel program is already zero-based and drumset remains on channel 9');
 for(const [controller,value] of [[0,1],[32,2],[7,100]])assert.ok(mscxEvents.some(event=>event.type==='cc'&&event.controller===controller&&event.value===value),
  `MSCX Channel controller ${controller} must preserve its zero-based value`);
 assert.deepEqual(results.mscx.notes.map(note=>[note.pitch,note.channel,note.track,note.sourceTrack,note.instrumentId,note.isDrum]),[
  [36,9,0,0,'instrument-1',true],[38,9,0,0,'instrument-1',true],
 ]);
 assert.deepEqual(results.mscx.notes.map(note=>note.noteId),['mscx:1:0:1','mscx:1:0:2']);
 assert.ok(mscxEvents.filter(event=>event.type==='noteOn').every(event=>event.channel===9&&event.track===0&&event.sourceTrack===0));
 const allocated=results.allocation.events.filter(event=>event.type==='programChange').map(event=>event.channel);
 assert.equal(results.allocation.trackCount,15,'all 15 parts retain their score tracks');
 assert.deepEqual(allocated,[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15],
  '15 automatic melodic channels must remain unique while reserving percussion channel 9');
 const museAllocated=[...new Set(results.museAllocation.notes.map(note=>note.channel))].sort((a,b)=>a-b);
 assert.equal(results.museAllocation.trackCount,15,'all 15 MuseScore staves retain score tracks');
 assert.deepEqual(museAllocated,[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15],
  'MSCX automatic melodic channels must remain unique while skipping channel 9');
 assert.equal(pageErrors.length,0,'browser page errors: '+pageErrors.join('; '));
 console.log('AUDIO EVENT PARSERS REAL BROWSER:',JSON.stringify({midiCounts:{tracks:results.midi.tracks.length,events:midi.length,noteIds:unisonOns.map(event=>event.noteId)},musicXmlCounts:{events:xmlEvents.length,notes:results.musicXml.notes.length},mscxCounts:{events:mscxEvents.length,notes:results.mscx.notes.length}}));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
