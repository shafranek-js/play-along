/**
 * FG-04C: pure, independent research-only feasibility/cost evaluator.
 * No generated fingering and no score/MIDI mutations. Values are heuristic,
 * not physiological measurements or independently validated teaching advice.
 */
const POS=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const SPANS={ '1-2':5.5,'1-3':6.5,'1-4':7.2,'1-5':8.3,
 '2-3':2.7,'2-4':4.4,'2-5':5.6,'3-4':2.4,'3-5':4.1,'4-5':2.6 };
const MAX_NOTES=10, EPS=1e-8;
const keyX=p=>Math.floor(p/12)*7+POS[p%12];
const isBlack=p=>[1,3,6,8,10].includes(p%12);
const refuse=(reason)=>({ok:false,reason,researchOnly:true,productionEligible:false});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const valid=n=>n&&typeof n.noteId==='string'&&n.noteId.trim()&&
 Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&
 Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5&&
 finite(n.start)&&n.start>=0&&finite(n.duration)&&n.duration>0&&
 (n.hand==='LH'||n.hand==='RH')&&
 ((n.source==='musicxml'&&n.verification==='source-author')||
  (n.source==='user'&&n.verification==='user-verified'));
function checkGroup(group) {
 if(!Array.isArray(group)||group.length===0||group.length>MAX_NOTES)return 'INVALID_GROUP';
 const ids=new Set(),fingers=new Map(),keys=new Map();
 for(const n of group){
  if(!valid(n))return 'UNVERIFIED_SOURCE_NOTE';
  if(ids.has(n.noteId))return 'DUPLICATE_NOTE_ID';
  ids.add(n.noteId);
  const f=n.hand+':'+n.finger,p=n.pitch;
  if(fingers.has(f))return 'SAME_FINGER_SIMULTANEOUS';
  if(keys.has(p))return 'SAME_PHYSICAL_KEY';
  fingers.set(f,n);keys.set(p,n);
 }
 const start=group[0].start;
 if(group.some(n=>Math.abs(n.start-start)>EPS))return 'NOT_SIMULTANEOUS';
 for(const hand of ['LH','RH']){
  const ordered=group.filter(n=>n.hand===hand).sort((a,b)=>a.pitch-b.pitch);
  for(let i=1;i<ordered.length;i++){
   if(hand==='RH'&&ordered[i-1].finger>=ordered[i].finger)
    return 'FINGER_ORDER_UNVERIFIED';
   if(hand==='LH'&&ordered[i-1].finger<=ordered[i].finger)
    return 'FINGER_ORDER_UNVERIFIED';
  }
 }
 return null;
}
export function evaluateFingeringCostResearch({previous=[],next=[],at,handSize=1,velocityLimit=3}={}){
 if(!finite(at)||at<0||!finite(handSize)||handSize<.65||handSize>1.35||
  !finite(velocityLimit)||velocityLimit<=0||velocityLimit>10)
  return refuse('INVALID_CONFIGURATION');
 if(previous.length&&checkGroup(previous))return refuse('INVALID_PREVIOUS_'+checkGroup(previous));
 const problem=checkGroup(next);
 if(problem)return refuse(problem);
 if(next[0].start+EPS<at)return refuse('TARGET_ALREADY_DUE');
 const combined=new Set();
 for(const n of [...previous,...next]){
  if(combined.has(n.noteId))return refuse('REUSED_SOURCE_NOTE_ID');
  combined.add(n.noteId);
 }
 // MIDI release, not sustain-pedal audio tail: physical key occupation must
 // be explicitly released before its finger can move to another key.
 for(const a of previous){
  const stillHeld=a.start+a.duration>next[0].start+EPS;
  if(!stillHeld)continue;
  const claimed=next.filter(b=>b.hand===a.hand&&b.finger===a.finger);
  if(claimed.some(b=>b.pitch!==a.pitch))return refuse('OCCUPIED_FINGER');
  if(next.some(b=>b.pitch===a.pitch))return refuse('HELD_KEY_REARTICULATION');
 }
 let unary=0,shape=0,transition=0;
 for(const n of next){
  if(n.finger===4)unary+=.12;
  if(n.finger===1&&isBlack(n.pitch))unary+=1.92;
 }
 for(const hand of ['LH','RH']){
  const notes=next.filter(n=>n.hand===hand).sort((a,b)=>a.pitch-b.pitch);
  for(let i=0;i<notes.length;i++)for(let j=i+1;j<notes.length;j++){
   const a=notes[i],b=notes[j];
   const distance=Math.abs(keyX(b.pitch)-keyX(a.pitch));
   const pair=[a.finger,b.finger].sort((x,y)=>x-y).join('-');
   const limit=SPANS[pair];
   if(limit==null)return refuse('UNSUPPORTED_FINGER_PAIR');
   if(distance>limit*handSize+EPS)return refuse('EXCEEDS_FINGER_SPAN');
   const natural=Math.abs(a.finger-b.finger);
   shape+=Math.max(0,distance/handSize-natural)*1.5;
   shape+=Math.max(0,natural-distance)*.65;
   if(j===i+1&&Math.abs(b.finger-a.finger)===1&&a.finger>=2&&
      distance>1.2)shape+=(distance-1.2)*.6;
  }
  const old=previous.filter(n=>n.hand===hand);
  if(!old.length||!notes.length)continue;
  // The centroid is a geometry measure, NOT inferred anatomical wrist pose.
  const avg=list=>list.reduce((sum,n)=>sum+keyX(n.pitch),0)/list.length;
  const travel=Math.abs(avg(notes)-avg(old));
  const lastRelease=Math.max(...old.map(n=>n.start+n.duration));
  const available=Math.max(0,next[0].start-Math.max(at,lastRelease));
  // Approximate physical white-key width 23.5 mm and eased trajectory.
  const needed=travel*.0235*1.875/velocityLimit;
  if(needed>available+EPS)return refuse('TRAVEL_TIME_INFEASIBLE');
  transition+=travel*.4+(available>0?travel/available*.06:0);
 }
 const parts={unary,shape,transition};
 return {ok:true,parts,total:unary+shape+transition,
  notes:next.length,researchOnly:true,productionEligible:false,
  estimatedBiomechanicsOnly:true,
  guaranteeOfOptimality:false,expertValidated:false};
}
