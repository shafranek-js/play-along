import test from 'node:test';
import assert from 'node:assert/strict';
import {PINNED_REVISION,EXPECTED_NAMES,parseTabularTSV,
 evaluateEventCorrespondence,auditPianoVAMAlignment}
 from '../scripts/fingering-polyphony-alignment-probe.mjs';

const event='0.000000\t0.500000\t0.600000\t60\t80';
const ref='# onset\tkey_offset\tframe_offset\tnote\tvelocity\n'+
 event+'\n0.600000\t1.000000\t1.100000\t64\t70\n';
const gt='# onset\tkey_offset\tframe_offset\tnote\tvelocity\thand\tfinger\n'+
 event+'\tR\t1\n0.600000\t1.000000\t1.100000\t64\t70\tR\t3\n';
test('FG-02J frozen external-source manifest has 11 file names and fixed commit',()=>{
 assert.equal(EXPECTED_NAMES.length,11);
 assert.equal(new Set(EXPECTED_NAMES).size,11);
 assert.match(PINNED_REVISION,/^[a-f0-9]{40}$/);
});
test('FG-02J parse source schema without leaking rows or inventing hand numbers',()=>{
 const t=parseTabularTSV(ref,{annotated:false});
 const g=parseTabularTSV(gt,{annotated:true});
 assert.equal(t.length,2);assert.equal(g.length,2);
 assert.equal(g[0].hand,'R');assert.equal(g[0].finger,'1');
 assert.equal(evaluateEventCorrespondence(t,g).bijective,true);
});
test('FG-02J exact key-release alignment catches mismatched but similar notes',()=>{
 const t=parseTabularTSV(ref,{annotated:false});
 const g=parseTabularTSV(gt.replace('0.500000\t0.600000','0.480000\t0.600000'),
  {annotated:true});
 const r=evaluateEventCorrespondence(t,g);
 assert.equal(r.matched,1);
 assert.equal(r.missingSourceAnnotations,1);
 assert.equal(r.extraGTEvents,1);
 assert.equal(r.bijective,false);
});
test('FG-02J multiset alignment accepts reordered notes but not duplicated events',()=>{
 const t=parseTabularTSV(ref,{annotated:false});
 const g=parseTabularTSV(gt,{annotated:true}).reverse();
 assert.equal(evaluateEventCorrespondence(t,g).bijective,true);
 assert.equal(evaluateEventCorrespondence(t,g.concat(g[0])).bijective,false);
});
test('FG-02J reject source files lacking per-note hand/finger columns',()=>{
 assert.throws(()=>parseTabularTSV(ref,{annotated:true}),/TSV_UNEXPECTED_SCHEMA/);
 assert.throws(()=>parseTabularTSV(gt.replace('hand','unknown'),{annotated:true}),
  /TSV_UNEXPECTED_SCHEMA/);
});
test('FG-02J schema check refuses invalid negative key duration and MIDI range',()=>{
 assert.throws(()=>parseTabularTSV(ref.replace('0.500000','-0.100000'),
  {annotated:false}),/TSV_INVALID_PHYSICAL_EVENT/);
 assert.throws(()=>parseTabularTSV(ref.replace('\t60\t','\t130\t'),
  {annotated:false}),/TSV_INVALID_PHYSICAL_EVENT/);
});
test('FG-02J source discovery failure must fail alignment closed',async()=>{
 const report=await auditPianoVAMAlignment({
  discover:async()=>({reason:'SOURCE_METADATA_UNAVAILABLE'})
 });
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.productionAutoFingeringAllowed,undefined);
});
test('FG-02J metadata without all eleven source files blocks evaluation',async()=>{
 const report=await auditPianoVAMAlignment({discover:async()=>({
  revision:PINNED_REVISION,declaredLicense:'cc-by-nc-sa-4.0',
  candidates:[{path:'Fingering_GT/example.tsv'}]
 })});
 assert.equal(report.reason,'PINNED_SOURCE_MANIFEST_CHANGED');
});
