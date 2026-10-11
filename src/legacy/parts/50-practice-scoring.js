// ===== scoring: pitch, chord groups, early/late, held duration =====
class PracticeSession{
 constructor(notes,mode,at=0,until=Infinity){
  this.mode=mode;this.until=until;this.started=false;this.stored=false;this.revision=0;this.lastStoredRevision=-1;this.groups=[];this.all=[];this.byPitch=new Map();this.noteLookup=new Map();this.played=new Map();
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
  for(const n of this.all){n.skipped=n.start<at-.001||n.start>=this.until-.001;n.hit=false;n.miss=false;n.off=false;n.pressedAt=null;n.offAt=null;n.wallOn=null;n.timingMs=null;n.holdRatio=null;n.durationErrorMs=null;n.chordSpreadMs=null}
  for(const g of this.groups){g.graded=false;g.spreadMs=null}
  while(this.cursor<this.groups.length&&this.groups[this.cursor].notes.every(n=>n.skipped))this.cursor++;
 }
 nextGroup(){if(this.mode!=='wait')return null;while(this.cursor<this.groups.length&&this.groups[this.cursor].notes.every(n=>n.skipped||n.hit||n.miss))this.cursor++;return this.groups[this.cursor]||null}
 extra(pitch,now){this.revision++;this.stats.wrong++;this.extras.push({pitch,at:now});return false}
 inputOn(pitch,now,wallMs=performance.now()){
  if(this.mode==='wait'){
   const g=this.nextGroup();if(!g)return this.extra(pitch,now);
   const matches=g.notes.filter(n=>n.pitch===pitch&&!n.skipped&&!n.hit);if(!matches.length)return this.extra(pitch,now);
   // A single physical key represents any simultaneous unison voices.
   for(const n of matches)this.accept(n,now,wallMs);const done=g.notes.every(z=>z.hit);
   if(done){this.gradeGroup(g);this.cursor++;return 'released'}return true;
  }
  const windowSec=.24*rate();
  const candidates=(this.byPitch.get(pitch)||[]).filter(n=>!n.skipped&&!n.hit&&!n.miss&&Math.abs(n.start-now)<=windowSec).sort((a,b)=>Math.abs(a.start-now)-Math.abs(b.start-now));
  const n=candidates[0];if(!n)return this.extra(pitch,now);
  // In a polyphonic score one physical piano key may represent multiple
  // notated voices (or both hands) at the SAME onset and pitch. Grade all
  // such voices on one fresh NoteOn; a later repeated note has a different
  // onset/group and still needs a new physical key press.
  const unisons=n.group.notes.filter(z=>z.pitch===pitch&&!z.hit&&!z.miss);
  for(const voice of unisons){
   this.accept(voice,now,wallMs);
   voice.timingMs=(now-voice.start)/rate()*1000;
   if(voice.timingMs < -70)this.stats.early++;
   else if(voice.timingMs>70)this.stats.late++;
  }
  if(n.group.notes.every(z=>z.hit))this.gradeGroup(n.group);
  return true;
 }
 accept(n,now,wallMs){
  this.revision++;n.hit=true;n.pressedAt=now;n.wallOn=wallMs;
  // Every accepted unison voice shares the same key-up event.
  const active=this.played.get(n.pitch)||[];
  active.push(n);this.played.set(n.pitch,active);
  this.stats.hits++;
}
 gradeGroup(g){
  // Two voices playing the same pitch are a unison, not a two-key chord.
  if(g.graded||new Set(g.notes.map(n=>n.pitch)).size<2||g.notes.some(n=>!n.hit))return;
  g.graded=true;g.spreadMs=Math.max(...g.notes.map(n=>n.wallOn))-Math.min(...g.notes.map(n=>n.wallOn));
  for(const n of g.notes)n.chordSpreadMs=g.spreadMs;
  if(g.spreadMs>140)this.stats.badChords++;else this.stats.goodChords++;
 }
 inputOff(pitch,now){
  const active=this.played.get(pitch);if(!active?.length)return;
  this.revision++;this.played.delete(pitch);
  // One MIDI NoteOff releases every voice that began with this physical key.
  for(const n of active){
   n.off=true;n.offAt=now;
   if(this.mode==='wait')continue;
   const realDurMs=Math.max(0,(now-n.pressedAt)/rate()*1000),targetMs=n.duration/rate()*1000;
   n.durationErrorMs=realDurMs-targetMs;n.holdRatio=targetMs>0?realDurMs/targetMs:1;
   if(n.holdRatio<.70)this.stats.short++;
   else if(n.holdRatio>1.40)this.stats.long++;
   else this.stats.okHold++;
  }
 }
 advance(now){if(this.mode!=='tempo')return;const deadline=.24*rate();while(this.missCursor<this.all.length){const n=this.all[this.missCursor];if(n.start+deadline>=now)break;this.missCursor++;if(!n.skipped&&!n.hit&&!n.miss){n.miss=true;this.stats.missed++;this.revision++}}}
 finalize(end){
  if(this.mode==='tempo'){this.advance(end+.3*rate());for(const n of this.all){if(n.hit&&!n.off&&n.pressedAt!==null){this.inputOff(n.pitch,end)}}}
  for(const g of this.groups)if(g.notes.length>1&&g.notes.every(n=>n.hit))this.gradeGroup(g);
 }
 get total(){return this.all.filter(n=>!n.skipped).length}
 get completed(){return this.total?this.all.filter(n=>n.hit&&!n.skipped).length/this.total:0}
}
