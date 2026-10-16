/** FG-03C2B2: bounded, session-only history of explicit fingering.
 * One multi-note operation is ONE atomic undo/redo step.
 */
export const FINGER_HISTORY_LIMIT=40;
export function fingerHistoryEmpty(){return {past:[],future:[]}}
const safeChoice=c=>c===null||(c&&
 (c.finger===null||Number.isInteger(c.finger)&&c.finger>=1&&c.finger<=5)&&
 ['RH','LH',null].includes(c.hand)&&
 !(c.finger===null&&c.hand===null&&c.suppressAuthor!==true)&&
 (!Object.hasOwn(c,'suppressAuthor')||
  c.suppressAuthor===true&&c.finger===null)&&
 Object.keys(c).every(k=>['finger','hand','suppressAuthor'].includes(k)));
export function fingerHistorySame(a,b){
 return a===null&&b===null||!!a&&!!b&&a.finger===b.finger&&a.hand===b.hand&&
  (a.suppressAuthor===true)===(b.suppressAuthor===true);
}
function isRecord(record){
 return !!record&&typeof record.id==='string'&&record.id.startsWith('xml:')&&
 safeChoice(record.before)&&safeChoice(record.after);
}
function changesFor(step,action){
 const records=step.entries||[step];
 return records.map(e=>({id:e.id,expected:action==='undo'?e.after:e.before,
  value:action==='undo'?e.before:e.after}));
}
export function fingerHistoryTransition(history,action,record=null){
 const past=history?.past||[],future=history?.future||[];
 if(action==='edit'||action==='batch'){
  const raw=action==='batch'?record?.entries:[record];
  if(!Array.isArray(raw)||!raw.length||raw.length>30000)return null;
  if(raw.some(e=>!isRecord(e)))return null;
  const useful=raw.filter(e=>!fingerHistorySame(e.before,e.after));
  if(!useful.length||new Set(useful.map(e=>e.id)).size!==useful.length)return null;
  const clone=e=>({id:e.id,before:e.before?{...e.before}:null,
   after:e.after?{...e.after}:null});
  const entries=useful.map(clone);
  const step=action==='edit'?entries[0]:{entries};
  return {history:{past:[...past,step].slice(-FINGER_HISTORY_LIMIT),future:[]},
   step,expected:step.before,value:step.after,
   changes:changesFor(step,'redo')};
 }
 if(action==='undo'&&past.length){
  const step=past[past.length-1];
  return {history:{past:past.slice(0,-1),future:[...future,step].slice(-FINGER_HISTORY_LIMIT)},
   step,expected:step.after,value:step.before,changes:changesFor(step,'undo')};
 }
 if(action==='redo'&&future.length){
  const step=future[future.length-1];
  return {history:{past:[...past,step].slice(-FINGER_HISTORY_LIMIT),future:future.slice(0,-1)},
   step,expected:step.before,value:step.after,changes:changesFor(step,'redo')};
 }
 return null;
}
