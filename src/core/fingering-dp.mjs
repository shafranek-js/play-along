/**
 * FG-02A experimental monophonic piano fingering optimizer.
 * Original research prototype; NOT a port of PianoPlayer or a claim of
 * pedagogically certified fingering. Never invoked by production guidance.
 *
 * A five-state dynamic program searches low-effort hand paths on the
 * physical keyboard. MusicXML/user anchors are hard constraints.
 * Polyphonic or substantially overlapping notes are rejected explicitly.
 */
const SIZES=Object.freeze({XXS:.68,XS:.78,S:.88,M:1,L:1.10,XL:1.20,XXL:1.30});
const WHITE_X=[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6];
const BLACK=new Set([1,3,6,8,10]);
const OFFSET=[-2,-1,0,1,2];
const MAX_NOTES=5000;
const allowedFinger=f=>Number.isInteger(f)&&f>=1&&f<=5;
function position(pitch){
 const octave=Math.floor(pitch/12),pc=pitch%12;
 return octave*7+WHITE_X[pc];
}
function noteQuality(pitch,finger){
 // Black-key thumbs and little fingers are allowed, not treated as impossible.
 return BLACK.has(pitch%12)?(finger===1?2.3:finger===5?1.25:0):0;
}
function transition(a,b,f1,f2,hand,width){
 const direction=hand==='RH'?1:-1;
 const dx=position(b.pitch)-position(a.pitch);
 const offset1=direction*OFFSET[f1-1]*width;
 const offset2=direction*OFFSET[f2-1]*width;
 const centerMove=dx-(offset2-offset1);
 const gap=b.start-(a.start+a.duration);
 const near=gap<.20;
 const noteDistance=Math.abs(dx);
 // Consecutive rapid pitch changes played by one unmoving finger are omitted
 // in this conservative prototype. Deliberate slides remain future work.
 if(b.pitch!==a.pitch&&f1===f2&&gap<.22)return Infinity;
 let cost=Math.abs(centerMove)*(near?1.45:1.0);
 if(Math.abs(centerMove)>2.3*width&&near)cost+=(Math.abs(centerMove)-2.3*width)*1.1;
 if(b.pitch!==a.pitch&&f1===f2)cost+=noteDistance<1?3.2:4.0;
 if(b.pitch===a.pitch){
  if(f1===f2&&gap<.3)cost+=2.2;
  if(f1!==f2)cost+=Math.abs(f2-f1)*.33;
 }
 // Thumb-under and crossover are legitimate transitions; use soft costs.
 const projected=dx*direction;
 if(projected>0&&f2<f1){
  if(f2!==1)cost+=4+Math.abs(f1-f2)*2;
  else cost+=f1===3?1.0:f1===4?1.8:f1===2?2.6:2.8;
 }
 if(projected<0&&f2>f1){
  if(f1!==1)cost+=4+Math.abs(f1-f2)*2;
  else cost+=f2===3?1.0:f2===4?1.8:f2===2?2.6:2.8;
 }
 if(Math.abs(projected)<.9&&Math.abs(f2-f1)>=3)cost+=2.8;
 return cost;
}

/**
 * A pure, deterministic research function; never mutates input or playback.
 * @param {Array<{pitch:number,start:number,duration:number,finger?:number}>} notes
 * @param {{hand:'RH'|'LH', handSize?:string}} options
 */
export function proposeMonophonicFingering(notes,{hand,handSize='M'}={}){
 if(hand!=='RH'&&hand!=='LH')return {ok:false,reason:'HAND_REQUIRED'};
 if(!Object.hasOwn(SIZES,handSize))return {ok:false,reason:'INVALID_HAND_SIZE'};
 if(!Array.isArray(notes)||notes.length===0||notes.length>MAX_NOTES)return {ok:false,reason:'INVALID_LENGTH'};
 const sorted=notes.map((n,index)=>({...n,index,anchor:n.finger??null}))
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch||a.index-b.index);
 for(const n of sorted){
  if(!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||!Number.isFinite(n.start)||n.start<0
    ||!Number.isFinite(n.duration)||n.duration<=0)return {ok:false,reason:'INVALID_NOTE'};
  if(n.anchor!==null&&!allowedFinger(n.anchor))return {ok:false,reason:'INVALID_ANCHOR'};
 }
 // Legato timing jitter up to 35 ms is tolerated; real concurrent voices
 // require a separate polyphonic algorithm (not a monophonic heuristic).
 for(let i=1;i<sorted.length;i++){
  const prev=sorted[i-1],now=sorted[i];
  if(now.start<prev.start+prev.duration-.035)return {ok:false,reason:'POLYPHONY_UNSUPPORTED'};
 }
 const width=SIZES[handSize],dp=sorted.map(()=>new Array(5).fill(Infinity));
 const back=sorted.map(()=>new Array(5).fill(-1));
 for(let f=1;f<=5;f++)if(sorted[0].anchor===null||sorted[0].anchor===f){
  dp[0][f-1]=noteQuality(sorted[0].pitch,f)+.15*Math.abs(f-3);
 }
 for(let i=1;i<sorted.length;i++){
  const a=sorted[i-1],b=sorted[i];
  for(let finger=1;finger<=5;finger++){
   if(b.anchor!==null&&b.anchor!==finger)continue;
   const quality=noteQuality(b.pitch,finger);
   for(let prior=1;prior<=5;prior++){
    const before=dp[i-1][prior-1];if(!Number.isFinite(before))continue;
    const score=before+transition(a,b,prior,finger,hand,width)+quality;
    if(score<dp[i][finger-1]-1e-10){
     dp[i][finger-1]=score;back[i][finger-1]=prior-1;
    }
   }
  }
 }
 const end=dp.at(-1),best=end.reduce((idx,cost,j)=>cost<end[idx]?j:idx,0);
 if(!Number.isFinite(end[best]))return {ok:false,reason:'NO_VALID_PATH'};
 let finger=best;const output=new Array(sorted.length);
 for(let i=sorted.length-1;i>=0;i--){
  const n=sorted[i];
  output[n.index]={pitch:n.pitch,start:n.start,duration:n.duration,finger:finger+1,hand,
   source:n.anchor!==null?'anchor':'proposed'};
  finger=back[i][finger];
 }
 return {ok:true,method:'fg02a-experimental-dp-monophonic',hand,handSize,
  items:output,totalCost:+end[best].toFixed(5)};
}
