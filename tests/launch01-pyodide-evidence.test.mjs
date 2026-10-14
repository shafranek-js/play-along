import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const qa=JSON.parse(readFileSync(new URL(
 '../research/launch01-real-pyodide-browser-2026-10-14.json',import.meta.url),'utf8'));
const corpus=JSON.parse(readFileSync(new URL(
 '../research/fg02g-repertoire-manifest.json',import.meta.url),'utf8'));
test('genuine browser Python QA maps to pinned real score, not generated reference answers',()=>{
 const sample=corpus.cases.find(x=>x.id===qa.source.caseId);
 assert.ok(sample,'real score must be in frozen public manifest');
 assert.equal(qa.source.noteCount,sample.expectedNotes);
 assert.equal(qa.source.sourceSHA256,sample.sha256);
 assert.equal(qa.source.corpusLicense,corpus.license);
 assert.equal(qa.source.fingerReferencesSentToSolver,false);
 assert.match(qa.testedCommit,/^[a-f0-9]{40}$/);
 assert.match(qa.evidence.workflow,/\/actions\/runs\/\d+$/);
 assert.equal(qa.evidence.syntheticWorkerResponseUsed,false);
 assert.equal(qa.evidence.nativePythonSubstituteUsed,false);
 assert.equal(qa.actualLiveResult.pythonAlgorithmExecuted,true);
 assert.equal(qa.actualLiveResult.officialPyodideModuleFetched,true);
});
test('actual original music data and user/apply provenance survive MusicXML reimport',()=>{
 const r=qa.actualLiveResult;
 assert.equal(r.originalNotes,qa.source.noteCount);
 assert.equal(r.appliedFingeringNumbers,qa.source.noteCount);
 assert.equal(r.reimportedMusicXmlNotes,qa.source.noteCount);
 assert.equal(r.reimportedFingersMarkedUnverifiedUserExport,qa.source.noteCount);
 assert.equal(r.reimportedFingersMisclassifiedAuthor,0);
 assert.equal(r.sourcePitchOnsetPhysicalReleaseAndNoteIdsUnchanged,true);
 assert.equal(qa.source.sourceFilesCommitted,false);
});
test('offline results cannot be mistaken for readiness to ship upstream-derived code',()=>{
 const o=qa.offlineRecovery,g=qa.boundaries;
 assert.equal(o.blockedCdnRequests,1);
 assert.equal(o.workerOriginalNotMocked,true);
 assert.equal(o.calculateAvailableForRetry,true);
 assert.equal(o.applyStayedDisabled,true);
 assert.equal(o.exportStayedDisabled,true);
 assert.equal(o.originalSongUnmodified,true);
 assert.equal(g.externalCopyrightAndRedistributionCleared,false);
 assert.equal(g.publicBetaReleaseApproved,false);
 assert.equal(g.testedActualUserUpload,false);
 assert.equal(g.midiKeyboardHardwareVerified,false);
});
