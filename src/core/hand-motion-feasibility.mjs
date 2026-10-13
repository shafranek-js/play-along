/**
 * FG-03D1: research-only, pure anticipatory hand motion feasibility.
 * NO-GO for learner guidance. No inference, timing edits, or PNG mutations.
 * Trajectories are 2D centroids, not anatomical gestures.
 */
const HANDS=new Set(['LH','RH']);
const MAX_GROUP_NOTES=16;
const MAX_HAND_SPAN=12; // semitones: screening, NOT biomechanical proof
const MAX_TRAVEL_KEYS_PER_SECOND=18; // unvalidated conservative heuristic
const STARTUP_MS=90, ARRIVAL_BUFFER_MS=80, EPS=1e-7;
const bounded=(n,a,b)=>Math.max(a,Math.min(b,n));
const validNumber=n=>typeof n==='number'&&Number.isFinite(n);
const validInteger=n=>Number.isInteger(n);
const validProvenance=n=>(n.source==='musicxml'&&n.verification==='source-author')||
 (n.source==='user'&&n.verification==='user-verified');
const fallback=(kind,reason,extras={})=>({kind,reason,confidence:'none',researchOnly:true,...extras});
const finiteKey=k=>k&&validNumber(k.center)&&validNumber(k.x)&&validNumber(k.w)&&k.w>0&&
 Math.abs(k.center-(k.x+k.w/2))<.01;
const keyAt=(geometry,pitch)=>geometry?.byPitch instanceof Map?geometry.byPitch.get(pitch):undefined;

/** Examine FULL source-onset group, never filter unknown notes out silently. */
function examine(group,hand,geometry,{requireRelease=false}={}){
 if(!group||!Array.isArray(group.notes)||!validNumber(group.onset)||group.onset<0||
  group.notes.length===0||group.notes.length>MAX_GROUP_NOTES||
  group.totalNotes!==group.notes.length)return {error:'incomplete-group'};
 const seenIds=new Set(),selected=[],pending=[];
 for(const note of group.notes){
  if(!note||!validInteger(note.pitch)||note.pitch<0||note.pitch>127||
   typeof note.noteId!=='string'||!note.noteId.trim()||seenIds.has(note.noteId)||
   !HANDS.has(note.hand)||!validInteger(note.finger)||note.finger<1||note.finger>5||
   !validProvenance(note))return {error:'unverified-note'};
  seenIds.add(note.noteId);
  if(note.hand!==hand)continue;
  const k=keyAt(geometry,note.pitch);
  if(!finiteKey(k))return {error:'key-out-of-range'};
  if(note.completed!==undefined&&typeof note.completed!=='boolean')return {error:'invalid-completion'};
  if(requireRelease&&(!validNumber(note.duration)||note.duration<=0))return {error:'release-unknown'};
  selected.push({note,key:k});
  if(note.completed!==true)pending.push({note,key:k});
 }
 if(!selected.length)return {error:'no-hand-notes'};
 const fingers=new Set(),pitches=new Set();
 const ascending=[...selected].sort((a,b)=>a.note.pitch-b.note.pitch);
 for(let i=0;i<ascending.length;i++){
  const {note}=ascending[i];
  if(fingers.has(note.finger)||pitches.has(note.pitch))return {error:'chord-finger-conflict'};
  fingers.add(note.finger);pitches.add(note.pitch);
  if(i&&((hand==='RH'&&ascending[i-1].note.finger>=note.finger)||
         (hand==='LH'&&ascending[i-1].note.finger<=note.finger)))return {error:'chord-finger-order'};
 }
 if(ascending.length>5||ascending.at(-1).note.pitch-ascending[0].note.pitch>MAX_HAND_SPAN)
  return {error:'chord-span-unknown'};
 const center=selected.reduce((sum,e)=>sum+e.key.center,0)/selected.length;
 return {selected,pending,center,medianPitch:(ascending[0].note.pitch+ascending.at(-1).note.pitch)/2,
  keys:pending.map(({note,key})=>({noteId:note.noteId,pitch:note.pitch,hand:note.hand,
    finger:note.finger,x:key.center}))};
}

