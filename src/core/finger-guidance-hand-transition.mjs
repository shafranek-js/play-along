/**
 * LAUNCH-02: presentation-only easing between a resting and a working
 * original PNG hand pose. It never changes score-note NoteOn/NoteOff, finger
 * identity, audio, Wait scoring or fixed key target badges.
 *
 * Rest <-> contact uses an easing crossfade. In active Listen only, a nearby
 * active-to-active switch can retain a brief low-opacity previous silhouette
 * while the new source-registered contact sprite is immediately fully visible.
 * No old finger is portrayed as still pressing after source NoteOff.
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
 durationMs=200,activeDurationMs=120,allowActiveReposition=false,reset=false
}={}){
 const next=transitionable(target)?target:null;
 const present=transitionable(previous?.target)?previous.target:null;
 const instant={state:next?{target:next,from:null,startedMs:null}:null,
  layers:single(next),moving:false,progress:1};
 if(reset||!Number.isFinite(nowMs)||durationMs<=0||!present||!next)return instant;
 const changed=!same(present,next);
 if(changed){
  const fromRest=present.pose==='rest',toRest=next.pose==='rest';
  const activeSwitch=!fromRest&&!toRest;
  // Only nearby, source-registered positions in active Listen may leave a
  // harmless visual movement trail. Never invent long jumps/cross-hand paths.
  if(activeSwitch){
   const dx=Math.abs(present.x+present.width/2-next.x-next.width/2);
   const dy=Math.abs(present.y-next.y);
   if(!allowActiveReposition||present.hand!==next.hand||
    !Number.isFinite(activeDurationMs)||activeDurationMs<=0||
    dx>Math.min(present.width,next.width)*1.25||
    dy>Math.min(present.height,next.height)*.35)return instant;
  }
  const transition={target:next,from:present,startedMs:nowMs,
   kind:activeSwitch?'active':'rest'};
  return fingerGuidanceHandTransition(transition,next,nowMs,
   {durationMs,activeDurationMs,allowActiveReposition});
 }
 const from=transitionable(previous?.from)?previous.from:null;
 if(!from||!Number.isFinite(previous.startedMs))return instant;
 const active=previous.kind==='active';
 if(active&&!allowActiveReposition)return instant;
 const interval=active?activeDurationMs:durationMs;
 if(!Number.isFinite(interval)||interval<=0)return instant;
 const fraction=Math.max(0,Math.min(1,(nowMs-previous.startedMs)/interval));
 if(fraction>=1)return instant;
 const ease=fraction*fraction*(3-2*fraction);
 if(active){
  // The target is displayed at its final score-derived position and normal
  // opacity from the very first NoteOn frame. Only the OLD sprite travels as
  // a faint 120ms trace; contact cues never lag behind the musical timeline.
  return {state:previous,layers:[
   {placement:from,x:lerp(from.x,next.x,ease),
    y:lerp(from.y,next.y,ease),alpha:.12*(1-ease)},
   {placement:next,x:next.x,y:next.y,alpha:.87}
  ],moving:true,progress:ease};
 }
 const cx=lerp(from.x+from.width/2,next.x+next.width/2,ease);
 const cy=lerp(from.y,next.y,ease);
 const release=from.pose!=='rest'&&next.pose==='rest';
 const previousAlpha=(release?.18:.70)*(1-ease);
 const targetAlpha=(next.pose==='rest'?.50:.50)+(next.pose==='rest'?.20:.37)*ease;
 return {
  state:previous,
  layers:[
   {placement:from,x:cx-from.width/2,y:cy,alpha:previousAlpha},
   {placement:next,x:cx-next.width/2,y:cy,alpha:targetAlpha}
  ],
  moving:true,progress:ease
 };
}
