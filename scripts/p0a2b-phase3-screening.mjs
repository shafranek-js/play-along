/**
 * P0-A2b Phase 3, aggregate-only reproducible pre-registration check.
 * No networking, source music, reviewer forms or finger vectors are exported.
 * This is intentionally NOT a benchmark of fingering quality.
 */
import {readFileSync} from 'node:fs';
import {auditP0A2bPhase3Screening} from '../src/core/p0a2b-phase3-cohort.mjs';

const read=relative=>JSON.parse(readFileSync(new URL(relative,import.meta.url),'utf8'));
export function runP0A2bPhase3Screening(){
 return auditP0A2bPhase3Screening(
  read('../research/p0a2b-phase3-screening-plan.json'),
  read('../research/fg04b1b-asap-score-manifest.json'));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const result=runP0A2bPhase3Screening();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.ok)process.exitCode=1;
}
