/**
 * P0-A2b Phase 3 reproducible real piano pre-registration.
 * --verify-sources actually downloads eight hash/size-verified original
 * MusicXML/MIDI pairs transiently. NO source bytes or fingers are published.
 * Byte verification is NOT score-to-MIDI semantic note identity.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {auditP0A2bPhase3Screening} from '../src/core/p0a2b-phase3-cohort.mjs';
import {inspectAsapPair} from './fingering-asap-real-score-audit.mjs';

const read=relative=>JSON.parse(readFileSync(new URL(relative,import.meta.url),'utf8'));
const fail=reason=>({ok:false,reason,expertValidated:false,productionEligible:false});

export async function runP0A2bPhase3Screening({verifySources=false,
 fetcher=globalThis.fetch}={}){
 const plan=read('../research/p0a2b-phase3-screening-plan.json');
 const upstream=read('../research/fg04b1b-asap-score-manifest.json');
 const audit=auditP0A2bPhase3Screening(plan,upstream);
 if(!audit.ok||!verifySources)return audit;
 const entryById=new Map(upstream.cases.map(x=>[x.id,x]));
 let index=0;const outcomes=new Array(plan.selections.length);
 try{
  await Promise.all(Array.from({length:2},async()=>{
   while(index<outcomes.length){
    const i=index++;
    outcomes[i]=await inspectAsapPair(upstream,
     entryById.get(plan.selections[i].caseId),{fetcher});
   }
  }));
 }catch{return fail('REAL_SOURCE_FETCH_SIZE_HASH_OR_FORMAT_FAILED')}
 if(outcomes.some(x=>!x||!x.xml?.sha256||!x.midi?.sha256))
  return fail('REAL_SOURCE_VERIFICATION_INCOMPLETE');
 return {...audit,sourceVerification:{
   status:'PINNED_SOURCE_BYTES_VERIFIED_NOT_SEMANTIC_ALIGNMENT',
   actualMusicXmlPairsDownloadedAndHashVerified:outcomes.length,
   actualMidiPairsDownloadedAndHashVerified:outcomes.length,
   midiParserReady:outcomes.filter(x=>x.midi.readiness==='READABLE').length,
   midiParserNeedsReview:outcomes.filter(x=>x.midi.readiness!=='READABLE').length,
   xmlMidiSemanticAlignmentVerified:false,
   actualPianistLabelsVerified:0,
   sourceBytesPersisted:false
 }};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 const result=args.length===0||args.length===1&&args[0]==='--verify-sources'?
  await runP0A2bPhase3Screening({verifySources:args.includes('--verify-sources')}):
  fail('INVALID_ARGUMENTS');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.ok)process.exitCode=1;
}
