// Pure normalized measure grid, independent of MusicXML, OSMD and the DOM.
// Beat units are ordinary quarter notes. All parts and cursor/navigation use
// the same measure-span rule for normal, implicit and overfull measures.
export function musicMeasureSpan(beats,beatType,occupied=0,implicit=false){
 if(!Number.isFinite(beats)||beats<=0||!Number.isFinite(beatType)||beatType<=0)
  throw Error('Invalid musical meter');
 if(!Number.isFinite(occupied)||occupied<0)throw Error('Invalid occupied duration');
 const nominal=beats*4/beatType;
 return implicit&&occupied>0?Math.min(nominal,occupied):Math.max(nominal,occupied);
}
export function musicBarGrid(measures){
 if(!Array.isArray(measures))throw Error('Measures must be an array');
 const positions=[0];
 for(const measure of measures){
  if(!measure||typeof measure!=='object')throw Error('Invalid measure');
  const span=musicMeasureSpan(measure.beats,measure.beatType,measure.occupied??0,!!measure.implicit);
  positions.push(positions[positions.length-1]+span);
 }
 return positions;
}

// Parse MusicXML additive time: 3+2/8, or multiple beats/beat-type
// groups. Normalize to quarter-beat units so all consumers share a grid.
export function musicParseMeterGroups(groups){
 if(!Array.isArray(groups)||!groups.length)return null;
 let quarterBeats=0;
 for(const group of groups){
  if(!group||typeof group.beats!=='string'||
     !/^[0-9]+(?:\+[0-9]+)*$/.test(group.beats.trim()))return null;
  const sum=group.beats.trim().split('+').reduce((s,x)=>s+Number(x),0);
  const den=Number(group.beatType);
  if(!Number.isFinite(sum)||sum<1||sum>256||!Number.isInteger(den)||
     den<1||den>256||(den&(den-1))!==0)return null;
  quarterBeats+=sum*4/den;
 }
 return quarterBeats>0&&quarterBeats<=256?{beats:quarterBeats,beatType:4}:null;
}
