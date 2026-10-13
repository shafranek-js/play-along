import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {parseSoundFontPresetHeaders, validateSoundfontManifest} from '../scripts/audio-assets.mjs';

const gmRows=Array.from({length:128},(_,program)=>({name:`GM Program ${String(program).padStart(3,'0')}`,program,soundfontBank:0,isDrum:false}));

function phdrRecord({name,program,soundfontBank}){
 const row=Buffer.alloc(38);
 Buffer.from(name,'latin1').copy(row,0,0,20);
 row.writeUInt16LE(program,20);
 row.writeUInt16LE(soundfontBank,22);
 return row;
}

function riffChunk(id,payload){
 const header=Buffer.alloc(8);
 header.write(id,0,'ascii');
 header.writeUInt32LE(payload.length,4);
 return Buffer.concat([header,payload,payload.length%2?Buffer.from([0]):Buffer.alloc(0)]);
}

function makeSoundFont(rows=gmRows,terminal={name:'EOP',program:0,soundfontBank:0}){
 const phdr=Buffer.concat([...rows,terminal].map(phdrRecord));
 const pdta=Buffer.concat([Buffer.from('pdta','ascii'),riffChunk('phdr',phdr)]);
 const list=riffChunk('LIST',pdta);
 const form=Buffer.concat([Buffer.from('sfbk','ascii'),list]);
 const riff=Buffer.alloc(8);
 riff.write('RIFF',0,'ascii');
 riff.writeUInt32LE(form.length,4);
 return Buffer.concat([riff,form]);
}

function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}

function makeFixture(){
 const bankBytes=makeSoundFont();
 const license=Buffer.from('fixture license\n');
 const notice=Buffer.from('fixture attribution notice\n');
 const catalog=Buffer.from(JSON.stringify({
  schemaVersion:1,
  bankId:'fixture-sf2',
  counts:{activePresetHeaders:128,gmBank0Programs:128,instrumentPresets:128,drumKitPresetsBank128:0,drumKitAliasesBank120:0},
  presets:gmRows,
 }));
 const assets=new Map([
  ['soundfonts/fixture.sf2',bankBytes],
  ['soundfonts/fixture-presets.json',catalog],
  ['soundfonts/LICENSE.txt',license],
  ['soundfonts/NOTICE.md',notice],
 ]);
 const manifest={
  schemaVersion:1,
  defaultBankId:'fixture-sf2',
  banks:[{
   id:'fixture-sf2',name:'Fixture SoundFont',format:'SF2',
   filename:'soundfonts/fixture.sf2',url:'soundfonts/fixture.sf2',
   bytes:bankBytes.length,sha256:sha256(bankBytes),
   inventory:{catalogPath:'soundfonts/fixture-presets.json',catalogBytes:catalog.length,catalogSha256:sha256(catalog),activePresetHeaders:128,gmBank0Programs:128,terminalRecordName:'EOP'},
   license:{name:'Fixture License',path:'soundfonts/LICENSE.txt',bytes:license.length,sha256:sha256(license)},
   noticeFiles:['soundfonts/LICENSE.txt','soundfonts/NOTICE.md'],
   deliveryNotice:{path:'soundfonts/NOTICE.md',bytes:notice.length,sha256:sha256(notice)},
  }],
 };
 return {manifest,assets,readAsset(relativePath){
  const bytes=assets.get(relativePath);
  if(!bytes)throw new Error(`Fixture asset is missing: ${relativePath}`);
  return bytes;
 }};
}

test('SoundFont RIFF parser reads pdta/phdr rows and includes the terminal header',()=>{
 const bytes=makeSoundFont(gmRows.slice(0,2));
 const rows=parseSoundFontPresetHeaders(bytes);
 assert.deepEqual(rows,[...gmRows.slice(0,2).map(({name,program,soundfontBank})=>({name,program,soundfontBank})),{name:'EOP',program:0,soundfontBank:0}]);
 assert.throws(()=>parseSoundFontPresetHeaders(Buffer.from('not a SoundFont')),/RIFF\/sfbk magic/);
 const truncated=Buffer.from(bytes);
 truncated.writeUInt32LE(truncated.readUInt32LE(4)+1,4);
 assert.throws(()=>parseSoundFontPresetHeaders(truncated),/RIFF length does not match/);
});

