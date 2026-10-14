/**
 * P0-A1 — independent, source-bound *hard contradiction* screen.
 *
 * This is not a fingering solver, musician ground truth or ergonomic score.
 * Two distinct piano keys cannot be pressed by one finger while both keys
 * are physically down; two hands cannot independently attack the same key
 * while it is held; one hand has at most five independently held keys.
 * MIDI physical NoteOff is used, NEVER pedal CC64 acoustic sustain.
 *
 * A refusal makes only the implicated generated proposals ineligible for
 * automatic Apply. Existing composer/user annotations are never changed.
 */
const WHITE_INDEX=Object.freeze({0:0,2:1,4:2,5:3,7:4,9:5,11:6});
const BLACK=new Set([1,3,6,8,10]);
const black=p=>BLACK.has(p%12);
const whitePos=p=>Math.floor(p/12)*7+WHITE_INDEX[p%12];
// The reference engine explicitly supports a double-thumb on adjacent
// whites/blacks, and a double-pinky on adjacent whites. Such contacts are
// TECHNIQUE EXCEPTIONS, not hard contradictory finger assignments.
function possibleTwoKeyContact(a,b){
 if(a.finger!==b.finger||![1,5].includes(a.finger)||
    black(a.pitch)!==black(b.pitch))return false;
 const distance=Math.abs(a.pitch-b.pitch);
 if(!distance)return false;
 if(!black(a.pitch))return distance<=2&&
  Math.abs(whitePos(a.pitch)-whitePos(b.pitch))===1;
 return a.finger===1&&(distance===2||distance===3);
}
export function pianoMotionAuditFingers(alignment,{epsilon=.002,maxNotes=10000}={}){
 const refusal=reason=>({ok:false,reason,blocked:[],issues:[],counts:{},
  hardConflicts:0,researchOnly:true,expertValidated:false});
 if(!alignment?.ok||!Array.isArray(alignment.matches)||
    !alignment.matches.length||alignment.matches.length>maxNotes||
    !Number.isFinite(epsilon)||epsilon<0||epsilon>.01)
  return refusal('INVALID_SOURCE_ALIGNMENT');
 const all=[],unresolved=[];
 for(const [index,entry] of alignment.matches.entries()){
  const n=entry?.note,s=entry?.suggestion;
  if(!n||!s||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
    !Number.isFinite(n.start)||!Number.isFinite(n.duration)||n.duration<=0||
    !['RH','LH'].includes(s.hand)||!(s.finger===null||
      Number.isInteger(s.finger)&&s.finger>=1&&s.finger<=5))
   return refusal('INVALID_SOURCE_OR_PROPOSAL');
  if(s.finger===null){unresolved.push(index);continue;}
  all.push({index,hand:s.hand,finger:s.finger,pitch:n.pitch,
    start:n.start,end:n.start+n.duration});
 }
 all.sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
 const byNote=new Map(),counts=Object.create(null),blocked=new Set();
 let techniqueExceptions=0;
 const record=(code,indices)=>{
  // A single contradicted note is listed once for each conflict category.
  let newHits=0;
  for(const i of indices){
   let codes=byNote.get(i);
   if(!codes){codes=new Set();byNote.set(i,codes);}
   if(!codes.has(code)){codes.add(code);blocked.add(i);newHits++;}
  }
  if(newHits)counts[code]=(counts[code]||0)+newHits;
 };
 let active=[];
 for(const n of all){
  active=active.filter(a=>a.end>n.start+epsilon);
  // Stop before quadratic work on a corrupted/ensemble-sized held chord.
  // Refusing the entire analysis is safer than silently ignoring overlaps.
  if(active.length>64)return refusal('UNSUPPORTED_HELD_NOTE_DENSITY');
  for(const old of active){
   if(old.pitch===n.pitch){
    if(old.hand!==n.hand||Math.abs(old.start-n.start)>epsilon||
       old.finger!==n.finger)record('SAME_KEY_OVERLAP',[old.index,n.index]);
   }else if(old.hand===n.hand&&old.finger===n.finger){
    if(possibleTwoKeyContact(old,n)&&Math.abs(old.start-n.start)<=.03)
     techniqueExceptions++;
    else record('OCCUPIED_FINGER',[old.index,n.index]);
   }
  }
  active.push(n);
  // A single hand cannot simultaneously depress six distinct piano keys,
  // regardless of what finger numbers the solver produced.
  for(const hand of ['RH','LH']){
   const inHand=active.filter(a=>a.hand===hand);
   if(new Set(inHand.map(a=>a.pitch)).size>5)
    record('MORE_THAN_FIVE_HELD_KEYS',inHand.map(a=>a.index));
  }
 }
 const issues=[...byNote].sort((a,b)=>a[0]-b[0]).map(([index,codes])=>({
  index,codes:[...codes].sort()
 }));
 return {ok:true,total:alignment.matches.length,assigned:all.length,
  unresolved:unresolved.length,blocked:[...blocked].sort((a,b)=>a-b),
  safe:all.filter(n=>!blocked.has(n.index)).length,
  hardConflicts:blocked.size,counts:{...counts},issues,techniqueExceptions,
  // 'safe' only means these simple structural contradictions were not found.
  researchOnly:true,expertValidated:false,productionEligible:false};
}
