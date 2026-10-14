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
let pianoGeom=null,lastCanvasSize={w:0,h:0},keyboardTop=0,keyboardBottom=0,keyboardBlackH=0;

// FG-03C2A: one score key per unmodified imported XML payload.
let fingerOverrideMemoSong=null,fingerOverrideMemoKey=null;
// History is ephemeral, strictly per SOURCE SCORE, never included in backup.
const fingerOverrideHistories=new Map();
function fingerGuideWorkKey(){
 if(!current)return null;
 if(current!==fingerOverrideMemoSong){
  fingerOverrideMemoSong=current;
  fingerOverrideMemoKey=fingerOverrideWorkKey(current);
 }
 return fingerOverrideMemoKey;
}
function fingerOverrideHistoryCurrent(){
 return fingerOverrideHistories.get(fingerGuideWorkKey())||fingerHistoryEmpty();
}
function fingerOverrideForNote(note){
 const key=fingerGuideWorkKey();
 return key&&note?.noteId?fingerOverrideEffective(note,state.fingerOverrides?.[key]?.[note.noteId]):null;
}
// The selection is transient and scoped to an original source work.
let fingerSelectedIds=new Set(),fingerSelectionAnchor=null,fingerSelectionPointer=null;
function fingerSelectionAvailable(){
 return !!current&&current.format==='MusicXML'&&state.adaptMode==='original'&&!!fingerGuideWorkKey();
}
function fingerSelectionOrdered(){return fingerSelectableNotes(current)}
function fingerSelectionSet(ids,anchor=null){
 if(!fingerSelectionAvailable())return;
 const ordered=fingerSelectionOrdered(),valid=new Set(ordered.map(e=>e.id));
 fingerSelectedIds=new Set(ids.filter(id=>valid.has(id)));
 fingerSelectionAnchor=valid.has(anchor)?anchor:
  (fingerSelectedIds.size?[...fingerSelectedIds][fingerSelectedIds.size-1]:null);
 const primary=ordered.find(e=>e.id===fingerSelectionAnchor&&fingerSelectedIds.has(e.id))?.note||
  ordered.find(e=>fingerSelectedIds.has(e.id))?.note||null;
 selectNote(primary,{keepGroup:true});
 renderCanvas();if(state.scoreView==='editor')fingerEditorRender();
}
function fingerSelectionShortcut(e){
 if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='a'||
  !fingerSelectionAvailable()||state.page!=='practice'||!['roll','editor'].includes(state.scoreView))return false;
 const focused=document.activeElement;
 if(focused?.closest('input,textarea,select,[contenteditable="true"]'))return false;
 if(focused!==roll&&focused!==fingerEditorCanvas&&!fingerEditorScroller.contains(focused)&&!$('selection').contains(focused)&&
  !(focused===document.body&&fingerSelectedIds.size))return false;
 e.preventDefault();
 const ordered=fingerSelectionOrdered();
 fingerSelectionSet(ordered.map(e=>e.id),ordered[0]?.id||null);
 return true;
}
function fingerOverrideCommit(note,choice,{action='edit',batch=null}={}){
 if(!fingerSelectionAvailable())return false;
 const key=fingerGuideWorkKey(),history=fingerOverrideHistoryCurrent();
 let transition;
 if(action==='edit'){
  if(!note?.noteId)return false;
  const previous=state.fingerOverrides?.[key]?.[note.noteId]??null;
  transition=fingerHistoryTransition(history,'edit',{id:note.noteId,before:previous,
   after:choice===null?null:{finger:choice?.finger,hand:choice?.hand}});
 }else if(action==='batch'){
  transition=fingerHistoryTransition(history,'batch',{entries:batch});
 }else transition=fingerHistoryTransition(history,action);
 if(!transition)return false;
 const changes=transition.changes||[];
 const sources=new Map(fingerSelectionOrdered().map(e=>[e.id,e.note]));
 for(const change of changes){
  const source=sources.get(change.id);
  if(!source||(action==='edit'&&source.pitch!==note.pitch))return false;
  const present=state.fingerOverrides?.[key]?.[change.id]??null;
  if(!fingerHistorySame(present,change.expected)){
   // A restored backup or external user action invalidates stale history.
   fingerOverrideHistories.delete(key);
   notify('История правок изменилась — проверь ноты и повтори действие.');
   if(selectedNote?.noteId)selectNote(selectedNote,{keepGroup:true});
   return false;
  }
 }
 const work={...(state.fingerOverrides?.[key]||{})};
 for(const change of changes){
  if(change.value===null)delete work[change.id];
  else work[change.id]={finger:change.value.finger,hand:change.value.hand};
 }
 const next={...state.fingerOverrides};
 if(Object.keys(work).length)next[key]=work;else delete next[key];
 let validated;
 try{
  validated=fingerOverrideValidate(next,{strict:true});
  // All-or-nothing even for large selections: no state/undo mutation until
  // the complete prospective snapshot is validated and actually persisted.
  localStorage.setItem(STORE,JSON.stringify({...state,fingerOverrides:validated}));
 }catch(err){notify('Не удалось сохранить аппликатуру: '+err.message);return false}
 state.fingerOverrides=validated;
 scoreFingerCorrectionsChanged();
 fingerOverrideHistories.delete(key);
 fingerOverrideHistories.set(key,transition.history);
 while(fingerOverrideHistories.size>12)
  fingerOverrideHistories.delete(fingerOverrideHistories.keys().next().value);
 renderCanvas();if(selectedNote?.noteId)selectNote(selectedNote,{keepGroup:true});
 if(state.scoreView==='editor')fingerEditorRender();
 if(current?.id)void libraryCoverageStore(current,current.id)
  .catch(e=>console.warn('Coverage after correction failed',e));
 return true;
}
function fingerOverrideCommitGroup(ids,{finger,hand,reset=false}={}){
 if(!fingerSelectionAvailable())return false;
 if(!reset&&finger===undefined&&hand===undefined)return false;
 const sources=new Map(fingerSelectionOrdered().map(e=>[e.id,e.note]));
 const key=fingerGuideWorkKey(),work=state.fingerOverrides?.[key]||{},entries=[];
 for(const id of ids){
  const source=sources.get(id);if(!source)return false;
  const before=work[id]??null;
  const after=reset?null:fingerBulkChoice(source,before,{finger,hand});
  if(after===undefined)return false;
  if(!fingerHistorySame(before,after))entries.push({id,before,after});
 }
 if(!entries.length){notify('Для выбранных нот ничего не изменилось');return false}
 const success=fingerOverrideCommit(null,null,{action:'batch',batch:entries});
 if(success)notify('Аппликатура обновлена: '+entries.length+' нот · одно действие отмены');
 return success;
}
// ===== FG-00: opt-in visual guidance over the EXISTING Piano Roll keyboard =====
// These are hand-entered teaching fixtures. No arbitrary MIDI is fingered here.
// Finger numbers (1 thumb ... 5 little finger) are not observable through Web MIDI.
const FINGER_GUIDANCE_PALETTE={
 RH:{ink:'#cd7d4f',fill:'rgba(229,157,112,.29)',light:'rgba(245,195,155,.5)'},
 LH:{ink:'#397be2',fill:'rgba(73,134,234,.29)',light:'rgba(134,180,247,.5)'}
};
function fingerGuidanceSteps(){
 if(!current||state.adaptMode!=='original')return [];
 const id=current.id,validDemo=new Set(['demo-scale','demo-chords','demo-finger-duet']);
 const demo=validDemo.has(id);
 // For non-demo works only explicitly annotated MusicXML is eligible.
 // An ordinary MIDI pitch is never treated as evidence of a finger.
 const key=fingerGuideWorkKey(),edits=key?state.fingerOverrides?.[key]||{}:{};
 if(!demo&&!current.tracks.some(t=>t.notes.some(n=>['musicxml','pianomotion','user'].includes(n.fingeringSource)&&Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5))&&!Object.keys(edits).length)return [];
 const scale=[1,2,3,1,2,3,4,5,4,3,2,1,3,2,1];
 const events=[];
 current.tracks.forEach((track,trackIndex)=>{
  if(!state.allTracks&&trackIndex!==state.track)return;
  track.notes.forEach((n,index)=>{
   let hand=null,finger=null,source=null;
   if(demo){
    if(id==='demo-scale'&&trackIndex===0){hand='RH';finger=scale[index]}
    if(id==='demo-chords'&&trackIndex===0){hand='RH';finger=[1,3,5][index%3]}
    if(id==='demo-finger-duet'&&trackIndex<=1){
     hand=trackIndex===0?'RH':'LH';
     finger=(hand==='RH'?[1,3,5]:[5,3,1])[index%3];
    }
    source='demo';
   }else if(fingerOverrideEffective(n,edits[n.noteId])){
    const selected=fingerOverrideEffective(n,edits[n.noteId]);
    finger=selected.finger;hand=selected.hand;source='user';
   }else if(['musicxml','pianomotion','user'].includes(n.fingeringSource)&&
      Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5){
    // Keep trusted author fingers and only explicitly accepted session edits
    // (including user-applied PianoMotion suggestions). Never convert imported
    // musicxml-user-export-unverified digits into learner-facing guidance.
    finger=n.finger;hand=n.hand==='RH'||n.hand==='LH'?n.hand:null;
    source=n.fingeringSource==='musicxml'?'musicxml':'user';
   }
   // Preserve ALL source-note onsets, including notes with no trusted finger.
   // Otherwise a later annotated group could be shown prematurely while an
   // earlier, unannotated score event still needs to be played.
   events.push({pitch:n.pitch,start:n.start,duration:n.duration,hand,finger,track:trackIndex,
    source,...(n.noteId?{noteId:n.noteId}:{})});
  });
 });
 return fingerGuidanceTimeline(events);
}
function fingerGuidanceFrame(steps,now){
 // In active Listen transport, hands follow the keys actually depressed by
 // the source notation, never the NEXT note merely because it is upcoming.
 if(state.mode==='listen'&&isPlaying)return fingerGuidancePlayingFrame(steps,now,loop);
 const available=loop.enabled&&loop.start!==null&&loop.end!==null
  ?steps.filter(g=>g.start>=loop.start-.001&&g.start<loop.end-.001):steps;
 const empty={current:null,next:null};
 if(!available.length)return empty;
 const looping=loop.enabled&&loop.start!==null&&loop.end!==null;
 const following=i=>available[i+1]||(looping?available[0]:null);
 // In Wait, the transport is deliberately frozen on the expected onset.
 // Use scoring progress, not the frozen audio clock, to decide which keys
 // still need to be pressed. Partially played chords keep only missing keys.
 if(state.mode==='wait'&&practice){
  const pending=practice.nextGroup();
  if(!pending)return empty;
  const onset=practice.playableStart(pending);
  const index=available.findIndex(g=>Math.abs(g.start-onset)<=.026);
  if(index<0)return empty; // No annotated fingering for the next task.
  const finishedPitches=new Set(pending.notes.filter(n=>!n.skipped&&(n.hit||n.miss)).map(n=>n.pitch));
  const target=available[index];
  const remaining=target.notes.filter(n=>!finishedPitches.has(n.pitch));
  if(!remaining.length)return empty;
  return {current:{...target,notes:remaining},next:following(index)};
 }
 // In Listen/Tempo, the active note is NOT a teaching hint: show the next
 // onset, even while earlier keys remain down or their sound sustains.
 // At the initial playback/loop boundary, preview the first group.
 const origin=looping?loop.start:0;
 let index=now<=origin+.001?0:available.findIndex(g=>g.start>now+.001);
 if(index<0&&looping)index=0; // Prepare the next iteration of a loop.
 if(index<0)return empty;
 if(state.mode==='tempo'&&practice){
  // An accurately played early note is no longer the next task.
  while(index>=0&&index<available.length){
   const target=available[index];
   const scored=practice.groups.find(g=>Math.abs(g.start-target.start)<=.026);
   const completed=scored?.notes.some(n=>!n.skipped)&&scored.notes.every(n=>n.skipped||n.hit);
   if(!completed)break;
   index++;
  }
  if(index>=available.length)index=looping?0:-1;
 }
 if(index<0)return empty;
 return {current:available[index],next:following(index)};
}
function fingerGuidancePose(items,hand,geom){
 const notes=items?.filter(n=>n.hand===hand&&geom.byPitch.has(n.pitch))||[];
 if(!notes.length)return null;
 const unit=geom.whites[0]?.w||21;
 const offsets=(hand==='RH'?[-1.75,-.95,-.12,.83,1.68]:[1.75,.95,.12,-.83,-1.68]).map(n=>n*unit);
 const cx=notes.reduce((sum,n)=>sum+geom.byPitch.get(n.pitch).center-offsets[n.finger-1],0)/notes.length;
 const points=offsets.map((dx,i)=>{
  const n=notes.find(item=>item.finger===i+1);
  const key=n&&geom.byPitch.get(n.pitch);
  return {finger:i+1,x:key?key.center:cx+dx,active:!!key,key};
 });
 return {cx,unit,offsets,points};
}
function drawFingerGuidanceBadge(c,keyY,keyboardH,k,finger,hand,{preview=false,previewAlpha=.55}={}){
 const color=FINGER_GUIDANCE_PALETTE[hand]||{ink:'#737d90'};
 const y=keyY+keyboardH*(k.black?.38:.61);
 const r=Math.max(8,Math.min(11,k.w*.45));
 c.save();c.lineWidth=2;c.strokeStyle=color.ink;c.globalAlpha=preview?previewAlpha:1;
 c.beginPath();c.arc(k.center,y,r,0,2*Math.PI);
 c.fillStyle=preview?'#121820':color.ink;c.fill();c.stroke();
 c.fillStyle='#fff';c.font='bold 12px system-ui';c.textAlign='center';c.textBaseline='middle';
 c.fillText(Number.isInteger(finger)&&finger>=1&&finger<=5?String(finger):'?',k.center,y+.5);c.restore();
}
// FG-01A: original user-provided hand poses: 7 for LH and 7 for RH.
// Each finger silhouette is a distinct PNG. Finger contact markers remain
// driven by the score and pianoKeyGeometry, NEVER guessed from a bitmap.
const FINGER_GUIDANCE_POSE_NAMES={1:'thumb',2:'index',3:'middle',4:'ring',5:'pinky'};
const FINGER_GUIDANCE_IMAGES={};
const FINGER_GUIDANCE_TIPS={
 RH:{thumb:{1:.078},index:{2:.270},middle:{3:.475},ring:{4:.690},pinky:{5:.908},
     spread:{1:.074,2:.285,3:.488,4:.704,5:.917}},
 LH:{thumb:{1:.921},index:{2:.730},middle:{3:.515},ring:{4:.310},pinky:{5:.091},
     spread:{1:.923,2:.706,3:.505,4:.302,5:.088}}
};
// Height of the active fingertip within each original image. This is only
// visual registration; scoring/actual keyboard interaction does not use it.
const FINGER_GUIDANCE_TIP_Y={
 thumb:.40,index:.035,middle:.04,ring:.055,pinky:.075,spread:.075
};
function fingerGuidancePoseName(items,hand){
 const notes=(items||[]).filter(n=>n.hand===hand&&Number.isInteger(n.finger));
 if(!notes.length)return 'rest';
 if(notes.length>1)return 'spread';
 return FINGER_GUIDANCE_POSE_NAMES[notes[0].finger]||'rest';
}
function fingerGuidanceGetImage(hand,pose){
 if(!['LH','RH'].includes(hand))return null;
 const name=['thumb','index','middle','ring','pinky','rest','spread'].includes(pose)?pose:'rest';
 const id=hand+':'+name;
 if(FINGER_GUIDANCE_IMAGES[id])return FINGER_GUIDANCE_IMAGES[id];
 const image=new Image();
 const entry=FINGER_GUIDANCE_IMAGES[id]={image,loaded:false,error:false,hand,pose:name};
 image.onload=()=>{entry.loaded=true;if(state.fingerGuidanceMode!=='off'&&current)renderCanvas()};
 image.onerror=()=>{entry.error=true;if(state.fingerGuidanceMode!=='off'&&current)renderCanvas()};
 // Lazy load: do not transfer 14 images when guidance is disabled.
 const side=hand==='LH'?'left':'right';
 image.src='./assets/finger-guidance/poses/'+side+'/'+side+'-'+name+'.png';
 return entry;
}
function fingerGuidanceSpritePlacement(notes,hand,geom,keyboardH,tail=0){
 if(!geom?.whites?.length)return null;
 // A partial chord is not a valid full-hand pose: if any authored note
 // lies outside the visible keyboard, show in-range numeric keys only.
 const handNotes=(notes||[]).filter(n=>n.hand===hand);
 if(!handNotes.length||handNotes.some(n=>!geom.byPitch.has(n.pitch)||!Number.isInteger(n.finger)))return null;
 const items=handNotes;
 const pose=fingerGuidancePoseName(items,hand),tips=FINGER_GUIDANCE_TIPS[hand][pose];
 const unit=geom.whites[0].w,refW=unit*(pose==='spread'?5.25:4.85);
 const data=items.map(n=>({finger:n.finger,x:geom.byPitch.get(n.pitch).center,tx:tips[n.finger]}));
 if(data.some(n=>!Number.isFinite(n.tx)))return null;
 const mx=data.reduce((a,b)=>a+b.tx,0)/data.length;
 const my=data.reduce((a,b)=>a+b.x,0)/data.length;
 let width=refW;
 if(data.length>1){
  const covariance=data.reduce((a,b)=>a+(b.tx-mx)*(b.x-my),0);
  const variance=data.reduce((a,b)=>a+(b.tx-mx)**2,0);
  if(variance<.00001||covariance<=0)return null;
  width=clamp(covariance/variance,unit*3.3,unit*6.6);
 }
 const x=my-mx*width;
 const error=Math.max(...data.map(d=>Math.abs(x+d.tx*width-d.x)));
 if(error>Math.max(12,unit*.48))return null;
 const entry=fingerGuidanceGetImage(hand,pose);
 const iw=entry?.image.naturalWidth||{'thumb':424,'index':294,'middle':292,'ring':313,'pinky':312,'rest':303,'spread':421}[pose];
 const ih=entry?.image.naturalHeight||{'thumb':558,'index':586,'middle':521,'ring':569,'pinky':545,'rest':532,'spread':592}[pose];
 const height=width*ih/iw;
 const key=geom.byPitch.get(items[0].pitch);
 const tipY=pose==='spread' ? .11 : FINGER_GUIDANCE_TIP_Y[pose];
 const registrationY=keyboardTop+keyboardH*(key?.black?.35:.57);
 const y=registrationY-tipY*height;
 return {x,y,width,height,error,unit,notes:items,hand,pose};
}
function drawFingerGuidanceHand(c,geom,keyY,keyboardH,group,hand,ghost=false,tail=0,renderX=null){
 const placement=fingerGuidanceSpritePlacement(group,hand,geom,keyboardH,tail);
 if(!placement)return null;
 const entry=fingerGuidanceGetImage(hand,placement.pose);
 if(!entry?.loaded)return null;
 c.save();
 c.beginPath();c.rect(0,keyY,lastCanvasSize.w,keyboardH+tail);c.clip();
 c.globalAlpha=typeof ghost==='number'?ghost:ghost?.25:.87;
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 c.drawImage(entry.image,Number.isFinite(renderX)?renderX:placement.x,
  placement.y,placement.width,placement.height);
 c.restore();
 return placement;
}

