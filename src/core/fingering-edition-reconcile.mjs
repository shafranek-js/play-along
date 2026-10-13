/**
 * FG-03C2B5: conservative cross-edition manual fingering reconciliation.
 *
 * Research-backed opt-in transfer, NEVER an automatic score update. Each
 * candidate requires unique, fully identical non-fingering MusicXML measures,
 * a matching part, AND original importer note/voice/staff/pitch identity.
 * Duplicate musical measures, cross-measure ties and changed contents refuse.
 * No string-fuzzy matching, no inferred fingering, no MIDI time edits.
 */
const feChild=(el,name)=>[...(el?.children||[])].find(n=>n.localName===name)||null;
const feChildren=(el,name)=>[...(el?.children||[])].filter(n=>n.localName===name);
const feTextAt=(el,name,otherwise='')=>feChild(el,name)?.textContent?.trim()??otherwise;
const feValidFinger=x=>x===null||(Number.isInteger(x)&&x>=1&&x<=5);
const feValidHand=x=>x===null||x==='RH'||x==='LH';
const feOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const feIdParts=id=>{
 const match=/^xml:([^:]*):([0-9]+):([0-9]+):([1-9][0-9]*)$/.exec(id||'');
 if(!match)return null;
 try{
  const p=decodeURIComponent(match[1]);
  const index=Number(match[2]),measure=Number(match[3]),ordinal=Number(match[4]);
  if(![index,measure,ordinal].every(Number.isSafeInteger))return null;
  return {partId:p,partIndex:index,measureIndex:measure,ordinal};
 }catch{return null}
};
const feNormalize=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
const feBad=reason=>({status:'rejected',reason});
const feSafeXML=s=>typeof s==='string'&&s.length>0&&s.length<=15e6&&
 !/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(s);
/** Strip fingering ONLY in its standard technical/notations/note ancestry.
 * A foreign <fingering> elsewhere is rejected (not silently ignored).
 * Strip only the measure number attribute, never timing, notes or voices.
 * Retain all source musical/notation attributes, including tied segments.
 */
function feSignature(root){
 let seen=0;
 function visit(n,parent=null){
  if(++seen>120000)throw Error('XML measure complexity bound');
  if(n.nodeType===3||n.nodeType===4){
   const v=(n.nodeValue||'').trim().replace(/\s+/g,' ');
   return v?['t',v]:null;
  }
  if(n.nodeType!==1)return null;
  if(n.localName==='fingering'){
   if(parent?.localName!=='technical'||parent.parentElement?.localName!=='notations'||
      parent.parentElement.parentElement?.localName!=='note')
    throw Error('Unexpected fingering location');
   return null;
  }
  const attrs=[...n.attributes].filter(a=>a.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&
   !(n===root&&a.localName==='number'))
   .map(a=>[a.namespaceURI||'',a.localName,a.value])
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const kids=[...n.childNodes].map(k=>visit(k,n)).filter(Boolean);
  if((n.localName==='notations'||n.localName==='technical')&&!attrs.length&&!kids.length)return null;
  return [n.namespaceURI||'',n.localName,attrs,kids];
 }
 return JSON.stringify(visit(root));
}
/**
 * Extracts source-derived measure identities directly from a *locally
 * imported* MusicXML song. Uses the same IDs and transposition as the player.
 * Parser injected by browser; no XML parser/network dependency in Node.
 */