/**
 * FG-03D1 source-safe visual planning.
 * target: complete canonical group, with isNextUnfinished=true from timeline,
 *   onset, totalNotes, notes with noteId, hand, finger, source+verification.
 * origin: complete source-backed hand group, with original note durations.
 * geometry: production pianoKeyGeometry object (byPitch Map, whites[].w).
 * viewport: {left,right} in the same keyboard canvas coordinate system.
 * transport: {mode,playing,now,speedPercent,leadMs,repositioned?,
 *   oppositeHandClear?,heldNoteIds?,loop?:{enabled,start,end,nextCycle?}}.
 * opposite: optional {origin,target} full verified other-hand groups.
 * No result ever modifies source input or musical events.
 */
export function planAnticipatoryHandMotion({hand,target,origin,geometry,viewport,transport,opposite}={}){
 if(!HANDS.has(hand)||!transport||!geometry||!(geometry.byPitch instanceof Map)||
  !validNumber(viewport?.left)||!validNumber(viewport?.right)||
  viewport.right<=viewport.left||!validNumber(transport.now)||transport.now<0||
  !validNumber(transport.speedPercent)||transport.speedPercent<50||transport.speedPercent>200||
  !validInteger(transport.leadMs)||transport.leadMs<500||transport.leadMs>1000||
  !['listen','tempo','wait'].includes(transport.mode)||
  typeof transport.playing!=='boolean')return fallback('refuse','invalid-configuration');
 if(target?.isNextUnfinished!==true)return fallback('refuse','next-target-unconfirmed');
 const next=examine(target,hand,geometry);
 if(next.error)return fallback('refuse',next.error);
 if(next.pending.length===0)return fallback('refuse','target-complete');
 const pendingKeys=next.keys;
 const staticHint=reason=>fallback('static',reason,{hand,keys:pendingKeys,atX:next.center});
 const markers=reason=>fallback('markers',reason,{hand,keys:pendingKeys});
 if(next.pending.length!==next.selected.length)return markers('partial-wait-chord');
 if(transport.mode==='wait')return staticHint('wait-pending');
 if(!transport.playing||transport.repositioned===true)return staticHint('paused-or-seek');
 let delta=target.onset-transport.now;
 const loop=transport.loop;
 if(loop?.enabled){
  if(!validNumber(loop.start)||!validNumber(loop.end)||loop.end<=loop.start||
    transport.now<loop.start-EPS||transport.now>loop.end+EPS||
    target.onset<loop.start-EPS||target.onset>=loop.end-EPS)return markers('invalid-loop');
  if(delta<=0){
   if(loop.nextCycle!==true)return markers('loop-cycle-unconfirmed');
   delta=loop.end-transport.now+target.onset-loop.start;
  }
 }else if(delta<=0)return markers('target-already-due');
 if(delta<=0)return markers('target-already-due');
 const effectiveTargetOnset=loop?.enabled&&target.onset<=transport.now&&loop.nextCycle===true
  ?target.onset+(loop.end-loop.start):target.onset;
 const remainingMs=delta*1000/(transport.speedPercent/100);
 if(!validNumber(remainingMs)||remainingMs>transport.leadMs)return staticHint('outside-lookahead');
 const visible=k=>k.x>=viewport.left-EPS&&k.x+k.w<=viewport.right+EPS;
 if(next.selected.some(({key})=>!visible(key)))return markers('target-clipped');
 if(!origin)return staticHint('origin-unknown');
 const previous=examine(origin,hand,geometry,{requireRelease:true});
 if(previous.error)return staticHint('origin-'+previous.error);
 if(origin.onset>=effectiveTargetOnset)return markers('nonforward-source-order');
 const lastRelease=Math.max(...previous.selected.map(({note})=>origin.onset+note.duration));
 if(transport.heldNoteIds!==undefined){
  if(!Array.isArray(transport.heldNoteIds)||transport.heldNoteIds.length>MAX_GROUP_NOTES||
   transport.heldNoteIds.some(id=>typeof id!=='string'))return markers('untrusted-held-keys');
  if(transport.heldNoteIds.length)return markers('physical-keys-held');
 }
 if(lastRelease>effectiveTargetOnset+EPS)return markers('held-note-conflict');
 if(lastRelease>transport.now+EPS)return staticHint('origin-still-held');
 if(previous.selected.some(({key})=>!visible(key)))return staticHint('origin-clipped');
 if(opposite!==undefined&&opposite!==null){
  const otherHand=hand==='RH'?'LH':'RH';
  // A matching pitch/finger is not sufficient: the target must be the
  // very same verified score onset, including the same loop iteration.
  if(!opposite.target||Math.abs(opposite.target.onset-target.onset)>EPS||
     opposite.target.isNextUnfinished!==true||
     (opposite.target.iteration??null)!==(target.iteration??null)||
     (opposite.target.loopCycle??null)!==(target.loopCycle??null))
    return markers('crossing-unknown');
  const otherFrom=examine(opposite.origin,otherHand,geometry,{requireRelease:true});
  const otherTo=examine(opposite.target,otherHand,geometry);
  if(otherFrom.error||otherTo.error)return markers('crossing-unknown');
  const expected=target.notes.filter(n=>n.hand===otherHand);
  if(expected.length!==otherTo.selected.length||
   expected.some(n=>!otherTo.selected.some(e=>e.note.noteId===n.noteId&&
    e.note.pitch===n.pitch&&e.note.finger===n.finger)))return markers('crossing-unknown');
  const otherRelease=Math.max(...otherFrom.selected.map(({note})=>opposite.origin.onset+note.duration));
  if(otherRelease>effectiveTargetOnset+EPS)return markers('opposite-held-note');
  if(otherRelease>transport.now+EPS)return markers('opposite-still-held');
  const oldGap=hand==='RH'?previous.center-otherFrom.center:otherFrom.center-previous.center;
  const newGap=hand==='RH'?next.center-otherTo.center:otherTo.center-next.center;
  const whiteWidth=geometry.whites?.[0]?.w;
  if(!validNumber(whiteWidth)||whiteWidth<=0||oldGap<2*whiteWidth||newGap<2*whiteWidth||
     oldGap*newGap<=0)return markers('crossing-or-crowding');
 }else if(target.notes.some(n=>n.hand!==hand))return markers('crossing-unknown');
 else if(transport.oppositeHandClear!==true)return markers('opposite-state-unknown');
 const distanceKeys=Math.abs(previous.medianPitch-next.medianPitch);
 const requiredMs=STARTUP_MS+1000*distanceKeys/MAX_TRAVEL_KEYS_PER_SECOND;
 const availableLeadMs=Math.min(transport.leadMs,
  (effectiveTargetOnset-lastRelease)*1000/(transport.speedPercent/100));
 if(requiredMs+ARRIVAL_BUFFER_MS>availableLeadMs+EPS)return markers('movement-infeasible');
 const deltaX=next.center-previous.center;
 if(Math.abs(deltaX)<.2*(geometry.whites?.[0]?.w||1))return staticHint('no-relocation-needed');
 // A late first call cannot reclaim elapsed travel time. A continuing
 // motion needs the exact identity-bound token from an earlier moving result.
 const motionKey=JSON.stringify([hand,origin.onset,target.onset,
  effectiveTargetOnset,transport.speedPercent,transport.leadMs,
  viewport.left,viewport.right,previous.center,next.center,
  previous.selected.map(x=>[x.note.noteId,x.note.pitch,x.note.finger,x.note.duration]),
  next.selected.map(x=>[x.note.noteId,x.note.pitch,x.note.finger,x.note.completed===true])]);
 const prior=transport.motionContinuation;
 const continuing=prior?.motionKey===motionKey&&
  validNumber(prior.startedAtScore)&&
  prior.startedAtScore>=lastRelease-EPS&&
  prior.startedAtScore<=transport.now+EPS&&
  (effectiveTargetOnset-prior.startedAtScore)*1000/
   (transport.speedPercent/100)+EPS>=requiredMs+ARRIVAL_BUFFER_MS;
 if(remainingMs+EPS<requiredMs+ARRIVAL_BUFFER_MS&&!continuing)
  return markers('movement-infeasible-now');
 const startedAtScore=continuing?prior.startedAtScore:transport.now;
 const progress=bounded(1-remainingMs/availableLeadMs,0,1);
 const phase=progress*progress*(3-2*progress);
 return {kind:'moving',reason:'heuristic-feasible-not-validated',confidence:'screened-only',
  researchOnly:true,hand,keys:pendingKeys,
  fromX:previous.center,toX:next.center,x:previous.center+deltaX*phase,
  phase,remainingMs,requiredMs,availableLeadMs,distanceKeys,arrivalAtScore:target.onset,
  timing:'visual-only',motionContinuation:{motionKey,startedAtScore}};
}