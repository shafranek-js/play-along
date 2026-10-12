import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerOverrideWorkKey,fingerOverrideValidate,fingerOverrideEffective} from '../src/core/finger-overrides.mjs';
const song={notationXML:'<score-partwise><part id="P1"><note>1</note></part></score-partwise>',tracks:[{notes:[]}]};
const id='xml:P1:0:0:1';
test('FG-03C2A same MusicXML reimport yields stable key independent of transient song id',()=>{
 const key=fingerOverrideWorkKey(song);
 assert.match(key,/^xml:[0-9]+:[a-f0-9]{16}$/);
 assert.equal(key,fingerOverrideWorkKey({...song,id:'xml-'+Date.now()}));
 assert.notEqual(key,fingerOverrideWorkKey({...song,notationXML:song.notationXML.replace('>1<','>2<')}));
 assert.equal(fingerOverrideWorkKey({...song,notationXML:null}),null);
});
test('FG-03C2A valid explicit user hand/finger map round-trips through JSON safely',()=>{
 const key=fingerOverrideWorkKey(song);
 const raw={[key]:{[id]:{finger:3,hand:'RH'},'xml:P1:0:1:3':{finger:5,hand:null}}};
 const checked=fingerOverrideValidate(raw,{strict:true});
 assert.deepEqual(JSON.parse(JSON.stringify(checked)),raw);
 const again=fingerOverrideValidate(JSON.parse(JSON.stringify(checked)),{strict:true});
 assert.equal(again[key][id].finger,3);
 assert.equal(Object.getPrototypeOf(checked),null);
});
test('FG-03C2A auto/research labels or invalid fingers fail closed',()=>{
 const note={noteId:id,pitch:60,finger:1,fingeringSource:'musicxml'};
 assert.deepEqual(fingerOverrideEffective(note,{finger:5,hand:'LH'}),{finger:5,hand:'LH',source:'user'});
 assert.equal(note.finger,1,'Original author finger is immutable');
 assert.equal(fingerOverrideEffective(note,{finger:0,hand:'RH'}),null);
 assert.equal(fingerOverrideEffective(note,{finger:5,hand:'TWO'}),null);
 assert.equal(fingerOverrideEffective({pitch:60},{finger:5,hand:'RH'}),null);
});
test('FG-03C2A hostile backup corrections are rejected before any commit',()=>{
 const key=fingerOverrideWorkKey(song);
 for(const invalid of [
  {[key]:{[id]:{finger:9,hand:'LH'}}},
  {[key]:{[id]:{finger:1,hand:'other'}}},
  {[key]:{[id]:{finger:1,hand:null,html:'<img onerror=alert(1)>'}}},
  JSON.parse('{"'+key+'":{"__proto__":{"finger":2,"hand":"RH"}}}'),
  {[key]:{[id]:{finger:'1',hand:'RH'}}},
  {'evil-script':{[id]:{finger:2,hand:'RH'}}}
 ]){
  // "__proto__" literal is a legacy JS prototype setter; other cases are
  // still tested; JSON.parse below preserves the key as untrusted data.
  assert.throws(()=>fingerOverrideValidate(invalid,{strict:true}),/Некоррект/);
 }
 assert.throws(()=>fingerOverrideValidate(JSON.parse('{"'+key+'":{"__proto__":{"finger":1,"hand":"RH"}}}'),{strict:true}));
});
test('FG-03C2A excess entries fail closed and legacy corrupt cache drops bad entries',()=>{
 const key=fingerOverrideWorkKey(song);
 const work=Object.fromEntries(Array.from({length:501},(_,i)=>['xml:P1:0:0:'+(i+1),{finger:1,hand:'RH'}]));
 assert.throws(()=>fingerOverrideValidate({[key]:work},{strict:true}),/Некоррект/);
 assert.equal(Object.keys(fingerOverrideValidate({[key]:work})).length,0);
 assert.equal(Object.keys(fingerOverrideValidate(null)).length,0);
});
