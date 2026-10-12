import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
const coreModules=['music-time.mjs','music-bars.mjs','finger-guidance-timeline.mjs','musicxml-note-identity.mjs','finger-overrides.mjs','fingering-coverage.mjs','library-section-layout.mjs'];
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
execFileSync(process.execPath, ['--check', path.join(dist, 'assets/app.js')], {stdio:'inherit'});
console.log(`Built Play Along v${version}: ${names.length} feature source files, CSS + HTML -> dist/`);
