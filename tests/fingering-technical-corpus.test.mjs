import test from 'node:test';
import assert from 'node:assert/strict';
import {manuscript,validateTechnicalManifest,gitBlobSha1,
  fetchTechnicalFixture,auditTechnicalCorpus}
 from '../scripts/fingering-technical-corpus-audit.mjs';
const xml=Buffer.from('<?xml version="1.0"?><score-partwise version="4.0">'+
 '<part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave>'+
 '</pitch><duration>1</duration><notations><technical><fingering>1</fingering>'+
 '</technical></notations></note></measure></part></score-partwise>');
const clone=x=>structuredClone(x);
function fakeManifest(bytes=xml){
 const m=clone(manuscript()),sha=gitBlobSha1(bytes);
 for(const e of m.cases){e.bytes=bytes.length;e.blobSha=sha}
 return m;
}
const fakeFetch=bytes=>async url=>({ok:true,url,
 headers:{get:()=>String(bytes.length)},
 arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
test('FG-04B1a catalog freezes 16 distinct MIT test examples from exact commit',()=>{
 const m=manuscript(),s=validateTechnicalManifest(m);
 assert.equal(s.cases,16);assert.equal(s.categoryCount,11);
 assert.equal(s.realPieces,0);assert.equal(s.productionAutoFingeringAllowed,false);
 assert.match(m.source.revision,/^[a-f0-9]{40}$/);
});
test('FG-04B1a every source URL is pinned to the exact test-suite revision',async()=>{
 const m=fakeManifest();
 const r=await fetchTechnicalFixture(m,m.cases[0],{fetcher:fakeFetch(xml)});
 assert.match(r.url,new RegExp(m.source.revision));
 assert.equal(r.blobSha,gitBlobSha1(xml));
 assert.equal(r.noteTags,1);assert.equal(r.fingeringTags,1);
});
test('FG-04B1a candidate fixture mutation or forged URL cannot bypass allowlist',async()=>{
 const m=fakeManifest();
 await assert.rejects(fetchTechnicalFixture(m,{...m.cases[0],path:'xmlFiles/other.musicxml'},
  {fetcher:fakeFetch(xml)}),/UNPINNED_FIXTURE/);
 await assert.rejects(fetchTechnicalFixture(m,m.cases[0],
  {fetcher:async()=>({...await fakeFetch(xml)('https://wrong.invalid'),url:'https://wrong.invalid'})}),
  /FIXTURE_REDIRECT_NOT_PINNED/);
});
test('FG-04B1a unexpected bytes and hashes are hard errors',async()=>{
 const m=fakeManifest();
 const mutated=Buffer.from(xml);mutated[15]=0x33;
 await assert.rejects(fetchTechnicalFixture(m,m.cases[0],{fetcher:fakeFetch(mutated)}),
  /FIXTURE_GIT_SHA_CHANGED/);
 await assert.rejects(fetchTechnicalFixture(m,m.cases[0],{fetcher:fakeFetch(xml.subarray(0,-1))}),
  /FIXTURE_SIZE_CHANGED/);
});
test('FG-04B1a rejects malformed manifest, categories, IDs and foreign paths',()=>{
 const m=manuscript();
 const dup=clone(m);dup.cases[1].id=dup.cases[0].id;
 assert.throws(()=>validateTechnicalManifest(dup),/INVALID_TECHNICAL_CORPUS_ENTRY/);
 const bad=clone(m);bad.cases[0].path='../private.musicxml';
 assert.throws(()=>validateTechnicalManifest(bad),/INVALID_TECHNICAL_CORPUS_ENTRY/);
 const missing=clone(m);missing.cases[0].category='chords';
 missing.cases[1].category='chords';
 assert.throws(()=>validateTechnicalManifest(missing),/MISSING_TECHNICAL_CATEGORY:pickup/);
});
test('FG-04B1a rejects non-score, XML entities and failed download',async()=>{
 const invalid=Buffer.from('<score-timewise><part/></score-timewise>'+' '.repeat(140));
 const m=fakeManifest(invalid);
 await assert.rejects(fetchTechnicalFixture(m,m.cases[0],{fetcher:fakeFetch(invalid)}),
  /FIXTURE_UNSAFE_OR_NOT_PARTWISE/);
 const hostile=Buffer.from('<!ENTITY x "oops"><score-partwise><part/></score-partwise>'+' '.repeat(140));
 const q=fakeManifest(hostile);
 await assert.rejects(fetchTechnicalFixture(q,q.cases[0],{fetcher:fakeFetch(hostile)}),
  /FIXTURE_UNSAFE_OR_NOT_PARTWISE/);
 await assert.rejects(fetchTechnicalFixture(fakeManifest(),fakeManifest().cases[0],
  {fetcher:async()=>({ok:false})}),/FIXTURE_HTTP_ERROR/);
});
test('FG-04B1a full research report preserves explicit NO-GO & real-piece=0',async()=>{
 const m=fakeManifest();
 const report=await auditTechnicalCorpus({manifest:m,fetcher:fakeFetch(xml)});
 assert.equal(report.status,'TECHNICAL_SOURCES_VERIFIED');
 assert.equal(report.downloaded,16);
 assert.equal(report.inspectedNoteTags,16);
 assert.equal(report.readiness.realPieces,0);
 assert.equal(report.musicalAccuracyValidated,false);
 assert.equal(report.realMusicCorpusComplete,false);
 assert.equal(report.productionAutoFingeringAllowed,false);
});
test('FG-04B1a no source note data is locally modified or copied to the report',async()=>{
 const m=fakeManifest(), before=clone(m);
 const r=await auditTechnicalCorpus({manifest:m,fetcher:fakeFetch(xml)});
 assert.deepEqual(m,before);
 assert.ok(r.fixtures.every(f=>!('text' in f)&&!('notes' in f)&&!('finger' in f)));
});
