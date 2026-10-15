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
const musicPrelude=['music-time.mjs','music-bars.mjs','finger-guidance-timeline.mjs','finger-guidance-hand-transition.mjs','musicxml-note-identity.mjs','finger-overrides.mjs','finger-override-history.mjs','finger-note-selection.mjs','sheet-fingering-overlay.mjs','external-fingering-evaluation.mjs','musicxml-fingering-export.mjs','fingering-edition-reconcile.mjs','finger-editor-geometry.mjs','fingering-coverage.mjs','pianomotion-song-to-midi.mjs','pianomotion-review.mjs','pianomotion-physical-audit.mjs','original-midi-session.mjs','hand-span-calibration.mjs','library-section-layout.mjs'].map(f=>read('src/core/'+f).replace(/^export /gm,'')).join('\n');

test('all feature parts form exactly one valid JavaScript bundle',()=>{
 assert.equal(manifest.features.length,23);
 const expected="\n(()=>{'use strict';\n"+musicPrelude+'\n'+featureSource.replace("window.__playAlongVersion='0.9.1'","window.__playAlongVersion='"+JSON.parse(read('package.json')).version+"'")+"})();\n";
 assert.equal(js,expected);
 execFileSync(process.execPath,['--check',path.join(root,'dist/assets/app.js')]);
 // Compile browser smoke scripts during unit CI so syntax mistakes fail fast,
 // before the much slower sequential real-Chromium regression run.
 execFileSync(process.execPath,['--check',path.join(root,'tests/launch02-hand-crossfade.real.test.mjs')]);
 execFileSync(process.execPath,['--check',path.join(root,'tests/launch02-continuous-hand.real.test.mjs')]);
 execFileSync(process.execPath,['--check',path.join(root,'tests/finger-guidance-ranges.real.test.mjs')]);
 execFileSync(process.execPath,['--check',path.join(root,'tests/hybrid-panels.real.test.mjs')]);
});
test('public beta fingering has explicit no-expert warning and does not gate user Apply',()=>{
 const original=read('src/index.html');
 assert.match(original,/id="pianoMotionBetaNotice"/);
 assert.match(original,/не проверена профессиональным пианистом/);
 assert.match(original,/id="pianoMotionCalculate"[^>]*>🧠 Предложить аппликатуру/);
 assert.match(original,/id="pianoMotionApply"/);
 assert.match(original,/id="pianoMotionExportXML"/);
 assert.match(js,/pianoMotionReviewApply\(/);
 assert.doesNotMatch(js,/if\s*\(\s*(?:result\.)?expertValidated\s*===?\s*false\s*\)\s*return/);
});

test('CSS and HTML are separate, all expected DOM anchors exist',()=>{
 assert.equal(css,read('src/styles/app.css'));
 assert.ok(html.includes(`href="./assets/app.css?v=${JSON.parse(read('package.json')).version}"`));
 assert.ok(html.includes(`defer src="./assets/app.js?v=${JSON.parse(read('package.json')).version}"`));
 assert.doesNotMatch(html,/<style>|<script>/);
 for(const id of ['playBtn','viewRoll','viewSheet','sheetCanvas','rollWrap','librarySourceSelect','asapSync','maestroSync','filterMaestro','maestroZipFile','museTrainerSync','mutopiaSync','connectMidi','songList','fingerGuideLookahead']){
  assert.ok(html.includes(`id="${id}"`),`Missing UI ID ${id}`);
 }
});
test('HTML visible branding, browser tab and asset revisions are derived only from package.json',()=>{
 const pkg=JSON.parse(read('package.json'));
 const source=read('src/index.html');
 const token='__PLAY_ALONG_VERSION__';
 assert.equal(source.split(token).length-1,5,'All three labels and both resource URLs must be templated');
 assert.equal(html,source.split(token).join(pkg.version),
  'Build must stamp all five version slots from package.json, without changing other HTML');
 assert.ok(html.includes('Standalone · v'+pkg.version),'Visible header must be current');
 assert.ok(html.includes('<title>Play Along · v'+pkg.version),'Browser tab must be current');
 assert.ok(html.includes('INTERACTIVE SCORE v'+pkg.version),'Initial score label must be current');
 assert.ok(!html.includes(token),'Release template token must never be visible in deployed HTML');
 assert.ok(!html.includes('v0.10.41'),'Old hardcoded version must not leak into new builds');
});
test('preserved features: MIDI auto connection, Wait, OSMD, imports, catalogs',()=>{
 for(const term of ['requestMIDIAccess','onstatechange','waitReleasePitches','holdForInput','scoreEnsureRendered','opensheetmusicdisplay.min.js','mutopiaLoadIndex','museTrainerLoadIndex','asapLoadIndex','zipUnpackMXL','readMusicXML','parseMidi','indexedDB']) assert.ok(js.includes(term),`Missing ${term}`);
 assert.ok(js.includes("window.__playAlongVersion='"+JSON.parse(read('package.json')).version+"'"));
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


test('README current version and release history match package.json',()=>{
 const pkg=JSON.parse(read('package.json')),readme=read('README.md');
 const title=readme.split(/\r?\n/,1)[0];
 assert.equal(title,'# Play Along — Piano Practice App (v'+pkg.version+')');
 const escaped=pkg.version.replace(/\./g,'\\.');
 assert.match(readme,new RegExp('^## .+\\(v'+escaped+'\\)$','m'),
  'A new version requires substantive release notes in README.md');
 assert.match(readme,/Release documentation rule/);
});

test('audio sidecar ships the pinned bank, complete GM inventory, and notices bit-for-bit',()=>{
 const sourceBase='src/assets/audio';
 const distBase='dist/assets/audio';
 const sourceManifest=JSON.parse(read(sourceBase+'/soundfont-manifest.json'));
 const deployedManifest=JSON.parse(read(distBase+'/soundfont-manifest.json'));
 assert.equal(sourceManifest.schemaVersion,1);
 assert.deepEqual(deployedManifest,sourceManifest,'deployed manifest must match the reviewed source manifest');
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(sourceManifest.banks.length,2,'both supported banks must be selectable');
 assert.equal(sourceManifest.defaultBankId,'generaluser-gs-2.0.3-sf2','GeneralUser is the provisional default');
 assert.ok(sourceManifest.banks.reduce((total,bank)=>total+bank.bytes,0)<80*1024*1024,
  'the two-bank delivery must remain inside the approved 80 MiB asset budget');
 const expected={
  'generaluser-gs-2.0.3-sf2':{format:'SF2',bytes:32319396,sha256:'9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe',active:287,instruments:261,drums:13,aliases:13,notices:{
   'soundfonts/GeneralUser-GS-LICENSE.txt':[2317,'7b32efefdf95ce38a043799f0659853ddc00fbaa14d8c50f0aca16b9b8b405be'],
   'soundfonts/GeneralUser-GS-README.md':[67719,'fb23217ca2a9cf199e04aed1b04a7e81e024330411941c3638302e081584c151'],
  }},
  'musescore-general-0.2-sf3':{format:'SF3',bytes:39900972,sha256:'5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3',active:309,instruments:272,drums:37,aliases:0,notices:{
   'soundfonts/MuseScore_General_License.md':[3419,'5ad8d737e13c7f01f5b9674872a82a92b4ba253603e8ed14b9db12293550b4b9'],
   'soundfonts/MuseScore_General_Readme.md':[5161,'e4ee85d097cda49a7926ea73e59ea8b7bb90d6ad715f82d20c6bfddf5dcfeb4c'],
   'soundfonts/MuseScore_General_VERSION':[6,'1f930dd1f133c1f97a94fe3acb8db34372cf4c01ffdb2b3ff4ca72f9494121e9'],
   'soundfonts/MuseScore_General_Sample_Sources.csv':[12817,'cbec757614fa47d2ba71a2f1276bf010918261d94987cfb678352e9755e9bdd4'],
  }},
 };
 for(const bank of sourceManifest.banks){
  const pin=expected[bank.id];
  assert.ok(pin,'unexpected bank ID: '+bank.id);
  assert.equal(bank.format,pin.format);
  assert.equal(bank.bytes,pin.bytes);
  assert.equal(bank.sha256,pin.sha256);
  assert.ok(bank.source&&bank.license,'bank provenance and license identity are required');
  assert.ok(Array.isArray(bank.noticeFiles)&&bank.noticeFiles.length>=2,'notice list is part of the packaged bank contract');
  for(const relative of [bank.filename,bank.inventory.catalogPath,...bank.noticeFiles]){
   assert.ok(relative.startsWith('soundfonts/'),'asset path must stay inside the bank directory: '+relative);
   const sourceBytes=fs.readFileSync(path.join(root,sourceBase,relative));
   const deployedBytes=fs.readFileSync(path.join(root,distBase,relative));
   assert.ok(sourceBytes.length>0,'source asset must not be empty: '+relative);
   assert.deepEqual(deployedBytes,sourceBytes,'production asset must be copied without mutation: '+relative);
  }
  const noticeMetadata=[bank.license,...bank.attributionFiles];
  for(const notice of noticeMetadata){
   assert.ok(bank.noticeFiles.includes(notice.path),'each license/provenance record must be included in noticeFiles');
   const noticePin=pin.notices[notice.path];
   assert.ok(noticePin,'unexpected notice file: '+notice.path);
   assert.deepEqual([notice.bytes,notice.sha256],noticePin,'notice pin must remain exact: '+notice.path);
   const noticeBytes=fs.readFileSync(path.join(root,sourceBase,notice.path));
   assert.equal(noticeBytes.length,noticePin[0]);
   assert.equal(digest(noticeBytes),noticePin[1]);
  }
  assert.ok(bank.deliveryNotice&&bank.noticeFiles.includes(bank.deliveryNotice.path),
   'generated delivery notice must be listed among the packaged bank notices');
  const deliveryNoticeBytes=fs.readFileSync(path.join(root,sourceBase,bank.deliveryNotice.path));
  assert.equal(deliveryNoticeBytes.length,bank.deliveryNotice.bytes,'delivery notice byte count must match the manifest');
  assert.equal(digest(deliveryNoticeBytes),bank.deliveryNotice.sha256,'delivery notice must match its current manifest hash');
  const sourceBytes=fs.readFileSync(path.join(root,sourceBase,bank.filename));
  assert.equal(sourceBytes.length,bank.bytes,'source byte count must match pinned manifest');
  assert.equal(digest(sourceBytes),bank.sha256,'source bank must match its pinned SHA-256');
  assert.equal(digest(fs.readFileSync(path.join(root,distBase,bank.filename))),bank.sha256,'deployed bank must retain its source pin');
  assert.equal(sourceBytes.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(sourceBytes.subarray(8,12).toString('ascii'),'sfbk');
  assert.equal(bank.inventory.activePresetHeaders,pin.active);
  assert.equal(bank.inventory.gmBank0Programs,128);
  assert.equal(bank.inventory.drumKitPresetsBank128,pin.drums);
  assert.equal(bank.inventory.drumKitAliasesBank120,pin.aliases);
  const catalogPath=sourceBase+'/'+bank.inventory.catalogPath;
  const catalogRecord=JSON.parse(read(catalogPath));
  const deployedCatalogRecord=JSON.parse(read(distBase+'/'+bank.inventory.catalogPath));
  assert.deepEqual(deployedCatalogRecord,catalogRecord,'deployed preset inventory must match the source catalog');
  assert.equal(catalogRecord.schemaVersion,1,'preset catalog schema is versioned');
  assert.equal(catalogRecord.bankId,bank.id,'preset catalog must identify its pinned bank');
  assert.deepEqual(catalogRecord.counts,{activePresetHeaders:pin.active,gmBank0Programs:128,instrumentPresets:pin.instruments,drumKitPresetsBank128:pin.drums,drumKitAliasesBank120:pin.aliases},
   'preset catalog summary must match the pinned inventory categories');
  const inventory=catalogRecord.presets;
  assert.ok(Array.isArray(inventory),'preset catalog contains the parsed active preset rows');
  const catalogBytes=fs.readFileSync(path.join(root,catalogPath));
  assert.equal(catalogBytes.length,bank.inventory.catalogBytes);
  assert.equal(digest(catalogBytes),bank.inventory.catalogSha256);
  assert.equal(inventory.length,pin.active,'terminal phdr records are excluded from the active preset catalog');
  const gm=inventory.filter(p=>p.soundfontBank===0&&!p.isDrum&&p.program>=0&&p.program<=127);
  assert.equal(gm.length,128,'all 128 melodic GM programs must be present');
  assert.deepEqual([...new Set(gm.map(p=>p.program))].sort((a,b)=>a-b),Array.from({length:128},(_,i)=>i));
  assert.ok(gm.every(p=>typeof p.name==='string'&&p.name.trim()),'GM inventory names must be nonempty');
  assert.equal(inventory.filter(p=>p.soundfontBank===128&&p.isDrum).length,pin.drums,'all raw bank-128 kits must be classified');
  assert.equal(inventory.filter(p=>p.soundfontBank===120&&p.isDrum&&p.aliasOf?.soundfontBank===128).length,pin.aliases,
   'bank-120 aliases must remain classified as drums and link to their bank-128 preset');
  const manifestUrl=new URL(bank.url,'https://example.test/play-along/assets/audio/soundfont-manifest.json');
  assert.equal(manifestUrl.origin,'https://example.test','bank URL must be same-origin');
  assert.ok(manifestUrl.pathname.startsWith('/play-along/assets/audio/soundfonts/'),
   'bank URL must resolve under the deployable /play-along/ subpath');
  assert.equal(path.posix.basename(manifestUrl.pathname),path.posix.basename(bank.filename));
 }
});

test('FG-04C9 deployed Python core includes prominent Hand-thesia provenance notice',()=>{
 const source=read('THIRD_PARTY_NOTICES.md');
 const deployed=read('dist/THIRD_PARTY_NOTICES.md');
 assert.equal(deployed,source,'distribution must keep original third-party source notice');
 assert.match(source,/V9011N\/pygame-piano-animator/);
 assert.match(source,/Not established for public redistribution/);
 const html=read('dist/index.html');
 assert.match(html,/Hand-thesia \(V9011N\)/);
 assert.match(html,/THIRD_PARTY_NOTICES\.md/);
});
