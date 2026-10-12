import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {openMidiZip,locateMidiEntries,profileMidi,auditArchive} from '../scripts/maestro-midi-audit.mjs';
import {parseCsv,validateMetadata} from '../scripts/maestro-corpus.mjs';

const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
const vlq=n=>{const a=[n&127];while((n>>=7)>0)a.unshift((n&127)|128);return a};
function midi({bad=false}={}){
 const payload=Buffer.from([
  0,0xff,0x51,3,0x07,0xa1,0x20, // 500000us/quarter
  0,0x90,60,90,                 // C4 on
  0,0xb0,64,127,                // sustain down
  ...vlq(240),0x80,60,0,
  0,0x90,60,75,                 // repeated same pitch
  ...vlq(240),0x80,60,0,
  0,0xb0,66,127,0,0xb0,67,0,
  0,0xff,0x2f,0
 ]);
 return Buffer.concat([Buffer.from('MThd'),u32(6),u16(0),u16(1),u16(480),
  Buffer.from('MTrk'),u32(payload.length),bad?payload.subarray(0,-1):payload]);
}
function crc(bytes){
 let c=0xffffffff;
 for(const v of bytes){c^=v;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1}
 return (c^0xffffffff)>>>0;
}
function zip(records,{compressed=false}={}){
 const chunks=[],central=[];let offset=0;
 for(const {name,data} of records){
  const filename=Buffer.from(name),payload=compressed?deflateRawSync(data):data,method=compressed?8:0,checksum=crc(data);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);
  local.writeUInt32LE(checksum,14);local.writeUInt32LE(payload.length,18);
  local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
  chunks.push(local,filename,payload);
  const entry=Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);
  entry.writeUInt16LE(method,10);entry.writeUInt32LE(checksum,16);
  entry.writeUInt32LE(payload.length,20);entry.writeUInt32LE(data.length,24);
  entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);
  central.push(entry,filename);offset+=local.length+filename.length+payload.length;
 }
 const cd=Buffer.concat(central),tail=Buffer.alloc(22);
 tail.writeUInt32LE(0x06054b50,0);tail.writeUInt16LE(records.length,8);tail.writeUInt16LE(records.length,10);
 tail.writeUInt32LE(cd.length,12);tail.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,cd,tail]);
}
function data(){
 const rows=[],records=[];
 for(let i=0;i<1276;i++){
  const split=i<962?'train':i<1099?'validation':'test';
  const path=`2008/fake-${i}.midi`;
  rows.push([`Composer ${i%31}`,`Piece ${i%45}`,split,2008,path,`2008/fake-${i}.wav`,1].join(','));
  records.push({name:'maestro-v3.0.0/'+path,data:midi()});
 }
 return {csv:'canonical_composer,canonical_title,split,year,midi_filename,audio_filename,duration\n'+rows.join('\n')+'\n',records};
}
test('MIDI parser reports actual notes, repeated attacks, CC and velocity',()=>{
 const p=profileMidi(midi(),1);
 assert.equal(p.note_count,2);
 assert.equal(p.duration_seconds,0.5);
 assert.equal(p.cc_counts.sustain,1);
 assert.equal(p.cc_counts.sostenuto,1);
 assert.equal(p.cc_counts.una_corda,1);
 assert.equal(p.velocity.median,75);
 assert.equal(p.pitch_min,60);
 assert.equal(p.pitch_max,60);
 assert.equal(p.repeated_pitch_within_250ms,1);
 assert.equal(p.integrity.unpaired_note_off,0);
 assert.equal(p.max_simultaneous_held_notes,1);
});
test('reject truncated / malformed standard MIDI',()=>{
 assert.throws(()=>profileMidi(midi({bad:true})),/MIDI_TRACK_BOUNDS/);
 assert.throws(()=>profileMidi(Buffer.from('not a MIDI')),/MIDI_SIZE_UNSUPPORTED/);
});
test('full 1276-entry ZIP supports stored and DEFLATE with CRC checks',()=>{
 const fixture=data();
 const bytes=zip(fixture.records,{compressed:true});
 const archive=openMidiZip(bytes);
 assert.equal(archive.entries.size,1276);
 const first=archive.extract('maestro-v3.0.0/2008/fake-0.midi');
 assert.deepEqual(first,midi());
 const mapped=locateMidiEntries(archive,validateMetadata(parseCsv(fixture.csv)).rows);
 assert.equal(mapped.size,1276);
});
test('reject corruption of compressed payload via CRC/inflate',()=>{
 const fixture=data(),bytes=zip(fixture.records.slice(0,1276));
 const archive=openMidiZip(bytes);
 // Flip one note byte in the first local record without updating CRC.
 bytes[30+Buffer.byteLength('maestro-v3.0.0/2008/fake-0.midi')+15]^=1;
 assert.throws(()=>archive.extract('maestro-v3.0.0/2008/fake-0.midi'),/ZIP_ENTRY_CRC_OR_LENGTH_MISMATCH/);
});
test('reject duplicate, missing, traversal ZIP and unexpected file names',()=>{
 const fixture=data(),raw=midi();
 assert.throws(()=>openMidiZip(zip([...fixture.records.slice(0,-1),{name:'../escape.midi',data:raw}])),/ZIP_UNSAFE_ENTRY_PATH/);
 assert.throws(()=>openMidiZip(zip([...fixture.records.slice(0,-1),fixture.records[0]])),/ZIP_DUPLICATE_ENTRY/);
 const modified=zip(fixture.records.slice(0,-1));
 assert.throws(()=>openMidiZip(modified),/ZIP_CENTRAL_DIRECTORY_INVALID/);
 const changed=[...fixture.records];changed[0]={name:'maestro-v3.0.0/other.midi',data:raw};
 assert.throws(()=>locateMidiEntries(openMidiZip(zip(changed)),validateMetadata(parseCsv(fixture.csv)).rows),/ARCHIVE_UNMATCHED/);
});
test('strict audit rejects inauthentic archive and verifies synthetic byte-backed 24 records in test mode',()=>{
 const fixture=data(),archive=zip(fixture.records,{compressed:true});
 assert.throws(()=>auditArchive(fixture.csv,archive),/ARCHIVE_SHA256_MISMATCH/);
 const report=auditArchive(fixture.csv,archive,{requireOfficialHash:false});
 assert.equal(report.validation.archive_midi_count,1276);
 assert.equal(report.validation.all_metadata_paths_matched,true);
 assert.equal(report.validation.archive_sha256_verified,false);
 assert.equal(report.works.length,24);
 assert.equal(report.summary.sample_notes,48);
 assert.equal(report.summary.samples_with_cc64,24);
 assert.equal(report.summary.samples_with_cc66,24);
 assert.equal(report.summary.samples_with_cc67,24);
 assert.ok(report.works.every(w=>/^[a-f0-9]{64}$/.test(w.midi_sha256)));
 assert.equal(report.works[0].profile.note_count,2);
 assert.deepEqual(report, auditArchive(fixture.csv,archive,{requireOfficialHash:false}));
});
