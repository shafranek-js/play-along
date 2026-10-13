import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerOverrideWorkKey} from '../src/core/finger-overrides.mjs';
import {inspectMusicXmlProvenanceResearch as inspect} from '../src/core/musicxml-guidance-provenance.mjs';

const BLACK=new Set([1,3,6,8,10]);
const xx=p=>7*Math.floor(p/12)+[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6][p%12];
function geometry(){
 const byPitch=new Map();
 for(let p=21;p<=108;p++){
  const x=20+xx(p)*16,w=BLACK.has(p%12)?9:16;
  byPitch.set(p,{x,w,center:x+w/2});
 }
 return {byPitch,whites:[{w:16}]};
}
const id=i=>'xml:P1:0:'+i+':'+(i+1);
const N=(i,pitch,start,finger,hand='RH',source='musicxml')=>({
 noteId:id(i),sourceNoteIds:[id(i)],pitch,start,duration:.06,
 partId:'P1',staff:'1',voice:'1',sourceTrack:0,track:0,channel:0,velocity:85,
 ...(finger?{finger,hand,fingeringSource:source}:{})
});
function original(notes=[N(0,60,0,1),N(1,64,.8,3)],xml='<score-partwise><part id="P1"/></score-partwise>'){
 const audioEvents=notes.flatMap(n=>[
  {type:'noteOn',time:n.start,track:0,sourceTrack:0,noteId:n.noteId,pitch:n.pitch,channel:0,velocity:85},
  {type:'noteOff',time:n.start+n.duration,track:0,sourceTrack:0,noteId:n.noteId,pitch:n.pitch,channel:0}
 ]);
 return {format:'MusicXML',title:'Provenance fixture',author:'Author',notationXML:xml,
  tracks:[{notes}],audioEvents,scoreTempoMap:[{beat:0,sec:0,tempo:500000}]};
}
const copy=x=>structuredClone(x);
const base=(song=original())=>({
 song,storedOverrides:{},reimport:()=>copy(song),
 targetNoteId:id(1),hand:'RH',completedNoteIds:[id(0)],geometry:geometry(),
 viewport:{left:0,right:1800},
 transport:{mode:'listen',playing:true,now:.1,leadMs:750,speedPercent:100,oppositeHandClear:true}
});
const review=cfg=>inspect(cfg);
test('D1: independently roundtripped untouched author XML can pass research-only motion gate',()=>{
 const r=review(base());
 assert.equal(r.ok,true);
 assert.equal(r.motion.kind,'moving');
 assert.deepEqual(r.motion.keys.map(n=>n.finger),[3]);
 assert.equal(r.sourceReimportVerified,true);
 assert.equal(r.productionEligible,false);
 assert.equal(r.expertValidated,false);
 assert.equal(r.researchOnly,true);
});
test('D1: unverified re-imported user-export finger numbers NEVER authorize teaching/movement',()=>{
 const score=original([N(0,60,0,1,'RH','musicxml-user-export-unverified'),
  N(1,64,.8,3,'RH','musicxml-user-export-unverified')]);
 const cfg=base(score);
 const r=review(cfg);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'unverified-target-group');
 assert.equal(r.productionEligible,false);
 assert.ok(!('motion' in r));
});
test('D1: explicit saved local edits on exact source fingerprint can provide same-layer pairs',()=>{
 const score=original([N(0,60,0,1,'RH','musicxml-user-export-unverified'),
  N(1,64,.8,3,'RH','musicxml-user-export-unverified')]);
 const cfg=base(score),key=fingerOverrideWorkKey(score);
 cfg.storedOverrides={[key]:{
  [id(0)]:{finger:1,hand:'RH'},[id(1)]:{finger:3,hand:'RH'}
 }};
 const r=review(cfg);
 assert.equal(r.ok,true);
 assert.equal(r.motion.kind,'moving');
 assert.equal(r.motion.keys[0].finger,3);
 assert.equal(r.provenanceSummary.manualPairs,2);
 assert.equal(r.provenanceSummary.authorPairs,0);
 assert.equal(r.provenanceSummary.unverifiedExportNumbers,2);
 assert.equal(r.productionEligible,false);
});
test('D1: partial stored manual changes cannot borrow author other field',()=>{
 const song=original();const cfg=base(song),key=fingerOverrideWorkKey(song);
 cfg.storedOverrides={[key]:{[id(1)]:{finger:2,hand:null}}};
 assert.equal(review(cfg).reason,'unverified-target-group');
});
test('D1: even plausible caller forged author finger fails independent reimport',()=>{
 const song=original();song.tracks[0].notes[1].finger=4;
 assert.equal(review({...base(song),reimport:()=>original()}).reason,'source-reimport-identity-mismatch');
});
test('D1: forged imported authorHand and source classification fail independent importer check',()=>{
 const song=original();song.tracks[0].notes[1].hand='LH';
 assert.equal(review({...base(song),reimport:()=>original()}).reason,'source-reimport-identity-mismatch');
 const xml=original();xml.tracks[0].notes[1].fingeringSource='musicxml';
 assert.equal(review({...base(xml),reimport:()=>original([
  N(0,60,0,1),N(1,64,.8,3,'RH','musicxml-user-export-unverified')
 ])}).reason,'source-reimport-identity-mismatch');
});
test('D1: tampered pitch, segment IDs, duration, source voice/part and tempo refuse',()=>{
 for(const tamper of [
  s=>s.tracks[0].notes[1].pitch=65,
  s=>s.tracks[0].notes[1].sourceNoteIds=['xml:P1:0:1:999'],
  s=>s.tracks[0].notes[1].duration=.1,
  s=>s.tracks[0].notes[1].voice='2',
  s=>s.tracks[0].notes[1].partId='P2',
  s=>s.scoreTempoMap[0].tempo=250000,
  s=>s.audioEvents[0].velocity=45
 ]){
  const song=original();tamper(song);
  assert.equal(review({...base(song),reimport:()=>original()}).reason,
   'source-reimport-identity-mismatch');
 }
});
test('D1: XML spoofed by marker, expanded repeat, mismatched source XML and importer failure refuse',()=>{
 const s=original();
 assert.equal(review({...base(s),song:{...s,originalNotationXML:'original'}}).reason,'unsupported-original-xml');
 assert.equal(review({...base(s),reimport:()=>({...s,notationXML:'other'})}).reason,'source-xml-roundtrip-mismatch');
 assert.equal(review({...base(s),reimport:()=>{throw Error('parse failed')}}).reason,'independent-reimport-failed');
});
test('D1: local correction from a different original XML work is not accepted',()=>{
 const s=original(),other=original(undefined,'<score-partwise different="yes"/>');
 const key=fingerOverrideWorkKey(other);
 const cfg=base(s);
 cfg.storedOverrides={[key]:{[id(1)]:{finger:2,hand:'LH'}}};
 const result=review(cfg);
 assert.equal(result.ok,true,'Unknown other-work override cannot be imported');
 assert.equal(result.motion.keys[0].finger,3);
 assert.equal(result.provenanceSummary.authorPairs,2);
 assert.equal(result.provenanceSummary.manualPairs,0);
});
test('D1: malformed/unrecognized local edits refuse without partial mutation',()=>{
 const score=original(),key=fingerOverrideWorkKey(score);
 const cfg=base(score);
 cfg.storedOverrides={[key]:{[id(1)]:{finger:9,hand:'RH'}}};
 assert.equal(review(cfg).reason,'invalid-local-override-store');
 cfg.storedOverrides={[key]:{'xml:P1:0:999:1':{finger:2,hand:'RH'}}};
 assert.equal(review(cfg).reason,'unmatched-user-correction');
});
test('D1: unexpected note source ids, duplicate notes and overlarge original scores refuse',()=>{
 const a=original();a.tracks[0].notes[1].sourceNoteIds=[id(0)];
 assert.equal(review(base(a)).reason,'source-reimport-identity-mismatch');
 const b=original();b.tracks[0].notes[1].noteId=id(0);
 assert.equal(review(base(b)).reason,'source-reimport-identity-mismatch');
 const big=original(Array.from({length:129},(_,i)=>N(i,60+i%12,i*.2,1)));
 assert.equal(review(base(big)).reason,'source-reimport-identity-mismatch');
});
test('D1: inputs are immutable; same original and local edits lead to deterministic verdict',()=>{
 const song=original(),cfg=base(song),key=fingerOverrideWorkKey(song);
 cfg.storedOverrides={[key]:{[id(1)]:{finger:4,hand:'RH'}}};
 const saved={score:copy(song),corrections:copy(cfg.storedOverrides),done:copy(cfg.completedNoteIds)};
 const a=review(cfg),b=review(cfg);
 assert.deepEqual(a,b);
 assert.equal(a.motion.keys[0].finger,4);
 assert.deepEqual(song,saved.score);
 assert.deepEqual(cfg.storedOverrides,saved.corrections);
 assert.deepEqual(cfg.completedNoteIds,saved.done);
});
