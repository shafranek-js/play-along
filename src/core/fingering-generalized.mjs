/**
 * FG-02F – research-only key-agnostic melodic fingering search.
 *
 * Original heuristic beam search, NOT a port of Parncutt/PianoPlayer or
 * calibrated biomechanics. NO tonic allowlist, no reference-table lookups.
 * For monotonic scale-like and arpeggio-like runs, use physical key geometry,
 * black-key ergonomics, step direction, hand-center movement and thumb
 * passage. Unrecognised figures use FG-02A unchanged. No production import.
 *
 * This model MUST NOT be tuned to locked FG-02E holdout examples: report
 * those results unmodified and obtain a fresh prospective holdout for future
 * generalization claims. Outputs are suggestions, never authored fingers.
 */
import {proposeMonophonicFingering} from './fingering-dp.mjs';
import {auditFingeringAssignments} from './fingering-audit.mjs';

const KEY_X=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const FINGER_X=[-2,-1,0,1,2];
const BLACK=new Set([1,3,6,8,10]);
const WIDTH={XXS:.68,XS:.78,S:.88,M:1,L:1.1,XL:1.2,XXL:1.3};
const xOf=p=>Math.floor(p/12)*7+KEY_X[p%12];
const isBlack=p=>BLACK.has(p%12);
const fail=reason=>({ok:false,reason});
const byScore=(a,b)=>a.score-b.score||a.order-b.order;
const noteGap=(a,b)=>b.start-a.start-a.duration;
const isValidShape=(sorted)=>{
 if(sorted.length<4)return null;
 const diffs=sorted.slice(1).map((n,i)=>n.pitch-sorted[i].pitch);
 const asc=diffs.every(x=>x>0),desc=diffs.every(x=>x<0);
 if(!asc&&!desc)return null;
 const intervals=diffs.map(Math.abs);
 // This is an interval-shape classifier, NOT a key or pitch-class lookup.
 // Does not presume that a musical piece follows a complete major scale.
 if(sorted.length>=6&&intervals.every(x=>x===1||x===2))
  return {kind:'monotone-stepwise',direction:asc?1:-1};
 if(sorted.length>=4&&intervals.every(x=>x>=3&&x<=7))
  return {kind:'monotone-arpeggiated',direction:asc?1:-1};
 return null;
};
const terminalCost=(finger,towardPinky,shape)=>{
 const ideal=towardPinky?5:1;
 // A passage might be continued in the full composition, hence soft cost.
 return (shape.kind==='monotone-stepwise'?.55:.35)*Math.abs(ideal-finger);
};
const startCost=(n,f,towardPinky)=>{
 const ideal=towardPinky?1:5;
 // Initial finger needn't be the extreme finger, especially on black keys.
 return (isBlack(n.pitch)?.32:.52)*Math.abs(f-ideal);
};
const keyCost=(pitch,finger)=>{
 if(!isBlack(pitch))return 0;
 return finger===1?6.2:finger===5?2.8:0;
};
const transitionCost=(a,b,from,to,hand,width,towardPinky,shape,cooldown)=>{
 const dx=xOf(b.pitch)-xOf(a.pitch);
 const dir=hand==='RH'?1:-1;
 const nextCenter=xOf(b.pitch)-dir*FINGER_X[to-1]*width;
 const oldCenter=xOf(a.pitch)-dir*FINGER_X[from-1]*width;
 const move=Math.abs(nextCenter-oldCenter);
 const gap=noteGap(a,b);
 if(a.pitch!==b.pitch&&from===to&&gap<.22)return null;
 let turn=false,relative=0;
 if(towardPinky){
  if(to>from){
   const skip=to-from-1;
   relative+=(shape.kind==='monotone-stepwise'?2.5:1.1)*skip;
  }else if(to<from){
   if(to!==1||from<3)return null; // thumb-under only after 3/4/5
   turn=true;
   relative+=(from===3?1.3:from===4?1.75:3.0);
  }else relative+=3.5;
 }else{
  if(to<from){
   const skip=from-to-1;
   relative+=(shape.kind==='monotone-stepwise'?2.5:1.1)*skip;
  }else if(to>from){
   if(from!==1||to<3)return null; // finger-over after thumb
   turn=true;
   relative+=(to===3?1.3:to===4?1.75:3.0);
  }else relative+=3.5;
 }
 if(turn&&cooldown<2)return null;
 if(turn&&isBlack(b.pitch)&&to===1)return null; // don't tuck thumb under a black key
 if(turn&&isBlack(a.pitch)&&from===1)return null;
 // Short intervals are hardest to play by relocating the whole hand.
 const speedWeight=gap<.18?1.45:gap<.6?1.05:.8;
 const motion=move*speedWeight;
 const stretch=Math.max(0,move-2.5*width)*(.45+(gap<.18?.75:0));
 const transitionPenalty=(Math.abs(dx)<1&&Math.abs(to-from)>2&&!turn)?1.3:0;
 return {cost:relative+motion+stretch+transitionPenalty,center:nextCenter,turn};
};
/**
 * @param {Array<{pitch:number,start:number,duration:number,finger?:number,hand?:string,noteId?:string}>} notes
 * @param {{hand:'RH'|'LH',handSize?:string,beamWidth?:number}} options
 * @returns research only, same note order and hard-anchor preservation as FG-02A
 */
