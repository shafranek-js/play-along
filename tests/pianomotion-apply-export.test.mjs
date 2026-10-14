import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appJs = fs.readFileSync(path.join(root, 'dist/assets/app.js'), 'utf8');

test('FG-04C9: app.js contains pianoMotionApply and pianoMotionExportXML button actions', () => {
 assert.ok(appJs.includes('pianoMotionApply'), 'app.js must wire pianoMotionApply');
 assert.ok(appJs.includes('pianoMotionExportXML'), 'app.js must wire pianoMotionExportXML');
 assert.ok(appJs.includes('<technical><fingering>'), 'app.js must format technical fingering in MusicXML');
});

test('FG-04C9: browser applies PianoMotion suggestions and exports MusicXML with fingers', async () => {
 const server = http.createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(root, 'dist', '.' + p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
 });
 await new Promise(ok => server.listen(0, '127.0.0.1', ok));
 const origin = 'http://127.0.0.1:' + server.address().port;

 const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
 const page = await browser.newPage({viewport: {width: 1400, height: 900}});
 await page.goto(origin);
 await page.waitForFunction(() => window.__prototypeTest && window.__libraryV08);

 const result = await page.evaluate(async () => {
  const originalMidi = Uint8Array.from([
   77,84,104,100,0,0,0,6,0,0,0,1,1,224,
   77,84,114,107,0,0,0,13,
   0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
  ]);
  const song = await window.__libraryV08.songFromBuffer('one.mid', originalMidi.buffer);
  window.__prototypeTest.loadSong(song);

  const Native = window.Worker;
  window.Worker = class {
   constructor() {}
   postMessage(m) {
    queueMicrotask(() => this.onmessage({data: {id: m.id, type: 'result', result: {
     engine: 'PianoMotion Studio · test',
     total: 1, playable: 1, unresolved: 0,
     suggestions: [{hand: 'RH', pitch: 60, start: 0, finger: 4, disposition: 'played'}]
    }}}));
   }
   terminate() {}
  };

  document.getElementById('pianoMotionCalculate').click();
  await new Promise(ok => setTimeout(ok, 20));

  const applyBtn = document.getElementById('pianoMotionApply');
  const exportBtn = document.getElementById('pianoMotionExportXML');

  const beforeApplyFinger = song.tracks[0].notes[0].finger;
  const beforeApplyExportDisabled = exportBtn.disabled;
  applyBtn.click();
  const afterApplyExportEnabled = !exportBtn.disabled;
  const afterApplyFinger = song.tracks[0].notes[0].finger;
  const guideMode = document.getElementById('fingerGuideMode').value;
  const guideStatus = document.getElementById('fingerGuideStatus').textContent;
  song.tracks[0].notes[0].finger = 2;
  song.tracks[0].notes[0].fingeringSource = 'user';
  applyBtn.click();
  const protectedManualFinger = song.tracks[0].notes[0].finger;
  song.tracks[0].notes[0].finger = 4;
  song.tracks[0].notes[0].fingeringSource = 'pianomotion';

  let capturedXml = null;
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
   capturedXml = blob.text();
   return 'blob:mock';
  };

  exportBtn.click();
  const exportedXml = capturedXml ? await capturedXml : null;

  document.getElementById('pianoMotionClear').click();
  const afterClearFinger = song.tracks[0].notes[0].finger;

  URL.createObjectURL = originalCreateObjectURL;
  let runtimeErrorRetries = 0;
  window.Worker = class {
   constructor() { runtimeErrorRetries++; }
   postMessage(m) {
    queueMicrotask(() => this.onmessage({data: {
     id: m.id, type: 'error', reason: 'PIANOMOTION_RUNTIME_FAILED'
    }}));
   }
   terminate() {}
  };
  document.getElementById('pianoMotionCalculate').click();
  await new Promise(ok => setTimeout(ok, 20));
  const runtimeErrorMessage = document.getElementById('pianoMotionStatus').textContent;
  window.Worker = Native;
  return {
   beforeApplyFinger,
   beforeApplyExportDisabled,
   afterApplyExportEnabled,
   afterApplyFinger,
   protectedManualFinger,
   runtimeErrorRetries,
   runtimeErrorMessage,
   guideMode,
   guideStatus,
   afterClearFinger,
   exportedXml
  };
 });

 await browser.close();
 server.close();

 assert.equal(result.beforeApplyFinger, undefined);
 assert.equal(result.afterApplyFinger, 4);
 assert.equal(result.beforeApplyExportDisabled, true);
 assert.equal(result.afterApplyExportEnabled, true);
 assert.equal(result.protectedManualFinger, 2, 'manual fingering must be protected');
 assert.equal(result.runtimeErrorRetries, 1, 'runtime failures may not trigger MIDI fallback');
 assert.match(result.runtimeErrorMessage, /PIANOMOTION_RUNTIME_FAILED/);
 assert.equal(result.guideMode, 'numbers');
 assert.ok(result.guideStatus.includes('1/1'));
 assert.equal(result.afterClearFinger, 4); // Clearing proposals must preserve accepted fingers.
 assert.ok(result.exportedXml.includes('<score-partwise'));
 assert.ok(result.exportedXml.includes('<technical><fingering>4</fingering></technical>'));
});
