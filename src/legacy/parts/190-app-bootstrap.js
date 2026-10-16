// User-configurable left library sections. Keep existing controls and their
// listeners attached while moving DOM nodes; never rewrite their innerHTML.
function setupLibrarySectionOrganizer(){
 const sidebody=$('leftPanel').querySelector('.sidebody');
 const keys=LIBRARY_SECTION_IDS;
 const nodes=new Map(keys.map(id=>[id,sidebody.querySelector('[data-library-section="'+id+'"]')]));
 if([...nodes.values()].some(node=>!node))throw Error('Missing reorderable library section');
 // Legacy Library v0.8 makes two panes during module 110 initialization:
 // it places Catalog inside .libResults and all other panels in .libControls.
 // Flatten those wrappers BEFORE exposing arbitrary above/below ordering.
 // Move real DOM nodes (never clone buttons/files, keeping their handlers).
 const legacyControls=sidebody.querySelector(':scope > .libControls');
 const legacyResults=sidebody.querySelector(':scope > .libResults');
 const search=legacyControls?.querySelector(':scope > .panelSection')||
  sidebody.querySelector(':scope > .panelSection');
 if(!search)throw Error('Missing library search and filter controls');
 sidebody.prepend(search);
 const container=document.createElement('div');
 container.id='librarySections';container.className='librarySections';
 container.setAttribute('aria-label','Настраиваемые разделы библиотеки');
 search.insertAdjacentElement('afterend',container);
 const prefs=librarySectionLayoutNormalize(state.librarySections);
 state.librarySections=prefs;
 const toggleNodes=new Map();
 const updateMoveButtons=()=>{
  const sections=[...container.children];
  for(let i=0;i<sections.length;i++){
   sections[i].querySelector('.libraryMoveUp').disabled=i===0;
   sections[i].querySelector('.libraryMoveDown').disabled=i===sections.length-1;
  }
 };
 const storeLayout=()=>{
  state.librarySections={order:[...container.children].map(el=>el.dataset.librarySection),
   collapsed:{...state.librarySections.collapsed}};
  updateMoveButtons();
  persist();
 };
 const move=(section,direction)=>{
  const siblings=[...container.children],index=siblings.indexOf(section),swap=siblings[index+direction];
  if(!swap)return;
  if(direction<0)container.insertBefore(section,swap);
  else container.insertBefore(swap,section);
  storeLayout();section.querySelector('.libraryDragHandle').focus();
 };
 for(const id of prefs.order){
  const section=nodes.get(id),label=section.querySelector(':scope > .sectionLabel');
  const heading=(label?.textContent||id).trim();
  const body=document.createElement('div');
  body.className='librarySectionBody';body.id='librarySectionBody-'+id;
  while(section.firstChild)body.append(section.firstChild);
  const header=document.createElement('div');header.className='librarySectionHeader';
  const drag=document.createElement('button');drag.type='button';
  drag.className='libraryDragHandle';drag.textContent='⠿';drag.draggable=false;
  drag.setAttribute('aria-label','Перетащить раздел '+heading);
  drag.title='Перетащите для изменения порядка; Alt + ↑/↓ — с клавиатуры';
  drag.addEventListener('keydown',e=>{
   if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();move(section,e.key==='ArrowUp'?-1:1);
  });
  const toggle=document.createElement('button');toggle.type='button';
  toggle.className='librarySectionToggle';toggle.id='librarySectionToggle-'+id;
  toggle.setAttribute('aria-controls',body.id);
  const chevron=document.createElement('span');chevron.className='libraryChevron';chevron.setAttribute('aria-hidden','true');
  const name=document.createElement('span');name.textContent=heading;
  toggle.append(chevron,name);
  const setOpen=open=>{
   body.hidden=!open;
   toggle.setAttribute('aria-expanded',String(open));
   chevron.textContent=open?'▾':'▸';
   section.classList.toggle('isCollapsed',!open);
  };
  setOpen(!prefs.collapsed[id]);
  toggle.onclick=()=>{
   const open=toggle.getAttribute('aria-expanded')!=='true';
   setOpen(open);
   state.librarySections.collapsed[id]=!open;
   persist();
  };
  const up=document.createElement('button');up.type='button';up.className='libraryMoveUp';
  up.textContent='↑';up.title='Переместить «'+heading+'» выше';
  up.setAttribute('aria-label',up.title);up.onclick=()=>move(section,-1);
  const down=document.createElement('button');down.type='button';down.className='libraryMoveDown';
  down.textContent='↓';down.title='Переместить «'+heading+'» ниже';
  down.setAttribute('aria-label',down.title);down.onclick=()=>move(section,1);
  header.append(drag,toggle,up,down);
  // Both are NEW children; insertBefore requires the reference to exist.
  section.append(header,body);
  section.classList.add('librarySortableSection');
  section.setAttribute('aria-labelledby',toggle.id);
  container.append(section);toggleNodes.set(id,toggle);
  // Pointer capture (instead of native HTML DragEvent) supports both mouse
  // and touch, without Chromium button-draggable inconsistencies.
  drag.addEventListener('pointerdown',e=>{
   if(e.button!==0||pointerDrag)return;
   pointerDrag={section,id,pointerId:e.pointerId,startY:e.clientY,started:false};
   drag.setPointerCapture(e.pointerId);e.preventDefault();
  });
  drag.addEventListener('pointermove',e=>{
   if(!pointerDrag||pointerDrag.id!==id||pointerDrag.pointerId!==e.pointerId)return;
   if(!pointerDrag.started&&Math.abs(e.clientY-pointerDrag.startY)<7)return;
   pointerDrag.started=true;container.classList.add('dragInProgress');section.classList.add('isDragging');
   for(const node of container.children)node.classList.remove('dropBefore','dropAfter');
   const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-library-section]');
   if(target&&target.parentNode===container&&target!==section){
    const after=e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;
    target.classList.add(after?'dropAfter':'dropBefore');
   }
  });
  drag.addEventListener('pointerup',e=>{
   if(!pointerDrag||pointerDrag.id!==id||pointerDrag.pointerId!==e.pointerId)return;
   if(pointerDrag.started){
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-library-section]');
    if(target&&target.parentNode===container&&target!==section){
     const after=e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;
     container.insertBefore(section,after?target.nextSibling:target);
     storeLayout();
    }
   }
   resetPointerDrag();
  });
  drag.addEventListener('pointercancel',()=>{if(pointerDrag?.id===id)resetPointerDrag()});
 }
 let pointerDrag=null;
 function resetPointerDrag(){
  pointerDrag=null;container.classList.remove('dragInProgress');
  for(const node of container.children)node.classList.remove('isDragging','dropBefore','dropAfter');
 }
 // Preserve any future legacy nodes outside the six movable sections,
 // then discard the no-longer-used two-pane wrappers.
 for(const wrapper of [legacyControls,legacyResults]){
  if(!wrapper)continue;
  for(const child of [...wrapper.children])sidebody.append(child);
  wrapper.remove();
 }
 updateMoveButtons();
}
setupLibrarySectionOrganizer();

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
$('librarySourceSelect').onchange=libraryFolderFiltersChanged;$('libraryFingeringSelect').onchange=libraryFolderFiltersChanged;$('librarySort').onchange=libraryFolderFiltersChanged;$('libraryFavoritesOnly').onchange=libraryFolderFiltersChanged;$('browseFolder').onclick=browseConnectedFolder;
$('importMusicInput').onchange=async e=>{await importMusicFiles(e.target.files);e.target.value=''};
backupSetup();
$('openMutopia').onclick=()=>window.open('https://www.mutopiaproject.org/advsearch.html','_blank','noopener,noreferrer');
$('filterOpenScore').onclick=()=>{$('librarySourceSelect').value='openscore';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged()};
$('filterMutopia').onclick=()=>{$('librarySourceSelect').value='mutopia';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged()};
$('filterMuseTrainer').onclick=()=>{$('librarySourceSelect').value='musetrainer';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged();if(!museTrainerLoaded)museTrainerLoadIndex().catch(()=>{})};
$('filterAsap').onclick=()=>{$('librarySourceSelect').value='asap';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged();if(!asapLoaded)asapLoadIndex().catch(()=>{})};
$('asapSync').onclick=()=>asapLoadIndex().catch(()=>{});
$('asapRefresh').onclick=()=>asapLoadIndex(true).catch(()=>{});
$('filterMaestro').onclick=()=>{$('librarySourceSelect').value='maestro';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged();if(!maestroLoaded)maestroLoadIndex().catch(()=>{})};
$('maestroSync').onclick=()=>maestroLoadIndex().catch(()=>{});
$('maestroRefresh').onclick=()=>maestroLoadIndex(true).catch(()=>{});
$('maestroPickZip').onclick=()=>$('maestroZipFile').click();
$('maestroZipFile').onchange=e=>maestroImportZipFile(e.target.files?.[0]);
$('museTrainerSync').onclick=()=>museTrainerLoadIndex().catch(()=>{});
$('museTrainerRefresh').onclick=()=>museTrainerLoadIndex(true).catch(()=>{});
$('filterRepertoire').onclick=()=>{$('librarySourceSelect').value='repertoire';state.page='library';applyPage();$('leftPanel').scrollTop=0;libraryFolderFiltersChanged()};
$('mutopiaSync').onclick=()=>{state.page='library';applyPage();$('leftPanel').scrollTop=0;mutopiaLoadIndex().catch(()=>{})};
$('mutopiaUpdate').onclick=()=>mutopiaLoadIndex(true).catch(()=>{});
$('mutopiaEnrich').onclick=()=>mutopiaEnrichBatch(20).catch(err=>mutopiaRenderStatus('Ошибка уточнения: '+err.message));
$('mutopiaClearCache').onclick=()=>mutopiaClearIndex();
$('mutopiaComposer').onchange=libraryFolderFiltersChanged;
$('mutopiaInstrument').onchange=libraryFolderFiltersChanged;
// Search is user-initiated: no GitHub request on application startup.
const mutopiaOldFilter=$('filterMutopia').onclick;
$('filterMutopia').onclick=()=>{mutopiaOldFilter();if(!mutopiaCatalogLoaded)mutopiaLoadIndex().catch(()=>{});};
function libraryEnsureSelectedCatalog(){
 const source=$('librarySourceSelect').value;
 if(source==='mutopia'&&!mutopiaCatalogLoaded)mutopiaLoadIndex().catch(()=>{});
 if(source==='musetrainer'&&!museTrainerLoaded)museTrainerLoadIndex().catch(()=>{});
 if(source==='asap'&&!asapLoaded)asapLoadIndex().catch(()=>{});
 if(source==='maestro'&&!maestroLoaded)maestroLoadIndex().catch(()=>{});
}
$('librarySourceSelect').addEventListener('change',libraryEnsureSelectedCatalog);
// Restoring a previously chosen remote source must restore its actual rows,
// not merely the dropdown label. Default "all" never starts a remote fetch.
if(['mutopia','musetrainer','asap','maestro'].includes(state.libraryFilters.source))
 queueMicrotask(libraryEnsureSelectedCatalog);
