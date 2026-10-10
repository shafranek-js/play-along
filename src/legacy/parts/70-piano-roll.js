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
 const r=noteRange(),notes=notesToShow(),keyboardH=Math.min(90,Math.max(64,h*.22)),keyY=h-keyboardH,strikeY=keyY-10,pxPerSec=Math.max(8,(strikeY-14)/6);
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
function bookmark(at=pos){bookmarks.push(at);notify('Закладка добавлена на '+fmt(at))}
let alertTimeout=null;function notify(s){$('rollStatus').textContent=s;clearTimeout(alertTimeout);alertTimeout=setTimeout(()=>{if(!isPlaying)$('rollStatus').textContent='⏸ Готово к воспроизведению'},2600)}