// Both rest PNGs ship with the user's seven original poses per hand.
// They do NOT mean a piano key is depressed; locate the hovering wrist near
// the hand's last authored/accepted note instead of fabricating a finger.
function fingerGuidanceRestPlacement(steps,hand,now,geom,keyboardH){
 const anchor=fingerGuidanceRestAnchor(steps,hand,now,loop);
 const key=anchor&&geom?.byPitch?.get(anchor.pitch);
 if(!key||!geom?.whites?.length)return null;
 const entry=fingerGuidanceGetImage(hand,'rest');
 const unit=geom.whites[0].w,width=unit*4.85;
 const iw=entry?.image.naturalWidth||303,ih=entry?.image.naturalHeight||532;
 const height=width*ih/iw;
 // A rest pose does not imply an exact finger contact. Keep the whole
 // image inside the view near the anchored key, including first/last octaves.
 if(lastCanvasSize.w<width*.65)return null;
 const x=clamp(key.center-width/2,0,Math.max(0,lastCanvasSize.w-width));
 // Unlike an active fingertip, the resting fingers hover above the key bed.
 const y=keyboardTop+keyboardH*.20-height*.075;
 return {x,y,width,height,unit,hand,pose:'rest',pitch:anchor.pitch,
  anchorStart:anchor.start,notes:[],error:0};
}
function fingerGuidancePassivePlacements(steps,group,now,geom,keyboardH){
 const empty={LH:null,RH:null};
 if(!group?.notes?.length)return empty;
 // Never synthesize the second hand for a one-hand score or MIDI where the
 // hand split remains unknown. Both hands must be score/provenance anchored.
 const both=['LH','RH'].every(h=>steps.some(g=>g.notes.some(n=>n.hand===h)));
 if(!both)return empty;
 const active=['LH','RH'].filter(h=>group.notes.some(n=>n.hand===h));
 if(active.length!==1)return empty;
 const idle=active[0]==='LH'?'RH':'LH';
 return {...empty,[idle]:fingerGuidanceRestPlacement(steps,idle,now,geom,keyboardH)};
}
function drawFingerGuidanceRest(c,placement,keyY,keyboardH,tail=0){
 if(!placement)return null;
 const entry=fingerGuidanceGetImage(placement.hand,'rest');
 if(!entry?.loaded)return null;
 c.save();c.beginPath();c.rect(0,keyY,lastCanvasSize.w,keyboardH+tail);c.clip();
 c.globalAlpha=.70;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 c.drawImage(entry.image,placement.x,placement.y,placement.width,placement.height);
 c.restore();
 return placement;
}

