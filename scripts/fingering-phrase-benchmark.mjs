import {references,benchmarkReference,runBenchmark} from './fingering-benchmark.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';
import {proposePhraseAwareMonophonicFingering,proposePhraseAwareChordFingering} from '../src/core/fingering-phrases.mjs';

export function phraseReferenceCase(example,{useAnchors=false}={}){
 const isChord=example.engine==='poly';
 const input=example.pitches.map((pitch,i)=>({
  pitch,start:isChord?0:i*.5,duration:isChord?.42:.43,
  ...(useAnchors?{finger:example.expected[i]}:{})
 }));
 const engine=isChord?proposePhraseAwareChordFingering:proposePhraseAwareMonophonicFingering;
 const r=engine(input,{hand:example.hand,handSize:'M'});
 if(!r.ok)return {id:example.id,status:'REJECTED',reason:r.reason,correct:0,
  total:input.length,expected:example.expected,actual:null};
 const audit=auditFingeringAssignments(input,r.items,{handSize:'M'});
 const actual=r.items.map(n=>n.finger);
 const correct=actual.filter((f,i)=>f===example.expected[i]).length;
 return {
  id:example.id,status:!audit.valid?'PHYSICAL_CONFLICT':correct===input.length?'EXACT':'DIFFERENT_VALID_CANDIDATE',
  correct,total:input.length,expected:example.expected,actual,
  strategy:r.strategy,phraseKind:r.phraseKind??null,
  audit:audit.valid?'PASS':audit.violations
 };
}
const summarize=(cases)=>({
 cases:cases.length,exact:cases.filter(c=>c.status==='EXACT').length,
 matched:cases.reduce((sum,c)=>sum+c.correct,0),
 total:cases.reduce((sum,c)=>sum+c.total,0),
 physicalConflicts:cases.filter(c=>c.status==='PHYSICAL_CONFLICT').length,
 rejected:cases.filter(c=>c.status==='REJECTED').length,
 phraseCandidates:cases.filter(c=>c.strategy==='reference-phrase-candidate').length
});
export function phraseReferenceBenchmark({useAnchors=false}={}){
 const baseline=runBenchmark({useAnchors});
 const proposed=references.cases.map(c=>phraseReferenceCase(c,{useAnchors}));
 return {schema:'fg02d-phrase-benchmark-v1',label:'DEVELOPMENT-REFERENCE: not a blind expert validation',
  baseline:{...baseline.totals},proposed:summarize(proposed),cases:proposed};
}
const direct=process.argv[1]?.endsWith('/fingering-phrase-benchmark.mjs');
if(direct){
 const result=phraseReferenceBenchmark();
 console.log('FG-02D DEV REFERENCE — baseline',JSON.stringify(result.baseline));
 console.log('FG-02D PHRASE CANDIDATES',JSON.stringify(result.proposed));
 for(const e of result.cases)console.log(e.id,e.status,e.strategy||'fallback',
  'expected',e.expected.join('-'),'proposed',e.actual?.join('-')||e.reason);
 const pinned=phraseReferenceBenchmark({useAnchors:true});
 console.log('FG-02D PINNED AUTHOR REFERENCE',JSON.stringify(pinned.proposed));
 console.log('RELEASE GATE: NOT APPROVED FOR LEARNER GUIDANCE; reference overlap with developed templates');
 if(process.env.FG02D_REPORT){
  const fs=await import('node:fs');
  fs.writeFileSync(process.env.FG02D_REPORT,JSON.stringify({unannotated:result,anchored:pinned},null,2)+'\n');
 }
}
