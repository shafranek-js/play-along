/**
 * FG-04B4-R3 independently authored synthetic search-falsification runner.
 * These are NOT externally pianist-labelled motions or real recordings.
 * Both the scenario set and the original FG-04B4 solver must remain pinned;
 * silently editing/rebalancing either invalidates this pre-release result.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {evaluateIndependentHandStructuralChallenges}
 from '../src/core/hand-separation-structural-challenges.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const FIXTURE='research/fg04b4-r3-independent-structural-challenges.json';
const SOLVER='src/core/fingering-hand-separation.mjs';
export const FROZEN_SOLVER_BLOB='e563972a92dc319fc15c412ec5d202b679bb728f';
export const FROZEN_FIXTURE_BLOB='3487f76fbd8f3a34a8164a76d54316826fedfd01';
const blobSha=buf=>createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
export function originalSyntheticManifest(){
 for(const [file,pin] of [[SOLVER,FROZEN_SOLVER_BLOB],[FIXTURE,FROZEN_FIXTURE_BLOB]]){
  const bytes=fs.readFileSync(path.join(root,file));
  if(blobSha(bytes)!==pin)throw Error('UNPINNED_SYNTHETIC_OR_SOLVER_SOURCE:'+file);
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(root,FIXTURE),'utf8'));
 if(manifest.externalSourceGTAllowed!==false||manifest.cases.length!==15)
  throw Error('UNTRUSTED_SYNTHETIC_SOURCE');
 return manifest;
}
export function runIndependentSyntheticFalsification(){
 const m=originalSyntheticManifest();
 const result=evaluateIndependentHandStructuralChallenges(m);
 if(result.totals.cases!==15||result.totals.proposed+result.totals.abstained!==result.totals.heldout||
    result.totals.incorrect+result.totals.correct!==result.totals.proposed||
    result.productionEligible!==false||result.professionalPianistValidated!==false)
  throw Error('SYNTHETIC_INTEGRITY_FAILED');
 return {...result,sourceGitBlobs:{solver:FROZEN_SOLVER_BLOB,
  authoredFixture:FROZEN_FIXTURE_BLOB}};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  const result=runIndependentSyntheticFalsification();
  if(process.env.FG04B4_R3_REPORT){
   const file=path.resolve(process.env.FG04B4_R3_REPORT);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
  }
  console.log('FG-04B4-R3 original SYNTHETIC falsification, no real pianist GT',
   JSON.stringify({totals:result.totals,
    productionEligible:false,rights:'CC0-1.0-original-synthetic'},null,2));
 }catch(error){
  console.error('FG-04B4-R3 original challenge verification failed:',error.message);
  process.exitCode=1;
 }
}
