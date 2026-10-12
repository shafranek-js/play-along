/** FG-03C2B3: bounded viewport geometry for a scrollable entire-score editor.
 * No gigantic browser canvas. Long scores only change the scroll spacer.
 */
export function fingerEditorGeometry(notes,{viewWidth,scrollLeft,pxPerSecond=72,minPitch,maxPitch,rowHeight=13}){
 const left=61,top=32;
 const height=top+(maxPitch-minPitch+1)*rowHeight+18;
 const boxes=[];
 const right=scrollLeft+viewWidth;
 for(const note of notes){
  const start=left+note.start*pxPerSecond;
  const width=Math.max(19,note.duration*pxPerSecond);
  if(start+width<scrollLeft-20||start>right+20)continue;
  const y=top+(maxPitch-note.pitch)*rowHeight+1;
  boxes.push({n:note,x:start-scrollLeft,y,w:width,h:Math.max(10,rowHeight-2)});
 }
 return {boxes,left,top,height};
}
export function fingerEditorExtent(notes,pxPerSecond){
 const duration=notes.reduce((m,n)=>Math.max(m,n.start+Math.max(0,n.duration)),0);
 return Math.max(0,Math.ceil(65+duration*pxPerSecond+150));
}
