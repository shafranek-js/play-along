// Promote MusicXML/MXL index entries to searchable rows, after base folder scanning.
const baseScanFolder=scanFolder;
scanFolder=async function(handle){await baseScanFolder(handle);folderIndex.forEach(x=>x.song={id:'folder:'+x.path,title:libraryTitleFile(x.name),author:'📁 '+x.path,type:'folder',folderPath:x.path,tracks:[]});renderFolderListing();if(folderRevealOnScan)browseConnectedFolder();else renderLibrary()};
const baseFallback=importFallbackFolder;
importFallbackFolder=async function(files){await baseFallback(files);folderIndex.forEach(x=>x.song={id:'folder:'+x.path,title:libraryTitleFile(x.name),author:'📁 '+x.path,type:'folder',folderPath:x.path,tracks:[]});renderFolderListing();browseConnectedFolder()};
// Scan initiated by a user action should reveal the newly scanned content.
// Automatic restoration on startup only updates the index and does not hijack the user's page.
const baseChooseFolder=chooseFolder;
chooseFolder=async function(){folderRevealOnScan=true;try{await baseChooseFolder()}finally{folderRevealOnScan=false}};
const baseRefreshFolder=refreshFolder;
refreshFolder=async function(){folderRevealOnScan=true;try{await baseRefreshFolder()}finally{folderRevealOnScan=false}};
// Inputs are bound once after the base event wiring has set its own listeners.
$('librarySourceSelect').onchange=libraryFolderFiltersChanged;$('librarySort').onchange=libraryFolderFiltersChanged;$('libraryFavoritesOnly').onchange=libraryFolderFiltersChanged;$('browseFolder').onclick=browseConnectedFolder;
$('importMusicInput').onchange=async e=>{await importMusicFiles(e.target.files);e.target.value=''};
backupSetup();
$('openMutopia').onclick=()=>window.open('https://www.mutopiaproject.org/advsearch.html','_blank','noopener,noreferrer');
$('filterOpenScore').onclick=()=>{$('librarySourceSelect').value='openscore';state.page='library';applyPage();$('leftPanel').scrollTop=0;renderLibrary()};
$('filterMutopia').onclick=()=>{$('librarySourceSelect').value='mutopia';state.page='library';applyPage();$('leftPanel').scrollTop=0;renderLibrary()};
$('filterMuseTrainer').onclick=()=>{$('librarySourceSelect').value='musetrainer';state.page='library';applyPage();$('leftPanel').scrollTop=0;renderLibrary();if(!museTrainerLoaded)museTrainerLoadIndex().catch(()=>{})};
$('filterAsap').onclick=()=>{$('librarySourceSelect').value='asap';state.page='library';applyPage();$('leftPanel').scrollTop=0;renderLibrary();if(!asapLoaded)asapLoadIndex().catch(()=>{})};
$('asapSync').onclick=()=>asapLoadIndex().catch(()=>{});
$('asapRefresh').onclick=()=>asapLoadIndex(true).catch(()=>{});
$('museTrainerSync').onclick=()=>museTrainerLoadIndex().catch(()=>{});
$('museTrainerRefresh').onclick=()=>museTrainerLoadIndex(true).catch(()=>{});
$('filterRepertoire').onclick=()=>{$('librarySourceSelect').value='repertoire';state.page='library';applyPage();$('leftPanel').scrollTop=0;renderLibrary()};
$('mutopiaSync').onclick=()=>{state.page='library';applyPage();$('leftPanel').scrollTop=0;mutopiaLoadIndex().catch(()=>{})};
$('mutopiaUpdate').onclick=()=>mutopiaLoadIndex(true).catch(()=>{});
$('mutopiaEnrich').onclick=()=>mutopiaEnrichBatch(20).catch(err=>mutopiaRenderStatus('Ошибка уточнения: '+err.message));
$('mutopiaClearCache').onclick=()=>mutopiaClearIndex();
$('mutopiaComposer').onchange=libraryFolderFiltersChanged;
$('mutopiaInstrument').onchange=libraryFolderFiltersChanged;
// Search is user-initiated: no GitHub request on application startup.
const mutopiaOldFilter=$('filterMutopia').onclick;
$('filterMutopia').onclick=()=>{mutopiaOldFilter();if(!mutopiaCatalogLoaded)mutopiaLoadIndex().catch(()=>{});};
$('librarySourceSelect').addEventListener('change',()=>{if($('librarySourceSelect').value==='mutopia'&&!mutopiaCatalogLoaded)mutopiaLoadIndex().catch(()=>{});if($('librarySourceSelect').value==='musetrainer'&&!museTrainerLoaded)museTrainerLoadIndex().catch(()=>{});if($('librarySourceSelect').value==='asap'&&!asapLoaded)asapLoadIndex().catch(()=>{});});
const startupSelectedSongId=state.selected;
startupSongRestorePending=true;
const startupLibraryPromise=loadLibraryIndex();
const startupPerformancePromise=loadPerformanceHistory().catch(e=>console.warn('Performance history restore failed',e));
window.__playAlongVersion='0.9.1';
window.__asapCatalog={asapCsvRows,asapParseMetadata,asapLoadIndex,asapItem,asapOpenMidi,asapShowPerformances,get entries(){return [...ASAP_INDEX,...asapLive]}};
window.__museTrainerCatalog={museTrainerParseReadme,museTrainerParseTree,museTrainerLoadIndex,get entries(){return [...MUSETRAINER_INDEX,...museTrainerLive]}};
window.__mutopiaCatalog={mutopiaCatalogItems,mutopiaHeader,mutopiaLoadIndex,mutopiaEnrichBatch,mutopiaUnpackMidiZip,get entries(){return mutopiaLive},get cache(){return mutopiaMetaCache}};
window.__libraryV08={scanFolderNow:(dir)=>scanFolder(dir),fallbackFolderNow:(files)=>importFallbackFolder(files),musicSafeXml,readMusicXML,zipUnpackMXL,museRead,zipUnpackMuseScore,songFromBuffer,get folderScanSummary(){return folderScanSummary},browseConnectedFolder,get manifest(){return REMOTE_INDEX},get collection(){return collectionIndex},get favorites(){return [...favoritesV08]},onlineOpen,importMusicFiles,libraryLoadFile,librarySaveBinary,loadLibraryIndex};

