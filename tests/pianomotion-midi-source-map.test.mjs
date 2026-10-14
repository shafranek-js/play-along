import test from 'node:test';
import assert from 'node:assert/strict';
import {originalMidiSourceEvents as parse,matchPianoMotionMidiEvents as match}
 from '../src/core/pianomotion-midi-source-map.mjs';
const u16=n=>[(n>>>8)&255,n&255],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const midiFrom=events=>Uint8Array.from([
 ...Buffer.from('MThd'),...u32(6),...u16(0),...u16(1),...u16(480),
 ...Buffer.from('MTrk'),...u32(events.length),...events
]);
const track=[
 0,0xff,0x03,1,0x41, // track name message #0
 0,0x90,60,90,        // note_on #1
 0x83,0x60,0x80,60,0,// note_off #2, 480 ticks
 0,0xff,0x2f,0       // EOT message #3
];
const midi=midiFrom(track);
const score=[{noteId:'midi:0:1',pitch:60,sourceTrack:0,channel:0,velocity:90,
 scoreBeat:0,scoreBeatLength:1}];
const proposed=[{sourceEvent:{midiTrackIndex:0,channel:0,noteOnOrdinal:1,noteOffOrdinal:2},
 pitch:60,finger:1,hand:'RH',disposition:'played'}];

test('FG-04C8 original event index counts meta messages like mido and tracks Play Along serial IDs',()=>{
 const r=parse(midi);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.ppq,480);
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].noteId,'midi:0:1');
 assert.equal(r.items[0].noteOnOrdinal,1);
 assert.equal(r.items[0].noteOffOrdinal,2);
 assert.equal(r.items[0].startTick,0);
 assert.equal(r.items[0].endTick,480);
});
test('FG-04C8 exact original PianoMotion event locator maps to canonical MIDI score ID',()=>{
 const a=match(midi,score,proposed);
 assert.equal(a.ok,true,JSON.stringify(a));
 assert.equal(a.sourceOrdinalVerified,true);
 assert.deepEqual(a.items,[{noteId:'midi:0:1',pitch:60,hand:'RH',finger:1,
  source:'pianomotion-research',expertValidated:false}]);
 assert.equal(a.productionEligible,false);
});
test('FG-04C8 modified pitch, onset, duration, track, channel or velocity must fail closed',()=>{
 for(const changed of [
  {pitch:61},{scoreBeat:.5},{scoreBeatLength:.95},{sourceTrack:1},
  {channel:1},{velocity:91}
 ]){
  assert.equal(match(midi,[{...score[0],...changed}],proposed).reason,
   'PLAY_ALONG_NOTE_SOURCE_MISMATCH');
 }
});
test('FG-04C8 forged or duplicate PianoMotion source ordinals are never paired by register',()=>{
 const changed={...proposed[0],sourceEvent:{...proposed[0].sourceEvent,noteOffOrdinal:3}};
 assert.equal(match(midi,score,[changed]).reason,'UNKNOWN_DUPLICATE_OR_CHANGED_MIDI_LOCATOR');
 const pitchChange={...proposed[0],pitch:61};
 assert.equal(match(midi,score,[pitchChange]).reason,'UNKNOWN_DUPLICATE_OR_CHANGED_MIDI_LOCATOR');
});
test('FG-04C8 missing/invalid PianoMotion finger or hand cannot enter student hints',()=>{
 assert.equal(match(midi,score,[{...proposed[0],finger:8}]).reason,'INVALID_PIANOMOTION_PROPOSAL');
 assert.equal(match(midi,score,[{...proposed[0],hand:null}]).reason,'INVALID_PIANOMOTION_PROPOSAL');
 const unavailable=match(midi,score,[{...proposed[0],finger:null,disposition:'unresolved'}]);
 assert.equal(unavailable.ok,true);
 assert.equal(unavailable.items[0].finger,null);
 assert.equal(unavailable.expertValidated,false);
});
test('FG-04C8 coincident same-pitch MIDI NoteOns refuse arbitrary note-to-hand identity',()=>{
 const overlap=midiFrom([
  0,0x90,60,90,
  0,0x90,60,91,
  0x83,0x60,0x80,60,0,
  0,0x80,60,0,
  0,0xff,0x2f,0
 ]);
 assert.equal(parse(overlap).reason,'SAME_KEY_OVERLAP_AMBIGUOUS');
});
test('FG-04C8 MIDI raw byte and source arrays remain immutable',()=>{
 const original=Uint8Array.from(midi),src=structuredClone(score),cand=structuredClone(proposed);
 const a=match(midi,score,proposed),b=match(midi,score,proposed);
 assert.deepEqual(a,b);
 assert.deepEqual(midi,original);assert.deepEqual(score,src);assert.deepEqual(proposed,cand);
});
test('FG-04C8 do not convert a truncated or SMPTE MIDI file by guessing',()=>{
 assert.equal(parse(Uint8Array.from([0,1,2])).reason,'INVALID_MIDI_BYTES');
 const changed=Uint8Array.from(midi);changed[12]=0x80;
 assert.equal(parse(changed).reason,'UNSUPPORTED_MIDI_FORMAT_OR_TIMING');
});