export function fingerEditionSnapshot(song,{parse}={}){
 const fail=reason=>({status:'rejected',reason});
 if(song?.format!=='MusicXML'||!feSafeXML(song.notationXML)||
    song.originalNotationXML||!Array.isArray(song.tracks)||
    typeof parse!=='function')return fail('unsupported-source');
 let doc;
 try{doc=parse(song.notationXML)}catch{return fail('xml-parse-error')}
 if(!doc?.documentElement||doc.documentElement.localName!=='score-partwise'||
    doc.getElementsByTagName('parsererror').length)return fail('invalid-musicxml');
 const parts=feChildren(doc.documentElement,'part');
 if(!parts.length||parts.length>32)return fail('unsupported-part-count');
 const sourceSegments=new Map(),originalNotes=new Map();
 let total=0;
 for(const track of song.tracks)for(const n of track.notes||[]){
  if(++total>25000||!n||typeof n.noteId!=='string'||originalNotes.has(n.noteId)||
     !Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
     typeof n.partId!=='string'||typeof n.voice!=='string'||typeof n.staff!=='string'||
     !Array.isArray(n.sourceNoteIds)||!n.sourceNoteIds.length)
   return fail('invalid-imported-notes');
  originalNotes.set(n.noteId,n);
  for(const id of n.sourceNoteIds){
   const parsed=feIdParts(id);
   if(!parsed||sourceSegments.has(id)||parsed.partId!==n.partId)
    return fail('ambiguous-source-segments');
   sourceSegments.set(id,{note:n,...parsed});
  }
 }
 if(!total||sourceSegments.size>50000)return fail('empty-or-oversize-score');
 const result=[];
 try{
  for(const [partIndex,part] of parts.entries()){
   const partId=part.getAttribute('id')||'part',measures=feChildren(part,'measure');
   if(!measures.length||measures.length>6000||feChildren(part,'barline').length)
    return fail('unsupported-measure-count');
   let transpose=0,ordinal=0;
   const output=[];
   for(const [measureIndex,measure] of measures.entries()){
    if(measure.getElementsByTagName('repeat').length||
       measure.getElementsByTagName('ending').length||
       measure.getElementsByTagName('segno').length||
       measure.getElementsByTagName('coda').length)
     return fail('navigation-provenance-unsupported');
    const keys=[];
    for(const el of [...measure.children]){
     if(el.localName==='attributes'){
      const tr=feChild(el,'transpose');
      if(tr){
       transpose=Number(feTextAt(tr,'chromatic','0'))+
        12*Number(feTextAt(tr,'octave-change','0'));
       if(!Number.isInteger(transpose))return fail('invalid-transposition');
      }
      continue;
     }
     if(el.localName!=='note')continue;
     if(feChild(el,'grace')||feChild(el,'unpitched'))return fail('grace-or-unpitched-unsupported');
     if(feChild(el,'rest'))continue;
     const pitch=feChild(el,'pitch');if(!pitch)return fail('missing-pitch');
     const step=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[feTextAt(pitch,'step')];
     const value=step+Number(feTextAt(pitch,'alter','0'))+
      (Number(feTextAt(pitch,'octave','4'))+1)*12+transpose;
     if(!Number.isInteger(value)||value<0||value>127)return fail('invalid-note-pitch');
     const id='xml:'+encodeURIComponent(partId)+':'+partIndex+':'+measureIndex+':'+(++ordinal);
     const found=sourceSegments.get(id);
     if(!found||found.note.pitch!==value||
        found.note.staff!==feTextAt(el,'staff','1')||
        found.note.voice!==feTextAt(el,'voice','1')||
        found.partIndex!==partIndex||found.measureIndex!==measureIndex||
        !originalNotes.has(found.note.noteId))
      return fail('xml-playback-identity-mismatch');
     keys.push({
      noteId:found.note.noteId,sourceId:id,
      pitch:value,voice:found.note.voice,staff:found.note.staff,
      tied:found.note.sourceNoteIds.length!==1,
      authorFinger:found.note.fingeringSource==='musicxml'&&
       Number.isInteger(found.note.finger)?found.note.finger:null,
      authorHand:found.note.hand==='RH'||found.note.hand==='LH'?found.note.hand:null
     });
    }
    output.push({index:measureIndex,number:measure.getAttribute('number')||'',
     key:feSignature(measure),notes:keys});
   }
   result.push({partIndex,partId,measures:output});
  }
 }catch(error){return fail('unsupported-xml-structure: '+(error?.message||String(error)))}
 const mapped=new Set();
 for(const p of result)for(const m of p.measures)for(const n of m.notes){
  if(mapped.has(n.sourceId))return fail('duplicate-reconstructed-source');
  mapped.add(n.sourceId);
 }
 if(mapped.size!==sourceSegments.size)return fail('incomplete-source-note-correspondence');
 return {status:'ready',title:feNormalize(song.title),author:feNormalize(song.author),
  xmlIdentity:song.notationXML,partCount:result.length,parts:result,noteCount:total};
}
const validChanges=changes=>!!changes&&typeof changes==='object'&&!Array.isArray(changes)&&
 Object.keys(changes).length<=30000&&Object.entries(changes).every(([id,v])=>
  typeof id==='string'&&feIdParts(id)&&v&&typeof v==='object'&&!Array.isArray(v)&&
  feOwn(v,'finger')&&feOwn(v,'hand')&&feValidFinger(v.finger)&&feValidHand(v.hand)&&
  !(v.finger===null&&v.hand===null)&&Object.keys(v).every(k=>k==='finger'||k==='hand'));
