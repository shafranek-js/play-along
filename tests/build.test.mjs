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
const musicPrelude=['music-time.mjs','music-bars.mjs','finger-guidance-timeline.mjs','musicxml-note-identity.mjs','finger-overrides.mjs','finger-override-history.mjs','finger-note-selection.mjs','sheet-fingering-overlay.mjs','finger-editor-geometry.mjs','fingering-coverage.mjs','library-section-layout.mjs'].map(f=>read('src/core/'+f).replace(/^export /gm,'')).join('\n');

test('all feature parts form exactly one valid JavaScript bundle',()=>{
 assert.equal(manifest.features.length,22);
 const expected="\n(()=>{'use strict';\n"+musicPrelude+'\n'+featureSource.replace("window.__playAlongVersion='0.9.1'","window.__playAlongVersion='"+JSON.parse(read('package.json')).version+"'")+"})();\n";
 assert.equal(js,expected);
 execFileSync(process.execPath,['--check',path.join(root,'dist/assets/app.js')]);
});
test('CSS and HTML are separate, all expected DOM anchors exist',()=>{
 assert.equal(css,read('src/styles/app.css'));
 assert.ok(html.includes(`href="./assets/app.css?v=${JSON.parse(read('package.json')).version}"`));
 assert.ok(html.includes(`defer src="./assets/app.js?v=${JSON.parse(read('package.json')).version}"`));
 assert.doesNotMatch(html,/<style>|<script>/);
 for(const id of ['playBtn','viewRoll','viewSheet','sheetCanvas','rollWrap','librarySourceSelect','asapSync','museTrainerSync','mutopiaSync','connectMidi','songList','fingerGuideLookahead']){
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
