import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeMonophonicFingering} from '../src/core/fingering-dp.mjs';
import {proposePolyphonicFingering} from '../src/core/fingering-polyphonic.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const references=JSON.parse(fs.readFileSync(path.join(root,'research/fg02c-reference-cases.json'),'utf8'));
export function benchmarkReference(example,{useAnchors=false}={}){
 const isChord=example.engine==='poly';
 const notes=example.pitches.map((pitch,i)=>({pitch,start:isChord?0:i*.50,
  duration:isChord?.42:.43,...(useAnchors?{finger:example.expected[i]}:{})}));
 const input=notes.map(n=>({...n})),options={hand:example.hand,handSize:'M'};
 const output=isChord?proposePolyphonicFingering(notes,options):proposeMonophonicFingering(notes,options);
 if(!output.ok)return {id:example.id,category:example.category,hand:example.hand,
  status:'REJECTED',reason:output.reason,expected:example.expected,actual:null,
  correct:0,total:notes.length,audit:null};
 const audit=auditFingeringAssignments(input,output.items,options);
 const actual=output.items.map(n=>n.finger),correct=actual.reduce((sum,f,i)=>sum+(f===example.expected[i]?1:0),0);
 return {id:example.id,category:example.category,hand:example.hand,
  status:!audit.valid?'PHYSICAL_CONFLICT':correct===example.expected.length?'EXACT':'DIFFERENT_VALID_CANDIDATE',
  expected:example.expected,actual,correct,total:notes.length,audit:audit.valid?'PASS':audit.violations};
}
export function runBenchmark({useAnchors=false}={}){
 const cases=references.cases.map(c=>benchmarkReference(c,{useAnchors}));
 const count=(status)=>cases.filter(x=>x.status===status).length;
 const correct=cases.reduce((n,c)=>n+c.correct,0),total=cases.reduce((n,c)=>n+c.total,0);
 return {schema:'fg02c-benchmark-result-v1',mode:useAnchors?'authored-anchors':'unannotated-proposals',
  referenceVersion:references.schema,measuredAt:'CI-run',totals:{
   cases:cases.length,exactCases:count('EXACT'),differentCandidates:count('DIFFERENT_VALID_CANDIDATE'),
   rejected:count('REJECTED'),physicalConflicts:count('PHYSICAL_CONFLICT'),
   matchedNotes:correct,referenceNotes:total,matchPercent:+(100*correct/total).toFixed(2)},cases};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const result=runBenchmark(),anchored=runBenchmark({useAnchors:true});
 const fmt=c=>[c.status.padEnd(27),c.id.padEnd(35),
   (' '+c.correct+'/'+c.total).padStart(6),c.reason??''].join(' ');
 console.log('FG-02C PUBLICLY SOURCED REFERENCE COMPARISON — unannotated');
 for(const c of result.cases)console.log(fmt(c));
 console.log(JSON.stringify(result.totals));
 console.log('FG-02C AUTHOR ANCHOR COMPATIBILITY');
 console.log(JSON.stringify(anchored.totals));
 const target=process.env.FG02C_REPORT;
 if(target)fs.writeFileSync(target,JSON.stringify({unannotated:result,anchored},null,2)+'\n');
}
