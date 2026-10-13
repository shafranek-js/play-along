/**
 * FG-04D1 — research-only, independently reimported author/user provenance.
 * This module is intentionally NOT included in the browser learner bundle.
 * Never use fields named authorHand/authorFinger supplied by an arbitrary
 * caller: recover them only from a fresh canonical MusicXML reimport.
 *
 * This is NOT a provenance authority for completion state or pedagogy.
 * The host must independently verify completion against real Wait transport.
 */
import {fingerOverrideValidate,fingerOverrideWorkKey} from './finger-overrides.mjs';
import {inspectGuidanceResearchBridge} from './finger-motion-research-bridge.mjs';

const D1_FLAGS={productionEligible:false,expertValidated:false,researchOnly:true};
const d1Refuse=(reason,extra={})=>({ok:false,reason,...extra,...D1_FLAGS});
const d1Hand=x=>x==='RH'||x==='LH';
const d1Finger=x=>Number.isInteger(x)&&x>=1&&x<=5;
const d1Number=x=>typeof x==='number'&&Number.isFinite(x);
const d1Plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const d1Notes=song=>{
 if(!Array.isArray(song?.tracks))return null;
 const notes=song.tracks.flatMap(t=>Array.isArray(t?.notes)?t.notes:[]);
 if(!notes.length||notes.length>128)return null;
 if(notes.some(n=>!n||typeof n.noteId!=='string'||!n.noteId.startsWith('xml:')||
  !Array.isArray(n.sourceNoteIds)||!n.sourceNoteIds.length||
  !n.sourceNoteIds.every(id=>typeof id==='string'&&id.startsWith('xml:'))||
  n.sourceNoteIds[0]!==n.noteId||
  !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
  !d1Number(n.start)||n.start<0||!d1Number(n.duration)||n.duration<=0||
  !Number.isInteger(n.sourceTrack)||typeof n.partId!=='string'||
  typeof n.staff!=='string'||typeof n.voice!=='string'))return null;
 const ids=new Set(),segments=new Set();
 for(const n of notes){
  if(ids.has(n.noteId))return null;
  ids.add(n.noteId);
  for(const id of n.sourceNoteIds){
   if(segments.has(id))return null;
   segments.add(id);
  }
 }
 return notes;
};
const d1Audio=song=>{
 if(!Array.isArray(song?.audioEvents)||!song.audioEvents.length)return null;
 return song.audioEvents.map(x=>({
  type:x.type,time:x.time,track:x.track,sourceTrack:x.sourceTrack,
  channel:x.channel,noteId:x.noteId,pitch:x.pitch,velocity:x.velocity,
  controller:x.controller,value:x.value,program:x.program,
  bankMSB:x.bankMSB,bankLSB:x.bankLSB,isDrum:x.isDrum
 }));
};
const d1Fingerprint=notes=>JSON.stringify(notes.map(n=>({
 id:n.noteId,segments:n.sourceNoteIds,pitch:n.pitch,
 start:n.start,duration:n.duration,velocity:n.velocity,
 channel:n.channel,sourceTrack:n.sourceTrack,
 partId:n.partId,staff:n.staff,voice:n.voice,instrumentId:n.instrumentId,
 // A field from unverified score exports must NEVER become "musicxml" here.
 finger:n.finger??null,source:n.fingeringSource??null,hand:n.hand??null
})));
const d1Timeline=(song)=>JSON.stringify({
 scoreTempoMap:song?.scoreTempoMap??null,
 events:d1Audio(song)
});
/**
 * @param {{
 * song: Object,
 * storedOverrides: Object, // WHOLE validated local map, keyed by exact xml fingerprint
 * completedNoteIds: string[],
 * reimport: (xml: string)=>Object, // actual independent MusicXML importer
 * hand: 'RH'|'LH', targetNoteId:string,
 * geometry:Object, viewport:Object, transport:Object, handSize?:string
 * }} input
 * Only the trusted reimported representation reaches three research solvers.
 * The client caller's song events/label fields have zero authority.
 */
export function inspectMusicXmlProvenanceResearch({
 song,storedOverrides,completedNoteIds,reimport,
 hand,targetNoteId,geometry,viewport,transport,handSize='M'
}={}){
 if(song?.format!=='MusicXML'||typeof song.notationXML!=='string'||
  !song.notationXML.length||song.notationXML.length>15e6||
  song.originalNotationXML||typeof reimport!=='function')
  return d1Refuse('unsupported-original-xml');
 const key=fingerOverrideWorkKey(song);
 if(!key||!d1Plain(storedOverrides))return d1Refuse('invalid-local-override-store');
 let validated;
 try{validated=fingerOverrideValidate(storedOverrides,{strict:true})}
 catch{return d1Refuse('invalid-local-override-store')}
 // Research-only: a mismatched work key is never permitted to donate edits.
 // The fingerprint is NON-CRYPTOGRAPHIC; no claim of adversary-resistance.
 let reference;
 try{reference=reimport(song.notationXML)}
 catch{return d1Refuse('independent-reimport-failed')}
 if(!reference||reference.format!=='MusicXML'||
    reference.originalNotationXML||reference.notationXML!==song.notationXML)
  return d1Refuse('source-xml-roundtrip-mismatch');
 const original=d1Notes(song),verified=d1Notes(reference);
 if(!original||!verified||d1Fingerprint(original)!==d1Fingerprint(verified)||
  !d1Audio(song)||!d1Audio(reference)||d1Timeline(song)!==d1Timeline(reference))
  return d1Refuse('source-reimport-identity-mismatch');
 // Prevent secretly unused/fabricated local edits from authorizing motion.
 const corrections=validated[key]||{};
 const known=new Set(verified.map(n=>n.noteId));
 if(Object.keys(corrections).some(id=>!known.has(id)))
  return d1Refuse('unmatched-user-correction');
 const notes=verified.map(n=>{
  const entry={noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
   partId:n.partId,voice:n.voice,staff:n.staff};
  // Any descriptor from a Play Along user-edited XML is NOT composer-authored.
  if(n.fingeringSource==='musicxml'&&d1Finger(n.finger)&&d1Hand(n.hand)){
   entry.authorHand=n.hand;entry.authorFinger=n.finger;
  }
  const user=corrections[n.noteId];
  if(user){
   if(d1Hand(user.hand))entry.userHand=user.hand;
   if(d1Finger(user.finger))entry.userFinger=user.finger;
   // A partial manual correction is NOT a verified hand+finger pair;
   // the bridge will refuse to borrow fields across provenance layers.
   if(user.hand===null)entry.userHand=null;
   if(user.finger===null)entry.userFinger=null;
  }
  return entry;
 });
 const result=inspectGuidanceResearchBridge({
  notes,completedNoteIds,hand,targetNoteId,geometry,viewport,transport,handSize
 });
 return {...result,sourceReimportVerified:true,sourceWorkKey:key,
  // No decoded output proving physical fingers; this merely enforces
  // authentic imported XML numbers + validated local edit records.
  provenanceGate:'independent-musicxml-reimport-and-exact-local-edits',
  ...D1_FLAGS};
}
