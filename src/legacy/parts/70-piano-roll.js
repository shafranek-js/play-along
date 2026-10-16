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
// P0 shared-scene Fingering: reuse the exact performance notes, keyboard,
// hand sprites, source note IDs, selection and user override Undo/Redo.
let sceneFingerActive=false,sceneFingerAutoAdvance=false;
let sceneFingerMethod='manual',sceneFingerAutoStarted=null;
// Stage review is only presentation/selection state; neither solver nor
// fingering history is copied. Identity is the real current note object.
let sceneFingerReviewOpen=false,sceneFingerReviewSelected=new Set();
// Explicit per-note alternative calculation, scoped to the unchanged source.
// Standard Beam/PianoMotion runs protect author/user fingers as before.
let sceneFingerReplaceRequest=null;
// Explicit source-bound last manual replacement step: the automatic stage
// must undo this user-confirmed action before older Python history.
let sceneFingerReplaceHistoryStep=null;
function sceneFingerReplaceCanTravel(direction){
 const h=fingerOverrideHistoryCurrent(),record=sceneFingerReplaceHistoryStep;
 return !!record&&record.song===current&&
  (direction==='undo'?h.past.at(-1):h.future.at(-1))===record.step;
}
function sceneFingerReplacementSnapshot(){
 if(!current||!fingerSelectionAvailable())return null;
 return JSON.stringify(fingerSelectionOrdered().map(e=>{
  const n=e.note;return [e.id,n.pitch,n.start,n.duration,
   n.finger??null,n.hand??null,n.fingeringSource??null];
 }));
}
function sceneFingerReplacementValid(method=sceneFingerMethod){
 const r=sceneFingerReplaceRequest;
 if(!r||r.method!==method||r.song!==current||!fingerSelectionAvailable()||
    r.key!==fingerGuideWorkKey()||
    JSON.stringify(state.fingerOverrides?.[r.key]||{})!==r.saved||
    sceneFingerReplacementSnapshot()!==r.source)return false;
 const ids=new Set(fingerSelectionOrdered().map(e=>e.id));
 return [...r.ids].every(id=>ids.has(id));
}
function sceneFingerReplacementPrepare(method){
 sceneFingerReplaceRequest=null;
 if(!fingerSelectionAvailable()||!fingerBrowserMidiSourceVerified())return;
 const key=fingerGuideWorkKey(),saved=state.fingerOverrides?.[key]||{};
 const chosen=fingerSelectionOrdered().filter(e=>fingerSelectedIds.has(e.id)&&
  (Number.isInteger(saved[e.id]?.finger)||
   !saved[e.id]?.suppressAuthor&&Number.isInteger(e.note.finger)&&
   e.note.finger>=1&&e.note.finger<=5));
 if(!chosen.length)return;
 sceneFingerReplaceRequest={method,song:current,key,
  ids:new Set(chosen.map(e=>e.id)),
  saved:JSON.stringify(saved),source:sceneFingerReplacementSnapshot()};
}
function sceneFingerReplacementCandidate(note,proposal){
 const r=sceneFingerReplaceRequest;
 if(!sceneFingerReplacementValid()||!r.ids.has(note.noteId)||
    !['RH','LH'].includes(proposal?.hand)||
    !Number.isInteger(proposal?.finger)||proposal.finger<1||proposal.finger>5)return false;
 const change=fingerOverrideForNote(note);
 const finger=Number.isInteger(change?.finger)?change.finger:
  change?.suppressAuthor?null:note.finger;
 const hand=change?.hand??note.hand;
 return finger!==proposal.finger||hand!==proposal.hand;
}
// UI presentation preference, not an authorization role or an engine setting.
// All changes to source notes remain governed by the same source-safe guards.
const SCENE_DEVELOPER_PREF='playalong-developer-ui';
let sceneFingerDeveloper=false;
try{sceneFingerDeveloper=localStorage.getItem(SCENE_DEVELOPER_PREF)==='true'}
catch{}
document.body.classList.toggle('developerMode',sceneFingerDeveloper);
$('developerToolsToggle').checked=sceneFingerDeveloper;
$('developerToolsToggle').onchange=e=>{
 sceneFingerDeveloper=e.target.checked;
 document.body.classList.toggle('developerMode',sceneFingerDeveloper);
 try{localStorage.setItem(SCENE_DEVELOPER_PREF,String(sceneFingerDeveloper))}
 catch{notify('Не удалось сохранить настройку интерфейса.')}
 sceneFingerControlsSync();
};

