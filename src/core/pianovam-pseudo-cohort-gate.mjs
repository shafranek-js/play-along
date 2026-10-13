/**
 * FG-04B4-R5: ORIGINAL-source manifest partition for exploratory, low-
 * confidence PianoVAM automatic pseudo hand data only. Research NO-GO.
 *
 * This is NOT train/test certification: disjoint recording filenames are
 * necessary but do not prove musician/score/performance family independence.
 * No source files, note labels, finger sequences or performer metadata can
 * be exported here. Human GT and manually inspected 11 recordings are
 * permanently excluded from pseudo-only candidates.
 */
import {createHash} from 'node:crypto';

const allowed=/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
const error=code=>{throw Error('R5_'+code)};
const list=(entries,dir)=>{
 if(!Array.isArray(entries)||entries.length>1000)error('INVALID_DIRECTORY_LIST');
 const found=new Set();
 for(const f of entries){
  if(f?.type!=='file'||typeof f.path!=='string')continue;
  if(!f.path.endsWith('.tsv'))continue;
  const prefix=dir+'/',name=f.path.slice(prefix.length,-4);
  if(!f.path.startsWith(prefix)||!allowed.test(name))
   error('UNTRUSTED_MANIFEST_FILENAME');
  if(found.has(name))error('DUPLICATE_MANIFEST_ENTRY');
  found.add(name);
 }
 return [...found].sort();
};
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const subset=(a,b)=>a.every(x=>b.includes(x));
export function partitionSourcePseudolabelRecordings({
 sourceTree,pseudoTree,humanTree,previouslyInspected
},{pilotSize=8}={}){
 if(!Array.isArray(previouslyInspected)||
  previouslyInspected.length!==11||
  new Set(previouslyInspected).size!==11||
  previouslyInspected.some(x=>!allowed.test(x)))error('UNTRUSTED_PRIOR_GT_POPULATION');
 if(!Number.isInteger(pilotSize)||pilotSize<1||pilotSize>16)
  error('INVALID_PILOT_SIZE');
 const source=list(sourceTree,'TSV');
 const pseudo=list(pseudoTree,'Fingering');
 const gt=list(humanTree,'Fingering_GT');
 if(source.length<20||pseudo.length<20)
  error('MISSING_BOUNDED_SOURCE_COHORT');
 if(!same([...previouslyInspected].sort(),gt))
  error('ORIGINAL_MANUAL_GT_SPLIT_MISMATCH');
 if(!subset(pseudo,source)||!subset(gt,source)||!subset(gt,pseudo))
  error('SOURCE_OR_GT_NO_PSEUDO_PARTNER');
 const excluded=new Set(gt);
 const unreviewed=pseudo.filter(name=>!excluded.has(name));
 if(unreviewed.length<pilotSize)error('NOT_ENOUGH_DISJOINT_PSEUDO_CASES');
 const ranked=unreviewed.map(name=>({name,digest:hash('FG04B4R5-PILOT-V1\n'+name)}))
  .sort((a,b)=>a.digest.localeCompare(b.digest)||a.name.localeCompare(b.name));
 const pilot=ranked.slice(0,pilotSize).map(x=>x.name);
 if(pilot.some(x=>excluded.has(x)))error('HUMAN_GT_LEAKED_IN_PILOT');
 return {
  // Internal only; this object must not be JSON-serialized as CI evidence.
  pilotNames:pilot,
  report:{
   schema:'fg04b4-r5-source-disjoint-pseudolabel-manifest-v1',
   sourceTSVRecords:source.length,
   upstreamAutomaticRecords:pseudo.length,
   priorHumanGTRecordings:gt.length,
   pseudolabelOnlyRecordings:unreviewed.length,
   pilotRecords:pilotSize,
   splitIdentitySha256:{
    fullSource:hash(source.join('\n')),
    autoOnly:hash(unreviewed.join('\n')),
    humanGT:hash(gt.join('\n')),
    pilot:hash([...pilot].sort().join('\n'))
   },
   publicationSafety:{
    disjointFilenamesOnly:true,
    performerIndependent:false,
    compositionIndependent:false,
    originalHumanGTUsedAsTraining:false,
    automaticSourceIsGroundTruth:false,
    licensedOnlyForNoncommercialResearch:true,
    approvedForModelTraining:false,
    approvedForLearner:false
   }
  }
 };
}
/**
 * Full, unmodified ORIGINAL source event identity must exactly match every
 * automatic annotation's 5 source columns, row-for-row; the pair remains
 * disjoint from human GT and is never turned into instructor annotation.
 */
