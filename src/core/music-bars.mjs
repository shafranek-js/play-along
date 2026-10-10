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
