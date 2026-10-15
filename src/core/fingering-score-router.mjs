/**
 * FG-02I research-only fingering composition by explicit score hand.
 *
 * Uses FG-02H for truly monophonic runs and FG-02B for connected
 * overlapping/polyphonic islands. When every note in an island has an
 * explicit author finger, validates and preserves author values directly:
 * heuristic refusal is not proof an annotated passage is unplayable.
 *
 * IMPORTANT: Isolated island solutions do not establish seamless hand /
 * wrist movement at segment boundaries. Such boundaries are WARNINGS.
 * Never imported by the Play Along player: no automatic learner hints.
 */
import {proposeContextualMonophonicFingering} from './fingering-contextual.mjs';
import {proposePolyphonicFingering} from './fingering-polyphonic.mjs';
import {auditFingeringAssignments} from './fingering-audit.mjs';

const REST_BREAK=.8;
const EPS=.002;
const MAX_NOTES=2500;
const err=(reason,extra={})=>({ok:false,reason,...extra});
const idOf=n=>n.noteId??null;
const ownsFinger=n=>n.finger!==null&&n.finger!==undefined;
const sourceFields=(n,hand,finger,fromAnchor)=>({
 pitch:n.pitch,start:n.start,duration:n.duration,
 hand,finger,source:fromAnchor?'anchor':'proposed-research',
 ...(n.noteId!==null&&n.noteId!==undefined?{noteId:n.noteId}:{})
});
function validate(parts,handSize){
 if(!parts||typeof parts!=='object'||Array.isArray(parts)||
   !Array.isArray(parts.RH)||!Array.isArray(parts.LH)||
   !(parts.RH.length||parts.LH.length))return err('HAND_PARTS_REQUIRED');
 if(!['XXS','XS','S','M','L','XL','XXL'].includes(handSize))return err('INVALID_HAND_SIZE');
 if(parts.RH.length+parts.LH.length>MAX_NOTES)return err('INVALID_LENGTH');
 for(const hand of ['RH','LH'])for(const n of parts[hand]){
  if(!n||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
   !Number.isFinite(n.start)||n.start<0||
   !Number.isFinite(n.duration)||n.duration<=0)return err('INVALID_NOTE',{hand});
  if(n.hand!=null&&n.hand!==hand)return err('HAND_CONFLICT',{hand,noteId:idOf(n)});
  if(ownsFinger(n)&&(!Number.isInteger(n.finger)||n.finger<1||n.finger>5))
   return err('INVALID_ANCHOR',{hand,noteId:idOf(n)});
 }
 // A physical piano key is not an independently pressed RH/LH key.
 // Requiring source hand attribution prevents pitch-based guessing.
 for(const rh of parts.RH)for(const lh of parts.LH)
  if(rh.pitch===lh.pitch&&rh.start<lh.start+lh.duration-EPS&&
    lh.start<rh.start+rh.duration-EPS)
   return err('CROSS_HAND_SAME_KEY_OVERLAP',{pitch:rh.pitch,
    rhNoteId:idOf(rh),lhNoteId:idOf(lh)});
 return null;
}
const compare=(a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index;
function components(notes){
 const indexed=notes.map((note,index)=>({...note,index})).sort(compare);
 const components=[];
 let current=[],right=-Infinity;
 for(const n of indexed){
  // Touching note ends are not overlapping; same-key co-onset duplicates
  // produce an island and can legitimately share one physical finger.
  if(current.length&&n.start>=right-EPS){
   components.push(current);current=[];right=-Infinity;
  }
  current.push(n);right=Math.max(right,n.start+n.duration);
 }
 if(current.length)components.push(current);
 return components;
}
function segment(notes){
 const islands=components(notes);
 const segments=[];
 let mono=[];
 const flush=()=>{if(mono.length){segments.push({kind:'monophonic',notes:mono});mono=[]}};
 for(const group of islands){
  if(group.length>1){
   flush();segments.push({kind:'polyphonic',notes:group});
   continue;
  }
  const n=group[0],prev=mono.at(-1);
  if(prev&&n.start-(prev.start+prev.duration)>REST_BREAK)flush();
  mono.push(n);
 }
 flush();
 return segments;
}
function auditAnchored(notes,hand,handSize,spanModel='legacy'){
 const out=notes.map(n=>sourceFields(n,hand,n.finger,true));
 const audit=auditFingeringAssignments(notes,out,{handSize,spanModel});
 return audit.valid?{ok:true,items:out,method:'fg02i-verified-anchor-integrity',
  diagnostics:{warnings:[],boundaryCount:0}}:
  err('AUTHOR_PHYSICAL_CONFLICT',{violations:audit.violations});
}
function slidingWarnings(items){
 const ordered=items.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const warnings=[];
 for(let i=1;i<ordered.length;i++){
  const a=ordered[i-1],b=ordered[i];
  const gap=b.start-(a.start+a.duration);
  if(a.pitch!==b.pitch&&a.finger===b.finger&&gap>=-EPS&&gap<.22){
   warnings.push({code:a.source==='anchor'&&b.source==='anchor'?
    'AUTHOR_FAST_SAME_FINGER_UNVERIFIED':'PROPOSED_FAST_SAME_FINGER_UNVERIFIED',
    fromNoteId:idOf(a),toNoteId:idOf(b)});
  }
 }
 return warnings;
}
function oneHand(notes,hand,handSize,beamWidth,costModel){
 if(!notes.length)return {ok:true,items:[],methods:[],warnings:[],segments:[]};
 const allAnchored=notes.every(ownsFinger);
 if(allAnchored){
  const a=auditAnchored(notes,hand,handSize,costModel);
  if(!a.ok)return {...a,hand};
  return {ok:true,items:a.items,methods:['author-validated'],warnings:slidingWarnings(a.items),
   segments:[{kind:'author-validated',notes:notes.length,sourceAnchors:notes.length}]};
 }
 const groups=segment(notes),items=Array(notes.length);
 const methods=[],warnings=[],segmentReport=[];
 let previous=null;
 for(const group of groups){
  const sorted=group.notes.slice().sort(compare);
  const input=sorted.map(({index,...n})=>n);
  const fullyPinned=input.every(ownsFinger);
  let r;
  if(fullyPinned)r=auditAnchored(input,hand,handSize,costModel);
  else if(group.kind==='polyphonic')
   r=proposePolyphonicFingering(input,{hand,handSize,beamWidth,costModel});
  else r=proposeContextualMonophonicFingering(input,{hand,handSize});
  if(!r.ok)return err(r.reason,{hand,segmentKind:group.kind,
   segmentNoteIds:input.map(idOf),...(r.violations?{violations:r.violations}:{}),
   ...(r.failureAt?{failureAt:r.failureAt}:{})});
  const placed=r.items.map((n,i)=>sourceFields(input[i],hand,n.finger,ownsFinger(input[i])));
  for(let i=0;i<sorted.length;i++)items[sorted[i].index]=placed[i];
  methods.push(fullyPinned?'author-validated':
   group.kind==='polyphonic'?'fg02b-polyphonic':'fg02h-contextual');
  warnings.push(...slidingWarnings(placed));
  if(!fullyPinned&&r.diagnostics?.warnings)
   warnings.push(...r.diagnostics.warnings);
  segmentReport.push({kind:group.kind,notes:input.length,
   firstNoteId:idOf(input[0]),lastNoteId:idOf(input.at(-1)),
   sourceAnchors:input.filter(ownsFinger).length,
   solver:methods.at(-1)});
  if(previous){
   // We do not yet optimize finger/hand posture jointly across different
   // islands. The overall physical audit is still run after assembly.
   const next=sorted[0],p=previous.note;
   warnings.push({code:'SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED',
    fromNoteId:idOf(p),toNoteId:idOf(next),
    fromFinger:items[p.index].finger,toFinger:placed[0].finger});
  }
  previous={note:sorted.at(-1)};
 }
 if(items.some(x=>!x))return err('INTERNAL_ASSIGNMENT_GAP',{hand});
 const independent=auditFingeringAssignments(notes,items,{handSize,spanModel:costModel});
 if(!independent.valid)return err('COMBINED_PHYSICAL_CONFLICT',{hand,violations:independent.violations});
 return {ok:true,items,methods,warnings,segments:segmentReport};
}
/**
 * Explicitly-hand-split part data. Does not infer the hand from staff/pitch.
 * Fully-author-annotated scores are checked for integrity without using a
 * heuristic solver; musical ergonomics still require pianist review.
 */
export function proposeHybridScoreFingering(parts,{handSize='M',beamWidth=40,costModel='legacy'}={}){
 const inputError=validate(parts,handSize);
 if(inputError)return inputError;
 if(!Number.isInteger(beamWidth)||beamWidth<1||beamWidth>128)return err('INVALID_BEAM_WIDTH');
 if(!['legacy','anatomical'].includes(costModel))return err('INVALID_COST_MODEL');
 const rh=oneHand(parts.RH,'RH',handSize,beamWidth,costModel);
 if(!rh.ok)return rh;
 const lh=oneHand(parts.LH,'LH',handSize,beamWidth,costModel);
 if(!lh.ok)return lh;
 return {ok:true,method:'fg02i-experimental-score-router',
  ...(costModel==='anatomical'?{costModel:'anatomical'}:{}),
  hands:{RH:rh.items,LH:lh.items},handSize,
  methods:{RH:rh.methods,LH:lh.methods},
  segments:{RH:rh.segments,LH:lh.segments},
  diagnostics:{warnings:{RH:rh.warnings,LH:lh.warnings},
   boundaryWarnings:[...rh.warnings,...lh.warnings].filter(x=>
     x.code==='SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED').length},
  expertValidated:false,productionEligible:false,confidence:null};
}
