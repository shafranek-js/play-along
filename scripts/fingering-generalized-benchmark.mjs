import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {heldout,runHeldoutBenchmark} from './fingering-heldout-benchmark.mjs';
import {references,runBenchmark} from './fingering-benchmark.mjs';
import {proposeGeneralizedMonophonicFingering} from '../src/core/fingering-generalized.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

// IMPORTANT: FG-02E's scores were inspected before FG-02F design.
// This is a post-exposure diagnostic comparison, NOT a fresh blind holdout.
// Frozen FG-02E fixtures, baseline report and FG-02A/D algorithms are unchanged.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const same=(x,y)=>x&&x.length===y.length&&x.every((v,i)=>v===y[i]);
export function generalCase(c,{anchors=false}={}){
 const notes=c.pitches.map((pitch,i)=>({pitch,start:i*.5,duration:.43,
  hand:c.hand,noteId:c.id+':'+i,...(anchors?{finger:c.expected[i]}:{})}));
 const r=proposeGeneralizedMonophonicFingering(notes,{hand:c.hand,handSize:'M'});
 if(!r.ok)return {id:c.id,status:'REJECTED',reason:r.reason,actual:null,matched:0,
  total:c.expected.length,strategy:'rejected',valid:false,anchorPreserved:false};
 const actual=r.items.map(n=>n.finger),
  audit=auditFingeringAssignments(notes,r.items,{handSize:'M'});
 const choices=[c.expected,...(c.alternativeExpected?[c.alternativeExpected]:[])];
 const valid=audit.valid,accepted=choices.some(x=>same(actual,x));
 return {
  id:c.id,key:c.key??null,hand:c.hand,category:c.category??'scale',
  agreement:c.referenceAgreement??'development-reference',
  status:!valid?'PHYSICAL_CONFLICT':accepted?'EXACT_PUBLISHED':'DIFFERENT',
  strategy:r.strategy,phraseKind:r.phraseKind??null,
  actual,expected:c.expected,alternatives:c.alternativeExpected?[c.alternativeExpected]:[],
  matched:actual.reduce((n,x,i)=>n+(x===c.expected[i]),0),
  total:c.expected.length,valid,anchorPreserved:notes.every((n,i)=>n.finger==null||n.finger===actual[i]),
  issues:audit.violations
 };
}
const totals=items=>({
 cases:items.length,notes:items.reduce((n,x)=>n+x.total,0),
 exact:items.filter(x=>x.status==='EXACT_PUBLISHED').length,
 matched:items.reduce((n,x)=>n+x.matched,0),
 consensusCases:items.filter(x=>x.agreement==='both-sources').length,
 exactConsensus:items.filter(x=>x.agreement==='both-sources'&&x.status==='EXACT_PUBLISHED').length,
 generalized:items.filter(x=>x.strategy==='generalized-melodic-hypothesis').length,
 rejected:items.filter(x=>x.status==='REJECTED').length,
 physicalConflicts:items.filter(x=>x.status==='PHYSICAL_CONFLICT').length,
 anchorViolations:items.filter(x=>!x.anchorPreserved).length
});
export function runFG02FDiagnostic(){
 const fg02e=runHeldoutBenchmark(),fg02c=runBenchmark();
 const unknown=heldout.cases.map(c=>generalCase(c));
 const pinned=heldout.cases.map(c=>generalCase(c,{anchors:true}));
 const developed=references.cases.filter(c=>c.engine==='mono').map(c=>generalCase(c));
 const r={
  schema:'fg02f-after-exposure-diagnostic-v1',
  evidenceStatus:'POST-EXPOSURE; NOT A NEW INDEPENDENT HOLDOUT',
  previous:{fg02e:fg02e.stats,fg02c:fg02c.totals},
  candidate:{heldout:totals(unknown),pinned:totals(pinned),fg02cMelodies:totals(developed)},
  gate:{qualifiedForLearnerGuidance:false,
   independentExpertReview:false,independentUnseenMusicalCorpus:false},
  cases:{fg02e:unknown,authorPinned:pinned,development:developed}
 };
 return r;
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const r=runFG02FDiagnostic();
 console.log('FG-02F REPORT: POST-EXPOSURE DIAGNOSTIC, not independently validated');
 console.log('FG-02E frozen baseline:',JSON.stringify(r.previous.fg02e.baseline));
 console.log('FG-02D phrase on frozen data:',JSON.stringify(r.previous.fg02e.phrase));
 console.log('FG-02F generalized on frozen data:',JSON.stringify(r.candidate.heldout));
 console.log('FG-02F pinned author input:',JSON.stringify(r.candidate.pinned));
 console.log('FG-02F on historical development melody cases:',JSON.stringify(r.candidate.fg02cMelodies));
 for(const c of r.cases.fg02e){
  console.log(c.id,c.status,c.strategy,c.matched+'/'+c.total);
  if(c.status!=='EXACT_PUBLISHED'){
   console.log('  reference: '+c.expected.join('-'));
   console.log('  candidate: '+(c.actual?.join('-')??c.status));
  }
 }
 console.log('FG-02F GATE: ',JSON.stringify(r.gate));
 if(process.env.FG02F_REPORT){
  const dest=path.resolve(process.env.FG02F_REPORT);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(r,null,2)+'\n');
 }
}
