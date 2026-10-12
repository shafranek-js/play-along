import test from 'node:test';
import assert from 'node:assert/strict';
import {musicXmlSourceNoteId} from '../src/core/musicxml-note-identity.mjs';

test('FG-03C1 part-index disambiguates duplicate and absent part IDs',()=>{
 const a=musicXmlSourceNoteId('P1',0,0,1);
 const b=musicXmlSourceNoteId('P1',1,0,1);
 const c=musicXmlSourceNoteId('part',0,0,1);
 const d=musicXmlSourceNoteId('part',1,0,1);
 assert.notEqual(a,b);assert.notEqual(c,d);
 assert.ok(a.startsWith('xml:P1:'));
});
test('FG-03C1 source ordinal retains repeated unisons and voices at a single onset',()=>{
 const ids=new Set(Array.from({length:8},(_,index)=>
  musicXmlSourceNoteId('Piano',0,3,index+1)));
 assert.equal(ids.size,8);
});
test('FG-03C1 original measure, repeated playback measure and score part are isolated',()=>{
 const a=musicXmlSourceNoteId('P1',0,0,1);
 const b=musicXmlSourceNoteId('P1',0,1,1);
 const c=musicXmlSourceNoteId('P1',1,0,1);
 assert.equal(new Set([a,b,c]).size,3);
 assert.equal(a,musicXmlSourceNoteId('P1',0,0,1),
  'Reimporting identical score must retain the same event identity');
});
test('FG-03C1 separator characters cannot collide after URI encoding',()=>{
 const ids=['P:A','P%3AA','P/A','P:A:1','',':',':0'].map(p=>musicXmlSourceNoteId(p,0,0,1));
 assert.equal(new Set(ids).size,ids.length);
 assert.equal(musicXmlSourceNoteId('P:A',0,0,1),'xml:P%3AA:0:0:1');
});
test('FG-03C1 rejects malformed identity instead of assigning a random fallback',()=>{
 for(const args of [
  [null,0,0,1],['P',-1,0,1],['P',0,-1,1],['P',0,0,0],
  ['P',0,0,1.5],['P',Infinity,0,1],['P',0,0,Number.MAX_SAFE_INTEGER+1]
 ])assert.throws(()=>musicXmlSourceNoteId(...args),/Invalid MusicXML/);
});
