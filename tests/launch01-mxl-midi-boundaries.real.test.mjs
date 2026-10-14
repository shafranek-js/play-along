/**
 * LAUNCH-01 F1: real Chromium XML/MXL ZIP and source MIDI stress boundaries.
 * All music and ZIP bytes are generated internally; no licensed repertoire.
 * Refusal must be atomic (no automatic source substitution or UI mutation).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';
const dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const XML='<?xml version="1.0" encoding="utf-8"?>'+
 '<score-partwise version="4.0"><work><work-title>MXL QA</work-title></work>'+
 '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 '<note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration></note>'+
 '<note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration></note>'+
 '</measure></part></score-partwise>';
const CONTAINER='<?xml version="1.0"?>'+
 '<container><rootfiles><rootfile full-path="score.musicxml" /></rootfiles></container>';
const be16=n=>[(n>>>8)&255,n&255],be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const vlq=n=>{const a=[n&127];for(n>>=7;n;n>>=7)a.unshift((n&127)|128);return a};
function midiTrack(channel,first=48,count=350){
 const ev=[];
 for(let i=0;i<count;i++){
  const pitch=first+i%24;
  ev.push(...vlq(i?3:0),0x90|channel,pitch,85);
  ev.push(...vlq(10+i%3),0x80|channel,pitch,0);
 }
 ev.push(0,255,47,0);
 return Buffer.concat([Buffer.from('MTrk'),Buffer.from(be32(ev.length)),Buffer.from(ev)]);
}
function midiFile(){
 const tracks=[midiTrack(0,48,350),midiTrack(1,60,350),midiTrack(2,72,350)];
 return Buffer.concat([Buffer.from('MThd'),Buffer.from(be32(6)),Buffer.from(be16(1)),
  Buffer.from(be16(3)),Buffer.from(be16(480)),...tracks]);
}
function zip(files,{method=8}={}){
 let offset=0;const body=[],central=[];
 for(const [name,contents] of files){
  const label=Buffer.from(name),input=Buffer.from(contents),packed=method===8?deflateRawSync(input):input;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);
  local.writeUInt32LE(packed.length,18);local.writeUInt32LE(input.length,22);
  local.writeUInt16LE(label.length,26);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50);
  dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
  dir.writeUInt16LE(method,10);dir.writeUInt32LE(packed.length,20);
  dir.writeUInt32LE(input.length,24);dir.writeUInt16LE(label.length,28);
  dir.writeUInt32LE(offset,42);
  body.push(local,label,packed);central.push(dir,label);
  offset+=local.length+label.length+packed.length;
 }
 const size=central.reduce((n,x)=>n+x.length,0);
 const tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50);
 tail.writeUInt16LE(files.length,8);tail.writeUInt16LE(files.length,10);
 tail.writeUInt32LE(size,12);tail.writeUInt32LE(offset,16);
 return Buffer.concat([...body,...central,tail]);
}
const asMxl=()=>zip([['META-INF/container.xml',CONTAINER],['score.musicxml',XML]]);
const mutations={
 // Last (score.musicxml) entry. The central directory is after 2 local records.
 wrongSize(buf){const a=Buffer.from(buf);
  const end=a.length-22,dir=a.readUInt32LE(end+16),firstSize=46+Buffer.byteLength('META-INF/container.xml');
  a.writeUInt32LE(1,dir+firstSize+24);return a},
 encrypted(buf){const a=Buffer.from(buf);const dir=a.readUInt32LE(a.length-6);
  a.writeUInt16LE(1,dir+8);return a},
 splitArchive(buf){const a=Buffer.from(buf);a.writeUInt16LE(1,a.length-22+4);return a},
 badDirectory(buf){const a=Buffer.from(buf);a.writeUInt32LE(a.length+1024,a.length-22+16);return a},
 truncatedEntry(buf){const a=Buffer.from(buf);const dir=a.readUInt32LE(a.length-6);
  a.writeUInt16LE(0xffff,dir+28);return a},
 missingScore(){return zip([['META-INF/container.xml',CONTAINER],['other.musicxml',XML]])},
 unsafePath(){return zip([['META-INF/container.xml',CONTAINER],['../score.musicxml',XML]])},
 invalidXml(){return zip([['META-INF/container.xml',CONTAINER],['score.musicxml',Buffer.from([0xff,0xfe,0xff])]])},
 truncatedZIP(buf){return Buffer.from(buf).subarray(0,Buffer.from(buf).length-4)}
};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://127.0.0.1').pathname;
 const file=resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(dist+sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);res.end();return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();const pageErrors=[];
 page.on('pageerror',err=>pageErrors.push(err.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.songFromBuffer&&window.__prototypeTest?.loadSong);
 const good=await page.evaluate(async payload=>{
  const app=window.__libraryV08;
  const read=async(name,bytes)=>app.songFromBuffer(name,Uint8Array.from(bytes).buffer);
  const raw=app.readMusicXML(payload.xml,'raw.musicxml');
  const compressed=await read('valid-deflate.mxl',payload.compressed);
  const stored=await read('valid-stored.mxl',payload.stored);
  const snapshot=song=>song.tracks.flatMap(t=>t.notes).map(n=>
   [n.pitch,n.start,n.duration,n.noteId]);
  window.__prototypeTest.loadSong(compressed);
  return {count:compressed.tracks.flatMap(t=>t.notes).length,
   compressedMatch:JSON.stringify(snapshot(raw))===JSON.stringify(snapshot(compressed)),
   storedMatch:JSON.stringify(snapshot(raw))===JSON.stringify(snapshot(stored)),
   sourceHash:JSON.stringify(snapshot(compressed))};
 },{xml:XML,compressed:[...asMxl()],
  stored:[...zip([['META-INF/container.xml',CONTAINER],['score.musicxml',XML]],{method:0})]});
 assert.deepEqual({count:good.count,compressedMatch:good.compressedMatch,
  storedMatch:good.storedMatch},{count:2,compressedMatch:true,storedMatch:true});
 const bad=Object.fromEntries(Object.entries(mutations).map(([key,mutate])=>
  [key,[...(mutate.length?mutate(asMxl()):mutate())]]));
 const checks=await page.evaluate(async samples=>{
  const output={};const app=window.__libraryV08,original=window.__prototypeTest.song;
  for(const [name,b] of Object.entries(samples)){
   try{await app.songFromBuffer(name+'.mxl',Uint8Array.from(b).buffer);
    output[name]='UNEXPECTED_SUCCESS';}
   catch(e){output[name]=String(e?.message||e)}
  }
  output.unmodified=original===window.__prototypeTest.song;
  return output;
 },bad);
 for(const [name,msg] of Object.entries(checks)){
  if(name==='unmodified')continue;
  assert.notEqual(msg,'UNEXPECTED_SUCCESS',name+' corrupted MXL was silently accepted');
 }
 assert.equal(checks.unmodified,true,'failure must not replace current song');

 const stressed=await page.evaluate(async data=>{
  const buf=Uint8Array.from(data);
  const song=await window.__libraryV08.songFromBuffer('three-tracks.mid',buf.buffer);
  const notes=song.tracks.flatMap(t=>t.notes);
  const before=window.__prototypeTest.song;
  const failures=[];
  const broken=[
   ['short',buf.subarray(0,8)],
   ['bad_header',Uint8Array.from([1,...buf.slice(1)])],
   ['type2',Uint8Array.from(buf)],
   ['too_many_tracks',Uint8Array.from(buf)],
   ['truncated_track',buf.subarray(0,buf.length-4)]
  ];
  broken[2][1][9]=2; // MThd format 2
  broken[3][1][11]=151; // 151 tracks declared, above bound
  for(const [name,bytes] of broken){
   try{await window.__libraryV08.songFromBuffer(name+'.mid',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    failures.push([name,'UNEXPECTED_SUCCESS']);}
   catch(e){failures.push([name,String(e?.message||e)])}
  }
  return {tracks:song.tracks.length,notes:notes.length,
   uniqueIds:new Set(notes.map(n=>n.noteId)).size,
   events:song.audioEvents.length,validTimes:notes.every(n=>
    Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0),
   failureCases:failures,currentSongUnchanged:before===window.__prototypeTest.song};
 },[...midiFile()]);
 assert.equal(stressed.tracks,3);
 assert.equal(stressed.notes,1050);
 assert.equal(stressed.uniqueIds,1050);
 assert.equal(stressed.events,2100);
 assert.equal(stressed.validTimes,true);
 for(const [name,reason] of stressed.failureCases)
  assert.notEqual(reason,'UNEXPECTED_SUCCESS','malformed MIDI '+name);
 assert.equal(stressed.currentSongUnchanged,true);
 assert.deepEqual(pageErrors,[]);
 console.log('LAUNCH01_MXL_MIDI_BOUNDARY_PASS',JSON.stringify({
  mxlModes:['deflate','stored'],mxlRejections:Object.keys(mutations).length,
  stressMidiTracks:stressed.tracks,stressMidiNotes:stressed.notes,
  midiRejected:stressed.failureCases.length,
  currentSongUnchanged:true,
  originalSourcePreserved:true}));
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
