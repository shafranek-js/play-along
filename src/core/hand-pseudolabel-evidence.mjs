/**
 * FG-04B4-R4 — independently score upstream *automatic* PianoVAM labels
 * against original manual annotations on EXACT source MIDI events.
 *
 * The automatically generated Fingering/ labels are PSEUDOLABELS, not
 * source-author fingers, expert adjudication or gold-standard truth.
 * No machine labels ever enter the FG-04B4 hand splitter or player.
 * Input/output are read-only, aggregate-only, noncommercial research.
 */
const K=['onset','key_offset','frame_offset','note','velocity'];
const FINITE=x=>Number.isFinite(Number(x));
const validHand=h=>h==='L'||h==='R';
const validFinger=f=>['1','2','3','4','5'].includes(String(f));
const key=r=>K.map(k=>{
 if(!FINITE(r[k]))throw Error('R4_INVALID_SOURCE_EVENT');
 return Number(r[k]).toFixed(6);
}).join('|');
const fail=message=>{throw Error('R4_'+message)};
const bump=(x,k)=>{x[k]=(x[k]||0)+1};
const nonneg=x=>Number.isInteger(x)&&x>=0;
export function comparePseudoHandLabels(source,pseudo,manual){
 if(!Array.isArray(source)||!Array.isArray(pseudo)||!Array.isArray(manual)||
  !source.length||source.length>25_000||manual.length>source.length||
  pseudo.length!==source.length)fail('INCOMPLETE_SOURCE_PSEUDOLABEL_FILE');
 const counts=new Map(),exact=new Map();
 for(let i=0;i<source.length;i++){
  const k=key(source[i]);
  bump(counts,k);
  if(!exact.has(k))exact.set(k,i);
  if(key(pseudo[i])!==k)fail('PSEUDOLABEL_MIDI_ROW_IDENTITY_MISMATCH');
 }
 const labels=source.map((_,i)=>{
  const r=pseudo[i],h=r.hand,f=String(r.finger);
  if(!(validHand(h)||h==='Noinfo')||
     !(validFinger(f)||f==='Noinfo')||
     (h==='Noinfo'&&f!=='Noinfo'))fail('UNTRUSTED_PSEUDOLABEL_CODING');
  return {hand:validHand(h)?h:null,finger:validFinger(f)?f:null};
 });
 const review={
  sourceNotes:source.length,automaticLabels:source.length,
  automaticHandKnown:labels.filter(x=>x.hand).length,
  automaticFingerKnown:labels.filter(x=>x.hand&&x.finger).length,
  automaticHandUnknown:labels.filter(x=>!x.hand).length,
  automaticHandOnly:labels.filter(x=>x.hand&&!x.finger).length,
  manualGTNotes:manual.length,uniqueManualEvents:0,
  duplicateSourceGTQuarantined:0,
  gtHandAvailable:0,autoHandProposed:0,autoHandUnknown:0,
  handCorrect:0,handIncorrect:0,
  autoFingerProposed:0,autoFingerUnknown:0,
  fullHandFingerCorrect:0,fullHandFingerIncorrect:0,
  handErrorsByPredictedSide:{'L-as-R':0,'R-as-L':0}
 };
 const manuallySeen=new Set();
 for(const gt of manual){
  const k=key(gt);
  if(!counts.has(k))fail('MANUAL_GT_MISSING_IN_ORIGINAL');
  if(manuallySeen.has(k))fail('DUPLICATE_MANUAL_GT_SOURCE_EVENT');
  manuallySeen.add(k);
  if(!validHand(gt.hand)||!validFinger(gt.finger))
   fail('INVALID_MANUAL_HAND_FINGER');
  if(counts.get(k)>1){
   review.duplicateSourceGTQuarantined++;continue;
  }
  const label=labels[exact.get(k)];
  review.uniqueManualEvents++;review.gtHandAvailable++;
  if(label.hand===null){review.autoHandUnknown++;}
  else{
   review.autoHandProposed++;
   if(label.hand===gt.hand)review.handCorrect++;
   else{
    review.handIncorrect++;
    const wrong=label.hand==='L'?'L-as-R':'R-as-L';
    review.handErrorsByPredictedSide[wrong]++;
   }
  }
  if(label.finger===null)review.autoFingerUnknown++;
  else{
   review.autoFingerProposed++;
   if(label.hand===gt.hand&&label.finger===String(gt.finger))
    review.fullHandFingerCorrect++;
   else review.fullHandFingerIncorrect++;
  }
 }
 if(review.uniqueManualEvents+review.duplicateSourceGTQuarantined!==manual.length||
    review.autoHandUnknown+review.autoHandProposed!==review.uniqueManualEvents||
    review.handCorrect+review.handIncorrect!==review.autoHandProposed||
    review.autoFingerUnknown+review.autoFingerProposed!==review.uniqueManualEvents||
    review.fullHandFingerCorrect+review.fullHandFingerIncorrect!==review.autoFingerProposed||
    Object.values(review.handErrorsByPredictedSide).reduce((a,b)=>a+b,0)!==review.handIncorrect||
    review.automaticHandKnown+review.automaticHandUnknown!==source.length||
    review.automaticHandOnly+review.automaticFingerKnown!==review.automaticHandKnown)
  fail('INVALID_AUDIT_DENOMINATORS');
 // Deliberately no output event IDs or timestamps or predicted labels.
 return review;
}
export function summarizePseudoHandEvidence(cases){
 if(!Array.isArray(cases)||cases.length!==11)fail('INCOMPLETE_GT_HOLDOUT');
 const nums=['sourceNotes','automaticLabels','automaticHandKnown',
  'automaticFingerKnown','automaticHandUnknown','automaticHandOnly',
  'manualGTNotes','uniqueManualEvents','duplicateSourceGTQuarantined',
  'gtHandAvailable','autoHandProposed','autoHandUnknown','handCorrect',
  'handIncorrect','autoFingerProposed','autoFingerUnknown',
  'fullHandFingerCorrect','fullHandFingerIncorrect'];
 const sums=Object.fromEntries(nums.map(k=>[k,0]));
 const wrong={'L-as-R':0,'R-as-L':0};
 for(const c of cases){
  for(const k of nums){if(!nonneg(c[k]))fail('INVALID_RECORD_COUNT');sums[k]+=c[k]}
  for(const key of Object.keys(wrong)){
   if(!nonneg(c.handErrorsByPredictedSide?.[key]))fail('INVALID_RECORD_DIRECTION');
   wrong[key]+=c.handErrorsByPredictedSide[key];
  }
 }
 if(sums.autoHandProposed!==sums.handCorrect+sums.handIncorrect||
  sums.uniqueManualEvents!==sums.autoHandProposed+sums.autoHandUnknown||
  sums.autoFingerProposed!==sums.fullHandFingerCorrect+sums.fullHandFingerIncorrect||
  Object.values(wrong).reduce((a,b)=>a+b,0)!==sums.handIncorrect)
  fail('AGGREGATE_DENOMINATOR_MISMATCH');
 const pct=(a,b)=>b?+(100*a/b).toFixed(2):null;
 return {
  ...sums,handErrorsByPredictedSide:wrong,
  automaticHandCoverageAllSourcePct:pct(sums.automaticHandKnown,sums.sourceNotes),
  handCoverageOnManualSubsetPct:pct(sums.autoHandProposed,sums.uniqueManualEvents),
  handAgreementAmongProposedPct:pct(sums.handCorrect,sums.autoHandProposed),
  handErrorAmongProposedPct:pct(sums.handIncorrect,sums.autoHandProposed),
  handAndFingerAgreementAmongProposedPct:pct(sums.fullHandFingerCorrect,sums.autoFingerProposed),
  correctHandAmongAllManualPct:pct(sums.handCorrect,sums.uniqueManualEvents),
  missingPseudoHandPct:pct(sums.autoHandUnknown,sums.uniqueManualEvents)
 };
}
