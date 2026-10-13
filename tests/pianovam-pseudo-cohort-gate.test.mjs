import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_NAMES} from '../scripts/fingering-polyphony-alignment-probe.mjs';
import {partitionSourcePseudolabelRecordings as partition,
 inspectPilotSourcePseudoPair as inspect,summarizeDisjointPilot}
 from '../src/core/pianovam-pseudo-cohort-gate.mjs';
import {auditDisjointPianoVAMPseudoPilot as pilot}
 from '../scripts/pianovam-pseudo-disjoint-pilot.mjs';

const newNames=Array.from({length:95},(_,i)=>{
 const d=new Date(Date.UTC(2024,0,1+i));
 return d.toISOString().slice(0,10)+'_00-00-00';
});
const allNames=[...EXPECTED_NAMES,...newNames];
const tree=(folder,names)=>names.map(name=>({type:'file',path:folder+'/'+name+'.tsv',size:1200}));
const inputs=()=>({sourceTree:tree('TSV',allNames),pseudoTree:tree('Fingering',allNames),
 humanTree:tree('Fingering_GT',EXPECTED_NAMES),
 previouslyInspected:[...EXPECTED_NAMES]});
const pair=()=>{
 const source=[{onset:'0',key_offset:'.4',frame_offset:'.5',note:'60',velocity:'80'},
 {onset:'.5',key_offset:'1',frame_offset:'1.1',note:'64',velocity:'75'},
 {onset:'1.2',key_offset:'1.7',frame_offset:'1.8',note:'67',velocity:'90'}];
 const pseudo=[{...source[0],hand:'L',finger:'1'},
 {...source[1],hand:'Noinfo',finger:'Noinfo'},
 {...source[2],hand:'R',finger:'Noinfo'}];
 return {source,pseudo};
};
const serialize=(rows,annotated)=>'# onset\tkey_offset\tframe_offset\tnote\tvelocity'+
 (annotated?'\thand\tfinger':'')+'\n'+rows.map(r=>
  [r.onset,r.key_offset,r.frame_offset,r.note,r.velocity,
   ...(annotated?[r.hand,r.finger]:[])].join('\t')).join('\n')+'\n';
