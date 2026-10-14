import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importPianoMotionAnalysisResearch as convert}
 from '../src/core/pianomotion-fingering-import.mjs';
import {compareFingeringEnginesResearch as compare}
 from '../src/core/fingering-engine-comparison.mjs';
const be16=x=>[(x>>8)&255,x&255];
const be32=x=>[(x>>>24)&255,(x>>>16)&255,(x>>>8)&255,x&255];
const midi=Uint8Array.from([
 ...Buffer.from('MThd'),...be32(6),...be16(0),...be16(1),...be16(480),
 ...Buffer.from('MTrk'),...be32(13),
 0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0
]);
const hash=createHash('sha256').update(midi).digest('hex');
const ref={midiTrackIndex:0,channel:0,noteOnOrdinal:0,noteOffOrdinal:1};
const source=[{noteId:'xml:P1:0:0:1',partId:'P1',staff:1,voice:'1',
 pitch:60,start:0,duration:.5,hand:'RH'}];
const build=()=>({
 rawBaseline:{status:'loaded',inputSha256:hash,
  identityLosses:[],unmappedSourceNoteIds:[],
  sourceNotes:[{noteId:'piano-1',pitch:60,start:0,end:.5,sourceEvent:{...ref}}],
  identityMappings:[{noteId:'piano-1',normalizedNoteId:'piano-1',
   status:'exact',rawEvents:[{...ref}]}]},
 document:{schemaVersion:1,projectId:'project-1',revision:0,
  notes:[{noteId:'piano-1',sourceNoteIds:['piano-1'],pitch:60,
   startSeconds:0,endSeconds:.5,hand:'right',sourceEvent:{...ref}}]},
 fingeringPlan:{kind:'fingering',schemaVersion:1,projectId:'project-1',inputRevision:0,
  assignments:[{noteId:'piano-1',hand:'right',finger:1,disposition:'played'}]}
});
const importRun=(analysis=build(),score=source,bytes=midi)=>convert({
 source:score,midiBytes:bytes,analysis});
test('FG-04C2b real-format PianoMotion envelopes are mapped by raw event with SHA',()=>{
 const pm=build(),before=structuredClone(pm);
 const r=importRun(pm);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.sourceIdentityVerified,true);
 assert.equal(r.items[0].noteId,source[0].noteId);
 assert.equal(r.items[0].finger,1);
 const report=compare({source,pianoMotion:r.items});
 assert.equal(report.pianoMotion.status,'evaluated',JSON.stringify(report));
 assert.equal(report.pianoMotion.summary.proposed,1);
 assert.equal(report.pianoMotion.summary.sourceContextUnverified,1);
 assert.deepEqual(pm,before);
});
test('FG-04C2b original MIDI SHA mismatch rejects unrelated PianoMotion output',()=>{
 const p=build();p.rawBaseline.inputSha256='a'.repeat(64);
 assert.equal(importRun(p).reason,'MIDI_HASH_MISMATCH');
});
test('FG-04C2b source repaired or note identity loss cannot produce assignments',()=>{
 const p=build();p.rawBaseline.status='repaired';
 assert.equal(importRun(p).reason,'PIANOMOTION_RESULT_INCOMPLETE_OR_REPAIRED');
 const a=build();a.rawBaseline.identityLosses=[{noteId:'piano-1'}];
 assert.equal(importRun(a).reason,'PIANOMOTION_SOURCE_IDENTITY_LOSS');
 const b=build();b.rawBaseline.identityMappings[0].status='decoded-only';
 assert.equal(importRun(b).reason,'PIANOMOTION_SOURCE_IDENTITY_LOSS');
});
test('FG-04C2b source event ordinal must match original provenance exactly',()=>{
 const p=build();p.document.notes[0].sourceEvent.noteOffOrdinal=8;
 assert.equal(importRun(p).reason,'PIANOMOTION_DOCUMENT_UNVERIFIED');
 const q=build();q.rawBaseline.identityMappings[0].rawEvents[0].noteOffOrdinal=2;
 assert.equal(importRun(q).reason,'PIANOMOTION_SOURCE_EVENT_UNVERIFIED');
});
test('FG-04C2b pianoMotion cannot change pitch, onset, release or candidate hand',()=>{
 for(const change of [{pitch:61},{startSeconds:.02},{endSeconds:.6}]){
  const p=build();Object.assign(p.document.notes[0],change);
  assert.equal(importRun(p).reason,'PIANOMOTION_NOTE_TIMING_CHANGED');
 }
 const p=build();p.fingeringPlan.assignments[0].hand='left';
 assert.equal(importRun(p).reason,'PIANOMOTION_DOCUMENT_UNVERIFIED');
});
test('FG-04C2b score/MIDI mismatch cannot be resolved by pitch-only mapping',()=>{
 const edited=[{...source[0],duration:.49}];
 assert.match(importRun(build(),edited).reason,/^SCORE_MIDI_/);
});
test('FG-04C2b unplayable/gliss fingers remain abstentions and never enter teacher hints',()=>{
 const p=build();p.fingeringPlan.assignments[0].finger=null;
 p.fingeringPlan.assignments[0].disposition='glissando';
 const r=importRun(p);
 assert.equal(r.ok,true);
 assert.equal(r.items[0].finger,null);
 assert.equal(compare({source,pianoMotion:r.items}).pianoMotion.summary.abstained,1);
 assert.equal(r.productionEligible,false);
});
test('FG-04C2b source-author hand overrides inferred PianoMotion hand via rejection',()=>{
 const p=build();p.document.notes[0].hand='left';
 p.fingeringPlan.assignments[0].hand='left';
 const r=importRun(p);
 assert.equal(r.ok,true);
 assert.equal(compare({source,pianoMotion:r.items}).pianoMotion.reason,
  'SCORE_EVENT_OR_HAND_CHANGED');
});

