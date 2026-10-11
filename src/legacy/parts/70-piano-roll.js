// ===== v0.4 Real piano keyboard, key-aligned variable-width lanes =====
const roll=$('roll');
const BLACK_PCS=new Set([1,3,6,8,10]);
const NATURAL_RANK=[0,0,1,1,2,3,3,4,4,5,5,6];
const isBlackPitch=p=>BLACK_PCS.has(((p%12)+12)%12);
// Each natural occupies one full white-key slot. A black key is narrower and
// centered between adjacent naturals; both note lanes and keyboard share this map.
function pianoKeyGeometry(min,max,w){
 const keys=[];for(let p=min;p<=max;p++){
  const pc=((p%12)+12)%12,oct=Math.floor(p/12),rank=7*oct+NATURAL_RANK[pc];
  keys.push({pitch:p,black:BLACK_PCS.has(pc),cx:rank+(BLACK_PCS.has(pc)?1:.5),unitW:BLACK_PCS.has(pc)?.61:1});
 }
 const left=Math.min(...keys.map(k=>k.cx-k.unitW/2));
 const right=Math.max(...keys.map(k=>k.cx+k.unitW/2));
 const scale=w/Math.max(.001,right-left);
 for(const k of keys){k.x=(k.cx-k.unitW/2-left)*scale;k.w=k.unitW*scale;k.center=k.x+k.w/2;}
 return {keys,byPitch:new Map(keys.map(k=>[k.pitch,k])),min,max,scale,whites:keys.filter(k=>!k.black),blacks:keys.filter(k=>k.black)};
}
let pianoGeom=null,lastCanvasSize={w:0,h:0},keyboardTop=0,keyboardBlackH=0;

