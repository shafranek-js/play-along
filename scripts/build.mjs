import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import { validateSoundfontManifest } from './audio-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/manifest.json'), 'utf8'));
const partsDir = path.join(root, 'src/legacy/parts');
const names = manifest.features;
if (names.length < 15 || new Set(names).size !== names.length) throw Error('Invalid feature manifest');
const actualNames = fs.readdirSync(partsDir).filter(n => n.endsWith('.js')).sort();
if (actualNames.length !== names.length || actualNames.some(n => !names.includes(n))) throw Error('Manifest does not match source parts');
const parts = names.map(name => fs.readFileSync(path.join(partsDir, name), 'utf8'));
const body = parts.join('');
// Transitional bridge: a genuine, independently importable ES module is
// included in the legacy IIFE without duplicating its musical math.
const coreModules=['music-time.mjs','music-bars.mjs','finger-guidance-timeline.mjs','musicxml-note-identity.mjs','finger-overrides.mjs','finger-override-history.mjs','finger-note-selection.mjs','sheet-fingering-overlay.mjs','external-fingering-evaluation.mjs','musicxml-fingering-export.mjs','fingering-edition-reconcile.mjs','finger-editor-geometry.mjs','fingering-coverage.mjs','original-midi-session.mjs','hand-span-calibration.mjs','library-section-layout.mjs'];
const musicPrelude=coreModules.map(filename=>{
 const source=fs.readFileSync(path.join(root,'src/core',filename),'utf8');
 const adapted=source.replace(/^export /gm,'');
 if(!source.includes('export function ')||/^(?:import|export) /m.test(adapted))
  throw Error('Music core adapter only supports named function exports: '+filename);
 return adapted;
}).join('\n');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const js = `\n(()=>{'use strict';\n` + musicPrelude + '\n' + body.replace("window.__playAlongVersion='0.9.1'", `window.__playAlongVersion='${version}'`) + `})();\n`;
if (!body.includes("window.__playAlongVersion='0.9.1'")) throw Error('Missing original Play Along version stamp');
if (!js.includes(`window.__playAlongVersion='${version}'`)) throw Error('Failed to stamp version');
const dist = path.join(root, 'dist');
fs.mkdirSync(path.join(dist, 'assets'), {recursive:true});
fs.writeFileSync(path.join(dist, 'assets/app.js'), js);
// FG-04C7: executable original-PianoMotion Python worker only when a developer
// explicitly stages the private, SHA-pinned runtime into dist (local research).
// No PianoMotion Python, wheel or SoundFont source is shipped by npm build.
await esbuild({
 entryPoints:[path.join(root,'src/workers/pianomotion-engine.worker.mjs')],
 outfile:path.join(dist,'assets/pianomotion-engine-worker.js'),
 bundle:true,format:'esm',platform:'browser',target:['es2022'],
 minify:true,legalComments:'none',sourcemap:false,logLevel:'silent'
});
// FG-04C4: classic dedicated research Worker, bundled for offline use.
// This is independent of the player's music/audio transport and loads on demand.
await esbuild({
 entryPoints:[path.join(root,'src/workers/fingering-research-worker.mjs')],
 outfile:path.join(dist,'assets/fingering-research-worker.js'),
 bundle:true,format:'iife',platform:'browser',target:['es2022'],
 minify:true,legalComments:'none',sourcemap:false,logLevel:'silent'
});
fs.copyFileSync(path.join(root, 'src/styles/app.css'), path.join(dist, 'assets/app.css'));
// Single authoritative release version: HTML title, visible brand and initial
// score label are stamped from package.json, just like the executable bundle.
// Query-string revisions keep CSS/JS in step after a Pages deployment.
const htmlTemplate=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
const token='__PLAY_ALONG_VERSION__';
const tokenCount=htmlTemplate.split(token).length-1;
if(tokenCount!==5)throw Error('HTML version placeholders changed: expected 5, found '+tokenCount);
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid semver for HTML release stamp');
const html=htmlTemplate.split(token).join(version);
if(html.includes(token)||/v0\.10\.41/.test(html))throw Error('Stale HTML release version');
fs.writeFileSync(path.join(dist,'index.html'),html);

// Preserve all 14 user-owned alpha PNG files bit-for-bit (seven poses per hand).
const handAssetDir=path.join(root,'src/assets/finger-guidance/poses');
const handDistDir=path.join(dist,'assets/finger-guidance/poses');
for(const side of ['left','right']){
 const output=path.join(handDistDir,side);
 fs.mkdirSync(output,{recursive:true});
 for(const pose of ['thumb','index','middle','ring','pinky','rest','spread']){
  const filename=side+'-'+pose+'.png';
  const bytes=fs.readFileSync(path.join(handAssetDir,side,filename));
  if(bytes.length<10000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'
     ||bytes.readUInt32BE(16)<250||bytes.readUInt32BE(20)<500)
   throw Error('Missing or invalid user hand pose PNG: '+side+'/'+filename);
  // PNG color type RGBA (6), preserving the supplied alpha channel.
  if(bytes[25]!==6)throw Error('Hand pose must preserve source RGBA: '+filename);
  fs.writeFileSync(path.join(output,filename),bytes);
 }
}

