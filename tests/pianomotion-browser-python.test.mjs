import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {inspectFingeredMidi} from '../src/core/handthesia-midi-alignment.mjs';
import {makePianoMotionMidiFromSong as convert} from '../src/core/pianomotion-song-to-midi.mjs';

test('FG-04C9 supports already selected MusicXML parsed tracks via non-mutating MIDI',()=>{
 const song={format:'MusicXML',tracks:[{notes:[
  {pitch:60,start:0,duration:.5,velocity:80},
  {pitch:64,start:1.25,duration:.75,velocity:80}
 ]}]},before=structuredClone(song);
 const x=convert(song);
 assert.equal(x.ok,true,JSON.stringify(x));
 assert.equal(x.exactOriginalMidi,false);
 const midi=inspectFingeredMidi(x.midiBytes);
 assert.equal(midi.notes.length,2);
 assert.deepEqual(midi.notes.map(n=>n.pitch),[60,64]);
 assert.equal(midi.notes[0].endTick,500);
 assert.equal(midi.notes[1].startTick,1250);
 assert.deepEqual(song,before);
});
test('FG-04C9 source hand and voice do not get artificially written into original score',()=>{
 const song={format:'MuseScore',tracks:[{notes:[{pitch:72,start:0,duration:.25,hand:'RH',finger:2}]}]};
 const x=convert(song);
 assert.equal(x.ok,true);
 assert.equal(song.tracks[0].notes[0].finger,2);
 assert.equal(song.tracks[0].notes[0].hand,'RH');
});
test('FG-04C9 malformed or impossible parsed note streams fail closed',()=>{
 assert.equal(convert(null).reason,'NO_SELECTED_SONG');
 assert.equal(convert({tracks:[{notes:[]}]}).reason,'UNSUPPORTED_NOTE_COUNT');
 assert.equal(convert({tracks:[{notes:[{pitch:128,start:0,duration:.5}]}]}).reason,'INVALID_PARSED_NOTE');
 assert.equal(convert({tracks:[{notes:[{pitch:60,start:0,duration:.0001}]}]}).reason,'NOTE_TOO_SHORT_FOR_MIDI');
});
test('FG-04C9 bundles hash-identical original owner Python files, not reconstructed solver',()=>{
 const root=join(dirname(fileURLToPath(import.meta.url)),'..');
 const base=join(root,'src/pianomotion-python/python-core/handthesia_core');
 const manifest=JSON.parse(readFileSync(join(base,'source_manifest.json'),'utf8'));
 const ordered=Object.entries(manifest.files).sort(([a],[b])=>a.localeCompare(b));
 const digest=createHash('sha256').update(JSON.stringify({files:Object.fromEntries(ordered)})).digest('hex');
 assert.equal(digest,manifest.engineVersion);
 for(const [file,hash] of ordered){
  const bytes=readFileSync(join(root,'src/pianomotion-python/python-core',file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,file);
 }
 assert.ok(ordered.length>=10);
});
