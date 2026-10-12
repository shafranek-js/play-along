/** FG-03C2B1: bounded, session-only history of explicit fingering corrections.
 * The persistent source of truth is the validated override map; this stack
 * holds no MusicXML text and must never be imported from untrusted backups.
 */
export const FINGER_HISTORY_LIMIT=40;
export function fingerHistoryEmpty(){return {past:[],future:[]}}
const safeChoice=c=>c===null||(c&&Number.isInteger(c.finger)&&c.finger>=1&&c.finger<=5&&
 ['RH','LH',null].includes(c.hand)&&Object.keys(c).every(k=>['finger','hand'].includes(k)));
export function fingerHistorySame(a,b){
 return a===null&&b===null||!!a&&!!b&&a.finger===b.finger&&a.hand===b.hand;
}
export function fingerHistoryTransition(history,action,record=null){
 const past=history?.past||[],future=history?.future||[];
 if(action==='edit'){
  if(!record||typeof record.id!=='string'||!record.id.startsWith('xml:')||
   !safeChoice(record.before)||!safeChoice(record.after)||
   fingerHistorySame(record.before,record.after))return null;
  const step={id:record.id,before:record.before?{...record.before}:null,
   after:record.after?{...record.after}:null};
  return {history:{past:[...past,step].slice(-FINGER_HISTORY_LIMIT),future:[]},
   step,expected:step.before,value:step.after};
 }
 if(action==='undo'&&past.length){
  const step=past[past.length-1];
  return {history:{past:past.slice(0,-1),future:[...future,step].slice(-FINGER_HISTORY_LIMIT)},
   step,expected:step.after,value:step.before};
 }
 if(action==='redo'&&future.length){
  const step=future[future.length-1];
  return {history:{past:[...past,step].slice(-FINGER_HISTORY_LIMIT),future:future.slice(0,-1)},
   step,expected:step.before,value:step.after};
 }
 return null;
}
