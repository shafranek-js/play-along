/** Reproducible build of the user-supplied 162-file MIDI archive.
 * Source is solid zlib+base64 only to keep the Git repository small.
 * Every member is validated; the browser receives the original SMF bytes,
 * not a regenerated performance.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliDecompressSync,deflateSync} from 'node:zlib';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function inspectBuiltinMidiPack(raw){
 if(!Buffer.isBuffer(raw)||raw.length<6||raw.length>1024*1024||
   raw.toString('ascii',0,4)!=='PAM1')throw Error('Invalid built-in MIDI pack header');
 const count=raw.readUInt16LE(4);
 if(count<1||count>300)throw Error('Invalid built-in MIDI count');
 let offset=6;const files=[],names=new Set();
 for(let index=0;index<count;index++){
  if(offset+6>raw.length)throw Error('Truncated built-in MIDI record');
  const nameLength=raw.readUInt16LE(offset),length=raw.readUInt32LE(offset+2);
  offset+=6;
  if(nameLength<5||nameLength>240||length<22||length>4_000_000||
    offset+nameLength+length>raw.length)throw Error('Out-of-bounds built-in MIDI file');
  const nameBytes=raw.subarray(offset,offset+nameLength);
  const filename=new TextDecoder('utf-8',{fatal:true}).decode(nameBytes);
  offset+=nameLength;
  if(!/^[^\/\\\x00-\x1f]+\.mid$/i.test(filename)||filename==='.'||filename==='..'||
      filename!==filename.normalize('NFC')||names.has(filename.toLowerCase()))
   throw Error('Unsafe or duplicate built-in MIDI filename: '+filename);
  names.add(filename.toLowerCase());
  if(raw.toString('ascii',offset,offset+4)!=='MThd'||
     raw.readUInt32BE(offset+4)!==6)
   throw Error('Invalid original SMF: '+filename);
  const bytes=raw.subarray(offset,offset+length);
  files.push({id:'builtin-midi:'+index,filename,title:filename.slice(0,-4),
   offset,length,sha256:digest(bytes)});
  offset+=length;
 }
 if(offset!==raw.length)throw Error('Trailing unverified MIDI bytes');
 return {schemaVersion:1,count,uncompressedBytes:raw.length,
  rawSha256:digest(raw),files};
}
export function writeBuiltinMidiPack(root,dist){
 const sourceDir=path.join(root,'src/assets/builtin-midi/parts');
 const parts=fs.readdirSync(sourceDir).filter(name=>/^part-[0-9]{2}\.b64$/.test(name)).sort();
 if(parts.length!==6)throw Error('Expected six owner MIDI archive chunks');
 const encoded=parts.map(name=>fs.readFileSync(path.join(sourceDir,name),'utf8').trim()).join('');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4)
  throw Error('Invalid base64 source MIDI pack');
 const compressed=Buffer.from(encoded,'base64');
 if(compressed.length>300_000)throw Error('Built-in MIDI payload too large');
 const unpacked=brotliDecompressSync(compressed,{maxOutputLength:1024*1024});
 const catalog=inspectBuiltinMidiPack(unpacked);
 if(catalog.count!==162)throw Error('User MIDI collection changed: expected 162 original files');
 const dst=path.join(dist,'assets/builtin-midi');
 fs.mkdirSync(dst,{recursive:true});
 fs.writeFileSync(path.join(dst,'collection.zlib'),deflateSync(unpacked,{level:9}));
 fs.writeFileSync(path.join(dst,'catalog.json'),JSON.stringify(catalog));
 return catalog;
}
