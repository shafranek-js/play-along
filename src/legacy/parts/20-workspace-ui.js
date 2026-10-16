function applyPage(){
 document.body.classList.toggle('onlyLibrary',state.page==='library');
 document.body.classList.toggle('onlyProgress',state.page==='progress');
 document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));
 applyPanels();
 if(state.page==='progress')switchRightTab('analysis',false);
 if(state.page==='practice'){renderCanvas();if(state.scoreView==='sheet')scoreEnsureRendered().catch(scoreError);if(state.scoreView==='editor')fingerEditorRender();}
}
function applyLayout(layout,save=true){
 state.layout=layout;
 if(save&&layout==='learn'){state.left=true;state.right=true;state.leftPinned=true;state.rightPinned=true;state.rightTab='practice';if(window.innerWidth<=820){state.left=false;state.right=false;}}
 if(save&&layout==='play'){state.left=false;state.right=false;}
 if(save&&layout==='analyze'){state.left=false;state.right=true;state.rightPinned=true;state.rightTab='analysis';}
 document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===layout));
 const compactLayout=$('layoutMenuButton');if(compactLayout)compactLayout.textContent='Компоновка: '+({'learn':'Изучение','play':'Игра','analyze':'Анализ'}[layout]||'Игра')+' ▾';
 switchRightTab(state.rightTab,false);applyPanels();if(save)persist();
}
// A pin is a user preference, not a guarantee: a narrow viewport must keep
// enough room for 52 natural piano keys. Preserve preferences across resize.
function applyPanels(){
 const leftWidth=clamp(state.leftWidth,210,520),rightWidth=clamp(state.rightWidth,240,550);
 const shell=$('shell'),practice=state.page==='practice';
 const minCenter=Math.max(700,Math.min(820,Math.round(window.innerWidth*.53)));
 const leftDock=practice&&state.left&&state.leftPinned&&window.innerWidth-leftWidth-5>=minCenter;
 const rightDock=practice&&state.right&&state.rightPinned&&
  window.innerWidth-(leftDock?leftWidth+5:0)-rightWidth-5>=minCenter;
 const leftOverlay=practice&&state.left&&!leftDock,rightOverlay=practice&&state.right&&!rightDock;
 document.documentElement.style.setProperty('--left',leftWidth+'px');
 document.documentElement.style.setProperty('--right',rightWidth+'px');
 document.documentElement.style.setProperty('--dock-left',(leftDock?leftWidth+5:0)+'px');
 document.documentElement.style.setProperty('--dock-right',(rightDock?rightWidth+5:0)+'px');
 shell.classList.toggle('hybridMode',practice);
 shell.classList.toggle('dockLeft',leftDock);
 shell.classList.toggle('dockRight',rightDock);
 $('leftPanel').classList.toggle('is-docked',leftDock);
 $('rightPanel').classList.toggle('is-docked',rightDock);
 $('panelScrim').classList.toggle('hidden',!(leftOverlay||rightOverlay));
 document.body.classList.toggle('noLeft',!state.left);
 document.body.classList.toggle('noRight',!state.right);
 for(const side of ['left','right']){
  const open=!!state[side],pin=!!state[side+'Pinned'],name=side==='left'?'библиотеку':'инструменты';
  $(side+'Toggle').classList.toggle('on',open);
  $(side+'Toggle').setAttribute('aria-expanded',String(open));
  const control=$(side+'Pin'),title=pin?'Открепить '+name:'Закрепить '+name;
  control.textContent=pin?'📌':'◇';
  control.title=title;control.setAttribute('aria-label',title);
  control.setAttribute('aria-pressed',String(pin));
 }
 const host=$('layoutState');
 if(host){
  const heading=document.createElement('strong'),details=document.createElement('p');
  heading.textContent=({'learn':'Изучение','play':'Игра','analyze':'Анализ'}[state.layout]||'Изучение');
  details.textContent='Библиотека: '+(!state.left?'скрыта':leftDock?'закреплена':'выдвижная')+
   ' ('+leftWidth+' px) · Инструменты: '+(!state.right?'скрыты':rightDock?'закреплены':'выдвижные')+
   ' ('+rightWidth+' px)';
  host.replaceChildren(heading,details);
 }
 resizeCanvas();
}
function toggleSide(side){
 state[side]=!state[side];
 // Only one floating drawer at a time: a click must not trap the workspace.
 if(state[side] && state.page==='practice'){
  const other=side==='left'?'right':'left';
  if(state[other]&&!$(''+other+'Panel').classList.contains('is-docked'))state[other]=false;
 }
 applyPanels();persist();
}
function togglePin(side){state[side+'Pinned']=!state[side+'Pinned'];applyPanels();persist();}
function closeFloatingPanels(){
 const shell=$('shell');
 let changed=false;
 for(const side of ['left','right']){
  const dock=side==='left'?'dockLeft':'dockRight';
  if(state[side]&&!shell.classList.contains(dock)){state[side]=false;changed=true;}
 }
 if(changed){applyPanels();persist();}
 return changed;
}
function switchRightTab(tab,save=true){state.rightTab=tab;document.querySelectorAll('[data-righttab]').forEach(b=>b.classList.toggle('active',b.dataset.righttab===tab));['Practice','Adapt','Midi','Review','Smart','Analysis'].forEach(t=>$('tab'+t).classList.toggle('hidden',t.toLowerCase()!==tab));if(tab==='review')renderReview();if(tab==='smart')smartRender();$('rightPanel').scrollTop=0;if(save)persist();}
function renderLibrary(){const query=$('librarySearch').value.trim().toLowerCase();const songs=[...demoSongs,...imports,...folderIndex.map(e=>e.song).filter(Boolean)].filter(s=>(s.title+' '+s.author).toLowerCase().includes(query));$('libraryCount').textContent=songs.length+' / '+(demoSongs.length+imports.length+folderIndex.filter(e=>e.song).length);$('songList').textContent='';if(!songs.length){$('songList').innerHTML='<div class="empty">Ничего не найдено</div>';return}for(let s of songs){let b=document.createElement('button');b.className='songRow'+(state.selected===s.id?' active':'');b.innerHTML='<strong></strong><span></span>';b.firstElementChild.textContent=s.title;b.lastElementChild.textContent=s.author+' · '+(s.type==='demo'?'демо':'MIDI-файл');b.onclick=()=>{if(s.folderPath){loadFolderSong(s.folderPath);return}loadSong(s);state.page='practice';applyPage();};$('songList').append(b)}}
function loadSong(song,{startupRestore=false}={}){if(startupSongRestorePending&&!startupRestore)startupSongRestoreUserChosen=true;if(smart.active)smartStop(false);if(current&&!startupSongRestorePending)captureSongSettings(current);stop();current=song;pianoMotionStop('Предыдущие предложения сброшены при смене произведения.');fingerResearchReset();scoreOnSongChanged();currentSongKey=songFingerprint(song);state.selected=song.id;applySongSettings(song.id);selectedNote=null;fingerSelectedIds.clear();fingerSelectionAnchor=null;fingerSelectionPointer=null;syncSongSettingsUI();$('songName').textContent=song.title;$('statusSongTitle').textContent='♫ '+song.title;$('songInfoButton').title=song.title+' · подробности';$('songMeta').textContent=song.author+' · '+song.tracks.length+' '+(song.tracks.length===1?'дорожка':'дорожек');$('songType').textContent=song.type==='demo'?'ДЕМО ДЛЯ ПРОВЕРКИ ИНТЕРФЕЙСА':'ЗАГРУЖЕННАЯ ПАРТИТУРА · '+(song.format||'MIDI');$('playModeChip').textContent='MIDI · '+({listen:'Слушать',wait:'Wait',tempo:'Tempo'}[state.mode]||'Слушать');$('trackSelect').innerHTML='';song.tracks.forEach((t,i)=>{let o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+t.name+' ('+t.notes.length+' нот)';$('trackSelect').append(o)});const previousTrack=Number(state.track);state.track=Number.isInteger(previousTrack)&&previousTrack>=0&&previousTrack<song.tracks.length?previousTrack:Math.max(0,song.tracks.findIndex(t=>t.notes.some(isPlayableNote)));$('trackSelect').value=String(state.track);renderCapability();rebuildPerfLast();resetPractice();renderLibrary();updateUI();persist();resizeCanvas();renderReview();scoreSetView(!sceneFingerDeveloper&&state.scoreView==='editor'?'roll':state.scoreView);fingeringWorkspaceSync();}
function notesToShow(){if(!current)return[];const chosen=selectedPlaybackNotes();return state.allTracks?current.tracks.flatMap((t,i)=>i===state.track?chosen:t.notes):chosen}
// A0 (MIDI 21) through C8 (MIDI 108) are always drawn at every viewport.
// A connected/calibrated or explicitly previewed smaller instrument only
// changes which on-screen keys can be clicked; it never crops the piano roll.
function noteRange(){return {min:21,max:108,calibrated:false,virtual:false}}
function keyboardPlayableRange(){
 const range=targetKeyboard();
 return range&&Number.isInteger(range.low)&&Number.isInteger(range.high)&&
  range.low>=0&&range.high<=127&&range.low<=range.high?
  {low:Math.max(21,range.low),high:Math.min(108,range.high),
   virtual:!!range.virtual}:null;
}
function updateRange(){
 const playable=keyboardPlayableRange(),total=playable?
  Math.max(0,playable.high-playable.low+1):88;
 $('keyboardRangeText').textContent='88 клавиш · A0–C8';
 $('deviceRangeText').textContent=' · активны '+total;
 $('statusKeyboard').title=playable?
  'Активный диапазон '+nameOf(playable.low)+'–'+nameOf(playable.high)+
   (playable.virtual?' · предпросмотр':' · MIDI-контроллер'):
  'A0–C8: полный диапазон, ограничение контроллера не задано';
 $('pitchChip').textContent='88 клавиш · A0–C8'+(playable&&total<88?' · активны '+total:'');
 $('statRange').textContent=getProfile()?getProfile().high-getProfile().low+1:'—';
}
function updateUI(){let d=duration();pos=clamp(pos,0,d);$('timeNow').textContent=fmt(pos);$('timeTotal').textContent=fmt(d);$('seek').value=Math.round(pos/d*1000);$('statNotes').textContent=noteCount;$('statPosition').textContent=fmt(pos);$('statTrack').textContent=current?.tracks[state.track]?.notes.length||0;const playButton=$('playBtn'),pendingPlay=typeof audioGetStatus==='function'&&audioGetStatus()?.transport?.pendingPlay===true;playButton.textContent=pendingPlay?'…':isPlaying?'Ⅱ':'▶';playButton.setAttribute('aria-busy',pendingPlay?'true':'false');const playLabel=pendingPlay?'Отменить подготовку звука · Пробел':isPlaying?'Пауза · Пробел':'Воспроизвести · Пробел';playButton.setAttribute('aria-label',playLabel);playButton.title=playLabel;updateLeadInCountdown();updateModeStatus();$('statusMode').textContent='MIDI · '+({listen:'Слушать',wait:'Wait',tempo:'Tempo'}[state.mode]||'Слушать');$('speedLabel').textContent=state.speed+'%';$('speed').value=state.speed;$('loopBtn').classList.toggle('on',loop.enabled);$('loopLabel').textContent=loop.start!==null&&loop.end!==null?'Фрагмент: '+fmt(loop.start)+' — '+fmt(loop.end)+(loop.enabled?' · Loop включён':' · Loop выключен'):'Повтор не выбран';updateRange();}