function sceneFingerMethodAvailable(method){
 if(method==='manual')return fingerSelectionAvailable();
 if(method==='beam')return fingerSelectionAvailable();
 return method==='pianomotion'&&!!current;
}
function sceneFingerAutoSync(){
 if(!sceneFingerActive||sceneFingerMethod==='manual')return;
 const method=sceneFingerMethod;
 const source=$(
  method==='pianomotion'?'pianoMotionStatus':'fingerBrowserStatus');
 const live=sceneFingerAutoStarted?.song===current&&
  sceneFingerAutoStarted.method===method;
 const preview=sceneFingerCandidatePreviewMap();
 const message=live?source.textContent.trim():preview.size?
  'Есть рассчитанные предложения · проверка обязательна.':
  'Нажми «Рассчитать». Предложения не применяются автоматически.';
 const detailed=preview.size?message+' · На дорожке '+preview.size+
  (sceneFingerReplacementValid()?
   ' вариантов замены уже назначенных пальцев (остальные защищены).':
   ' неподтверждённых пальцев (фиолетовый пунктир).'):message;
 $('sceneFingerAutoStatus').textContent=detailed;
 $('sceneFingerAutoStatus').title=detailed;
 sceneFingerReviewSync(preview);
 $('sceneFingerCalculate').disabled=!sceneFingerMethodAvailable(method)||
  (method==='pianomotion'?!!pianoMotionRun:!!fingerBrowserWorker);
}
function sceneFingerSelectMethod(method){
 if(!['manual','pianomotion','beam'].includes(method)||
  !sceneFingerMethodAvailable(method))return false;
 if(sceneFingerMethod!==method){sceneFingerReviewReset();sceneFingerReplaceRequest=null;}
 sceneFingerMethod=method;
 $('sceneFingerMethod').value=method;
 sceneFingerControlsSync();
 renderCanvas();
 return true;
}
// Only the original workers may propose fingers. This projection is strictly
// read-only: candidate note identity must still match the current source and
// the original confirmation/apply controls remain authoritative.
function sceneFingerCandidatePreviewMap(){
 const preview=new Map();
 if(!sceneFingerActive||state.scoreView!=='roll'||state.page!=='practice'||!current)return preview;
 if(sceneFingerMethod==='beam'){
  if(!fingerSelectionAvailable()||!fingerBrowserPreview||
     fingerBrowserSong!==current||$('fingerBrowserCompareSaved').checked||
     fingerBrowserSnapshotKey!==JSON.stringify(fingerBrowserInput()))return preview;
  const sources=new Map(fingerSelectionOrdered().map(entry=>[entry.id,entry.note]));
  const saved=state.fingerOverrides?.[fingerGuideWorkKey()]||{};
  const replacement=sceneFingerReplacementValid('beam');
  for(const [id,proposal] of fingerBrowserPreview){
   const note=sources.get(id);
   if(!note||note.pitch!==proposal.pitch||note.start!==proposal.start||
      !['RH','LH'].includes(proposal.hand)||!Number.isInteger(proposal.finger)||
      proposal.finger<1||proposal.finger>5)continue;
   const effective=fingerOverrideEffective(note,saved[id]);
   if(replacement){
    if(sceneFingerReplacementCandidate(note,proposal))
     preview.set(note,{finger:proposal.finger,hand:proposal.hand});
    continue;
   }
   if(Number.isInteger(effective?.finger)||
      note.fingeringSource==='musicxml'&&Number.isInteger(note.finger)&&
      !effective?.suppressAuthor)continue;
   preview.set(note,{finger:proposal.finger,hand:proposal.hand});
  }
 }else if(sceneFingerMethod==='pianomotion'&&pianoMotionLastSong===current&&
          pianoMotionLastAlignment?.ok){
  const summary=pianoMotionReviewAvailable();
  const replacement=sceneFingerReplacementValid('pianomotion');
  const indices=replacement?pianoMotionLastAlignment.matches.map((_,i)=>i):
   summary?.eligibleIndices||[];
  for(const index of indices){
   if(replacement&&(pianoMotionReviewAudit?.blocked?.includes(index)||
     !pianoMotionReviewAudit?.ok))continue;
   const match=pianoMotionLastAlignment.matches[index];
   const note=match?.note,suggestion=match?.suggestion;
   if(!note||!suggestion||note.pitch!==suggestion.pitch||
      !['RH','LH'].includes(suggestion.hand)||
      !Number.isInteger(suggestion.finger)||
      suggestion.finger<1||suggestion.finger>5)continue;
   if(replacement){
    if(sceneFingerReplacementCandidate(note,suggestion))
     preview.set(note,{finger:suggestion.finger,hand:suggestion.hand});
   }else preview.set(note,{finger:suggestion.finger,hand:suggestion.hand});
  }
 }
 return preview;
}
// The shared stage is authoritative for selection; the exact existing
// Beam confirmation handler and PianoMotion audited Apply are authoritative
// for saving. A selected note must still be eligible when Apply is clicked.
function sceneFingerReviewReset({close=true}={}){
 sceneFingerReviewSelected.clear();
 $('sceneFingerReviewConfirm').checked=false;
 if(close)sceneFingerReviewOpen=false;
}
function sceneFingerReviewSync(candidates=null){
 const open=sceneFingerReviewOpen&&sceneFingerActive&&
  sceneFingerMethod!=='manual'&&state.scoreView==='roll'&&state.page==='practice';
 const panel=$('sceneFingerReviewPanel');
 panel.hidden=!open;
 if(!open)return;
 // Anchor below the ACTUAL wrapped toolbar height at this viewport.
 // Hard-coded top offsets can cover Undo/Redo or other accessible actions.
 const tools=$('sceneFingerTools');
 const top=Math.ceil(tools.offsetTop+tools.offsetHeight+8);
 panel.style.top=top+'px';
 panel.style.maxHeight='min(55vh, calc(100% - '+(top+8)+'px))';
 const preview=candidates||sceneFingerCandidatePreviewMap();
 for(const note of sceneFingerReviewSelected)
  if(!preview.has(note))sceneFingerReviewSelected.delete(note);
 const total=preview.size,selected=sceneFingerReviewSelected.size;
 const replacing=sceneFingerReplacementValid();
 $('sceneFingerReviewConfirm').parentElement.lastChild.textContent=replacing?
  ' Я проверил(а) предложения и разрешаю заменить пальцы только выбранных нот':
  ' Я проверил(а) выбранные пальцы и хочу их применить';
 $('sceneFingerReviewHelp').textContent=replacing?
  'Это альтернативные пальцы для ранее назначенных нот. Проверь каждую замену: исходные номера и остальные ноты сохраняются до явного подтверждения.':
  'Фиолетовый пунктир — предложение, жёлтая рамка — выбрано. Нажимай на нотные блоки или выделяй их рамкой. Авторская и сохранённая аппликатура не заменяются автоматически.';
 $('sceneFingerReviewCounts').textContent=total?
  (sceneFingerReplacementValid()?
   'Замена назначенных пальцев · предложено '+total+' · выбрано '+selected+
   ' · остальные ноты защищены':
   'Предложено '+total+' · выбрано '+selected+' · сохранено только после подтверждения'):
  'Применимых предложений пока нет. Рассчитай аппликатуру или сохрани существующую.';
 $('sceneFingerReviewAll').disabled=!total;
 $('sceneFingerReviewNone').disabled=!selected;
 $('sceneFingerReviewConfirm').disabled=!selected;
 if(!selected)$('sceneFingerReviewConfirm').checked=false;
 $('sceneFingerReviewApply').disabled=!selected||!$('sceneFingerReviewConfirm').checked;
}
function sceneFingerReviewToggle(){
 if(!sceneFingerActive||sceneFingerMethod==='manual')return;
 sceneFingerReviewOpen=!sceneFingerReviewOpen;
 if(!sceneFingerReviewOpen)sceneFingerReviewReset();
 sceneFingerReviewSync();
 renderCanvas();
}
function sceneFingerReviewApply(){
 if(!sceneFingerReviewOpen||!sceneFingerActive||sceneFingerMethod==='manual'||
    !$('sceneFingerReviewConfirm').checked)return;
 const map=sceneFingerCandidatePreviewMap();
 const notes=[...sceneFingerReviewSelected];
 if(!notes.length||notes.some(note=>!map.has(note))){
  sceneFingerReviewSync(map);notify('Предложения изменились. Проверь выделение ещё раз.');return;
 }
 let applied=false;
 if(sceneFingerReplacementValid()){
  // User explicitly requested alternatives to protected digits; validate
  // Worker provenance, source note identities and snapshot AGAIN at Apply.
  // Commit as one atomic user override, preserving source author/solver notes.
  const r=sceneFingerReplaceRequest;
  if(!fingerBrowserMidiSourceVerified()||
     (sceneFingerMethod==='beam'&&
      (fingerBrowserSong!==current||!fingerBrowserPreview||
       fingerBrowserSnapshotKey!==JSON.stringify(fingerBrowserInput())||
       $('fingerBrowserCompareSaved').checked))||
     (sceneFingerMethod==='pianomotion'&&
      (!pianoMotionLastAlignment?.ok||pianoMotionLastSong!==current||
       !pianoMotionReviewValidate()))){
   notify('Предложения устарели. Рассчитай аппликатуру снова.');return;
  }
  const byId=new Map(fingerSelectionOrdered().map(e=>[e.id,e.note]));
  const before=state.fingerOverrides?.[r.key]||{},entries=[];
  for(const note of notes){
   if(byId.get(note.noteId)!==note||!r.ids.has(note.noteId))return;
   const candidate=map.get(note);
   if(!candidate||!sceneFingerReplacementCandidate(note,candidate))return;
   const old=before[note.noteId]??null;
   const next={finger:candidate.finger,hand:candidate.hand,
    ...(old?.suppressAuthor===true?{suppressAuthor:true}:{})};
   if(!fingerHistorySame(old,next))entries.push({id:note.noteId,before:old,after:next});
  }
  if(!entries.length){notify('Выбранные пальцы уже совпадают.');return}
  applied=fingerOverrideCommit(null,null,{action:'batch',batch:entries});
  if(applied){
   sceneFingerReplaceHistoryStep={song:current,step:fingerOverrideHistoryCurrent().past.at(-1)};
   fingerBrowserAbort('Выборочная замена подтверждена · '+entries.length+' нот.');
   sceneFingerReplaceRequest=null;
   notify('Заменено пальцев: '+entries.length+' · одно Undo');
  }
 }else if(sceneFingerMethod==='beam'){
  if(!fingerSelectionAvailable())return;
  const savedSelection=fingerSelectedIds,oldHistory=fingerOverrideHistoryCurrent().past.length;
  try{
   fingerSelectedIds=new Set(notes.map(n=>n.noteId));
   $('fingerBrowserConfirm').checked=true;
   fingerBrowserUpdateActions();
   if(!$('fingerBrowserAcceptSelected').disabled)$('fingerBrowserAcceptSelected').click();
  }finally{
   fingerSelectedIds=savedSelection;
   $('fingerBrowserConfirm').checked=false;
   fingerBrowserUpdateActions();
  }
  applied=fingerOverrideHistoryCurrent().past.length>oldHistory;
 }else if(sceneFingerMethod==='pianomotion'){
  const source=pianoMotionLastAlignment?.matches||[];
  const indexByNote=new Map(source.map((match,index)=>[match.note,index]));
  const eligible=new Set(pianoMotionReviewAvailable()?.eligibleIndices||[]);
  const indices=notes.map(note=>indexByNote.get(note));
  if(indices.some(index=>!Number.isInteger(index)||!eligible.has(index))){
   sceneFingerReviewSync();notify('Ноты больше не подходят для применения.');return;
  }
  const oldHistory=pianoMotionReviewHistory.past.length;
  pianoMotionReviewApply(indices); // ONE audited original Apply implementation.
  applied=pianoMotionReviewHistory.past.length>oldHistory;
 }
 if(applied)sceneFingerReviewReset({close:false});
 else notify('Не удалось применить выбранные пальцы — проверь сообщение расчёта.');
 sceneFingerReviewSync();
 sceneFingerControlsSync();
 renderCanvas();
}
function sceneFingerReviewGesture(d){
 const candidates=sceneFingerCandidatePreviewMap(),notes=[...candidates.keys()]
  .sort((a,b)=>a.start-b.start||a.track-b.track||a.pitch-b.pitch);
 const selected=sceneFingerReviewSelected;
 if(d.dragging){
  const x1=Math.min(d.x,d.endX),x2=Math.max(d.x,d.endX),
   y1=Math.min(d.y,d.endY),y2=Math.max(d.y,d.endY);
  const picked=hitboxes.filter(b=>candidates.has(b.n)&&
   b.x+b.w>=x1&&b.x<=x2&&b.y+b.h>=y1&&b.y<=y2).map(b=>b.n);
  sceneFingerReviewSelected=d.toggle||d.shift?
   new Set([...selected,...picked]):new Set(picked);
 }else{
  const hit=hitboxes.slice().reverse().find(b=>
   d.endX>=b.x&&d.endX<=b.x+b.w&&d.endY>=b.y&&d.endY<=b.y+b.h)?.n;
  if(hit&&candidates.has(hit)){
   if(d.shift&&selected.size){
    const last=[...selected].at(-1),from=notes.indexOf(last),to=notes.indexOf(hit);
    if(from>=0&&to>=0)
     sceneFingerReviewSelected=new Set([...selected,...notes.slice(Math.min(from,to),Math.max(from,to)+1)]);
   }else if(d.toggle){
    if(selected.has(hit))selected.delete(hit);else selected.add(hit);
   }else sceneFingerReviewSelected=new Set([hit]);
  }else if(!d.toggle&&!d.shift)sceneFingerReviewSelected.clear();
 }
 $('sceneFingerReviewConfirm').checked=false;
 sceneFingerReviewSync(candidates);
 renderCanvas();
}
function sceneFingerStart(method){
 if(!current){notify('Сначала открой произведение.');return false}
 if(!sceneFingerMethodAvailable(method)){
  notify('Открой MIDI или MusicXML в режиме «Оригинал», чтобы редактировать аппликатуру.');
  return false;
 }
 // Research-only compare-without-saved is never an implicit learner
 // action; returning to ordinary UI restores the protected normal solver.
 if(method==='beam'&&!sceneFingerDeveloper&&$('fingerBrowserCompareSaved').checked){
  $('fingerBrowserCompareSaved').checked=false;
  $('fingerBrowserCompareSaved').dispatchEvent(new Event('change',{bubbles:true}));
 }
 // Mode is internal implementation state, not another choice the learner
 // has to make before pressing the desired calculation button.
 if(!sceneFingerActive)sceneFingerSetActive(true);
 if(!sceneFingerSelectMethod(method))return false;
 if(method!=='manual')sceneFingerCalculateSelected();
 return true;
}
function sceneFingerCalculateSelected(){
 if(!sceneFingerActive||sceneFingerMethod==='manual')return;
 const method=sceneFingerMethod;
 sceneFingerReviewReset({close:false});
 sceneFingerReplacementPrepare(method);
 if(!sceneFingerMethodAvailable(method)){
  notify('Открой MIDI или MusicXML в режиме «Оригинал».');return;
 }
 if(method==='pianomotion'&&pianoMotionRun||
  method==='beam'&&fingerBrowserWorker)return;
 // Original calculate buttons live in the advanced workspace and may
 // have been disabled before the current song loaded. Refresh the single
 // source-of-truth capability state before delegating the action.
 if(method==='beam'){
  fingerBrowserSync();
  if($('fingerBrowserCalculate').disabled){
   $('sceneFingerAutoStatus').textContent='Beam Search недоступен для текущего файла.';
   return;
  }
 }
 if(method==='pianomotion'){
  fingeringWorkspaceSync();
  if($('pianoMotionCalculate').disabled){
   const plan=pianoMotionSourcePlan(current,Number(state.track)||0);
   $('sceneFingerAutoStatus').textContent='Недоступно: '+(plan?.reason||'нет подходящих нот');
   return;
  }
 }
 sceneFingerAutoStarted={song:current,method};
 // Call the original, audited production handlers. NEVER mirror or bypass
 // their Worker validation, stale-input guards, review or confirmation.
 if(method==='pianomotion')$('pianoMotionCalculate').click();
 else $('fingerCurrentCalculate').click();
 sceneFingerAutoSync();
}
function sceneFingerOpenReview(){
 if(!sceneFingerActive)return;
 const method=sceneFingerMethod;
 scoreSetView('editor'); // closes overlay but retains source and candidates
 if(method==='beam'){
  $('fingerResearchPanel').open=true;
  $('fingerBrowserContents').hidden=false;
  $('fingerBrowserToggle').setAttribute('aria-expanded','true');
  $('fingerResearchPanel').scrollIntoView({block:'start'});
 }else if(method==='pianomotion'){
  $('pianoMotionPanel').scrollIntoView({block:'start'});
 }
}