const startupSelectedSongId=state.selected;
startupSongRestorePending=true;
const startupLibraryPromise=loadLibraryIndex();
const startupPerformancePromise=loadPerformanceHistory().catch(e=>console.warn('Performance history restore failed',e));
window.__playAlongVersion='0.9.1';
window.__asapCatalog={asapCsvRows,asapParseMetadata,asapLoadIndex,asapItem,asapOpenMidi,asapShowPerformances,get entries(){return [...ASAP_INDEX,...asapLive]}};
window.__maestroCatalog={maestroParseIndex,maestroLoadIndex,maestroZipDirectory,maestroUseArchive,maestroExtractMidi,maestroOpen,get entries(){return maestroLive},get archiveReady(){return !!maestroArchive}};
window.__museTrainerCatalog={museTrainerParseReadme,museTrainerParseTree,museTrainerLoadIndex,get entries(){return [...MUSETRAINER_INDEX,...museTrainerLive]}};
window.__mutopiaCatalog={mutopiaCatalogItems,mutopiaHeader,mutopiaLoadIndex,mutopiaEnrichBatch,mutopiaUnpackMidiZip,get entries(){return mutopiaLive},get cache(){return mutopiaMetaCache}};
window.__libraryV08={scanFolderNow:(dir)=>scanFolder(dir),fallbackFolderNow:(files)=>importFallbackFolder(files),musicSafeXml,readMusicXML,zipUnpackMXL,museRead,zipUnpackMuseScore,songFromBuffer,get folderScanSummary(){return folderScanSummary},browseConnectedFolder,get manifest(){return REMOTE_INDEX},get collection(){return collectionIndex},get favorites(){return [...favoritesV08]},onlineOpen,importMusicFiles,libraryLoadFile,librarySaveBinary,loadLibraryIndex};

