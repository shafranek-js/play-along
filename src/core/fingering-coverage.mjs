/**
 * Library-facing fingering coverage from ACTUAL played note events.
 *
 * Do not equate missing catalog metadata with "no fingering". Coverage of a
 * remote file or an unread local MusicXML is UNKNOWN, not NONE.
 *
 * "Full" measures numbered finger annotations (1–5), independently from
 * hand attribution. The latter is reported separately for Ghost PNG safety.
 */
export function fingeringCoverageFromSong(song,overrides=null){
 const notes=song?.tracks?.flatMap(t=>Array.isArray(t.notes)?t.notes:[])||[];
 if(!notes.length)return null;
 const usable=notes.filter(n=>Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&
  Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0);
 if(!usable.length)return null;
 const validated=overrides&&typeof overrides==='object'?overrides:null;
 let marked=0,hands=0,author=0,user=0;
 const isDemo=song?.id==='demo-finger-duet';
 for(const n of usable){
  const manual=n.noteId&&validated?.[n.noteId];
  const manualOk=manual&&Number.isInteger(manual.finger)&&manual.finger>=1&&manual.finger<=5&&
   (manual.hand==='LH'||manual.hand==='RH'||manual.hand===null);
  const annotated=n.fingeringSource==='musicxml'&&Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5;
  if(manualOk){marked++;user++;if(manual.hand)hands++}
  else if(annotated){marked++;author++;if(n.hand==='RH'||n.hand==='LH')hands++}
  else if(isDemo){marked++;hands++}
 }
 return {total:usable.length,marked,hands,author,user};
}
export function fingeringCoverageValid(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  ['total','marked','hands','author','user'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)&&
  value.total>0&&value.marked<=value.total&&value.hands<=value.marked&&
  value.author+value.user<=value.marked;
}
export function fingeringCoverageStatus(info){
 if(!fingeringCoverageValid(info))return 'unknown';
 if(info.marked===0)return 'none';
 return info.marked===info.total?'full':'partial';
}
export function fingeringCoverageLabel(info){
 const status=fingeringCoverageStatus(info);
 const names={full:'Есть',partial:'Частично',none:'Нет',unknown:'Не проверено'};
 if(status==='unknown')return names[status];
 return names[status]+' · '+info.marked+'/'+info.total+' ('+
  Math.round(info.marked/info.total*100)+'%)';
}
