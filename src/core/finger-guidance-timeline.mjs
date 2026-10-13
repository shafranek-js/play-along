/**
 * FG-03A: score-complete, provenance-safe timeline for visual finger guidance.
 *
 * Preserve every valid score onset, even when no authoritative finger is
 * available. Otherwise the player can show a later annotated position while
 * an earlier unannotated note/chord is the next musical task.
 *
 * This does NOT infer finger numbers or hand identity. Only explicit
 * MusicXML author marks and bundled, identified demo fingering may be shown.
 * The function is pure and deterministic for the same input event order.
 */
export function fingerGuidanceTimeline(events){
 if(!Array.isArray(events))return [];
 const groups=new Map();
 for(const note of events){
  if(!note||!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
     !Number.isFinite(note.start)||note.start<0||
     !Number.isFinite(note.duration)||note.duration<=0)continue;
  // Match the practice UI's millisecond score-onset bucketing.
  const tick=Math.round(note.start*1000);
  if(!groups.has(tick))groups.set(tick,{start:note.start,notes:[],totalNotes:0,idCounts:new Map()});
  const group=groups.get(tick);
  group.totalNotes++;
  // Count IDs for ALL valid source events, including those without fingers.
  // Otherwise a marked note can impersonate an unmarked simultaneous note.
  if(typeof note.noteId==='string'&&note.noteId.trim())
   group.idCounts.set(note.noteId,(group.idCounts.get(note.noteId)||0)+1);
  if(!Number.isInteger(note.finger)||note.finger<1||note.finger>5||
     (note.source!=='musicxml'&&note.source!=='demo'&&note.source!=='user')||
     (note.hand!=null&&note.hand!=='RH'&&note.hand!=='LH'))continue;
  group.notes.push({pitch:note.pitch,start:note.start,duration:note.duration,
   hand:note.hand??null,finger:note.finger,track:note.track,
   source:note.source,...(note.noteId?{noteId:note.noteId}:{})});
 }
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,group])=>{
  // Never show source-ambiguous finger positions as a complete chord.
  // Preserve the original onset and totalNotes; don't alter score playback.
  const notes=group.notes.filter(n=>!n.noteId||group.idCounts.get(n.noteId)===1);
  return {start:group.start,notes,totalNotes:group.totalNotes,
   complete:notes.length===group.totalNotes};
 });
}

/**
 * FG-03B: presentation-only secondary Ghost preview schedule.
 * Musical events remain in score seconds, whereas lookahead is wall-clock
 * milliseconds; the user's tempo multiplier converts between them.
 * A stopped Wait task never receives a premature second-hand target.
 * Wrapped loop events refer to the NEXT cycle, not a past onset.
 * This function does not assign fingers or modify playback state.
 */
export function fingerGuidanceGhostWindow({
 nextOnset,now,leadMs=750,speedPercent=100,mode='listen',loop=null
}={}){
 const hidden={visible:false,remainingMs:null,alpha:0};
 if(mode==='wait'||!['listen','tempo'].includes(mode)||
  !Number.isFinite(nextOnset)||!Number.isFinite(now)||now<0||
  !Number.isInteger(leadMs)||leadMs<500||leadMs>1000||
  !Number.isFinite(speedPercent)||speedPercent<25||speedPercent>150)return hidden;
 let delta=nextOnset-now;
 if(loop?.enabled){
  const {start,end}=loop;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
   now<start-.001||now>end+.001||nextOnset<start-.001||nextOnset>=end+.001)return hidden;
  if(delta<=0)delta=end-now+nextOnset-start;
 }
 if(delta<=0)return hidden;
 const remainingMs=delta*1000/(speedPercent/100);
 if(remainingMs>leadMs+1e-6)return {visible:false,remainingMs:Math.round(remainingMs),alpha:0};
 const progress=Math.max(0,Math.min(1,1-remainingMs/leadMs));
 return {visible:true,remainingMs:Math.round(remainingMs),
  alpha:Math.round((.10+.25*progress)*1000)/1000};
}

/**
 * FG-03B2: purely geometric preview movement between two already AUTHORED
 * positions. This is a two-dimensional PNG translation, NOT joint motion.
 *
 * Returns markers-only for ambiguous crossing, invalid/off-screen sprites,
 * or close positions. Future target key markers remain pinned to keyboard
 * geometry while an otherwise valid translucent sprite travels between poses.
 * No stale frame state is retained: Pause / Seek / Loop / resize recalculate.
 */
export function fingerGuidanceHandsCross(fromLH,fromRH,toLH,toRH){
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.width)&&
  Number.isFinite(p.unit)&&p.width>0&&p.unit>0;
 if(![fromLH,fromRH,toLH,toRH].every(valid))return false;
 const center=p=>p.x+p.width/2;
 const old=center(fromRH)-center(fromLH),next=center(toRH)-center(toLH);
 const minGap=1.25*Math.max(fromLH.unit,fromRH.unit,toLH.unit,toRH.unit);
 return old*next<0||Math.abs(old)<minGap||Math.abs(next)<minGap;
}
export function fingerGuidanceMotionPlan({
 from,to,remainingMs,leadMs=750,canvasWidth,playing=true,crossing=false
}={}){
 const markers={kind:'markers',x:null,progress:0};
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.width)&&
  Number.isFinite(p.unit)&&p.width>0&&p.unit>0;
 if(!valid(to)||!Number.isFinite(canvasWidth)||canvasWidth<=0||
  !Number.isFinite(remainingMs)||remainingMs<0||
  !Number.isFinite(leadMs)||leadMs<=0||remainingMs>leadMs||
  crossing)return markers;
 const visibleRatio=x=>Math.max(0,Math.min(canvasWidth,x+to.width)-Math.max(0,x))/to.width;
 if(visibleRatio(to.x)<.65)return markers;
 const targetCenter=to.x+to.width/2;
 if(!valid(from))return {kind:'static',x:to.x,progress:1,targetCenter};
 const sourceCenter=from.x+from.width/2;
 const startX=sourceCenter-to.width/2;
 const distance=Math.abs(sourceCenter-targetCenter);
 if(distance<=to.unit*1.35)return markers;
 // The future pose may be wider than the prior pose; on a cropped piano
 // viewport, avoid showing a false fingertip offset by shifting/clamping.
 if(visibleRatio(startX)<.65)return {kind:'static',x:to.x,progress:1,targetCenter};
 if(!playing)return {kind:'static',x:to.x,progress:1,targetCenter};
 const t=Math.max(0,Math.min(1,1-remainingMs/leadMs));
 const progress=t*t*(3-2*t);
 return {kind:'moving',x:startX+(to.x-startX)*progress,
  progress,targetCenter,sourceCenter};
}
