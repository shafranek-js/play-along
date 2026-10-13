import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePseudoHandLabels,summarizePseudoHandEvidence}
 from '../src/core/hand-pseudolabel-evidence.mjs';
import {auditPianoVAMAutoHandPseudoLabels}
 from '../scripts/pianovam-pseudohand-audit.mjs';
import {EXPECTED_NAMES} from '../scripts/fingering-polyphony-alignment-probe.mjs';

const raw=(id,pitch,time)=>({
 onset:String(time),key_offset:String(time+.2),frame_offset:String(time+.3),
 note:String(pitch),velocity:'80'
});
const labeled=(r,hand,finger)=>({...r,hand,finger});
const sample=()=>{
 const source=[raw('0',60,0),raw('1',64,.4),raw('2',67,.8),
  raw('3',71,1.2),raw('4',72,1.6)];
 const pseudo=[labeled(source[0],'R','1'),labeled(source[1],'Noinfo','Noinfo'),
  labeled(source[2],'L','3'),labeled(source[3],'R','Noinfo'),
  labeled(source[4],'Noinfo','Noinfo')];
 const manual=[labeled(source[0],'R','1'),labeled(source[1],'L','2'),
  labeled(source[2],'R','3')];
 return {source,pseudo,manual};
};
test('R4: no pseudo-label ever becomes manual GT, with distinct hand/finger denominators',()=>{
 const {source,pseudo,manual}=sample(),before=structuredClone({source,pseudo,manual});
 const r=comparePseudoHandLabels(source,pseudo,manual);
 assert.equal(r.sourceNotes,5);
 assert.equal(r.manualGTNotes,3);
 assert.equal(r.uniqueManualEvents,3);
 assert.equal(r.automaticHandKnown,3);
 assert.equal(r.automaticHandOnly,1);
 assert.equal(r.automaticHandUnknown,2);
 assert.equal(r.autoHandProposed,2);
 assert.equal(r.handCorrect,1);
 assert.equal(r.handIncorrect,1);
 assert.equal(r.autoHandUnknown,1);
 assert.equal(r.fullHandFingerCorrect,1);
 assert.equal(r.fullHandFingerIncorrect,1);
 assert.equal(r.handErrorsByPredictedSide['L-as-R'],1);
 assert.deepEqual({source,pseudo,manual},before);
 assert.ok(!JSON.stringify(r).includes('"pitch":'));
 assert.ok(!JSON.stringify(r).includes('"onset":'));
});
test('R4: automatic missing hand is abstention, never a guessed RH/LH label',()=>{
 const a=sample();a.pseudo=a.pseudo.map((n,i)=>i===3?labeled(n,'Noinfo','Noinfo'):n);
 const r=comparePseudoHandLabels(a.source,a.pseudo,a.manual);
 assert.equal(r.autoHandProposed,2);
 assert.equal(r.autoHandUnknown,1);
 assert.equal(r.automaticHandKnown,2);
 assert.equal(r.automaticHandUnknown,3);
});
test('R4: manual GT row not in original is a hard refusal',()=>{
 const a=sample();a.manual[1]={...a.manual[1],key_offset:'88'};
 assert.throws(()=>comparePseudoHandLabels(a.source,a.pseudo,a.manual),
  /R4_MANUAL_GT_MISSING_IN_ORIGINAL/);
});
test('R4: automatic source rows must be EXACT ordered MIDI events, not shuffled',()=>{
 const a=sample();[a.pseudo[0],a.pseudo[1]]=[a.pseudo[1],a.pseudo[0]];
 assert.throws(()=>comparePseudoHandLabels(a.source,a.pseudo,a.manual),
  /R4_PSEUDOLABEL_MIDI_ROW_IDENTITY_MISMATCH/);
});
test('R4: mismatched auto rows, incorrect count or untrusted marker always fails closed',()=>{
 const a=sample();a.pseudo.pop();
 assert.throws(()=>comparePseudoHandLabels(a.source,a.pseudo,a.manual),
  /R4_INCOMPLETE_SOURCE_PSEUDOLABEL_FILE/);
 const b=sample();b.pseudo[0].hand='Noinfo';b.pseudo[0].finger='1';
 assert.throws(()=>comparePseudoHandLabels(b.source,b.pseudo,b.manual),
  /R4_UNTRUSTED_PSEUDOLABEL_CODING/);
 const d=sample();d.pseudo[0].hand='X';
 assert.throws(()=>comparePseudoHandLabels(d.source,d.pseudo,d.manual),
  /R4_UNTRUSTED_PSEUDOLABEL_CODING/);
});
test('R4: duplicate indistinguishable original events get quarantined, not assigned by arbitrary row ordering',()=>{
 const a=sample();const source=[...a.source,a.source[0]];
 const pseudo=[...a.pseudo,{...a.pseudo[0],hand:'L'}];
 const r=comparePseudoHandLabels(source,pseudo,a.manual);
 assert.equal(r.duplicateSourceGTQuarantined,1);
 assert.equal(r.uniqueManualEvents,2);
 assert.equal(r.autoHandProposed,1);
 assert.equal(r.handCorrect,0);
 assert.equal(r.handIncorrect,1);
 assert.equal(r.sourceNotes,6);
});
test('R4: repeated manual GT events refuse rather than inflate agreement',()=>{
 const a=sample();
 assert.throws(()=>comparePseudoHandLabels(a.source,a.pseudo,[...a.manual,a.manual[0]]),
  /R4_DUPLICATE_MANUAL_GT_SOURCE_EVENT/);
});
test('R4: hand and finger score errors remain distinct',()=>{
 const a=sample();a.pseudo[0].finger='5';
 const r=comparePseudoHandLabels(a.source,a.pseudo,a.manual);
 assert.equal(r.handCorrect,1);
 assert.equal(r.fullHandFingerCorrect,0);
 assert.equal(r.fullHandFingerIncorrect,2);
});
test('R4: aggregate 11 recordings scores overall coverage and zero denominators honestly',()=>{
 const a=sample(),m=comparePseudoHandLabels(a.source,a.pseudo,a.manual);
 const s=summarizePseudoHandEvidence(Array.from({length:11},()=>structuredClone(m)));
 assert.equal(s.sourceNotes,55);
 assert.equal(s.manualGTNotes,33);
 assert.equal(s.autoHandProposed,22);
 assert.equal(s.handCorrect,11);
 assert.equal(s.handIncorrect,11);
 assert.equal(s.handCoverageOnManualSubsetPct,66.67);
 assert.equal(s.handAgreementAmongProposedPct,50);
 assert.equal(s.handErrorAmongProposedPct,50);
 assert.equal(s.automaticHandCoverageAllSourcePct,60);
 assert.equal(s.correctHandAmongAllManualPct,33.33);
 assert.throws(()=>summarizePseudoHandEvidence([m]),/R4_INCOMPLETE_GT_HOLDOUT/);
});
const CORE=['onset','key_offset','frame_offset','note','velocity'];
const ORIGINAL=[raw(0,60,0),raw(1,64,.4),raw(2,67,.8)];
const HEAD=(annotation)=>'# '+[...CORE,...(annotation?['hand','finger']:[])].join('\t')+'\n';
const rows=(data,annotation)=>HEAD(annotation)+data.map(x=>[
 ...CORE.map(k=>x[k]),...(annotation?[x.hand,x.finger]:[])
].join('\t')).join('\n')+'\n';
const src=rows(ORIGINAL,false);
const auto=rows([labeled(ORIGINAL[0],'R','1'),labeled(ORIGINAL[1],'L','2'),
 labeled(ORIGINAL[2],'Noinfo','Noinfo')],true);