// Event wiring
$('leftToggle').onclick=()=>toggleSide('left');$('rightToggle').onclick=()=>toggleSide('right');$('leftClose').onclick=()=>toggleSide('left');$('rightClose').onclick=()=>toggleSide('right');$('commandsBtn').onclick=showCommands;$('focusBtn').onclick=toggleFocus;$('deviceBadge').onclick=()=>{state.right=true;applyPanels();switchRightTab('midi');if(window.innerWidth<821)state.left=false,applyPanels()};$('rightQuick').onclick=()=>{state.right=true;applyPanels();switchRightTab('practice')};$('adaptQuick').onclick=()=>{state.right=true;applyPanels();switchRightTab('adapt')};$('calibrateAdapt').onclick=openCalibration;document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{state.page='practice';applyPage();applyLayout(b.dataset.layout)});document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;applyPage();persist()});document.querySelectorAll('[data-righttab]').forEach(b=>b.onclick=()=>switchRightTab(b.dataset.righttab));$('librarySearch').oninput=libraryFolderFiltersChanged;$('midiFile').onchange=e=>importMIDI(e.target.files[0]);$('resetUI').onclick=resetLayout;$('resetUI2').onclick=resetLayout;$('calibrateLeft').onclick=openCalibration;$('calibrateRight').onclick=openCalibration;$('connectMidi').onclick=()=>connectMidi();$('autoMidi').checked=state.autoMidi!==false;$('autoMidi').onchange=e=>{state.autoMidi=e.target.checked;persist();if(state.autoMidi)autoConnectMidi()};$('inputSelect').onchange=e=>setInput(midiAccess?.inputs.get(e.target.value)||null,true);$('trackSelect').onchange=e=>{state.track=+e.target.value;refreshArrangement();seek(pos);rebuildPerfLast();renderReview();updateUI();resizeCanvas();persist()};$('displayRange').value=state.displayRange;$('displayRange').onchange=e=>{state.displayRange=e.target.value;if(state.displayRange==='device'&&!getProfile()){state.displayRange='song';e.target.value='song';openCalibration();return}updateUI();persist()};$('targetRange').onchange=e=>{state.targetRange=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('adaptMode').onchange=e=>{state.adaptMode=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('adaptShift').onchange=e=>{state.adaptShift=Number(e.target.value);refreshArrangement();rebuildPerfLast();renderReview()};$('adaptProfile').onchange=e=>{state.adaptProfile=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('auditionAdapted').onchange=e=>{state.auditionAdapted=e.target.checked;refreshArrangement()};$('adaptRecommend').onclick=()=>{if(!adaptPlan?.ready)return;state.adaptMode=adaptPlan.recommendation;if(state.adaptMode==='transpose')state.adaptShift=adaptPlan.shifts[0];refreshArrangement();rebuildPerfLast();renderReview()};$('showReviewMarkers').checked=state.showReviewMarkers!==false;$('showReviewMarkers').onchange=e=>{state.showReviewMarkers=e.target.checked;persist();renderCanvas()};$('smartStart').onclick=()=>smartStart();$('smartStop').onclick=()=>smartStop();$('smartNext').onclick=()=>smartGoNext();$('smartRefresh').onclick=()=>{smart.plan=smartMakePlan();smartRender()};$('chooseFolder').onclick=()=>chooseFolder();$('refreshFolder').onclick=()=>refreshFolder();$('folderFallback').onchange=e=>importFallbackFolder(e.target.files);$('reviewSave').onclick=()=>{if(finishPerformance('manual'))notify('Попытка сохранена');else notify('Нет новых данных для сохранения')};$('reviewExport').onclick=exportPerformance;$('reviewDelete').onclick=()=>{if(!confirm('Удалить сохранённые попытки для текущего произведения и варианта партии?'))return;const profileToDelete=performanceProfile();perfAttempts=perfAttempts.filter(r=>r.profile!==profileToDelete);savePerfStorage({deletedProfile:profileToDelete});rebuildPerfLast();renderReview()};$('fingerGuideMode').onchange=e=>{state.fingerGuidanceMode=e.target.value;renderCanvas();persist()};$('speed').oninput=e=>{const was=isPlaying,next=+e.target.value;if(was)pause();state.speed=next;$('speedLabel').textContent=state.speed+'%';if(was)play();persist()};['labels','highlight','allTracks'].forEach(id=>{$(id).checked=state[id];$(id).onchange=e=>{state[id]=e.target.checked;updateUI();persist()}});$('volume').value=state.volume;$('volume').oninput=e=>{state.volume=+e.target.value;persist()};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('bottomMode').onchange=e=>setMode(e.target.value);$('accompany').checked=state.accompany;$('accompany').onchange=e=>{state.accompany=e.target.checked;state.accompanyExplicit=true;if(isPlaying){const wasPos=clockPos();pause();pos=wasPos;play()}persist()};$('sheetBarBack').onclick=()=>scoreJumpBar(-1);$('sheetBarNext').onclick=()=>scoreJumpBar(1);$('viewRoll').onclick=()=>scoreSetView('roll');$('viewSheet').onclick=()=>scoreSetView('sheet');$('sheetZoomOut').onclick=()=>scoreChangeZoom(-10);$('sheetZoomIn').onclick=()=>scoreChangeZoom(10);$('sheetZoomLabel').textContent=state.sheetZoom+'%';$('sheetFollow').checked=state.sheetFollow!==false;$('sheetFollow').onchange=e=>{state.sheetFollow=e.target.checked;persist()};$('playBtn').onclick=togglePlay;$('rewindBtn').onclick=()=>seek(pos-5);$('forwardBtn').onclick=()=>seek(pos+5);$('seek').oninput=e=>seek(duration()*+e.target.value/1000);$('loopBtn').onclick=()=>{if(loop.start===null||loop.end===null){loop.start=0;loop.end=duration()}loop.enabled=!loop.enabled;resetPractice();updateUI();persist()};$('loopStartBtn').onclick=()=>{loop.start=pos;ensureLoop();resetPractice();persist()};$('loopEndBtn').onclick=()=>{loop.end=pos;ensureLoop();resetPractice();persist()};$('loopClearBtn').onclick=()=>{loop={start:null,end:null,enabled:false};resetPractice();updateUI();persist()};$('addBookmarkBtn').onclick=()=>bookmark();$('roll').onclick=e=>{const box=roll.getBoundingClientRect();if(e.clientY-box.top<keyboardTop){let n=noteHit(e);if(n)selectNote(n)}};$('roll').addEventListener('contextmenu',contextMenu);document.addEventListener('pointerdown',e=>{if(!$('contextMenu').contains(e.target))hideMenu()});
for(let split of document.querySelectorAll('.splitter')){split.addEventListener('pointerdown',e=>{if(window.innerWidth<821)return;e.preventDefault();pointerDrag={side:split.dataset.side,x:e.clientX,leftWidth:state.leftWidth,rightWidth:state.rightWidth};split.classList.add('dragging');split.setPointerCapture(e.pointerId)});split.addEventListener('pointermove',e=>{if(!pointerDrag)return;if(pointerDrag.side==='left')state.leftWidth=clamp(pointerDrag.leftWidth+e.clientX-pointerDrag.x,210,520);else state.rightWidth=clamp(pointerDrag.rightWidth-(e.clientX-pointerDrag.x),240,550);applyPanels()});split.addEventListener('pointerup',()=>{pointerDrag=null;split.classList.remove('dragging');persist()});split.addEventListener('pointercancel',()=>pointerDrag=null)}
$('commandClose').onclick=()=>$('commandOverlay').classList.remove('show');$('commandSearch').oninput=renderCommands;$('commandOverlay').onclick=e=>{if(e.target===$('commandOverlay'))$('commandOverlay').classList.remove('show')};$('calibrationClose').onclick=()=>$('calibrationOverlay').classList.remove('show');$('calibrationOverlay').onclick=e=>{if(e.target===$('calibrationOverlay'))$('calibrationOverlay').classList.remove('show')};$('calBack').onclick=()=>{cal.step=clamp(cal.step-1,0,2);renderCal()};$('calRedo').onclick=()=>{cal={step:0,low:null,high:null};renderCal()};$('calSave').onclick=saveCalibration;$('calManual').onclick=()=>$('manualRange').classList.toggle('hidden');$('manualApply').onclick=()=>{let low=+$('manualLow').value,high=+$('manualHigh').value;if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high>127||high<=low){$('calWarning').textContent='Проверь границы: 0 ≤ нижняя нота < верхняя нота ≤ 127';return}cal={low,high,step:2};renderCal()};$('errorClose').onclick=$('errorOK').onclick=()=>$('importErrorOverlay').classList.remove('show');
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideMenu();document.querySelectorAll('.overlay.show').forEach(el=>{
  const cancel=new Event('playalong:cancel',{cancelable:true});
  el.dispatchEvent(cancel);
  if(!cancel.defaultPrevented)el.classList.remove('show');
 });if(document.body.classList.contains('focus'))toggleFocus();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommands();return}if(e.target.closest('input,select,textarea')||document.querySelector('.overlay.show'))return;if(e.shiftKey&&e.key.toLowerCase()==='l'){e.preventDefault();toggleSide('left');return}if(e.shiftKey&&e.key.toLowerCase()==='r'){e.preventDefault();toggleSide('right');return}if(e.key===' '){e.preventDefault();togglePlay();return}if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFocus();return}if(e.key==='ArrowLeft'){seek(pos-5);return}if(e.key==='ArrowRight'){seek(pos+5);return}});
