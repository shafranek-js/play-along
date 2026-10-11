/**
 * FG-02C — independent output audit for research-only finger suggestions.
 * No imports from either optimizer. Evaluates physical-key concurrency
 * constraints, original user/author anchors, and stable hand ownership.
 * Heuristic key spacing is NOT a substitute for a pianist's assessment.
 */
const BLACK_X=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const MAX=[0,2.25,4.4,6.2,7.65];
const SIZES={XXS:.68,XS:.78,S:.88,M:1,L:1.10,XL:1.20,XXL:1.30};
const xpos=p=>Math.floor(p/12)*7+BLACK_X[p%12];
export function auditFingeringAssignments(input,output,{handSize='M'}={}){
 if(!Array.isArray(input)||!Array.isArray(output)||input.length!==output.length)
  return {valid:false,violations:[{code:'OUTPUT_LENGTH_MISMATCH'}]};
 if(!Object.hasOwn(SIZES,handSize))return {valid:false,violations:[{code:'INVALID_HAND_SIZE'}]};
 const problems=[],report=(code,index,other=null)=>problems.push({code,index,...(other===null?{}:{other})});
 const eps=.002;
 for(let i=0;i<input.length;i++){
  const a=input[i],p=output[i];
  if(!p||!['RH','LH'].includes(p.hand)||!Number.isInteger(p.finger)||p.finger<1||p.finger>5){
   report('UNASSIGNED_OR_INVALID_FINGER',i);continue;
  }
  if(a.hand!=null&&a.hand!==p.hand)report('HAND_CHANGED',i);
  if(a.finger!=null&&a.finger!==p.finger)report('ANCHOR_CHANGED',i);
  if(a.pitch!==p.pitch||a.start!==p.start||a.duration!==p.duration)report('MUSIC_EVENT_CHANGED',i);
 }
 for(let i=0;i<input.length;i++)for(let j=i+1;j<input.length;j++){
  const a=input[i],b=input[j],p=output[i],q=output[j];
  if(!p||!q||p.hand!==q.hand||!['RH','LH'].includes(p.hand))continue;
  if(!Number.isInteger(p.finger)||!Number.isInteger(q.finger))continue;
  if(!(a.start<b.start+b.duration-eps&&b.start<a.start+a.duration-eps))continue;
  if(a.pitch===b.pitch){
   if(Math.abs(a.start-b.start)<=.012){
    if(p.finger!==q.finger)report('SAME_KEY_UNISON_SPLIT',i,j);
   }else report('HELD_KEY_REATTACK',i,j);
   continue;
  }
  if(p.finger===q.finger){report('FINGER_REUSED_WHILE_HELD',i,j);continue}
  const lo=a.pitch<b.pitch?[a,p]:[b,q],hi=a.pitch<b.pitch?[b,q]:[a,p];
  const diff=(hi[1].finger-lo[1].finger)*(p.hand==='RH'?1:-1);
  if(diff<=0){report('CROSSING_HELD_FINGERS',i,j);continue}
  const span=xpos(hi[0].pitch)-xpos(lo[0].pitch);
  if(span>MAX[diff]*SIZES[handSize]+.00001)report('STRETCH_EXCEEDS_MODEL',i,j);
 }
 return {valid:problems.length===0,violations:problems};
}