/**
 * Dry-run. It never writes user overrides, generates fingers, or resolves
 * duplicate bars by guessed proximity. Explicit user approval remains needed.
 */
export function fingerEditionReconcile(oldEdition,newEdition,oldCorrections,currentCorrections={}){
 const reject=reason=>({status:'rejected',reason,proposals:[],conflicts:[],unresolved:[]});
 if(oldEdition?.status!=='ready'||newEdition?.status!=='ready'||
    !Array.isArray(oldEdition.parts)||!Array.isArray(newEdition.parts)||
    !validChanges(oldCorrections)||!validChanges(currentCorrections))
  return reject('invalid-snapshot-or-corrections');
 if(oldEdition.xmlIdentity===newEdition.xmlIdentity)return reject('same-edition');
 if(!oldEdition.title||oldEdition.title!==newEdition.title||
    !oldEdition.author||oldEdition.author!==newEdition.author)
  return reject('different-work-metadata');
 if(oldEdition.parts.length!==newEdition.parts.length||
  oldEdition.parts.some((part,i)=>part.partId!==newEdition.parts[i]?.partId||
   part.partIndex!==newEdition.parts[i]?.partIndex))
  return reject('part-identity-changed');
 const proposals=[],conflicts=[],unresolved=[],lookedUp=new Set();
 const oldNotes=new Map();
 for(const p of oldEdition.parts)for(const m of p.measures)for(const n of m.notes){
  if(oldNotes.has(n.noteId))continue; // tied continuation, refused below
  oldNotes.set(n.noteId,{part:p,measure:m,note:n});
 }
 for(const id of Object.keys(oldCorrections).sort()){
  const old=oldNotes.get(id),change=oldCorrections[id];
  if(!old){unresolved.push({from:id,reason:'source-note-missing'});continue}
  if(old.note.tied){unresolved.push({from:id,reason:'tied-note-requires-review'});continue}
  const toPart=newEdition.parts[old.part.partIndex];
  const candidates=toPart.measures.filter(m=>m.key===old.measure.key);
  const sourceDuplicates=old.part.measures.filter(m=>m.key===old.measure.key).length;
  if(sourceDuplicates!==1||candidates.length!==1){
   unresolved.push({from:id,reason:'ambiguous-or-changed-measure',
    oldOccurrences:sourceDuplicates,newOccurrences:candidates.length});continue;
  }
  const sameIndex=old.measure.notes.findIndex(n=>n.sourceId===old.note.sourceId);
  const target=candidates[0].notes[sameIndex];
  if(!target||target.tied||target.pitch!==old.note.pitch||
    target.voice!==old.note.voice||target.staff!==old.note.staff){
   unresolved.push({from:id,reason:'different-note-or-tie'});continue;
  }
  if(lookedUp.has(target.noteId)){
   unresolved.push({from:id,reason:'duplicate-destination'});continue;
  }
  lookedUp.add(target.noteId);
  const entry={from:id,to:target.noteId,finger:change.finger,hand:change.hand,
   fromMeasure:old.measure.number,toMeasure:candidates[0].number};
  if(feOwn(currentCorrections,target.noteId)){
   const present=currentCorrections[target.noteId];
   if(present.finger===change.finger&&present.hand===change.hand){
    unresolved.push({from:id,reason:'already-identical'});continue;
   }
   conflicts.push({...entry,reason:'existing-user-correction',existing:present});
  }else if(change.finger!==null&&target.authorFinger!==null&&
   change.finger!==target.authorFinger){
   conflicts.push({...entry,reason:'target-author-finger-conflict',
    authorFinger:target.authorFinger});
  }else if(target.authorHand!==null&&change.hand!==target.authorHand){
   conflicts.push({...entry,reason:'target-author-hand-conflict',
    authorHand:target.authorHand});
  }else proposals.push(entry);
 }
 return {status:'review',sourceCorrections:Object.keys(oldCorrections).length,
  proposals,conflicts,unresolved,
  productionEligible:false,automaticApply:false};
}