window.addEventListener('resize',resizeCanvas);let ro=new ResizeObserver(resizeCanvas);ro.observe($('rollWrap'));
if(!['listen','wait','tempo'].includes(state.mode))state.mode='listen';if(!['original','transpose','adaptive'].includes(state.adaptMode))state.adaptMode='original';if(!['device',...Object.keys(PREVIEW_RANGES)].includes(state.targetRange))state.targetRange='device';if(!['center','low','high'].includes(state.adaptProfile))state.adaptProfile='center';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));$('bottomMode').value=state.mode;loadSong(demoSongs.find(s=>s.id===startupSelectedSongId)||demoSongs[0]);restoreFolder();applyPage();applyLayout(state.layout,false);switchRightTab(state.rightTab,false);updateDevice();updateUI();scoreSetView(state.scoreView);requestAnimationFrame(frame);queueMicrotask(autoConnectMidi);
// The IndexedDB collection is asynchronous. Restore the last selected saved work only
// after it has been read, and never let the initial demo overwrite that selection.
startupLibraryPromise.then(async()=>{
 try{
  if(startupSelectedSongId&&current?.id!==startupSelectedSongId){
   let entry=collectionIndex.find(x=>x.id===startupSelectedSongId);
   // v0.10.0 and earlier loaded imports under transient import/online IDs.
   // Migrate them to content-based saved IDs without re-uploading the file.
   if(!entry&&startupSelectedSongId.startsWith('import-')){
    entry=collectionIndex.find(x=>startupSelectedSongId==='import-'+x.name+'-'+x.dataSize);
   }
   if(!entry&&startupSelectedSongId.startsWith('online-')&&collectionIndex.length){
    entry=[...collectionIndex].sort((a,b)=>b.added-a.added)[0];
   }
   if(entry){
    if(entry.id!==startupSelectedSongId&&state.songSettings[startupSelectedSongId]&&!state.songSettings[entry.id])
     state.songSettings[entry.id]=state.songSettings[startupSelectedSongId];
    const binary=await libraryReadBinary(entry.id);await libraryLoadFile(binary.name,binary.data,binary.id,{title:binary.title,author:binary.author,type:'saved'});
   }
   else setLibraryStatus('Предыдущее произведение больше не найдено в локальной коллекции. Выбери его снова или импортируй файл.');
  }
 }catch(err){setLibraryStatus('Не удалось восстановить мелодию: '+(err?.message||err))}
 finally{startupSongRestorePending=false;persist();renderLibrary()}
}).catch(err=>{startupSongRestorePending=false;console.warn('Song restore failed',err);persist()});
window.addEventListener('pagehide',()=>{if(isPlaying&&ctx)pos=clockPos();persist()});
window.__scoreTest={scoreXMLFromSong,scoreSecondToBeat,scoreBeatToSecond,scoreBarBeats,scoreSetView,scoreSyncCursor,get renderer(){return scoreRenderer},get view(){return state.scoreView},get cursorTimes(){return scoreCursorTimes},get scoreLoaded(){return scoreSong===current&&!!scoreRenderer}};
window.__prototypeTest={get pianoGeometry(){return pianoGeom},get soundingKeys(){return [...soundingSongKeys()]},get soundingNoteRefs(){return [...soundingScoreNotes()]},get scheduledVoices(){return [...activeVoices].map(v=>({pitch:v.pitch,start:v.sourceNote?.start??null,startTime:v.startTime,endTime:v.endTime}))},get performedNoteRefs(){return [...performedScoreNotes()]},get midiHeld(){return [...midiHeld]},virtualKeyAt,get keyboardTop(){return keyboardTop},get capability(){return adaptPlan},get adaptedNotes(){return selectedArrangement()},get songOriginalNotes(){return originalSelectedNotes()},refreshArrangement,setTarget:(key,mode)=>{state.targetRange=key;if(mode)state.adaptMode=mode;refreshArrangement()},setAdaptMode:(mode,shift)=>{state.adaptMode=mode;if(shift!=null)state.adaptShift=shift;refreshArrangement()},get state(){return {...state}},get song(){return current},get pos(){return pos},get loop(){return {...loop}},get isPlaying(){return isPlaying},get hold(){return holdForInput},get waitRelease(){return waitReleaseGroup?{start:waitReleaseGroup.start,pitches:[...waitReleasePitches]}:null},get midiInfo(){return {connected:!!midiInput,name:midiInput?.name||'',preferred:state.preferredMidiName,auto:state.autoMidi,access:!!midiAccess}},get stats(){return practice?{...practice.stats,progress:practice.completed,group:practice.nextGroup()?.start??null}:null},get session(){return practice},get performances(){return perfAttempts},get smart(){return smart},smartStart,smartStop,smartRoundComplete,smartMakePlan,get folderIndex(){return folderIndex},loadFolderSong,importFallbackFolder,get review(){return practice&&practice.started?summarizePerformance(practice):perfLast},finishPerformance,openReview,renderReview,setMode,receiveNoteOn:note=>onNoteOn(note,85,'midi'),receiveNoteOff:note=>onNoteOff(note,'midi'),parseMidi,play,pause,seek,loadSong};


