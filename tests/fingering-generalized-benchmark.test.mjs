import test from 'node:test';
import assert from 'node:assert/strict';
import {runFG02FDiagnostic} from '../scripts/fingering-generalized-benchmark.mjs';
import {heldout} from '../scripts/fingering-heldout-benchmark.mjs';

test('FG-02F keeps frozen FG-02E reference material unchanged and fully reported',()=>{
 const report=runFG02FDiagnostic();
 assert.equal(heldout.cases.length,34);
 assert.equal(report.cases.fg02e.length,34);
 assert.equal(report.cases.authorPinned.length,34);
 assert.equal(report.candidate.heldout.notes,314);
 assert.equal(report.candidate.heldout.consensusCases,30);
 assert.equal(report.previous.fg02e.baseline.exactAnyPublished,8);
 assert.equal(report.previous.fg02e.baseline.matchedPrimary,144);
 assert.equal(report.previous.fg02e.phrase.phraseCandidates,0);
});
test('FG-02F does not silently override any accepted author fingers in diagnostic run',()=>{
 const r=runFG02FDiagnostic();
 assert.equal(r.candidate.pinned.anchorViolations,0);
 assert.equal(r.candidate.pinned.physicalConflicts,0);
 assert.equal(r.candidate.pinned.rejected,0);
 for(const x of r.cases.authorPinned)assert.deepEqual(x.actual,x.expected);
});
test('FG-02F diagnostic explicitly reports both physical conflicts and unrecognized patterns',()=>{
 const r=runFG02FDiagnostic();
 assert.equal(r.candidate.heldout.physicalConflicts,0);
 assert.equal(r.candidate.heldout.rejected,0);
 assert(r.candidate.heldout.generalized>0);
 for(const c of r.cases.fg02e){
  assert.ok(['EXACT_PUBLISHED','DIFFERENT'].includes(c.status),c.id);
  assert.ok(c.matched>=0&&c.matched<=c.total);
  assert(c.strategy,'missing traceability');
 }
});
test('FG-02F results are not secretly certified by retrospective evaluation',()=>{
 const r=runFG02FDiagnostic();
 assert.match(r.evidenceStatus,/POST-EXPOSURE/);
 assert.equal(r.gate.qualifiedForLearnerGuidance,false);
 assert.equal(r.gate.independentExpertReview,false);
 assert.equal(r.gate.independentUnseenMusicalCorpus,false);
 assert.deepEqual(runFG02FDiagnostic(),r);
});
