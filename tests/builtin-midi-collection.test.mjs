import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {inspectBuiltinMidiPack} from '../scripts/builtin-midi-pack.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compressed=fs.readFileSync(path.join(root,'dist/assets/builtin-midi/collection.zlib'));
const raw=inflateSync(compressed,{maxOutputLength:1024*1024});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/assets/builtin-midi/catalog.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('162 original owner-supplied MIDI bytes are preserved exactly in the packaged dist',()=>{
 const rebuilt=inspectBuiltinMidiPack(raw);
 assert.deepEqual(manifest,rebuilt);
 assert.equal(rebuilt.count,162);
 assert.equal(rebuilt.uncompressedBytes,380025);
 assert.equal(rebuilt.rawSha256,'492bebd7bbe982d1db20d902ddb6cc025faf3d1900de31c855552eaf2f344d1e');
 assert.equal(new Set(rebuilt.files.map(f=>f.filename.toLowerCase())).size,162);
 for(const file of rebuilt.files){
  const midi=raw.subarray(file.offset,file.offset+file.length);
  assert.equal(sha(midi),file.sha256,'SMF must remain bit-exact: '+file.filename);
  assert.equal(midi.toString('ascii',0,4),'MThd');
 }
 assert.ok(rebuilt.files.some(f=>f.filename==='Megalovania.mid'));
 assert.ok(rebuilt.files.some(f=>f.filename==='Amazing Grace.mid'));
 assert.ok(rebuilt.files.some(f=>f.filename==='FNaF 1.mid'));
});
test('owner MIDI pack reader rejects corruption and data appended beyond 162 files',()=>{
 assert.throws(()=>inspectBuiltinMidiPack(Buffer.concat([raw,Buffer.from([1])])),/Trailing/);
 const mutated=Buffer.from(raw);mutated[0]=0;
 assert.throws(()=>inspectBuiltinMidiPack(mutated),/header/);
});
