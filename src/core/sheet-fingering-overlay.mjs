/** FG-03C2B3: annotation-only MusicXML clone for the score renderer.
 * All score-note IDs are recomputed using the SAME source-ordinal contract
 * as readMusicXML, and checked against all expected playback/tie segments.
 * On any uncertainty we return the untouched original, not a guess.
 */
const direct=(node,name)=>[...(node?.children||[])].find(x=>x.localName===name)||null;
const directAll=(node,name)=>[...(node?.children||[])].filter(x=>x.localName===name);
const textOf=(node,name,or='')=>direct(node,name)?.textContent?.trim()??String(or);
const noteNumber=n=>Number.isInteger(n)&&n>=0&&n<=127;
export function sheetFingeringOverlay(song,changes,{parse,serialize,exportMode=false}={}){
 const original=song?.notationXML;
 const fail=reason=>({xml:original||'',status:'skipped',count:0,handOnly:0,reason});
 if(typeof original!=='string'||song?.format!=='MusicXML'||!Array.isArray(song.tracks))
  return fail('Not a source MusicXML score');
 if(!changes||!Object.keys(changes).length)
  return {xml:original,status:'none',count:0,handOnly:0,reason:null};
 if(typeof parse!=='function'||typeof serialize!=='function')
  return fail('XML parser unavailable');
 const playable=new Map();
 for(const track of song.tracks)for(const note of track.notes||[]){
  if(!noteNumber(note.pitch)||typeof note.noteId!=='string'||!note.sourceNoteIds?.length)
   return fail('Source note is missing stable identity');
  for(const id of note.sourceNoteIds){
   if(playable.has(id))return fail('Duplicate source-note identities');
   playable.set(id,note);
  }
 }
 // All correction IDs must resolve to this exact imported score.
 for(const [id,c] of Object.entries(changes)){
  if(!playable.has(id)||!c||
   !(c.finger===null||Number.isInteger(c.finger)&&c.finger>=1&&c.finger<=5)||
   ![null,'LH','RH'].includes(c.hand)||(c.finger===null&&c.hand===null)||
   Object.keys(c).some(k=>!['finger','hand'].includes(k)))
   return fail('Invalid or unrecognized corrected note');
 }
 const doc=parse(original);
 if(!doc?.documentElement||doc.querySelector('parsererror')||
    doc.documentElement.localName!=='score-partwise')return fail('Invalid score XML');
 const found=new Set(), pending=[];
 const parts=directAll(doc.documentElement,'part');
 for(const [partIndex,part] of parts.entries()){
  const partId=part.getAttribute('id')||'part';let ordinal=0,transpose=0;
  for(const [measureIndex,measure] of directAll(part,'measure').entries()){
   for(const el of [...measure.children]){
    if(el.localName==='attributes'){
     const tr=direct(el,'transpose');
     if(tr)transpose=(Number(textOf(tr,'chromatic',0))||0)+
      12*(Number(textOf(tr,'octave-change',0))||0);
     continue;
    }
    if(el.localName!=='note'||direct(el,'rest')||direct(el,'grace'))continue;
    const pitch=direct(el,'pitch');if(!pitch)continue;
    const step=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[textOf(pitch,'step','C')];
    const value=step+Number(textOf(pitch,'alter','0'))+
     (Number(textOf(pitch,'octave','4'))+1)*12+transpose;
    if(!noteNumber(value))continue; // identical playable-note gate to importer
    const id=musicXmlSourceNoteId(partId,partIndex,measureIndex,++ordinal);
    if(found.has(id))return fail('Duplicate reconstructed note');
    const source=playable.get(id);
    if(!source||source.pitch!==value||
     (source.partId||'part')!==partId||
     (source.voice||'1')!==textOf(el,'voice','1')||
     (source.staff||'1')!==textOf(el,'staff','1'))
     return fail('Source note, voice or pitch differs from visible MusicXML');
    found.add(id);
    // Only the first written segment of a tie receives its corrected number.
    const correction=changes[source.noteId];
    if(correction&&id===source.noteId)pending.push({node:el,value:correction.finger});
   }
  }
 }
 if(found.size!==playable.size||[...playable.keys()].some(id=>!found.has(id)))
  return fail('Incomplete note/measure correspondence');
 // Verified first; only now modify the detached DOM. The import is pristine.
 let count=0,handOnly=0;
 for(const {node,value} of pending){
  if(value===null){handOnly++;continue}
  const ns=node.namespaceURI,create=name=>ns?doc.createElementNS(ns,name):doc.createElement(name);
  let notations=direct(node,'notations');
  if(!notations){
   notations=create('notations');
   const before=directAll(node,'lyric')[0]||null;
   node.insertBefore(notations,before);
  }
  let technical=direct(notations,'technical');
  if(!technical){technical=create('technical');notations.append(technical)}
  for(const child of directAll(technical,'fingering'))technical.removeChild(child);
  const finger=create('fingering');
  if(!exportMode){finger.setAttribute('color','#C77D28');finger.setAttribute('placement','above');}
  finger.textContent=String(value);
  technical.append(finger);
  // Export mode is notation-only: never inject display-specific noteheads
  // or recolor existing author notation in a user-downloaded score.
  if(exportMode){count++;continue}
  // A colored notehead additionally differentiates user numbering from
  // ordinary author digits even where OSMD ignores fingering XML color.
  let head=direct(node,'notehead');
  if(!head){
   head=create('notehead');head.textContent='normal';
   const following=[...node.children].find(c=>['staff','beam','notations','lyric','play','listen'].includes(c.localName));
   node.insertBefore(head,following||null);
  }
  head.setAttribute('color','#C77D28');
  count++;
 }
 // OSMD 2.2.0's load(string) requires a leading XML declaration.
 // XMLSerializer(Document) normally omits the original XML declaration even
 // when the imported source contains one, so restore it for the DISPLAY
 // CLONE ONLY. Never modify song.notationXML or downloaded content.
 const serialized=serialize(doc);
 const rendered=/^\s*<\?xml\b/i.test(serialized)?serialized:
  '<?xml version="1.0" encoding="utf-8"?>\n'+serialized;
 return {xml:rendered,status:'applied',count,handOnly,reason:null};
}
