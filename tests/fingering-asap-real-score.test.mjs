import test from 'node:test';
import assert from 'node:assert/strict';
import {realCorpusManifest,validateRealCorpusManifest,gitBlobHash,
 inspectAsapPair,auditAsapRealCorpus}
 from '../scripts/fingering-asap-real-score-audit.mjs';

const XML=Buffer.from('<?xml version="1.0"?><score-partwise version="3.1">'+
 '<part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave>'+
 '</pitch><duration>1</duration></note></measure></part></score-partwise>');
const header=[...Buffer.from('MThd'),0,0,0,6,0,0,0,1,1,224];
const events=[0,255,81,3,7,161,32,0,255,3,8,...Buffer.from('TestMIDI'),0,144,60,90,
              0x83,0x60,128,60,0,0,255,47,0];
const MIDI=Buffer.from([...header,...Buffer.from('MTrk'),0,0,0,events.length,...events]);
const copy=o=>structuredClone(o);
function mockManifest(xml=XML,midi=MIDI){
 const m=copy(realCorpusManifest());
 for(const row of m.cases){
  for(const [key,raw] of [['musicxml',xml],['midiScore',midi]]){
   row[key].bytes=raw.length;row[key].blobSha=gitBlobHash(raw);
  }
 }
 return m;
}
function fetchMock(xml=XML,midi=MIDI){
 return async url=>{
  const raw=url.endsWith('.musicxml')?xml:midi;
  return {ok:true,url,headers:{get:()=>String(raw.length)},
   arrayBuffer:async()=>Uint8Array.from(raw).buffer};
 };
}
test('FG-04B1b: 16 real scores, sixteen pairs, 9 composers, NC research gate',()=>{
 const m=realCorpusManifest(),r=validateRealCorpusManifest(m);
 assert.equal(r.realScores,16);assert.equal(r.sourcePairs,16);
 assert.ok(r.composers>=7);assert.equal(r.pianistVerifiedFingers,0);
 assert.equal(r.productionAutoFingeringAllowed,false);
 assert.equal(m.source.license,'CC-BY-NC-SA-4.0');
 assert.match(m.source.revision,/^[0-9a-f]{40}$/);
});
test('FG-04B1b: verifies MIDI/XML pair hashes at one immutable revision',async()=>{
 const m=mockManifest(),r=await inspectAsapPair(m,m.cases[0],{fetcher:fetchMock()});
 assert.equal(r.xml.size,XML.length);assert.equal(r.xml.noteTags,1);
 assert.equal(r.midi.size,MIDI.length);
 assert.equal(r.midi.readiness,'READABLE');
 assert.equal(r.midi.noteCount,1);
 assert.equal(r.xmlMidiNoteAlignmentProven,false);
});
test('FG-04B1b: corrupted MusicXML and MIDI bytes fail closed',async()=>{
 const m=mockManifest();
 const corrupt=Buffer.from(XML);corrupt[20]^=1;
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:fetchMock(corrupt,MIDI)}),/ASAP_HASH_MISMATCH/);
 const corruptedMidi=Buffer.from(MIDI);corruptedMidi[12]^=1;
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:fetchMock(XML,corruptedMidi)}),/ASAP_HASH_MISMATCH/);
});
test('FG-04B1b: truncated source, redirected URL and HTTP errors fail',async()=>{
 const m=mockManifest();
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:fetchMock(XML.subarray(0,-1),MIDI)}),/ASAP_SIZE_MISMATCH/);
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:async u=>({...await fetchMock()(u),url:'https://other.invalid'})}),
  /ASAP_UNPINNED_REDIRECT/);
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:async()=>({ok:false})}),/ASAP_HTTP_FAILED/);
});
test('FG-04B1b: unsafe MusicXML envelope and invalid MIDI header fail',async()=>{
 const badXml=Buffer.from('<score-timewise><part id="P1"></part></score-timewise>'+
  ' '.repeat(100));
 const m=mockManifest(badXml);
 await assert.rejects(inspectAsapPair(m,m.cases[0],
  {fetcher:fetchMock(badXml,MIDI)}),/ASAP_NOT_PARTWISE_SCORE/);
 const badMidi=Buffer.from(MIDI);badMidi[0]=88;
 const n=mockManifest(XML,badMidi);
 await assert.rejects(inspectAsapPair(n,n.cases[0],
  {fetcher:fetchMock(XML,badMidi)}),/ASAP_NOT_STANDARD_MIDI/);
});
test('FG-04B1b: manifest path traversal, wrong rights and duplicate IDs refused',()=>{
 const original=realCorpusManifest();
 const bad=copy(original);bad.cases[0].musicxml.path='../secret.xml';
 assert.throws(()=>validateRealCorpusManifest(bad),/INVALID_ASAP_PAIR_PATH/);
 const dup=copy(original);dup.cases[1].id=dup.cases[0].id;
 assert.throws(()=>validateRealCorpusManifest(dup),/INVALID_ASAP_CASE/);
 const license=copy(original);license.source.license='CC0-1.0';
 assert.throws(()=>validateRealCorpusManifest(license),/INVALID_ASAP_MANIFEST/);
});
test('FG-04B1b: unapproved pair substitution blocked before downloads',async()=>{
 const m=mockManifest(),candidate=copy(m.cases[0]);
 candidate.midiScore.blobSha='a'.repeat(40);
 await assert.rejects(inspectAsapPair(m,candidate,{fetcher:fetchMock()}),
  /UNPINNED_ASAP_PAIR/);
});
test('FG-04B1b: all 16 pairs audited without returning copyrighted note data',async()=>{
 const m=mockManifest(),snapshot=copy(m);
 const r=await auditAsapRealCorpus({manifest:m,fetcher:fetchMock(),concurrency:3});
 assert.equal(r.verifiedPairs,16);
 assert.equal(r.midiParserReady,16);
 assert.equal(r.handthesiaCandidateOutputs,0);
 assert.equal(r.scoreMidiSemanticAlignmentVerified,undefined);
 assert.equal(r.xmlMidiSemanticAlignmentVerified,false);
 assert.equal(r.pianistFingeringValidated,false);
 assert.equal(r.productionAutoFingeringAllowed,false);
 assert.deepEqual(m,snapshot);
 assert.ok(r.scores.every(s=>!('raw' in s)&&!('notes' in s)&&!('bytes' in s)));
});