// ===== FG-00: opt-in visual guidance over the EXISTING Piano Roll keyboard =====
// These are hand-entered teaching fixtures. No arbitrary MIDI is fingered here.
// Finger numbers (1 thumb ... 5 little finger) are not observable through Web MIDI.
const FINGER_GUIDANCE_PALETTE={
 RH:{ink:'#4b94ff',fill:'rgba(74,143,240,.29)',light:'rgba(125,178,249,.5)'},
 LH:{ink:'#ec9866',fill:'rgba(242,158,104,.29)',light:'rgba(244,188,141,.5)'}
};
function fingerGuidanceSteps(){
 if(!current||state.adaptMode!=='original')return [];
 const id=current.id,valid=new Set(['demo-scale','demo-chords','demo-finger-duet']);
 if(!valid.has(id))return [];
 const scale=[1,2,3,1,2,3,4,5,4,3,2,1,3,2,1];
 const groups=new Map();
 current.tracks.forEach((track,trackIndex)=>{
  if(!state.allTracks&&trackIndex!==state.track)return;
  track.notes.forEach((n,index)=>{
   let hand='RH',finger=null;
   if(id==='demo-scale'&&trackIndex===0)finger=scale[index];
   if(id==='demo-chords'&&trackIndex===0)finger=[1,3,5][index%3];
   if(id==='demo-finger-duet'&&trackIndex<=1){
    hand=trackIndex===0?'RH':'LH';
    finger=(hand==='RH'?[1,3,5]:[5,3,1])[index%3];
   }
   if(!Number.isInteger(finger)||!Number.isInteger(n.pitch)||!Number.isFinite(n.start))return;
   // Group by original score onset, not by current time or MIDI NoteOn.
   const key=String(Math.round(n.start*1000));
   if(!groups.has(key))groups.set(key,{start:n.start,notes:[]});
   groups.get(key).notes.push({pitch:n.pitch,start:n.start,duration:n.duration,hand,finger,track:trackIndex});
  });
 });
 return [...groups.values()].sort((a,b)=>a.start-b.start);
}
function fingerGuidanceFrame(steps,now){
 const available=loop.enabled&&loop.start!==null&&loop.end!==null
  ?steps.filter(g=>g.start>=loop.start-.001&&g.start<loop.end-.001):steps;
 // Prefer the group that has begun and is still sounding; otherwise preview
 // the next onset. Deterministic across playback, Pause, Seek and Loop.
 const active=available.find(g=>g.start<=now+.015&&g.notes.some(n=>n.start+n.duration>now-.002));
 const index=active?available.indexOf(active):available.findIndex(g=>g.start>=now-.015);
 if(index<0)return {current:null,next:null};
 return {current:available[index],next:available[index+1]||null};
}
function fingerGuidancePose(items,hand,geom){
 const notes=items?.filter(n=>n.hand===hand&&geom.byPitch.has(n.pitch))||[];
 if(!notes.length)return null;
 const unit=geom.whites[0]?.w||21;
 const offsets=(hand==='RH'?[-2.15,-1.05,0,1.08,2.17]:[2.15,1.05,0,-1.08,-2.17]).map(n=>n*unit);
 const cx=notes.reduce((sum,n)=>sum+geom.byPitch.get(n.pitch).center-offsets[n.finger-1],0)/notes.length;
 const points=offsets.map((dx,i)=>{
  const n=notes.find(item=>item.finger===i+1);
  const key=n&&geom.byPitch.get(n.pitch);
  return {finger:i+1,x:key?key.center:cx+dx,active:!!key,key};
 });
 return {cx,unit,offsets,points};
}
function drawFingerGuidanceBadge(c,keyY,keyboardH,k,finger,hand,{preview=false}={}){
 const color=FINGER_GUIDANCE_PALETTE[hand];
 const y=keyY+keyboardH*(k.black?.38:.61);
 const r=Math.max(8,Math.min(11,k.w*.45));
 c.save();c.lineWidth=2;c.strokeStyle=color.ink;c.globalAlpha=preview?.55:1;
 c.beginPath();c.arc(k.center,y,r,0,2*Math.PI);
 c.fillStyle=preview?'#121820':color.ink;c.fill();c.stroke();
 c.fillStyle='#fff';c.font='bold 12px system-ui';c.textAlign='center';c.textBaseline='middle';
 c.fillText(String(finger),k.center,y+.5);c.restore();
}
// FG-00B: original vector silhouette, not traced from third-party graphics.
// One continuous Bezier outline for five fingers and the palm.
// Fingertips remain anchored to real score pitches; MIDI cannot identify fingers.
function drawFingerGuidanceHand(c,geom,keyY,keyboardH,group,hand,ghost=false){
 const pose=fingerGuidancePose(group,hand,geom);
 if(!pose)return null;
 const u=Math.max(14,Math.min(27,pose.unit));
 const H=keyboardH,cx=pose.cx;
 const ordered=pose.points.map(p=>{
  const isThumb=p.finger===1,isLittle=p.finger===5;
  // The thumb emerges from the side of the palm, unlike the four long fingers.
  const baseX=isThumb?cx+(hand==='RH'?-1.8:1.8)*u:cx+pose.offsets[p.finger-1]*.91;
  const baseY=keyY+H*(isThumb?.84:isLittle?.75:.745);
  const tipY=keyY+H*(p.active
   ?(p.key.black?.34:({1:.54,2:.455,3:.405,4:.465,5:.535}[p.finger]))
   :({1:.64,2:.555,3:.515,4:.555,5:.625}[p.finger]));
  return {...p,baseX,baseY,tipY};
 }).sort((a,b)=>a.baseX-b.baseX);
 const wristY=keyY+H*1.01;
 const innerWristY=keyY+H*.93;
 const leftWrist=cx-u*.96,rightWrist=cx+u*.96;
 const path=new Path2D();
 path.moveTo(leftWrist,wristY);
 path.bezierCurveTo(cx-u*1.12,keyY+H*.89,cx-u*2.15,keyY+H*.82,ordered[0].baseX-u*.36,ordered[0].baseY);
 for(let i=0;i<ordered.length;i++){
  const p=ordered[i],isThumb=p.finger===1,isLittle=p.finger===5;
  const bw=u*(isThumb?.60:.72),tw=u*(isThumb?.47:isLittle?.47:.53);
  const left=p.baseX-bw/2,right=p.baseX+bw/2;
  const tipLeft=p.x-tw/2,tipRight=p.x+tw/2;
  const bend=p.active?.04*u:0;
  path.bezierCurveTo(left-u*.08,p.baseY-H*.10,tipLeft-u*.06,p.tipY+u*.44+bend,tipLeft,p.tipY+tw*.19);
  path.quadraticCurveTo(p.x,p.tipY-tw*.45,tipRight,p.tipY+tw*.19);
  path.bezierCurveTo(tipRight+u*.06,p.tipY+u*.39,right+u*.07,p.baseY-H*.07,right,p.baseY);
  if(i<ordered.length-1){
   const next=ordered[i+1],nextBW=u*(next.finger===1?.60:.72);
   const nextLeft=next.baseX-nextBW/2;
   const valleyY=keyY+H*.685;
   path.quadraticCurveTo((right+nextLeft)/2,valleyY+u*.15,nextLeft,next.baseY);
  }
 }
 path.bezierCurveTo(cx+u*2.15,keyY+H*.82,cx+u*1.12,keyY+H*.89,rightWrist,wristY);
 path.lineTo(rightWrist,innerWristY+H*.11);
 path.quadraticCurveTo(cx,wristY+u*.15,leftWrist,innerWristY+H*.11);
 path.closePath();
 c.save();
 const fill=c.createLinearGradient(0,keyY+H*.38,0,wristY);
 if(hand==='RH'){
  fill.addColorStop(0,ghost?'rgba(122,183,254,.08)':'rgba(109,174,254,.67)');
  fill.addColorStop(.62,ghost?'rgba(115,164,248,.06)':'rgba(143,187,245,.37)');
  fill.addColorStop(1,ghost?'rgba(110,158,237,.04)':'rgba(102,159,238,.52)');
 }else{
  fill.addColorStop(0,ghost?'rgba(244,175,115,.08)':'rgba(248,174,120,.68)');
  fill.addColorStop(.62,ghost?'rgba(244,180,133,.06)':'rgba(248,191,153,.38)');
  fill.addColorStop(1,ghost?'rgba(240,160,120,.04)':'rgba(230,156,108,.53)');
 }
 c.shadowColor=ghost?'transparent':'rgba(7,17,32,.18)';c.shadowBlur=ghost?0:10;
 c.fillStyle=fill;c.fill(path);c.shadowBlur=0;
 c.strokeStyle=ghost?(hand==='RH'?'rgba(153,196,255,.44)':'rgba(255,199,155,.44)'):(hand==='RH'?'rgba(61,123,210,.92)':'rgba(189,99,49,.92)');
 c.lineWidth=ghost?1.5:1.65;
 if(ghost)c.setLineDash([5,5]);c.stroke(path);c.setLineDash([]);
 if(!ghost){
  // Subtle knuckle creases: no cartoon bone strokes or hard polygon joints.
  for(let i=0;i<ordered.length-1;i++){
   const a=ordered[i],b=ordered[i+1],x=(a.baseX+b.baseX)/2;
   c.beginPath();c.moveTo(x,keyY+H*.738);
   c.bezierCurveTo(x-u*.08,keyY+H*.78,x+u*.12,keyY+H*.80,x+u*.10,keyY+H*.83);
   c.strokeStyle=hand==='RH'?'rgba(39,106,185,.19)':'rgba(157,81,45,.19)';
   c.lineWidth=1;c.stroke();
  }
 }
 for(const p of ordered){
  if(!p.active){
   if(!ghost){
    c.beginPath();c.ellipse(p.x,p.tipY+2,Math.max(2.5,u*.18),Math.max(2,u*.09),0,0,Math.PI*2);
    c.fillStyle=hand==='RH'?'rgba(211,229,255,.75)':'rgba(255,226,206,.75)';c.fill();
   }
   continue;
  }
  const radius=Math.max(8.5,Math.min(11.5,u*.48));
  c.beginPath();c.arc(p.x,p.tipY,radius,0,2*Math.PI);
  if(ghost){
   c.strokeStyle=hand==='RH'?'rgba(102,172,250,.8)':'rgba(244,165,104,.8)';
   c.lineWidth=1.5;c.setLineDash([2,3]);c.stroke();c.setLineDash([]);
  }else{
   c.shadowColor='rgba(2,9,23,.31)';c.shadowBlur=5;c.shadowOffsetY=1;
   c.fillStyle=hand==='RH'?'#3677d4':'#cb713e';c.fill();
   c.shadowBlur=0;c.shadowOffsetY=0;
   c.strokeStyle='rgba(255,255,255,.94)';c.lineWidth=1.8;c.stroke();
   c.fillStyle='#fff';c.font='700 11px system-ui';c.textAlign='center';c.textBaseline='middle';
   c.fillText(String(p.finger),p.x,p.tipY+.35);
  }
 }
 c.restore();return pose;
}
function drawFingerGuidance(c,geom,keyY,keyboardH,handsAllowed){
 const status=$('fingerGuideStatus'),mode=state.fingerGuidanceMode,steps=mode==='off'?[]:fingerGuidanceSteps();
 const hasPreset=current&&['demo-scale','demo-chords','demo-finger-duet'].includes(current.id);
 const message=mode==='off'?'':state.adaptMode!=='original'?'Адаптация: подсказки пока недоступны':
  !hasPreset?'Для этой пьесы пока нет подтверждённой аппликатуры':
  !steps.length?'Для выбранной партии пока нет подсказок':'Демо-аппликатура · MIDI не определяет реальные пальцы';
 if(status&&status.textContent!==message)status.textContent=message;
 if(!steps.length)return;
 const {current:group,next}=fingerGuidanceFrame(steps,pos);
 if(!group)return;
 if(mode==='numbers'||!handsAllowed){
  for(const n of group.notes){const k=geom.byPitch.get(n.pitch);if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,n.finger,n.hand);}
  return;
 }
 if(mode==='ghost'&&next){
  for(const hand of ['LH','RH']){
   const a=fingerGuidancePose(group.notes,hand,geom),b=fingerGuidancePose(next.notes,hand,geom);
   if(a&&b&&Math.abs(a.cx-b.cx)>a.unit*.4){
    c.save();c.strokeStyle=FINGER_GUIDANCE_PALETTE[hand].ink;c.globalAlpha=.46;
    c.lineWidth=2;c.setLineDash([5,4]);c.beginPath();
    const y=keyY+keyboardH*.9;
    c.moveTo(a.cx,y);c.quadraticCurveTo((a.cx+b.cx)/2,y-17,b.cx,y);c.stroke();c.restore();
   }
   drawFingerGuidanceHand(c,geom,keyY,keyboardH,next.notes,hand,true);
  }
 }
 for(const hand of ['LH','RH'])drawFingerGuidanceHand(c,geom,keyY,keyboardH,group.notes,hand);
}

