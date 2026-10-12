/** FG-03C2A — conservative local correction layer, not source mutation.
 * Never interpret this data as evidence that MIDI detected a physical finger.
 * The key is a stable non-cryptographic content fingerprint for accidental
 * collision avoidance; stored entries are rechecked against authored notes.
 */
export function fingerOverrideWorkKey(song){
 if(!song||typeof song.notationXML!=='string'||!song.notationXML.length||
  !Array.isArray(song.tracks))return null;
 const s=song.notationXML;
 let a=2166136261,b=0x811c9dc5;
 for(let i=0;i<s.length;i++){
  const n=s.charCodeAt(i);
  a=Math.imul(a^n,16777619)>>>0;
  b=Math.imul(b^(n+(i&255)),2246822519)>>>0;
 }
 return 'xml:'+s.length+':'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
const safeRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const workPattern=/^xml:[0-9]{1,8}:[a-f0-9]{16}$/;
const notePattern=/^xml:[^\s]{1,240}$/;
export function fingerOverrideValidate(input,{strict=false}={}){
 const result=Object.create(null);
 if(input==null)return result;
 if(!safeRecord(input)||Object.keys(input).length>100){
  if(strict)throw Error('Некорректные исправления аппликатуры');return result;
 }
 let total=0;
 for(const [work,changes] of Object.entries(input)){
  if(!workPattern.test(work)||!safeRecord(changes)||Object.keys(changes).length>500){
   if(strict)throw Error('Некорректная партитура в исправлениях');continue;
  }
  const output=Object.create(null);
  for(const [id,v] of Object.entries(changes)){
   if(++total>10000){if(strict)throw Error('Слишком много исправлений аппликатуры');return result}
   if(!notePattern.test(id)||['__proto__','constructor','prototype'].includes(id)||
     !safeRecord(v)||!Number.isInteger(v.finger)||v.finger<1||v.finger>5||
     !(v.hand===null||v.hand==='RH'||v.hand==='LH')||Object.keys(v).some(k=>!['finger','hand'].includes(k))){
    if(strict)throw Error('Некорректный номер пальца или рука');continue;
   }
   output[id]={finger:v.finger,hand:v.hand};
  }
  if(Object.keys(output).length)result[work]=output;
 }
 return result;
}
export function fingerOverrideEffective(note,change){
 if(!note||!change)return null;
 if(typeof note.noteId!=='string'||!notePattern.test(note.noteId)||
  !Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127)return null;
 if(!Number.isInteger(change.finger)||change.finger<1||change.finger>5||
  !(change.hand===null||change.hand==='LH'||change.hand==='RH'))return null;
 return {finger:change.finger,hand:change.hand,source:'user'};
}
