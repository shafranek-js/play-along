import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalMidiSession} from '../src/core/original-midi-session.mjs';

const midi=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,
 0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
]);
test('FG-04C8 remembers a selected original MIDI with no second file load',()=>{
 const session=createOriginalMidiSession();
 const song={tracks:[]};
 assert.equal(session.remember(song,midi).ok,true);
 const copy=session.copy(song);
 assert.deepEqual(copy,midi);
 copy[0]=0;
 assert.equal(session.copy(song)[0],77,'consumer cannot mutate stored original');
 midi[0]=0;
 assert.equal(session.copy(song)[0],77,'caller cannot mutate stored original after save');
});
test('FG-04C8 never retains non-MIDI, oversized or non-object sources',()=>{
 const s=createOriginalMidiSession({maxBytes:40});
 assert.equal(s.remember({},new Uint8Array(3)).ok,false);
 assert.equal(s.remember({},new Uint8Array(41)).ok,false);
 assert.equal(s.remember({},new Uint8Array(30)).ok,false);
 assert.equal(s.remember(null,midi).ok,false);
 assert.equal(s.copy(null),null);
 assert.equal(s.has({}),false);
});
test('FG-04C8 forgetting one song cannot change another',()=>{
 const s=createOriginalMidiSession(),a={},b={};
 const immutable=Uint8Array.from([
 77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
 ]);
 assert.equal(s.remember(a,immutable).ok,true);
 assert.equal(s.remember(b,immutable.buffer).ok,true);
 assert.equal(s.forget(a),true);
 assert.equal(s.copy(a),null);
 assert.deepEqual(s.copy(b),immutable);
});
test('FG-04C8 invalid configuration is rejected',()=>{
 assert.throws(()=>createOriginalMidiSession({maxBytes:10}),/INVALID_SESSION_SIZE_LIMIT/);
 assert.throws(()=>createOriginalMidiSession({maxBytes:20_000_000}),/INVALID_SESSION_SIZE_LIMIT/);
});