let sceneFingerFollow=true,sceneFingerViewTime=0;
let sceneFingerWindowSeconds=EDITOR_WINDOW_DEFAULT,sceneFingerViewportSong=null;
function sceneFingerTime(){
 return sceneFingerActive&&!sceneFingerFollow?
  clampEditorTime(sceneFingerViewTime,duration()):pos;
}
function sceneFingerMetrics(){
 // RenderCanvas owns the actual geometry, not the viewport. We reuse its
 // strike line and viewport height to prevent drift at all screen sizes.
 const strikeY=keyboardTop-10;
 return {strikeY,pixelsPerSecond:Math.max(8,(strikeY-14)/
  (sceneFingerActive?sceneFingerWindowSeconds:EDITOR_WINDOW_DEFAULT))};
}
function sceneFingerReveal(target){
 if(!sceneFingerActive||sceneFingerFollow||!Number.isFinite(target))return;
 const previous=sceneFingerViewTime;
 sceneFingerViewTime=editorRevealTime({
  viewTime:sceneFingerViewTime,target,windowSeconds:sceneFingerWindowSeconds,
  duration:duration()});
 if(Math.abs(previous-sceneFingerViewTime)>.00001)renderCanvas();
}
function sceneFingerOnWheel(e){
 if(!sceneFingerActive||state.scoreView!=='roll'||state.page!=='practice'||
  !current)return;
 const bounds=roll.getBoundingClientRect(),atY=e.clientY-bounds.top;
 if(atY<0||atY>=keyboardTop)return; // keep playing keyboard independent
 const delta=normalizedWheelPixels(e.deltaY,e.deltaMode,bounds.height);
 if(!Number.isFinite(delta)||delta===0)return;
 e.preventDefault(); // prevent browser zoom and the main-page scroll
 const {strikeY,pixelsPerSecond}=sceneFingerMetrics();
 const previous=sceneFingerTime();
 if(e.ctrlKey||e.metaKey){
  const zoom=editorZoom({time:previous,windowSeconds:sceneFingerWindowSeconds,
   deltaPixels:delta,anchorY:atY,strikeY,duration:duration()});
  sceneFingerWindowSeconds=zoom.windowSeconds;
  sceneFingerViewTime=zoom.time;
 }else{
  sceneFingerViewTime=editorPan({time:previous,deltaPixels:delta,
   pixelsPerSecond,duration:duration()});
 }
 sceneFingerFollow=false;
 sceneFingerControlsSync();
 renderCanvas();
}
roll.addEventListener('wheel',sceneFingerOnWheel,{passive:false});

