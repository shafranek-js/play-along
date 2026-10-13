/**
 * Research-only source-aware piano hand separation. No finger numbers, player
 * integration, MIDI channel shortcut or middle-C threshold. All labels are
 * proposals unless independently authored/user-pinned; never teaching hints.
 * Original score notes and user corrections are read-only.
 */
const HANDS = ['LH', 'RH'];
const SIZES = Object.freeze({XXS:.68, XS:.78, S:.88, M:1, L:1.10, XL:1.20, XXL:1.30});
const KEY_X = [0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const EPS = 0.000001;
const MAX_SEARCH_EXPANSIONS = 300_000;
const x = pitch => Math.floor(pitch/12)*7 + KEY_X[pitch%12];
const fixedHand = n => n.userHand ?? n.authorHand ?? n.hand ?? null;
const fixedSource = n => n.userHand != null ? 'user' : n.authorHand != null ? 'author' : n.hand != null ? 'score' : null;
const fail = (reason, additional={}) => ({ok:false,reason,...additional,productionEligible:false,expertValidated:false});
const unknownResult = (notes,reason,details={}) => ({
 ok:true,method:'fg-hand-separation-experimental',items:notes.map(n=>({
  noteId:n.noteId,hand:fixedHand(n),status:fixedHand(n)?'fixed':'unknown',
  source:fixedSource(n)??'unknown',reason:fixedHand(n)?'FIXED_SOURCE':'UNRESOLVED_'+reason,
  confidence:null
 })),summary:{total:notes.length,fixed:notes.filter(n=>fixedHand(n)).length,proposed:0,
  unknown:notes.filter(n=>!fixedHand(n)).length},diagnostics:[{code:reason,...details}],
 productionEligible:false,expertValidated:false
});
function valid(notes,handSize,beamWidth,ambiguityMargin){
 if(!Array.isArray(notes)||!notes.length||notes.length>2500)return 'INVALID_LENGTH';
 if(!Object.hasOwn(SIZES,handSize))return 'INVALID_HAND_SIZE';
 if(!Number.isInteger(beamWidth)||beamWidth<2||beamWidth>128)return 'INVALID_BEAM_WIDTH';
 if(!Number.isFinite(ambiguityMargin)||ambiguityMargin<0||ambiguityMargin>10)return 'INVALID_AMBIGUITY_MARGIN';
 const ids = new Set();
 for(const n of notes){
  if(!n||typeof n.noteId!=='string'||!n.noteId.length||ids.has(n.noteId))return 'INVALID_OR_DUPLICATE_SOURCE_ID';
  ids.add(n.noteId);
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||!Number.isFinite(n.start)||n.start<0||
   !Number.isFinite(n.duration)||n.duration<=0)return 'INVALID_EVENT';
  for(const name of ['userHand','authorHand','hand'])
   if(n[name]!=null&&!HANDS.includes(n[name]))return 'INVALID_FIXED_HAND';
 }
 return null;
}
const voiceId = n => n.partId != null && n.voice != null
 ? String(n.partId)+'|'+String(n.staff??'?')+'|'+String(n.voice) : null;
function feasible(existing,added,time,size){
 const held=existing.held.filter(n=>n.end>time+EPS);
 const concurrent=[...held,...added];
 if(concurrent.length>5)return null;
 const pitches=new Set(concurrent.map(n=>n.pitch));
 if(pitches.size!==concurrent.length)return null;
 const lo=Math.min(...concurrent.map(n=>x(n.pitch)));
 const hi=Math.max(...concurrent.map(n=>x(n.pitch)));
 // Deliberately conservative reach envelope, not anatomy or fingering.
 if(hi-lo>7.65*size+EPS)return null;
 const center=(lo+hi)/2;
 if(existing.center!==null){
  const move=Math.abs(center-existing.center);
  const delta=Math.max(0,time-existing.time);
  if(move>2.25+28*delta)return null;
  if(held.length&&move>2.25*size)return null;
 }
 return {held:concurrent,center,time};
}
const eventGroup=(notes)=>{
 const groups=[];
 for(const note of notes){
  let g=groups.at(-1);
  if(!g||Math.abs(note.start-g.time)>EPS){g={time:note.start,notes:[]};groups.push(g)}
  g.notes.push(note);
 }
 return groups;
};
/**
 * @param {Array} notes Immutable source events: unique canonical noteId,
 * pitch/start/duration; optional authorHand/userHand and partId/staff/voice.
 * The user layer overrides the original in effective attribution ONLY.
 * @returns {Object} Read-only candidate labels, explicit refusal reasons.
 */
