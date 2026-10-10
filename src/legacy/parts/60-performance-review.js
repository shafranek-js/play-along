// ===== v0.6 Performance Review: per-note judgements, local history and loop suggestions =====
const PERF_STORE='playalong:performance:attempts:v06';
let perfAttempts=[];try{const x=JSON.parse(localStorage.getItem(PERF_STORE)||'[]');if(Array.isArray(x))perfAttempts=x.slice(0,30)}catch{}
let perfLast=null,perfLastIndex=new Map(),currentSongKey='';
const reviewNoteKey=n=>`${n.pitch}:${Math.round(n.start*1000)}:${Math.round(n.duration*1000)}`;
function songFingerprint(song){
 if(!song)return '';
 let h=2166136261;function push(str){for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}}
 push(song.title);for(const [i,t] of song.tracks.entries()){push(i+':'+t.name);for(const n of t.notes)push(`${n.pitch},${Math.round(n.start*1000)},${Math.round(n.duration*1000)};`)}
 return (h>>>0).toString(16);
}
function performanceProfile(){return `${currentSongKey}:t${state.track}:${state.adaptMode}:${state.adaptMode==='transpose'?state.adaptShift:state.adaptMode==='adaptive'?state.adaptProfile:'0'}:${(targetKeyboard()?.low??'song')}-${(targetKeyboard()?.high??'song')}`}
function rebuildPerfLast(){perfLast=perfAttempts.find(r=>r.profile===performanceProfile())||null;perfLastIndex=new Map((perfLast?.notes||[]).map(n=>[reviewNoteKey(n),n]));}
function summarizePerformance(session){
 const s=session.stats,played=session.all.filter(n=>n.hit),timing=played.filter(n=>n.timingMs!=null),holds=played.filter(n=>n.holdRatio!=null);
 const avgAbsTime=timing.length?Math.round(timing.reduce((a,n)=>a+Math.abs(n.timingMs),0)/timing.length):null;
 const chordCount=s.badChords+s.goodChords;
 const accuracy=(s.hits+s.missed+s.wrong)?Math.round(100*s.hits/(s.hits+s.missed+s.wrong)):0;
 const timePct=timing.length?Math.round(100*timing.filter(n=>Math.abs(n.timingMs)<=110).length/timing.length):null;
 const holdPct=holds.length?Math.round(100*holds.filter(n=>n.holdRatio>=.7&&n.holdRatio<=1.4).length/holds.length):null;
 const chordPct=chordCount?Math.round(100*s.goodChords/chordCount):null;
 const parts=[[accuracy,50]];if(timePct!=null)parts.push([timePct,25]);if(holdPct!=null)parts.push([holdPct,15]);if(chordPct!=null)parts.push([chordPct,10]);
 const totalW=parts.reduce((a,p)=>a+p[1],0),score=Math.round(parts.reduce((a,p)=>a+p[0]*p[1],0)/totalW);
 const bucket=new Map();function getBucket(at){const i=Math.floor(Math.max(0,at)/4);if(!bucket.has(i))bucket.set(i,{start:i*4,end:(i+1)*4,errors:0,events:0,pitches:[]});return bucket.get(i)}
 for(const n of session.all){if(!n.hit&&!n.miss)continue;const b=getBucket(n.start);b.events++;if(n.miss){b.errors+=2;b.pitches.push(nameOf(n.pitch))}else if(n.hit){if(n.timingMs!=null&&Math.abs(n.timingMs)>110)b.errors++;if(n.holdRatio!=null&&(n.holdRatio<.7||n.holdRatio>1.4))b.errors++;if(n.chordSpreadMs!=null&&n.chordSpreadMs>140)b.errors++;}}
 for(const e of session.extras){const b=getBucket(e.at);b.errors++;b.pitches.push(nameOf(e.pitch))}
 const sections=[...bucket.values()].filter(b=>b.errors>0).sort((a,b)=>b.errors-a.errors||a.start-b.start).slice(0,6);
 return {score,accuracy,timePct,holdPct,chordPct,avgAbsTime,sections,stats:{...s},total:session.all.length,attempted:session.started};
}
function makePerformanceRecord(session,reason='manual'){
 const info=summarizePerformance(session);
 return {version:1,id:Date.now()+'-'+Math.random().toString(36).slice(2,7),profile:performanceProfile(),song:current?.title||'',track:current?.tracks[state.track]?.name||'',mode:session.mode,adaptMode:state.adaptMode,range:targetKeyboard()?{...targetKeyboard()}:null,date:new Date().toISOString(),reason,speed:state.speed,position:Math.round(pos*100)/100,...info,
  notes:session.all.filter(n=>session.all.length<=900||n.miss||n.hit&&(n.timingMs!=null&&Math.abs(n.timingMs)>110||n.holdRatio!=null&&(n.holdRatio<.7||n.holdRatio>1.4)||n.chordSpreadMs>140)).slice(0,1700).map(n=>({pitch:n.pitch,start:n.start,duration:n.duration,hit:n.hit,miss:n.miss,timingMs:n.timingMs,holdRatio:n.holdRatio,chordSpreadMs:n.chordSpreadMs})),
  extras:session.extras.slice(0,400)};
}
function savePerfStorage(){
 try{localStorage.setItem(PERF_STORE,JSON.stringify(perfAttempts));return true}catch(e){
  // Degrade gracefully on restrictive or full storage; keep summaries first.
  try{localStorage.setItem(PERF_STORE,JSON.stringify(perfAttempts.map((p,i)=>i<8?p:{...p,notes:[],extras:[]})));return true}catch{return false}
 }
}
function finishPerformance(reason='manual'){
 if(!practice||state.mode==='listen'||!practice.started||practice.stored||reason==='manual'&&practice.lastStoredRevision===practice.revision)return false;
 if(reason==='complete'||reason==='loop')practice.finalize(reason==='loop'?pos:duration());
 const result=makePerformanceRecord(practice,reason);perfAttempts.unshift(result);perfAttempts=perfAttempts.slice(0,30);practice.lastStoredRevision=practice.revision;if(reason!=='manual')practice.stored=true;
 const stored=savePerfStorage();rebuildPerfLast();renderReview();if(!stored)notify('Не удалось сохранить историю: хранилище браузера недоступно');
 return true;
}
function reviewForNote(n){
 if(!state.showReviewMarkers||n.track!==state.track)return null;
 let live=practice?.noteLookup.get(n);
 if(live&&practice.started)return live;
 return perfLastIndex.get(reviewNoteKey(n))||null;
}
function metricCard(label,val){return `<div class="reviewMetric"><strong>${val}</strong><span>${label}</span></div>`}
let reviewRefreshPending=false;function scheduleReviewRender(){if(state.rightTab!=='review'||!state.right)return;if(reviewRefreshPending)return;reviewRefreshPending=true;setTimeout(()=>{reviewRefreshPending=false;renderReview()},110)}
function renderReview(){
 const box=$('reviewHeadline');if(!box||!current)return;
 const live=practice&&practice.started&&state.mode!=='listen';const sum=live?summarizePerformance(practice):perfLast;
 if(!sum){box.innerHTML='<strong>Пока нет попыток</strong><p>Открой Wait или Tempo и сыграй выбранную партию. Результаты сохраняются после завершения или по кнопке.</p>'; $('reviewMetrics').innerHTML='';$('reviewTiming').textContent='Нет данных';$('reviewSections').innerHTML='<p class="small">Нет ошибок для разбора.</p>';}
 else{
  box.innerHTML=`<strong>${live?'Текущая попытка':('Сохранено · '+new Date(sum.date).toLocaleString('ru-RU'))}</strong><p>Оценка: <b>${sum.score}%</b> · ${sum.total} нот · ${sum.mode==='wait'?'Wait':'Tempo'} · ${live?'в процессе':sum.reason==='manual'?'промежуточно':sum.reason==='complete'?'полностью':'повтор'}</p>`;
  const stats=sum.stats;
  $('reviewMetrics').innerHTML=metricCard('Ноты / точность',sum.accuracy+'%')+metricCard('Рано / поздно',(stats.early||0)+' / '+(stats.late||0))+metricCard('Пропуски / лишние',stats.missed+' / '+stats.wrong)+metricCard('Коротко / долго',stats.short+' / '+(stats.long||0))+metricCard('Время · в окне',sum.timePct==null?'—':sum.timePct+'%')+metricCard('Аккорды · вместе',sum.chordPct==null?'—':sum.chordPct+'%');
  $('reviewTiming').textContent=sum.mode==='wait'?'Wait Mode: задержка входа и длительности намеренно не оцениваются. У аккордов проверяется разброс реальных нажатий.':`Средняя абсолютная ошибка времени: ${sum.avgAbsTime??'—'} мс. Допуск точного входа ±70 мс; нормального ±110 мс. Удержание: 70–140% номинальной длительности. Аккорд: разброс ≤140 мс.`;
  const sec=$('reviewSections');sec.replaceChildren();if(!sum.sections.length){sec.innerHTML='<p class="small">Пока нет выраженных ошибок в сыгранной части.</p>';}else for(const r of sum.sections){
   const card=document.createElement('div');card.className='reviewItem';const h=document.createElement('strong'),desc=document.createElement('p'),btn=document.createElement('button');btn.className='btn tiny ghost';h.textContent=`${fmt(r.start)}–${fmt(r.end)} · ${r.errors} сигналов ошибок`;desc.textContent=r.pitches.length?'Ноты: '+[...new Set(r.pitches)].slice(0,6).join(', '):'Ритм, длительности и аккорды';btn.textContent='↻ Повторить этот фрагмент';btn.onclick=()=>{const from=r.start,to=Math.min(duration(),r.end);if(isPlaying)pause();loop={start:from,end:to,enabled:to>from};seek(from);state.mode=sum.mode==='wait'?'wait':'tempo';setMode(state.mode);pos=from;resetPractice();updateUI();state.page='practice';applyPage();state.right=false;applyPanels();notify('Loop '+fmt(from)+'–'+fmt(to)+' · нажми Play');};card.append(h,desc,btn);sec.append(card);
  }
 }
 const list=$('reviewHistory');list.replaceChildren();const filtered=perfAttempts.filter(r=>r.profile===performanceProfile());if(!filtered.length)list.innerHTML='<p class="small">Для этого произведения и варианта партии история ещё не сохранена.</p>';
 for(const r of filtered.slice(0,10)){
  const card=document.createElement('div');card.className='reviewItem';const title=document.createElement('strong'),desc=document.createElement('p'),load=document.createElement('button');title.textContent=`${r.score}% · ${new Date(r.date).toLocaleString('ru-RU')}`;desc.textContent=`${r.mode} · ${r.stats.hits}/${r.total} сыграно · ${r.speed}% · ${r.reason==='complete'?'полная':r.reason==='loop'?'Loop':'частичная'} попытка`;load.textContent='Показать запись';load.className='btn tiny ghost';load.onclick=()=>{perfLast=r;perfLastIndex=new Map((r.notes||[]).map(n=>[reviewNoteKey(n),n]));if(practice)practice.started=false;renderReview();renderCanvas()};card.append(title,desc,load);list.append(card);
 }
}
function openReview(){state.right=true;applyPanels();switchRightTab('review');renderReview()}
function exportPerformance(){
 const records=perfAttempts.filter(r=>r.profile===performanceProfile());const blob=new Blob([JSON.stringify({application:'Play Along',version:'0.6',exported:new Date().toISOString(),records},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='play-along-performance-'+(currentSongKey||'session')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function resetPractice(){waitReleaseGroup=null;waitReleasePitches.clear();let notes=selectedArrangement();if(smart.active&&smart.segment){notes=notes.filter(n=>n.start>=smart.segment.start-.0001&&n.start<smart.segment.start+4-.0001)}practice=state.mode==='listen'?null:new PracticeSession(notes,state.mode,pos);holdForInput=false;showPractice();renderReview()}
function showPractice(){const result=$('practiceResult'),upcoming=$('upcomingNotes');if(!current||state.mode==='listen'){result.innerHTML='<strong>Прослушивание произведения</strong><p>В режиме Wait или Tempo оценим реальные MIDI-нажатия.</p>';upcoming.textContent='Выбери партию, которую хочешь разучивать.';return}
 const s=practice?.stats||{hits:0,wrong:0,missed:0,early:0,late:0,short:0,okHold:0},total=practice?.all.length||0;const accuracy=(s.hits+s.wrong+s.missed)?Math.round(s.hits/(s.hits+s.wrong+s.missed)*100):0;result.innerHTML='<strong><em>'+s.hits+'</em> / '+total+' нот · '+accuracy+'% точность</strong><p>Ошибки: <span class="modeMiss">'+s.wrong+'</span> · Пропуски: '+s.missed+(state.mode==='tempo'?'<br>Рано: '+s.early+' · Поздно: '+s.late+' · Длительность: '+s.okHold+' OK / '+s.short+' нет':'')+'</p>';
 let g=state.mode==='wait'?practice?.nextGroup():practice?.groups.find(g=>g.notes.some(n=>!n.hit&&!n.miss));upcoming.textContent=g?'Далее: '+[...new Set(g.notes.filter(n=>!n.hit&&!n.miss).map(n=>nameOf(n.pitch)))].join(' + ')+(state.mode==='wait'?' · жду все клавиши аккорда':''):'Все ноты обработаны. Можно повторить.';
 scheduleReviewRender();
}
function updateModeStatus(){const mode={listen:'Слушать',wait:'Wait',tempo:'Tempo'}[state.mode];$('playModeChip').textContent='MIDI · '+mode;$('rollStatus').textContent=isPlaying?(state.mode==='wait'&&holdForInput?'⏳ Ожидание MIDI':'▶ '+mode+' · синхронизация по AudioContext'):'⏸ '+mode+' · готово к запуску';$('modeHelp').textContent=state.mode==='listen'?'Слушай выбранную партию или все дорожки.':state.mode==='wait'?'Ноты и аккорды ожидают правильных MIDI-клавиш. Выбранная партия не дублируется синтезатором.':'Играй одновременно с таймлайном. Оцениваются нота, момент нажатия и длительность удержания.';showPractice();}
function setMode(mode){if(!['listen','wait','tempo'].includes(mode))return;pause();state.mode=mode;if(mode==='wait'&&!state.accompanyExplicit){state.accompany=false;$('accompany').checked=false;}pos=0;renderCapability();resetPractice();document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('bottomMode').value=mode;updateUI();rebuildPerfLast();renderReview();persist()}
