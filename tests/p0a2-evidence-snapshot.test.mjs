import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(new URL('../research/p0a2-real-python-aggregate-2026-10-14.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../research/fg02g-repertoire-manifest.json',import.meta.url),'utf8'));
test('published P0-A2 aggregate is grounded in frozen real Python workflow, not mock',()=>{
 assert.match(report.evidence.runUrl,/actions\/runs\/\d+/);
 assert.match(report.evidence.commit,/^[a-f0-9]{40}$/);
 assert.equal(report.input.sourceRevision,manifest.revision);
 assert.equal(report.input.cases,manifest.cases.length);
 assert.equal(report.input.notes,manifest.cases.reduce((n,c)=>n+c.expectedNotes,0));
 assert.equal(report.input.fingerLabelsWithheldUntilAfterInference,true);
 assert.equal(report.input.handLabelsKnownToEngines,true);
 assert.equal(report.results.pianoMotion.repeatStable,true);
});
test('all published counts reconcile independently, including paired exclusive wins',()=>{
 const {results:{playAlong:a,pianoMotion:b,paired:p,cases}}=report;
 for(const x of [a,b]){
  assert.equal(x.proposed+x.refused,x.eligible);
  assert.equal(x.correct+x.wrong,x.proposed);
  assert.equal(x.exactMatchPct,+(100*x.correct/x.eligible).toFixed(2));
 }
 assert.equal(p.identicalAssignments+p.differentAssignments,p.evaluated);
 assert.equal(p.bothCorrect+p.onlyPlayAlongCorrect+p.onlyPianoMotionCorrect+p.bothWrong,p.evaluated);
 assert.equal(p.bothCorrect+p.onlyPlayAlongCorrect,a.correct);
 assert.equal(p.bothCorrect+p.onlyPianoMotionCorrect,b.correct);
 assert.equal(cases.reduce((n,c)=>n+c.notes,0),p.evaluated);
 assert.equal(cases.reduce((n,c)=>n+c.identical,0),p.identicalAssignments);
 assert.equal(cases.reduce((n,c)=>n+c.different,0),p.differentAssignments);
 assert.equal(cases.reduce((n,c)=>n+c.playAlongCorrect,0),a.correct);
 assert.equal(cases.reduce((n,c)=>n+c.pianoMotionCorrect,0),b.correct);
 assert.deepEqual(new Set(cases.map(c=>c.id)),new Set(manifest.cases.map(c=>c.id)));
});
test('report does not claim any pianist consensus, teaching promotion or real hand-separation score',()=>{
 assert.equal(report.interpretation.algorithmWinner,null);
 assert.equal(report.interpretation.accuracyGainEstablished,false);
 assert.equal(report.interpretation.productionEligible,false);
 assert.equal(report.interpretation.expertValidated,false);
 assert.equal(report.interpretation.handSeparationAccuracyMeasured,false);
});