function fingerGuidanceMotionState(group,next,geom,keyboardH,handTail,ghostTime,playing){
 const pairs=Object.fromEntries(['LH','RH'].map(hand=>[hand,{
  from:fingerGuidanceSpritePlacement(group?.notes,hand,geom,keyboardH,handTail),
  to:fingerGuidanceSpritePlacement(next?.notes,hand,geom,keyboardH,handTail)
 }]));
 // A partially clipped / unplaceable sprite means the geometry cannot
 // disprove a crossing. If BOTH score events involve LH and RH, never let
 // the other hand animate while one hand has an unknown footprint.
 // Numeric target keys remain fixed to the authoritative score.
 const twoHandsAt=g=>['LH','RH'].every(h=>g?.notes?.some(n=>n.hand===h));
 const incompleteTwoHandGeometry=twoHandsAt(group)&&twoHandsAt(next)&&
  ['LH','RH'].some(h=>!pairs[h].from||!pairs[h].to);
 const crossing=incompleteTwoHandGeometry||
  fingerGuidanceHandsCross(pairs.LH.from,pairs.RH.from,
   pairs.LH.to,pairs.RH.to);
 const plans=Object.fromEntries(['LH','RH'].map(hand=>[hand,
  fingerGuidanceMotionPlan({from:pairs[hand].from,to:pairs[hand].to,
   remainingMs:ghostTime.remainingMs,leadMs:state.fingerLookaheadMs,
   canvasWidth:lastCanvasSize.w,playing,crossing})]));
 return {crossing,pairs,plans};
}
function drawFingerGuidance(c,geom,keyY,keyboardH,handsAllowed,handTail=0){
 const status=$('fingerGuideStatus'),mode=state.fingerGuidanceMode,steps=mode==='off'?[]:fingerGuidanceSteps();
 const hasPreset=current&&['demo-scale','demo-chords','demo-finger-duet'].includes(current.id);
 const authored=steps.flatMap(g=>g.notes).filter(n=>n.source==='musicxml');
 const corrected=steps.flatMap(g=>g.notes).filter(n=>n.source==='user');
 const unassigned=steps.flatMap(g=>g.notes).some(n=>!n.hand);
 const total=current?.tracks.reduce((acc,t,i)=>acc+(state.allTracks||i===state.track?t.notes.length:0),0)||0;
 const message=mode==='off'?'':state.adaptMode!=='original'?'Адаптация: подсказки пока недоступны':
  !steps.length?'Для этой партии пока нет подтверждённой аппликатуры':
  hasPreset?'Демо-аппликатура · MIDI не определяет реальные пальцы':
  authored.length?'MusicXML: авторская аппликатура '+authored.length+'/'+total+
   (corrected.length?' · правки пользователя: '+corrected.length:'')+
   (unassigned?' · рука не указана: только номера':''):
  'PianoMotion: аппликатура ('+steps.flatMap(g=>g.notes).filter(n=>n.finger).length+'/'+total+' нот)';
 const behavior=state.mode==='wait'?'Wait: показываю клавиши следующего задания':
  state.mode==='listen'?'Слушать: руки повторяют физические нажатия исходных нот':'Tempo: подготовка к следующей ноте';
 if(status&&status.textContent!==(mode==='off'?'':behavior+' · '+message))
  status.textContent=mode==='off'?'':behavior+' · '+message;
 if(!steps.length){
  if(mode!=='off'&&state.mode==='wait'&&practice){
   for(const n of practice.nextGroup()?.notes||[]){
    if(n.hit||n.miss||n.skipped)continue;
    const k=geom.byPitch.get(n.pitch);
    if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,null,null);
   }
  }
  return;
 }
 const frame=fingerGuidanceFrame(steps,pos);
 const {current:group,next}=frame;
 // Wait shows all remaining targets. Unknown fingering produces a neutral '?',
 // not an invented finger/hand and not an incorrectly pressed hand silhouette.
 if(mode!=='off'&&state.mode==='wait'&&practice){
  const labelled=new Set(group?.notes.map(n=>n.pitch)||[]);
  for(const n of practice.nextGroup()?.notes||[]){
   if(n.hit||n.miss||n.skipped||labelled.has(n.pitch))continue;
   const k=geom.byPitch.get(n.pitch);
   if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,null,null);
  }
 }
 if(!group){
  // In the rests between physical key releases, no key looks pressed.
  // Ghost mode may move a translucent hand toward the NEXT source onset.
  if(mode==='ghost'&&state.mode==='listen'&&next?.complete){
   const ghost=fingerGuidanceGhostWindow({nextOnset:next.start,now:pos,
    leadMs:state.fingerLookaheadMs,speedPercent:state.speed,mode:state.mode,loop});
   if(ghost.visible){
    const movement=fingerGuidanceMotionState(frame.previous,next,geom,keyboardH,handTail,ghost,isPlaying);
    for(const hand of ['LH','RH']){
     const plan=movement.plans[hand];
     if(plan.kind!=='markers')drawFingerGuidanceHand(c,geom,keyY,keyboardH,next.notes,hand,ghost.alpha,handTail,plan.x);
     for(const n of next.notes.filter(n=>n.hand===hand)){
      const key=geom.byPitch.get(n.pitch);
      if(key)drawFingerGuidanceBadge(c,keyY,keyboardH,key,n.finger,hand,{preview:true,previewAlpha:ghost.alpha});
     }
    }
   }
  }
  return;
 }
 // Keep the non-playing hand visible in its own original rest PNG. Draw
 // first (under active hands/markers), without any pressed-key contact.
 if(handsAllowed&&['hands','ghost'].includes(mode)){
  const resting=fingerGuidancePassivePlacements(steps,group,pos,geom,keyboardH);
  for(const hand of ['LH','RH'])drawFingerGuidanceRest(c,resting[hand],keyY,keyboardH,handTail);
 }
 // A partially authored chord is NOT evidence of a complete hand pose.
 // Numeric marks may still be shown for its individually authored notes.
 if(mode==='numbers'||!group.complete||!handsAllowed||group.notes.every(n=>!n.hand)){
  for(const n of group.notes){const k=geom.byPitch.get(n.pitch);if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,n.finger,n.hand);}
  return;
 }
 // Secondary Ghost is a timed preparation hint, never another active note.
 // A frozen Wait task cannot preview a second hand pose before it is done.
 const ghostTime=fingerGuidanceGhostWindow({nextOnset:next?.start,now:pos,
  leadMs:state.fingerLookaheadMs,speedPercent:state.speed,mode:state.mode,loop});
 // Static PNG is a teaching pose, not a frame-by-frame model of finger joints.
 if(mode==='ghost'&&next?.complete&&ghostTime.visible){
  const motion=fingerGuidanceMotionState(group,next,geom,keyboardH,handTail,ghostTime,isPlaying);
  for(const hand of ['LH','RH']){
   const {from:fromPose,to:toPose}=motion.pairs[hand],plan=motion.plans[hand];
   if(!toPose)continue;
   if(plan.kind!=='markers'){
    // The target PNG silhouette translates smoothly; it does NOT articulate
    // fingers. Exact future key badges stay fixed at the *destination*.
    if(fromPose&&plan.kind==='moving'){
     c.save();c.strokeStyle=FINGER_GUIDANCE_PALETTE[hand].ink;
     c.globalAlpha=Math.min(.55,ghostTime.alpha+.12);c.setLineDash([4,5]);
     c.lineWidth=2;c.beginPath();
     const y=keyY+keyboardH*.87;
     const x0=plan.sourceCenter,x1=plan.targetCenter;
     c.moveTo(x0,y);c.quadraticCurveTo((x0+x1)/2,y-20,x1,y);
     c.stroke();c.setLineDash([]);
     c.beginPath();c.arc(x1,y,3.5,0,2*Math.PI);c.stroke();c.restore();
    }
    drawFingerGuidanceHand(c,geom,keyY,keyboardH,next.notes,hand,
     ghostTime.alpha,handTail,plan.x);
   }
   // Always anchor future targets to actual key centers, independent of
   // the in-transit sprite. In a hand crossing or clipped range, this is
   // the ONLY preview: never invent the physical route of either hand.
   for(const n of next.notes.filter(n=>n.hand===hand)){
    if(group.notes.some(z=>z.hand===hand&&z.pitch===n.pitch))continue;
    const key=geom.byPitch.get(n.pitch);
    if(key)drawFingerGuidanceBadge(c,keyY,keyboardH,key,n.finger,hand,
     {preview:true,previewAlpha:ghostTime.alpha});
   }
  }
 }
 // MusicXML may specify a correct finger number without a reliable hand.
 // Show a neutral numeric marker instead of guessing the hand.
 for(const n of group.notes.filter(n=>!n.hand)){
  const k=geom.byPitch.get(n.pitch);
  if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,n.finger,null);
 }
 for(const hand of ['LH','RH']){
  const drawn=drawFingerGuidanceHand(c,geom,keyY,keyboardH,group.notes,hand,false,handTail);
  // The PNG visual is secondary: always locate the actionable circles from
  // the music score and key geometry, never from guessed image pixels.
  for(const n of group.notes.filter(n=>n.hand===hand)){
   const k=geom.byPitch.get(n.pitch);
   if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,n.finger,hand);
  }
 }
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
 const r=noteRange(),notes=notesToShow(),handsAllowed=h>=360&&['hands','ghost'].includes(state.fingerGuidanceMode),handTail=handsAllowed?Math.max(48,Math.min(82,h*.13)):0,keyboardH=handsAllowed?Math.max(174,Math.min(220,h*.35)):Math.min(90,Math.max(64,h*.22)),keyY=h-keyboardH-handTail,strikeY=keyY-10,pxPerSec=Math.max(8,(strikeY-14)/6);
 keyboardTop=keyY;keyboardBottom=keyY+keyboardH;keyboardBlackH=keyboardH*.61;
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
  if(fingerSelectedIds.has(n.noteId)){c.strokeStyle='#f8e183';c.lineWidth=2.8;c.stroke();}
   else if(selectedNote===n){c.strokeStyle='#fff';c.lineWidth=1.5;c.setLineDash([3,3]);c.stroke();c.setLineDash([]);}
  c.restore();
  if(state.labels&&nw>=24&&nh>18){c.fillStyle=audible?'#062439':'#171d25';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(nameOf(n.pitch)+(n.finger?' · '+n.finger:''),k.center,y+13);c.textAlign='left';}
  else if(n.finger&&nw>=14&&nh>14){c.fillStyle=audible?'#062439':'#171d25';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(String(n.finger),k.center,y+11);c.textAlign='left';}
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
 if(handTail){const gradient=c.createLinearGradient(0,keyboardBottom,0,h);gradient.addColorStop(0,'#17212e');gradient.addColorStop(1,'#101724');c.fillStyle=gradient;c.fillRect(0,keyboardBottom,w,handTail);c.strokeStyle='#3b4555';c.beginPath();c.moveTo(0,keyboardBottom);c.lineTo(w,keyboardBottom);c.stroke();}
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
 drawFingerGuidance(c,geom,keyY,keyboardH,handsAllowed,handTail);
 if(fingerSelectionPointer?.dragging){
  const p=fingerSelectionPointer;
  const x=Math.min(p.x,p.endX),y=Math.min(p.y,p.endY);
  c.fillStyle='rgba(245,221,115,.14)';c.fillRect(x,y,Math.abs(p.endX-p.x),Math.abs(p.endY-p.y));
  c.strokeStyle='#f8e183';c.lineWidth=1.5;c.setLineDash([5,4]);
  c.strokeRect(x,y,Math.abs(p.endX-p.x),Math.abs(p.endY-p.y));c.setLineDash([]);
 }
}
function noteHit(e){const box=roll.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;return hitboxes.slice().reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.n||null;}
function virtualKeyAt(e){
 if(!pianoGeom)return null;
 const rect=roll.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 if(y<keyboardTop||y>keyboardBottom)return null;
 // Black keys win hit-testing only over their actual short raised section.
 if(y<=keyboardTop+keyboardBlackH+3){const black=pianoGeom.blacks.find(k=>x>=k.x&&x<k.x+k.w);if(black)return black.pitch;}
 const natural=pianoGeom.whites.find(k=>x>=k.x&&x<k.x+k.w);
 return natural?.pitch??null;
}
// Selection gestures only in the NOTE AREA; the keyboard below remains a
// sounding virtual MIDI instrument. Capture on canvas avoids losing drag.
function rollSelectPoint(e){
 const box=roll.getBoundingClientRect();
 return {x:e.clientX-box.left,y:e.clientY-box.top};
}
roll.addEventListener('pointerdown',e=>{
 if(e.button!==0||!fingerSelectionAvailable()||state.scoreView!=='roll'||fingerSelectionPointer)return;
 const p=rollSelectPoint(e);if(p.y>=keyboardTop)return;
 e.preventDefault();roll.focus({preventScroll:true});roll.setPointerCapture(e.pointerId);
 fingerSelectionPointer={id:e.pointerId,x:p.x,y:p.y,endX:p.x,endY:p.y,
  toggle:e.ctrlKey||e.metaKey,shift:e.shiftKey,dragging:false};
});
roll.addEventListener('pointermove',e=>{
 const d=fingerSelectionPointer;if(!d||d.id!==e.pointerId)return;
 const p=rollSelectPoint(e);d.endX=p.x;d.endY=Math.max(0,Math.min(keyboardTop,p.y));
 if(!d.dragging&&Math.hypot(d.endX-d.x,d.endY-d.y)>=5)d.dragging=true;
 if(d.dragging)renderCanvas();
});
function finishFingerSelection(e){
 const d=fingerSelectionPointer;if(!d||d.id!==e.pointerId)return;
 fingerSelectionPointer=null;
 if(e.type!=='pointerup'){renderCanvas();return}
 const order=fingerSelectionOrdered(),validIds=new Set(order.map(n=>n.id));
 if(d.dragging){
  const picked=fingerSelectRectangle(hitboxes,{x1:d.x,y1:d.y,x2:d.endX,y2:d.endY},{ids:validIds});
  const next=d.toggle||d.shift?[...fingerSelectedIds,...picked]:picked;
  fingerSelectionSet([...new Set(next)],picked[picked.length-1]||fingerSelectionAnchor);
 }else{
  const hit=hitboxes.slice().reverse().find(b=>d.endX>=b.x&&d.endX<=b.x+b.w&&
   d.endY>=b.y&&d.endY<=b.y+b.h)?.n;
  if(hit&&validIds.has(hit.noteId)){
   const next=fingerSelectUpdate(order,fingerSelectedIds,hit.noteId,fingerSelectionAnchor,
    {shift:d.shift,toggle:d.toggle});
   fingerSelectionSet(next.selected,next.anchor);
  }else if(!d.toggle&&!d.shift)fingerSelectionSet([]);
 }
}
roll.addEventListener('pointerup',finishFingerSelection);
roll.addEventListener('pointercancel',finishFingerSelection);
roll.addEventListener('lostpointercapture',finishFingerSelection);
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
function selectNote(n,{keepGroup=false}={}){
 if(!keepGroup){
  fingerSelectedIds=new Set(fingerSelectionAvailable()&&n?.noteId?[n.noteId]:[]);
  fingerSelectionAnchor=n?.noteId||null;
 }
 selectedNote=n;if(!n){$('selection').innerHTML='<strong>Ничего не выбрано</strong><p>Щёлкни цветную ноту на Piano Roll.</p>';return}$('selection').replaceChildren();const head=document.createElement('strong'),desc=document.createElement('p');head.textContent=nameOf(n.pitch)+' · MIDI '+n.pitch+(Number.isInteger(n.sourcePitch)&&n.sourcePitch!==n.pitch?' · из '+nameOf(n.sourcePitch):'');desc.textContent='Дорожка: '+(current.tracks[n.track]?.name||n.track)+' | Позиция: '+n.start.toFixed(2)+' с | Длительность: '+n.duration.toFixed(2)+' с | Velocity: '+n.velocity;$('selection').append(head,desc);const review=reviewForNote(n);if(review){const p=document.createElement('p');p.className='small';p.textContent=review.miss?'Разбор: пропущена':review.hit?'Разбор: сыграна'+(review.timingMs!=null?' · отклонение '+Math.round(review.timingMs)+' мс':'')+(review.holdRatio!=null?' · удержание '+Math.round(review.holdRatio*100)+'%':'')+(review.chordSpreadMs!=null?' · разброс аккорда '+Math.round(review.chordSpreadMs)+' мс':''):'Разбор: нет данных о нажатии';$('selection').append(p)}if(!state.right){state.right=true;applyPanels()}switchRightTab('practice');fingerOverrideRenderEditor(n);renderCanvas();}
