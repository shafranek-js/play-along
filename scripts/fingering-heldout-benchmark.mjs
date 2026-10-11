/**
 * FG-02E – frozen held-out, two-provider reference comparison.
 * NEVER tune an engine in response to these results inside this PR.
 * Records original and phrase-based algorithms separately and reproducibly.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeMonophonicFingering} from '../src/core/fingering-dp.mjs';
import {proposePhraseAwareMonophonicFingering} from '../src/core/fingering-phrases.mjs';
import {auditFingeringAssignments} from '../src/core/fingering-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const heldout=JSON.parse(fs.readFileSync(path.join(root,'research/fg02e-heldout-fingerings.json'),'utf8'));
const refChoices=c=>[c.expected,...(c.alternativeExpected?[c.alternativeExpected]:[])];
const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>v===b[i]);
const count=(got,want)=>!got?0:got.reduce((n,x,i)=>n+(x===want[i]),0);
const notesFor=(c,useAnchors=false)=>c.pitches.map((pitch,i)=>({
  pitch,start:i*.5,duration:.43,hand:c.hand,noteId:c.id+':'+i,
  ...(useAnchors?{finger:c.expected[i]}:{})
}));

export function heldoutCase(c,{engine='phrase',useAnchors=false}={}){
 const input=notesFor(c,useAnchors);
 const fn=engine==='baseline'?proposeMonophonicFingering:proposePhraseAwareMonophonicFingering;
 const r=fn(input,{hand:c.hand,handSize:'M'});
 const actual=r.ok?r.items.map(n=>n.finger):null;
 const audit=r.ok?auditFingeringAssignments(input,r.items,{handSize:'M'}):null;
 const exactSource=r.ok&&same(actual,c.expected);
 const exactAccepted=r.ok&&refChoices(c).some(x=>same(actual,x));
 return {
  id:c.id,key:c.key,hand:c.hand,span:c.span,direction:c.direction,agreement:c.referenceAgreement,
  engine,source:c.source,secondarySource:heldout.secondarySource,
  status:!r.ok?'REJECTED':!audit.valid?'PHYSICAL_CONFLICT':exactAccepted?'EXACT_PUBLISHED':'DIFFERENT',
  ...(!r.ok?{reason:r.reason}:{}),
  expected:c.expected,alternatives:c.alternativeExpected?[c.alternativeExpected]:[],
  actual,matchedPrimary:count(actual,c.expected),
  matchedBestPublished:Math.max(...refChoices(c).map(x=>count(actual,x))),
  exactPrimary:!!exactSource,exactPublished:!!exactAccepted,
  valid:r.ok&&audit.valid,anchorPreserved:r.ok&&input.every((n,i)=>n.finger==null||actual[i]===n.finger),
  strategy:r.strategy??'baseline',audit:audit?.violations??null,
  noteCount:c.pitches.length
 };
}
const sum=items=>{
 const agrees=items.filter(x=>x.agreement==='both-sources');
 const variants=items.filter(x=>x.agreement==='published-variant');
 return {
  cases:items.length,notes:items.reduce((n,c)=>n+c.noteCount,0),
  agreedCases:agrees.length,publishedVariantCases:variants.length,
  eligibleExactAgreed:agrees.filter(x=>x.exactPublished).length,
  eligibleNotesAgreed:agrees.reduce((n,x)=>n+x.noteCount,0),
  matchedNotesAgreed:agrees.reduce((n,x)=>n+x.matchedPrimary,0),
  exactAnyPublished:items.filter(x=>x.exactPublished).length,
  exactPrimary:items.filter(x=>x.exactPrimary).length,
  matchedPrimary:items.reduce((n,x)=>n+x.matchedPrimary,0),
  matchedBestPublished:items.reduce((n,x)=>n+x.matchedBestPublished,0),
  rejected:items.filter(x=>x.status==='REJECTED').length,
  physicalConflicts:items.filter(x=>x.status==='PHYSICAL_CONFLICT').length,
  authorAnchorViolations:items.filter(x=>x.actual&&!x.anchorPreserved).length,
  phraseCandidates:items.filter(x=>x.strategy==='reference-phrase-candidate').length,
  supportedBaseline:items.filter(x=>x.status!=='REJECTED').length,
 };
};
export function runHeldoutBenchmark(){
 const baseline=heldout.cases.map(c=>heldoutCase(c,{engine:'baseline'}));
 const phrase=heldout.cases.map(c=>heldoutCase(c,{engine:'phrase'}));
 const pinned=heldout.cases.map(c=>heldoutCase(c,{engine:'phrase',useAnchors:true}));
 const stats={baseline:sum(baseline),phrase:sum(phrase),pinned:sum(pinned)};
 // The publication threshold is a decision rule, not a statistical confidence
 // estimate. The benchmark uses public scale drills only, no real repertoire.
 const researchGate={
  minimumAgreedCaseAccuracy:.90,
  noPhysicalConflict:stats.phrase.physicalConflicts===0,
  noSourceOverride:stats.pinned.authorAnchorViolations===0,
  noRejectedPinnedCases:stats.pinned.rejected===0,
  agreedExactRate:stats.phrase.eligibleExactAgreed/Math.max(1,stats.phrase.agreedCases),
  musicalEvidenceSufficient:false, // No independent pianist/jury or full repertoire.
  productionAutoFingeringAllowed:false
 };
 researchGate.developmentThresholdMet=researchGate.agreedExactRate>=researchGate.minimumAgreedCaseAccuracy
   &&researchGate.noPhysicalConflict&&researchGate.noSourceOverride&&researchGate.noRejectedPinnedCases;
 return {schema:'fg02e-heldout-audit-v1',frozenCommit:heldout.frozenAgainst,
  sources:[...new Set(heldout.cases.map(c=>c.source)),heldout.secondarySource],
  caveat:'Not a blinded, expert-reviewed repertoire study. The source family piano.org overlaps FG-02C but all note sequences are new to FG-02D templates; publisher disagreements are tracked.',
  stats,researchGate,baseline,phrase,pinned};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const r=runHeldoutBenchmark();
 console.log('FG-02E FROZEN HELD-OUT DATASET',JSON.stringify(heldout.summary));
 console.log('FG-02E BASELINE',JSON.stringify(r.stats.baseline));
 console.log('FG-02E PHRASE',JSON.stringify(r.stats.phrase));
 console.log('FG-02E AUTHOR ANCHORS',JSON.stringify(r.stats.pinned));
 console.log('FG-02E QUALITY GATE',JSON.stringify(r.researchGate));
 for(let i=0;i<r.phrase.length;i++){
  const c=r.phrase[i],b=r.baseline[i];
  console.log(c.id,'sourceAgreement='+c.agreement,'baseline='+b.status,
    'phrase='+c.status,'strategy='+c.strategy,
    'matched='+c.matchedBestPublished+'/'+c.noteCount,
    c.reason??'');
  if(!c.exactPublished){
   console.log('  published: '+c.expected.join('-'));
   for(const alt of c.alternatives)console.log('  variant:   '+alt.join('-'));
   console.log('  proposed:  '+(c.actual?.join('-')??'NO ASSIGNMENT'));
  }
 }
 if(process.env.FG02E_REPORT){
  fs.writeFileSync(process.env.FG02E_REPORT,JSON.stringify(r,null,2)+'\n');
 }
 console.log('FG-02E RELEASE DECISION: RESEARCH_ONLY; AUTO-FINGERING NOT ENABLED.');
}
