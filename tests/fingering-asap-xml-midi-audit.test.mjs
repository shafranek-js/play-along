import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAuditSummary,auditAsapRawScoreMidi,loadVerifiedScorePair}
 from '../scripts/fingering-asap-xml-midi-audit.mjs';
import {realCorpusManifest,gitBlobHash}
 from '../scripts/fingering-asap-real-score-audit.mjs';

const results=(rejected=false)=>Array.from({length:16},(_,i)=>({
 id:'piece-'+i,status:rejected?'rejected':'aligned',
 reason:rejected?'MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED':null,
 summary:{sourceNoteCount:10,midiNotes:10},productionAutoFingeringAllowed:false
}));
test('FG-04B3b: 16 audited scores with no invented music or finger accuracy',()=>{
 const report=publicAuditSummary(results());
 assert.equal(report.total,16);assert.equal(report.aligned,16);
 assert.equal(report.scoreTempoIndependentlyValidated,false);
 assert.equal(report.independentPianistReview,false);
 assert.equal(report.externalFingeringCandidatesEvaluated,0);
 assert.equal(report.productionAutoFingeringAllowed,false);
 assert.equal(report.noteLevelCoveragePercent,100);
 assert.ok(report.cases.every(c=>!('notes' in c)&&!('fingers' in c)));
});
test('FG-04B3b: refusal preserves exact count and reasons, not false coverage',()=>{
 const report=publicAuditSummary(results(true));
 assert.equal(report.aligned,0);assert.equal(report.rejected,16);
 assert.equal(report.noteLevelCoveragePercent,null);
 assert.deepEqual(report.reasons,{MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED:16});
 assert.equal(report.allPairsAligned,false);
});
test('FG-04B3b: partial matches do not imply complete repertoire coverage',()=>{
 const list=results();list[3]={...list[3],status:'rejected',reason:'SCORE_EVENT_UNMATCHED'};
 const report=publicAuditSummary(list);
 assert.equal(report.aligned,15);assert.equal(report.rejected,1);
 assert.equal(report.noteLevelCoveragePercent,null);
});
test('FG-04B3b: duplicated IDs, omitted files and missing reasons fail hard',()=>{
 assert.throws(()=>publicAuditSummary(results().slice(0,15)),/INCOMPLETE_REAL_SCORE_AUDIT/);
 const duplicate=results();duplicate[1].id=duplicate[0].id;
 assert.throws(()=>publicAuditSummary(duplicate),/INVALID_AUDIT_RESULT/);
 const unknown=results(true);unknown[0].reason=null;
 assert.throws(()=>publicAuditSummary(unknown),/UNKNOWN_REJECTION_REASON/);
});
test('FG-04B3b: pinned XML/MIDI bytes checked without raw persistence',async()=>{
 const m=structuredClone(realCorpusManifest()),entry=m.cases[0];
 const xml=Buffer.from('<?xml version="1.0"?><score-partwise><part id="P1"><measure number="1">'+
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>'+
  '</measure></part></score-partwise>');
 const midi=Buffer.alloc(60,0);Buffer.from('MThd').copy(midi,0);
 for(const [f,content] of [[entry.musicxml,xml],[entry.midiScore,midi]]){
  f.bytes=content.length;f.blobSha=gitBlobHash(content);
 }
 const fetcher=async url=>({ok:true,url,headers:{get:()=>null},
  arrayBuffer:async()=>Uint8Array.from(url.endsWith('.musicxml')?xml:midi).buffer});
 const original=JSON.stringify(entry);
 const pair=await loadVerifiedScorePair(m,entry,{fetcher});
 assert.equal(pair.xml.includes('<score-partwise>'),true);
 assert.equal(Buffer.compare(pair.midi,midi),0);
 assert.equal(JSON.stringify(entry),original);
 const corrupt=async url=>({ok:true,url,headers:{get:()=>null},
  arrayBuffer:async()=>Uint8Array.from(url.endsWith('.musicxml')?xml:Buffer.alloc(60,1)).buffer});
 await assert.rejects(loadVerifiedScorePair(m,entry,{fetcher:corrupt}),
  /SCORE_SOURCE_HASH_OR_SIZE_MISMATCH/);
});
