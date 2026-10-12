/** FG-03C2B2: multi-note selection on canonical MusicXML events.
 * This is independent of the currently VISIBLE time window. Ctrl+A and
 * Shift ranges include every source event, including off-screen notes.
 */
export function fingerSelectableNotes(song){
 const entries=[];
 if(!song||!Array.isArray(song.tracks))return entries;
 for(let track=0;track<song.tracks.length;track++)
  for(const [index,n] of (song.tracks[track]?.notes||[]).entries()){
   if(typeof n.noteId==='string'&&n.noteId.startsWith('xml:')&&
    Number.isFinite(n.start)&&Number.isInteger(n.pitch))
    entries.push({id:n.noteId,start:n.start,track,index,pitch:n.pitch,note:n});
  }
 entries.sort((a,b)=>a.start-b.start||a.track-b.track||a.index-b.index);
 return entries;
}
export function fingerSelectUpdate(order,selected,id,anchor,{shift=false,toggle=false}={}){
 const ids=order.map(n=>typeof n==='string'?n:n.id);
 if(!ids.includes(id))return {selected:[...selected],anchor};
 if(shift){
  const from=ids.indexOf(ids.includes(anchor)?anchor:id),to=ids.indexOf(id);
  const range=ids.slice(Math.min(from,to),Math.max(from,to)+1);
  const chosen=toggle?new Set([...selected,...range]):new Set(range);
  return {selected:ids.filter(x=>chosen.has(x)),anchor:ids.includes(anchor)?anchor:id};
 }
 if(toggle){
  const chosen=new Set(selected);if(chosen.has(id))chosen.delete(id);else chosen.add(id);
  return {selected:ids.filter(x=>chosen.has(x)),anchor:id};
 }
 return {selected:[id],anchor:id};
}
export function fingerSelectRectangle(boxes,rect,{ids=null}={}){
 const x1=Math.min(rect.x1,rect.x2),x2=Math.max(rect.x1,rect.x2),
       y1=Math.min(rect.y1,rect.y2),y2=Math.max(rect.y1,rect.y2);
 const hit=new Set();
 for(const b of boxes){
  if(b.x+b.w>=x1&&b.x<=x2&&b.y+b.h>=y1&&b.y<=y2&&
   typeof b.n?.noteId==='string'&&(!ids||ids.has(b.n.noteId)))hit.add(b.n.noteId);
 }
 return [...hit];
}
/** Undefined = preserve the effective author/user value.
 * Explicit finger number = assign that finger to all selected notes.
 * Explicit null hand = user requests unknown hand, not silent guessing.
 * Finger null permits a hand-only correction to a note with no finger.
 */
export function fingerBulkChoice(source,previous,{finger,hand}){
 const sourceFinger=source?.fingeringSource==='musicxml'&&
  Number.isInteger(source.finger)&&source.finger>=1&&source.finger<=5?source.finger:null;
 const originalHand=source?.hand==='RH'||source?.hand==='LH'?source.hand:null;
 const prevFinger=previous?previous.finger:sourceFinger;
 const prevHand=previous?previous.hand:originalHand;
 const nextFinger=finger===undefined?prevFinger:finger;
 const nextHand=hand===undefined?prevHand:hand;
 if(!(nextFinger===null||(Number.isInteger(nextFinger)&&nextFinger>=1&&nextFinger<=5))||
  ![null,'RH','LH'].includes(nextHand))return undefined;
 if(nextFinger===sourceFinger&&nextHand===originalHand)return null;
 if(nextFinger===null&&nextHand===null)return null;
 return {finger:nextFinger,hand:nextHand};
}