// Compact Workspace: small accessible menus instead of the old full-height
// song header. All original controls remain single-instance DOM nodes.
function compactCloseMenus(except=''){
 let changed=false;
 for(const [panel,trigger] of [
  ['layoutMenuItems','layoutMenuButton'],
  ['handsMenuPanel','handsMenuButton'],
  ['songInfoPopover','songInfoButton']
 ]){
  if(panel===except)continue;
  const el=$(panel);
  if(!el.classList.contains('hidden')){
   el.classList.add('hidden');$(trigger).setAttribute('aria-expanded','false');changed=true;
  }
 }
 return changed;
}
function compactToggleMenu(panel,trigger){
 const opening=$(panel).classList.contains('hidden');
 compactCloseMenus();
 $(panel).classList.toggle('hidden',!opening);
 $(trigger).setAttribute('aria-expanded',String(opening));
}
$('layoutMenuButton').onclick=()=>compactToggleMenu('layoutMenuItems','layoutMenuButton');
$('handsMenuButton').onclick=()=>compactToggleMenu('handsMenuPanel','handsMenuButton');
$('songInfoButton').onclick=()=>compactToggleMenu('songInfoPopover','songInfoButton');
$('compactViewSelect').onchange=e=>scoreSetView(e.target.value);
document.addEventListener('pointerdown',e=>{
 if(!e.target.closest('#layoutMenu,#handsMenu,#songInfoPopover,#songInfoButton'))compactCloseMenus();
});
// Event wiring
$('leftToggle').onclick=()=>toggleSide('left');$('rightToggle').onclick=()=>toggleSide('right');$('leftClose').onclick=()=>toggleSide('left');$('rightClose').onclick=()=>toggleSide('right');$('leftPin').onclick=()=>togglePin('left');$('rightPin').onclick=()=>togglePin('right');$('panelScrim').onclick=closeFloatingPanels;$('commandsBtn').onclick=showCommands;$('focusBtn').onclick=toggleFocus;$('deviceBadge').onclick=()=>{state.right=true;applyPanels();switchRightTab('midi');if(window.innerWidth<821)state.left=false,applyPanels()};$('rightQuick').onclick=()=>{state.right=true;applyPanels();switchRightTab('practice')};$('adaptQuick').onclick=()=>{state.right=true;applyPanels();switchRightTab('adapt')};$('calibrateAdapt').onclick=openCalibration;document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{compactCloseMenus();state.page='practice';applyPage();applyLayout(b.dataset.layout)});document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;applyPage();persist()});document.querySelectorAll('[data-righttab]').forEach(b=>b.onclick=()=>switchRightTab(b.dataset.righttab));$('librarySearch').oninput=libraryFolderFiltersChanged;$('midiFile').onchange=e=>importMIDI(e.target.files[0]);$('resetUI').onclick=resetLayout;$('resetUI2').onclick=resetLayout;$('calibrateLeft').onclick=openCalibration;$('calibrateRight').onclick=openCalibration;$('connectMidi').onclick=()=>connectMidi();$('autoMidi').checked=state.autoMidi!==false;$('autoMidi').onchange=e=>{state.autoMidi=e.target.checked;persist();if(state.autoMidi)autoConnectMidi()};$('inputSelect').onchange=e=>setInput(midiAccess?.inputs.get(e.target.value)||null,true);$('trackSelect').onchange=e=>{state.track=+e.target.value;refreshArrangement();seek(pos);rebuildPerfLast();renderReview();updateUI();resizeCanvas();persist()};$('displayRange').value=state.displayRange;$('displayRange').onchange=e=>{state.displayRange=e.target.value;if(state.displayRange==='device'&&!targetKeyboard()){state.displayRange='song';e.target.value='song';openCalibration();return}updateUI();resizeCanvas();persist()};$('targetRange').onchange=e=>{state.targetRange=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('adaptMode').onchange=e=>{state.adaptMode=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('adaptShift').onchange=e=>{state.adaptShift=Number(e.target.value);refreshArrangement();rebuildPerfLast();renderReview()};$('adaptProfile').onchange=e=>{state.adaptProfile=e.target.value;refreshArrangement();rebuildPerfLast();renderReview()};$('auditionAdapted').onchange=e=>{state.auditionAdapted=e.target.checked;refreshArrangement()};$('adaptRecommend').onclick=()=>{if(!adaptPlan?.ready)return;state.adaptMode=adaptPlan.recommendation;if(state.adaptMode==='transpose')state.adaptShift=adaptPlan.shifts[0];refreshArrangement();rebuildPerfLast();renderReview()};$('showReviewMarkers').checked=state.showReviewMarkers!==false;$('showReviewMarkers').onchange=e=>{state.showReviewMarkers=e.target.checked;persist();renderCanvas()};$('smartStart').onclick=()=>smartStart();$('smartStop').onclick=()=>smartStop();$('smartNext').onclick=()=>smartGoNext();$('smartRefresh').onclick=()=>{smart.plan=smartMakePlan();smartRender()};$('chooseFolder').onclick=()=>chooseFolder();$('refreshFolder').onclick=()=>refreshFolder();$('folderFallback').onchange=e=>importFallbackFolder(e.target.files);$('reviewSave').onclick=()=>{if(finishPerformance('manual'))notify('Попытка сохранена');else notify('Нет новых данных для сохранения')};$('reviewExport').onclick=exportPerformance;$('reviewDelete').onclick=()=>{if(!confirm('Удалить сохранённые попытки для текущего произведения и варианта партии?'))return;const profileToDelete=performanceProfile();perfAttempts=perfAttempts.filter(r=>r.profile!==profileToDelete);savePerfStorage({deletedProfile:profileToDelete});rebuildPerfLast();renderReview()};$('fingerGuideMode').onchange=e=>{state.fingerGuidanceMode=e.target.value;$('fingerGuideLookahead').disabled=state.fingerGuidanceMode!=='ghost';renderCanvas();persist()};$('fingerGuideLookahead').onchange=e=>{const requested=Number(e.target.value);const safe=settingValidated('fingerLookaheadMs',requested);if(safe===undefined){e.target.value=String(state.fingerLookaheadMs);return}state.fingerLookaheadMs=safe;renderCanvas();persist()};$('leadInDuration').value=String(state.leadInDuration);
$('leadInDurationValue').textContent=state.leadInDuration.toFixed(1)+' с';
$('leadInDuration').oninput=e=>{const requested=Number(e.target.value),safe=settingValidated('leadInDuration',requested);if(safe===undefined){e.target.value=String(state.leadInDuration);return}state.leadInDuration=safe;$('leadInDurationValue').textContent=safe.toFixed(1)+' с';persist()};
$('gridVisibility').value=String(state.gridVisibility);
$('gridVisibilityValue').textContent=state.gridVisibility+'%';
$('gridVisibility').oninput=e=>{
 const value=Number(e.target.value),safe=settingValidated('gridVisibility',value);
 if(safe===undefined){e.target.value=String(state.gridVisibility);return;}
 state.gridVisibility=safe;$('gridVisibilityValue').textContent=safe+'%';
 renderCanvas();
};
$('gridVisibility').onchange=()=>persist();
$('speed').oninput=e=>{const was=isPlaying,next=+e.target.value;if(was)pause();state.speed=next;$('speedLabel').textContent=state.speed+'%';if(was)play({skipLeadIn:true});persist()};['labels','highlight','allTracks'].forEach(id=>{$(id).checked=state[id];$(id).onchange=e=>{state[id]=e.target.checked;updateUI();persist()}});$('volume').value=state.volume;$('volume').oninput=e=>{state.volume=+e.target.value;persist();try{audioSetMasterVolume(state.volume/100)}catch{}};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('bottomMode').onchange=e=>setMode(e.target.value);$('accompany').checked=state.accompany;$('accompany').onchange=e=>{state.accompany=e.target.checked;state.accompanyExplicit=true;if(isPlaying){const wasPos=clockPos();pause();pos=wasPos;play({skipLeadIn:true})}persist()};$('sheetBarBack').onclick=()=>scoreJumpBar(-1);$('sheetBarNext').onclick=()=>scoreJumpBar(1);$('viewRoll').onclick=()=>scoreSetView('roll');$('viewSheet').onclick=()=>scoreSetView('sheet');$('viewFingerEditor').onclick=()=>scoreSetView('editor');$('sheetZoomOut').onclick=()=>scoreChangeZoom(-10);$('sheetZoomIn').onclick=()=>scoreChangeZoom(10);$('sheetZoomLabel').textContent=state.sheetZoom+'%';$('sheetFollow').checked=state.sheetFollow!==false;$('sheetFollow').onchange=e=>{state.sheetFollow=e.target.checked;persist()};$('playBtn').onclick=togglePlay;$('restartBtn').onclick=rewindToStart;$('rewindBtn').onclick=()=>seek(pos-5);$('forwardBtn').onclick=()=>seek(pos+5);$('seek').oninput=e=>seek(duration()*+e.target.value/1000);$('loopBtn').onclick=()=>{if(loop.start===null||loop.end===null){loop.start=0;loop.end=duration()}loop.enabled=!loop.enabled;resetPractice();updateUI();persist()};$('loopStartBtn').onclick=()=>{loop.start=pos;ensureLoop();resetPractice();persist()};$('loopEndBtn').onclick=()=>{loop.end=pos;ensureLoop();resetPractice();persist()};$('loopClearBtn').onclick=()=>{loop={start:null,end:null,enabled:false};resetPractice();updateUI();persist()};$('addBookmarkBtn').onclick=()=>bookmark();// Piano Roll pointer selection belongs exclusively to 70-piano-roll.js; preserve virtual keyboard notes.$('roll').addEventListener('contextmenu',contextMenu);document.addEventListener('pointerdown',e=>{if(!$('contextMenu').contains(e.target))hideMenu()});
for(let split of document.querySelectorAll('.splitter')){split.addEventListener('pointerdown',e=>{if(window.innerWidth<821)return;e.preventDefault();pointerDrag={side:split.dataset.side,x:e.clientX,leftWidth:state.leftWidth,rightWidth:state.rightWidth};split.classList.add('dragging');split.setPointerCapture(e.pointerId)});split.addEventListener('pointermove',e=>{if(!pointerDrag)return;if(pointerDrag.side==='left')state.leftWidth=clamp(pointerDrag.leftWidth+e.clientX-pointerDrag.x,210,520);else state.rightWidth=clamp(pointerDrag.rightWidth-(e.clientX-pointerDrag.x),240,550);applyPanels()});split.addEventListener('pointerup',()=>{pointerDrag=null;split.classList.remove('dragging');persist()});split.addEventListener('pointercancel',()=>pointerDrag=null)}
$('commandClose').onclick=()=>$('commandOverlay').classList.remove('show');$('commandSearch').oninput=renderCommands;$('commandOverlay').onclick=e=>{if(e.target===$('commandOverlay'))$('commandOverlay').classList.remove('show')};$('calibrationClose').onclick=()=>$('calibrationOverlay').classList.remove('show');$('calibrationOverlay').onclick=e=>{if(e.target===$('calibrationOverlay'))$('calibrationOverlay').classList.remove('show')};$('calBack').onclick=()=>{cal.step=clamp(cal.step-1,0,2);renderCal()};$('calRedo').onclick=()=>{cal={step:0,low:null,high:null};renderCal()};$('calSave').onclick=saveCalibration;$('calManual').onclick=()=>$('manualRange').classList.toggle('hidden');$('manualApply').onclick=()=>{let low=+$('manualLow').value,high=+$('manualHigh').value;if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high>127||high<=low){$('calWarning').textContent='Проверь границы: 0 ≤ нижняя нота < верхняя нота ≤ 127';return}cal={low,high,step:2};renderCal()};$('errorClose').onclick=$('errorOK').onclick=()=>$('importErrorOverlay').classList.remove('show');
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(compactCloseMenus()){e.preventDefault();return}hideMenu();if(!document.body.classList.contains('focus')&&!document.querySelector('.overlay.show')&&closeFloatingPanels())return;document.querySelectorAll('.overlay.show').forEach(el=>{
  const cancel=new Event('playalong:cancel',{cancelable:true});
  el.dispatchEvent(cancel);
  if(!cancel.defaultPrevented)el.classList.remove('show');
 });if(document.body.classList.contains('focus'))toggleFocus();return}if(fingerSelectionShortcut(e))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showCommands();return}if(e.target.closest('input,select,textarea')||document.querySelector('.overlay.show'))return;if(e.shiftKey&&e.key.toLowerCase()==='l'){e.preventDefault();toggleSide('left');return}if(e.shiftKey&&e.key.toLowerCase()==='r'){e.preventDefault();toggleSide('right');return}if(e.key===' '){e.preventDefault();togglePlay();return}if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFocus();return}if(e.key==='ArrowLeft'){seek(pos-5);return}if(e.key==='ArrowRight'){seek(pos+5);return}});