export function separateHandsResearch(notes,{handSize='M',beamWidth=48,ambiguityMargin=.75}={}){
 const error=valid(notes,handSize,beamWidth,ambiguityMargin);
 if(error)return fail(error);
 const ordered=notes.map((n,index)=>({...n,index})).sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.noteId.localeCompare(b.noteId));
 // Re-articulation before physical key release, or two coincident voices
 // claiming one key, cannot establish distinct source-to-finger identity.
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
  const a=ordered[i],b=ordered[j];
  if(b.start>=a.start+a.duration-EPS)break;
  if(a.pitch===b.pitch)return unknownResult(notes,'SAME_KEY_OVERLAP',{
   noteIds:[a.noteId,b.noteId]});
 }
 const groups=eventGroup(ordered);
 if(groups.some(g=>g.notes.length>10))return unknownResult(notes,'ONSET_SEARCH_CAP');
 const size=SIZES[handSize];
 const initialHand=()=>({held:[],center:null,time:0});
 let beam=[{score:0,hands:{LH:initialHand(),RH:initialHand()},voices:new Map(),
  path:null}];
 let ambiguousPruning=false,searchExpansions=0;
 const hasSourceHandAnchor=ordered.some(n=>fixedHand(n)!==null);
 for(const group of groups){
  const next=[];
  const k=group.notes.length;
  for(const prev of beam){
   for(let mask=0;mask<2**k;mask++){
    if(++searchExpansions>MAX_SEARCH_EXPANSIONS)
     return unknownResult(notes,'SEARCH_BUDGET_EXCEEDED',{limit:MAX_SEARCH_EXPANSIONS});
    let rejected=false;
    const additions={LH:[],RH:[]};
    let voicePenalty=0;
    const voices=new Map(prev.voices);
    const assigned=[];
    for(let i=0;i<k;i++){
     const n=group.notes[i],hand=(mask&(1<<i))?'RH':'LH';
     if(fixedHand(n)&&fixedHand(n)!==hand){rejected=true;break}
     additions[hand].push({pitch:n.pitch,end:n.start+n.duration});
     assigned.push({index:n.index,hand});
     const vk=voiceId(n);
     if(vk){
      if(voices.has(vk)&&voices.get(vk)!==hand)voicePenalty+=1.35;
      voices.set(vk,hand);
     }
    }
    if(rejected)continue;
    const lh=additions.LH.length?feasible(prev.hands.LH,additions.LH,group.time,size)
     : {...prev.hands.LH,held:prev.hands.LH.held.filter(n=>n.end>group.time+EPS)};
    if(!lh)continue;
    const rh=additions.RH.length?feasible(prev.hands.RH,additions.RH,group.time,size)
     : {...prev.hands.RH,held:prev.hands.RH.held.filter(n=>n.end>group.time+EPS)};
    if(!rh)continue;
    let cost=voicePenalty;
    for(const [name,current] of [['LH',lh],['RH',rh]]){
     if(additions[name].length&&prev.hands[name].center!==null){
      const travel=Math.abs(current.center-prev.hands[name].center);
      cost+=travel*.21;
     }
    }
    // Relative *current* hand ordering, not a fixed pitch/register split.
    // Crossings are allowed, but require source or trajectory evidence.
    if(lh.held.length&&rh.held.length&&lh.center>rh.center)cost+=2.4;
    if(additions.LH.length&&additions.RH.length)cost+=.26;
    next.push({score:prev.score+cost,hands:{LH:lh,RH:rh},voices,
     path:{prev:prev.path,assigned},serial:next.length});
   }
  }
  if(!next.length)return unknownResult(notes,'NO_FEASIBLE_HAND_PATH',{
   onset:group.time,noteIds:group.notes.map(n=>n.noteId)});
  next.sort((a,b)=>a.score-b.score||a.serial-b.serial);
  if(next.length>beamWidth&&next[beamWidth].score<=next[0].score+ambiguityMargin+EPS)
   ambiguousPruning=true;
  beam=next.slice(0,beamWidth);
 }
 const best=beam[0];
 const contenders=beam.filter(s=>s.score<=best.score+ambiguityMargin+EPS);
 const assignments=contenders.map(state=>{
  const result=Array(notes.length);
  for(let node=state.path;node;node=node.prev)
   for(const assignment of node.assigned)result[assignment.index]=assignment.hand;
  return result;
 });
 const diagnostics=[];
 const items=notes.map((n,index)=>{
  const fixed=fixedHand(n);
  if(fixed)return {noteId:n.noteId,hand:fixed,status:'fixed',
   source:fixedSource(n),reason:'FIXED_SOURCE',confidence:null};
  const alternatives=new Set(assignments.map(a=>a[index]));
  // Without at least one independently fixed hand label, a crossed
  // RH/LH performance can fit the *same* MIDI events as an ordinary duet.
  // Ranking by low/high pitch is a preference, NOT hand-identity evidence.
  const certain=hasSourceHandAnchor&&alternatives.size===1&&!ambiguousPruning;
  const uncertainty=!hasSourceHandAnchor?'UNANCHORED_HAND_IDENTITY':
   ambiguousPruning?'BEAM_TRUNCATED_AMBIGUOUS':'AMBIGUOUS_HAND';
  if(!certain)diagnostics.push({code:uncertainty,noteId:n.noteId});
  return {noteId:n.noteId,hand:certain?assignments[0][index]:null,
   status:certain?'proposed':'unknown',source:certain?'research':'unknown',
   reason:certain?'RESEARCH_ONLY':uncertainty,confidence:null};
 });
 const summary={total:items.length,fixed:items.filter(n=>n.status==='fixed').length,
  proposed:items.filter(n=>n.status==='proposed').length,
  unknown:items.filter(n=>n.status==='unknown').length};
 return {ok:true,method:'fg-hand-separation-experimental',items,summary,
  diagnostics,search:{beamWidth,ambiguityMargin,terminalCandidates:contenders.length},
  productionEligible:false,expertValidated:false};
}