test('FG-04C2b local runner executes both actual-engine envelopes without exporting score',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {runLocalComparison}=await import('../scripts/fingering-engine-comparison.mjs');
 const dir=await mkdtemp(join(tmpdir(),'pianomotion-source-bridge-'));
 try{
  const json=join(dir,'input.json'),music=join(dir,'source.mid');
  await writeFile(json,JSON.stringify({source,pianoMotionAnalysis:build()}),'utf8');
  await writeFile(music,midi);
  const result=await runLocalComparison(json,music);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.pianoMotion.status,'evaluated');
  assert.equal(result.pianoMotionImport.status,'verified');
  assert.equal(result.pianoMotionImport.noteCount,1);
  const separated=join(dir,'actual-pianomotion-analysis.json');
  const sourceOnly=join(dir,'source-only.json');
  await writeFile(separated,JSON.stringify(build()),'utf8');
  await writeFile(sourceOnly,JSON.stringify({source}),'utf8');
  const direct=await runLocalComparison(sourceOnly,music,separated);
  assert.equal(direct.ok,true,JSON.stringify(direct));
  assert.deepEqual(direct.pianoMotion.summary,result.pianoMotion.summary);
  assert.equal(result.playAlong.status,'evaluated');
  assert.equal(result.productionEligible,false);
  assert.equal((await runLocalComparison(json)).reason,'ORIGINAL_MIDI_PATH_REQUIRED');
  const mixed=join(dir,'mixed.json');
  await writeFile(mixed,JSON.stringify({source,pianoMotionAnalysis:build(),pianoMotion:[]}));
  assert.equal((await runLocalComparison(mixed,music)).reason,'MIXED_PIANOMOTION_OUTPUT_MODES');
  assert.ok(!JSON.stringify(result).includes('piano-1'),'Do not output external source note IDs');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('FG-04C2 Node launcher rejects missing local Python core without invoking anything',async()=>{
 const {runPianoMotionLocally}=await import('../scripts/fg04c2-run-pianomotion.mjs');
 assert.equal(runPianoMotionLocally([]).reason,'THREE_PATHS_REQUIRED');
 assert.equal(runPianoMotionLocally(['/does-not-exist','x.mid','out.json']).reason,'PIANOMOTION_CORE_NOT_FOUND');
});

// FG-04C7: original MIDI source-event mapping from the actual PianoMotion result.
import './pianomotion-midi-fingering-bridge.test.mjs';
