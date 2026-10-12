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
  if(!groups.has(tick))groups.set(tick,{start:note.start,notes:[],totalNotes:0});
  const group=groups.get(tick);
  group.totalNotes++;
  if(!Number.isInteger(note.finger)||note.finger<1||note.finger>5||
     (note.source!=='musicxml'&&note.source!=='demo')||
     (note.hand!=null&&note.hand!=='RH'&&note.hand!=='LH'))continue;
  group.notes.push({pitch:note.pitch,start:note.start,duration:note.duration,
   hand:note.hand??null,finger:note.finger,track:note.track,
   source:note.source,...(note.noteId?{noteId:note.noteId}:{})});
 }
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,group])=>({
  ...group,complete:group.notes.length===group.totalNotes
 }));
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
