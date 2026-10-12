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