// The download action stays on the SAME performance stage. Reuse the
// original independently verified export implementations: the MIDI/Python
// path includes generated fingers and provenance; the score/manual path
// applies only validated user overrides to a copy of original MusicXML.
// No source MIDI or composer annotations are ever rewritten.
function sceneFingerExportKind(){
 if(!sceneFingerActive||state.scoreView!=='roll'||state.page!=='practice'||!current)return null;
 if(pianoMotionLastSong===current&&pianoMotionLastApplied&&
    pianoMotionReviewCountApplied()>0&&!$('pianoMotionExportXML').disabled)
  return 'pianomotion';
 if(fingerSelectionAvailable()&&current.format==='MusicXML'&&
    !current.originalNotationXML&&
    Object.keys(state.fingerOverrides?.[fingerGuideWorkKey()]||{}).length)
  return 'manual';
 // MIDI imports never contain composer-authored finger numbers. Export only
 // explicitly saved manual digits, not a hand-only entry or an unaccepted
 // candidate. The download handler re-verifies the intact original bytes.
 if(fingerSelectionAvailable()&&current.format==='MIDI'&&
    Object.values(state.fingerOverrides?.[fingerGuideWorkKey()]||{})
     .some(entry=>Number.isInteger(entry?.finger)&&entry.finger>=1&&entry.finger<=5))
  return 'midi-manual';
 return null;
}
function sceneFingerDownloadMusicXML(){
 const kind=sceneFingerExportKind();
 if(kind==='pianomotion')pianoMotionDownloadMusicXML();
 else if(kind==='manual')fingerEditorDownloadMusicXML();
 else if(kind==='midi-manual')fingerManualMidiDownloadMusicXML();
 else notify('Сначала примени аппликатуру или сохрани ручные исправления.');
}

/** Presentation only: reflect the effective finger/hand of exactly one
 * selected, source-verified note. Mixed selection intentionally lights none.
 * Reads current user override first, including source-author suppression;
 * never treats finger number as hand proof.
 */
