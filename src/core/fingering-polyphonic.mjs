/**
 * FG-02B — original, research-only chord / overlapping-voice fingering engine.
 *
 * No imports from the Play Along renderer. Not a PianoPlayer/Parncutt port.
 * No inferred hand, no MIDI finger detection, no automatic UI assignment.
 * Candidate finger combinations are evaluated with a bounded beam search.
 */
const HAND_SIZES=Object.freeze({XXS:.68,XS:.78,S:.88,M:1,L:1.10,XL:1.20,XXL:1.30});
const WHITE_X=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const OFFSETS=[-2,-1,0,1,2];
const SPAN=[0,2.25,4.4,6.2,7.65]; // accepted legacy model: unchanged
// FG-04C3 opt-in biomechanical reach by ACTUAL finger pair, not index gap.
// Independent thresholds in white-key distances; conservative heuristics,
// NOT pianist-validated bounds or an inferred student's hand geometry.
const ANATOMICAL_PAIR_SPANS=Object.freeze({
 '1-2':5.5,'1-3':6.5,'1-4':7.2,'1-5':8.3,
 '2-3':2.7,'2-4':4.6,'2-5':6.0,
 '3-4':2.4,'3-5':4.3,'4-5':2.6
});
const BLACK=new Set([1,3,6,8,10]);
const START_EPS=.012,END_EPS=.002;
const failure=(reason,details={})=>({ok:false,reason,...details});
const xpos=p=>Math.floor(p/12)*7+WHITE_X[p%12];
const allowedFinger=f=>Number.isInteger(f)&&f>=1&&f<=5;
const validHand=h=>h==='RH'||h==='LH';
const fixed=(note)=>note.finger??null;

