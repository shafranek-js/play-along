// FG-03C2B3 — dedicated scrollable, source-anchored fingering editor.
// Geometry is virtualized: the scrollable timeline is a lightweight DIV;
// the Canvas always covers only the viewport, even for long MusicXML works.
const fingerEditorCanvas=$('fingerEditorCanvas'),fingerEditorScroller=$('fingerEditorScroller'),
      fingerEditorSurface=$('fingerEditorSurface');
let fingerEditionPlan=null,fingerEditionTarget=null,fingerEditionTargetKey=null,fingerEditionOverridesAtPlan=null;
let fingerEditionFromSnapshot=null,fingerEditionToSnapshot=null,fingerEditionOldCorrections=null;
let fingerEditionOldKey=null,fingerEditionOldCorrectionsAtPlan=null,fingerEditionManualControls=[];
let fingerEditorBoxes=[],fingerEditorPointer=null,fingerEditorPaintScheduled=false,
    fingerEditorWidth=0,fingerEditorHeight=0;
function fingerEditorAvailable(){
 return !!current&&current.format==='MusicXML'&&state.adaptMode==='original'&&
  !!fingerGuideWorkKey();
}
// LAUNCH-06: one fingering workspace for every supported imported source.
// This only selects capabilities. The existing PianoMotion, MusicXML/manual,
// research, audition and undo handlers retain their single original instances.
function fingeringWorkspaceSync(){
 const source=current;
 const original=fingerEditorAvailable();
 const format=source?.format||'—';
 const isMidi=format==='MIDI';
 const isScore=format==='MusicXML';
 $('fingeringFormatBadge').textContent=source?format:'Нет произведения';
 $('fingeringAuthorTools').hidden=!original;
 $('fingerEditorScroller').hidden=!original;
 $('fingerEditorFooter').textContent=!source?
  'Выберите произведение в библиотеке.':
  original?'Правки автора и пользователя сохраняются отдельно от предложений PianoMotion.':
  isScore?'Редактор ручных исправлений работает в режиме «Оригинал». Расчёт PianoMotion доступен независимо от режима.':
  'У MIDI нет достоверной авторской аппликатуры; предложения PianoMotion можно проверить, выборочно применить и экспортировать.';
 const plan=source?pianoMotionSourcePlan(source,Number(state.track)||0):null;
 const running=!!pianoMotionRun;
 $('pianoMotionCalculate').disabled=running||!plan?.ok;
 $('fingeringSourceHint').textContent=!source?
  'Сначала выберите произведение в библиотеке.':
  plan?.ok?
   (isMidi?'MIDI · расчёт по исходным MIDI-событиям. ':
    isScore?'MusicXML · сохранены исходные ноты и авторские обозначения. ':
    format+' · расчёт по временным MIDI-событиям. ')+
   'Сначала просмотрите результат, затем подтвердите нужные пальцы.':
   format+' · расчёт недоступен: '+(plan?.reason||'нет подходящих нот');
 $('fingeringAutoScroll').classList.toggle('fingeringAutoMidi',!original);
 $('fingeringAutoScroll').classList.toggle('fingeringAutoXml',original);
 const midiResearch=$('fingeringMidiResearch');
 midiResearch.classList.toggle('hidden',!isMidi||
  $('pianoMotionMidiPanel').classList.contains('hidden'));
}
function fingerEditorPaintSoon(){
 if(fingerEditorPaintScheduled)return;
 fingerEditorPaintScheduled=true;
 requestAnimationFrame(()=>{fingerEditorPaintScheduled=false;fingerEditorRender()});
}
function fingerEditorNotes(){return fingerEditorAvailable()?fingerSelectionOrdered().map(x=>x.note):[]}
function fingerEditorRender(){
 fingeringWorkspaceSync();
 if(state.scoreView!=='editor'||state.page!=='practice')return;
 fingerResearchSync();
 fingerBrowserSync();
 if(fingerEditionPlan&&fingerEditionTarget!==current)fingerEditionReset();
  const width=Math.max(0,Math.floor(fingerEditorScroller.clientWidth));
 if(width<100)return;
 const notes=fingerEditorNotes();
 const count=$('fingerEditorCount'),footer=$('fingerEditorFooter');
 const selectedCount=fingerSelectedIds.size;
 count.textContent=selectedCount+' выбрано из '+notes.length;
 const actions=['fingerEditorApply','fingerEditorReset','fingerEditorUndo','fingerEditorRedo','fingerEditorAll','fingerEditorClear'];
 for(const id of actions)$(id).disabled=!fingerEditorAvailable()||
  (id==='fingerEditorAll'?!notes.length:
   id==='fingerEditorClear'?!selectedCount:
   id==='fingerEditorUndo'?!fingerOverrideHistoryCurrent().past.length:
   id==='fingerEditorRedo'?!fingerOverrideHistoryCurrent().future.length:
   !selectedCount);
 const userWork=fingerGuideWorkKey(),userEdits=userWork?state.fingerOverrides?.[userWork]||{}:{};
 $('fingerEditorDownloadXML').disabled=!fingerEditorAvailable()||!!current?.originalNotationXML||
  !Object.keys(userEdits).length;
 const doc=notes.length>0;
 if(!doc){
  fingerEditorBoxes=[];fingerEditorSurface.style.width=width+'px';
  const ctx=fingerEditorCanvas.getContext('2d'),dpr=Math.min(window.devicePixelRatio||1,2);
  fingerEditorCanvas.width=Math.round(width*dpr);fingerEditorCanvas.height=Math.round(360*dpr);
  fingerEditorCanvas.style.width=width+'px';fingerEditorCanvas.style.height='360px';
  fingerEditorSurface.style.height='360px';ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#101722';ctx.fillRect(0,0,width,360);
  ctx.fillStyle='#c2cddd';ctx.textAlign='center';ctx.font='14px system-ui';
  ctx.fillText('Для редактирования загрузите MusicXML и выберите оригинальный режим',width/2,160);
  footer.textContent='MIDI не содержит авторских обозначений пальцев. Никакая аппликатура автоматически не создаётся.';
  return;
 }
 const lo=Math.max(0,Math.min(...notes.map(n=>n.pitch))-2),
       hi=Math.min(127,Math.max(...notes.map(n=>n.pitch))+2);
 const duration=notes.reduce((m,n)=>Math.max(m,n.start+n.duration),0);
 const userScale=Number($('fingerEditorZoom').value)||72;
 // Keep ALL notes scroll-reachable under browser scrollWidth limits, without
 // silently truncating unusually long imported works.
 const px=Math.min(userScale,Math.max(.5,3800000/Math.max(1,duration)));
 const totalWidth=Math.max(width,fingerEditorExtent(notes,px));
 fingerEditorSurface.style.width=totalWidth+'px';
 const scroll=Math.max(0,fingerEditorScroller.scrollLeft);
 const rowHeight=14;
 const geo=fingerEditorGeometry(notes,{viewWidth:width,scrollLeft:scroll,pxPerSecond:px,
  minPitch:lo,maxPitch:hi,rowHeight});
 const height=geo.height;
 fingerEditorBoxes=geo.boxes.map(b=>({n:b.n,x:b.x,y:b.y,w:b.w,h:b.h}));
 const dpr=Math.min(window.devicePixelRatio||1,2);
 if(width!==fingerEditorWidth||height!==fingerEditorHeight||
    fingerEditorCanvas.width!==Math.round(width*dpr)){
  fingerEditorCanvas.width=Math.round(width*dpr);fingerEditorCanvas.height=Math.round(height*dpr);
  fingerEditorCanvas.style.width=width+'px';fingerEditorCanvas.style.height=height+'px';
  fingerEditorSurface.style.height=height+'px';fingerEditorWidth=width;fingerEditorHeight=height;
 }
 const c=fingerEditorCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle='#111925';c.fillRect(0,0,width,height);
 const left=61,top=32;
 c.font='11px system-ui';c.textAlign='left';
 for(let pitch=hi;pitch>=lo;pitch--){
  const y=top+(hi-pitch)*rowHeight;
  if(pitch%12===0){c.fillStyle='#1c2a39';c.fillRect(0,y,width,rowHeight);}
  c.strokeStyle='#2b3543';c.lineWidth=.7;c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke();
  if(pitch%12===0||pitch===hi||pitch===lo){
   c.fillStyle='#a8b8cc';c.fillText(nameOf(pitch),6,y+11);
  }
 }
 c.fillStyle='#1b2532';c.fillRect(0,0,width,top);
 const step=px<45?10:px<100?5:2;
 const first=Math.max(0,Math.floor((scroll-left)/px/step)*step);
 for(let t=first;t<=duration;t+=step){
  const x=left+t*px-scroll;if(x<-20||x>width+20)continue;
  c.strokeStyle='#445369';c.lineWidth=.8;c.beginPath();c.moveTo(x,top);c.lineTo(x,height);c.stroke();
  const mins=Math.floor(t/60),secs=Math.floor(t%60);
  c.fillStyle='#c1cce0';c.fillText(mins+':'+String(secs).padStart(2,'0'),x+4,20);
 }
 const work=fingerGuideWorkKey(),edits=state.fingerOverrides?.[work]||{};
 for(const b of geo.boxes){
  const n=b.n,manual=fingerOverrideEffective(n,edits[n.noteId]);
  const suggested=!manual&&n.fingeringSource!=='musicxml'?fingerBrowserPreview?.get(n.noteId):null;
  const finger=manual?manual.finger:n.fingeringSource==='musicxml'?n.finger:suggested?.finger??null;
  const hand=manual?manual.hand:n.hand==='RH'||n.hand==='LH'?n.hand:null;
  const selected=fingerSelectedIds.has(n.noteId);
  c.fillStyle=hand==='RH'?'#3f6c92':hand==='LH'?'#527a63':'#525e74';
  c.fillRect(b.x,b.y,b.w,b.h);
  c.lineWidth=selected?2.5:manual?1.8:1;
  c.strokeStyle=selected?'#ffe48c':manual?'#e6ac5d':suggested?'#d6a5ff':'#8796ab';
  if(suggested&&!selected&&!manual)c.setLineDash([3,2]);
  c.strokeRect(b.x,b.y,b.w,b.h);
  c.setLineDash([]);
  c.fillStyle=selected?'#fff5cc':suggested?'#e8c7ff':'#fff';c.font='bold 11px system-ui';
  if(b.w>=19)c.fillText(finger===null||finger===undefined?'?':String(finger),b.x+3,b.y+10);
  if(b.w>=41&&hand){
   c.fillStyle='#d9e3ee';c.font='9px system-ui';c.fillText(hand,b.x+19,b.y+10);
  }
 }
 if(fingerEditorPointer?.dragging){
  const p=fingerEditorPointer;
  const x=Math.min(p.x,p.x2),y=Math.min(p.y,p.y2);
  c.fillStyle='rgba(255,223,130,.12)';c.fillRect(x,y,Math.abs(p.x-p.x2),Math.abs(p.y-p.y2));
  c.strokeStyle='#ffe48c';c.lineWidth=1.5;c.setLineDash([4,4]);
  c.strokeRect(x,y,Math.abs(p.x-p.x2),Math.abs(p.y-p.y2));c.setLineDash([]);
 }
 const marked=notes.filter(n=>{
  const changed=fingerOverrideEffective(n,edits[n.noteId]);
  return Number.isInteger(changed?.finger)&&changed.finger>=1&&changed.finger<=5||
   !changed&&n.fingeringSource==='musicxml'&&Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5;
 }).length;
 footer.textContent='Номера пальцев: '+marked+' из '+notes.length+
  ' · Жёлтый контур — выбор · Янтарный — пользовательская правка · Шкала '+px.toFixed(0)+' px/с'+
  ' · Выбрано '+selectedCount+' · Undo '+fingerOverrideHistoryCurrent().past.length+
  ' · Redo '+fingerOverrideHistoryCurrent().future.length+
  (fingerBrowserPreview?' · Фиолетовые пальцы — НЕ проверенные предложения':'');
 fingerBrowserUpdateActions();
}
function fingerEditorPoint(e){
 const rect=fingerEditorCanvas.getBoundingClientRect();
 return {x:e.clientX-rect.left,y:e.clientY-rect.top};
}
fingerEditorCanvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||!fingerEditorAvailable()||state.scoreView!=='editor'||fingerEditorPointer)return;
 const p=fingerEditorPoint(e);
 if(p.y<32)return; // ruler is free for ordinary horizontal scrolling
 e.preventDefault();fingerEditorCanvas.focus({preventScroll:true});
 fingerEditorCanvas.setPointerCapture(e.pointerId);
 fingerEditorPointer={id:e.pointerId,x:p.x,y:p.y,x2:p.x,y2:p.y,
  toggle:e.ctrlKey||e.metaKey,shift:e.shiftKey,dragging:false};
});
fingerEditorCanvas.addEventListener('pointermove',e=>{
 const d=fingerEditorPointer;if(!d||d.id!==e.pointerId)return;
 const p=fingerEditorPoint(e);d.x2=p.x;d.y2=p.y;
 if(!d.dragging&&Math.hypot(d.x2-d.x,d.y2-d.y)>6)d.dragging=true;
 fingerEditorPaintSoon();
});
function fingerEditorEndPointer(e){
 const d=fingerEditorPointer;if(!d||d.id!==e.pointerId)return;
 fingerEditorPointer=null;
 if(e.type!=='pointerup'){fingerEditorPaintSoon();return}
 const order=fingerSelectionOrdered();
 if(d.dragging){
  const found=fingerSelectRectangle(fingerEditorBoxes,{x1:d.x,y1:d.y,x2:d.x2,y2:d.y2},
   {ids:new Set(order.map(n=>n.id))});
  const next=d.toggle||d.shift?[...fingerSelectedIds,...found]:found;
  fingerSelectionSet([...new Set(next)],found[found.length-1]||fingerSelectionAnchor);
 }else{
  const hit=fingerEditorBoxes.slice().reverse().find(b=>d.x2>=b.x&&d.x2<=b.x+b.w&&
   d.y2>=b.y&&d.y2<=b.y+b.h)?.n;
  if(hit){
   const next=fingerSelectUpdate(order,fingerSelectedIds,hit.noteId,fingerSelectionAnchor,
    {shift:d.shift,toggle:d.toggle});
   fingerSelectionSet(next.selected,next.anchor);
  }else if(!d.toggle&&!d.shift)fingerSelectionSet([]);
 }
 fingerEditorRender();
}
fingerEditorCanvas.addEventListener('pointerup',fingerEditorEndPointer);
fingerEditorCanvas.addEventListener('pointercancel',fingerEditorEndPointer);
fingerEditorCanvas.addEventListener('lostpointercapture',fingerEditorEndPointer);
fingerEditorScroller.addEventListener('scroll',fingerEditorPaintSoon,{passive:true});
$('fingerEditorZoom').addEventListener('change',()=>{fingerEditorRender()});
$('fingerEditorAll').onclick=()=>{
 if(!fingerEditorAvailable())return;
 const order=fingerSelectionOrdered();
 fingerSelectionSet(order.map(n=>n.id),order[0]?.id||null);
 fingerEditorCanvas.focus({preventScroll:true});
};
$('fingerEditorClear').onclick=()=>fingerSelectionSet([]);
$('fingerEditorApply').onclick=()=>{
 const finger=$('fingerEditorFinger').value,hand=$('fingerEditorHand').value;
 if(finger==='keep'&&hand==='keep'){notify('Выберите палец или руку');return}
 fingerOverrideCommitGroup([...fingerSelectedIds],{
  finger:finger==='keep'?undefined:Number(finger),
  hand:hand==='keep'?undefined:hand==='null'?null:hand
 });
 fingerEditorRender();
};
$('fingerEditorReset').onclick=()=>{
 fingerOverrideCommitGroup([...fingerSelectedIds],{reset:true});fingerEditorRender();
};
$('fingerEditorUndo').onclick=()=>{fingerOverrideCommit(null,null,{action:'undo'});fingerEditorRender()};
$('fingerEditorRedo').onclick=()=>{fingerOverrideCommit(null,null,{action:'redo'});fingerEditorRender()};
$('fingerEditorDownloadXML').onclick=()=>{
 const status=$('fingerEditorExportStatus');
 if(!fingerEditorAvailable()||!current)return;
 const song=current,key=fingerGuideWorkKey(),corrections=key?state.fingerOverrides?.[key]:null;
 const result=musicXmlCorrectedExport(song,corrections,{
  parse:xml=>new DOMParser().parseFromString(xml,'application/xml'),
  serialize:doc=>new XMLSerializer().serializeToString(doc),
  reimport:readMusicXML,compareStructure:externalFingeringStructuralKey,
  overlay:sheetFingeringOverlay
 });
 if(song!==current||key!==fingerGuideWorkKey())return;
 if(result.status!=='ready'){
  status.textContent='Экспорт отклонён: '+result.reason;
  notify('MusicXML не экспортирован — '+result.reason);return;
 }
 const blob=new Blob([result.xml],{type:'application/vnd.recordare.musicxml+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(String(song.title||'score').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)||'score')+'-user-fingering.musicxml';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 status.textContent='Экспортировано '+result.count+' ручных номеров. Только рука: '+
  result.handOnly+' (без изменения). Оригинал не затронут; файл содержит отметку пользовательских правок.';
};
// FG-03C2B5: user-confirmed transfer across uniquely matched XML measures.
// The dry-run never applies its own results. All selected changes flow
// through existing validated atomic batch Undo/Redo persistence.
function fingerEditionReset(){
 fingerEditionPlan=null;fingerEditionTarget=null;fingerEditionTargetKey=null;
 fingerEditionOverridesAtPlan=null;
 fingerEditionFromSnapshot=null;fingerEditionToSnapshot=null;fingerEditionOldCorrections=null;
 fingerEditionOldKey=null;fingerEditionOldCorrectionsAtPlan=null;fingerEditionManualControls=[];
 $('fingerEditionCandidates').replaceChildren();
 $('fingerEditionManualCandidates').replaceChildren();
 $('fingerEditionManualStatus').textContent='';
 $('fingerEditionApplyManual').disabled=true;
 $('fingerEditionApply').disabled=true;
}
$('fingerEditionOldFile').addEventListener('change',()=>{
 fingerEditionReset();$('fingerEditionStatus').textContent='Файл выбран. Нажми «Проверить перенос».';
});
$('fingerEditionCompare').onclick=async()=>{
 fingerEditionReset();
 const file=$('fingerEditionOldFile').files?.[0];
 const status=$('fingerEditionStatus'),button=$('fingerEditionCompare');
 if(!fingerEditorAvailable()||!file||!(/\.(musicxml|xml|mxl)$/i).test(file.name)||file.size>16*1024*1024){
  status.textContent='Нужны исходная MusicXML-партитура и предыдущий MusicXML/MXL до 16 МБ.';return;
 }
 const target=current,targetKey=fingerGuideWorkKey();
 button.disabled=true;status.textContent='Сопоставляю исходные ноты и такты…';
 try{
  const old=await songFromBuffer(file.name,await file.arrayBuffer());
  if(target!==current||targetKey!==fingerGuideWorkKey()){
   status.textContent='Открытая партитура изменилась. Повтори сравнение.';return;
  }
  const oldKey=fingerOverrideWorkKey(old),changes=oldKey?state.fingerOverrides?.[oldKey]:null;
  if(!changes||!Object.keys(changes).length){
   status.textContent='Для этой точной старой редакции в браузере нет сохранённых ручных исправлений.';return;
  }
  const parse=xml=>new DOMParser().parseFromString(xml,'application/xml');
  const from=fingerEditionSnapshot(old,{parse}),to=fingerEditionSnapshot(target,{parse});
  const existing=state.fingerOverrides?.[targetKey]||{};
  const plan=fingerEditionReconcile(from,to,changes,existing);
  if(plan.status!=='review'){
   status.textContent='Перенос отклонён: '+(plan.reason||from.reason||to.reason);return;
  }
  fingerEditionPlan=plan;fingerEditionTarget=target;fingerEditionTargetKey=targetKey;
  fingerEditionOverridesAtPlan=JSON.stringify(existing);
  fingerEditionFromSnapshot=from;fingerEditionToSnapshot=to;fingerEditionOldCorrections=changes;
  fingerEditionOldKey=oldKey;fingerEditionOldCorrectionsAtPlan=JSON.stringify(changes);
  const manual=fingerEditionManualReview(from,to,changes,existing);
  const manualHost=$('fingerEditionManualCandidates');
  if(manual.status==='review'){
   const activateManual=()=>{
    $('fingerEditionApplyManual').disabled=!fingerEditionManualControls.some(c=>c.check.checked&&c.select.value);
   };
   for(const row of manual.rows){
    const line=document.createElement('div');
    line.className='fingerEditionManualRow';
    line.style.cssText='padding:7px 0;border-bottom:1px solid #384251';
    const intro=document.createElement('div');
    intro.textContent='Старая нота · такт '+(row.fromMeasure||'?')+
     ' · MIDI '+row.pitch+' · голос '+row.voice+' · стан '+row.staff+
     ' · '+(row.tieCount>1?'лига '+row.tieCount+' фрагментов · ':'')+
     'палец '+(row.finger===null?'нет':row.finger)+' · '+(row.hand||'рука неизвестна')+
     ' · причина: '+row.reason;
    const select=document.createElement('select');
    select.setAttribute('aria-label','Выбери соответствующую ноту для '+row.from);
    const empty=document.createElement('option');empty.value='';empty.textContent='— не переносить / выбрать новую ноту —';
    select.append(empty);
    for(const option of row.options){
     const el=document.createElement('option');el.value=option.to;
     el.textContent='Такт '+(option.measure||'?')+' · MIDI '+option.pitch+
      ' · голос '+option.voice+' · стан '+option.staff+
      (option.tieCount>1?' · лига '+option.tieCount+' фрагментов':'')+
      (option.authorFinger!==null?' · авторский палец '+option.authorFinger:'')+
      (option.existing?' · уже исправлено':'')+
      ' · '+option.to;
     select.append(el);
    }
    const checkLabel=document.createElement('label');
    const check=document.createElement('input');check.type='checkbox';
    checkLabel.append(check,document.createTextNode(' Я проверил соответствие именно этой ноты'));
    const authorLabel=document.createElement('label');
    const ackAuthor=document.createElement('input');ackAuthor.type='checkbox';
    authorLabel.append(ackAuthor,document.createTextNode(' Подтверждаю замену авторских обозначений (при конфликте)'));
    const userLabel=document.createElement('label');
    const ackExisting=document.createElement('input');ackExisting.type='checkbox';
    userLabel.append(ackExisting,document.createTextNode(' Подтверждаю замену существующей ручной правки (при конфликте)'));
    for(const label of [checkLabel,authorLabel,userLabel])
     label.style.cssText='display:block;margin:3px 0;';
    select.onchange=()=>{check.checked=false;ackAuthor.checked=false;ackExisting.checked=false;activateManual()};
    check.onchange=activateManual;
    line.append(intro,select,checkLabel,authorLabel,userLabel);manualHost.append(line);
    fingerEditionManualControls.push({row,select,check,ackAuthor,ackExisting});
   }
   $('fingerEditionManualStatus').textContent='Неоднозначных строк для ручного выбора: '+
    manual.rows.length+' · Исключено без надёжных кандидатов: '+manual.excluded.length+
    '. Ничего не выбрано и не применено.';
  }
  const host=$('fingerEditionCandidates');
  for(const candidate of plan.proposals){
   const label=document.createElement('label');
   label.style.cssText='display:block;padding:3px 0;cursor:pointer';
   const check=document.createElement('input');check.type='checkbox';
   check.value=candidate.to;check.dataset.from=candidate.from;
   check.addEventListener('change',()=>{
    $('fingerEditionApply').disabled=![...host.querySelectorAll('input[type="checkbox"]')].some(x=>x.checked);
   });
   const text=document.createElement('span');
   text.textContent=' Такт '+(candidate.fromMeasure||'?')+' → '+(candidate.toMeasure||'?')+
    ' · '+candidate.from+' → '+candidate.to+
    ' · '+(candidate.finger===null?'без номера':('палец '+candidate.finger))+
    ' · '+(candidate.hand||'рука неизвестна');
   label.append(check,text);host.append(label);
  }
  status.textContent='Готовы к ручному выбору: '+plan.proposals.length+
   ' · Конфликты: '+plan.conflicts.length+' · Неоднозначные/пропущенные: '+
   plan.unresolved.length+'. Ничего не применено. Конфликты исправляй вручную в редакторе.';
 }catch(err){status.textContent='Не удалось сравнить редакции: '+(err?.message||String(err))}
 finally{button.disabled=false}
};
$('fingerEditionApplyManual').onclick=()=>{
 const status=$('fingerEditionManualStatus');
 if(!fingerEditionPlan||current!==fingerEditionTarget||
    fingerGuideWorkKey()!==fingerEditionTargetKey||
    JSON.stringify(state.fingerOverrides?.[fingerEditionTargetKey]||{})!==fingerEditionOverridesAtPlan||
    JSON.stringify(state.fingerOverrides?.[fingerEditionOldKey]||{})!==fingerEditionOldCorrectionsAtPlan){
  fingerEditionReset();
  status.textContent='Произведение или сохранённые исправления изменились. Сравни редакции заново.';return;
 }
 const choices=fingerEditionManualControls.filter(x=>x.check.checked&&x.select.value).map(x=>({
  from:x.row.from,to:x.select.value,
  acknowledgeAuthor:x.ackAuthor.checked,acknowledgeExisting:x.ackExisting.checked
 }));
 const plan=fingerEditionManualBatch(fingerEditionFromSnapshot,fingerEditionToSnapshot,
  fingerEditionOldCorrections,state.fingerOverrides?.[fingerEditionTargetKey]||{},choices);
 if(plan.status!=='ready'){
  status.textContent='Ручной перенос отклонён: '+plan.reason+
   '. Проверь целевую ноту и отдельные подтверждения конфликтов.';return;
 }
 if(!fingerOverrideCommit(null,null,{action:'batch',batch:plan.entries})){
  status.textContent='Не удалось сохранить правки атомарно. Ничего не перенесено.';return;
 }
 fingerEditionReset();
 status.textContent='Перенесено '+plan.accepted+
  ' вручную подтверждённых нот. Один шаг Undo; исходный XML и MIDI без изменений.';
};
$('fingerEditionApply').onclick=()=>{
 if(!fingerEditionPlan||current!==fingerEditionTarget||
   fingerGuideWorkKey()!==fingerEditionTargetKey||
   JSON.stringify(state.fingerOverrides?.[fingerEditionTargetKey]||{})!==fingerEditionOverridesAtPlan){
  fingerEditionReset();
  $('fingerEditionStatus').textContent='Изменилось произведение или сохранённые правки. Сравни редакции заново.';return;
 }
 const selected=new Set([...$('fingerEditionCandidates').querySelectorAll('input[type="checkbox"]')]
  .filter(x=>x.checked).map(x=>x.value));
 const chosen=fingerEditionPlan.proposals.filter(x=>selected.has(x.to));
 if(!chosen.length)return;
 const entries=chosen.map(x=>({id:x.to,before:null,after:{finger:x.finger,hand:x.hand}}));
 if(!fingerOverrideCommit(null,null,{action:'batch',batch:entries})){
  $('fingerEditionStatus').textContent='Не удалось безопасно сохранить исправления. Ничего не подтверждено.';return;
 }
 fingerEditionReset();
 $('fingerEditionStatus').textContent='Вручную подтверждено и перенесено '+chosen.length+
  ' правок. Все изменения — один шаг Undo. Исходные MusicXML не изменены.';
 notify('Перенесено '+chosen.length+' подтверждённых правок · одно действие Undo');
};
window.addEventListener('resize',fingerEditorPaintSoon);

/** FG-04C4: local browser-only preview of our JS Beam Search.
 * This explicitly DOES NOT run PianoMotion Python or drive learner hints.
 */
let fingerBrowserWorker=null,fingerBrowserSeq=0,fingerBrowserSong=null,
    fingerBrowserSnapshotKey=null,fingerBrowserPreview=null;
function fingerBrowserUpdateActions(){
 const choices=fingerBrowserPreview&&[...fingerSelectedIds].filter(id=>fingerBrowserPreview.has(id)).length||0;
 $('fingerBrowserAcceptSelected').disabled=!choices||!$('fingerBrowserConfirm').checked;
 $('fingerBrowserReject').disabled=!fingerBrowserPreview;
}

function fingerBrowserInput(){
 if(!fingerEditorAvailable())return null;
 const key=fingerGuideWorkKey(),edits=key?state.fingerOverrides?.[key]||{}:{};
 const notes=fingerEditorNotes().map(n=>{
  const change=fingerOverrideEffective(n,edits[n.noteId]);
  const userDeclaredStaff=$('fingerBrowserAssumeStaves').checked;
  const writtenHand=change?change.hand:n.hand;
  const h=(writtenHand==='RH'||writtenHand==='LH')?writtenHand:
   (!change&&userDeclaredStaff&&String(n.staff)==='1'?'RH':
    !change&&userDeclaredStaff&&String(n.staff)==='2'?'LH':null);
  const candidate={noteId:n.noteId,pitch:n.pitch,start:n.start,
   duration:n.duration,hand:h,staff:String(n.staff??''),voice:String(n.voice??'')};
  if(change){
   if(Number.isInteger(change.finger))candidate.userFinger=change.finger;
  }else if(n.fingeringSource==='musicxml'&&Number.isInteger(n.finger))
   candidate.authorFinger=n.finger;
  return candidate;
 });
 return {notes,handSize:state.fingerBrowserHandSize};
}
function fingerBrowserAbort(message){
 fingerBrowserSeq++;
 if(fingerBrowserWorker){fingerBrowserWorker.terminate();fingerBrowserWorker=null}
 fingerBrowserSong=null;fingerBrowserSnapshotKey=null;fingerBrowserPreview=null;
 $('fingerBrowserConfirm').checked=false;
 fingerBrowserUpdateActions();
 $('fingerBrowserMetrics').replaceChildren();
 if(state.scoreView==='editor')fingerEditorPaintSoon();
 $('fingerBrowserCandidates').replaceChildren();
 if(message)$('fingerBrowserStatus').textContent=message;
}
function fingerBrowserSync(){
 const allowed=fingerEditorAvailable();
 $('fingerBrowserCalculate').disabled=!allowed||!!fingerBrowserWorker;
 if(!allowed){
  if(fingerBrowserSong)fingerBrowserAbort('Доступно только для исходного MusicXML.');
  return;
 }
 if(fingerBrowserSong&&fingerBrowserSnapshotKey!==JSON.stringify(fingerBrowserInput())){
  fingerBrowserAbort('Исходные ноты или правки изменились. Нажмите «Рассчитать» заново.');
 }
}
function fingerBrowserShow(report){
 const status=$('fingerBrowserStatus'),metrics=$('fingerBrowserMetrics'),
       candidates=$('fingerBrowserCandidates');
 metrics.replaceChildren();candidates.replaceChildren();
 if(!report||!report.ok){
  status.textContent='Расчёт отклонён: '+(report?.reason||'неизвестная ошибка')+'. Исходное произведение не изменено.';
  return;
 }
 const l=report.models.legacy,a=report.models.anatomical;
 const skipped=report.omittedCount||0;
 const chosen=a.status==='computed'?a:l.status==='computed'?l:null;
 const extra=chosen?.omittedCount||0;
 const totalManual=skipped+extra;
 const skipNotice=(skipped?' · '+skipped+' наложенных унисона для ручной проверки.':'')+
  (extra?' · '+extra+' нот в сложных участках исключены только из расчёта: нет допустимой комбинации пальцев.':'')+
  (totalManual?' Исходная партитура не изменена.':'');
 status.textContent='Вычислено локально · '+report.engine+
  ' · Исходные события неизменны · Автоматические пальцы не приняты.'+skipNotice;
 const summary=model=>model.status==='computed'?
  model.proposed+' предложений'+(model.omittedCount?' · '+model.omittedCount+' сложных нот без расчёта':''):
  'Отказ: '+model.reason;
 const rows=[
  ['Всего нот',report.noteCount],
  ['После проверки унисонов',report.eligibleCount??report.noteCount],
  ['Потребуют ручной проверки (выбранная модель)',totalManual],
  ['Авторских/ручных обозначений',report.anchored],
  ['Обычная модель',summary(l)],
  ['Анатомическая модель',summary(a)],
  ['Различающихся пальцев',report.disagreements??'Невозможно сравнить'],
  ['Экспертная проверка','Не выполнена']
 ];
 for(const [label,value]of rows){
  const span=document.createElement('span');span.className='fingerResearchMetric';
  span.textContent=label+': '+value;metrics.append(span);
 }
 if(!chosen){
  status.textContent='Beam Search не смог построить допустимую аппликатуру. '+
   'Обычная модель: '+l.reason+'; анатомическая: '+a.reason+
   '. Исходные ноты не изменены.'+skipNotice;
 }
 if(chosen&&Array.isArray(chosen.candidates)&&chosen.candidates.length&&
    fingerBrowserSong===current&&fingerBrowserSnapshotKey===JSON.stringify(fingerBrowserInput())){
  const target=new Map(fingerEditorNotes().map(n=>[n.noteId,n]));
  const allowed=chosen.candidates.every(n=>Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5&&
   (n.hand==='RH'||n.hand==='LH')&&target.get(n.noteId)?.pitch===n.pitch&&
   target.get(n.noteId)?.start===n.start);
  if(allowed&&new Set(chosen.candidates.map(n=>n.noteId)).size===chosen.candidates.length){
   fingerBrowserPreview=new Map(chosen.candidates.map(n=>[n.noteId,n]));
   fingerBrowserUpdateActions();
   fingerEditorPaintSoon();
   status.textContent='Вычислено локально · Предложения для '+fingerBrowserPreview.size+
    ' нот показаны фиолетовым в редакторе. Выдели подходящие ноты и проверь номера до подтверждения.'+
    skipNotice;
  }
 }
 const manual=[...(report.omittedNotes||[]),...(chosen?.omittedNotes||[])];
 if(manual.length){
  const title=document.createElement('strong');
  title.textContent='Ноты для ручной проверки ('+manual.length+') · без автоматического пальца';
  candidates.append(title);
  const list=document.createElement('ol');
  for(const n of manual.slice(0,60)){
   const li=document.createElement('li');
   const bar=/^xml:.*:\\d+:(\\d+):\\d+$/.exec(n.noteId||'');
   li.textContent=(bar?'Такт '+(Number(bar[1])+1)+' · ':'')+
    n.hand+' · '+nameOf(n.pitch)+' · '+n.start.toFixed(2)+
    ' с'+(n.staff?' · стан '+n.staff:'')+
    (n.voice?' · голос '+n.voice:'')+
    ' · '+(n.reason==='NO_VALID_PATH'?'модель не нашла физически допустимых пальцев':
     n.reason==='TOO_MANY_SIMULTANEOUS_KEYS'?'более пяти одновременно удерживаемых клавиш':
     'перекрывающееся повторное нажатие')+
    ' · проверить вручную';
   list.append(li);
  }
  candidates.append(list);
 }
 if(chosen?.status==='computed'&&chosen.candidates.length){
  const title=document.createElement('strong');title.textContent='Первые 30 предложений · только для просмотра';
  candidates.append(title);
  const list=document.createElement('ol');
  for(const n of chosen.candidates.slice(0,30)){
   const li=document.createElement('li');
   li.textContent=n.hand+' · '+nameOf(n.pitch)+' · '+n.start.toFixed(2)+
    ' с → палец '+n.finger+' (не подтверждён)';
   list.append(li);
  }
  candidates.append(list);
 }
}
$('fingerCurrentCalculate').onclick=()=>{
 if(!fingerEditorAvailable()){
  $('fingerBrowserStatus').textContent=current?.format==='MusicXML'?
   'Верни оригинальный режим (без адаптации), затем повтори расчёт.':
   'Выбери произведение MusicXML из библиотеки. Для обычного MIDI пока нужен отдельный алгоритм определения рук.';
  $('fingerResearchPanel').open=true;
  $('fingerBrowserContents').hidden=false;
  $('fingerBrowserToggle').setAttribute('aria-expanded','true');
  return;
 }
 $('fingerResearchPanel').open=true;
 $('fingerBrowserContents').hidden=false;
 $('fingerBrowserToggle').setAttribute('aria-expanded','true');
 $('fingerBrowserCalculate').click();
};
$('fingerBrowserConfirm').onchange=fingerBrowserUpdateActions;
$('fingerBrowserReject').onclick=()=>{
 fingerBrowserAbort('Предложения скрыты. Оригинальная партитура и сохранённые исправления не изменены.');
 fingerEditorPaintSoon();
};
$('fingerBrowserAcceptSelected').onclick=()=>{
 if(!fingerBrowserPreview||!$('fingerBrowserConfirm').checked||!fingerEditorAvailable()||
   fingerBrowserSong!==current||fingerBrowserSnapshotKey!==JSON.stringify(fingerBrowserInput())){
  fingerBrowserAbort('Предложения устарели. Рассчитай аппликатуру заново.');return;
 }
 const sources=new Map(fingerEditorNotes().map(n=>[n.noteId,n]));
 const key=fingerGuideWorkKey(),saved=state.fingerOverrides?.[key]||{},entries=[];
 for(const id of fingerSelectedIds){
  const p=fingerBrowserPreview.get(id),source=sources.get(id);
  if(!p||!source)continue;
  const effective=fingerOverrideEffective(source,saved[id]);
  if(effective||source.fingeringSource==='musicxml'&&Number.isInteger(source.finger))continue;
  if(source.pitch!==p.pitch||source.start!==p.start||p.hand!=='LH'&&p.hand!=='RH'||
     !Number.isInteger(p.finger)||p.finger<1||p.finger>5){
   fingerBrowserAbort('Ноты изменились. Рассчитай заново.');return;
  }
  entries.push({id,before:saved[id]??null,after:{finger:p.finger,hand:p.hand}});
 }
 if(!entries.length){
  $('fingerBrowserStatus').textContent='Выдели в редакторе предложенные ноты без авторских или сохранённых пальцев.';return;
 }
 // One atomic, undoable USER-confirmed operation. Never writes to source XML.
 const success=fingerOverrideCommit(null,null,{action:'batch',batch:entries});
 if(success){
  fingerBrowserAbort('Принято '+entries.length+' предложений как ручные исправления. Можно отменить через Undo.');
  fingerEditorRender();
 }
};
$('fingerBrowserToggle').onclick=()=>{
 const contents=$('fingerBrowserContents');
 contents.hidden=!contents.hidden;
 $('fingerBrowserToggle').setAttribute('aria-expanded',String(!contents.hidden));
};
// FG-04C5: self-reported RH/LH keyboard span; no MIDI sampling, pain
// diagnosis or auto-adoption of generated fingers. Save only the resulting
// bounded size enum, never personal measurements or comfort responses.
let fingerSpanProposal=null;
function fingerSpanInvalidate(){
 fingerSpanProposal=null;
 $('fingerSpanApply').disabled=true;
 $('fingerSpanResult').textContent='Ответы изменены. Нажмите «Определить размер».';
}
$('fingerSpanToggle').onclick=()=>{
 const contents=$('fingerSpanContents');
 contents.hidden=!contents.hidden;
 $('fingerSpanToggle').setAttribute('aria-expanded',String(!contents.hidden));
};
$('fingerSpanEditorOpen').onclick=()=>{
 state.right=true;
 applyPanels();
 switchRightTab('practice');
 if($('fingerSpanContents').hidden)$('fingerSpanToggle').click();
 $('fingerSpanToggle').scrollIntoView({block:'nearest'});
 $('fingerSpanToggle').focus({preventScroll:true});
};

for(const hand of ['RH','LH']){
 $('fingerSpan'+hand).onchange=fingerSpanInvalidate;
 $('fingerSpan'+hand+'Comfort').onchange=fingerSpanInvalidate;
}
$('fingerSpanRecommend').onclick=()=>{
 fingerSpanProposal=null;
 $('fingerSpanApply').disabled=true;
 const result=recommendHandSpanProfile({
  RH:{interval:$('fingerSpanRH').value,comfort:$('fingerSpanRHComfort').value},
  LH:{interval:$('fingerSpanLH').value,comfort:$('fingerSpanLHComfort').value}
 });
 if(!result.ok){
  $('fingerSpanResult').textContent=result.reason==='DISCOMFORT_REPORTED'?
   'Размер не назначен: при боли или дискомфорте прекратите растяжку. Укажите интервал, доступный без неприятных ощущений.':
   result.reason==='NO_HAND_MEASURED'?
   'Укажите хотя бы один проверенный интервал для правой или левой руки.':
   'Не удалось оценить ответы. Выберите интервал и ощущение заново.';
  return;
 }
 fingerSpanProposal=result.profile;
 const measured=Object.entries(result.byHand).map(([hand,size])=>hand+': '+size).join(', ');
 $('fingerSpanResult').textContent='Рекомендация: '+result.profile+' · '+measured+
  (result.status==='provisional-one-hand'?
   '. Предварительно: вторая рука не проверена.':' · учтён меньший из двух охватов.')+
  ' Охват соседних пальцев отдельно не измерен.';
 $('fingerSpanApply').disabled=false;
};
$('fingerSpanApply').onclick=()=>{
 if(!fingerSpanProposal)return;
 const verified=settingValidated('fingerBrowserHandSize',fingerSpanProposal);
 if(!verified)return;
 state.fingerBrowserHandSize=verified;
 $('fingerBrowserHandSize').value=verified;
 fingerBrowserAbort('Размер кисти изменён. Повторите расчёт аппликатуры.');
 persist();
 $('fingerSpanResult').textContent='Сохранено: '+verified+
  '. Этот размер автоматически используется в следующих экспериментальных расчётах. Его можно изменить вручную.';
 fingerSpanProposal=null;
 $('fingerSpanApply').disabled=true;
};
$('fingerBrowserHandSize').value=state.fingerBrowserHandSize;
$('fingerBrowserHandSize').onchange=()=>{
 const verified=settingValidated('fingerBrowserHandSize',$('fingerBrowserHandSize').value);
 if(verified===undefined){$('fingerBrowserHandSize').value=state.fingerBrowserHandSize;return}
 state.fingerBrowserHandSize=verified;
 persist();
 fingerBrowserAbort('Размер кисти изменён. Повторите расчёт.');
};

$('fingerBrowserAssumeStaves').onchange=()=>fingerBrowserAbort('Предположение о руках изменено. Повторите расчёт.');
$('fingerBrowserCalculate').onclick=()=>{
 fingerBrowserAbort();
 if(!fingerEditorAvailable()){
  $('fingerBrowserStatus').textContent='Откройте исходный MusicXML в режиме «Оригинал».';
  return;
 }
 const input=fingerBrowserInput();
 if(!input||!input.notes.length){
  $('fingerBrowserStatus').textContent='Нет нот исходной партитуры.';
  return;
 }
 if(!input.notes.every(n=>n.hand==='RH'||n.hand==='LH')){
  $('fingerBrowserStatus').textContent='Рука некоторых нот не определена. Укажите руки вручную или явно подтвердите условное разделение по станам для эксперимента.';
  return;
 }
 if(!window.Worker){
  $('fingerBrowserStatus').textContent='В этом браузере Web Worker недоступен.';
  return;
 }
 const id=++fingerBrowserSeq,source=current,snapshot=JSON.stringify(input);
 fingerBrowserSong=source;fingerBrowserSnapshotKey=snapshot;
 $('fingerBrowserStatus').textContent='Вычисляю варианты аппликатуры в отдельном потоке…';
 let worker;
 try{worker=new Worker('./assets/fingering-research-worker.js');}
 catch{
  fingerBrowserAbort('Не удалось запустить Web Worker. Проверьте поддержку браузера.');
  return;
 }
 fingerBrowserWorker=worker;
 $('fingerBrowserCalculate').disabled=true;
 const timeout=setTimeout(()=>{
  if(id!==fingerBrowserSeq)return;
  fingerBrowserAbort('Расчёт превысил ограничение времени. Исходные ноты не изменены.');
  fingerBrowserSync();
 },15000);
 const finish=(result)=>{
  clearTimeout(timeout);
  if(id!==fingerBrowserSeq)return;
  worker.terminate();fingerBrowserWorker=null;
  if(current!==source||JSON.stringify(fingerBrowserInput())!==snapshot){
   fingerBrowserAbort('Партитура или правки изменились. Запустите расчёт заново.');
   fingerBrowserSync();return;
  }
  fingerBrowserShow(result);fingerBrowserSync();
 };
 worker.onmessage=e=>{
  if(e.data?.id!==id)return;
  finish(e.data.report);
 };
 worker.onerror=()=>finish({ok:false,reason:'Ошибка Web Worker'});
 worker.postMessage({id,...input});
};
/**
 * FG-04C9: the actual original PianoMotion Python analyze_midi() in a
 * Pyodide browser worker. Runs on the currently selected song; never uploads
 * a second file, rewrites source notes or presents guesses as author fingers.
 */
let pianoMotionRun=null,pianoMotionGeneration=0,pianoMotionLastResult=null,pianoMotionLastSong=null,pianoMotionLastAlignment=null,pianoMotionLastPlan=null,pianoMotionLastApplied=false;
let pianoMotionReviewSelected=new Set(),pianoMotionReviewOffset=0,pianoMotionReviewHit=[];
let pianoMotionReviewHistory=pianoMotionEmptyHistory(),pianoMotionReviewAudit=null;
function pianoMotionReviewCountApplied(){
 return pianoMotionLastAlignment?.matches.filter(x=>x.note.fingeringSource==='pianomotion'&&
  Number.isInteger(x.note.finger)&&x.note.finger>=1&&x.note.finger<=5).length||0;
}
function pianoMotionReviewAvailable(){
 if(!pianoMotionLastAlignment?.ok||pianoMotionLastSong!==current)return null;
 const key=fingerOverrideWorkKey(current),edits=key?state.fingerOverrides?.[key]||{}:{};
 const summary=pianoMotionReviewSummary(pianoMotionLastAlignment,edits,pianoMotionReviewAudit);
 return summary.ok?summary:null;
}
function pianoMotionReviewSync(){
 const count=pianoMotionLastAlignment?.matches.length||0,active=!!count&&pianoMotionLastSong===current;
 const summary=active?pianoMotionReviewAvailable():null;
 // Always re-evaluate before offering Apply: author/user edits and Undo may
 // have changed eligibility since the note was selected.
 for(const i of pianoMotionReviewSelected)
  if(summary?.eligibility[i]!=='eligible')pianoMotionReviewSelected.delete(i);
 const selected=pianoMotionReviewSelected.size,collapsed=$('pianoMotionReview').classList.contains('collapsed');
 $('pianoMotionReviewCount').textContent=active?'Выбрано '+selected+' из '+count+' нот':'Предложения отсутствуют';
 $('pianoMotionReviewStats').textContent=summary?
  'Применимо: '+summary.counts.eligible+' · защищено: '+summary.counts.protected+
  ' · конфликты: '+summary.counts.conflict+' · без пальца: '+summary.counts.unresolved+
  ' · уже применено: '+summary.counts.applied:
  'После расчёта здесь появятся применимые и пропущенные предложения.';
 $('pianoMotionApplySelected').disabled=!summary||!selected||collapsed;
 $('pianoMotionSelectAll').disabled=!summary?.counts.eligible||collapsed;
 $('pianoMotionSelectNone').disabled=!selected||collapsed;
 $('pianoMotionApply').disabled=!summary?.counts.eligible||collapsed;
 $('pianoMotionUndo').disabled=!active||!pianoMotionReviewHistory.past.length;
 $('pianoMotionRedo').disabled=!active||!pianoMotionReviewHistory.future.length;
 $('pianoMotionExportXML').disabled=!pianoMotionLastApplied||!pianoMotionReviewCountApplied();
}
function pianoMotionReviewRender(){
 const alignment=pianoMotionLastAlignment;
 if(!alignment?.ok||pianoMotionLastSong!==current)return;
 const n=alignment.matches.length,limit=24;
 pianoMotionReviewOffset=Math.max(0,Math.min(Math.floor(pianoMotionReviewOffset/limit)*limit,
  Math.floor((n-1)/limit)*limit));
 const windowNotes=pianoMotionWindow(alignment,pianoMotionReviewOffset,limit);
 const summary=pianoMotionReviewAvailable();
 if(!summary)return;
 for(const i of pianoMotionReviewSelected)
  if(summary.eligibility[i]!=='eligible')pianoMotionReviewSelected.delete(i);
 $('pianoMotionRollRange').textContent=(pianoMotionReviewOffset+1)+'–'+
  (pianoMotionReviewOffset+windowNotes.length)+' / '+n;
 $('pianoMotionPrev').disabled=pianoMotionReviewOffset===0;
 $('pianoMotionNext').disabled=pianoMotionReviewOffset+limit>=n;
 const list=$('pianoMotionReviewList');list.replaceChildren();
 for(const {suggestion:s,index} of windowNotes){
  const reason=summary.eligibility[index],selectable=reason==='eligible';
  const label=document.createElement('label');label.className='pianoMotionReviewRow';
  label.dataset.reviewStatus=reason;
  if(reason==='protected')label.classList.add('protected');
  if(reason==='conflict')label.classList.add('physicalConflict');
  if(reason==='unresolved')label.classList.add('unresolved');
  if(!selectable)label.classList.add('unavailable');
  const input=document.createElement('input');input.type='checkbox';
  input.checked=selectable&&pianoMotionReviewSelected.has(index);
  input.disabled=!selectable;
  input.setAttribute('aria-label',nameOf(s.pitch)+' · '+s.start.toFixed(2)+' с · '+(selectable?s.hand+' палец '+s.finger:reason));
  const conflict=reason==='conflict'?pianoMotionReviewAudit?.issues.find(x=>x.index===index):null;
  label.title=reason==='protected'?'Сохранена авторская или ручная аппликатура':
   reason==='unresolved'?'Алгоритм не определил палец':
   reason==='applied'?'Уже применено':
   reason==='conflict'?'Физический конфликт: '+(conflict?.codes.join(', ')||'см. аудит'):
   'Непроверенное предложение — можно выбрать';
  input.addEventListener('change',()=>{
   if(input.checked)pianoMotionReviewSelected.add(index);else pianoMotionReviewSelected.delete(index);
   pianoMotionReviewSync();pianoMotionReviewDraw();
  });
  const p=document.createElement('span');p.className='pianoMotionReviewPitch';p.textContent=nameOf(s.pitch);
  const t=document.createElement('span');t.className='pianoMotionReviewTime';t.textContent=s.start.toFixed(2)+' с';
  const v=document.createElement('span');v.className='pianoMotionReviewFinger';
  v.textContent=reason==='protected'?'Защищено: автор/ручная':
   reason==='conflict'?'⚠ Физический конфликт':
   reason==='unresolved'?'Палец не определён':
   reason==='applied'?'✓ Уже применено':s.hand+' · '+s.finger;
  label.append(input,p,t,v);list.append(label);
 }
 pianoMotionReviewDraw();pianoMotionReviewSync();
}
function pianoMotionReviewDraw(){
 const canvas=$('pianoMotionRoll'),ctx=canvas.getContext('2d');
 if(!ctx)return;
 const w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0d1622';ctx.fillRect(0,0,w,h);
 const notes=pianoMotionWindow(pianoMotionLastAlignment,pianoMotionReviewOffset,24);
 const summary=pianoMotionReviewAvailable();
 pianoMotionReviewHit=[];if(!notes.length||!summary)return;
 const lo=Math.min(...notes.map(x=>x.suggestion.pitch)),hi=Math.max(...notes.map(x=>x.suggestion.pitch));
 const t0=Math.min(...notes.map(x=>x.suggestion.start));
 const t1=Math.max(...notes.map(x=>x.suggestion.end??x.suggestion.start+.1),t0+.3);
 const margin=30,left=36,usableW=w-left-10,usableH=h-margin-12;
 ctx.font='12px system-ui';ctx.fillStyle='#9db1c6';ctx.fillText(nameOf(hi),3,22);ctx.fillText(nameOf(lo),3,h-9);
 for(let j=0;j<5;j++){const y=margin+j*usableH/4;
  ctx.strokeStyle='#293b50';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-7,y);ctx.stroke();}
 for(const {suggestion:s,index} of notes){
  const x=left+(s.start-t0)/(t1-t0)*usableW;
  const length=Math.max(7,Math.min(usableW,((s.end??s.start+.08)-s.start)/(t1-t0)*usableW));
  const y=margin+(hi-s.pitch)/Math.max(1,hi-lo)*(usableH-10);
  const rect={x,y,w:Math.max(6,Math.min(length,w-x-7)),h:9,index};
  ctx.fillStyle=summary.eligibility[index]==='conflict'?'#ad5555':
   summary.eligibility[index]!=='eligible'?'#67778a':
   s.hand==='RH'?'#4385a8':'#558d6b';
  ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
  ctx.strokeStyle=pianoMotionReviewSelected.has(index)?'#ffe4a0':'#8595a9';
  ctx.lineWidth=pianoMotionReviewSelected.has(index)?3:1;
  ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
  pianoMotionReviewHit.push(rect);
 }
 ctx.fillStyle='#a4b5cc';ctx.fillText(t0.toFixed(1)+' c',left,h-3);
 ctx.textAlign='right';ctx.fillText(t1.toFixed(1)+' c',w-7,h-3);ctx.textAlign='left';
}
$('pianoMotionRoll').addEventListener('click',e=>{
 const rect=$('pianoMotionRoll').getBoundingClientRect();
 const x=(e.clientX-rect.left)*$('pianoMotionRoll').width/rect.width;
 const y=(e.clientY-rect.top)*$('pianoMotionRoll').height/rect.height;
 const hit=pianoMotionReviewHit.slice().reverse().find(n=>x>=n.x&&x<=n.x+n.w&&y>=n.y-3&&y<=n.y+n.h+3);
 if(!hit||pianoMotionReviewAvailable()?.eligibility[hit.index]!=='eligible')return;
 if(pianoMotionReviewSelected.has(hit.index))pianoMotionReviewSelected.delete(hit.index);
 else pianoMotionReviewSelected.add(hit.index);
 pianoMotionReviewRender();
});
$('pianoMotionPrev').onclick=()=>{pianoMotionReviewOffset-=24;pianoMotionReviewRender()};
$('pianoMotionNext').onclick=()=>{pianoMotionReviewOffset+=24;pianoMotionReviewRender()};
$('pianoMotionSelectAll').onclick=()=>{
 pianoMotionReviewSelected=new Set(pianoMotionReviewAvailable()?.eligibleIndices||[]);
 pianoMotionReviewRender();
};
$('pianoMotionSelectNone').onclick=()=>{pianoMotionReviewSelected.clear();pianoMotionReviewRender()};

function pianoMotionStop(message){
 pianoMotionGeneration++;
 if(pianoMotionRun){pianoMotionRun.terminate();pianoMotionRun=null;}
 pianoMotionLastResult=null;
 pianoMotionLastSong=null;
 pianoMotionLastAlignment=null;
 pianoMotionLastPlan=null;
 pianoMotionLastApplied=false;
 pianoMotionReviewSelected.clear();pianoMotionReviewOffset=0;pianoMotionReviewHit=[];
 pianoMotionReviewHistory=pianoMotionEmptyHistory();pianoMotionReviewAudit=null;
 $('pianoMotionReview').hidden=true;
 $('pianoMotionReview').classList.remove('collapsed');
 $('pianoMotionReviewList').replaceChildren();
 $('pianoMotionResult').replaceChildren();
 $('pianoMotionClear').disabled=true;
 if($('pianoMotionApply'))$('pianoMotionApply').disabled=true;
 if($('pianoMotionExportXML'))$('pianoMotionExportXML').disabled=true;
 $('pianoMotionCalculate').disabled=false;
 $('pianoMotionCancel').hidden=true;$('pianoMotionCancel').disabled=true;
 if(message)$('pianoMotionStatus').textContent=message;
}
$('pianoMotionCancel').onclick=()=>pianoMotionStop(
 'Расчёт PianoMotion отменён. Исходные ноты и ручные исправления сохранены.'
);
$('pianoMotionClear').onclick=()=>{
 if(pianoMotionLastApplied&&pianoMotionLastSong===current){
  $('pianoMotionReview').classList.add('collapsed');
  pianoMotionReviewSync();
  $('pianoMotionResult').replaceChildren();
  $('pianoMotionApply').disabled=true;
  $('pianoMotionClear').disabled=true;
  $('pianoMotionStatus').textContent='Предложения скрыты. Применённые пальцы сохранены; Undo/Redo и экспорт доступны.';
  return;
 }
 pianoMotionStop('Предложения скрыты. Исходные ноты не изменены.');
};
$('pianoMotionCalculate').onclick=()=>{
 pianoMotionStop();
 const song=current;
 if(!song){$('pianoMotionStatus').textContent='Сначала выбери мелодию в библиотеке.';return}
 if(!window.Worker){
  $('pianoMotionStatus').textContent='Браузер не поддерживает Web Worker.';return;
 }
 const plan=pianoMotionSourcePlan(song,Number(state.track)||0);
 if(!plan.ok){$('pianoMotionStatus').textContent='Нет подходящих нот: '+plan.reason;return}
 function startRun(useExactOriginal){
  // Never feed a guitar/percussion MIDI directly to the two-hand piano solver.
  const original=useExactOriginal&&plan.mode==='original'?originalMidiForSong(song):null;
  const derived=!original?makePianoMotionMidiFromSong(song,{
   trackIndices:plan.trackIndices,channel:plan.channel??null,
   // Original score is untouched. Same-pitch overlapping re-attacks are
   // excluded from solver input and must receive a manual finger instead.
   overlapPolicy:song.format==='MusicXML'?'omit-later':'reject'
  }):null;
  if(!original&&!derived?.ok){
   $('pianoMotionStatus').textContent='Не могу подготовить MIDI для расчёта: '+(derived?.reason||'нет нот')+'.';return;
  }
  const midi=original||derived.midiBytes;
  const omittedCount=derived?.omittedNotes?.length||0;
  const skippedMessage=omittedCount?
   ' · '+omittedCount+' перекрывающихся унисонных нот исключены только из расчёта; назначьте им пальцы вручную. Исходная партитура не изменена.':'';
  const diagnostic=pianoMotionPlayableDiagnostic(song,plan.trackIndices,plan.channel??null);
  if(midi.length>4000000){
   $('pianoMotionStatus').textContent='MIDI больше допустимого ограничения 4 МБ.';return;
  }
  const id=++pianoMotionGeneration;
  const exact=!!original;
  $('pianoMotionStatus').textContent=exact?
   'Подготовлен исходный MIDI; загружаю оригинальный Python-алгоритм PianoMotion…':
   plan.description+' · рассчитываю пальцы для фортепиано…'+skippedMessage;
  let worker;
  try{worker=new Worker('./assets/pianomotion-engine-worker.js',{type:'module'});}
  catch{
   pianoMotionStop('Не удалось запустить модульный Web Worker.');return;
  }
  pianoMotionRun=worker;
  $('pianoMotionCalculate').disabled=true;
  $('pianoMotionCancel').hidden=false;$('pianoMotionCancel').disabled=false;
  const cancel=()=>{
   if(pianoMotionGeneration!==id)return false;
   if(current!==song){
    pianoMotionStop('Произведение изменилось. Расчёт отменён.');return false;
   }
   return true;
  };
  worker.onmessage=event=>{
   const data=event.data;
   if(!data||data.id!==id||!cancel())return;
   if(data.type==='progress'){
    $('pianoMotionStatus').textContent=data.message;return;
   }
   worker.terminate();pianoMotionRun=null;
   $('pianoMotionCalculate').disabled=false;
   $('pianoMotionCancel').hidden=true;$('pianoMotionCancel').disabled=true;
   if(data.type==='error'){
    if(exact&&pianoMotionCanRetry(data.reason)){
     console.warn('PianoMotion raw MIDI structure rejected: '+data.reason+'; retrying parsed notes.');
     startRun(false);
     return;
    }
    const hint=data.reason==='PYODIDE_RUNTIME_DOWNLOAD_FAILED'
     ?'. Не удалось загрузить Python с CDN. Проверь подключение к интернету и повтори расчёт.'
     :data.reason==='PIANOMOTION_RUNTIME_FAILED'
     ?'. Проверь подключение к сети и консоль браузера (F12).'
     :' (подробности в консоли F12).';
    $('pianoMotionStatus').textContent='PianoMotion: '+data.reason+hint;return;
   }
   if(data.type!=='result'||!data.result)return;
   const result=data.result;
   const list=$('pianoMotionResult');list.replaceChildren();
   if(!Array.isArray(result.suggestions)||result.suggestions.length!==result.total){
    $('pianoMotionStatus').textContent='PianoMotion вернул неполную последовательность. Предложения отклонены.';return;
   }
   const alignment=pianoMotionAlignSuggestions(song,result.suggestions,{
    trackIndices:plan.trackIndices,channel:plan.channel??null,tolerance:exact?.025:.005,
    sourceNotes:exact?null:derived.sourceNotes
   });
   const audit=alignment.ok?pianoMotionAuditFingers(alignment):null;
   pianoMotionReviewAudit=audit;
   $('pianoMotionStatus').textContent='Оригинальный PianoMotion Python · '+result.total+
    ' нот · '+result.playable+' пальцев · '+result.unresolved+' не определено. '+
    (exact?'Исходный MIDI без изменений.':plan.description+'.')+skippedMessage+
    (diagnostic.possiblyUnplayable?' ВНИМАНИЕ: одновременно удерживается до '+diagnostic.maxHeld+' нот (больше 10).':'')+
    (!alignment.ok?' Применение заблокировано: '+alignment.reason+'.':
     audit&&!audit.ok?' Аудит отказал: '+audit.reason+'.':
     audit?.blocked.length?' Физические противоречия: '+audit.blocked.length+
      ' нот. Эти предложения не будут применены.':'')+
    (audit?.techniqueExceptions?' Парных контактов большим пальцем/мизинцем: '+
      audit.techniqueExceptions+' (требуют проверки техники).':'')+
    ' Физическая проверка не подтверждает педагогическую правильность.';
   if(result.suggestions.some(n=>!Number.isInteger(n.pitch)||!Number.isFinite(n.start)||
     !['RH','LH'].includes(n.hand)||n.finger!=null&&
     (!Number.isInteger(n.finger)||n.finger<1||n.finger>5))){
    pianoMotionStop('Недопустимые данные аппликатуры от движка.');return;
   }
   pianoMotionLastResult=result;
   pianoMotionLastSong=song;
   pianoMotionLastAlignment=alignment.ok&&audit?.ok?alignment:null;
   pianoMotionLastPlan=alignment.ok&&audit?.ok?{
    ...plan,sourceNotes:exact?null:derived.sourceNotes,omittedCount,exactOriginalMidi:exact
   }:null;
   if($('pianoMotionApply'))$('pianoMotionApply').disabled=!alignment.ok||!audit?.ok;
   if($('pianoMotionExportXML'))$('pianoMotionExportXML').disabled=true; // Export only after Apply.
   $('pianoMotionClear').disabled=false;
   $('pianoMotionReview').hidden=!alignment.ok||!audit?.ok;
   if(alignment.ok&&audit?.ok){pianoMotionReviewSelected.clear();pianoMotionReviewRender();}
  };
  worker.onerror=event=>{
   console.error('PianoMotion worker onerror:',event);
   if(cancel())pianoMotionStop('Ошибка браузерного Python Worker. Повторная конверсия MIDI не поможет; проверь консоль.');
  };
  const transferable=midi.slice().buffer;
  worker.postMessage({id,type:'analyze-midi',midiBytes:transferable},[transferable]);
 }
 startRun(true);
};
function pianoMotionReviewRefreshSong(){
 persist();renderCanvas();
 if(state.scoreView==='sheet'&&typeof scoreEnsureRendered==='function'){
  scoreSong=null;scoreEnsureRendered().catch(()=>{});
 }
 if(state.scoreView==='editor'&&typeof fingerEditorRender==='function')fingerEditorRender();
}
function pianoMotionReviewValidate(){
 const song=current,alignment=pianoMotionLastAlignment,plan=pianoMotionLastPlan;
 if(!song||pianoMotionLastSong!==song||!alignment?.ok||!plan)return false;
 const checked=pianoMotionAlignSuggestions(song,pianoMotionLastResult.suggestions,{
  trackIndices:plan.trackIndices,channel:plan.channel??null,
  tolerance:plan.exactOriginalMidi?.025:.005,sourceNotes:plan.sourceNotes??null
 });
 if(!checked.ok||checked.matches.some((entry,i)=>entry.note!==alignment.matches[i]?.note)){
  $('pianoMotionStatus').textContent='Ноты изменились после расчёта. Рассчитайте аппликатуру заново.';
  $('pianoMotionApply').disabled=true;$('pianoMotionApplySelected').disabled=true;
  $('pianoMotionExportXML').disabled=true;return false;
 }
 const audit=pianoMotionAuditFingers(checked);
 if(!audit.ok){
  $('pianoMotionStatus').textContent='Проверка аппликатуры: '+audit.reason;
  $('pianoMotionApply').disabled=true;$('pianoMotionApplySelected').disabled=true;
  $('pianoMotionExportXML').disabled=true;return false;
 }
 pianoMotionReviewAudit=audit;
 return true;
}
function pianoMotionReviewApply(indices){
 if(!pianoMotionReviewValidate())return;
 const work=fingerOverrideWorkKey(current);
 const edits=work?state.fingerOverrides?.[work]||{}:{};
 const batch=pianoMotionProposeBatch(pianoMotionLastAlignment,indices,edits,pianoMotionReviewAudit);
 if(!batch.ok){
  $('pianoMotionStatus').textContent='Проверка аппликатуры: '+batch.reason;return;
 }
 const result=pianoMotionCommitBatch(pianoMotionReviewHistory,batch);
 if(!result.ok){
  $('pianoMotionStatus').textContent=result.reason==='NOTHING_TO_APPLY'?
   'Изменений нет · защищено '+batch.protectedCount+' · без пальца '+batch.unresolved+
    ' · конфликтных '+batch.blockedCount+'.':
   'Применение отменено: '+result.reason;
  return;
 }
 pianoMotionReviewHistory=result.history;
 pianoMotionLastApplied=true;
 pianoMotionReviewSelected.clear();
 if(state.fingerGuidanceMode==='off'){
  state.fingerGuidanceMode='numbers';
  if($('fingerGuideMode'))$('fingerGuideMode').value='numbers';
 }
 pianoMotionReviewRefreshSong();pianoMotionReviewRender();
 notify('Применено '+result.count+' выбранных пальцев · Undo доступен');
 $('pianoMotionStatus').textContent='Применено '+result.count+
  ' пальцев · защищено '+batch.protectedCount+
  ' · без пальца '+batch.unresolved+' · конфликтных пропущено '+batch.blockedCount+
   (pianoMotionLastPlan?.omittedCount?' · '+pianoMotionLastPlan.omittedCount+
     ' перекрывающихся нот остаются для ручной аппликатуры.':'')+
   ' · предложения не являются авторскими.';
}
$('pianoMotionApply').onclick=()=>pianoMotionReviewApply(
 pianoMotionReviewAvailable()?.eligibleIndices||[]
);
$('pianoMotionApplySelected').onclick=()=>pianoMotionReviewApply([...pianoMotionReviewSelected]);
for(const [button,direction]of [['pianoMotionUndo','undo'],['pianoMotionRedo','redo']]){
 $(button).onclick=()=>{
  if(!pianoMotionReviewValidate())return;
  const result=pianoMotionTravelHistory(pianoMotionReviewHistory,direction);
  if(!result.ok){$('pianoMotionStatus').textContent='История недоступна: '+result.reason;return;}
  pianoMotionReviewHistory=result.history;
  pianoMotionLastApplied=pianoMotionReviewCountApplied()>0;
  pianoMotionReviewRefreshSong();pianoMotionReviewRender();
  $('pianoMotionStatus').textContent=(direction==='undo'?'Отменено ':'Повторено ')+result.count+
   ' пальцев. Источник MIDI и авторские данные не изменены.';
 };
}
if($('pianoMotionExportXML'))$('pianoMotionExportXML').onclick=()=>{
 const song=current;
 if(!song||pianoMotionLastSong!==song||!pianoMotionLastAlignment?.ok||!pianoMotionLastApplied){
  notify('Сначала рассчитайте и примените аппликатуру');return;
 }
 const refreshed=pianoMotionAlignSuggestions(song,pianoMotionLastResult.suggestions,{
  trackIndices:pianoMotionLastPlan.trackIndices,channel:pianoMotionLastPlan.channel??null,
  tolerance:pianoMotionLastPlan.exactOriginalMidi?.025:.005,
  sourceNotes:pianoMotionLastPlan.sourceNotes??null
 });
 if(!refreshed.ok||refreshed.matches.some((entry,i)=>
     entry.note!==pianoMotionLastAlignment.matches[i]?.note)){
  notify('Партия изменилась. Повторите расчёт перед экспортом.');return;
 }
 let xml=null;
 if(song.format==='MusicXML'&&song.notationXML&&typeof sheetFingeringOverlay==='function'){
  const changes={};
  const overrideKey=fingerOverrideWorkKey(song);
  const userEdits=overrideKey?state.fingerOverrides?.[overrideKey]||{}:{};
  for(const t of (song.tracks||[])){
   for(const n of (t.notes||[])){
    const user=n.noteId?fingerOverrideEffective(n,userEdits[n.noteId]):null;
    const finger=user?user.finger:n.finger;
    const hand=user?user.hand:n.hand;
    if(n.noteId&&Number.isInteger(finger)&&finger>=1&&finger<=5){
     changes[n.noteId]={finger,hand:hand||null};
    }
   }
  }
  if(Object.keys(changes).length){
   const parse=s=>new DOMParser().parseFromString(s,'application/xml');
   const serialize=d=>new XMLSerializer().serializeToString(d);
   const res=sheetFingeringOverlay(song,changes,{parse,serialize,exportMode:true});
   if(res?.status==='applied'&&res.xml)xml=res.xml;
  }
 }
 if(!xml&&song.format==='MusicXML'&&song.notationXML){
  notify('Экспорт остановлен: не удалось безопасно наложить аппликатуру на оригинальный MusicXML.');return;
 }
 if(!xml){
  try{
   const tracks=pianoMotionLastPlan?.mode==='derived'
    ?pianoMotionLastPlan.trackIndices.map(i=>({
      ...song.tracks[i],notes:song.tracks[i].notes.filter(n=>
       !n.isDrum&&n.channel!==9&&
       (pianoMotionLastPlan.channel==null||n.channel===pianoMotionLastPlan.channel))
     })):song.tracks;
   xml=scoreXMLFromSong({...song,tracks});
  }catch(e){
   notify('Не удалось создать MusicXML: '+(e?.message||e));
   return;
  }
 }
 if(!xml){
  notify('Не удалось сформировать MusicXML');return;
 }
 // FG-04D2: never re-import generated PianoMotion numbers as composer fingers.
 // This reuses the conservative importer marker from FG-04D1. The original
 // document/song is untouched; only the separate download is annotated.
 try{
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  const root=doc.documentElement;
  if(!root||root.localName!=='score-partwise'||doc.querySelector('parsererror'))
   throw Error('Некорректная партитура');
  const ns=root.namespaceURI,make=name=>ns?doc.createElementNS(ns,name):doc.createElement(name);
  const direct=(parent,name)=>[...(parent?.children||[])].find(n=>n.localName===name)||null;
  let identification=direct(root,'identification');
  if(!identification){
   identification=make('identification');
   const next=[...root.children].find(n=>['defaults','credit','part-list','part'].includes(n.localName))||null;
   root.insertBefore(identification,next);
  }
  let miscellaneous=direct(identification,'miscellaneous');
  if(!miscellaneous){miscellaneous=make('miscellaneous');identification.append(miscellaneous);}
  if(![...miscellaneous.children].some(n=>n.localName==='miscellaneous-field'&&
      n.getAttribute('name')==='play-along-user-fingering')){
   const marker=make('miscellaneous-field');
   marker.setAttribute('name','play-along-user-fingering');
   marker.textContent='PianoMotion-generated fingers applied by user in Play Along; not composer-authored; original MIDI-derived notation is approximate.';
   miscellaneous.append(marker);
  }
  xml=new XMLSerializer().serializeToString(doc);
 }catch(error){
  notify('Не удалось безопасно пометить происхождение аппликатуры: '+(error?.message||error));
  return;
 }
 const blob=new Blob([xml],{type:'application/vnd.recordare.musicxml+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 const safeName=(String(song.title||'melody').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)||'melody')+'-fingering.musicxml';
 a.href=url;a.download=safeName;
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 notify('Файл '+safeName+' скачан');
};
/** FG-04A: local, read-only comparison against an external generator's XML.
 * Never turn these suggestions into teacher hints or saved user overrides.
 */
let fingerResearchReport=null,fingerResearchWork=null,fingerResearchFileName='';
function fingerResearchReset(){
 fingerResearchReport=null;fingerResearchWork=null;fingerResearchFileName='';
 $('fingerResearchFile').value='';
 $('fingerResearchSummary').textContent='Нет загруженного предложения.';
 $('fingerResearchDetails').replaceChildren();
 $('fingerResearchExport').disabled=true;
}
function fingerResearchSync(){
 if(fingerResearchWork!==null&&fingerResearchWork!==current)fingerResearchReset();
 const sourceOK=!!current&&current.format==='MusicXML'&&state.adaptMode==='original';
 $('fingerResearchCompare').disabled=!sourceOK;
 $('fingerResearchFile').disabled=!sourceOK;
}
$('fingerResearchCompare').onclick=async()=>{
 fingerResearchSync();
 const input=$('fingerResearchFile'),file=input.files?.[0],engine=$('fingerResearchEngine').value;
 if(!current||current.format!=='MusicXML'||state.adaptMode!=='original'){
  $('fingerResearchSummary').textContent='Откройте исходный MusicXML в режиме «Оригинал».';
  return;
 }
 if(!file||!/.(?:musicxml|xml|mxl)$/i.test(file.name)){
  $('fingerResearchSummary').textContent='Выберите размеченный XML, MusicXML или MXL.';
  return;
 }
 if(file.size>16*1024*1024){
  $('fingerResearchSummary').textContent='Файл кандидата превышает 16 МБ.';
  return;
 }
 const source=current,sourceKey=fingerOverrideWorkKey(source),button=$('fingerResearchCompare');
 button.disabled=true;$('fingerResearchSummary').textContent='Проверка партитуры и аппликатуры…';
 try{
  const candidate=await songFromBuffer(file.name,await file.arrayBuffer());
  if(source!==current||sourceKey!==fingerOverrideWorkKey(current)){
   fingerResearchReset();
   $('fingerResearchSummary').textContent='Произведение изменилось; повторите проверку.';
   return;
  }
  const result=externalFingeringCompare(source,candidate,{
   engine,parse:xml=>new DOMParser().parseFromString(xml,'application/xml')});
  fingerResearchWork=source;fingerResearchFileName=file.name;
  fingerResearchReport={
   schema:'play-along-fingering-evaluation-v1',
   inspectedAt:new Date().toISOString(),sourceTitle:source.title,
   sourceFingerprint:sourceKey,candidateFilename:file.name,
   scope:'research-only / unapproved external proposal / no import or playback change',
   ...result
  };
  $('fingerResearchExport').disabled=false;
  const sum=result.summary;
  $('fingerResearchSummary').textContent=result.status==='rejected'?
   'ОТКЛОНЕНО: '+result.reason:
   result.status==='conflicts'?'НЕ ПРИНЯТО: генератор изменил авторские пальцы.':
   'Сопоставление партитуры пройдено. Предложения НЕ применены.';
  const details=$('fingerResearchDetails');details.replaceChildren();
  if(sum){
   const rows=[
    ['Всего нот',sum.total],['Авторских пальцев',sum.author],
    ['Авторские пальцы сохранены',sum.preserved],
    ['Новых предложений',sum.generated],
    ['Изменено авторских',sum.conflicts],
    ['Удалено авторских',sum.removedAuthor],
    ['Без цифр после расчёта',sum.missing],
    ['Предложений без определённой руки',sum.handUnknown]
   ];
   for(const [label,value]of rows){
    const span=document.createElement('span');
    span.className='fingerResearchMetric';span.textContent=label+': '+value;
    details.append(span);
   }
  }
 }catch(err){
  fingerResearchReport=null;fingerResearchWork=null;
  $('fingerResearchExport').disabled=true;
  $('fingerResearchDetails').replaceChildren();
  $('fingerResearchSummary').textContent='Не удалось проверить кандидат: '+(err?.message||err);
 }finally{fingerResearchSync()}
};
$('fingerResearchExport').onclick=()=>{
 fingerResearchSync();
 if(!fingerResearchReport||fingerResearchWork!==current)return;
 const content=JSON.stringify(fingerResearchReport,null,2);
 const blob=new Blob([content],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='play-along-fingering-evaluation.json';
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// FG-04C7: locally staged, ORIGINAL PianoMotion Python runtime for existing
// MIDI works. This experimental panel is invisible in ordinary public builds
// because the private source/wheel assets are NEVER staged by npm build or CI.
let pianoMotionMidiSeq=0,pianoMotionMidiWorker=null;
void fetch('./assets/pianomotion/staged-manifest.json',{cache:'no-store'})
 .then(r=>r.ok?r.json():null).then(manifest=>{
  if(manifest?.localOnly===true&&manifest?.runtimeVersion==='314.0.7'&&
      manifest?.publicRedistributionApproved===false)
   {$('pianoMotionMidiPanel').classList.remove('hidden');fingeringWorkspaceSync();}
 }).catch(()=>{});
$('pianoMotionMidiRun').onclick=async()=>{
 const status=$('pianoMotionMidiStatus'),host=$('pianoMotionMidiResults');
 host.replaceChildren();
 if(current?.format!=='MIDI'){
  status.textContent='Выбери обычный MIDI-файл из библиотеки Play Along. MusicXML использует отдельный источник нот.';return;
 }
 const song=current,sourceId=song.id;
 if(!collectionIndex.some(e=>e.id===sourceId)){
  status.textContent='Исходный MIDI ещё не сохранён в «Моей коллекции». Дождись сохранения и повтори расчёт.';return;
 }
 if(pianoMotionMidiWorker){pianoMotionMidiWorker.terminate();pianoMotionMidiWorker=null}
 let bytes;
 try{
  const stored=await libraryReadBinary(sourceId);
  if(song!==current||sourceId!==current.id)return;
  if(!/\.(mid|midi)$/i.test(stored.name)||!stored.data||stored.data.byteLength>4000000)
   throw Error('Оригинальный файл не является MIDI до 4 МБ');
  if(!(await libraryMatchesContentId(stored.data,sourceId)))
   throw Error('Контрольная сумма сохранённого MIDI не совпала');
  bytes=stored.data.slice(0);
 }catch(error){
  status.textContent='Не удалось прочитать исходный MIDI: '+(error?.message||'нет данных');return;
 }
 const id=++pianoMotionMidiSeq;
 let worker;
 try{worker=new Worker('./assets/pianomotion-engine-worker.js',{type:'module'})}
 catch{status.textContent='Браузер заблокировал модульный Web Worker';return}
 pianoMotionMidiWorker=worker;
 $('pianoMotionMidiRun').disabled=true;
 status.textContent='Загружаю локальный Pyodide и Python-ядро PianoMotion…';
 const finish=()=>{
  clearTimeout(timer);worker.terminate();
  if(pianoMotionMidiWorker===worker)pianoMotionMidiWorker=null;
  $('pianoMotionMidiRun').disabled=false;
 };
 const timer=setTimeout(()=>{
  if(id!==pianoMotionMidiSeq)return;
  finish();status.textContent='Python-движок не ответил вовремя. Оригинальный MIDI сохранён без изменений.';
 },180000);
 worker.onmessage=e=>{
  if(e.data?.id!==id||song!==current||sourceId!==current.id){
   if(song!==current)finish();return;
  }
  const message=e.data;
  if(message.type==='progress'){
   status.textContent=String(message.message).slice(0,250);return;
  }
  finish();
  if(message.type==='error'){
   status.textContent='PianoMotion отказался рассчитывать: '+message.reason+
    '. Никакие пользовательские пальцы не изменены.';return;
  }
  if(message.type!=='result'||!message.result)return;
  const r=message.result;
  status.textContent='Оригинальный PianoMotion · '+r.total+' нот · '+r.playable+
   ' предложений · '+r.unresolved+' не определены. Источник проверен SHA-256. Результаты только для анализа; используется стандартная анатомия PianoMotion, выбранный в Play Along размер кисти пока не применяется.';
  const title=document.createElement('p');title.className='small';
  title.textContent='Первые '+r.suggestions.length+' нот. Сопоставление с подсказками Play Along и экспертная проверка ещё не выполнены.';
  host.append(title);
  const list=document.createElement('ol');
  for(const n of r.suggestions){
   const li=document.createElement('li');
   li.textContent=n.hand+' · '+nameOf(n.pitch)+' · '+n.start.toFixed(2)+
    ' с → '+(n.finger===null?'без пальца':'палец '+n.finger)+
    ' (автоматически, не проверено)';
   list.append(li);
  }
  host.append(list);
 };
 worker.onerror=()=>{
  finish();status.textContent='Не удалось запустить Python-ядро в браузере. Сохранённый MIDI не изменён.';
 };
 worker.postMessage({id,type:'analyze-midi',midiBytes:bytes},[bytes]);
};