function sceneFingerSelectionHighlights(on,isManual){
 const ids=[...fingerSelectedIds],selection=on&&isManual&&ids.length===1?
  fingerSelectionOrdered().find(e=>e.id===ids[0])?.note:null;
 const override=selection?fingerOverrideForNote(selection):null;
 const hand=override?.hand??selection?.hand??null;
 const finger=Number.isInteger(override?.finger)?override.finger:
  override?.suppressAuthor?null:selection?.finger??null;
 for(const b of $('sceneFingerManual').querySelectorAll('[data-scene-hand],[data-scene-finger]')){
  const selected=!!selection&&(b.dataset.sceneHand?
   b.dataset.sceneHand===hand:
   Number.isInteger(finger)&&Number(b.dataset.sceneFinger)===finger);
  b.setAttribute('aria-pressed',String(selected));
  b.classList.toggle('sceneFingerAssigned',selected);
 }
}
function sceneFingerControlsSync(){
 // A newly imported score must never inherit the detached viewport position
 // or zoom level of a previous song, even if both are MusicXML documents.
 if(sceneFingerViewportSong!==current){
  sceneFingerViewportSong=current;sceneFingerFollow=true;
  sceneFingerViewTime=pos;sceneFingerWindowSeconds=EDITOR_WINDOW_DEFAULT;
  // A finished original Python calculation takes priority when the user
  // returns to the shared scene to review it; otherwise original MIDI
  // opens in the same Manual mode as MusicXML.
  sceneFingerMethod=pianoMotionLastSong===current&&pianoMotionLastAlignment?.ok?
   'pianomotion':fingerSelectionAvailable()?'manual':'pianomotion';
  sceneFingerAutoStarted=null;
  sceneFingerReplaceRequest=null;
  sceneFingerReplaceHistoryStep=null;
  sceneFingerReviewReset();
 }
 const manualAvailable=fingerSelectionAvailable();
 if(sceneFingerMethod==='manual'&&!manualAvailable||
    sceneFingerMethod==='beam'&&!sceneFingerMethodAvailable('beam'))
  sceneFingerMethod='pianomotion';
 if(sceneFingerActive&&!current)sceneFingerActive=false;
 const on=sceneFingerActive&&state.scoreView==='roll'&&state.page==='practice';
 const isManual=sceneFingerMethod==='manual';
 $('sceneFingerMethod').value=sceneFingerMethod;
 for(const option of $('sceneFingerMethod').options)
  option.disabled=!sceneFingerMethodAvailable(option.value);
 for(const [method,id] of [
  ['manual','sceneFingerManualButton'],
  ['pianomotion','sceneFingerPianoMotionButton'],
  ['beam','sceneFingerBeamButton']]){
  const button=$(id);
  button.disabled=!on||!sceneFingerMethodAvailable(method);
  button.setAttribute('aria-pressed',String(on&&sceneFingerMethod===method));
 }
 $('sceneFingerReset').disabled=!on||!manualAvailable;
 const exportKind=on?sceneFingerExportKind():null;
 $('sceneFingerExport').disabled=!exportKind;
 $('sceneFingerExport').title=exportKind==='pianomotion'?
  'Скачать MusicXML с применёнными пальцами PianoMotion и сохранёнными правками':
  exportKind==='manual'?
  'Скачать оригинальный MusicXML с пользовательскими правками в отдельной копии':
  exportKind==='midi-manual'?
  'Скачать приблизительную MusicXML-транскрипцию MIDI с сохранёнными ручными пальцами':
  'Сначала примени предложенные пальцы либо внеси ручные исправления';
 $('sceneFingerManual').hidden=!on||!isManual;
 $('sceneFingerAutomatic').hidden=!on||isManual;
 const count=fingerSelectedIds.size,history=fingerOverrideHistoryCurrent();
 $('sceneFingerTools').hidden=!on;
 $('sceneFingerMode').disabled=!current;
 $('sceneFingerMode').setAttribute('aria-pressed',String(on));
 document.body.classList.toggle('sceneFingerActive',on);
 $('sceneFingerSelection').textContent=isManual?
  (count?count+' нот выбрано':'Выбери ноту на дорожке'):
  (sceneFingerMethod==='pianomotion'?'PianoMotion · неподтверждено':
   'Beam Search · неподтверждено');
 for(const b of $('sceneFingerTools').querySelectorAll('[data-scene-finger],[data-scene-hand]'))
  b.disabled=!on||!isManual||!count;
 $('sceneFingerClear').disabled=!on||!isManual||!count;
 sceneFingerSelectionHighlights(on,isManual);
 const pythonHistory=sceneFingerMethod==='pianomotion'&&pianoMotionLastSong===current?
  pianoMotionReviewHistory:null;
 $('sceneFingerUndo').disabled=!fingerResetCanTravel('undo')&&
  !sceneFingerReplaceCanTravel('undo')&&
  !(pythonHistory?pythonHistory.past.length:history.past.length);
 $('sceneFingerRedo').disabled=!fingerResetCanTravel('redo')&&
  !sceneFingerReplaceCanTravel('redo')&&
  !(pythonHistory?pythonHistory.future.length:history.future.length);
 $('sceneFingerAutoAdvance').checked=sceneFingerAutoAdvance;
 $('sceneFingerFollow').disabled=!on||sceneFingerFollow;
 if(on&&!isManual)sceneFingerAutoSync();
 else $('sceneFingerReviewPanel').hidden=true;
 $('sceneFingerViewport').textContent='Вид: '+
  (sceneFingerFollow?'за игрой':fmt(clampEditorTime(sceneFingerViewTime,duration())))+
  ' · '+sceneFingerWindowSeconds.toFixed(1)+' с';
}
function sceneFingerSetActive(active){
 if(active&&!current){
  notify('Сначала открой произведение в библиотеке.');return;
 }
 // If real Python candidates were calculated in the developer workspace,
 // opening the stage must show that pending result instead of resetting to
 // the new MIDI-manual default. The learner can still choose Manual directly.
 if(active&&!sceneFingerActive&&pianoMotionLastSong===current&&
    pianoMotionLastAlignment?.ok&&
    (pianoMotionReviewAvailable()?.eligibleIndices?.length||0)>0)
  sceneFingerMethod='pianomotion';
 sceneFingerActive=!!active;
 if(!sceneFingerActive)sceneFingerReviewReset();
 if(sceneFingerActive&&state.scoreView!=='roll')scoreSetView('roll');
 sceneFingerControlsSync();
 renderCanvas();
}
function sceneFingerAdvance(direction){
 if(sceneFingerMethod!=='manual'||!fingerSelectionAvailable())return false;
 const order=fingerSelectionOrdered();
 if(!order.length)return false;
 const ids=order.map(x=>x.id);
 const anchor=ids.indexOf(fingerSelectionAnchor);
 let next=anchor<0?
  (direction>0?order.findIndex(x=>x.start>=pos-.001):order.length-1):
  anchor+direction;
 if(next<0&&anchor<0&&direction>0)next=0;
 if(next<0||next>=order.length)return false;
 if(sceneFingerFollow){
  // Navigation away from the playback cursor is a VIEW operation, never
  // an audio seek. Keep the note within the visible editor region.
  sceneFingerViewTime=pos;sceneFingerFollow=false;
 }
 sceneFingerViewTime=editorRevealTime({
  viewTime:sceneFingerViewTime,target:order[next].start,
  windowSeconds:sceneFingerWindowSeconds,duration:duration()});
 fingerSelectionSet([ids[next]],ids[next]);
 sceneFingerControlsSync();
 return true;
}
function sceneFingerAssign(kind,value){
 if(!sceneFingerActive||sceneFingerMethod!=='manual'||
    !fingerSelectionAvailable()||!fingerSelectedIds.size)return false;
 const ids=[...fingerSelectedIds],user=state.fingerOverrides?.[fingerGuideWorkKey()]||{};
 // Confirming an existing assignment advances without manufacturing Undo.
 let same=false;
 if(kind==='finger'&&ids.length===1){
  const note=fingerSelectionOrdered().find(x=>x.id===ids[0])?.note;
  const saved=user[ids[0]];
  const before=Number.isInteger(saved?.finger)?saved.finger:
   !saved?.suppressAuthor&&note?.fingeringSource==='musicxml'?note.finger:null;
  same=before===value;
 }
 const changed=same?false:kind==='reset'?fingerResetSelected(ids):
  fingerOverrideCommitGroup(ids,
   kind==='finger'?{finger:value}:{hand:value});
 if(kind==='finger'&&(same||changed)&&sceneFingerAutoAdvance&&ids.length===1)
  sceneFingerAdvance(1);
 sceneFingerControlsSync();
 return changed||same;
}
function sceneFingerKeyDown(e){
 if(!sceneFingerActive||sceneFingerMethod!=='manual'||!fingerSelectionAvailable()||
    state.scoreView!=='roll'||state.page!=='practice'||e.altKey)return;
 if(e.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"],dialog')||
    document.querySelector('.overlay.show'))return;
 const ctrl=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
 let handled=true;
 if(ctrl&&k==='z')fingerOverrideCommit(null,null,{action:e.shiftKey?'redo':'undo'});
 else if(ctrl&&k==='y'&&!e.shiftKey)fingerOverrideCommit(null,null,{action:'redo'});
 else if(!ctrl&&!e.shiftKey&&e.key==='ArrowRight')sceneFingerAdvance(1);
 else if(!ctrl&&!e.shiftKey&&e.key==='ArrowLeft')sceneFingerAdvance(-1);
 else if(!ctrl&&!e.shiftKey&&/^[1-5]$/.test(e.key))
  sceneFingerAssign('finger',Number(e.key));
 else if(!ctrl&&!e.shiftKey&&(k==='l'||k==='r'))
  sceneFingerAssign('hand',k==='l'?'LH':'RH');
 else if(!ctrl&&!e.shiftKey&&e.key==='0')sceneFingerAssign('reset');
 else if(!ctrl&&e.key==='Escape')fingerSelectionSet([]);
 else handled=false;
 if(handled){
  e.preventDefault();e.stopImmediatePropagation();sceneFingerControlsSync();
 }
}
$('sceneFingerMode').onclick=()=>sceneFingerSetActive(!sceneFingerActive);
$('sceneFingerManualButton').onclick=()=>sceneFingerStart('manual');
$('sceneFingerPianoMotionButton').onclick=()=>sceneFingerStart('pianomotion');
$('sceneFingerBeamButton').onclick=()=>sceneFingerStart('beam');
$('sceneFingerReset').onclick=()=>{
 if(!sceneFingerActive||!fingerSelectionAvailable())return;
 // Identical original confirmation dialog; the stage and transport remain.
 fingerResetOpen();
};
$('sceneFingerExport').onclick=sceneFingerDownloadMusicXML;
$('sceneFingerAdvanced').onclick=()=>sceneFingerOpenReview();
$('sceneFingerReview').onclick=sceneFingerReviewToggle;
$('sceneFingerReviewClose').onclick=()=>{sceneFingerReviewReset();sceneFingerReviewSync();renderCanvas()};
$('sceneFingerReviewAll').onclick=()=>{
 sceneFingerReviewSelected=new Set(sceneFingerCandidatePreviewMap().keys());
 $('sceneFingerReviewConfirm').checked=false;sceneFingerReviewSync();renderCanvas();
};
$('sceneFingerReviewNone').onclick=()=>{
 sceneFingerReviewSelected.clear();$('sceneFingerReviewConfirm').checked=false;
 sceneFingerReviewSync();renderCanvas();
};
$('sceneFingerReviewConfirm').onchange=()=>sceneFingerReviewSync();
$('sceneFingerReviewApply').onclick=sceneFingerReviewApply;
$('sceneFingerReviewCancel').onclick=()=>{sceneFingerReviewReset();sceneFingerReviewSync();renderCanvas()};
$('sceneFingerMethod').onchange=e=>{
 if(!sceneFingerSelectMethod(e.target.value)){
  $('sceneFingerMethod').value=sceneFingerMethod;
  notify('Этот алгоритм недоступен для текущего формата произведения.');
 }
};
$('sceneFingerCalculate').onclick=()=>sceneFingerCalculateSelected();
// Observe only the ORIGINAL algorithms' status text. An in-progress Python
// or Beam job therefore updates the scene without copying the engine logic.
for(const id of ['pianoMotionStatus','fingerBrowserStatus']){
 new MutationObserver(()=>{sceneFingerAutoSync();if(sceneFingerActive)renderCanvas()})
  .observe($(id),{childList:true,characterData:true,subtree:true});
}
$('sceneFingerAutoAdvance').onchange=e=>{sceneFingerAutoAdvance=e.target.checked;sceneFingerControlsSync()};
$('sceneFingerFollow').onclick=()=>{
 sceneFingerFollow=true;sceneFingerViewTime=pos;
 sceneFingerControlsSync();renderCanvas();roll.focus({preventScroll:true});
};
for(const b of $('sceneFingerTools').querySelectorAll('[data-scene-finger]'))
 b.onclick=()=>sceneFingerAssign('finger',Number(b.dataset.sceneFinger));