// SF-04 SoundFont controls live in the existing MIDI sidebar. The audio engine
// owns synthesis and bank replacement; this layer only reflects status and
// sends user choices through its bridge.
const AUDIO_DEFAULT_BANK='generaluser-gs-2.0.3-sf2';
const AUDIO_STATIC_BANKS=[
 {id:AUDIO_DEFAULT_BANK,name:'GeneralUser GS',version:'2.0.3',format:'SF2'},
 {id:'musescore-general-0.2-sf3',name:'MuseScore General',version:'0.2',format:'SF3'}
];
const AUDIO_GM_FAMILIES=['Фортепиано','Хроматические ударные','Органы','Гитары','Бас-гитары','Струнные','Ансамбли','Медные духовые','Тростевые духовые','Свирели','Синтезаторные лиды','Синтезаторные пэды','Синтезаторные эффекты','Этнические инструменты','Ударные','Звуковые эффекты'];
let audioUiUnsubscribe=null,audioUiRetryBankId=null,audioUiSwapSequence=0,audioUiFileProgramToggleSequence=0,audioUiPresetByKey=new Map(),audioUiStatus=null,audioUiNoticeDetail='',audioUiEngineNoticeId=0,audioUiDismissedEngineNoticeId=0,audioUiAcknowledgedEngineNoticeId=0,audioUiBankSwitching=false,audioUiPatchBusy=false,audioUiPreparing=false;
function audioUiClearNotice(){audioUiNoticeDetail='';audioUiDismissedEngineNoticeId=Math.max(audioUiDismissedEngineNoticeId,audioUiEngineNoticeId)}
function audioUiPresetKey(patch){return [patch.bankMSB,patch.bankLSB,patch.program,patch.isDrum?1:0].join(':')}
function audioUiPatchLabel(patch){
 const number=Number.isInteger(patch.program)?String(patch.program+1).padStart(3,'0'):'';
 const family=patch.isDrum||patch.isGMGSDrum?'Ударные':AUDIO_GM_FAMILIES[Math.floor((patch.program||0)/8)];
 return (number?number+' · ':'')+(patch.name||'Инструмент')+(family?' · '+family:'');
}
function audioUiCurrentBank(status=audioUiStatus){
 return status?.pendingBank?.id||status?.selectedBankId||status?.activeBank?.id||status?.bank?.id||state.audioSettings.bankId||AUDIO_DEFAULT_BANK;
}
function audioUiBankFailureDetail(status,requestedBankId,previousBankId){
 const active=status?.activeBank;
 if(active?.id===requestedBankId&&status.lifecycle!=='ready')return 'Банк загружен, инструмент ещё не готов. Повтори подготовку.';
 if(previousBankId&&active?.id===previousBankId)return 'Предыдущий банк остаётся активным. Нажми «Повторить загрузку» или выбери другой банк.';
 if(active?.id)return `Сейчас загружен банк «${active.name||active.id}». Повтори подготовку инструмента.`;
 return 'Проверь соединение и нажми «Повторить загрузку».';
}
function audioUiSetStatus(title,detail,tone=''){
 const box=$('audioStatus');if(!box)return;
 $('audioStatusTitle').textContent=title;$('audioStatusDetail').textContent=detail;
 box.dataset.tone=tone;
}
function audioUiRenderOptions(select,rows,query='',emptyText='Нет доступных инструментов'){
 const prior=select.value,needle=query.trim().toLocaleLowerCase();select.replaceChildren();
 const matches=rows.filter(row=>{
  const programNumber=String(row.program+1),displayProgramNumber=programNumber.padStart(3,'0');
  return !needle||String(row.name||'').toLocaleLowerCase().includes(needle)
   ||programNumber.includes(needle)||displayProgramNumber.includes(needle)
   ||String(AUDIO_GM_FAMILIES[Math.floor((row.program||0)/8)]||'').toLocaleLowerCase().includes(needle);
 });
 if(!matches.length){const option=document.createElement('option');option.value='';option.textContent=emptyText;select.append(option);select.disabled=true;return}
 const values=new Set();
 for(const row of matches){
  const patch={bankMSB:row.bankMSB,bankLSB:row.bankLSB,program:row.program,isDrum:!!row.isDrum};
  const key=audioUiPresetKey(patch);if(values.has(key))continue;values.add(key);audioUiPresetByKey.set(key,patch);
  const option=document.createElement('option');option.value=key;option.textContent=audioUiPatchLabel(row);select.append(option);
 }
 select.disabled=false;
 select.value=values.has(prior)?prior:'';
}
function audioUiRenderPresets(status){
 const bankId=status?.activeBank?.id||status?.bank?.id||null;
 const available=status?.backend!=='simple'&&!!bankId&&['ready','bank-indexed'].includes(status?.lifecycle);
 const gm=$('audioLivePresetSelect'),extra=$('audioExtraPresetSelect');
 if(!available){
  gm.replaceChildren(new Option(status?.backend==='simple'?'Включён простой звук':'Сначала подготовь банк инструментов',''));
  extra.replaceChildren(new Option(status?.backend==='simple'?'Включён простой звук':'Сначала подготовь банк инструментов',''));
  gm.disabled=true;extra.disabled=true;return;
 }
 let gmRows=[],extraRows=[],drumRows=[];
 try{
  gmRows=audioListPresets({group:'gm',bankId})||[];
  extraRows=audioListPresets({group:'extra',bankId})||[];
  drumRows=audioListPresets({group:'drums',bankId})||[];
 }catch{}
 audioUiPresetByKey.clear();
 audioUiRenderOptions(gm,gmRows,$('audioLivePresetSearch').value,'В этом банке нет списка GM-инструментов');
 const mixed=[...extraRows,...drumRows];
 audioUiRenderOptions(extra,mixed,'','В этом банке нет дополнительных тембров');
 const selected=status.livePreset||state.audioSettings.livePreset;
 if(selected){const key=audioUiPresetKey(selected);gm.value=[...gm.options].some(option=>option.value===key)?key:'';extra.value=[...extra.options].some(option=>option.value===key)?key:'';}
 const operation=String(status.request?.operation||'').toLowerCase();
 const busy=audioUiPreparing||audioUiPatchBusy||audioUiBankSwitching||!!status.pendingBank||/(switch|ensure|prepare|preset|patch)/.test(operation);
 gm.disabled=gm.disabled||busy;extra.disabled=extra.disabled||busy;
}
function audioUiRenderStatus(status){
 if(!status)return;
 audioUiStatus=status;
 const engineNotice=status.notice&&Number.isSafeInteger(status.notice.id)&&typeof status.notice.message==='string'?status.notice:null;
 if(engineNotice&&engineNotice.id>audioUiEngineNoticeId){
  audioUiEngineNoticeId=engineNotice.id;
  if(engineNotice.id>audioUiDismissedEngineNoticeId)audioUiNoticeDetail=engineNotice.message;
 }
 const authoritativeCatalog=Array.isArray(status.catalog)&&status.catalog.length>0;
 const catalog=authoritativeCatalog?status.catalog:AUDIO_STATIC_BANKS;
 const select=$('audioBankSelect'),known=new Set(catalog.map(bank=>bank.id));
 if(Array.isArray(status.catalog)&&status.catalog.length){
  const selected=select.value;
  select.replaceChildren(...catalog.map(bank=>{const option=document.createElement('option');option.value=bank.id;option.textContent=`${bank.name}${bank.version?' · '+bank.version:''}${bank.format?' · '+bank.format:''}`;return option}));
  select.value=known.has(selected)?selected:'';
 }
 if(authoritativeCatalog&&state.audioSettings.bankId&&!known.has(state.audioSettings.bankId)){
  // Reconcile a stale saved ID only after the current manifest is authoritative.
  state.audioSettings.bankId=null;persist();audioUiRetryBankId=null;
  const defaultId=status.defaultBankId||catalog[0]?.id||AUDIO_DEFAULT_BANK;
  audioUiNoticeDetail=`Сохранённый банк больше недоступен. При следующей подготовке будет выбран ${catalog.find(bank=>bank.id===defaultId)?.name||'банк по умолчанию'}.`;
 }
 const pending=status.pendingBank?.id||null,activeId=status.activeBank?.id||status.bank?.id||null;
 if(pending&&known.has(pending))select.value=pending;
 else if(status.error&&activeId&&known.has(activeId))select.value=activeId;
 else{
  const selectedId=[status.selectedBankId,state.audioSettings.bankId,activeId,status.defaultBankId,catalog[0]?.id].find(id=>id&&known.has(id));
  if(selectedId)select.value=selectedId;
 }
 if(status.backend==='simple'){
  audioUiSetStatus('Простой звук включён','Нажми «Вернуться к SoundFont», чтобы загрузить банк инструментов.','ready');
 }else if(pending){
  const next=catalog.find(bank=>bank.id===pending);
  audioUiSetStatus('Загружается банк инструментов',next?.name||'Подожди завершения загрузки.');
 }else if(status.error){
  audioUiSetStatus('Не удалось подготовить банк',status.activeBank?'Текущий загруженный банк сохранён. Повтори попытку или выбери другой банк.':'Проверь соединение и повтори попытку.','error');
 }else if(status.lifecycle==='ready'&&status.activeBank){
  const bank=status.activeBank;
  audioUiSetStatus('Звук готов',`${bank.name||'Банк инструментов'} · ${bank.format||'SoundFont'}`,'ready');
 }else if(status.lifecycle==='bank-indexed'&&status.activeBank){
  audioUiSetStatus('Список тембров загружен','Звук подготовится при первом воспроизведении или выборе тембра.');
 }else if(status.lifecycle==='engine-ready'){
  audioUiSetStatus('Аудио готово','Банк загрузится при первом запуске воспроизведения или выборе тембра.');
 }else if(status.lifecycle==='error'){
  audioUiSetStatus('Не удалось подготовить звук','Проверь соединение и повтори попытку.');
 }else{
  audioUiSetStatus('Звук ещё не запущен','Банк загрузится после запуска воспроизведения или выбора тембра.');
 }
 const operation=String(status.request?.operation||'').toLowerCase();
 const busy=!!pending||audioUiPreparing||audioUiBankSwitching||audioUiPatchBusy||/(switch|ensure|prepare|preset|patch)/.test(operation);
 select.disabled=busy;
 $('audioRetry').hidden=status.backend==='simple'?false:status.lifecycle==='ready'&&!status.error;
 $('audioRetry').disabled=busy;
 $('audioRetry').textContent=status.backend==='simple'?'Вернуться к SoundFont':status.error?'Повторить загрузку':'Подготовить банк';
 $('audioUseSimpleSound').hidden=status.backend==='simple';$('audioUseSimpleSound').disabled=busy;
 $('audioUseSimpleSound').textContent='Включить простой звук';
 $('audioUseFilePrograms').checked=state.audioSettings.useFilePrograms;
 $('audioPanic').disabled=false;
 const noticeReady=!pending&&!status.request&&!status.error&&!audioUiPreparing&&!audioUiBankSwitching&&!audioUiPatchBusy;
 if(audioUiNoticeDetail&&noticeReady){
  audioUiSetStatus($('audioStatusTitle').textContent,audioUiNoticeDetail,$('audioStatus').dataset.tone||'');
  if(engineNotice&&engineNotice.id>audioUiAcknowledgedEngineNoticeId&&audioUiNoticeDetail===engineNotice.message){
   audioUiAcknowledgedEngineNoticeId=engineNotice.id;
   if(typeof audioAcknowledgeNotice==='function')audioAcknowledgeNotice(engineNotice.id);
  }
 }
 audioUiRenderPresets(status);
}
function audioUiRefresh(){
 try{if(typeof audioGetStatus==='function')audioUiRenderStatus(audioGetStatus());}
 catch{audioUiSetStatus('Не удалось прочитать состояние звука','Повтори попытку подготовки банка.','error')}
}
async function audioUiPrepare(){
 const button=$('audioRetry');if(button)button.disabled=true;
 audioUiClearNotice();
 audioUiPreparing=true;
 let failed=false;
 audioUiSetStatus('Подготавливается звук','Подожди, пока выбранный банк станет готов.');
 try{
  if(state.audioSettings.backend==='simple'){
   await audioSetSimpleFallback(false);state.audioSettings.backend='soundfont';persist();
  }
  const status=audioGetStatus(),active=status.activeBank?.id||status.bank?.id;
  const target=audioUiRetryBankId||state.audioSettings.bankId;
  if(target&&target!==active)await audioSwitchBank(target);
  else await audioEnsureReady();
  audioUiRetryBankId=null;audioUiRefresh();
 }catch{
  failed=true;
  const active=audioGetStatus()?.activeBank;
  audioUiSetStatus('Не удалось подготовить банк',active?'Текущий загруженный банк сохранён. Проверь соединение и повтори попытку.':'Проверь соединение и повтори попытку.','error');
 }finally{audioUiPreparing=false;if(button)button.disabled=false;audioUiRefresh();if(failed){const active=audioGetStatus()?.activeBank;audioUiSetStatus('Не удалось подготовить банк',active?'Текущий загруженный банк сохранён. Проверь соединение и повтори попытку.':'Проверь соединение и повтори попытку.','error')}}
}
async function audioUiSwitchBank(bankId){
 if(!bankId||bankId===audioUiCurrentBank())return;
 const priorStatus=audioGetStatus(),priorPreset=priorStatus?.livePreset||state.audioSettings.livePreset;
 const previousBankId=priorStatus?.activeBank?.id||null;
 const priorPresetKey=priorPreset?audioUiPresetKey(priorPreset):null;
 const sequence=++audioUiSwapSequence;audioUiRetryBankId=bankId;
 const wasPlaying=isPlaying;if(wasPlaying)pause();
 try{await audioPanic();}catch{}
 audioUiClearNotice();audioUiBankSwitching=true;
 $('audioBankSelect').disabled=true;
 audioUiSetStatus('Загружается банк инструментов','Воспроизведение приостановлено; позиция сохранена.');
 let failed=false;
 try{
  await audioSwitchBank(bankId);
  if(sequence!==audioUiSwapSequence)return;
  const status=audioGetStatus();
  if(status.activeBank?.id!==bankId)throw Error('BANK_NOT_ACTIVE');
  state.audioSettings.backend='soundfont';state.audioSettings.bankId=bankId;
  const activePreset=status.livePreset;
  if(activePreset&&Number.isInteger(activePreset.program)){
   state.audioSettings.livePreset={bankMSB:activePreset.bankMSB,bankLSB:activePreset.bankLSB,program:activePreset.program,isDrum:!!activePreset.isDrum};
   if(priorPresetKey&&audioUiPresetKey(activePreset)!==priorPresetKey){
    const previousName=priorPreset?.name||'Выбранный инструмент',activeName=activePreset.name||'Acoustic Grand Piano';
    audioUiNoticeDetail=`${previousName} недоступен в этом банке. Выбран ${activeName}.`;
   }
  }
  audioUiRetryBankId=null;persist();audioUiRenderStatus(status);
 }catch{
  if(sequence===audioUiSwapSequence){
   failed=true;
   const status=audioGetStatus();
   audioUiRetryBankId=bankId;
   audioUiRenderStatus(status);
   $('audioBankSelect').value=status.activeBank?.id||status.selectedBankId||AUDIO_DEFAULT_BANK;
   audioUiSetStatus('Не удалось подготовить выбранный банк',audioUiBankFailureDetail(status,bankId,previousBankId),'error');
  }
 }finally{
  if(sequence===audioUiSwapSequence){audioUiBankSwitching=false;$('audioBankSelect').disabled=false;audioUiRefresh();if(failed){const status=audioGetStatus();$('audioBankSelect').value=status.activeBank?.id||status.selectedBankId||AUDIO_DEFAULT_BANK;audioUiSetStatus('Не удалось подготовить выбранный банк',audioUiBankFailureDetail(status,bankId,previousBankId),'error')}}
 }
}
function audioSettingsUISetup(){
 const status=typeof audioGetStatus==='function'?audioGetStatus():null;
 const candidate=state.audioSettings.bankId||status?.defaultBankId||AUDIO_DEFAULT_BANK;
 $('audioBankSelect').value=candidate;
 $('audioUseFilePrograms').checked=state.audioSettings.useFilePrograms;
 $('audioBankSelect').onchange=event=>audioUiSwitchBank(event.target.value);
 $('audioRetry').onclick=()=>audioUiPrepare();
 $('audioUseSimpleSound').onclick=async()=>{
  const button=$('audioUseSimpleSound');button.disabled=true;
  let failed=false;audioUiPreparing=true;
  try{
   audioUiClearNotice();
   const simple=state.audioSettings.backend!=='simple';
   if(isPlaying)pause();await audioPanic();
   await audioSetSimpleFallback(simple);
   state.audioSettings.backend=simple?'simple':'soundfont';persist();audioUiRefresh();
   if(!simple)await audioUiPrepare();
  }catch{failed=true}
  finally{audioUiPreparing=false;button.disabled=false;audioUiRefresh();if(failed)audioUiSetStatus('Не удалось изменить способ воспроизведения','Текущий способ воспроизведения сохранён. Повтори попытку.','error')}
 };
 $('audioPanic').onclick=async()=>{audioUiClearNotice();if(isPlaying)pause();try{await audioPanic()}catch{}audioUiRefresh()};
 $('audioUseFilePrograms').onchange=async event=>{
  const useFilePrograms=event.target.checked;
  state.audioSettings.useFilePrograms=useFilePrograms;persist();
  const sequence=++audioUiFileProgramToggleSequence;
  const checkbox=event.currentTarget;checkbox.disabled=true;
  let prepareFailed=false;
  try{
   audioUiClearNotice();const wasPlaying=isPlaying;
   if(wasPlaying){pause();try{await audioPanic({group:'file'})}catch{}}
   if(sequence!==audioUiFileProgramToggleSequence)return;
   if(!useFilePrograms&&audioUiStatus?.lifecycle==='ready'&&state.audioSettings.backend==='soundfont'){
    const patch={bankMSB:0,bankLSB:0,program:0,isDrum:false};
    try{await audioSelectFilePreset(patch)}catch{prepareFailed=true}
   }
   if(sequence!==audioUiFileProgramToggleSequence)return;
  }finally{
   if(sequence===audioUiFileProgramToggleSequence){checkbox.disabled=false;audioUiRefresh()}
  }
  if(prepareFailed)audioUiSetStatus('Не удалось подготовить тембр','Повтори запуск воспроизведения; приложение снова подготовит инструменты.','error');
 };
 $('audioLivePresetSearch').oninput=()=>audioUiRenderPresets(audioUiStatus);
 const selectLive=async event=>{
  const patch=audioUiPresetByKey.get(event.target.value);if(!patch)return;
  audioUiClearNotice();audioUiPatchBusy=true;audioUiRenderStatus(audioUiStatus);let failed=false;
  try{
   await audioSelectLivePreset(patch);
   state.audioSettings.livePreset=patch;persist();audioUiRefresh();
  }catch{failed=true}
  finally{audioUiPatchBusy=false;audioUiRefresh();if(failed)audioUiSetStatus('Инструмент не выбран','Выбранный тембр недоступен в этом банке. Выбери другой тембр или повтори попытку.','error')}
 };
 $('audioLivePresetSelect').onchange=selectLive;$('audioExtraPresetSelect').onchange=selectLive;
 if(typeof audioSubscribe==='function')audioUiUnsubscribe=audioSubscribe(audioUiRenderStatus);
 audioUiRefresh();
 try{audioSetMasterVolume(state.volume/100)}catch{}
}
