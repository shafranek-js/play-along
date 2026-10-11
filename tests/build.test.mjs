import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('dist/assets/app.js');
const html=read('dist/index.html');
const css=read('dist/assets/app.css');
const manifest=JSON.parse(read('scripts/manifest.json'));
const featureSource=manifest.features.map(name=>read('src/legacy/parts/'+name)).join('');
const musicPrelude=['music-time.mjs','music-bars.mjs'].map(f=>read('src/core/'+f).replace(/^export /gm,'')).join('\n');

test('all feature parts form exactly one valid JavaScript bundle',()=>{
 assert.equal(manifest.features.length,21);
 const expected="\n(()=>{'use strict';\n"+musicPrelude+'\n'+featureSource.replace("window.__playAlongVersion='0.9.1'","window.__playAlongVersion='0.10.30'")+"})();\n";
 assert.equal(js,expected);
 execFileSync(process.execPath,['--check',path.join(root,'dist/assets/app.js')]);
});
test('CSS and HTML are separate, all expected DOM anchors exist',()=>{
 assert.equal(css,read('src/styles/app.css'));
 assert.match(html,/href="\.\/assets\/app\.css"/);
 assert.match(html,/defer src="\.\/assets\/app\.js"/);
 assert.doesNotMatch(html,/<style>|<script>/);
 for(const id of ['playBtn','viewRoll','viewSheet','sheetCanvas','rollWrap','librarySourceSelect','asapSync','museTrainerSync','mutopiaSync','connectMidi','songList']){
  assert.ok(html.includes(`id="${id}"`),`Missing UI ID ${id}`);
 }
});
test('preserved features: MIDI auto connection, Wait, OSMD, imports, catalogs',()=>{
 for(const term of ['requestMIDIAccess','onstatechange','waitReleasePitches','holdForInput','scoreEnsureRendered','opensheetmusicdisplay.min.js','mutopiaLoadIndex','museTrainerLoadIndex','asapLoadIndex','zipUnpackMXL','readMusicXML','parseMidi','indexedDB']) assert.ok(js.includes(term),`Missing ${term}`);
 assert.ok(js.includes("window.__playAlongVersion='0.10.30'"));
 assert.ok(js.includes('function musicCreateTempoTimeline('));
 assert.ok(js.includes('function musicSecondsToBeat('));
 assert.ok(js.includes('function musicBarGrid('));
});
test('build is deterministic',()=>{
 const h=crypto.createHash('sha256').update(js).digest('hex');
 execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')]);
 assert.equal(crypto.createHash('sha256').update(read('dist/assets/app.js')).digest('hex'),h);
});

test('migration baseline retained for auditing; CSS preserved',()=>{
 const baseline=JSON.parse(read('scripts/source_baseline.json'));
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const original="\n(()=>{'use strict';\n"+featureSource+"})();\n";
 assert.match(baseline.js_sha256,/^[a-f0-9]{64}$/);
 assert.ok(original.includes('zipInflateBounded'));
 assert.ok(original.includes('backupCreate')); 
 const legacyCss=css.split('/* FG-00 appended styles; original CSS above is unchanged. */')[0];
 assert.equal(hash(legacyCss.replace(/\r\n/g,'\n')),baseline.css_sha256);
 assert.match(css,/\.fingerGuideControls\{/);
});

test('all 14 original user PNG hand poses are packaged with intact RGBA bytes',()=>{
 const poses=['thumb','index','middle','ring','pinky','rest','spread'];
 let count=0;
 for(const side of ['left','right'])for(const pose of poses){
  const name=side+'-'+pose+'.png';
  const rel='assets/finger-guidance/poses/'+side+'/'+name;
  const original=fs.readFileSync(path.join(root,'src',rel));
  const deployed=fs.readFileSync(path.join(root,'dist',rel));
  assert.ok(original.length>10000,'full-quality PNG: '+rel);
  assert.equal(original.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(original.readUInt32BE(16)>=290&&original.readUInt32BE(20)>=520,rel);
  assert.equal(original[25],6,'RGBA PNG with alpha: '+rel);
  assert.deepEqual(deployed,original,'build must not alter the user asset: '+rel);
  count++;
 }
 assert.equal(count,14);
});