test('asset manifest validates actual phdr rows, inventory, hashes, notices, and default selection',()=>{
 const fixture=makeFixture();
 const result=validateSoundfontManifest(fixture.manifest,fixture.readAsset);
 assert.deepEqual([...result.copiedPaths].sort(),[
  'soundfonts/NOTICE.md','soundfonts/LICENSE.txt','soundfonts/fixture-presets.json','soundfonts/fixture.sf2',
 ].sort());
 const headers=parseSoundFontPresetHeaders(fixture.assets.get('soundfonts/fixture.sf2'));
 assert.equal(headers.length,129,'the active GM headers and terminal EOP are read from binary phdr');
 assert.equal(new Set(headers.slice(0,-1).filter(row=>row.soundfontBank===0).map(row=>row.program)).size,128);
});

test('asset validation rejects duplicate bank IDs before accepting a manifest',()=>{
 const fixture=makeFixture();
 fixture.manifest.banks.push(structuredClone(fixture.manifest.banks[0]));
 assert.throws(()=>validateSoundfontManifest(fixture.manifest,fixture.readAsset),/duplicate bank ID/);
});

test('asset validation rejects wrong bank size and SHA-256 metadata',()=>{
 const wrongSize=makeFixture();
 wrongSize.manifest.banks[0].bytes+=1;
 assert.throws(()=>validateSoundfontManifest(wrongSize.manifest,wrongSize.readAsset),/byte count mismatch/);

 const wrongHash=makeFixture();
 wrongHash.manifest.banks[0].sha256='0'.repeat(64);
 assert.throws(()=>validateSoundfontManifest(wrongHash.manifest,wrongHash.readAsset),/SHA-256 mismatch/);
});

test('asset validation rejects a bank whose actual phdr rows disagree with its catalog',()=>{
 const fixture=makeFixture();
 const changedRows=gmRows.map(row=>({...row}));
 changedRows[63].name='Altered in the bank only';
 const bankBytes=makeSoundFont(changedRows);
 fixture.assets.set('soundfonts/fixture.sf2',bankBytes);
 fixture.manifest.banks[0].bytes=bankBytes.length;
 fixture.manifest.banks[0].sha256=sha256(bankBytes);
 assert.throws(()=>validateSoundfontManifest(fixture.manifest,fixture.readAsset),/does not match binary phdr/);
});

test('asset validation rejects missing notice files and missing notice hash metadata',()=>{
 const absentFile=makeFixture();
 absentFile.assets.delete('soundfonts/NOTICE.md');
 assert.throws(()=>validateSoundfontManifest(absentFile.manifest,absentFile.readAsset),/Fixture asset is missing/);

 const absentMetadata=makeFixture();
 delete absentMetadata.manifest.banks[0].deliveryNotice;
 assert.throws(()=>validateSoundfontManifest(absentMetadata.manifest,absentMetadata.readAsset),/notice .* has no byte\/hash metadata/);
});

test('asset validation rejects incorrect terminal rows and corrupt catalog pins',()=>{
 const wrongTerminal=makeFixture();
 const bankBytes=makeSoundFont(gmRows,{name:'',program:0,soundfontBank:0});
 wrongTerminal.assets.set('soundfonts/fixture.sf2',bankBytes);
 wrongTerminal.manifest.banks[0].bytes=bankBytes.length;
 wrongTerminal.manifest.banks[0].sha256=sha256(bankBytes);
 assert.throws(()=>validateSoundfontManifest(wrongTerminal.manifest,wrongTerminal.readAsset),/terminal phdr name/);

 const wrongCatalogPin=makeFixture();
 wrongCatalogPin.manifest.banks[0].inventory.catalogSha256='f'.repeat(64);
 assert.throws(()=>validateSoundfontManifest(wrongCatalogPin.manifest,wrongCatalogPin.readAsset),/catalog SHA-256 mismatch/);
});