export function inspectPilotSourcePseudoPair(source,pseudo){
 if(!Array.isArray(source)||!Array.isArray(pseudo)||source.length!==pseudo.length||
  source.length===0||source.length>25000)error('INCOMPLETE_PILOT_PAIR');
 const fields=['onset','key_offset','frame_offset','note','velocity'];
 const total={notes:source.length,handKnown:0,handUnknown:0,
  fullHandAndFinger:0,handOnly:0,leftLabels:0,rightLabels:0,
  exactSourceEventsChecked:0,originalIndistinguishableEventGroups:0,
  originalIndistinguishableEvents:0};
 const seen=new Map();
 for(let i=0;i<source.length;i++){
  const a=source[i],b=pseudo[i];
  if(!a||!b)error('INVALID_SOURCE_ROW');
  const f=r=>fields.map(k=>{
   if(r[k]===undefined||r[k]===null||String(r[k]).trim()===''||
    !Number.isFinite(Number(r[k])))error('INVALID_NUMERIC_SOURCE_FIELD');
   return Number(r[k]).toFixed(6);
  }).join('|');
  const k=f(a);
  if(k!==f(b))error('ORIGINAL_EVENT_PSEUDO_ROW_MISMATCH');
  seen.set(k,(seen.get(k)||0)+1);
  const hand=b.hand,finger=String(b.finger);
  if((hand!=='L'&&hand!=='R'&&hand!=='Noinfo')||
   (finger!=='Noinfo'&&!['1','2','3','4','5'].includes(finger))||
   (hand==='Noinfo'&&finger!=='Noinfo'))
   error('UNTRUSTED_AUTO_HAND_FINGER_CODE');
  if(hand==='Noinfo')total.handUnknown++;
  else {
   total.handKnown++;
   if(hand==='L')total.leftLabels++;else total.rightLabels++;
   if(finger==='Noinfo')total.handOnly++;
   else total.fullHandAndFinger++;
  }
  total.exactSourceEventsChecked++;
 }
 for(const n of seen.values())if(n>1){
  total.originalIndistinguishableEventGroups++;
  total.originalIndistinguishableEvents+=n;
 }
 if(total.handKnown+total.handUnknown!==total.notes||
  total.leftLabels+total.rightLabels!==total.handKnown||
  total.fullHandAndFinger+total.handOnly!==total.handKnown)
  error('INVALID_PSEUDO_COVERAGE_DENOMINATORS');
 return total;
}
export function summarizeDisjointPilot(rows,partition){
 if(!Array.isArray(rows)||rows.length!==partition.pilotRecords)
  error('INCOMPLETE_DISJOINT_PILOT');
 const all={sourceEvents:0,handKnown:0,handUnknown:0,
  fullHandAndFinger:0,handOnly:0,leftLabels:0,rightLabels:0,
  exactSourceEventsChecked:0,originalIndistinguishableEventGroups:0,
  originalIndistinguishableEvents:0};
 for(const row of rows){
  if(!row||!Number.isInteger(row.notes)||row.notes<1)error('INVALID_PILOT_SUMMARY');
  all.sourceEvents+=row.notes;
  for(const k of Object.keys(all).filter(x=>x!=='sourceEvents')){
   if(!Number.isInteger(row[k])||row[k]<0)error('INVALID_PILOT_SUMMARY_COUNT');
   all[k]+=row[k];
  }
 }
 if(all.sourceEvents!==all.exactSourceEventsChecked||
  all.handKnown+all.handUnknown!==all.sourceEvents||
  all.handKnown!==all.fullHandAndFinger+all.handOnly||
  all.handKnown!==all.leftLabels+all.rightLabels||
  all.originalIndistinguishableEvents>all.sourceEvents)
  error('INVALID_PILOT_AGGREGATE');
 const pct=(x,y)=>y?+(100*x/y).toFixed(2):null;
 return {
  ...all,
  handCoveragePct:pct(all.handKnown,all.sourceEvents),
  unlabelledPct:pct(all.handUnknown,all.sourceEvents),
  completePseudoFingerCoveragePct:pct(all.fullHandAndFinger,all.sourceEvents)
 };
}