function fingerOverrideRenderEditor(n){
 if(!n||!current||current.format!=='MusicXML'||state.adaptMode!=='original'||!n.noteId||
  !fingerGuideWorkKey())return;
 const original=current.tracks.flatMap(t=>t.notes).find(x=>x.noteId===n.noteId);
 if(!original||original.pitch!==n.pitch)return;
 // Group inspector supports independent hand-only or finger-only edits.
 // Never assign finger 1 by default to an unannotated score note.
 if(fingerSelectedIds.size>1){
  const ids=[...fingerSelectedIds];
  const editor=document.createElement('section');editor.className='fingerCorrection fingerCorrectionGroup';
  const title=document.createElement('strong');title.textContent='Аппликатура: выбрано '+ids.length+' нот';
  const help=document.createElement('p');help.className='small';
  help.textContent='Ctrl+A — все · Ctrl+клик — добавить/убрать · Shift+клик — диапазон · протянуть рамку — выбрать область. Массовое изменение руки сохраняет каждый существующий палец.';
  const controls=document.createElement('div');controls.className='fingerCorrectionControls';
  const finger=document.createElement('select');finger.setAttribute('aria-label','Массовое назначение пальца');
  const defaultFinger=document.createElement('option');defaultFinger.value='keep';defaultFinger.textContent='Палец: не менять';finger.append(defaultFinger);
  for(let i=1;i<=5;i++){const option=document.createElement('option');option.value=String(i);option.textContent='Палец '+i+' всем';finger.append(option)}
  const hand=document.createElement('select');hand.setAttribute('aria-label','Массовое назначение руки');
  for(const [value,label] of [['keep','Рука: не менять'],['RH','Правая рука всем'],['LH','Левая рука всем'],['null','Рука неизвестна']]){
   const option=document.createElement('option');option.value=value;option.textContent=label;hand.append(option);
  }
  const save=document.createElement('button');save.className='btn tiny';save.textContent='Применить ко всем';
  save.onclick=()=>{
   if(finger.value==='keep'&&hand.value==='keep'){notify('Выбери палец или руку для изменения');return}
   fingerOverrideCommitGroup(ids,{finger:finger.value==='keep'?undefined:Number(finger.value),
    hand:hand.value==='keep'?undefined:hand.value==='null'?null:hand.value});
  };
  const reset=document.createElement('button');reset.className='btn tiny ghost';
  reset.textContent='Вернуть автора для выбранных';
  reset.disabled=!ids.some(id=>state.fingerOverrides?.[fingerGuideWorkKey()]?.[id]);
  reset.onclick=()=>fingerOverrideCommitGroup(ids,{reset:true});
  const history=fingerOverrideHistoryCurrent();
  const undo=document.createElement('button');undo.className='btn tiny ghost';undo.textContent='Отменить правку';
  undo.disabled=!history.past.length;undo.onclick=()=>fingerOverrideCommit(null,null,{action:'undo'});
  const redo=document.createElement('button');redo.className='btn tiny ghost';redo.textContent='Повторить правку';
  redo.disabled=!history.future.length;redo.onclick=()=>fingerOverrideCommit(null,null,{action:'redo'});
  const status=document.createElement('p');status.className='small fingerCorrectionHistory';
  status.textContent='История: '+history.past.length+' ↶ · '+history.future.length+' ↷ · массовая операция = 1 шаг';
  controls.append(finger,hand,save,reset,undo,redo);
  editor.append(title,help,controls,status);$('selection').append(editor);
  return;
 }
 const saved=state.fingerOverrides?.[fingerGuideWorkKey()]?.[n.noteId]||null;
 const editor=document.createElement('section');editor.className='fingerCorrection';
 const title=document.createElement('strong');title.textContent='Аппликатура этой ноты';
 const source=document.createElement('p');source.className='small';
 source.textContent='Автор: '+(original.fingeringSource==='musicxml'?('палец '+original.finger):'палец не указан')+
  ' · '+(original.hand==='RH'?'правая рука':original.hand==='LH'?'левая рука':'рука не указана')+
  (saved?' · есть ручная правка':' · источник не изменён');
 const controls=document.createElement('div');controls.className='fingerCorrectionControls';
 const finger=document.createElement('select');finger.setAttribute('aria-label','Выбрать палец 1–5');
 for(let i=1;i<=5;i++){const opt=document.createElement('option');opt.value=String(i);opt.textContent='Палец '+i;finger.append(opt)}
 finger.value=String(saved?.finger??original.finger??1);
 const hand=document.createElement('select');hand.setAttribute('aria-label','Выбрать руку');
 for(const [value,label] of [['','Рука неизвестна'],['RH','Правая'],['LH','Левая']]){
  const opt=document.createElement('option');opt.value=value;opt.textContent=label;hand.append(opt);
 }
 hand.value=saved?.hand??original.hand??'';
 const save=document.createElement('button');save.className='btn tiny';save.textContent='Сохранить правку';
 save.onclick=()=>fingerOverrideCommit(original,{finger:Number(finger.value),hand:hand.value||null});
 const reset=document.createElement('button');reset.className='btn tiny ghost';reset.textContent='Вернуть автора';
 reset.disabled=!saved;reset.onclick=()=>fingerOverrideCommit(original,null);
 const history=fingerOverrideHistoryCurrent();
 const undo=document.createElement('button');undo.className='btn tiny ghost';
 undo.textContent='Отменить правку';undo.disabled=!history.past.length;
 undo.title='Отменить последнее исправление в этом произведении (до '+FINGER_HISTORY_LIMIT+' шагов)';
 undo.onclick=()=>fingerOverrideCommit(null,null,{action:'undo'});
 const redo=document.createElement('button');redo.className='btn tiny ghost';
 redo.textContent='Повторить правку';redo.disabled=!history.future.length;
 redo.title='Повторить последнее отменённое исправление в этом произведении';
 redo.onclick=()=>fingerOverrideCommit(null,null,{action:'redo'});
 const status=document.createElement('p');status.className='small fingerCorrectionHistory';
 status.setAttribute('aria-live','polite');
 status.textContent='История этого произведения: '+history.past.length+' ↶ · '+history.future.length+' ↷';
 controls.append(finger,hand,save,reset,undo,redo);
 editor.append(title,source,controls,status);
 $('selection').append(editor);
}
function contextMenu(e){e.preventDefault();let n=noteHit(e);const opts=n?[['Свойства и оценка ноты',()=>selectNote(n)],['Открыть разбор исполнения',()=>openReview()],['Начать отсюда',()=>seek(n.start)],['Начало повтора здесь',()=>{loop.start=n.start;ensureLoop();}],['Конец повтора здесь',()=>{loop.end=n.start+n.duration;ensureLoop();}],['Добавить закладку',()=>bookmark(n.start)]]:[['Начать отсюда',()=>seek(pos)],['Начало Loop',()=>{loop.start=pos;ensureLoop()}],['Конец Loop',()=>{loop.end=pos;ensureLoop()}],['Сбросить Loop',()=>{loop={start:null,end:null,enabled:false};updateUI()}]];showMenu(e.clientX,e.clientY,opts)}
function showMenu(x,y,opts){const m=$('contextMenu');m.innerHTML='';for(const [label,fn] of opts){let b=document.createElement('button');b.textContent=label;b.onclick=()=>{hideMenu();fn()};m.append(b)}m.classList.add('show');let r=m.getBoundingClientRect();m.style.left=clamp(x,4,innerWidth-r.width-5)+'px';m.style.top=clamp(y,4,innerHeight-r.height-5)+'px'}function hideMenu(){$('contextMenu').classList.remove('show')}
function ensureLoop(){if(loop.start!=null&&loop.end!=null){let a=Math.min(loop.start,loop.end),b=Math.max(loop.start,loop.end);loop.start=a;loop.end=b;loop.enabled=b>a+.1}updateUI()}
function bookmark(at=pos){bookmarks.push(at);persist();notify('Закладка добавлена на '+fmt(at))}
let alertTimeout=null;function notify(s){$('rollStatus').textContent=s;clearTimeout(alertTimeout);alertTimeout=setTimeout(()=>{if(!isPlaying)$('rollStatus').textContent='⏸ Готово к воспроизведению'},2600)}