export function proposeGeneralizedMonophonicFingering(notes,{hand,handSize='M',beamWidth=64}={}){
 if(hand!=='RH'&&hand!=='LH')return fail('HAND_REQUIRED');
 if(!Object.hasOwn(WIDTH,handSize))return fail('INVALID_HAND_SIZE');
 if(!Number.isInteger(beamWidth)||beamWidth<4||beamWidth>256)return fail('INVALID_BEAM_WIDTH');
 if(Array.isArray(notes)&&notes.some(n=>n?.hand!=null&&n.hand!==hand))return fail('HAND_CONFLICT');
 // The original engine validates duration, pitch, anchors, overlap and length.
 // An impossible source never becomes "solvable" via a proposed new fingering.
 const baseline=proposeMonophonicFingering(notes,{hand,handSize});
 if(!baseline.ok)return baseline;
 const ordered=notes.map((n,index)=>({...n,index}))
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
 const shape=isValidShape(ordered);
 if(!shape)return {...baseline,strategy:'baseline-outside-monotonic-scope'};
 const towardPinky=shape.direction*(hand==='RH'?1:-1)>0;
 const width=WIDTH[handSize];
 let serial=0;
 let beam=[];
 for(let f=1;f<=5;f++){
  if(ordered[0].finger!=null&&ordered[0].finger!==f)continue;
  beam.push({score:startCost(ordered[0],f,towardPinky)+keyCost(ordered[0].pitch,f),
   finger:f,cooldown:100,node:{prior:null,finger:f,index:0},order:serial++});
 }
 for(let i=1;i<ordered.length;i++){
  const next=[];
  for(const state of beam)for(let f=1;f<=5;f++){
   const note=ordered[i];
   if(note.finger!=null&&note.finger!==f)continue;
   const transition=transitionCost(ordered[i-1],note,state.finger,f,hand,
    width,towardPinky,shape,state.cooldown);
   if(!transition)continue;
   next.push({score:state.score+transition.cost+keyCost(note.pitch,f),
    finger:f,cooldown:transition.turn?0:Math.min(100,state.cooldown+1),
    node:{prior:state.node,finger:f,index:i},order:serial++});
  }
  if(!next.length)return {...baseline,strategy:'baseline-no-generalized-path'};
  next.sort(byScore);
  const seen=new Set();
  beam=[];
  for(const s of next){
   // Different turn recencies cannot be coalesced: they affect future
   // viability; buckets preserve distinct possibilities with bounded memory.
   const key=s.finger+'|'+Math.min(3,s.cooldown);
   if(seen.has(key))continue;
   beam.push(s);seen.add(key);
   if(beam.length===beamWidth)break;
  }
 }
 const candidates=beam.map(s=>({...s,
  finalCost:s.score+terminalCost(s.finger,towardPinky,shape)}))
  .sort((a,b)=>a.finalCost-b.finalCost||a.order-b.order);
 for(const candidate of candidates){
  const fingers=new Array(ordered.length);
  for(let n=candidate.node;n;n=n.prior)fingers[n.index]=n.finger;
  const result=new Array(notes.length);
  ordered.forEach((n,i)=>{
   result[n.index]={
    pitch:n.pitch,start:n.start,duration:n.duration,
    finger:fingers[i],hand,
    source:n.finger==null?'proposed-generalized':'anchor',
    ...(n.noteId!=null?{noteId:n.noteId}:{})
   };
  });
  const audited=auditFingeringAssignments(notes,result,{handSize});
  if(!audited.valid)continue;
  return {ok:true,method:'fg02f-experimental-key-agnostic-beam',
   strategy:'generalized-melodic-hypothesis',phraseKind:shape.kind,
   hand,handSize,items:result,totalCost:+candidate.finalCost.toFixed(5),
   // Search cost is heuristic and MUST NOT be represented as confidence.
   expertValidated:false,confidence:null};
 }
 return {...baseline,strategy:'baseline-independent-audit-rejected'};
}
