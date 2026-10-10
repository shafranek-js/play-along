 try{await mutopiaEnrich(e);await mutopiaCacheWrite(MUTOPIA_METADATA_KEY,mutopiaMetaCache)}
 catch(err){setLibraryStatus('Не удалось уточнить метаданные: '+err.message)}
 try{await mutopiaResolvePublished(e);renderLibrary()}
 catch(err){
  setLibraryStatus('Не удалось прочитать список опубликованных MIDI ('+err.message+'). Возможно ограничение CORS. Открой папку Mutopia ↗, скачай MIDI и импортируй его в Play Along. Предполагаемый адрес MIDI не используется.');
  return;
 }
 await onlineOpen(e);
}
const onlineLookup=new Map(REMOTE_INDEX.map(e=>[e.id,e]));
function libRow(e,category){
 const wrap=document.createElement('div');wrap.className='libv8-row'+(state.selected===e.id?' current':'');
 const main=document.createElement('button');main.className='libv8-main';const title=document.createElement('strong');title.textContent=e.title;const sub=document.createElement('span');sub.textContent=[e.author,e.source||category,e.instrument||'',e.license].filter(Boolean).join(' · ');main.append(title,sub);if(e.sourcePath){const d=document.createElement('small');d.className='mutopiaDetail';d.textContent=e.verifiedSource?'Mutopia FTP · опубликованный MIDI/ZIP найден':'GitHub Mutopia · опубликованный MIDI ещё не найден · '+e.sourcePath;main.append(d)}
 main.onclick=async()=>{try{if(category==='demo')return loadSong(e),state.page='practice',applyPage();if(category==='folder')return await loadFolderSong(e.folderPath);if(category==='saved'){const found=collectionIndex.find(x=>x.id===e.id);return await libraryLoadFile(found.name,found.data,found.id,{title:found.title,author:found.author,type:'saved'})}if(category==='online')return await (e.sourcePath?mutopiaOpen(e):onlineOpen(e))}catch(err){libraryError(err)}};
 const controls=document.createElement('div');controls.className='libv8-controls';
 const star=document.createElement('button');star.title='Добавить/удалить из избранного';star.textContent=favoritesV08.has(e.id)?'★':'☆';star.setAttribute('aria-label','Избранное');star.onclick=()=>libraryFavorite(e.id);controls.append(star);
 if(category==='online'){
  if(e.source==='MuseTrainer'){const direct=document.createElement('a');direct.href=e.url;direct.target='_blank';direct.rel='noopener noreferrer';direct.title='Скачать оригинальный MusicXML (.mxl)';direct.textContent='↓';controls.append(direct)}
  if(e.source==='ASAP Dataset'){
   const score=document.createElement('button');score.title='Открыть MIDI-версию нот';score.textContent='MIDI';score.style.fontSize='11px';score.setAttribute('aria-label','Открыть MIDI-версию нот');score.onclick=()=>asapOpenMidi(e);controls.append(score);
   const perf=document.createElement('button');perf.title='Выбрать запись живого исполнения MIDI ('+(e.performances||[]).length+')';perf.textContent='Исп.';perf.style.fontSize='11px';perf.setAttribute('aria-label','Выбрать вариант исполнения');perf.disabled=!(e.performances||[]).length;perf.onclick=()=>asapShowPerformances(e);controls.append(perf);
  }
  if(e.source==='Mutopia'){
    const direct=document.createElement('a');direct.href=(e.sourcePath&&!e.verifiedSource)?e.page:e.url;direct.target='_blank';direct.rel='noopener noreferrer';direct.title=e.sourcePath&&!e.verifiedSource?'Открыть официальную папку с опубликованными файлами':'Открыть опубликованный MIDI (или ZIP)';direct.textContent=e.sourcePath&&!e.verifiedSource?'↗':'↓';controls.append(direct);
  }
  const link=document.createElement('a');link.href=e.page;link.target='_blank';link.rel='noopener noreferrer';link.title='Открыть оригинальную страницу и проверить лицензию';link.textContent='↗';controls.append(link)
}
 if(category==='saved'){const del=document.createElement('button');del.textContent='×';del.title='Удалить из моей коллекции';del.onclick=async()=>{if(confirm('Удалить «'+e.title+'» из сохранённой коллекции?'))await libraryRemoveEntry(e.id)};controls.append(del)}
 wrap.append(main,controls);return wrap;
}
function renderLibraryV08(){
 const query=$('librarySearch').value.toLocaleLowerCase().trim(),sel=$('librarySourceSelect').value,onlyFavorites=$('libraryFavoritesOnly').checked;
 const demo=demoSongs.map(s=>({...s,source:'Демо'})),folder=folderIndex.map(x=>x.song).filter(Boolean).map(e=>({...e,source:'Папка'})),saved=collectionIndex.map(e=>({...e,source:'Моя коллекция'}));
 const combos=[...demo.map(e=>({e,category:'demo'})),...folder.map(e=>({e,category:'folder'})),...saved.map(e=>({e,category:'saved'})),...REMOTE_INDEX.map(e=>({e,category:'online'})),...mutopiaLive.map(e=>({e,category:'online'})),...museTrainerLive.map(e=>({e,category:'online'})),...asapLive.map(e=>({e,category:'online'}))];
 const mutopiaComposer=$('mutopiaComposer').value,mutopiaInstrument=$('mutopiaInstrument').value;
 const matches=combos.filter(({e,category})=>(sel==='all'||sel===category||(sel==='mutopia'&&e.source==='Mutopia')||(sel==='musetrainer'&&e.source==='MuseTrainer')||(sel==='asap'&&e.source==='ASAP Dataset')||(sel==='openscore'&&e.source==='OpenScore GitHub')||(sel==='repertoire'&&e.source==='Public Domain MIDI'))&&(!(sel==='mutopia'&&mutopiaComposer)||e.composerCode===mutopiaComposer||!e.sourcePath)&&(!(sel==='mutopia'&&mutopiaInstrument)||String(e.instrument||'').toLowerCase().includes(mutopiaInstrument))&&(!onlyFavorites||favoritesV08.has(e.id))&&(!query||[e.title,e.author,e.source,e.genre,e.license,e.instrument,e.composerCode,e.sourcePath].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
 matches.sort((a,b)=>{const mode=$('librarySort').value;return mode==='title'?a.e.title.localeCompare(b.e.title):mode==='author'?a.e.author.localeCompare(b.e.author): mode==='difficulty'?(a.e.level||9)-(b.e.level||9): (a.category==='saved'?-2:a.category==='folder'?-1:a.category==='demo'?0:1)-(b.category==='saved'?-2:b.category==='folder'?-1:b.category==='demo'?0:1)||a.e.title.localeCompare(b.e.title)});
 $('libraryCount').textContent=matches.length+' / '+combos.length;$('libV8Counts').textContent=collectionIndex.length+' сохранено · '+folderIndex.length+' в папке · '+(REMOTE_INDEX.length+mutopiaLive.length+museTrainerLive.length+asapLive.length)+' онлайн · '+favoritesV08.size+' избранных';
 const list=$('songList');list.replaceChildren();if(!matches.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Ничего не найдено. Попробуй другой источник или запрос.';list.append(empty)}
 // A page-sized window prevents giant source lists from blocking rendering.
 const pageSize=libraryPageLimit,limited=matches.slice(0,pageSize);for(const x of limited)list.append(libRow(x.e,x.category));
 if(matches.length>pageSize){const more=document.createElement('button');more.className='btn tiny ghost';more.style.width='100%';more.textContent='Показать ещё '+Math.min(60,matches.length-pageSize)+' · показано '+pageSize+' из '+matches.length;more.onclick=()=>{libraryPageLimit+=60;renderLibrary()};list.append(more)}
}
// Explicit folder browsing never depends on the user's previous library filters.
let libraryPageLimit=60,folderRevealOnScan=false;
function browseConnectedFolder(){
 if(!folderIndex.length){notify('В подключённой папке нет поддерживаемых музыкальных файлов');return}
 $('librarySourceSelect').value='folder';
 $('librarySearch').value='';
 $('libraryFavoritesOnly').checked=false;
 libraryPageLimit=60;
 state.page='library';applyPage();
 renderLibrary();
 requestAnimationFrame(()=>{$('songList').closest('.panelSection')?.scrollIntoView({block:'start',behavior:'auto'})});
}
function libraryFolderFiltersChanged(){libraryPageLimit=60;renderLibrary()}
renderLibrary=renderLibraryV08;
renderFolderListing=function(){
 const count=folderIndex.filter(e=>e.type==='score').length;
 $('folderListing').textContent=folderIndex.length+' файлов для поиска · MusicXML/MXL/MuseScore: '+count+' — доступны для открытия и тренировки.';
 $('browseFolder').disabled=folderIndex.length===0;
 const n=folderIndex.length,r=n%100,last=n%10,word=r>=11&&r<=14?'файлов':last===1?'файл':last>=2&&last<=4?'файла':'файлов';
 $('browseFolder').textContent='📂 Просмотреть '+n+' '+word;
};
async function libraryLoadFolderSong(path){const entry=folderIndex.find(e=>e.path===path);if(!entry)return;try{
 const file=entry.file||(await entry.handle.getFile()),data=await file.arrayBuffer();
 await libraryLoadFile(file.name,data,libraryBinaryId(data),{author:'📁 '+path,type:'folder'});
 try{await librarySaveBinary(file.name,data,'Папка пользователя',{title:current.title,author:current.author})}
 catch(e){setLibraryStatus('Файл открыт, но не сохранён для следующих запусков: '+e.message)}
 }catch(e){libraryError(e)}}
loadFolderSong=libraryLoadFolderSong;
importMIDI=async function(file){if(!file)return;try{await importMusicFiles([file])}finally{$('midiFile').value=''}};