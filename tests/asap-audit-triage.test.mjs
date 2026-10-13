import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareAsapAuditBaseline} from '../src/core/asap-audit-triage.mjs';
import {realCorpusManifest} from '../scripts/fingering-asap-real-score-audit.mjs';

const baseline=JSON.parse(fs.readFileSync(
 new URL('../research/fg04b3c-asap-audit-baseline.json',import.meta.url),'utf8'));
const revision=realCorpusManifest().source.revision;
const mock=()=>{
 const cases=structuredClone(baseline.cases);
 return {cases,aligned:cases.filter(c=>c.status==='aligned').length,
  rejected:cases.filter(c=>c.status==='rejected').length};
};
test('FG-04B3c: baseline freezes actual 1/16 and all 15 named prior failures',()=>{
 const result=compareAsapAuditBaseline(baseline,mock(),{sourceRevision:revision});
 assert.equal(result.baselineAligned,1);
 assert.equal(result.currentAligned,1);
 assert.equal(result.newlyAligned.length,0);
 assert.equal(result.regressions.length,0);
 assert.equal(result.unresolved.length,15);
 assert.equal(result.refusalsByFamily.grace_realization,7);
 assert.equal(result.refusalsByFamily.repeat_navigation,4);
 assert.equal(result.refusalsByFamily.tie_provenance,1);
 assert.equal(result.refusalsByFamily.voice_timeline,1);
 assert.equal(result.refusalsByFamily.score_midi_divergence,1);
 assert.equal(result.refusalsByFamily.midi_source_data,1);
});
test('FG-04B3c: unique real score improvement is counted only after aligned status',()=>{
 const now=mock();
 now.cases.find(x=>x.id==='bach-fugue-846').status='aligned';
 now.cases.find(x=>x.id==='bach-fugue-846').reason=null;
 now.aligned++;now.rejected--;
 const result=compareAsapAuditBaseline(baseline,now,{sourceRevision:revision});
 assert.deepEqual(result.newlyAligned,['bach-fugue-846']);
 assert.equal(result.currentAligned,2);
 assert.equal(result.productionAutoFingeringAllowed,false);
});
test('FG-04B3c: known passing Bach prelude cannot regress under green evidence',()=>{
 const now=mock();
 now.cases[0].status='rejected';
 now.cases[0].reason='SCORE_EVENT_UNMATCHED';
 now.aligned--;now.rejected++;
 const result=compareAsapAuditBaseline(baseline,now,{sourceRevision:revision});
 assert.deepEqual(result.regressions,['bach-prelude-846']);
 assert.equal(result.newlyAligned.length,0);
});
test('FG-04B3c: changing a refusal reason is NOT counted as improvement',()=>{
 const now=mock();
 const fugue=now.cases.find(x=>x.id==='bach-fugue-846');
 fugue.reason='SCORE_EVENT_UNMATCHED';
 const result=compareAsapAuditBaseline(baseline,now,{sourceRevision:revision});
 assert.equal(result.currentAligned,1);
 assert.equal(result.newlyAligned.length,0);
 assert.deepEqual(result.reasonChanges,[{
  id:'bach-fugue-846',from:'MUSICXML_UNPAIRED_TIE_STOP',
  to:'SCORE_EVENT_UNMATCHED'
 }]);
});
test('FG-04B3c: reject baseline tampering and edition drift',()=>{
 assert.throws(()=>compareAsapAuditBaseline(baseline,mock(),
  {sourceRevision:'0'.repeat(40)}),/INVALID_ASAP_ALIGNMENT_BASELINE/);
 const edited=structuredClone(baseline);
 edited.baseline.aligned=2;
 assert.throws(()=>compareAsapAuditBaseline(edited,mock(),
  {sourceRevision:revision}),/ASAP_ALIGNMENT_TOTAL_INCONSISTENT/);
});
test('FG-04B3c: missing/duplicate unknown scores and lying counts refuse',()=>{
 const missing=mock();missing.cases.pop();
 assert.throws(()=>compareAsapAuditBaseline(baseline,missing,
  {sourceRevision:revision}),/INVALID_ASAP_ALIGNMENT_BASELINE/);
 const dup=mock();dup.cases[1].id=dup.cases[0].id;
 assert.throws(()=>compareAsapAuditBaseline(baseline,dup,
  {sourceRevision:revision}),/MALFORMED_ASAP_ALIGNMENT_CASE/);
 const count=mock();count.aligned++;
 assert.throws(()=>compareAsapAuditBaseline(baseline,count,
  {sourceRevision:revision}),/ASAP_ALIGNMENT_TOTAL_INCONSISTENT/);
});
test('FG-04B3c: returned audit contains neither note events nor finger assignments',()=>{
 const output=compareAsapAuditBaseline(baseline,mock(),{sourceRevision:revision});
 assert.equal(output.teacherApproved,false);
 assert.equal(output.notesOrFingersIncluded,false);
 assert.equal(output.productionAutoFingeringAllowed,false);
 assert.ok(output.unresolved.every(x=>Object.keys(x).every(k=>
  ['id','reason','family'].includes(k))));
});
