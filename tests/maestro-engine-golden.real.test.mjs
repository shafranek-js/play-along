/**
 * MAE-03A: black-box browser parser against an independent SMF golden timeline.
 * Synthetic: runs on every PR. Official: 24 pinned SHA256 files, source ZIP
 * checked before use, and NO source MIDI included in logs or artifacts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {maestroReferenceEvents,openMidiZip,locateMidiEntries} from '../scripts/maestro-midi-audit.mjs';
import {parseCsv,validateMetadata} from '../scripts/maestro-corpus.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const csvPath=process.env.MAESTRO_REAL_CSV,zipPath=process.env.MAESTRO_REAL_ZIP;
assert.equal(Boolean(csvPath),Boolean(zipPath),'Official validation requires both source CSV and ZIP');
const real=Boolean(csvPath);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const nearMs=seconds=>Math.round(seconds*100000); // 10-microsecond source tolerance
const digest=items=>sha(Buffer.from(JSON.stringify(items)));
const sortRows=rows=>rows.sort((a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i]}return 0});
const keyRows=(notes,cc)=>{
 const keys=sortRows(notes.map(n=>[n.sourceTrack,n.channel,n.pitch,n.velocity,nearMs(n.start),nearMs(n.duration)]));
 const pedals=sortRows(cc.filter(e=>[64,66,67].includes(e.controller)).map(e=>[e.sourceTrack??e.track,e.channel,e.controller,e.value,nearMs(e.time)]));
 return {keys,pedals};
};
const strictMatch=(original,actual,label)=>{
 const expected=keyRows(original.notes,original.cc),got=keyRows(actual.notes,actual.cc);
 const comparison={source_note_count:expected.keys.length,player_note_count:got.keys.length,
  source_cc_events:expected.pedals.length,player_cc_events:got.pedals.length,
  source_signature:digest(expected.keys),player_signature:digest(got.keys),
  source_cc_signature:digest(expected.pedals),player_cc_signature:digest(got.pedals),
  short_source_notes:original.notes.filter(n=>n.duration<.025).length,
  source_active_tempos:original.tempoPoints.length};
 if(comparison.source_signature!==comparison.player_signature){
  let mismatch=-1;for(let i=0;i<Math.max(expected.keys.length,got.keys.length);i++){
   if(JSON.stringify(expected.keys[i])!==JSON.stringify(got.keys[i])){mismatch=i;break}
  }
  comparison.first_mismatch_at=mismatch;
  comparison.first_mismatch_expected=expected.keys[mismatch]||null;
  comparison.first_mismatch_actual=got.keys[mismatch]||null;
 }
 assert.equal(comparison.player_note_count,comparison.source_note_count,label+' lost/repeated source notes');
 assert.equal(comparison.player_cc_events,comparison.source_cc_events,label+' lost pedal CCs');
 assert.equal(comparison.player_signature,comparison.source_signature,label+' distorted MIDI onset/release, pitch, channel or velocity: '+JSON.stringify(comparison));
 assert.equal(comparison.player_cc_signature,comparison.source_cc_signature,label+' distorted sustain/sostenuto/una-corda timeline');
 return comparison;
};
const header=Buffer.from('4d546864000000060001000201e0','hex');
const vlq=n=>{let v=n&127;while((n>>=7))v=(v<<8)|((n&127)|0x80);const result=[];while(true){result.push(v&255);if(v&128)v>>=8;else break}return Buffer.from(result)};
function midiTrack(events){
 let tick=0;
 const parts=[];
 for(const e of events){
  parts.push(vlq(e.tick-tick),Buffer.from(e.bytes));tick=e.tick;
 }
 parts.push(Buffer.from([0,0xff,0x2f,0]));
 const body=Buffer.concat(parts),start=Buffer.alloc(8);
 start.write('MTrk',0,'ascii');start.writeUInt32BE(body.length,4);
 return Buffer.concat([start,body]);
}
function synthetic(){
 const first=midiTrack([
  {tick:0,bytes:[0xff,0x51,0x03,0x07,0xa1,0x20]}, // 120 BPM
  {tick:0,bytes:[0x90,60,98]},
  {tick:1,bytes:[0x80,60,0]}, // 1.04 ms staccato; must not be inflated to 25 ms
  {tick:1,bytes:[0xb0,64,127]},
  {tick:2,bytes:[0x90,60,66]},
  {tick:122,bytes:[0x80,60,0]},
  {tick:240,bytes:[0xb0,64,0]},
  {tick:240,bytes:[0xff,0x51,0x03,0x03,0xd0,0x90]}, // 240 BPM
  {tick:241,bytes:[0x90,64,100]},
  {tick:243,bytes:[0x80,64,0]},
  {tick:244,bytes:[0xb0,66,127]},
  {tick:245,bytes:[0xb0,66,0]},
  {tick:246,bytes:[0xb0,67,100]},
  {tick:250,bytes:[0xb0,67,0]}
 ]);
 const second=midiTrack([
  {tick:0,bytes:[0x90,60,72]}, // simultaneous unison on another source track
  {tick:480,bytes:[0x80,60,0]},
  {tick:480,bytes:[0x90,67,80]},
  {tick:960,bytes:[0x80,67,0]}
 ]);
 return Buffer.concat([header,first,second]);
}
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const filepath=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!filepath.startsWith(dist+path.sep)||!fs.existsSync(filepath)){res.writeHead(404);res.end('not found');return}
 res.setHeader('Content-Type',filepath.endsWith('.html')?'text/html':filepath.endsWith('.js')?'application/javascript':'application/octet-stream');
 res.end(fs.readFileSync(filepath));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const report={schema:'play-along-maestro-mae03a-golden/1',source:real?'official-maestro-v3-sha256':'synthetic',checked:0,totalNotes:0,totalPedalCC:0,
 shortNotesBelow25ms:0,works:[]};
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1300,height:850}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(window.__prototypeTest?.parseMidi));
 const cases=[];
 if(real){
  const zip=fs.readFileSync(zipPath);
  const locked=JSON.parse(fs.readFileSync(path.join(root,'research/maestro-v3-measured-qa-pins.json'),'utf8'));
  assert.equal(sha(zip),locked.provenance.official_midi_zip_sha256,'Official MAESTRO v3 source SHA mismatch');
  const metadata=validateMetadata(parseCsv(fs.readFileSync(csvPath,'utf8'))).rows;
  const archive=openMidiZip(zip),entries=locateMidiEntries(archive,metadata);
  assert.equal(locked.works.length,24);
  for(const pin of locked.works){
   assert.ok(['train','validation','test'].includes(pin.split));
   const source=archive.extract(entries.get(pin.midi_filename));
   assert.equal(sha(source),pin.midi_sha256,'Source MIDI changed: '+pin.midi_filename);
   cases.push({id:pin.midi_filename,bytes:source});
  }
 }else cases.push({id:'synthetic-mae03a-tempo-short-staccato-pedal-unison.mid',bytes:synthetic()});
 for(const item of cases){
  const original=maestroReferenceEvents(item.bytes);
  const actual=await page.evaluate(payload=>{
   const song=window.__prototypeTest.parseMidi(new Uint8Array(payload),'golden.mid');
   return {notes:song.tracks.flatMap(t=>t.notes),cc:song.audioEvents.filter(e=>e.type==='cc')};
  },[...item.bytes]);
  const compare=strictMatch(original,actual,item.id);
  report.checked++;report.totalNotes+=compare.source_note_count;
  report.totalPedalCC+=compare.source_cc_events;report.shortNotesBelow25ms+=compare.short_source_notes;
  report.works.push({source:item.id,notes:compare.source_note_count,pedal_cc:compare.source_cc_events,
   tempo_changes:compare.source_active_tempos,short_notes:compare.short_source_notes,
   note_signature:compare.source_signature,pedal_signature:compare.source_cc_signature});
 }
 assert.deepEqual(errors,[]);
 if(real){
  assert.equal(report.checked,24,'All 24 SHA-pinned real files must be compared');
  assert.equal(report.totalNotes,143923,'Frozen official corpus note count unexpectedly changed');
 }
 if(process.env.MAESTRO_ENGINE_REPORT){
  fs.mkdirSync(path.dirname(process.env.MAESTRO_ENGINE_REPORT),{recursive:true});
  fs.writeFileSync(process.env.MAESTRO_ENGINE_REPORT,JSON.stringify(report,null,2)+'\n');
 }
 console.log('MAESTRO_ENGINE_GOLDEN_OK '+JSON.stringify({checked:report.checked,
  sourceNotes:report.totalNotes,pedalCC:report.totalPedalCC,notesUnder25ms:report.shortNotesBelow25ms,real}));
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
