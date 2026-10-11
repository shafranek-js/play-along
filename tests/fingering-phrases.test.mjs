import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeMonophonicFingering as mono} from '../src/core/fingering-dp.mjs';
import {proposePolyphonicFingering as poly} from '../src/core/fingering-polyphonic.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';
import {proposePhraseAwareMonophonicFingering as phrase,proposePhraseAwareChordFingering as chord}
 from '../src/core/fingering-phrases.mjs';
import {phraseReferenceBenchmark} from '../scripts/fingering-phrase-benchmark.mjs';
import {references} from '../scripts/fingering-benchmark.mjs';

const seq=(pitches,anchors={})=>pitches.map((pitch,i)=>({pitch,start:i*.5,duration:.43,
 ...(Object.hasOwn(anchors,i)?{finger:anchors[i]}:{}) ,noteId:'n'+i}));
const simult=(pitches,anchors={})=>pitches.map((pitch,i)=>({pitch,start:0,duration:.42,
 ...(Object.hasOwn(anchors,i)?{finger:anchors[i]}:{}) ,noteId:'ch'+i}));
const scaleC=[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84],arpeggioC=[60,64,67,72,76,79,84];
const x=(a,b)=>assert.deepEqual(a.items.map(n=>n.finger),b);
const scalar=(xs,shift)=>xs.map(x=>x+shift);
const phraseTemplate={
 RH:[1,2,3,1,2,3,4,1,2,3,1,2,3,4,5],
 LH:[5,4,3,2,1,3,2,1,4,3,2,1,3,2,1]
};
const arpeggioTemplate={RH:[1,2,3,1,2,3,5],LH:[5,3,2,1,3,2,1]};
test('FG-02D C major 2 octave: phrase continuity, RH and LH',()=>{
 for(const hand of ['RH','LH']){
  const a=phrase(seq(scaleC),{hand});
  assert.equal(a.ok,true);assert.equal(a.strategy,'reference-phrase-candidate');
  assert.equal(a.phraseKind,'major-scale-two-octaves');x(a,phraseTemplate[hand]);
  assert.equal(audit(seq(scaleC),a.items).valid,true);
 }
});
test('FG-02D C arpeggio 2 octave: hand shift at C5, RH and LH',()=>{
 for(const hand of ['RH','LH']){
  const r=phrase(seq(arpeggioC),{hand});
  assert.equal(r.strategy,'reference-phrase-candidate');
  assert.equal(r.phraseKind,'major-arpeggio-two-octaves');x(r,arpeggioTemplate[hand]);
 }
});
test('FG-02D G major 2 octave: interval transposition generalization',()=>{
 const g=scalar(scaleC,7);
 for(const hand of ['RH','LH'])x(phrase(seq(g),{hand}),phraseTemplate[hand]);
});
test('FG-02D D major 2 octave: out-of-fixture metamorphic transposition',()=>{
 const d=scalar(scaleC,2);
 for(const hand of ['RH','LH'])x(phrase(seq(d),{hand}),phraseTemplate[hand]);
});
test('FG-02D D/G major arpeggio 2 octave: metamorphic transpositions',()=>{
 for(const shift of [2,7])for(const hand of ['RH','LH']){
  const r=phrase(seq(scalar(arpeggioC,shift)),{hand});
  assert.equal(r.strategy,'reference-phrase-candidate');
  x(r,arpeggioTemplate[hand]);
 }
});
test('FG-02D two-octave descending scale mirrors known ascending boundary',()=>{
 for(const hand of ['RH','LH']){
  const r=phrase(seq(scaleC.slice().reverse()),{hand});
  assert.equal(r.strategy,'reference-phrase-candidate');
  x(r,phraseTemplate[hand].slice().reverse());
 }
});
test('FG-02D major triad first inversion: role-dependent chord fingers',()=>{
 for(const hand of ['RH','LH']){
  const r=chord(simult([64,67,72]),{hand});
  assert.equal(r.strategy,'reference-phrase-candidate');
  x(r,hand==='RH'?[1,2,5]:[5,3,1]);
  assert.equal(audit(simult([64,67,72]),r.items).valid,true);
 }
});
test('FG-02D major triad second inversion: role-dependent chord fingers',()=>{
 for(const hand of ['RH','LH']){
  const r=chord(simult([67,72,76]),{hand});
  assert.equal(r.strategy,'reference-phrase-candidate');
  x(r,hand==='RH'?[1,3,5]:[5,2,1]);
 }
});
test('FG-02D first inversion on D/F-sharp does not force black-key thumb',()=>{
 const notes=simult([66,69,74]);
 const r=chord(notes,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.strategy,'baseline');
 assert.deepEqual(r.items,poly(notes,{hand:'RH'}).items);
});
test('FG-02D one-octave scale remains FG-02A baseline exactly',()=>{
 const notes=seq(scaleC.slice(0,8));
 const a=phrase(notes,{hand:'RH'}),b=mono(notes,{hand:'RH'});
 assert.equal(a.strategy,'baseline');assert.deepEqual(a.items,b.items);
});
test('FG-02D one-octave arpeggio remains baseline: do not force continuation',()=>{
 const notes=seq(arpeggioC.slice(0,4));
 assert.equal(phrase(notes,{hand:'RH'}).strategy,'baseline');
});
test('FG-02D F major two-octave (B-flat) falls back: different traditional fingering',()=>{
 const f=[65,67,69,70,72,74,76,77,79,81,82,84,86,88,89];
 const notes=seq(f),r=phrase(notes,{hand:'RH'});
 assert.equal(r.strategy,'baseline');
 assert.deepEqual(r.items,mono(notes,{hand:'RH'}).items);
});
test('FG-02D chromatic 2-octave run falls back, avoids inappropriate major-scale template',()=>{
 const notes=seq(Array.from({length:25},(_,i)=>60+i));
 assert.equal(phrase(notes,{hand:'RH'}).strategy,'baseline');
});
test('FG-02D C minor arpeggio falls back (no major template match)',()=>{
 const notes=seq([60,63,67,72,75,79,84]);
 assert.equal(phrase(notes,{hand:'RH'}).strategy,'baseline');
});
test('FG-02D author anchor incompatible with template falls back and remains unchanged',()=>{
 const notes=seq(scaleC,{3:4});
 const r=phrase(notes,{hand:'RH'});
 assert.ok(r.ok);assert.equal(r.strategy,'baseline');
 assert.equal(r.items[3].finger,4);assert.equal(r.items[3].source,'anchor');
});
test('FG-02D a matching author anchor stays author-owned even when phrase proposed',()=>{
 const notes=seq(scaleC,{0:1,3:1,7:1,14:5});
 const r=phrase(notes,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.strategy,'reference-phrase-candidate');
 for(const i of [0,3,7,14]){
  assert.equal(r.items[i].finger,notes[i].finger);
  assert.equal(r.items[i].source,'anchor');
 }
});
test('FG-02D chord conflicting author finger does not override author',()=>{
 const notes=simult([64,67,72],{1:3});
 const r=chord(notes,{hand:'RH'});
 assert.equal(r.ok,true);assert.equal(r.strategy,'baseline');
 assert.equal(r.items[1].finger,3);assert.equal(r.items[1].source,'anchor');
});
test('FG-02D no hand inference; invalid author anchors still fail closed',()=>{
 assert.equal(phrase(seq(scaleC),{}).reason,'HAND_REQUIRED');
 assert.equal(chord(simult([64,67,72]),{}).reason,'HAND_REQUIRED');
 assert.equal(phrase(seq(scaleC,{0:9}),{hand:'RH'}).reason,'INVALID_ANCHOR');
});
test('FG-02D rejects conflicting explicit hand annotations via template fallthrough',()=>{
 const notes=seq(scaleC);notes[0].hand='LH';
 const r=phrase(notes,{hand:'RH'});
 assert.equal(r.strategy,'baseline');
});
test('FG-02D input order, event identity, note IDs and duration do not change',()=>{
 const original=seq(scaleC).reverse();const saved=structuredClone(original);
 const r=phrase(original,{hand:'RH'});
 assert.equal(r.strategy,'reference-phrase-candidate');
 assert.deepEqual(original,saved);
 assert.deepEqual(r.items.map(n=>n.noteId),original.map(n=>n.noteId));
 assert.deepEqual(r.items.map(n=>n.pitch),original.map(n=>n.pitch));
 assert.deepEqual(r.items.map(n=>n.start),original.map(n=>n.start));
});
test('FG-02D same source inputs must be deterministic',()=>{
 const notes=seq(scaleC);
 assert.deepEqual(phrase(notes,{hand:'RH'}),phrase(notes,{hand:'RH'}));
});
test('FG-02D development-reference comparison reports baseline and candidate distinctly',()=>{
 const r=phraseReferenceBenchmark();
 assert.equal(r.proposed.cases,20);
 assert.ok(r.proposed.exact>=r.baseline.exactCases);
 assert.ok(r.proposed.matched>=r.baseline.matchedNotes);
 assert.equal(r.proposed.rejected,0);
 assert.equal(r.proposed.physicalConflicts,0);
 assert.ok(r.proposed.phraseCandidates>=5);
});
test('FG-02D source anchors retained for all 20 reference sequences',()=>{
 const pinned=phraseReferenceBenchmark({useAnchors:true});
 assert.equal(pinned.proposed.matched,pinned.proposed.total);
 assert.equal(pinned.proposed.physicalConflicts,0);
 assert.equal(pinned.proposed.rejected,0);
});
test('FG-02D does not turn simultaneous polyphony into fake solo output',()=>{
 const notes=simult([60,64,67]);
 assert.equal(phrase(notes,{hand:'RH'}).reason,'POLYPHONY_UNSUPPORTED');
});
test('FG-02D outputs have no claimed calibrated confidence or compatible total cost',()=>{
 const r=phrase(seq(scaleC),{hand:'RH'});
 assert.equal(r.totalCost,null);assert.equal(r.confidence,undefined);
 assert.match(r.hypothesisScope,/major/);
});
test('FG-02D fixture references remain unmutated and keep source context',()=>{
 assert.equal(references.cases.length,20);
 assert.ok(references.cases.every(c=>c.source.startsWith('https:')));
});
