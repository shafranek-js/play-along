/**
 * LAUNCH-01 score-time versus quantized MIDI-time diagnostic.
 * Pitch+occurrence mapping is a SCREENING HEURISTIC, not proof that a score
 * MusicXML part/voice sourceNoteId equals an unrelated MIDI performance note.
 * Never infer fingering, hands, or repair the supplied notes from a match.
 */
export function auditScoreMidiParity(xmlNotes,midiNotes,{toleranceSeconds=.02}={}){
 const reject=reason=>({ok:false,reason,sourceIdentityProven:false});
 if(!Array.isArray(xmlNotes)||!Array.isArray(midiNotes)||
  xmlNotes.length<1||midiNotes.length<1||
  xmlNotes.length>30000||midiNotes.length>30000||
  !Number.isFinite(toleranceSeconds)||toleranceSeconds<=0||
  toleranceSeconds>.25)return reject('INVALID_SCORE_PAIR');
 const groups=notes=>{
  const byPitch=new Map();
  for(const note of notes){
   if(!Number.isInteger(note?.pitch)||note.pitch<0||note.pitch>127||
    !Number.isFinite(note.start)||note.start<0||
    !Number.isFinite(note.duration)||note.duration<=0)
    return null;
   if(!byPitch.has(note.pitch))byPitch.set(note.pitch,[]);
   byPitch.get(note.pitch).push({start:note.start,end:note.start+note.duration});
  }
  for(const events of byPitch.values())events.sort((a,b)=>a.start-b.start||a.end-b.end);
  return byPitch;
 };
 const x=groups(xmlNotes),m=groups(midiNotes);
 if(!x||!m)return reject('INVALID_NOTE_TIMING');
 const pitches=[...new Set([...x.keys(),...m.keys()])].sort((a,b)=>a-b);
 const differences=pitches.filter(p=>(x.get(p)?.length||0)!==(m.get(p)?.length||0))
  .map(p=>({pitch:p,score:x.get(p)?.length||0,midi:m.get(p)?.length||0}));
 const scoreEnd=Math.max(...xmlNotes.map(n=>n.start+n.duration));
 const midiEnd=Math.max(...midiNotes.map(n=>n.start+n.duration));
 const scoreStart=Math.min(...xmlNotes.map(n=>n.start)),midiStart=Math.min(...midiNotes.map(n=>n.start));
 const summary={ok:true,noteCountScore:xmlNotes.length,noteCountMidi:midiNotes.length,
  pitchHistogramEqual:!differences.length,pitchDifferences:differences,
  timeStartScore:scoreStart,timeStartMidi:midiStart,
  timeEndScore:scoreEnd,timeEndMidi:midiEnd,
  totalDurationDeltaSeconds:midiEnd-scoreEnd,
  onsetWithinTolerance:0,releaseWithinTolerance:0,bothWithinTolerance:0,
  maxOnsetResidualSeconds:null,maxReleaseResidualSeconds:null,
  p95OnsetResidualSeconds:null,p95ReleaseResidualSeconds:null,
  ambiguousRepeatedPitchContacts:0,comparablePairs:0,
  exactTimingAtTolerance:false,sourceIdentityProven:false,
  noteOrderCriterion:'within-pitch chronological occurrence only',
  musicalEventParityCertified:false};
 if(differences.length)return summary;
 const starts=[],ends=[];
 for(const pitch of pitches){
  const a=x.get(pitch),b=m.get(pitch);
  for(let k=0;k<a.length;k++){
   const ns=Math.abs(a[k].start-b[k].start),
    ne=Math.abs(a[k].end-b[k].end);
   starts.push(ns);ends.push(ne);
   if(ns<=toleranceSeconds)summary.onsetWithinTolerance++;
   if(ne<=toleranceSeconds)summary.releaseWithinTolerance++;
   if(ns<=toleranceSeconds&&ne<=toleranceSeconds)summary.bothWithinTolerance++;
   // Coincident same-pitch events can have indistinguishable source IDs.
   if(k&&Math.abs(a[k].start-a[k-1].start)<=toleranceSeconds)
    summary.ambiguousRepeatedPitchContacts++;
  }
 }
 const pct=(arr,p)=>arr.slice().sort((a,b)=>a-b)[Math.min(arr.length-1,Math.ceil(arr.length*p)-1)];
 summary.comparablePairs=starts.length;
 summary.maxOnsetResidualSeconds=Math.max(...starts);
 summary.maxReleaseResidualSeconds=Math.max(...ends);
 summary.p95OnsetResidualSeconds=pct(starts,.95);
 summary.p95ReleaseResidualSeconds=pct(ends,.95);
 summary.exactTimingAtTolerance=starts.length===summary.bothWithinTolerance&&
  summary.ambiguousRepeatedPitchContacts===0;
 return summary;
}