function fakeNetwork({spoof=null}={}){
 const manifest=inputs(),data=pair();
 return async url=>{
  const path=new URL(url).pathname;
  if(path.includes('/tree/')){
   const folder=path.split('/').at(-1);
   const value={TSV:manifest.sourceTree,Fingering:manifest.pseudoTree,
    Fingering_GT:manifest.humanTree}[folder];
   return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(value)};
  }
  const which=path.includes('/Fingering/')?'pseudo':'source';
  const rows=structuredClone(data[which]);
  if(spoof==='source-identity'&&which==='pseudo')rows[1].note='65';
  if(spoof==='wrong-code'&&which==='pseudo')rows[0].hand='invalid';
  return {ok:true,text:async()=>serialize(rows,which==='pseudo')};
 };
}
test('R5: pinned manifest produces 95 pseudo-only and excludes ALL 11 previously examined GT records',()=>{
 const p=partition(inputs());
 assert.equal(p.report.priorHumanGTRecordings,11);
 assert.equal(p.report.upstreamAutomaticRecords,106);
 assert.equal(p.report.pseudolabelOnlyRecordings,95);
 assert.equal(p.report.pilotRecords,8);
 assert.equal(p.pilotNames.length,8);
 assert.ok(p.pilotNames.every(n=>!EXPECTED_NAMES.includes(n)));
 assert.equal(p.report.publicationSafety.performerIndependent,false);
 assert.equal(p.report.publicationSafety.approvedForModelTraining,false);
 assert.equal(p.report.publicationSafety.approvedForLearner,false);
 assert.match(p.report.splitIdentitySha256.pilot,/^[0-9a-f]{64}$/);
 assert.ok(!JSON.stringify(p.report).includes('2024-'));
});
test('R5: deterministic pilot identity independent of input listing order and extra GT ordering',()=>{
 const a=inputs(),b=inputs();
 b.sourceTree.reverse();b.pseudoTree.reverse();b.humanTree.reverse();
 const x=partition(a),y=partition(b);
 assert.deepEqual(x,y);
 assert.deepEqual(partition(inputs()).pilotNames,x.pilotNames);
});
test('R5: unknown/changed previous human cohort, extra GT or missing GT pair must fail CLOSED',()=>{
 const a=inputs();a.previouslyInspected[0]=newNames[0];
 assert.throws(()=>partition(a),/R5_ORIGINAL_MANUAL_GT_SPLIT_MISMATCH/);
 const b=inputs();b.humanTree.push({type:'file',path:'Fingering_GT/'+newNames[0]+'.tsv'});
 assert.throws(()=>partition(b),/R5_ORIGINAL_MANUAL_GT_SPLIT_MISMATCH/);
 const c=inputs();c.pseudoTree=c.pseudoTree.filter(x=>!x.path.includes(EXPECTED_NAMES[0]));
 assert.throws(()=>partition(c),/R5_SOURCE_OR_GT_NO_PSEUDO_PARTNER/);
});
test('R5: missing original TSV partner, unsafe filename, duplicate manifest entry refuse',()=>{
 const a=inputs();a.sourceTree=a.sourceTree.filter(x=>!x.path.includes(newNames[4]));
 assert.throws(()=>partition(a),/R5_SOURCE_OR_GT_NO_PSEUDO_PARTNER/);
 const b=inputs();b.pseudoTree.push({type:'file',path:'Fingering/..%2Fescape.tsv'});
 assert.throws(()=>partition(b),/R5_UNTRUSTED_MANIFEST_FILENAME/);
 const c=inputs();c.humanTree.push({...c.humanTree[0]});
 assert.throws(()=>partition(c),/R5_DUPLICATE_MANIFEST_ENTRY/);
});
test('R5: exact ordered source note events count hand, finger, Noinfo honestly',()=>{
 const p=pair(),original=structuredClone(p),r=inspect(p.source,p.pseudo);
 assert.equal(r.notes,3);
 assert.equal(r.handKnown,2);
 assert.equal(r.handUnknown,1);
 assert.equal(r.fullHandAndFinger,1);
 assert.equal(r.handOnly,1);
 assert.equal(r.leftLabels,1);
 assert.equal(r.rightLabels,1);
 assert.equal(r.originalIndistinguishableEvents,0);
 assert.deepEqual(p,original);
 assert.equal(JSON.stringify(r).includes('pitch'),false);
});
test('R5: source file order, note data or missing automatic row must never be repaired by guessed matches',()=>{
 const p=pair();[p.pseudo[0],p.pseudo[1]]=[p.pseudo[1],p.pseudo[0]];
 assert.throws(()=>inspect(p.source,p.pseudo),/R5_ORIGINAL_EVENT_PSEUDO_ROW_MISMATCH/);
 const q=pair();q.pseudo[2].velocity='81';
 assert.throws(()=>inspect(q.source,q.pseudo),/R5_ORIGINAL_EVENT_PSEUDO_ROW_MISMATCH/);
 const z=pair();z.pseudo.pop();
 assert.throws(()=>inspect(z.source,z.pseudo),/R5_INCOMPLETE_PILOT_PAIR/);
});
test('R5: unknown-hand pseudolabels never get a numeric finger or fake source authority',()=>{
 const q=pair();q.pseudo[1].finger='5';
 assert.throws(()=>inspect(q.source,q.pseudo),/R5_UNTRUSTED_AUTO_HAND_FINGER_CODE/);
 const w=pair();w.pseudo[2].hand='composer';
 assert.throws(()=>inspect(w.source,w.pseudo),/R5_UNTRUSTED_AUTO_HAND_FINGER_CODE/);
});
test('R5: simultaneous source duplicate event identities are counted but cannot certify attribution',()=>{
 const r=pair();r.source.push({...r.source[0]});r.pseudo.push({...r.pseudo[0]});
 const a=inspect(r.source,r.pseudo);
 assert.equal(a.originalIndistinguishableEventGroups,1);
 assert.equal(a.originalIndistinguishableEvents,2);
 assert.equal(a.handKnown,3);
});
test('R5: sample summaries always reconcile and never invent correctness metrics',()=>{
 const p=partition(inputs()),m=inspect(...Object.values(pair()));
 const x=summarizeDisjointPilot(Array.from({length:8},()=>m),p.report);
 assert.equal(x.sourceEvents,24);assert.equal(x.handKnown,16);
 assert.equal(x.handUnknown,8);assert.equal(x.handCoveragePct,66.67);
 assert.equal(x.completePseudoFingerCoveragePct,33.33);
 assert.equal(Object.hasOwn(x,'correct'),false);
 assert.throws(()=>summarizeDisjointPilot([m],p.report),/R5_INCOMPLETE_DISJOINT_PILOT/);
});
test('R5: synthetic mock external run exercises all 3 pinned directories and eight TWO-file original parity checks',async()=>{
 const calls=[];const f=fakeNetwork();
 const report=await pilot({fetcher:async(...args)=>{calls.push(args[0]);return f(...args)},
  expectedPilotSourceNotes:24});
 assert.equal(report.cohort.pseudolabelOnlyRecordings,95);
 assert.equal(report.cohort.priorHumanGTRecordings,11);
 assert.equal(report.pilot.sourceEvents,24);
 assert.equal(report.pilot.handCoveragePct,66.67);
 assert.equal(report.pilotSourceContentSha256.length,8);
 assert.equal(calls.filter(x=>x.includes('/tree/')).length,3);
 assert.equal(calls.filter(x=>x.includes('/resolve/')).length,16);
 assert.equal(calls.some(x=>EXPECTED_NAMES.some(n=>x.includes(n+'.tsv'))),false);
 assert.equal(report.newIndependentRealPerformerHoldout,undefined);
 assert.equal(report.independentPianistHoldout,false);
 assert.equal(report.sourceDerivedFingeringAllowedInLearner,false);
 assert.equal(report.trainableModelCreated,false);
 assert.equal(report.productionEligible,false);
 assert.ok(!JSON.stringify(report).includes('"note":'));
 assert.ok(!JSON.stringify(report).includes('2024-'));
});
test('R5: driver hard refuses a pilot whose pseudo differs from the pinned ORIGINAL rows',async()=>{
 await assert.rejects(pilot({fetcher:fakeNetwork({spoof:'source-identity'})}),
 /R5_ORIGINAL_EVENT_PSEUDO_ROW_MISMATCH/);
 await assert.rejects(pilot({fetcher:fakeNetwork({spoof:'wrong-code'})}),
 /R5_UNTRUSTED_AUTO_HAND_FINGER_CODE/);
});
test('R5: missing human GT / unexpected fake cohort cannot be called disjoint',()=>{
 const a=inputs();a.humanTree=[];
 assert.throws(()=>partition(a),/R5_ORIGINAL_MANUAL_GT_SPLIT_MISMATCH/);
 const b=inputs();b.pseudoTree=[];
 assert.throws(()=>partition(b),/R5_MISSING_BOUNDED_SOURCE_COHORT/);
 const c=inputs();
 assert.throws(()=>partition(c,{pilotSize:100}),/R5_INVALID_PILOT_SIZE/);
});