window.addEventListener('resize',applyPanels);window.addEventListener('resize',resizeCanvas);let ro=new ResizeObserver(resizeCanvas);ro.observe($('rollWrap'));
if(!['listen','wait','tempo'].includes(state.mode))state.mode='listen';if(!['original','transpose','adaptive'].includes(state.adaptMode))state.adaptMode='original';if(!['device',...Object.keys(PREVIEW_RANGES)].includes(state.targetRange))state.targetRange='device';if(!['center','low','high'].includes(state.adaptProfile))state.adaptProfile='center';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));$('bottomMode').value=state.mode;loadSong(demoSongs.find(s=>s.id===startupSelectedSongId)||demoSongs[0]);restoreFolder();applyPage();applyLayout(state.layout,false);switchRightTab(state.rightTab,false);updateDevice();updateUI();scoreSetView(state.scoreView);audioSettingsUISetup();requestAnimationFrame(frame);queueMicrotask(autoConnectMidi);
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
window.__scoreTest={scoreXMLFromSong,scoreSecondToBeat,scoreBeatToSecond,scoreBarBeats,scoreSetView,scoreSyncCursor,
 get overlay(){const x=scoreFingeringOverlayState;return {status:x.status,count:x.count,handOnly:x.handOnly,reason:x.reason}},
 previewFingerOverlay(changes){
  const x=sheetFingeringOverlay(current,changes,{
   parse:source=>new DOMParser().parseFromString(source,'application/xml'),
   serialize:doc=>new XMLSerializer().serializeToString(doc)});
  return {status:x.status,count:x.count,handOnly:x.handOnly,reason:x.reason,
   suppressed:x.suppressed||0,
   fingeringTags:x.status==='applied'?(x.xml.match(/<fingering(?:[ >])/g)||[]).length:null,
   colored:x.status==='applied'?x.xml.includes('color="#C77D28"'):false,
   osmdXmlHeader:x.status==='applied'&&/^\s*<\?xml\b/.test(x.xml)};
 },
 get renderer(){return scoreRenderer},get view(){return state.scoreView},get cursorTimes(){return scoreCursorTimes},get scoreLoaded(){return scoreSong===current&&!!scoreRenderer},
 get editor(){return {visible:state.scoreView==='editor',notes:fingerEditorNotes().length,selected:fingerSelectedIds.size,
  firstBox:fingerEditorBoxes[0]?{id:fingerEditorBoxes[0].n.noteId,x:fingerEditorBoxes[0].x,y:fingerEditorBoxes[0].y,w:fingerEditorBoxes[0].w,h:fingerEditorBoxes[0].h}:null,
  boxes:fingerEditorBoxes.map(b=>({id:b.n.noteId,x:b.x,y:b.y,w:b.w,h:b.h})),
  scroll: fingerEditorScroller.scrollLeft,totalWidth:fingerEditorSurface.offsetWidth}}};
