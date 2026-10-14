/**
 * LAUNCH-02: presentation-only easing between a resting and a working
 * original PNG hand pose. It never changes score-note NoteOn/NoteOff, finger
 * identity, audio, Wait scoring or fixed key target badges.
 *
 * A transition starts ONLY on a rest <-> pressed/instructional pose switch.
 * Geometry/author-provenance changes without a rest switch snap to the new
 * authoritative pose rather than simulating an invented physical movement.
 */
const lerp=(a,b,t)=>a+(b-a)*t;
const transitionable=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
 Number.isFinite(p.width)&&Number.isFinite(p.height)&&p.width>0&&p.height>0&&
 typeof p.pose==='string'&&p.pose.length>0;
function single(p){
 return p?[{placement:p,x:p.x,y:p.y,alpha:p.pose==='rest'?.70:.87}]:[];
}
function same(a,b){
 return !!a&&!!b&&a.pose===b.pose&&Math.abs(a.x-b.x)<.05&&
  Math.abs(a.y-b.y)<.05&&Math.abs(a.width-b.width)<.05&&
  Math.abs(a.height-b.height)<.05;
}
export function fingerGuidanceHandTransition(previous,target,nowMs,{
 durationMs=200,reset=false
}={}){
 const next=transitionable(target)?target:null;
 const present=transitionable(previous?.target)?previous.target:null;
 const instant={state:next?{target:next,from:null,startedMs:null}:null,
  layers:single(next),moving:false,progress:1};
 if(reset||!Number.isFinite(nowMs)||durationMs<=0||!present||!next)return instant;
 const changed=!same(present,next);
 if(changed){
  // Require one REST endpoint. A partial / unknown chord is not evidence
  // for a plausible animated fingering between two arbitrary finger poses.
  if((present.pose==='rest')===(next.pose==='rest'))return instant;
  const transition={target:next,from:present,startedMs:nowMs};
  return fingerGuidanceHandTransition(transition,next,nowMs,{durationMs});
 }
 const from=transitionable(previous?.from)?previous.from:null;
 if(!from||!Number.isFinite(previous.startedMs))return instant;
 const fraction=Math.max(0,Math.min(1,(nowMs-previous.startedMs)/durationMs));
 if(fraction>=1)return instant;
 const ease=fraction*fraction*(3-2*fraction);
 const cx=lerp(from.x+from.width/2,next.x+next.width/2,ease);
 const cy=lerp(from.y,next.y,ease);
 const release=from.pose!=='rest'&&next.pose==='rest';
 const previousAlpha=(release?.18:.70)*(1-ease);
 const targetAlpha=(next.pose==='rest'?.50:.50)+(next.pose==='rest'?.20:.37)*ease;
 return {
  state:{target:next,from,startedMs:previous.startedMs},
  layers:[
   {placement:from,x:cx-from.width/2,y:cy,alpha:previousAlpha},
   {placement:next,x:cx-next.width/2,y:cy,alpha:targetAlpha}
  ],
  moving:true,progress:ease
 };
}