for(const b of $('sceneFingerTools').querySelectorAll('[data-scene-hand]'))
 b.onclick=()=>sceneFingerAssign('hand',b.dataset.sceneHand);
$('sceneFingerClear').onclick=()=>sceneFingerAssign('reset');
for(const [button,direction] of [['sceneFingerUndo','undo'],['sceneFingerRedo','redo']]){
 $(button).onclick=()=>{
  if(fingerResetCanTravel(direction))fingerResetTravel(direction);
  else if(sceneFingerReplaceCanTravel(direction))
   fingerOverrideCommit(null,null,{action:direction});
  else if(sceneFingerActive&&sceneFingerMethod==='pianomotion')
   $('pianoMotion'+(direction==='undo'?'Undo':'Redo')).click();
  else fingerOverrideCommit(null,null,{action:direction});
  sceneFingerReviewSync();sceneFingerControlsSync();renderCanvas();
 };
}
document.addEventListener('keydown',sceneFingerKeyDown);
function fingerSelectionAvailable(){
 return !!current&&['MusicXML','MIDI'].includes(current.format)&&
  state.adaptMode==='original'&&!!fingerGuideWorkKey();
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
 if(sceneFingerActive)sceneFingerControlsSync();
}
function fingerSelectionShortcut(e){
 if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.key.toLowerCase()!=='a'||
  !fingerSelectionAvailable()||state.page!=='practice'||!['roll','editor'].includes(state.scoreView))return false;
 const focused=document.activeElement;
 if(focused?.closest('input,textarea,select,[contenteditable="true"]'))return false;
 if(focused!==roll&&focused!==fingerEditorCanvas&&!fingerEditorScroller.contains(focused)&&
  !(sceneFingerActive&&$('sceneFingerTools').contains(focused))&&!$('selection').contains(focused)&&
  !(focused===document.body&&fingerSelectedIds.size))return false;
 e.preventDefault();
 const ordered=fingerSelectionOrdered();
 fingerSelectionSet(ordered.map(e=>e.id),ordered[0]?.id||null);
 return true;
}
function fingerOverrideCommit(note,choice,{action='edit',batch=null}={}){
 if(!fingerSelectionAvailable())return false;
 if(!fingerResetRestoring&&['undo','redo'].includes(action)&&
    fingerResetCanTravel(action))return fingerResetTravel(action);
 if(!fingerResetRestoring&&['edit','batch'].includes(action))fingerResetComposite=null;
 const key=fingerGuideWorkKey(),history=fingerOverrideHistoryCurrent();
 let transition;
 if(action==='edit'){
  if(!note?.noteId)return false;
  const previous=state.fingerOverrides?.[key]?.[note.noteId]??null;
  transition=fingerHistoryTransition(history,'edit',{id:note.noteId,before:previous,
   after:choice===null?null:{finger:choice?.finger,hand:choice?.hand,
    ...(previous?.suppressAuthor===true?{suppressAuthor:true}:{})}});
 }else if(action==='batch'){
  transition=fingerHistoryTransition(history,'batch',{entries:
   batch?.map(e=>({...e,after:e.after&&e.before?.suppressAuthor===true?
    {...e.after,suppressAuthor:true}:e.after}))});
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
  else work[change.id]={finger:change.value.finger,hand:change.value.hand,
   ...(change.value.suppressAuthor===true?{suppressAuthor:true}:{})};
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
 if(sceneFingerActive)sceneFingerControlsSync();
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
   }else if(fingerOverrideEffective(n,edits[n.noteId])?.finger!=null){
    const selected=fingerOverrideEffective(n,edits[n.noteId]);
    finger=selected.finger;hand=selected.hand??n.hand;source='user';
   }else if(!fingerOverrideEffective(n,edits[n.noteId])?.suppressAuthor&&
      ['musicxml','pianomotion','user'].includes(n.fingeringSource)&&
      Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5){
    // Keep trusted author fingers and only explicitly accepted session edits
    // (including user-applied PianoMotion suggestions). Never convert imported
    // musicxml-user-export-unverified digits into learner-facing guidance.
    finger=n.finger;hand=fingerOverrideEffective(n,edits[n.noteId])?.hand??(n.hand==='RH'||n.hand==='LH'?n.hand:null);
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

// LAUNCH-02 v0.10.111: independent animation memory per rendered hand.
// The source score and keyboard/Wait target marks remain instantaneous.
let fingerGuidanceBlendState={LH:null,RH:null},fingerGuidanceBlendScope=null;
let fingerGuidanceBlendSong=null,fingerGuidanceBlendLastPos=null;
function fingerGuidanceResetTransitions(){
 fingerGuidanceBlendState={LH:null,RH:null};fingerGuidanceBlendScope=null;
 fingerGuidanceBlendSong=null;fingerGuidanceBlendLastPos=null;
}
function fingerGuidanceDrawBlend(c,layers,keyY,keyboardH,tail){
 for(const layer of layers){
  if(layer.alpha<.002)continue;
  const entry=fingerGuidanceGetImage(layer.placement.hand,layer.placement.pose);
  if(!entry?.loaded)continue;
  c.save();c.beginPath();c.rect(0,keyY,lastCanvasSize.w,keyboardH+tail);c.clip();
  c.globalAlpha=layer.alpha;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  c.drawImage(entry.image,layer.x,layer.y,
   layer.placement.width,layer.placement.height);
  c.restore();
 }
}
function fingerGuidanceDrawBlendedHands(c,steps,group,geom,keyY,keyboardH,tail){
 const scope=[state.mode,state.fingerGuidanceMode,state.adaptMode,state.track,
  state.allTracks,state.displayRange,isPlaying,loop.enabled,loop.start,loop.end,
  lastCanvasSize.w,lastCanvasSize.h].join('|');
 // An actual Seek / rewind, responsive resize or edited current song must
 // cancel stale transitions. Loop wraps and tab throttling also snap safely.
 const discontinuity=state.mode==='listen'&&isPlaying&&
  Number.isFinite(fingerGuidanceBlendLastPos)&&
  (pos<fingerGuidanceBlendLastPos-.015||pos-fingerGuidanceBlendLastPos>.25);
 const reset=scope!==fingerGuidanceBlendScope||
  current!==fingerGuidanceBlendSong||discontinuity||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reset)fingerGuidanceBlendState={LH:null,RH:null};
 fingerGuidanceBlendSong=current;fingerGuidanceBlendScope=scope;
 fingerGuidanceBlendLastPos=pos;
 // A verified solo hand should remain visible at REST during musical
 // silence too. Only source-labelled hands are shown; do not invent a second.
 const restingSilence=!group&&state.mode==='listen'&&isPlaying;
 const passive=group?fingerGuidancePassivePlacements(steps,group,pos,geom,keyboardH)
  :{LH:null,RH:null};
 const now=performance.now();
 for(const hand of ['LH','RH']){
  // No active silhouette for a source-incomplete chord or an unknown finger.
  const active=group?.complete?
   fingerGuidanceSpritePlacement(group.notes,hand,geom,keyboardH,tail):null;
  const resting=passive[hand]||(restingSilence&&
   steps.some(g=>g.notes.some(n=>n.hand===hand))?
   fingerGuidanceRestPlacement(steps,hand,pos,geom,keyboardH):null);
  const target=active||resting;
  const blended=fingerGuidanceHandTransition(fingerGuidanceBlendState[hand],
   target,now,{durationMs:200,activeDurationMs:120,
    allowActiveReposition:state.mode==='listen'&&isPlaying,reset});
  fingerGuidanceBlendState[hand]=blended.state;
  fingerGuidanceDrawBlend(c,blended.layers,keyY,keyboardH,tail);
 }
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
  fingerGuidanceResetTransitions();
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
  // On physical NoteOff both hands return to their original rest silhouettes
  // while the authoritative key markers clear immediately. The blend is
  // visual only; released source keys never remain held in the score.
  if(handsAllowed&&['hands','ghost'].includes(mode))
   fingerGuidanceDrawBlendedHands(c,steps,null,geom,keyY,keyboardH,handTail);
  else fingerGuidanceResetTransitions();
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
 // A partially authored chord is NOT evidence of a complete hand pose.
 // Numeric marks may still be shown for its individually authored notes.
 if(mode==='numbers'||!group.complete||!handsAllowed||group.notes.every(n=>!n.hand)){
  fingerGuidanceResetTransitions();
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
 fingerGuidanceDrawBlendedHands(c,steps,group,geom,keyY,keyboardH,handTail);
 for(const hand of ['LH','RH']){
  // The PNG visual is secondary: always locate the actionable circles from
  // the music score and key geometry, never from guessed image pixels.
  for(const n of group.notes.filter(n=>n.hand===hand)){
   const k=geom.byPitch.get(n.pitch);
   if(k)drawFingerGuidanceBadge(c,keyY,keyboardH,k,n.finger,hand);
  }
 }
}

function resizeCanvas(){
 const wrap=$('rollWrap'),r=wrap.getBoundingClientRect();
 // All 52 naturals and 36 black keys must fit between both WINDOW edges.
 // No horizontal scroll or minimum per-key width may crop a controller.
 const cssW=Math.max(1,Math.floor(r.width)),cssH=Math.max(1,Math.round(r.height));
 if(roll.style.width!==cssW+'px')roll.style.width=cssW+'px';
 const dpr=Math.min(2,devicePixelRatio||1);
 if(roll.width!==Math.round(cssW*dpr)||roll.height!==Math.round(cssH*dpr)){roll.width=Math.round(cssW*dpr);roll.height=Math.round(cssH*dpr);}
 roll.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
 return {w:cssW,h:cssH};
}
function renderCanvas(){
 if(!current)return;
 // Song-format changes can happen without an explicit view change.
 if(sceneFingerViewportSong!==current||
    $('sceneFingerMode').disabled===!!current||
    (sceneFingerActive&&!fingerSelectionAvailable()))sceneFingerControlsSync();
 const {w,h}=resizeCanvas();lastCanvasSize={w,h};const c=roll.getContext('2d');
 c.clearRect(0,0,w,h);c.fillStyle='#111720';c.fillRect(0,0,w,h);
 const r=noteRange(),notes=notesToShow(),
  handsAllowed=h>=360&&['hands','ghost'].includes(state.fingerGuidanceMode);
 // A piano white key has an invariant length/width ratio (5.5:1).
 // Resize both dimensions from a SINGLE 52-key width scale; never stretch
 // the key height independently to fill a tall or short browser window.
 const geom=pianoGeom=pianoKeyGeometry(21,108,w);
 const keyboardH=geom.whites[0].w*5.5;
 const handTail=handsAllowed?Math.min(82,keyboardH*.42):0;
 const keyY=h-keyboardH-handTail,strikeY=keyY-10;
 const pxPerSec=Math.max(8,(strikeY-14)/
  (sceneFingerActive?sceneFingerWindowSeconds:EDITOR_WINDOW_DEFAULT));
 const viewTime=sceneFingerTime();
 keyboardTop=keyY;keyboardBottom=keyY+keyboardH;keyboardBlackH=keyboardH*.61;
 // Lanes, borders and time grid form ONE background layer. Opacity only
 // affects this layer; notes, piano keys and finger sprites remain unchanged.
 // At 0% the rolling area is uniformly #111720 with no lane or guide lines.
 const gridAlpha=clamp(state.gridVisibility/100,0,1);
 if(gridAlpha>0){
  // Blend each lane FILL against the actual dark background instead of stacking
  // translucent white and black passes. Otherwise the white layer leaks into
  // half-visible black lanes and 50% isn't mathematically half intensity.
  const laneColor=(r,g,b)=>'rgb('+
   Math.round(17+(r-17)*gridAlpha)+','+
   Math.round(23+(g-23)*gridAlpha)+','+
   Math.round(32+(b-32)*gridAlpha)+')';
  const whiteFill=laneColor(28,39,53),blackFill=laneColor(12,18,28);
  for(const k of geom.whites){
   c.fillStyle=whiteFill;c.fillRect(k.x,0,k.w,keyY);
   c.globalAlpha=gridAlpha;c.strokeStyle='#324253';c.lineWidth=.65;
   c.strokeRect(k.x+.35,.3,k.w-.7,keyY-.5);c.globalAlpha=1;
  }
  for(const k of geom.blacks){
   c.fillStyle=blackFill;c.fillRect(k.x,0,k.w,keyY);
   c.globalAlpha=gridAlpha;c.strokeStyle='#3d4555';c.lineWidth=.65;
   c.strokeRect(k.x+.4,.3,Math.max(0,k.w-.8),keyY-.5);c.globalAlpha=1;
  }
  // Shared seconds guide; top of falling note is note-off, bottom is note-on.
  c.save();c.globalAlpha=gridAlpha;
  for(let delta=0;delta<=8;delta++){
   const y=strikeY-delta*pxPerSec;if(y<0)break;
   c.strokeStyle=delta===0?'#f2a18399':'#9aa7b333';c.lineWidth=delta===0?2:1;
   c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();
   if(delta){c.fillStyle='#98abc7';c.font='10px system-ui';c.fillText('+'+delta+'s',w-32,y-4)}
  }
  c.restore();
 }
 // Draw whites first, then blacks on top. Piano roll lanes have the exact
 // same center and widths as the physical-looking keyboard below.
 // The highlight uses exact sounding note references, not just a pitch/time
 // approximation; an unrelated repeat of the same key stays unlit.
 const audibleNotes=state.highlight?soundingScoreNotes():new Set();
 const playedNotes=state.highlight?performedScoreNotes():new Set();
 const fingerCandidates=sceneFingerCandidatePreviewMap();
 hitboxes=[];
 for(const blackLayer of [false,true])for(const n of notes){
  if(isBlackPitch(n.pitch)!==blackLayer)continue;
  const k=geom.byPitch.get(n.pitch);if(!k)continue;
  const top=strikeY-(n.start+n.duration-viewTime)*pxPerSec;
  const bottom=strikeY-(n.start-viewTime)*pxPerSec;
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
  if(sceneFingerReviewOpen&&sceneFingerReviewSelected.has(n)&&fingerCandidates.has(n)){
   c.strokeStyle='#ffe29c';c.lineWidth=3;c.stroke();
  }else if(fingerSelectedIds.has(n.noteId)&&
            (!sceneFingerActive||sceneFingerMethod==='manual')){
   c.strokeStyle='#f8e183';c.lineWidth=2.8;c.stroke();
  }
   else if(selectedNote===n){c.strokeStyle='#fff';c.lineWidth=1.5;c.setLineDash([3,3]);c.stroke();c.setLineDash([]);}
  c.restore();
  // Show the effective saved/user finger without mutating source XML notes.
  const manual=n.noteId?fingerOverrideForNote(n):null;
  const shownFinger=Number.isInteger(manual?.finger)?manual.finger:
   manual?.suppressAuthor?null:n.finger;
  if(state.labels&&nw>=24&&nh>18){c.fillStyle=audible?'#062439':'#171d25';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(nameOf(n.pitch)+(Number.isInteger(shownFinger)?' · '+shownFinger:''),k.center,y+13);c.textAlign='left';}
  else if(Number.isInteger(shownFinger)&&nw>=14&&nh>14){c.fillStyle=audible?'#062439':'#171d25';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(String(shownFinger),k.center,y+11);c.textAlign='left';}
  // Suggested fingers are NOT accepted digits: purple dashed outline and a
  // separate small badge never replace a confirmed author/user label.
  const proposal=fingerCandidates.get(n);
  if(proposal){
   c.save();c.strokeStyle='#d5a4ff';c.lineWidth=Math.min(2,Math.max(1.3,nw*.12));
   c.setLineDash([Math.max(2,Math.min(5,nw/3)),2]);
   c.strokeRect(x+.6,y+.6,Math.max(0,nw-1.2),Math.max(0,nh-1.2));
   c.setLineDash([]);
   if(nw>=13&&nh>=24){
    const by=Math.min(y+nh-5,y+25);
    c.fillStyle='#251935';c.fillRect(k.center-6,by-10,12,13);
    c.fillStyle='#edddff';c.font='bold 11px system-ui';c.textAlign='center';
    c.fillText(String(proposal.finger),k.center,by);c.textAlign='left';
   }
   c.restore();
  }
  hitboxes.push({x,y,w:nw,h:nh,n});
 }
 if(loop.start!=null&&loop.end!=null){
  const a=strikeY-(loop.start-viewTime)*pxPerSec,b=strikeY-(loop.end-viewTime)*pxPerSec;
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
 const reachable=keyboardPlayableRange();
 const playable=p=>!reachable||(p>=reachable.low&&p<=reachable.high);
 for(const k of geom.whites){
  const enabled=playable(k.pitch);
  const physical=enabled&&state.highlight&&midiHeld.has(k.pitch);
  const audible=enabled&&state.highlight&&playbackHeld.has(k.pitch);
  const down=physical||audible,offset=down?2:0;
  c.fillStyle=!enabled?'#424854':physical?'#f0b198':audible?'#90bcf3':'#e7eaf1';
  c.fillRect(k.x+.5,keyY+2+offset,Math.max(.6,k.w-1),keyboardH-4-offset);
  c.fillStyle=!enabled?'#252d39':physical?'#cc775f':audible?'#4e89d5':'#b7bfcb';
  c.fillRect(k.x+1,keyY+keyboardH-9,Math.max(0,k.w-2),6);
  c.strokeStyle=!enabled?'#242d37':physical?'#e47e62':audible?'#5c9fe9':'#777f8c';
  c.lineWidth=down?1.7:1;c.strokeRect(k.x+.5,keyY+1.5+offset,Math.max(.5,k.w-1),keyboardH-3-offset);
  if(k.w>17&&(k.pitch%12===0||k.pitch===r.min)){
   c.textAlign='center';c.font='bold 10px system-ui';c.fillStyle='#566174';c.fillText(nameOf(k.pitch),k.center,keyY+keyboardH-15);c.textAlign='left';
  }
 }
 for(const k of geom.blacks){
  const enabled=playable(k.pitch);
  const physical=enabled&&state.highlight&&midiHeld.has(k.pitch);
  const audible=enabled&&state.highlight&&playbackHeld.has(k.pitch);
  const down=physical||audible;
  const y=keyY+2+(down?3:0),ht=keyboardBlackH-(down?3:0);
  c.shadowColor=enabled?'#03060b':'transparent';c.shadowBlur=enabled?5:0;c.shadowOffsetY=enabled?3:0;
  c.fillStyle=!enabled?'#0a1017':physical?'#db8b74':audible?'#568bcd':'#171b24';c.fillRect(k.x,y,k.w,ht);
  c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
  c.fillStyle=!enabled?'#161e28':physical?'#edac92':audible?'#a1caff':'#505a6c';
  c.fillRect(k.x+1,y+2,Math.max(0,k.w-2),Math.min(3,ht/8));
  c.fillStyle=!enabled?'#080d14':physical?'#bb6c5b':audible?'#3876c5':'#0c1018';
  c.fillRect(k.x+1,y+ht-8,Math.max(0,k.w-2),6);
 }
 if(gridAlpha>0){c.save();c.globalAlpha=gridAlpha;
  c.strokeStyle='#e5997f';c.lineWidth=2;c.beginPath();c.moveTo(0,strikeY);c.lineTo(w,strikeY);c.stroke();
  c.restore();}
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
 const usable=keyboardPlayableRange();
 const allowed=p=>!usable||(p>=usable.low&&p<=usable.high);
 if(y<=keyboardTop+keyboardBlackH+3){
  const black=pianoGeom.blacks.find(k=>x>=k.x&&x<k.x+k.w);
  if(black)return allowed(black.pitch)?black.pitch:null;
 }
 const natural=pianoGeom.whites.find(k=>x>=k.x&&x<k.x+k.w);
 return natural&&allowed(natural.pitch)?natural.pitch:null;
}
// Selection gestures only in the NOTE AREA; the keyboard below remains a
// sounding virtual MIDI instrument. Capture on canvas avoids losing drag.
function rollSelectPoint(e){
 const box=roll.getBoundingClientRect();
 return {x:e.clientX-box.left,y:e.clientY-box.top};
}
roll.addEventListener('pointerdown',e=>{
 if(e.button!==0||state.scoreView!=='roll'||fingerSelectionPointer||
  !(fingerSelectionAvailable()||
    sceneFingerActive&&sceneFingerReviewOpen&&sceneFingerMethod!=='manual'))return;
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
 if(sceneFingerActive&&sceneFingerReviewOpen&&sceneFingerMethod!=='manual'){
  sceneFingerReviewGesture(d);return;
 }
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
 selectedNote=n;if(!n){$('selection').innerHTML='<strong>Ничего не выбрано</strong><p>Щёлкни цветную ноту на Piano Roll.</p>';return}$('selection').replaceChildren();const head=document.createElement('strong'),desc=document.createElement('p');head.textContent=nameOf(n.pitch)+' · MIDI '+n.pitch+(Number.isInteger(n.sourcePitch)&&n.sourcePitch!==n.pitch?' · из '+nameOf(n.sourcePitch):'');desc.textContent='Дорожка: '+(current.tracks[n.track]?.name||n.track)+' | Позиция: '+n.start.toFixed(2)+' с | Длительность: '+n.duration.toFixed(2)+' с | Velocity: '+n.velocity;$('selection').append(head,desc);const review=reviewForNote(n);if(review){const p=document.createElement('p');p.className='small';p.textContent=review.miss?'Разбор: пропущена':review.hit?'Разбор: сыграна'+(review.timingMs!=null?' · отклонение '+Math.round(review.timingMs)+' мс':'')+(review.holdRatio!=null?' · удержание '+Math.round(review.holdRatio*100)+'%':'')+(review.chordSpreadMs!=null?' · разброс аккорда '+Math.round(review.chordSpreadMs)+' мс':''):'Разбор: нет данных о нажатии';$('selection').append(p)}if(!state.right&&!sceneFingerActive){state.right=true;applyPanels()}
 if(state.right)switchRightTab('practice');
 fingerOverrideRenderEditor(n);renderCanvas();}
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
let alertTimeout=null;function notify(s){
 const notice=$('rollStatus');
 notice.textContent=s;notice.classList.remove('status-idle');
 clearTimeout(alertTimeout);
 alertTimeout=setTimeout(()=>{
  notice.textContent='⏸ Готово к воспроизведению';
  notice.classList.add('status-idle');
 },3800);
}
