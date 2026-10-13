/**
 * QA-01 independent immutable-asset tripwires.
 * Baseline: main c41241b28edd90103b703222f2990f1de5205a50 (2026-10-13).
 * Run explicitly: node --test tests/qa-baseline-integrity.test.mjs
 * This verifies original bytes and catalogs, NOT audible GM PCM or musical merit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream, readFileSync, readdirSync, statSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base='src/assets/finger-guidance/poses';
const posePins=Object.freeze({
 'left/left-index.png':'be733152f4dd48a10790eb0db9b6f2d299eb2e58',
 'left/left-middle.png':'5827a15312f060072a53612160d06a29c1c73c32',
 'left/left-pinky.png':'5c474d86c2cfee7297aae8617201982f68cfc729',
 'left/left-rest.png':'a49a01785297800ff9de1bacf3767dd76311091c',
 'left/left-ring.png':'10617f1f7efbb96577397032b885a572173cd6d0',
 'left/left-spread.png':'ef66c40e9a8c0c497ea05e623b1acb245f30c2c2',
 'left/left-thumb.png':'f46acec145bebf15a10b2163430a16da1622b91a',
 'right/right-index.png':'594d50c21c7e9a1a239a1b4ca5df47f62bc2d278',
 'right/right-middle.png':'637acc0612f8645f023b8f2930f966dda03061d7',
 'right/right-pinky.png':'f250467de516f01085ba1e595ebbd935bc0a5b25',
 'right/right-rest.png':'839e670b5596d6a5eed163cfdd45ae0869ea8ee3',
 'right/right-ring.png':'341a53cf73027ab50ef69e36353ce7a60b74e47c',
 'right/right-spread.png':'63794a3d8c830117325ee75897d27d8af5907e36',
 'right/right-thumb.png':'f724a40201a247df9df87428d737c0aec8ed796a'
});
const bankPins=Object.freeze({
 'generaluser-gs-2.0.3-sf2':{
  file:'GeneralUser-GS-2.0.3.sf2',size:32319396,
  sha256:'9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
 },
 'musescore-general-0.2-sf3':{
  file:'MuseScore_General.sf3',size:39900972,
  sha256:'5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3'
 }
});
const protectedTextPins=Object.freeze({
 'src/assets/audio/soundfont-manifest.json':'f57aec9b89f13d40191ff0b276d853b807217a15',
 'src/legacy/parts/135-maestro-catalog.js':'b80d05b040a1bfbd6f0979c06464ce4895e66887',
 'scripts/maestro-corpus.mjs':'a9c1e6e69876db98097aed3d9fe4f4549e74d149',
 'scripts/maestro-midi-audit.mjs':'7359ded976af3c7a8d6b8ba59ea61639b4cdbbf9',
 'scripts/maestro-diversity.mjs':'cc9b9ebf586509886192f0409241c9dd38c40c43',
 'research/maestro-v3-measured-qa-pins.json':'d5a12536df605cfc67b784e07403fac616a43ee5'
});

/** Compute the actual Git blob ID from working-tree bytes, not Git index metadata. */
async function fileDigests(relative){
 const absolute=path.join(root,relative);
 const meta=lstatSync(absolute);
 assert.ok(meta.isFile(),relative+' must be a regular file, not a link');
 const gitSha=createHash('sha1').update('blob '+meta.size+'\0');
 const sha256=createHash('sha256');
 let n=0;
 for await(const chunk of createReadStream(absolute)){
  n+=chunk.length;gitSha.update(chunk);sha256.update(chunk);
 }
 assert.equal(n,meta.size,relative+' changed while being read');
 return {size:n,gitSha:gitSha.digest('hex'),sha256:sha256.digest('hex')};
}

test('QA-01: original 14 PNG poses are complete and byte-for-byte unchanged',async()=>{
 const actual=['left','right'].flatMap(hand=>
  readdirSync(path.join(root,base,hand))
   .filter(name=>name.toLowerCase().endsWith('.png'))
   .map(name=>hand+'/'+name)).sort();
 assert.deepEqual(actual,Object.keys(posePins).sort());
 for(const [relative,sha] of Object.entries(posePins)){
  const full=path.join(base,relative);
  assert.equal((await fileDigests(full)).gitSha,sha,'original PNG modified: '+full);
  assert.deepEqual([...readFileSync(path.join(root,full)).subarray(0,8)],
   [137,80,78,71,13,10,26,10],full+' is not PNG');
 }
});

test('QA-01: both original bank bytes and 128+128 GM inventory contracts stay pinned',async()=>{
 const manifest=JSON.parse(readFileSync(path.join(root,'src/assets/audio/soundfont-manifest.json'),'utf8'));
 assert.equal(manifest.banks.length,2);
 assert.equal(manifest.defaultBankId,'generaluser-gs-2.0.3-sf2');
 assert.deepEqual(manifest.banks.map(x=>x.id).sort(),Object.keys(bankPins).sort());
 for(const bank of manifest.banks){
  const pin=bankPins[bank.id],relative='src/assets/audio/soundfonts/'+pin.file;
  assert.equal(bank.sha256,pin.sha256,bank.id+' manifest hash mismatch');
  assert.equal(bank.bytes,pin.size,bank.id+' manifest size mismatch');
  assert.equal(bank.inventory.gmBank0Programs,128,bank.id+' GM inventory not 128');
  assert.equal(bank.filename,'soundfonts/'+pin.file);
  const measured=await fileDigests(relative);
  assert.equal(measured.size,pin.size,relative+' size changed');
  assert.equal(measured.sha256,pin.sha256,relative+' bank bytes changed');
 }
 // This inventory+hash gate MUST NOT be interpreted as 256 audible programs.
});

test('QA-01: MAESTRO catalog/audit code and bank manifest match pinned main',async()=>{
 for(const [relative,pin] of Object.entries(protectedTextPins)){
  assert.equal((await fileDigests(relative)).gitSha,pin,
   'protected baseline content changed: '+relative);
 }
});

test('QA-01: manifest and test data are not modified by integrity audit',()=>{
 assert.equal(Object.keys(posePins).length,14);
 assert.equal(Object.keys(bankPins).length,2);
 assert.equal(Object.keys(protectedTextPins).length,6);
 assert.equal(statSync(path.join(root,'src/assets/audio/soundfont-manifest.json')).isFile(),true);
});