window.__prototypeTest={get pianoGeometry(){return pianoGeom},get soundingKeys(){return [...soundingSongKeys()]},get soundingNoteRefs(){return [...soundingScoreNotes()]},get scheduledVoices(){return [...activeVoices].map(v=>({pitch:v.pitch,start:v.sourceNote?.start??null,startTime:v.startTime,endTime:v.endTime}))},get performedNoteRefs(){return [...performedScoreNotes()]},get midiHeld(){return [...midiHeld]},virtualKeyAt,get keyboardTop(){return keyboardTop},get capability(){return adaptPlan},get adaptedNotes(){return selectedArrangement()},get songOriginalNotes(){return originalSelectedNotes()},refreshArrangement,setTarget:(key,mode)=>{state.targetRange=key;if(mode)state.adaptMode=mode;refreshArrangement()},setAdaptMode:(mode,shift)=>{state.adaptMode=mode;if(shift!=null)state.adaptShift=shift;refreshArrangement()},get state(){return {...state}},get song(){return current},get originalMidiBytes(){return originalMidiForSong()},get pos(){return pos},get loop(){return {...loop}},get isPlaying(){return isPlaying},get hold(){return holdForInput},get waitRelease(){return waitReleaseGroup?{start:waitReleaseGroup.start,pitches:[...waitReleasePitches]}:null},get midiInfo(){return {connected:!!midiInput,name:midiInput?.name||'',preferred:state.preferredMidiName,auto:state.autoMidi,access:!!midiAccess}},get stats(){return practice?{...practice.stats,progress:practice.completed,group:practice.nextGroup()?.start??null}:null},get session(){return practice},get performances(){return perfAttempts},get smart(){return smart},smartStart,smartStop,smartRoundComplete,smartMakePlan,get folderIndex(){return folderIndex},loadFolderSong,importFallbackFolder,get review(){return practice&&practice.started?summarizePerformance(practice):perfLast},finishPerformance,openReview,renderReview,setMode,receiveNoteOn:note=>onNoteOn(note,85,'midi'),receiveNoteOff:note=>onNoteOff(note,'midi'),receiveVirtualNoteOn:note=>onNoteOn(note,85,'virtual'),receiveVirtualNoteOff:note=>onNoteOff(note,'virtual'),parseMidi,play,pause,seek,loadSong};


