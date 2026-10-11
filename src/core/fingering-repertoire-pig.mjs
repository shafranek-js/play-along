/**
 * FG-02G: typed, source-neutral parser and conservative hand segmentation
 * for PIG/v1.0.0 note events. Does not infer hands from channels/register.
 * External corpus is CC-BY-SA and is downloaded by a research-only script.
 *
 * The selected external corpus uses -1..-5 LH, +1..+5 RH despite a dataset
 * card describing a different 0..9 convention. Fail rather than mix schemes.
 */
const PITCH_CLASSES=Object.freeze({C:0,D:2,E:4,F:5,G:7,A:9,B:11});
export function readPitchSPN(name){
 const m=/^([A-G])([#b]?)(-?\d+)$/.exec(name);
 if(!m)throw Error('INVALID_PITCH:'+name);
 const accidental=m[2]==='#'?1:m[2]==='b'?-1:0;
 const n=(Number(m[3])+1)*12+PITCH_CLASSES[m[1]]+accidental;
 if(!Number.isInteger(n)||n<0||n>127)throw Error('PITCH_OUT_OF_RANGE:'+name);
 return n;
}
export function parsePIGFingering(text,{sourceId='source'}={}){
 if(typeof text!=='string'||text.length>500_000)throw Error('INVALID_PIG_SOURCE_SIZE');
 const lines=text.split(/\r?\n/),notes=[],ids=new Set();
 let version=null,prevStart=-Infinity;
 for(let i=0;i<lines.length;i++){
  const raw=lines[i].trim();if(!raw)continue;
  if(raw.startsWith('//')){
   if(raw.startsWith('//Version:'))version=raw.slice(10).trim();
   continue;
  }
  const cols=raw.split(/\s+/);
  if(cols.length!==8)throw Error('INVALID_PIG_COLUMNS:'+sourceId+':'+(i+1));
  const [idTxt,onTxt,offTxt,pitchName,onVel,offVel,channel,fingerTxt]=cols;
  if(!/^\d+$/.test(idTxt)||!/^-?[1-5]$/.test(fingerTxt))
   throw Error('INVALID_PIG_NOTE_OR_FINGER:'+sourceId+':'+(i+1));
  const id=Number(idTxt),start=Number(onTxt),end=Number(offTxt);
  if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<=start||
   !Number.isFinite(Number(onVel))||!Number.isFinite(Number(offVel))||
   !/^\d+$/.test(channel))throw Error('INVALID_PIG_TIMING:'+sourceId+':'+(i+1));
  if(ids.has(id))throw Error('DUPLICATE_PIG_NOTE_ID:'+sourceId+':'+id);
  ids.add(id);
  if(start<prevStart-.005)throw Error('NON_MONOTONIC_PIG_ONSETS:'+sourceId+':'+id);
  prevStart=start;
  const finger=Number(fingerTxt),hand=finger>0?'RH':'LH';
  notes.push({noteId:sourceId+':'+id,pitch:readPitchSPN(pitchName),
   start,duration:end-start,end,hand,referenceFinger:Math.abs(finger),
   sourceNoteId:id,sourceFingerConvention:'signed-pig',rawChannel:Number(channel)});
 }
 if(version!=='PIG/v1.0.0')throw Error('UNSUPPORTED_PIG_VERSION:'+version);
 if(!notes.length)throw Error('EMPTY_PIG_SOURCE:'+sourceId);
 return {format:version,sourceId,notes};
}
/**
 * A monophonic engine cannot score overlapping same-hand events.
 * Exclude BOTH overlapping note IDs from benchmarking. Split remaining
 * material at rests or excluded notes, and report every excluded note.
 */
export function partitionMonophonicHand(notes,hand,{restSeconds=.8,minNotes=3}={}){
 if(!['RH','LH'].includes(hand))throw Error('HAND_REQUIRED');
 if(!Number.isFinite(restSeconds)||restSeconds<0||!Number.isInteger(minNotes)||minNotes<1)
  throw Error('INVALID_PARTITION_OPTIONS');
 const source=notes.filter(n=>n.hand===hand).slice()
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.sourceNoteId-b.sourceNoteId);
 const overlapping=new Set(),epsilon=.002;
 for(let i=0;i<source.length;i++)for(let j=i+1;j<source.length;j++){
  if(source[j].start>=source[i].end-epsilon)break;
  if(source[j].start<source[i].end-epsilon&&source[i].start<source[j].end-epsilon){
   overlapping.add(i);overlapping.add(j);
  }
 }
 const runs=[],skipped=[],candidate=[];
 const flush=()=>{
  if(!candidate.length)return;
  if(candidate.length>=minNotes)runs.push(candidate.splice(0));
  else for(const n of candidate.splice(0))skipped.push({noteId:n.noteId,reason:'SHORT_RUN'});
 };
 let previous=null,previousIndex=-1;
 for(let i=0;i<source.length;i++){
  const n=source[i];
  if(overlapping.has(i)){
   flush();skipped.push({noteId:n.noteId,reason:'SAME_HAND_POLYPHONY'});
   previous=null;previousIndex=-1;continue;
  }
  if(previous&&(i!==previousIndex+1||n.start>previous.end+restSeconds))flush();
  candidate.push(n);previous=n;previousIndex=i;
 }
 flush();
 return {hand,total:source.length,runs,skipped};
}
