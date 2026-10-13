/**
 * FG-03D2 — source-labelled real-score 2D motion screening evidence ONLY.
 *
 * NEVER a musical-correctness or ergonomics benchmark. No inferred fingers,
 * no guessed hands, no keyboard IO, no score rewrites, no note-level exports.
 * Input must come from Play Along's real original MusicXML importer applied to
 * revision-pinned, rights-reviewed scores by the CLI audit. This pure module
 * is NOT imported by the player.
 */
import {planAnticipatoryHandMotion} from './hand-motion-feasibility.mjs';

const BLACK=new Set([1,3,6,8,10]),RANK=[0,0,1,1,2,3,3,4,4,5,5,6];
const verdict=(reason,extra={})=>({status:'REFUSED',reason,...extra,
 researchOnly:true,productionEligible:false,expertValidated:false,
 pianistJudgedAccuracy:null});
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const authorized=n=>n.fingeringSource==='musicxml'&&
 Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5&&
 (n.hand==='RH'||n.hand==='LH');
const blank=()=>Object.create(null);
const count=(bucket,key)=>{bucket[key]=(bucket[key]||0)+1};
const isSourceId=x=>typeof x==='string'&&/^xml:[^\s]+/.test(x);
export function motionEvidenceGeometry(min=21,max=108,width=1650){
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>127||
  max-min<12||!valid(width)||width<=0)throw Error('INVALID_EVIDENCE_GEOMETRY');
 const keys=[];
 for(let p=min;p<=max;p++){
  const black=BLACK.has(p%12);
  const cx=7*Math.floor(p/12)+RANK[p%12]+(black?1:.5);
  keys.push({pitch:p,black,cx,unitW:black?.61:1});
 }
 const left=Math.min(...keys.map(k=>k.cx-k.unitW/2));
 const right=Math.max(...keys.map(k=>k.cx+k.unitW/2));
 const scale=width/(right-left);
 for(const k of keys){k.x=(k.cx-k.unitW/2-left)*scale;k.w=k.unitW*scale;k.center=k.x+k.w/2;}
 return {byPitch:new Map(keys.map(k=>[k.pitch,k])),whites:keys.filter(k=>!k.black),width};
}
export function auditImportedHandMotion(song,{maxNotes=25000}={}){
 if(song?.format!=='MusicXML'||typeof song.notationXML!=='string'||
  song.originalNotationXML||/play-along-user-fingering/.test(song.notationXML))
  return verdict('NO_UNMODIFIED_ORIGINAL_MUSICXML');
 if(!Number.isInteger(maxNotes)||maxNotes<2||maxNotes>25000)
  return verdict('INVALID_SCORE_LIMIT');
 const notes=song.tracks?.flatMap(t=>t.notes||[]);
 if(!Array.isArray(notes)||!notes.length||notes.length>maxNotes)
  return verdict('NO_BOUNDED_PLAYABLE_NOTES');
 const ids=new Set(),segments=new Set();
 for(const n of notes){
  if(!n||!isSourceId(n.noteId)||ids.has(n.noteId)||
   !Array.isArray(n.sourceNoteIds)||!n.sourceNoteIds.length||
   n.sourceNoteIds[0]!==n.noteId||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||
   !valid(n.start)||n.start<0||!valid(n.duration)||n.duration<=0||
   typeof n.staff!=='string'||typeof n.voice!=='string'||
   typeof n.partId!=='string'||n.sourceNoteIds.some(x=>!isSourceId(x)||segments.has(x)))
   return verdict('NONCANONICAL_OR_AMBIGUOUS_SOURCE_NOTE');
  ids.add(n.noteId);
  for(const x of n.sourceNoteIds)segments.add(x);
 }
 // Only the original importer's MIDI events are counted: unknown audio
 // identity prevents the evaluator from claiming source-timeline integrity.
 const ons=new Map(),offs=new Map();
 if(!Array.isArray(song.audioEvents))return verdict('SOURCE_AUDIO_NOT_AVAILABLE');
 for(const e of song.audioEvents){
  if(e.type!=='noteOn'&&e.type!=='noteOff')continue;
  if(!ids.has(e.noteId)||!Number.isInteger(e.pitch)||!valid(e.time))
   return verdict('UNVERIFIED_SOURCE_AUDIO_EVENTS');
  const dest=e.type==='noteOn'?ons:offs;
  if(dest.has(e.noteId))return verdict('DUPLICATE_SOURCE_AUDIO_EVENTS');
  dest.set(e.noteId,e);
 }
 if(ons.size!==notes.length||offs.size!==notes.length||
    notes.some(n=>ons.get(n.noteId)?.pitch!==n.pitch||offs.get(n.noteId)?.pitch!==n.pitch||
     Math.abs(ons.get(n.noteId).time-n.start)>1e-7||
     Math.abs(offs.get(n.noteId).time-(n.start+n.duration))>1e-7))
  return verdict('SOURCE_AUDIO_TIMELINE_MISMATCH');
 const sorted=[...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.noteId.localeCompare(b.noteId));
 // A repeated physical pitch may be represented by overlapping notation
 // voices in a *perfectly legitimate* real score. This is NOT independently
 // executable evidence for two fingers on one physical key, but neither
 // should it discard the whole piece. Mark the transitive union interval
 // around each same-key collision as locally unknowable. No MIDI/note edit.
 // O(N) cluster construction, O(N log N) merged interval search.
 const pitchRuns=new Map(),ambiguousSourceIds=new Set(),collisionWindows=[];
 let collisionClusters=0;
 const finishRun=run=>{
  if(!run?.collided)return;
  collisionClusters++;
  collisionWindows.push({start:run.start,end:run.end});
  for(const id of run.ids)ambiguousSourceIds.add(id);
 };
 const previousByMs=new Map();
 for(const n of sorted){
  const prior=pitchRuns.get(n.pitch),end=n.start+n.duration;
  if(!prior||prior.end<=n.start+1e-7){
   finishRun(prior);
   pitchRuns.set(n.pitch,{start:n.start,end,ids:[n.noteId],collided:false});
  }else{
   prior.collided=true;
   prior.end=Math.max(prior.end,end);
   prior.ids.push(n.noteId);
  }
  const millisecond=Math.round(n.start*1000);
  if(previousByMs.has(millisecond)&&previousByMs.get(millisecond)!==n.start)
   return verdict('SUBMILLISECOND_GROUP_AMBIGUITY',{totalNotes:notes.length});
  previousByMs.set(millisecond,n.start);
 }
 for(const run of pitchRuns.values())finishRun(run);
 collisionWindows.sort((a,b)=>a.start-b.start||a.end-b.end);
 const collisionUnion=[];
 for(const w of collisionWindows){
  const last=collisionUnion.at(-1);
  if(last&&last.end>=w.start-1e-7)last.end=Math.max(last.end,w.end);
  else collisionUnion.push({...w});
 }
 const crossesCollision=(start,end)=>{
  let lo=0,hi=collisionUnion.length;
  while(lo<hi){
   const mid=(lo+hi)>>1;
   if(collisionUnion[mid].end<start-1e-7)lo=mid+1;
   else hi=mid;
  }
  return lo<collisionUnion.length&&collisionUnion[lo].start<=end+1e-7;
 };
 // Prefix-max interval index: answer held-key clearance in O(log N),
 // rather than doing an O(score length) scan for every motion candidate.
 const heldIndex=new Map(['LH','RH','unknown'].map(h=>[h,{onsets:[],ends:[]}]));
 for(const n of sorted){
  const h=authorized(n)?n.hand:'unknown';
  const q=heldIndex.get(h);
  q.onsets.push(n.start);
  q.ends.push(Math.max(q.ends.at(-1)??-1,n.start+n.duration));
 }
 const stillHeld=(h,at)=>{
  const q=heldIndex.get(h);let lo=0,hi=q.onsets.length;
  while(lo<hi){const mid=(lo+hi)>>1;
   if(q.onsets[mid]<=at)lo=mid+1;else hi=mid;
  }
  return lo>0&&q.ends[lo-1]>at+1e-7;
 };
  const groups=[];
 for(const n of sorted){
  const g=groups.at(-1);
  if(g&&g.onset===n.start)g.notes.push(n);
  else groups.push({onset:n.start,notes:[n]});
 }
 const trusted=notes.filter(authorized).length;
 const full=groups.filter(g=>g.notes.every(authorized)).length;
 const limits=blank(),decision=blank(),detail=blank();
 let considered=0,attempted=0;
 const geometry=motionEvidenceGeometry();
 const MAX_LEAD=750;
 for(let i=1;i<groups.length;i++){
  const prev=groups[i-1],next=groups[i];
  // No skips, no guessed previous posture and no manufactured movement
  // through unknown score onsets. Crossing any ambiguous same-pitch
  // overlap interval is a LOCAL abstention, not a whole-piece refusal.
  if(crossesCollision(prev.onset,next.onset)){
   count(limits,'ambiguous-physical-key-interval');continue;
  }
  if(prev.notes.length>16||next.notes.length>16){count(limits,'oversized-onset');continue;}
  if(!prev.notes.every(authorized)||!next.notes.every(authorized)){
   count(limits,'incomplete-author-finger-or-hand');continue;
  }
  considered++;
  const wholeTarget={onset:next.onset,totalNotes:next.notes.length,
   isNextUnfinished:true,
   notes:next.notes.map(n=>({noteId:n.noteId,pitch:n.pitch,hand:n.hand,finger:n.finger,
    source:'musicxml',verification:'source-author',completed:false}))};
  for(const hand of ['LH','RH']){
   const prevHand=prev.notes.filter(n=>n.hand===hand);
   const nextHand=next.notes.filter(n=>n.hand===hand);
   if(!nextHand.length)continue;
   if(!prevHand.length){count(limits,'no-immediate-same-hand-origin');continue;}
   const origin={
    onset:prev.onset,totalNotes:prevHand.length,
    notes:prevHand.map(n=>({noteId:n.noteId,pitch:n.pitch,hand,finger:n.finger,
     source:'musicxml',verification:'source-author',duration:n.duration,completed:true}))
   };
   const fromRelease=Math.max(...prevHand.map(n=>n.start+n.duration));
   const now=Math.max(0,next.onset-.5,fromRelease);
   if(now>=next.onset){count(limits,'no-time-for-preparation');continue;}
   // Opposite-hand clearance is NOT inferred from a missing label.
   // It requires every prior note to carry a trusted hand and no other
   // physical key still depressed at the observed score-clock instant.
   const other=hand==='RH'?'LH':'RH';
   const oppositeClear=!stillHeld(other,now)&&!stillHeld('unknown',now);
   const others=next.notes.some(n=>n.hand===other);
   const prevOther=prev.notes.filter(n=>n.hand===other);
   let opposite;
   if(others&&prevOther.length){
    opposite={
     origin:{onset:prev.onset,totalNotes:prevOther.length,
      notes:prevOther.map(n=>({noteId:n.noteId,pitch:n.pitch,hand:other,finger:n.finger,
       source:'musicxml',verification:'source-author',duration:n.duration,completed:true}))},
     target:wholeTarget
    };
   }
   const motion=planAnticipatoryHandMotion({
    hand,origin,target:wholeTarget,geometry,
    viewport:{left:0,right:geometry.width},
    transport:{mode:'listen',playing:true,now,speedPercent:100,
     leadMs:MAX_LEAD,oppositeHandClear:!others&&oppositeClear},
    ...(opposite?{opposite}:{})
   });
   attempted++;count(decision,motion.kind);count(detail,motion.reason);
  }
 }
 const status=trusted===0?'NO_AUTHORED_FINGER_AND_HAND_PAIRS':
  attempted===0?'NO_ELIGIBLE_SOURCE_TRANSITIONS':'HEURISTIC_SCREENING_ONLY';
 return {status,reason:null,totalNotes:notes.length,
  authorizedAuthorPairs:trusted,unverifiedOrUnpaired:notes.length-trusted,
  onsetGroups:groups.length,fullyAuthorizedGroups:full,
  physicallyAmbiguousSamePitchClusters:collisionClusters,
  physicallyAmbiguousSourceNotes:ambiguousSourceIds.size,
  physicallyAmbiguousTimeWindows:collisionUnion.length,
  consecutiveCompleteGroups:considered,attemptedHandTransitions:attempted,
  decisions:{moving:decision.moving||0,static:decision.static||0,
   markers:decision.markers||0,refuse:decision.refuse||0},
  reasons:Object.fromEntries(Object.entries(detail).sort((a,b)=>a[0].localeCompare(b[0]))),
  ineligibility:Object.fromEntries(Object.entries(limits).sort((a,b)=>a[0].localeCompare(b[0]))),
  sourceAudioEventIdentityChecked:true,
  labeledGroundTruthAccuracy:null,pianistJudgedAccuracy:null,
  productionEligible:false,expertValidated:false,researchOnly:true};
}