// Monophonic notes, chords and independently sustaining polyphonic voices.
// All notes in ONE invocation belong to an EXPLICIT hand.
// Results remain tentative and MUST NOT be surfaced as authoritative hints.
export function proposePolyphonicFingering(notes,{hand,handSize='M',beamWidth=40,costModel='legacy'}={}){
 if(!validHand(hand))return failure('HAND_REQUIRED');
 if(!Object.hasOwn(HAND_SIZES,handSize))return failure('INVALID_HAND_SIZE');
 if(!Number.isInteger(beamWidth)||beamWidth<1||beamWidth>128)return failure('INVALID_BEAM_WIDTH');
 if(!['legacy','anatomical'].includes(costModel))return failure('INVALID_COST_MODEL');
 if(!Array.isArray(notes)||!notes.length||notes.length>2500)return failure('INVALID_LENGTH');
 const sorted=notes.map((n,index)=>({...n,index,anchor:fixed(n)}))
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
 for(const n of sorted){
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||!Number.isFinite(n.start)||n.start<0
   ||!Number.isFinite(n.duration)||n.duration<=0)return failure('INVALID_NOTE');
  if(n.anchor!==null&&!allowedFinger(n.anchor))return failure('INVALID_ANCHOR');
  if(n.hand!=null&&n.hand!==hand)return failure('HAND_CONFLICT');
 }
 // At one onset, identical pitches in multiple voices share ONE physical key.
 const groups=[];
 for(const note of sorted){
  let g=groups.at(-1);
  if(!g||note.start-g.time>START_EPS){g={time:note.start,keys:[]};groups.push(g)}
  let key=g.keys.find(k=>k.pitch===note.pitch);
  if(!key){key={pitch:note.pitch,end:note.start+note.duration,notes:[],anchor:null};g.keys.push(key)}
  key.end=Math.max(key.end,note.start+note.duration);key.notes.push(note);
  if(note.anchor!==null){
   if(key.anchor!==null&&key.anchor!==note.anchor)return failure('CONFLICTING_UNISON_ANCHORS');
   key.anchor=note.anchor;
  }
 }
 // Global validation is independent of the search path: count actual keys,
 // not duplicated voice events, and reject re-attacks of a held pitch.
 const sounding=[];
 for(const group of groups){
  for(let i=sounding.length-1;i>=0;i--)if(sounding[i].end<=group.time+END_EPS)sounding.splice(i,1);
  if(group.keys.some(k=>sounding.some(s=>s.pitch===k.pitch)))
   return failure('HELD_KEY_REARTICULATION_UNSUPPORTED',{
    failureAt:{start:group.time,pitches:group.keys.map(k=>k.pitch),
     noteIds:group.keys.flatMap(k=>k.notes.map(n=>n.noteId).filter(Boolean))}});
  for(const k of group.keys)sounding.push({pitch:k.pitch,end:k.end});
  if(sounding.length>5)return failure('TOO_MANY_SIMULTANEOUS_KEYS',{
   failureAt:{start:group.time,pitches:group.keys.map(k=>k.pitch),
    noteIds:group.keys.flatMap(k=>k.notes.map(n=>n.noteId).filter(Boolean)),
    soundingCount:sounding.length}});
 }
 const width=HAND_SIZES[handSize],dir=hand==='RH'?1:-1;
 let beam=[{score:0,center:null,held:[],node:null,time:groups[0].time,previous:[]}];
 for(let gi=0;gi<groups.length;gi++){
  const g=groups[gi],keys=g.keys.slice().sort((a,b)=>a.pitch-b.pitch);
  const next=[];let serial=0;
  // Diagnostic counters record pruned candidates, not proof of human
  // impossibility. They never alter scoring, reach limits or beam width.
  const pruned={noFingerCombination:0,spanOrFingerOrder:0,
   rapidFingerReuse:0,heldHandRelocation:0};
  for(const state of beam){
   const held=state.held.filter(n=>n.end>g.time+END_EPS);
   const occupied=new Set(held.map(n=>n.finger));
   const possible=[];
   const enumerate=(i,selected,used)=>{
    if(i===keys.length){possible.push(selected.slice());return}
    const k=keys[i];
    for(let f=1;f<=5;f++){
     if(used.has(f)||(k.anchor!==null&&k.anchor!==f))continue;
     used.add(f);selected.push({pitch:k.pitch,finger:f,end:k.end,notes:k.notes});
     enumerate(i+1,selected,used);selected.pop();used.delete(f);
    }
   };
   enumerate(0,[],new Set(occupied));
   if(!possible.length)pruned.noFingerCombination++;
   for(const selected of possible){
    const soundingNow=held.concat(selected).sort((a,b)=>a.pitch-b.pitch);
    let feasible=true,stretchPenalty=0;
    for(let i=0;i<soundingNow.length&&feasible;i++)for(let j=i+1;j<soundingNow.length;j++){
     const a=soundingNow[i],b=soundingNow[j],fd=(b.finger-a.finger)*dir;
     const dist=xpos(b.pitch)-xpos(a.pitch);
     // A low-to-high pitch must use distinct ordered fingers; no crossings
     // of simultaneously held voices are represented in this first model.
     const reach=costModel==='anatomical'?
       ANATOMICAL_PAIR_SPANS[Math.min(a.finger,b.finger)+'-'+Math.max(a.finger,b.finger)]:
       SPAN[fd];
     if(fd<=0||fd>4||!reach||dist>reach*width+.00001){feasible=false;break}
     stretchPenalty+=.35*(dist/(reach*width))**4;
    }
    if(!feasible){pruned.spanOrFingerOrder++;continue}
    const centers=soundingNow.map(n=>xpos(n.pitch)-dir*OFFSETS[n.finger-1]*width);
    const center=centers.reduce((a,b)=>a+b,0)/centers.length;
    const posture=centers.reduce((a,x)=>a+(x-center)**2,0)/centers.length;
    let cost=posture*2.2+stretchPenalty;
    for(const n of selected){
     if(BLACK.has(n.pitch%12))cost+=n.finger===1?2.3:n.finger===5?1.25:0;
     // Mild central-finger regularizer on isolated notes; chord position
     // and voice-leading costs dominate this preference.
     if(soundingNow.length===1)cost+=Math.abs(n.finger-3)*.13;
     for(const old of state.previous){
      if(old.finger!==n.finger)continue;
      const gap=g.time-old.end;
      if(n.pitch!==old.pitch&&gap<.12){feasible=false;break}
      if(n.pitch!==old.pitch&&gap<.27)cost+=1.7;
      if(n.pitch===old.pitch&&gap<.35)cost+=1.4;
     }
     if(!feasible)break;
    }
    if(!feasible){pruned.rapidFingerReuse++;continue}
    if(state.center!==null){
     const interval=g.time-state.time;
     const movement=Math.abs(center-state.center);
     cost+=movement*(interval<.22?1.8:.75);
     // A held key pins the hand sufficiently to forbid abrupt relocation.
     if(held.length&&movement>2.3*width){pruned.heldHandRelocation++;continue}
    }
    const node={prev:state.node,selected,groupIndex:gi};
    next.push({score:state.score+cost,center,held:soundingNow,node,time:g.time,
     previous:selected,serial:serial++});
   }
  }
  if(!next.length)return failure('NO_VALID_PATH',{
   failureAt:{
    start:g.time,groupIndex:gi,pitches:keys.map(k=>k.pitch),
    noteIds:keys.flatMap(k=>k.notes.map(n=>n.noteId).filter(Boolean)),
    survivingBeamStates:beam.length,pruned
   }
  });
  // Beam deduplication avoids wasting width on geometrically identical paths.
  next.sort((a,b)=>a.score-b.score||a.serial-b.serial);
  const keysSeen=new Set(),dedup=[];
  for(const candidate of next){
   const key=candidate.held.map(n=>n.pitch+':'+n.finger).join('|')
     +'@'+Math.round(candidate.center*50)+';'+candidate.previous.map(n=>n.pitch+':'+n.finger).join('|');
   if(keysSeen.has(key))continue;
   keysSeen.add(key);dedup.push(candidate);
   if(dedup.length>=beamWidth)break;
  }
  beam=dedup;
 }
 const best=beam[0],assignments=new Map();
 for(let node=best.node;node;node=node.prev)
  for(const p of node.selected)for(const n of p.notes)assignments.set(n.index,p.finger);
 const items=notes.map((n,index)=>({
  pitch:n.pitch,start:n.start,duration:n.duration,hand,finger:assignments.get(index),
  source:fixed(n)===null?'proposed':'anchor',
  ...(n.noteId!=null?{noteId:n.noteId}:{})
 }));
 return {ok:true,method:costModel==='anatomical'? 'fg02b-anatomical-pair-beam':'fg02b-experimental-beam-polyphonic',hand,handSize,
  totalCost:+best.score.toFixed(5),items};
}

