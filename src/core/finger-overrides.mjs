/** FG-03C2A — conservative local correction layer, not source mutation.
 * Never interpret this data as evidence that MIDI detected a physical finger.
 * The key is a stable non-cryptographic content fingerprint for accidental
 * collision avoidance; stored entries are rechecked against authored notes.
 */
// Only the original, already parsed MIDI input may mint this key. It is
// independent of filename/library ID and never inferred from note pitches
// or timeline positions. Short/oversized input cannot persist corrections.
export function fingerMidiWorkKey(song,raw){
 const bytes=raw instanceof Uint8Array?raw:
  raw instanceof ArrayBuffer?new Uint8Array(raw):null;
 if(song?.format!=='MIDI'||!Array.isArray(song.tracks)||!bytes||
    bytes.length<22||bytes.length>4000000||
    String.fromCharCode(...bytes.slice(0,4))!=='MThd')return null;
 const notes=song.tracks.flatMap(t=>t.notes||[]);
 if(!notes.length||notes.length>30000||
    notes.some(n=>typeof n.noteId!=='string'||!/^midi:[0-9]{1,5}:[0-9]{1,8}$/.test(n.noteId)||
      !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
      !Number.isFinite(n.start)||n.start<0))return null;
 if(new Set(notes.map(n=>n.noteId)).size!==notes.length)return null;
 let a=2166136261,b=0x811c9dc5;
 for(let i=0;i<bytes.length;i++){
  const n=bytes[i];
  a=Math.imul(a^n,16777619)>>>0;
  b=Math.imul(b^(n+(i&255)),2246822519)>>>0;
 }
 return 'mid:'+bytes.length+':'+a.toString(16).padStart(8,'0')+
  b.toString(16).padStart(8,'0');
}
export function fingerOverrideWorkKey(song){
 if(song?.format==='MIDI')return Object.hasOwn(song,'midiFingerWorkKey')&&
  /^mid:[0-9]{1,8}:[a-f0-9]{16}$/.test(song.midiFingerWorkKey)&&
  Array.isArray(song.tracks)?song.midiFingerWorkKey:null;
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
const workPattern=/^(?:xml|mid):[0-9]{1,8}:[a-f0-9]{16}$/;
const notePattern=/^(?:xml:[^\s]{1,240}|midi:[0-9]{1,5}:[0-9]{1,8})$/;
export function fingerOverrideValidate(input,{strict=false}={}){
 const result=Object.create(null);
 if(input==null)return result;
 if(!safeRecord(input)||Object.keys(input).length>100){
  if(strict)throw Error('Некорректные исправления аппликатуры');return result;
 }
 let total=0;
 for(const [work,changes] of Object.entries(input)){
  if(!workPattern.test(work)||!safeRecord(changes)||Object.keys(changes).length>30000){
   if(strict)throw Error('Некорректная партитура в исправлениях');continue;
  }
  const output=Object.create(null);
  for(const [id,v] of Object.entries(changes)){
   if(++total>30000){if(strict)throw Error('Слишком много исправлений аппликатуры');return result}
   if(!notePattern.test(id)||!id.startsWith(work.startsWith('mid:')?'midi:':'xml:')||
     ['__proto__','constructor','prototype'].includes(id)||
     !safeRecord(v)||!(v.finger===null||Number.isInteger(v.finger)&&v.finger>=1&&v.finger<=5)||
     (v.finger===null&&v.hand===null&&v.suppressAuthor!==true)||
     !(v.hand===null||v.hand==='RH'||v.hand==='LH')||
     (Object.hasOwn(v,'suppressAuthor')&&v.suppressAuthor!==true)||
     Object.keys(v).some(k=>!['finger','hand','suppressAuthor'].includes(k))){
    if(strict)throw Error('Некорректный номер пальца или рука');continue;
   }
   output[id]={finger:v.finger,hand:v.hand,
    ...(v.suppressAuthor===true?{suppressAuthor:true}:{})};
  }
  if(Object.keys(output).length)result[work]=output;
 }
 return result;
}
export function fingerOverrideEffective(note,change){
 if(!note||!change)return null;
 if(typeof note.noteId!=='string'||!notePattern.test(note.noteId)||
  !Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127)return null;
 if(!(change.finger===null||Number.isInteger(change.finger)&&change.finger>=1&&change.finger<=5)||
  (change.finger===null&&change.hand===null&&change.suppressAuthor!==true)||
  !(change.hand===null||change.hand==='LH'||change.hand==='RH')||
  (Object.hasOwn(change,'suppressAuthor')&&
   change.suppressAuthor!==true))return null;
 return {finger:change.finger,hand:change.hand,source:'user',
  ...(change.suppressAuthor===true?{suppressAuthor:true}:{})};
}

/**
 * Accepted PianoMotion digits are durable user decisions, not raw solver
 * proposals or authored notation. Store only exact source-note identities.
 * Original MIDI bytes / MusicXML provide the independent work fingerprint.
 */
export function fingerAcceptedValidate(input,{strict=false}={}){
 const result=Object.create(null);
 if(input==null)return result;
 if(!safeRecord(input)||Object.keys(input).length>100){
  if(strict)throw Error('Некорректная сохранённая аппликатура');
  return result;
 }
 let total=0;
 for(const [work,entries] of Object.entries(input)){
  if(!workPattern.test(work)||!safeRecord(entries)||Object.keys(entries).length>30000){
   if(strict)throw Error('Некорректная сохранённая партитура');
   continue;
  }
  const kept=Object.create(null);
  for(const [id,entry] of Object.entries(entries)){
   if(++total>30000){
    if(strict)throw Error('Слишком много сохранённых пальцев');
    return result;
   }
   if(!notePattern.test(id)||!id.startsWith(work.startsWith('mid:')?'midi:':'xml:')||
      !safeRecord(entry)||Object.keys(entry).some(k=>!['pitch','start','duration','finger','hand'].includes(k))||
      !Number.isInteger(entry.pitch)||entry.pitch<0||entry.pitch>127||
      typeof entry.start!=='number'||!Number.isFinite(entry.start)||entry.start<0||entry.start>864000||
      typeof entry.duration!=='number'||!Number.isFinite(entry.duration)||entry.duration<0||entry.duration>864000||
      !Number.isInteger(entry.finger)||entry.finger<1||entry.finger>5||
      !['LH','RH'].includes(entry.hand)){
    if(strict)throw Error('Некорректная принятая аппликатура');
    continue;
   }
   kept[id]={pitch:entry.pitch,start:entry.start,duration:entry.duration,
    finger:entry.finger,hand:entry.hand};
  }
  if(Object.keys(kept).length)result[work]=kept;
 }
 return result;
}
export function fingerAcceptedSnapshot(song){
 const key=fingerOverrideWorkKey(song);
 if(!key)return null;
 const entries=Object.create(null);
 for(const note of song.tracks.flatMap(t=>t.notes||[])){
  if(note.fingeringSource!=='pianomotion'||!notePattern.test(note.noteId||'')||
     !Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
     !Number.isFinite(note.start)||note.start<0||
     !Number.isFinite(note.duration)||note.duration<0||
     !Number.isInteger(note.finger)||note.finger<1||note.finger>5||
     !['LH','RH'].includes(note.hand))continue;
  entries[note.noteId]={pitch:note.pitch,start:note.start,duration:note.duration,
   finger:note.finger,hand:note.hand};
 }
 return {key,entries};
}
export function fingerAcceptedRestore(song,input){
 const key=fingerOverrideWorkKey(song),entries=key&&input?.[key];
 if(!key||!entries)return 0;
 const byId=new Map();
 for(const n of song.tracks.flatMap(t=>t.notes||[])){
  if(typeof n.noteId!=='string'||byId.has(n.noteId))return 0;
  byId.set(n.noteId,n);
 }
 // Fail closed on any stale note identity or altered musical content. Applied
 // annotations may never change the original notes or author-supplied digits.
 const patches=[];
 for(const [id,v] of Object.entries(entries)){
  const note=byId.get(id);
  if(!note||!v||note.pitch!==v.pitch||note.start!==v.start||
      note.duration!==v.duration||note.finger!=null||
      note.fingeringSource!=null||
      note.hand!=null&&note.hand!==v.hand)return 0;
  patches.push({note,entry:v});
 }
 for(const {note,entry} of patches){
  note.finger=entry.finger;note.hand=entry.hand;
  note.fingeringSource='pianomotion';
 }
 return patches.length;
}