const vendoredDir = path.join(root, 'node_modules/opensheetmusicdisplay');
const osmdBundle = path.join(vendoredDir, 'build/opensheetmusicdisplay.min.js');
if (!fs.existsSync(osmdBundle)) throw Error('OSMD 2.2.0 is missing; run npm install before npm run build');
fs.mkdirSync(path.join(dist, 'assets/vendor'), {recursive: true});
fs.copyFileSync(osmdBundle, path.join(dist, 'assets/vendor/opensheetmusicdisplay.min.js'));
const osmdLicense = path.join(vendoredDir, 'LICENSE');
if (fs.existsSync(osmdLicense)) fs.copyFileSync(osmdLicense, path.join(dist, 'assets/vendor/LICENSE-OSMD.txt'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

// SF-01 browser audio is a separate ESM/worklet asset group. Keep the existing
// classic app bundle above unchanged; URLs inside this group stay relative so
// the deployment also works from the /play-along/ Pages project prefix.
const audioSourceRoot = path.join(root, 'src/assets/audio');
const audioDistRoot = path.join(dist, 'assets/audio');
const audioManifestName = 'soundfont-manifest.json';
const audioManifestPath = path.join(audioSourceRoot, audioManifestName);
if (!fs.existsSync(audioManifestPath)) throw Error('SF-01 SoundFont manifest is missing: ' + audioManifestPath);
const audioManifest = JSON.parse(fs.readFileSync(audioManifestPath, 'utf8'));
if (audioManifest.schemaVersion !== 1 || !Array.isArray(audioManifest.banks) || audioManifest.banks.length < 1)
  throw Error('Invalid SF-01 soundfont-manifest.json schema');
if (typeof audioManifest.defaultBankId !== 'string' || !audioManifest.banks.some(bank => bank.id === audioManifest.defaultBankId))
  throw Error('SF-01 defaultBankId must name a delivered SoundFont bank');

function checkedAudioRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || /^[a-z]+:/i.test(value))
    throw Error('Invalid relative SF-01 ' + label + ' path');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw Error('Unsafe SF-01 ' + label + ' path: ' + value);
  const resolved = path.resolve(audioSourceRoot, ...parts);
  const relative = path.relative(audioSourceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('SF-01 ' + label + ' path escapes asset root');
  return { source: resolved, relative: parts.join('/') };
}

fs.mkdirSync(audioDistRoot, {recursive:true});
for (const entry of ['index.js', 'synth-worklet.js', 'pcm-tap-worklet.js']) {
  const outputName = entry === 'index.js' ? 'index.js' : entry === 'synth-worklet.js' ? 'sf01-synth-worklet.js' : 'sf01-pcm-tap.js';
  const outfile = path.join(audioDistRoot, outputName);
  await esbuild({
    entryPoints: [path.join(root, 'src/audio', entry)],
    outfile,
    bundle: true,
    format: entry === 'index.js' ? 'esm' : 'iife',
    platform: 'browser',
    target: ['es2022'],
    legalComments: 'none',
    minify: true,
    sourcemap: false,
    logLevel: 'silent',
  });
}

const validatedAudio = validateSoundfontManifest(audioManifest, relative => {
  const assetPath = checkedAudioRelativePath(relative, 'asset');
  return fs.readFileSync(assetPath.source);
});
const copiedAudioPaths = new Set([audioManifestName, ...validatedAudio.copiedPaths]);

for (const relative of copiedAudioPaths) {
  const source = path.join(audioSourceRoot, ...relative.split('/'));
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw Error('Missing SF-01 asset or notice: ' + relative);
  const target = path.join(audioDistRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.copyFileSync(source, target);
}

const thirdPartyNotices = [
  ['spessasynth_core', 'node_modules/spessasynth_core/LICENSE'],
  ['stb-vorbis', 'node_modules/stb-vorbis/LICENSE'],
].map(([name, relative]) => {
  const licensePath = path.join(root, relative);
  if (!fs.existsSync(licensePath)) throw Error('Missing runtime dependency notice: ' + relative);
  return `===== ${name} (${relative}) =====\n${fs.readFileSync(licensePath, 'utf8').trim()}`;
});
fs.writeFileSync(path.join(audioDistRoot, 'THIRD-PARTY-NOTICES.txt'), thirdPartyNotices.join('\n\n') + '\n');

function totalBytes(directory) {
  let total = 0;
  for (const item of fs.readdirSync(directory, {withFileTypes:true})) {
    const itemPath = path.join(directory, item.name);
    total += item.isDirectory() ? totalBytes(itemPath) : fs.statSync(itemPath).size;
  }
  return total;
}
const audioBytes = totalBytes(audioDistRoot);
const audioBudgetBytes = 80 * 1024 * 1024;
if (audioBytes > audioBudgetBytes) throw Error(`SF-01 audio assets exceed the authorized 80 MiB budget (${audioBytes} bytes)`);

execFileSync(process.execPath, ['--check', path.join(dist, 'assets/app.js')], {stdio:'inherit'});
execFileSync(process.execPath, ['--check', path.join(audioDistRoot, 'index.js')], {stdio:'inherit'});
console.log(`Built Play Along v${version}: ${names.length} feature source files, CSS + HTML + ${audioBytes} audio bytes -> dist/`);