/**
 * Evaluate two known piano hands independently; never guess the split by pitch.
 * Cross-hand, same-key overlapping attacks are rejected as physically
 * ambiguous (MIDI cannot disambiguate them).
 */
export function proposeTwoHandFingering(parts,{handSize='M',beamWidth=40,costModel='legacy'}={}){
 if(!parts||typeof parts!=='object'||Array.isArray(parts))return failure('HAND_PARTS_REQUIRED');
 if(!Array.isArray(parts.RH)||!Array.isArray(parts.LH)||(!parts.RH.length&&!parts.LH.length))
  return failure('HAND_PARTS_REQUIRED');
 for(const a of parts.RH)for(const b of parts.LH)
  if(a.pitch===b.pitch&&a.start<b.start+b.duration-END_EPS&&b.start<a.start+a.duration-END_EPS)
   return failure('CROSS_HAND_SAME_KEY_OVERLAP');
 const results={};
 for(const hand of ['RH','LH']){
  if(!parts[hand].length){results[hand]=[];continue}
  const r=proposePolyphonicFingering(parts[hand],{hand,handSize,beamWidth,costModel});
  if(!r.ok)return {...r,hand};
  results[hand]=r.items;
 }
 return {ok:true,method:'fg02b-experimental-two-hands',hands:results};
}
