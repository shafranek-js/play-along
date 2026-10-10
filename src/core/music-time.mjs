// Pure musical time model. The same ES module is imported by Node tests
// and included by the temporary legacy-IIFE build adapter.
//
// Events are chronological musical positions measured in MIDI ticks; tempo
// values are microseconds per QUARTER note (standard SMF and MusicXML).
// All calculations use quarter-note beat coordinates, including 6/8.
function musicValidTempo(tempo){return Number.isFinite(tempo)&&tempo>0&&tempo<=60000000}
function musicIndexAt(timeline,field,value){
 let low=0,high=timeline.length;
 while(low+1<high){const mid=(low+high)>>>1;if(timeline[mid][field]<=value)low=mid;else high=mid}
 return low;
}
export function musicCreateTempoTimeline(events,ppq=480,defaultTempo=500000){
 if(!Number.isInteger(ppq)||ppq<=0||ppq>1000000)throw Error('Invalid pulses per quarter note');
 if(!musicValidTempo(defaultTempo))throw Error('Invalid default tempo');
 if(!Array.isArray(events))throw Error('Tempo events must be an array');
 const byTick=new Map([[0,defaultTempo]]);
 for(const event of events){
  if(event&&Number.isFinite(event.tick)&&event.tick>=0&&
     musicValidTempo(event.tempo))byTick.set(event.tick,event.tempo);
 }
 const order=[...byTick].sort((a,b)=>a[0]-b[0]);
 let elapsed=0;
 return order.map(([tick,tempo],i)=>{
  if(i){const [prevTick,prevTempo]=order[i-1];
   elapsed+=(tick-prevTick)/ppq*prevTempo/1000000}
  return {tick,beat:tick/ppq,sec:elapsed,tempo};
 });
}
export function musicTickToSeconds(timeline,ppq,tick){
 if(!Number.isFinite(tick)||!Number.isFinite(ppq)||ppq<=0)throw Error('Invalid musical tick');
 return musicBeatToSeconds(timeline,tick/ppq);
}
export function musicBeatToSeconds(timeline,beat){
 if(!Array.isArray(timeline)||!timeline.length)throw Error('Missing tempo timeline');
 if(!Number.isFinite(beat))throw Error('Invalid beat position');
 const wanted=Math.max(0,beat);
 const current=timeline[musicIndexAt(timeline,'beat',wanted)];
 return current.sec+(wanted-current.beat)*current.tempo/1000000;
}
export function musicSecondsToBeat(timeline,seconds){
 if(!Array.isArray(timeline)||!timeline.length)throw Error('Missing tempo timeline');
 if(!Number.isFinite(seconds))throw Error('Invalid time position');
 const wanted=Math.max(0,seconds);
 const current=timeline[musicIndexAt(timeline,'sec',wanted)];
 return current.beat+(wanted-current.sec)*1000000/current.tempo;
}