// FG-00 non-mutating observability for regression tests. Fingering is demo-only.
window.__fingerGuideTest={
 // Read-only Chromium evidence, not a second Apply path or mutable engine state.
 get sceneCandidates(){
  const proposals=sceneFingerCandidatePreviewMap();
  return {active:sceneFingerActive,method:sceneFingerMethod,count:proposals.size,
   notes:[...proposals].map(([note,proposal])=>({
    id:note.noteId??null,pitch:note.pitch,start:note.start,
    finger:proposal.finger,hand:proposal.hand}))};
 },
 get sceneViewport(){return {active:sceneFingerActive,follow:sceneFingerFollow,
  viewTime:sceneFingerTime(),windowSeconds:sceneFingerWindowSeconds,
  transport:pos,scoreId:current?.id??null}},
 get mode(){return state.fingerGuidanceMode},
 get lookaheadMs(){return state.fingerLookaheadMs},
 get ghostMotion(){
  const frame=fingerGuidanceFrame(fingerGuidanceSteps(),pos);
  const ghostTime=fingerGuidanceGhostWindow({nextOnset:frame.next?.start,now:pos,
   leadMs:state.fingerLookaheadMs,speedPercent:state.speed,mode:state.mode,loop});
  const starting=frame.current||frame.previous;
  if(state.fingerGuidanceMode!=='ghost'||!starting?.complete||
   !frame.next?.complete||!ghostTime.visible||!pianoGeom)
   return {visible:false,crossing:false,plans:null};
  const motion=fingerGuidanceMotionState(starting,frame.next,pianoGeom,
   keyboardBottom-keyboardTop,lastCanvasSize.h-keyboardBottom,ghostTime,isPlaying);
  return {visible:true,crossing:motion.crossing,plans:motion.plans,
   targets:Object.fromEntries(['LH','RH'].map(h=>[h,frame.next.notes.filter(n=>n.hand===h)
    .map(n=>({pitch:n.pitch,finger:n.finger}))]))};
 },
 get ghostWindow(){const next=fingerGuidanceFrame(fingerGuidanceSteps(),pos).next;
  return fingerGuidanceGhostWindow({nextOnset:next?.complete?next.start:null,now:pos,
   leadMs:state.fingerLookaheadMs,speedPercent:state.speed,mode:state.mode,loop})},
 get imageAssets(){return Object.fromEntries(['LH','RH'].map(h=>[h,Object.fromEntries(
  ['thumb','index','middle','ring','pinky','rest','spread'].map(p=>{
   const a=FINGER_GUIDANCE_IMAGES[h+':'+p];
   return [p,{loaded:a?.loaded===true,error:a?.error===true,
    requested:!!a,width:a?.image?.naturalWidth||0,height:a?.image?.naturalHeight||0}]
  }))]))},
 preloadAllPoses(){for(const h of ['LH','RH'])for(const p of
  ['thumb','index','middle','ring','pinky','rest','spread'])fingerGuidanceGetImage(h,p)},
 get spritePlacements(){const notes=fingerGuidanceFrame(fingerGuidanceSteps(),pos).current?.notes||[];
  return Object.fromEntries(['LH','RH'].map(h=>[h,fingerGuidanceSpritePlacement(notes,h,pianoGeom,keyboardBottom-keyboardTop,lastCanvasSize.h-keyboardBottom)]))},
 get handBlends(){return Object.fromEntries(['LH','RH'].map(h=>{
  const b=fingerGuidanceBlendState[h];
  return [h,{from:b?.from?.pose??null,to:b?.target?.pose??null,
   startedMs:b?.startedMs??null,poseX:b?.target?.x??null,
   poseY:b?.target?.y??null}];
 }))},
  get passivePlacements(){
  if(!['hands','ghost'].includes(state.fingerGuidanceMode)||!pianoGeom||
   lastCanvasSize.h<360)return {LH:null,RH:null};
  const steps=fingerGuidanceSteps(),frame=fingerGuidanceFrame(steps,pos);
  return fingerGuidancePassivePlacements(steps,frame.current,pos,pianoGeom,
   keyboardBottom-keyboardTop);
 },
  get nextSpritePlacements(){const notes=fingerGuidanceFrame(fingerGuidanceSteps(),pos).next?.notes||[];
  return Object.fromEntries(['LH','RH'].map(h=>[h,fingerGuidanceSpritePlacement(notes,h,pianoGeom,keyboardBottom-keyboardTop,lastCanvasSize.h-keyboardBottom)]))},

 get demoDuet(){return demoSongs.find(s=>s.id==='demo-finger-duet')},
 get userCorrections(){const key=fingerGuideWorkKey();return key?structuredClone(state.fingerOverrides?.[key]||{}):{}},
 selectAuthoredNote(id){const note=current?.tracks.flatMap(t=>t.notes).find(n=>n.noteId===id);
  if(note)selectNote(note);return !!note},
 get selectedCorrection(){return selectedNote?fingerOverrideForNote(selectedNote):null},
 get selectedNoteIds(){return [...fingerSelectedIds]},
 get sourceOrder(){return fingerSelectionOrdered().map(n=>n.id)},
 get noteRects(){return hitboxes.filter(b=>b.n.noteId).map(b=>({id:b.n.noteId,x:b.x,y:b.y,w:b.w,h:b.h}))},
 get selectionAnchor(){return fingerSelectionAnchor},
 get groupEditorOpen(){return !!document.querySelector('.fingerCorrectionGroup')},
 get history(){const h=fingerOverrideHistoryCurrent();return {past:h.past.length,future:h.future.length,limit:FINGER_HISTORY_LIMIT}},
 get authoredSelection(){return selectedNote?{noteId:selectedNote.noteId,pitch:selectedNote.pitch,
  finger:selectedNote.finger??null,hand:selectedNote.hand??null}:null},
 get steps(){return fingerGuidanceSteps().map(g=>({start:g.start,totalNotes:g.totalNotes,complete:g.complete,notes:g.notes.map(n=>({...n}))}))},
 get frame(){const f=fingerGuidanceFrame(fingerGuidanceSteps(),pos);return {current:f.current?.start??null,next:f.next?.start??null}},
 get preview(){return fingerGuidanceFrame(fingerGuidanceSteps(),pos).current?.notes.map(n=>({pitch:n.pitch,hand:n.hand,finger:n.finger}))||[]},
 get waitTargets(){if(state.mode!=='wait'||!practice?.nextGroup())return [];
  const known=fingerGuidanceFrame(fingerGuidanceSteps(),pos).current?.notes||[];
  return practice.nextGroup().notes.filter(n=>!n.hit&&!n.miss&&!n.skipped).map(n=>{
   const marked=known.find(k=>k.pitch===n.pitch);
   return {pitch:n.pitch,hand:marked?.hand??null,finger:marked?.finger??null};
  });},
 get layout(){return {keyboardTop,keyboardBottom,keyboardBlackH,canvasHeight:lastCanvasSize.h}},
};
window.__prototypeTest.audio={
 getStatus:audioGetStatus,
 ensureReady:audioEnsureReady,
 switchBank:audioSwitchBank,
 selectLivePreset:audioSelectLivePreset,
 panic:audioPanic,
 listPresets:audioListPresets,
 setSimpleFallback:audioSetSimpleFallback,
 scheduleEvent:event=>audioScheduleEvent(event),
 planNoteLanes:(events,options)=>audioPlanNoteLanes(events,options),
 capturePcm:options=>audioCapturePcm(options),
 get engine(){return audioGetEngine()}
};
