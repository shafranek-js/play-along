// ===== scoring: pitch, chord groups, early/late, held duration =====
class PracticeSession{
 constructor(notes,mode,at=0){
  this.mode=mode;this.started=false;this.stored=false;this.revision=0;this.lastStoredRevision=-1;this.groups=[];this.all=[];this.byPitch=new Map();this.noteLookup=new Map();this.played=new Map();
  this.stats={hits:0,wrong:0,missed:0,early:0,late:0,short:0,long:0,okHold:0,badChords:0,goodChords:0};
  this.extras=[];this.cursor=0;const ns=notes.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  for(const n of ns){
   const item={...n,hit:false,miss:false,off:false,pressedAt:null,offAt:null,wallOn:null,timingMs:null,holdRatio:null,durationErrorMs:null,chordSpreadMs:null,id:this.all.length};
   this.all.push(item);this.noteLookup.set(n,item);let g=this.groups.at(-1);
   if(!g||n.start-g.start>.025){g={start:n.start,notes:[],graded:false,spreadMs:null};this.groups.push(g)}g.notes.push(item);item.group=g;if(!this.byPitch.has(n.pitch))this.byPitch.set(n.pitch,[]);this.byPitch.get(n.pitch).push(item);
  }
  this.seek(at);
 }
 seek(at){
  this.cursor=0;this.missCursor=0;this.played.clear();this.extras=[];this.started=false;this.stored=false;this.revision=0;this.lastStoredRevision=-1;
  this.stats={hits:0,wrong:0,missed:0,early:0,late:0,short:0,long:0,okHold:0,badChords:0,goodChords:0};
  for(const n of this.all){n.hit=n.start<at-.001;n.miss=false;n.off=false;n.pressedAt=null;n.offAt=null;n.wallOn=null;n.timingMs=null;n.holdRatio=null;n.durationErrorMs=null;n.chordSpreadMs=null}
  for(const g of this.groups){g.graded=false;g.spreadMs=null}
  while(this.cursor<this.groups.length&&this.groups[this.cursor].start<at-.001)this.cursor++;
 }
 nextGroup(){if(this.mode!=='wait')return null;while(this.cursor<this.groups.length&&this.groups[this.cursor].notes.every(n=>n.hit||n.miss))this.cursor++;return this.groups[this.cursor]||null}
 extra(pitch,now){this.revision++;this.stats.wrong++;this.extras.push({pitch,at:now});return false}
 inputOn(pitch,now,wallMs=performance.now()){
  if(this.mode==='wait'){
   const g=this.nextGroup();if(!g)return this.extra(pitch,now);
   const matches=g.notes.filter(n=>n.pitch===pitch&&!n.hit);if(!matches.length)return this.extra(pitch,now);
   // A single physical key represents any simultaneous unison voices.
   for(const n of matches)this.accept(n,now,wallMs);const done=g.notes.every(z=>z.hit);
   if(done){this.gradeGroup(g);this.cursor++;return 'released'}return true;
  }
  const windowSec=.24*rate();
  const candidates=(this.byPitch.get(pitch)||[]).filter(n=>!n.hit&&!n.miss&&Math.abs(n.start-now)<=windowSec).sort((a,b)=>Math.abs(a.start-now)-Math.abs(b.start-now));
  const n=candidates[0];if(!n)return this.extra(pitch,now);
  this.accept(n,now,wallMs);
  n.timingMs=(now-n.start)/rate()*1000;
  if(n.timingMs < -70)this.stats.early++;else if(n.timingMs>70)this.stats.late++;
  if(n.group.notes.every(z=>z.hit))this.gradeGroup(n.group)
  return true;
 }
 accept(n,now,wallMs){this.revision++;n.hit=true;n.pressedAt=now;n.wallOn=wallMs;this.played.set(n.pitch,n);this.stats.hits++}
 gradeGroup(g){
  if(g.graded||g.notes.length<2||g.notes.some(n=>!n.hit))return;
  g.graded=true;g.spreadMs=Math.max(...g.notes.map(n=>n.wallOn))-Math.min(...g.notes.map(n=>n.wallOn));
  for(const n of g.notes)n.chordSpreadMs=g.spreadMs;
  if(g.spreadMs>140)this.stats.badChords++;else this.stats.goodChords++;
 }
 inputOff(pitch,now){
  const n=this.played.get(pitch);if(!n)return;
  this.revision++;this.played.delete(pitch);n.off=true;n.offAt=now;
  if(this.mode==='wait')return;
  const realDurMs=Math.max(0,(now-n.pressedAt)/rate()*1000),targetMs=n.duration/rate()*1000;
  n.durationErrorMs=realDurMs-targetMs;n.holdRatio=targetMs>0?realDurMs/targetMs:1;
  if(n.holdRatio<.70)this.stats.short++;
  else if(n.holdRatio>1.40)this.stats.long++;
  else this.stats.okHold++;
 }
 advance(now){if(this.mode!=='tempo')return;const deadline=.24*rate();while(this.missCursor<this.all.length){const n=this.all[this.missCursor];if(n.start+deadline>=now)break;this.missCursor++;if(!n.hit&&!n.miss){n.miss=true;this.stats.missed++;this.revision++}}}
 finalize(end){
  if(this.mode==='tempo'){this.advance(end+.3*rate());for(const n of this.all){if(n.hit&&!n.off&&n.pressedAt!==null){this.inputOff(n.pitch,end)}}}
  for(const g of this.groups)if(g.notes.length>1&&g.notes.every(n=>n.hit))this.gradeGroup(g);
 }
 get completed(){return this.all.length?this.all.filter(n=>n.hit).length/this.all.length:0}
}
