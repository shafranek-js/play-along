/**
 * FG-02H: context-aware, monophonic research fingering.
 *
 * Motivated by mixed-direction phrases and fully-pinned score refusals in
 * FG-02G. Does not copy source fingering or modify FG-02A/F. Does NOT infer
 * playing fingers from MIDI and is never imported into production UI.
 *
 * Design distinction: a released finger may be reused on a new key even
 * with a short gap. That can be mechanically awkward, but is not evidence
 * that an AUTHOR'S explicit finger should be discarded. Flag such anchors,
 * rather than imposing FG-02A's Infinity transition on source notation.
 */
import {auditFingeringAssignments} from './fingering-audit.mjs';

const KEY_X=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const FINGER_X=[-2,-1,0,1,2];
const BLACK=new Set([1,3,6,8,10]);
const SIZES=Object.freeze({XXS:.68,XS:.78,S:.88,M:1,L:1.10,XL:1.20,XXL:1.30});
const xpos=p=>Math.floor(p/12)*7+KEY_X[p%12];
const bad=reason=>({ok:false,reason});
const isFinger=f=>Number.isInteger(f)&&f>=1&&f<=5;
const sign=n=>n>0?1:n<0?-1:0;
const MAX_NOTES=5000;

function classifyBoundary(a,b,c){
 const incoming=sign(b.pitch-a.pitch),outgoing=c?sign(c.pitch-b.pitch):0;
 if(incoming&&outgoing&&incoming!==outgoing)return 'TURN';
 if(incoming===0)return 'REPEAT';
 return 'CONTINUE';
}
function blackCost(pitch,finger){
 if(!BLACK.has(pitch%12))return 0;
 return finger===1?4.2:finger===5?1.6:0;
}
function transition(a,b,previous,current,hand,handSize,boundary,follow){
 const gap=b.start-a.start-a.duration;
 const dx=xpos(b.pitch)-xpos(a.pitch);
 const dir=hand==='RH'?1:-1;
 const centerA=xpos(a.pitch)-dir*FINGER_X[previous-1]*handSize;
 const centerB=xpos(b.pitch)-dir*FINGER_X[current-1]*handSize;
 const motion=Math.abs(centerB-centerA);
 const longRest=gap>=.8;
 const speed=longRest?.32:gap>.3?.65:1.05;
 const interval=b.pitch-a.pitch;
 let cost=motion*speed+blackCost(b.pitch,current);
 const oriented=sign(interval)*dir;
 const fingerMotion=current-previous;
 if(interval!==0){
  if(current===previous){
   // Never silently reject an author's slide/reposition. Penalize fast
   // *proposed* one-finger repetitions while permitting actual anchors.
   cost+=gap<.12?8:gap<.3?5:2.2;
  }else if(oriented*fingerMotion>0){
   cost+=Math.max(0,Math.abs(fingerMotion)-1)*(Math.abs(interval)<=3?1.7:.55);
  }else{
   // Thumb-under/finger-over are ordinary scale moves; other crossings
   // of active finger indices are experimental, not automatically invalid.
   const thumb=oriented>0?current===1:previous===1;
   cost+=thumb?1.2:4.5;
  }
 }else{
  // Repeated pitch, alternation is useful but not mandatory.
  cost+=current===previous?(gap<.15?1.0:.15):Math.abs(fingerMotion)*.25;
 }
 if(boundary==='TURN')cost+=Math.abs(current-3)*.12;
 // Look one event forward to avoid getting stranded at a turn or ascent.
 if(follow&&!longRest){
  const nextDir=sign(follow.pitch-b.pitch)*dir;
  if(nextDir>0&&current===5)cost+=.55;
  if(nextDir<0&&current===1)cost+=.55;
 }
 if(motion>3.4*handSize&&gap<.12)cost+=(motion-3.4*handSize)*1.8;
 return cost;
}
/**
 * @param {Array<{pitch:number,start:number,duration:number,finger?:number,hand?:string,noteId?:string}>} notes
 * @param {{hand:'RH'|'LH', handSize?:string}} options
 */