function resizeCanvas(){
 const wrap=$('rollWrap'),r=wrap.getBoundingClientRect(),visibleW=Math.max(1,Math.floor(r.width));
 const range=noteRange(),naturalCount=Array.from({length:range.max-range.min+1},(_,i)=>range.min+i).filter(p=>!isBlackPitch(p)).length;
 // With a large instrument, prefer horizontal scroll to unreadable 3px keys.
 const minWidth=Math.max(visibleW,naturalCount*21);
 const cssW=Math.ceil(minWidth),cssH=Math.max(1,Math.round(r.height));
 if(roll.style.width!==cssW+'px')roll.style.width=cssW+'px';
 const dpr=Math.min(2,devicePixelRatio||1);
 if(roll.width!==Math.round(cssW*dpr)||roll.height!==Math.round(cssH*dpr)){roll.width=Math.round(cssW*dpr);roll.height=Math.round(cssH*dpr);}
 roll.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
 return {w:cssW,h:cssH};
}
function renderCanvas(){
 if(!current)return;
 const {w,h}=resizeCanvas();lastCanvasSize={w,h};const c=roll.getContext('2d');
 c.clearRect(0,0,w,h);c.fillStyle='#111720';c.fillRect(0,0,w,h);
 const r=noteRange(),notes=notesToShow(),handsAllowed=h>=310&&['hands','ghost'].includes(state.fingerGuidanceMode),keyboardH=handsAllowed?Math.max(145,Math.min(184,h*.34)):Math.min(90,Math.max(64,h*.22)),keyY=h-keyboardH,strikeY=keyY-10,pxPerSec=Math.max(8,(strikeY-14)/6);
 keyboardTop=keyY;keyboardBlackH=keyboardH*.61;
 const pad=4,geom=pianoGeom=pianoKeyGeometry(r.min,r.max,w-2*pad);
 // Shift computed geometry into the padded canvas coordinate system.
 geom.keys.forEach(k=>{k.x+=pad;k.center+=pad;});
 // Full natural-key columns. Black-key strips overlay the white ones.
 for(const k of geom.whites){c.fillStyle='#1c2735';c.fillRect(k.x,0,k.w,keyY);c.strokeStyle='#324253';c.lineWidth=.65;c.strokeRect(k.x+.35,.3,k.w-.7,keyY-.5);}
 for(const k of geom.blacks){c.fillStyle='#0c121c';c.fillRect(k.x,0,k.w,keyY);c.strokeStyle='#3d4555';c.lineWidth=.65;c.strokeRect(k.x+.4,.3,Math.max(0,k.w-.8),keyY-.5);}
 // Shared seconds guide; top of falling note is note-off, bottom is note-on.
 for(let delta=0;delta<=8;delta++){
  const y=strikeY-delta*pxPerSec;if(y<0)break;
  c.strokeStyle=delta===0?'#f2a18399':'#9aa7b333';c.lineWidth=delta===0?2:1;
  c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();
  if(delta){c.fillStyle='#98abc7';c.font='10px system-ui';c.fillText('+'+delta+'s',w-32,y-4)}
 }
 // Draw whites first, then blacks on top. Piano roll lanes have the exact
 // same center and widths as the physical-looking keyboard below.
 // The highlight uses exact sounding note references, not just a pitch/time
 // approximation; an unrelated repeat of the same key stays unlit.
 const audibleNotes=state.highlight?soundingScoreNotes():new Set();
 const playedNotes=state.highlight?performedScoreNotes():new Set();
 hitboxes=[];
 for(const blackLayer of [false,true])for(const n of notes){
  if(isBlackPitch(n.pitch)!==blackLayer)continue;
  const k=geom.byPitch.get(n.pitch);if(!k)continue;
  const top=strikeY-(n.start+n.duration-pos)*pxPerSec;
  const bottom=strikeY-(n.start-pos)*pxPerSec;
  if(bottom<0||top>keyY)continue;
  const inset=Math.min(2,Math.max(.55,k.w*.075)),x=k.x+inset,y=Math.max(0,top),nw=Math.max(1,k.w-2*inset),nh=Math.min(keyY,bottom)-y;
  if(nh<1)continue;
  let color=['#df947d','#85b5ee','#a3c89c','#c7a1ec','#ebc274'][n.track%5];
  if(state.mode!=='listen'&&n.track===state.track){const hit=reviewForNote(n);if(hit?.miss)color='#e77578';else if(hit?.hit){if(hit.chordSpreadMs>140)color='#ff8a97';else if(hit.holdRatio!=null&&(hit.holdRatio<.7||hit.holdRatio>1.4))color='#dfae5d';else if(hit.timingMs!=null&&Math.abs(hit.timingMs)>110)color='#ae9cf5';else color='#73c6ae';}}
  const audible=audibleNotes.has(n),personal=playedNotes.has(n);
  // Past notes recede subtly while future notes keep the track colour.
  // The sounding block has a cyan fill + halo; player's note has an orange
  // frame. The two states are deliberately distinct and can coexist.
  const passed=pos>=n.start+n.duration+.02;
  c.save();
  c.globalAlpha=audible||personal||selectedNote===n?1:passed?.40:.92;
  if(audible){c.shadowColor='#70d7ff';c.shadowBlur=19;c.shadowOffsetY=0;}
  c.fillStyle=audible?'#80d9ff':color;
  c.beginPath();c.roundRect(x,y,nw,nh,Math.min(4,nw/5));c.fill();
  c.shadowBlur=0;
  if(audible){
   // The bright stroke stays visible even when notes cross the strike line.
   c.strokeStyle='#ecfcff';c.lineWidth=Math.min(2.6,Math.max(1.3,nw*.13));
   c.stroke();
   if(nh>11&&nw>5){c.fillStyle='#effcffaa';c.fillRect(x+2,y+Math.min(3,nh/4),Math.max(0,nw-4),Math.min(3,nh/6));}
  }
  if(personal){
   c.strokeStyle='#ffb18b';c.lineWidth=Math.min(3.1,Math.max(1.8,nw*.17));
   c.stroke();
   if(nw>=13&&nh>15){c.fillStyle='#ffb18b';c.fillRect(x+2,y+nh-6,Math.max(0,nw-4),3);}
  }
  if(Number.isInteger(n.sourcePitch)&&n.sourcePitch!==n.pitch){c.strokeStyle='#ffffffb8';c.lineWidth=1.1;c.stroke();}
  if(selectedNote===n){c.strokeStyle='#fff';c.lineWidth=1.5;c.setLineDash([3,3]);c.stroke();c.setLineDash([]);}
  c.restore();
  if(state.labels&&nw>=24&&nh>18){c.fillStyle=audible?'#062439':'#171d25';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(nameOf(n.pitch),k.center,y+13);c.textAlign='left';}
  hitboxes.push({x,y,w:nw,h:nh,n});
 }
 if(loop.start!=null&&loop.end!=null){
  const a=strikeY-(loop.start-pos)*pxPerSec,b=strikeY-(loop.end-pos)*pxPerSec;
  c.fillStyle='#f1a07b18';c.fillRect(0,Math.max(0,b),w,Math.max(0,Math.min(keyY,a)-Math.max(0,b)));
  c.fillStyle='#f0b39b';c.font='10px system-ui';c.fillText('LOOP',8,17);
 }
 if(state.mode==='wait'&&practice?.nextGroup())for(const n of practice.nextGroup().notes){
  if(n.hit)continue;const k=geom.byPitch.get(n.pitch);if(!k)continue;
  c.fillStyle='#f6dc8c66';c.fillRect(k.x,keyY-16,k.w,15);
 }
 // The active synth notes stay held in the visual keyboard for their FULL
 // scheduled audible duration (including long notes and simultaneous chords).
 const playbackHeld=state.highlight?soundingSongKeys():new Set();
 if($('songActive'))$('songActive').textContent='♫ '+playbackHeld.size;
 // Realistic two-layer piano: white naturals full height, black accidentals
 // above the whites. Both are driven by the calibrated MIDI note range.
 c.fillStyle='#090d13';c.fillRect(0,keyY,w,keyboardH);
 for(const k of geom.whites){
  const physical=state.highlight&&midiHeld.has(k.pitch),audible=state.highlight&&playbackHeld.has(k.pitch);
  const down=physical||audible,offset=down?2:0;
  c.fillStyle=physical?'#f0b198':audible?'#90bcf3':'#e7eaf1';c.fillRect(k.x+.5,keyY+2+offset,Math.max(.6,k.w-1),keyboardH-4-offset);
  c.fillStyle=physical?'#cc775f':audible?'#4e89d5':'#b7bfcb';c.fillRect(k.x+1,keyY+keyboardH-9,Math.max(0,k.w-2),6);
  c.strokeStyle=physical?'#e47e62':audible?'#5c9fe9':'#777f8c';c.lineWidth=down?1.7:1;c.strokeRect(k.x+.5,keyY+1.5+offset,Math.max(.5,k.w-1),keyboardH-3-offset);
  if(k.w>17&&(k.pitch%12===0||k.pitch===r.min)){
   c.textAlign='center';c.font='bold 10px system-ui';c.fillStyle='#566174';c.fillText(nameOf(k.pitch),k.center,keyY+keyboardH-15);c.textAlign='left';
  }
 }
 for(const k of geom.blacks){
  const physical=state.highlight&&midiHeld.has(k.pitch),audible=state.highlight&&playbackHeld.has(k.pitch),down=physical||audible;
  const y=keyY+2+(down?3:0),ht=keyboardBlackH-(down?3:0);
  c.shadowColor='#03060b';c.shadowBlur=5;c.shadowOffsetY=3;
  c.fillStyle=physical?'#db8b74':audible?'#568bcd':'#171b24';c.fillRect(k.x,y,k.w,ht);
  c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
  c.fillStyle=physical?'#edac92':audible?'#a1caff':'#505a6c';c.fillRect(k.x+1,y+2,Math.max(0,k.w-2),Math.min(3,ht/8));
  c.fillStyle=physical?'#bb6c5b':audible?'#3876c5':'#0c1018';c.fillRect(k.x+1,y+ht-8,Math.max(0,k.w-2),6);
 }
 c.strokeStyle='#e5997f';c.lineWidth=2;c.beginPath();c.moveTo(0,strikeY);c.lineTo(w,strikeY);c.stroke();
 drawFingerGuidance(c,geom,keyY,keyboardH,handsAllowed);
}
function noteHit(e){const box=roll.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;return hitboxes.slice().reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.n||null;}
function virtualKeyAt(e){
 if(!pianoGeom)return null;
 const rect=roll.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 if(y<keyboardTop||y>rect.height)return null;
 // Black keys win hit-testing only over their actual short raised section.
 if(y<=keyboardTop+keyboardBlackH+3){const black=pianoGeom.blacks.find(k=>x>=k.x&&x<k.x+k.w);if(black)return black.pitch;}
 const natural=pianoGeom.whites.find(k=>x>=k.x&&x<k.x+k.w);
 return natural?.pitch??null;
}
let virtualPointer=null;
roll.addEventListener('pointerdown',e=>{
 if(e.button!==0||virtualPointer!==null)return;
 const pitch=virtualKeyAt(e);if(pitch===null)return;
 e.preventDefault();roll.setPointerCapture(e.pointerId);virtualPointer={id:e.pointerId,pitch};
 onNoteOn(pitch,Math.round(90),'virtual');
});
roll.addEventListener('pointermove',e=>{
 if(!virtualPointer||e.pointerId!==virtualPointer.id)return;
 const pitch=virtualKeyAt(e);
 if(pitch===virtualPointer.pitch)return;
 onNoteOff(virtualPointer.pitch,'virtual');virtualPointer.pitch=pitch;
 if(pitch!==null)onNoteOn(pitch,90,'virtual');
});
function endVirtualPointer(e){if(!virtualPointer||e.pointerId!==virtualPointer.id)return;if(virtualPointer.pitch!==null)onNoteOff(virtualPointer.pitch,'virtual');virtualPointer=null;}
roll.addEventListener('pointerup',endVirtualPointer);
roll.addEventListener('pointercancel',endVirtualPointer);
roll.addEventListener('lostpointercapture',endVirtualPointer);
function selectNote(n){selectedNote=n;if(!n){$('selection').innerHTML='<strong>Ничего не выбрано</strong><p>Щёлкни цветную ноту на Piano Roll.</p>';return}$('selection').replaceChildren();const head=document.createElement('strong'),desc=document.createElement('p');head.textContent=nameOf(n.pitch)+' · MIDI '+n.pitch+(Number.isInteger(n.sourcePitch)&&n.sourcePitch!==n.pitch?' · из '+nameOf(n.sourcePitch):'');desc.textContent='Дорожка: '+(current.tracks[n.track]?.name||n.track)+' | Позиция: '+n.start.toFixed(2)+' с | Длительность: '+n.duration.toFixed(2)+' с | Velocity: '+n.velocity;$('selection').append(head,desc);const review=reviewForNote(n);if(review){const p=document.createElement('p');p.className='small';p.textContent=review.miss?'Разбор: пропущена':review.hit?'Разбор: сыграна'+(review.timingMs!=null?' · отклонение '+Math.round(review.timingMs)+' мс':'')+(review.holdRatio!=null?' · удержание '+Math.round(review.holdRatio*100)+'%':'')+(review.chordSpreadMs!=null?' · разброс аккорда '+Math.round(review.chordSpreadMs)+' мс':''):'Разбор: нет данных о нажатии';$('selection').append(p)}if(!state.right){state.right=true;applyPanels()}switchRightTab('practice');}
function contextMenu(e){e.preventDefault();let n=noteHit(e);const opts=n?[['Свойства и оценка ноты',()=>selectNote(n)],['Открыть разбор исполнения',()=>openReview()],['Начать отсюда',()=>seek(n.start)],['Начало повтора здесь',()=>{loop.start=n.start;ensureLoop();}],['Конец повтора здесь',()=>{loop.end=n.start+n.duration;ensureLoop();}],['Добавить закладку',()=>bookmark(n.start)]]:[['Начать отсюда',()=>seek(pos)],['Начало Loop',()=>{loop.start=pos;ensureLoop()}],['Конец Loop',()=>{loop.end=pos;ensureLoop()}],['Сбросить Loop',()=>{loop={start:null,end:null,enabled:false};updateUI()}]];showMenu(e.clientX,e.clientY,opts)}
function showMenu(x,y,opts){const m=$('contextMenu');m.innerHTML='';for(const [label,fn] of opts){let b=document.createElement('button');b.textContent=label;b.onclick=()=>{hideMenu();fn()};m.append(b)}m.classList.add('show');let r=m.getBoundingClientRect();m.style.left=clamp(x,4,innerWidth-r.width-5)+'px';m.style.top=clamp(y,4,innerHeight-r.height-5)+'px'}function hideMenu(){$('contextMenu').classList.remove('show')}
function ensureLoop(){if(loop.start!=null&&loop.end!=null){let a=Math.min(loop.start,loop.end),b=Math.max(loop.start,loop.end);loop.start=a;loop.end=b;loop.enabled=b>a+.1}updateUI()}
function bookmark(at=pos){bookmarks.push(at);persist();notify('Закладка добавлена на '+fmt(at))}
let alertTimeout=null;function notify(s){$('rollStatus').textContent=s;clearTimeout(alertTimeout);alertTimeout=setTimeout(()=>{if(!isPlaying)$('rollStatus').textContent='⏸ Готово к воспроизведению'},2600)}