/**
 * P0-A2: REAL FG-02I + REAL original Python/PianoMotion, same PIG note events.
 *
 * Never supply PIG reference finger labels to either engine. Hands are known
 * by SOURCE annotation and explicit MIDI track names, not inferred by pitch.
 * The input PIG is downloaded only from the pre-existing pinned SHA-256
 * manifest. MIDI is temporary, finger-free, 60BPM and 9600 PPQ; output is
 * aggregate-only, not a copied/copyrighted corpus or a fingering vector.
 *
 * Usage:
 *   python -m pip install pretty_midi==0.2.11.post0 mido==1.3.3 numpy
 *   node scripts/p0a2-real-fingering-benchmark.mjs --case bach-minuet-g-major
 *   node scripts/p0a2-real-fingering-benchmark.mjs --all --repeat=2
 * Optional: PYTHON=/path/to/python; --output /private/path/aggregate.json
 */
import {mkdtemp,writeFile,readFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {loadRepertoireSource,corpus} from './fingering-repertoire-benchmark.mjs';
import {runPianoMotionLocally} from './fg04c2-run-pianomotion.mjs';
import {runExistingPlayAlongFingeringResearch} from '../src/core/fingering-engine-comparison.mjs';
import {makeP0A2Cohort} from '../src/core/p0a2-fingering-cohort.mjs';
import {importP0A2PianoMotion,evaluateP0A2Case,summarizeP0A2}
 from '../src/core/p0a2-fingering-evaluation.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const core=join(root,'src/pianomotion-python/python-core');
const finite=n=>Number.isFinite(n)&&n>=0;
const fail=reason=>({ok:false,reason,researchOnly:true,productionEligible:false});
const manifestHash=createHash('sha256').update(JSON.stringify({
 revision:corpus.revision,cases:corpus.cases.map(c=>({id:c.id,sha256:c.sha256}))
})).digest('hex');
const summary=(c,engine)=>({...c,...{elapsedMs:engine.elapsedMs,repeatStable:engine.repeatStable}});
const allowedSourceKeys=src=>src.map(n=>({noteId:n.noteId,pitch:n.pitch,
 start:n.start,duration:n.duration,hand:n.hand}));
async function singleCase(entry,{python=process.env.PYTHON||'python',repeat=2}={}){
 const start=performance.now();
 const pinned=await loadRepertoireSource(entry);
 const cohort=makeP0A2Cohort(pinned.parsed);
 if(!cohort.ok)return fail('COHORT_'+cohort.reason);
 const original=cohort.midiBytes;
 const sha=createHash('sha256').update(original).digest('hex');
 // The same *fingerless* immutable events are passed to FG-02I, and the
 // exact MIDI bytes are passed to the original Python program twice.
 const input=allowedSourceKeys(cohort.source);
 const before=JSON.stringify(input);
 const ts=performance.now();
 const baseline=runExistingPlayAlongFingeringResearch(input,{handSize:'M',beamWidth:40});
 const baselineElapsed=performance.now()-ts;
 const base=baseline.ok?evaluateP0A2Case({source:input,reference:cohort.reference,
  items:baseline.items}):
  evaluateP0A2Case({source:input,reference:cohort.reference,
  engineStatus:baseline.reason||'PLAY_ALONG_DECLINED'});
 if(!base.ok)return fail('PLAY_ALONG_EVALUATION_'+base.reason);
 let pm=null,pmElapsed=0,repeatStable=null,pmReason=null,previous=null;
 const tmp=await mkdtemp(join(tmpdir(),'p0a2-pm-'));
 try{
  const midi=join(tmp,'source.mid');
  await writeFile(midi,original,{mode:0o600,flag:'wx'});
  for(let attempt=0;attempt<repeat;attempt++){
   const output=join(tmp,'analysis-'+attempt+'.json');
   const t=performance.now();
   const executed=runPianoMotionLocally([core,midi,output],{python});
   pmElapsed+=performance.now()-t;
   if(!executed.ok){pmReason='PYTHON_'+executed.reason;break;}
   let envelope;
   try{envelope=JSON.parse(await readFile(output,'utf8'))}
   catch{pmReason='PIANOMOTION_RESULT_JSON_UNREADABLE';break}
   const imported=importP0A2PianoMotion({cohort,midiBytes:original,analysis:envelope});
   if(!imported.ok){pmReason='SOURCE_ID_'+imported.reason;break}
   const current=JSON.stringify(imported.items);
   if(previous!==null&&current!==previous){pmReason='PIANOMOTION_NONDETERMINISTIC';break}
   previous=current;pm=imported.items;
  }
  repeatStable=pm!==null&&repeat>=2;
 }finally{await rm(tmp,{recursive:true,force:true})}
 if(JSON.stringify(input)!==before)return fail('SOURCE_MUTATED_DURING_EVALUATION');
 const result=pmReason||pm===null?
  evaluateP0A2Case({source:input,reference:cohort.reference,
   engineStatus:pmReason||'PIANOMOTION_NOT_RUN'}):
  evaluateP0A2Case({source:input,reference:cohort.reference,items:pm});
 if(!result.ok)return fail('PIANOMOTION_EVALUATION_'+result.reason);
 return {ok:true,id:entry.id,sourceSha256:pinned.sha256,midiSha256:sha,
  sourceNotes:cohort.noteCount,knownHandsFromSource:true,referenceFingersWithheld:true,
  midiDerivation:'60bpm-9600ppq-quantized',
  pianoMotion:summary(result,{elapsedMs:Math.round(pmElapsed),repeatStable}),
  playAlong:summary(base,{elapsedMs:Math.round(baselineElapsed),repeatStable:null}),
  elapsedMs:Math.round(performance.now()-start),
  researchOnly:true,expertValidated:false,productionEligible:false};
}
export async function runP0A2RealBenchmark({caseIds=null,python=process.env.PYTHON||'python',repeat=2}={}){
 if(!Number.isInteger(repeat)||repeat<1||repeat>3)return fail('INVALID_REPEAT_COUNT');
 const valid=new Set(corpus.cases.map(c=>c.id));
 if(caseIds!==null&&(!Array.isArray(caseIds)||!caseIds.length||
    caseIds.some(id=>!valid.has(id))||new Set(caseIds).size!==caseIds.length))
  return fail('UNKNOWN_OR_DUPLICATE_CASE');
 const selected=corpus.cases.filter(c=>caseIds===null||caseIds.includes(c.id));
 const cases=[];
 for(const entry of selected){
  try{
   const r=await singleCase(entry,{python,repeat});
   if(!r.ok)return fail('CASE_'+entry.id+'_'+r.reason);
   cases.push(r);
  }catch(err){
   const msg=String(err?.message||err);
   const safe=/^(SOURCE_UNAVAILABLE|SOURCE_MANIFEST_INVALID|SOURCE_SHA256_MISMATCH|SOURCE_NOTE_COUNT_CHANGED)/.test(msg);
   return fail('PINNED_CORPUS_'+entry.id+'_'+(safe?msg.split(':')[0]:'FETCH_OR_COMPUTE_FAILED'));
  }
 }
 const totals=summarizeP0A2(cases);
 if(!totals.ok)return totals;
 return {ok:true,schema:'p0a2-real-independent-python-finger-benchmark-v1',
  manifestSha256:manifestHash,corpusRevision:corpus.revision,
  corpusLicense:corpus.license,
  attribution:corpus.attribution,referenceStatus:'contributor-hand-authored-not-independent-expert-consensus',
  methodology:'Real original Python/PianoMotion vs actual FG-02I on identical finger-free derived MIDI/hand-labelled source; PIG fingers withheld until scoring; strict source event ordinals plus SHA-256.',
  repeat,totals,cases,
  gate:{pythonActuallyExecuted:cases.some(c=>c.pianoMotion.status==='evaluated'),
   allCasesSourceMatched:cases.every(c=>c.pianoMotion.status==='evaluated'),
   independentExpertConsensus:false,verifiedAccuracyGain:false,
   autoTeachingPromotionAllowed:false},
  researchOnly:true,productionEligible:false,expertValidated:false};
}
const direct=process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
if(direct){
 const args=process.argv.slice(2),cases=[],allowed=new Set(['--all','--help']);
 let repeat=2,output=null,badArgs=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--case'){if(!args[i+1])badArgs=true;else cases.push(args[++i]);}
  else if(args[i]==='--all'){}
  else if(args[i]==='--repeat'){repeat=Number(args[++i]);}
  else if(args[i]==='--output'){output=args[++i];if(!output)badArgs=true;}
  else if(args[i]==='--help'){
   process.stdout.write('Usage: node scripts/p0a2-real-fingering-benchmark.mjs [--all | --case CASE_ID] [--repeat 1|2|3] [--output private-aggregate.json]\n');
   process.exit(0);
  }else badArgs=true;
 }
 if(badArgs||(args.includes('--all')&&cases.length)){
  process.stderr.write('P0_A2_INVALID_ARGUMENTS\n');process.exitCode=2;
 }else{
  const report=await runP0A2RealBenchmark({caseIds:cases.length?cases:null,repeat});
  if(output&&report.ok){
   try{
    const file=await open(resolve(output),'wx',0o600);
    try{await file.writeFile(JSON.stringify(report,null,2)+'\n')}
    finally{await file.close()}
   }catch{process.stderr.write('P0_A2_OUTPUT_FILE_EXISTS_OR_UNWRITABLE\n');process.exitCode=2;}
  }else process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.ok||report.gate&&!report.gate.pythonActuallyExecuted)process.exitCode=1;
 }
}
