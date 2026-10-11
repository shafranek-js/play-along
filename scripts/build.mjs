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
const coreModules=['music-time.mjs','music-bars.mjs'];
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
fs.copyFileSync(path.join(root, 'src/index.html'), path.join(dist, 'index.html'));

const handAssetDir=path.join(root,'src/assets/finger-guidance');
const handDistDir=path.join(dist,'assets/finger-guidance');
fs.mkdirSync(handDistDir,{recursive:true});
for(const name of ['left-hand.png','right-hand.png']){
 const input=path.join(handAssetDir,name);
 const bytes=fs.readFileSync(input);
 // PNG signature guard: never deploy a missing/placeholder asset.
 if(bytes.length<1000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
  throw Error('Finger Guidance asset is not a PNG: '+name);
 fs.writeFileSync(path.join(handDistDir,name),bytes);
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