// FG-00 non-mutating observability for regression tests. Fingering is demo-only.
window.__fingerGuideTest={
 get mode(){return state.fingerGuidanceMode},
 get imageAssets(){return Object.fromEntries(['LH','RH'].map(h=>[h,{
  loaded:FINGER_GUIDANCE_IMAGES[h].loaded,error:FINGER_GUIDANCE_IMAGES[h].error,
  width:FINGER_GUIDANCE_IMAGES[h].image.naturalWidth,
  height:FINGER_GUIDANCE_IMAGES[h].image.naturalHeight}]))},
 get spritePlacements(){const notes=fingerGuidanceFrame(fingerGuidanceSteps(),pos).current?.notes||[];
  return Object.fromEntries(['LH','RH'].map(h=>[h,fingerGuidanceSpritePlacement(notes,h,pianoGeom,keyboardBottom-keyboardTop,lastCanvasSize.h-keyboardBottom)]))},

 get demoDuet(){return demoSongs.find(s=>s.id==='demo-finger-duet')},
 get steps(){return fingerGuidanceSteps().map(g=>({start:g.start,notes:g.notes.map(n=>({...n}))}))},
 get frame(){const f=fingerGuidanceFrame(fingerGuidanceSteps(),pos);return {current:f.current?.start??null,next:f.next?.start??null}},
 get layout(){return {keyboardTop,keyboardBlackH,canvasHeight:lastCanvasSize.h}},
};
