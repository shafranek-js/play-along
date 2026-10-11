/**
 * FG-02D — bounded *research-only* phrase hypothesis generator.
 *
 * An independently verifiable pedagogical *candidate*, NOT a new proven
 * biomechanical optimizer. Uses musical interval structure to distinguish
 * continuous two-octave major scales/arpeggios from short final passages.
 * Original FG-02A/02B outputs remain the baseline and default fallback.
 *
 * DO NOT import this module into the player, turn on automatic finger guidance,
 * or treat a match on the developmental references as independent validation.
 */
import {proposeMonophonicFingering} from './fingering-dp.mjs';
import {proposePolyphonicFingering} from './fingering-polyphonic.mjs';
import {auditFingeringAssignments} from './fingering-audit.mjs';

const MAJOR_STEPS=[2,2,1,2,2,2,1];
const ARP_STEPS=[4,3,5,4,3,5];
// Deliberately narrow research domain. These shapes are NOT asserted to be
// universal across keys, tempos, phrasing, articulation or hand sizes.
const QUALIFIED_TONICS=new Set([0,2,7]); // C, D, G major; D is held-out transposition.
const BLACK=new Set([1,3,6,8,10]);
const ASC_SCALE={
 RH:[1,2,3,1,2,3,4,1,2,3,1,2,3,4,5],
 LH:[5,4,3,2,1,3,2,1,4,3,2,1,3,2,1]
};
const ASC_ARPEGGIO={
 RH:[1,2,3,1,2,3,5],
 LH:[5,3,2,1,3,2,1]
};
const CHORD_FINGERS={
 root:{RH:[1,3,5],LH:[5,3,1]},
 first:{RH:[1,2,5],LH:[5,3,1]},
 second:{RH:[1,3,5],LH:[5,2,1]}
};
const isHand=h=>h==='RH'||h==='LH';
const isBlack=p=>BLACK.has(p%12);
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const byOnset=(notes)=>notes.map((n,index)=>({...n,index}))
 .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
const isSupportedKey=tonic=>QUALIFIED_TONICS.has(((tonic%12)+12)%12);
const cloneWithProposal=(notes,hand,ordered,fingers)=>{
 const out=new Array(notes.length);
 ordered.forEach((n,i)=>{
  out[n.index]={
   pitch:n.pitch,start:n.start,duration:n.duration,hand,
   finger:fingers[i],source:n.finger==null?'proposed-phrase-hypothesis':'anchor',
   ...(n.noteId!=null?{noteId:n.noteId}:{})
  };
 });
 return out;
};
const candidateAllowed=(ordered,fingers,hand,handSize,original)=>{
 if(fingers.length!==ordered.length)return false;
 if(ordered.some((n,i)=>
  (n.finger!=null&&n.finger!==fingers[i])||
  (n.hand!=null&&n.hand!==hand)||
  // Finger-1 targets on a black key are frequently method-specific; do
  // not force an uncalibrated template in that case.
  (fingers[i]===1&&isBlack(n.pitch))))return false;
 const proposed=cloneWithProposal(original,hand,ordered,fingers);
 return auditFingeringAssignments(original,proposed,{handSize}).valid;
};
function detectMelodicPhrase(ordered,hand){
 const pitches=ordered.map(n=>n.pitch);
 if(![7,15].includes(pitches.length))return null;
 const jumps=pitches.slice(1).map((p,i)=>p-pitches[i]);
 const ascending=jumps.every(v=>v>0),descending=jumps.every(v=>v<0);
 if(!ascending&&!descending)return null;
 const sign=ascending?1:-1;
 const chromatic=pitches.map(p=>ascending?p:-p).slice(1);
 void chromatic; // Explicitly use intervals (not white-key hardcoded notes).
 const interval=jumps.map(Math.abs);
 const low=Math.min(...pitches),high=Math.max(...pitches);
 if(high-low!==24)return null;
 const canonical=ascending?interval:interval.slice().reverse();
 if(pitches.length===15&&equal(canonical,MAJOR_STEPS.concat(MAJOR_STEPS))&&isSupportedKey(low)){
  const f=ASC_SCALE[hand];
  return {kind:'major-scale-two-octaves',fingers:ascending?f.slice():f.slice().reverse(),tonic:low%12};
 }
 if(pitches.length===7&&equal(canonical,ARP_STEPS)&&isSupportedKey(low)){
  const f=ASC_ARPEGGIO[hand];
  return {kind:'major-arpeggio-two-octaves',fingers:ascending?f.slice():f.slice().reverse(),tonic:low%12};
 }
 return null;
}
function detectChord(ordered,hand){
 if(ordered.length!==3)return null;
 if(ordered.some(n=>Math.abs(n.start-ordered[0].start)>.003))return null;
 const p=ordered.map(n=>n.pitch),d=[p[1]-p[0],p[2]-p[1]];
 const kind=equal(d,[4,3])?'root':equal(d,[3,5])?'first':equal(d,[5,4])?'second':null;
 if(!kind)return null;
 const tonic=kind==='root'?p[0]:kind==='first'?p[2]-12:p[1]-12;
 if(!isSupportedKey(tonic))return null;
 return {kind:'major-triad-'+kind+'-position',fingers:CHORD_FINGERS[kind][hand],tonic:tonic%12};
}
const withStrategy=(baseline,strategy)=>baseline.ok?{...baseline,strategy}:baseline;
function propose(notes,{hand,handSize='M',beamWidth=40}={},engine){
 // A known opposing hand is an input error, not a reason to emit a proposal.
 if(Array.isArray(notes)&&isHand(hand)&&notes.some(n=>n?.hand!=null&&n.hand!==hand))
  return {ok:false,reason:'HAND_CONFLICT'};
 const opts={hand,handSize,beamWidth};
 const baseline=engine==='mono'
  ?proposeMonophonicFingering(notes,{hand,handSize})
  :proposePolyphonicFingering(notes,opts);
 if(!baseline.ok)return baseline;
 if(!Array.isArray(notes)||!isHand(hand))return withStrategy(baseline,'baseline');
 const ordered=byOnset(notes);
 const detected=engine==='mono'
  ?detectMelodicPhrase(ordered,hand):detectChord(ordered,hand);
 if(!detected||!candidateAllowed(ordered,detected.fingers,hand,handSize,notes))
  return withStrategy(baseline,'baseline');
 return {
  ...baseline,method:'fg02d-experimental-phrase-hypothesis',
  strategy:'reference-phrase-candidate',phraseKind:detected.kind,
  hypothesisScope:'C/D/G-major-two-octave-or-close-position',
  // A template match alone gives no defensible probabilistic confidence.
  // It is deliberately never labelled 'verified' or 'optimal'.
  items:cloneWithProposal(notes,hand,ordered,detected.fingers),
  totalCost:null // FG-02A/B and phrase templates use incompatible scores.
 };
}
/** Candidate for a specifically known single-hand monophonic phrase. */
export function proposePhraseAwareMonophonicFingering(notes,opts={}){
 return propose(notes,opts,'mono');
}
/** Candidate for a specifically known single-hand close-position chord. */
export function proposePhraseAwareChordFingering(notes,opts={}){
 return propose(notes,opts,'chord');
}
