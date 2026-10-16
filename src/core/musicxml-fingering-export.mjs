/** FG-03C2B4 — opt-in export of verified numeric USER corrections.
 * Never changes the loaded MusicXML, its source note IDs or original MIDI.
 * No automatic generated fingering, hand-only metadata or silent score edits.
 *
 * The caller supplies trusted existing browser parse/serialize, original
 * readMusicXML importer, structural checker, and source-verified overlay.
 * All operations run locally, without a backend or third-party XML code.
 */
const directChild=(parent,name)=>[...(parent?.children||[])].find(x=>x.localName===name)||null;
const noteSignature=song=>{
 if(!Array.isArray(song?.tracks))return null;
 const notes=song.tracks.flatMap(t=>t.notes||[]);
 if(!notes.length||notes.length>25000)return null;
 return notes.map(n=>({
  id:n.noteId,segments:[...(n.sourceNoteIds||[])],pitch:n.pitch,
  start:n.start,duration:n.duration,velocity:n.velocity,
  channel:n.channel,partId:n.partId,sourceTrack:n.sourceTrack,
  staff:n.staff,voice:n.voice,instrumentId:n.instrumentId,isDrum:n.isDrum
 }));
};
const eventsSignature=song=>Array.isArray(song?.audioEvents)
 ?song.audioEvents.map(e=>({
  type:e.type,time:e.time,channel:e.channel,track:e.track,
  sourceTrack:e.sourceTrack,noteId:e.noteId,pitch:e.pitch,
  velocity:e.velocity,controller:e.controller,value:e.value,
  program:e.program,bankMSB:e.bankMSB,bankLSB:e.bankLSB,isDrum:e.isDrum
 })):null;
const xmlHeader=xml=>/^\s*<\?xml\b/i.test(xml)?xml:
 '<?xml version="1.0" encoding="utf-8"?>\n'+xml;

export function musicXmlCorrectedExport(song,changes,{
 parse,serialize,reimport,compareStructure,overlay
}={}){
 const reject=reason=>({status:'rejected',reason,xml:null,count:0,handOnly:0});
 if(song?.format!=='MusicXML'||typeof song.notationXML!=='string')
  return reject('Export requires an original imported MusicXML score');
 // The editor operates on expanded repeated-score IDs. A repeat-aware
 // written-score export requires separate verified source↔playback mapping.
 if(song.originalNotationXML)return reject('Expanded repeats require a separate source-identity export review');
 if(!changes||typeof changes!=='object'||!Object.keys(changes).length)
  return reject('No user corrections to export');
 if([parse,serialize,reimport,compareStructure,overlay].some(fn=>typeof fn!=='function'))
  return reject('Original-score verification tools are unavailable');
 const sourceNotes=noteSignature(song),sourceEvents=eventsSignature(song);
 if(!sourceNotes||!sourceEvents)return reject('Source music identity is incomplete');
 let changed;
 try{
  changed=overlay(song,changes,{parse,serialize,exportMode:true});
  if(changed.status!=='applied')return reject(changed.reason||'Source-note verification failed');
  if(!changed.count&&!changed.suppressed)
   return reject('Only hand changes present; MusicXML finger numbers would be unchanged');
  if(changed.xml.length>15e6)return reject('Export exceeds the safe MusicXML size bound');
  if(compareStructure(song.notationXML,{parse})!==compareStructure(changed.xml,{parse}))
   return reject('Score structure differs outside fingering annotations');
  const roundtrip=reimport(changed.xml,'play-along-user-fingering.musicxml');
  if(JSON.stringify(noteSignature(roundtrip))!==JSON.stringify(sourceNotes)||
     JSON.stringify(eventsSignature(roundtrip))!==JSON.stringify(sourceEvents))
   return reject('Reimport changed original source notes or MIDI events');
 }catch(error){return reject('MusicXML verification failed: '+(error?.message||String(error)))}

 // Mark the downloaded FILE, not the original author score. This marker is
 // explicitly descriptive, not cryptographic proof of the editor's operator.
 try{
  const doc=parse(changed.xml);
  const root=doc?.documentElement;
  if(!root||root.localName!=='score-partwise'||doc.getElementsByTagName('parsererror').length)
   return reject('Invalid exported MusicXML');
  const create=name=>root.namespaceURI?doc.createElementNS(root.namespaceURI,name):doc.createElement(name);
  let identification=directChild(root,'identification');
  if(!identification){
   identification=create('identification');
   const next=[...root.children].find(x=>['defaults','credit','part-list','part'].includes(x.localName))||null;
   root.insertBefore(identification,next);
  }
  let miscellaneous=directChild(identification,'miscellaneous');
  if(!miscellaneous){miscellaneous=create('miscellaneous');identification.append(miscellaneous)}
  const marker=create('miscellaneous-field');
  marker.setAttribute('name','play-along-user-fingering');
  marker.textContent='User-edited numeric fingering, not original composer notation; corrections: '+changed.count+
   '; source-author fingering hidden in downloaded copy: '+(changed.suppressed||0)+
   '; hand-only changes not exported: '+changed.handOnly;
  miscellaneous.append(marker);
  const xml=xmlHeader(serialize(doc));
  // Metadata must be harmless to the very same importer/transport.
  const finalSong=reimport(xml,'play-along-user-fingering.musicxml');
  if(JSON.stringify(noteSignature(finalSong))!==JSON.stringify(sourceNotes)||
     JSON.stringify(eventsSignature(finalSong))!==JSON.stringify(sourceEvents))
   return reject('Export provenance metadata changed source playback');
  return {status:'ready',reason:null,xml,count:changed.count,
   suppressed:changed.suppressed||0,
   handOnly:changed.handOnly,sourceNotes:sourceNotes.length};
 }catch(error){return reject('Unable to mark user provenance: '+(error?.message||String(error)))}
}
