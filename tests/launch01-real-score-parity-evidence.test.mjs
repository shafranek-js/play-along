import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const evidence=JSON.parse(readFileSync(new URL(
 '../research/launch01-real-score-parity-2026-10-14.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL(
 '../research/fg04b1b-asap-score-manifest.json',import.meta.url),'utf8'));
test('source-pinned real scores are retained as noncommercial research aggregates only',()=>{
 assert.equal(evidence.schema,'launch01-actual-asap-score-midi-parity-v1');
 assert.equal(evidence.evidence.sourceLicense,manifest.source.license);
 assert.match(evidence.evidence.chromiumWorkflowUrl,/github\.com\/shafranek-js\/play-along\/actions\/runs\/\d+$/);
 assert.equal(evidence.method.sourceFilesCommitted,false);
 assert.equal(evidence.method.pianoExpertReviewed,false);
 assert.equal(evidence.cases.length,2);
 const named=new Set();
 for(const row of evidence.cases){
  assert.ok(manifest.cases.some(x=>x.id===row.caseId));
  assert.ok(!named.has(row.caseId));named.add(row.caseId);
  assert.equal(row.matchingPitchHistogram,true);
  assert.equal(row.sourceNotes,row.midiNotes);
  assert.equal(row.noteOnWithin20ms,row.sourceNotes);
  assert.deepEqual(row.midiDeviceDeclaredPorts,['1']);
  assert.deepEqual(row.warningsAfterFix,[]);
  assert.equal(row.fullSourceNoteIdentityProven,false);
  assert.equal(row.originalMidiRawTickVerification.tickResolution,480);
  assert.ok(row.originalMidiRawTickVerification.maxOnsetResidualSeconds<1e-9);
  assert.ok(row.originalMidiRawTickVerification.maxNoteOffResidualSeconds<1e-9);
  assert.equal(row.gateDifferenceHistogramSeconds.reduce((n,x)=>n+x.count,0),
    row.sourceNotes);
 }
});
test('source XML versus source MIDI release differences are never called browser truncation',()=>{
 const totals=evidence.totals,s=evidence.cases[1],b=evidence.cases[0];
 assert.equal(totals.scoreNotes,b.sourceNotes+s.sourceNotes);
 assert.equal(totals.midiNotes,totals.scoreNotes);
 assert.equal(totals.onsetWithin20ms,totals.scoreNotes);
 assert.equal(totals.releasesWithin20ms,
  b.noteOffWithin20ms+s.noteOffWithin20ms);
 assert.equal(totals.releasesDifferentOver20ms,
  totals.scoreNotes-totals.releasesWithin20ms);
 assert.equal(totals.releasesDifferentOver20ms,579);
 assert.equal(s.gateDifferenceHistogramSeconds[0].count,568);
 assert.equal(s.simultaneousSamePitchAmbiguities,3);
 assert.equal(totals.actualSourceMidiPhysicalTickImportedWithoutAlteration,true);
 assert.equal(totals.allCrossFormatSourceNoteIdentitiesEstablished,false);
 assert.equal(totals.productionReleaseReady,false);
});