const gt=rows([labeled(ORIGINAL[0],'R','1'),labeled(ORIGINAL[2],'R','5')],true);
const mock=async url=>({ok:true,text:async()=>
 url.includes('/Fingering_GT/')?gt:url.includes('/Fingering/')?auto:src
});
test('R4: full 11 pinned-source network driver works with bounded synthetic response and hides small annotation cells',async()=>{
 const r=await auditPianoVAMAutoHandPseudoLabels({
  fetcher:mock,expectedSourceNotes:33,expectedHumanGTNotes:22
 });
 assert.equal(r.totals.sourceNotes,33);
 assert.equal(r.totals.manualGTNotes,22);
 assert.equal(r.totals.autoHandProposed,11);
 assert.equal(r.totals.autoHandUnknown,11);
 assert.equal(r.totals.handCorrect,11);
 assert.equal(r.recordings.length,EXPECTED_NAMES.length);
 assert.equal(r.newIndependentRealPerformerHoldout,false);
 assert.equal(r.pseudoLabelsAreTeacherApproved,false);
 assert.equal(r.productionEligible,false);
 const report=JSON.stringify(r);
 assert.ok(!report.includes('"pitch":'));
 assert.ok(!report.includes('"hand":'));
 assert.ok(!report.includes('"finger":'));
 assert.ok(r.recordings.every(x=>!Object.hasOwn(x,'handCorrect')&&
  !Object.hasOwn(x,'handIncorrect')));
});
test('R4: driver rejects incomplete source/GT and reversed source-Fingering files',async()=>{
 await assert.rejects(auditPianoVAMAutoHandPseudoLabels({fetcher:mock}),
  /R4_PINNED_SOURCE_POPULATION_CHANGED/);
 const corrupt=async url=>({ok:true,text:async()=>{
  if(url.includes('/Fingering_GT/'))return gt;
  if(url.includes('/Fingering/'))return auto.replace('\t60\t80\tR\t1','\t61\t80\tR\t1');
  return src;
 }});
 await assert.rejects(auditPianoVAMAutoHandPseudoLabels({
  fetcher:corrupt,expectedSourceNotes:33,expectedHumanGTNotes:22
 }),/R4_PSEUDOLABEL_MIDI_ROW_IDENTITY_MISMATCH/);
});
