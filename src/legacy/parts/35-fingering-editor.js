// FG-03C2B3 — dedicated scrollable, source-anchored fingering editor.
// Geometry is virtualized: the scrollable timeline is a lightweight DIV;
// the Canvas always covers only the viewport, even for long MusicXML works.
const fingerEditorCanvas=$('fingerEditorCanvas'),fingerEditorScroller=$('fingerEditorScroller'),
      fingerEditorSurface=$('fingerEditorSurface');
let fingerEditorBoxes=[],fingerEditorPointer=null,fingerEditorPaintScheduled=false,
    fingerEditorWidth=0,fingerEditorHeight=0;
function fingerEditorAvailable(){
 return !!current&&current.format==='MusicXML'&&state.adaptMode==='original'&&
  !!fingerGuideWorkKey();
}
function fingerEditorPaintSoon(){
 if(fingerEditorPaintScheduled)return;
 fingerEditorPaintScheduled=true;
 requestAnimationFrame(()=>{fingerEditorPaintScheduled=false;fingerEditorRender()});
}
function fingerEditorNotes(){return fingerEditorAvailable()?fingerSelectionOrdered().map(x=>x.note):[]}
function fingerEditorRender(){
 if(state.scoreView!=='editor'||state.page!=='practice')return;
 fingerResearchSync();
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
  const finger=manual?manual.finger:n.fingeringSource==='musicxml'?n.finger:null;
  const hand=manual?manual.hand:n.hand==='RH'||n.hand==='LH'?n.hand:null;
  const selected=fingerSelectedIds.has(n.noteId);
  c.fillStyle=hand==='RH'?'#3f6c92':hand==='LH'?'#527a63':'#525e74';
  c.fillRect(b.x,b.y,b.w,b.h);
  c.lineWidth=selected?2.5:manual?1.8:1;
  c.strokeStyle=selected?'#ffe48c':manual?'#e6ac5d':'#8796ab';
  c.strokeRect(b.x,b.y,b.w,b.h);
  c.fillStyle=selected?'#fff5cc':'#fff';c.font='bold 11px system-ui';
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
  ' · Redo '+fingerOverrideHistoryCurrent().future.length;
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
window.addEventListener('resize',fingerEditorPaintSoon);

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