export function proposeContextualMonophonicFingering(notes,{hand,handSize='M'}={}){
 if(hand!=='RH'&&hand!=='LH')return bad('HAND_REQUIRED');
 if(!Object.hasOwn(SIZES,handSize))return bad('INVALID_HAND_SIZE');
 if(!Array.isArray(notes)||!notes.length||notes.length>MAX_NOTES)return bad('INVALID_LENGTH');
 const sorted=notes.map((n,index)=>({...n,index}))
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
 for(const n of sorted){
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
   !Number.isFinite(n.start)||n.start<0||
   !Number.isFinite(n.duration)||n.duration<=0)return bad('INVALID_NOTE');
  if(n.hand!=null&&n.hand!==hand)return bad('HAND_CONFLICT');
  if(n.finger!=null&&!isFinger(n.finger))return bad('INVALID_ANCHOR');
 }
 // Independent sounding keys require separate fingers; never treat
 // two held keys as one monophonic line.
 for(let i=1;i<sorted.length;i++)
  if(sorted[i].start<sorted[i-1].start+sorted[i-1].duration-.035)
   return bad('POLYPHONY_UNSUPPORTED');
 const scores=sorted.map(()=>Array(5).fill(Infinity));
 const from=sorted.map(()=>Array(5).fill(-1));
 for(let finger=1;finger<=5;finger++){
  const n=sorted[0];
  if(n.finger!=null&&n.finger!==finger)continue;
  scores[0][finger-1]=blackCost(n.pitch,finger)+Math.abs(finger-3)*.10;
 }
 const width=SIZES[handSize];
 for(let i=1;i<sorted.length;i++){
  const a=sorted[i-1],b=sorted[i];
  const boundary=classifyBoundary(a,b,sorted[i+1]);
  for(let next=1;next<=5;next++){
   if(b.finger!=null&&b.finger!==next)continue;
   for(let prev=1;prev<=5;prev++){
    const prior=scores[i-1][prev-1];
    if(!Number.isFinite(prior))continue;
    const score=prior+transition(a,b,prev,next,hand,width,boundary,sorted[i+1]);
    if(score<scores[i][next-1]-1e-10){
     scores[i][next-1]=score;from[i][next-1]=prev-1;
    }
   }
  }
 }
 const end=scores.at(-1),best=end.reduce((j,c,i)=>c<end[j]?i:j,0);
 if(!Number.isFinite(end[best]))return bad('NO_VALID_PATH');
 const items=new Array(notes.length);
 let finger=best;
 for(let i=sorted.length-1;i>=0;i--){
  const n=sorted[i];
  items[n.index]={pitch:n.pitch,start:n.start,duration:n.duration,
   hand,finger:finger+1,source:n.finger==null?'proposed-contextual':'anchor',
   ...(n.noteId!=null?{noteId:n.noteId}:{})};
  finger=from[i][finger];
 }
 // The audit uses a separate implementation; do not certify solutions
 // using the exact same movement cost that produced them.
 const independent=auditFingeringAssignments(notes,items,{handSize});
 if(!independent.valid)return bad('INDEPENDENT_AUDIT_REJECTED');
 const warnings=[],boundaries=[];
 for(let i=1;i<sorted.length;i++){
  const a=sorted[i-1],b=sorted[i],fa=items[a.index].finger,fb=items[b.index].finger;
  const gap=b.start-a.start-a.duration;
  if(gap>=.8)boundaries.push({afterNoteId:a.noteId??a.index,
   beforeNoteId:b.noteId??b.index,reason:'REST'});
  else if(i+1<sorted.length&&classifyBoundary(a,b,sorted[i+1])==='TURN')
   boundaries.push({atNoteId:b.noteId??b.index,reason:'DIRECTION_CHANGE'});
  if(a.pitch!==b.pitch&&fa===fb&&gap<.22){
   warnings.push({code:a.finger!=null&&b.finger!=null?
    'AUTHOR_ANCHOR_SLIDE_UNVERIFIED':'FAST_SAME_FINGER_REPOSITION_UNVERIFIED',
    fromId:a.noteId??a.index,toId:b.noteId??b.index,
    explicitAuthorPair:a.finger!=null&&b.finger!=null});
  }
 }
 return {ok:true,method:'fg02h-research-mixed-direction-dp',
  strategy:'contextual-mixed-direction',hand,handSize,items,
  totalCost:+end[best].toFixed(5),
  diagnostics:{boundaries,warnings,warningCount:warnings.length},
  expertValidated:false,confidence:null};
}
