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
// Owner-provided, locally bundled original SMFs. The searchable catalogue
// loads without inflating all MIDI notes. The compressed pack is fetched only
// when a user actually opens one score.
const builtinMidiIndex=[];
let builtinMidiPackPromise=null;
const BUILTIN_MIDI_SOURCE='Встроенные MIDI';
async function builtinMidiDigest(bytes){
 if(!crypto?.subtle)throw Error('Для проверки MIDI необходим HTTPS или localhost');
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function builtinMidiLoadCatalog(){
 const response=await fetch('./assets/builtin-midi/catalog.json');
 if(!response.ok)throw Error('Каталог встроенных MIDI недоступен: HTTP '+response.status);
 const data=await response.json();
 if(data?.schemaVersion!==1||data.count!==162||!Array.isArray(data.files)||
    data.files.length!==data.count||!/^[a-f0-9]{64}$/.test(data.rawSha256)||
    data.uncompressedBytes>1024*1024)
  throw Error('Повреждён индекс встроенных MIDI');
 const names=new Set();
 for(const [i,f] of data.files.entries()){
  if(f.id!=='builtin-midi:'+i||typeof f.filename!=='string'||
    !/^[^\/\\\x00-\x1f]+\.mid$/i.test(f.filename)||
    typeof f.title!=='string'||f.title!==f.filename.slice(0,-4)||
    names.has(f.filename.toLocaleLowerCase())||
    !Number.isSafeInteger(f.offset)||f.offset<6||
    !Number.isSafeInteger(f.length)||f.length<22||
    f.offset+f.length>data.uncompressedBytes||
    !/^[a-f0-9]{64}$/.test(f.sha256))
   throw Error('Некорректный MIDI-файл в каталоге');
  names.add(f.filename.toLocaleLowerCase());
 }
 builtinMidiIndex.splice(0,builtinMidiIndex.length,...data.files.map(f=>({
  ...f,author:'Коллекция пользователя',source:BUILTIN_MIDI_SOURCE,
  format:'MIDI',genre:'Учебные и музыкальные MIDI'
 })));
 builtinMidiIndex.rawSha256=data.rawSha256;
 builtinMidiIndex.rawLength=data.uncompressedBytes;
 renderLibrary();
}
async function builtinMidiRawPack(){
 if(!builtinMidiPackPromise)builtinMidiPackPromise=(async()=>{
  const response=await fetch('./assets/builtin-midi/collection.zlib');
  if(!response.ok)throw Error('Нет пакета встроенных MIDI: HTTP '+response.status);
  if(!window.DecompressionStream)throw Error('Для встроенных MIDI необходим современный браузер');
  const packed=await response.arrayBuffer();
  if(packed.byteLength>300000)throw Error('Пакет MIDI превышает лимит');
  const raw=new Uint8Array(await new Response(new Blob([packed]).stream()
    .pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  if(raw.length!==builtinMidiIndex.rawLength||
    String.fromCharCode(...raw.slice(0,4))!=='PAM1'||
    (raw[4]|raw[5]<<8)!==162||
    await builtinMidiDigest(raw)!==builtinMidiIndex.rawSha256)
   throw Error('Встроенные MIDI не прошли проверку целостности');
  return raw;
 })().catch(error=>{builtinMidiPackPromise=null;throw error});
 return builtinMidiPackPromise;
}
async function builtinMidiOpen(e,{startupRestore=false}={}){
 const original=await builtinMidiRawPack();
 const midi=original.slice(e.offset,e.offset+e.length);
 if(midi.length!==e.length||String.fromCharCode(...midi.slice(0,4))!=='MThd'||
    await builtinMidiDigest(midi)!==e.sha256)
  throw Error('Исходный MIDI не прошёл проверку контрольной суммы: '+e.title);
 const data=midi.buffer;
 await libraryLoadFile(e.filename,data,await libraryContentId(data),{
  title:e.title,author:BUILTIN_MIDI_SOURCE,type:'builtin',startupRestore
 });
}

// A remote catalog entry or unread local score has UNKNOWN coverage. Never
// claim "no fingering" merely because catalog metadata omits its annotations.
function libraryCoverageFor(e,category){
 if(category==='demo')return fingeringCoverageFromSong(e);
 if(category==='saved'){
  if(fingeringCoverageValid(e.fingeringCoverage))return e.fingeringCoverage;
  // MIDI has no native author finger numbers; do not invent a 0/1 total.
  if(['mid','midi'].includes(String(e.format||'').toLowerCase()))return null;
 }
 return null;
}
function libraryCoverageStatusFor(e,category){
 if(category==='builtin'||category==='saved'&&['mid','midi'].includes(String(e.format||'').toLowerCase()))return 'none';
 return fingeringCoverageStatus(libraryCoverageFor(e,category));
}
function libRow(e,category){
 const wrap=document.createElement('div');wrap.className='libv8-row'+(state.selected===e.id?' current':'');
 const main=document.createElement('button');main.className='libv8-main';const title=document.createElement('strong');title.textContent=e.title;const sub=document.createElement('span');sub.textContent=[e.author,e.source||category,e.instrument||'',e.license].filter(Boolean).join(' · ');main.append(title,sub);
 const coverage=libraryCoverageFor(e,category),coverageState=libraryCoverageStatusFor(e,category);
 const finger=document.createElement('span');finger.className='libFingerStatus';finger.dataset.state=coverageState;
 finger.textContent='Аппликатура: '+(coverageState==='none'&&!coverage?'Нет · MIDI':fingeringCoverageLabel(coverage));
 if(category==='demo')finger.title='Учебная демо-аппликатура, не авторская MusicXML';
 else if(coverageState==='unknown')finger.title='Файл ещё не проверен на наличие номеров пальцев; онлайн-каталоги не скачиваются автоматически';
 else finger.title='Покрытие номерами пальцев 1–5; наличие правой/левой руки учитывается отдельно';
 main.append(finger);if(e.sourcePath){const d=document.createElement('small');d.className='mutopiaDetail';d.textContent=e.verifiedSource?'Mutopia FTP · опубликованный MIDI/ZIP найден':'GitHub Mutopia · опубликованный MIDI ещё не найден · '+e.sourcePath;main.append(d)}
 main.onclick=async()=>{try{if(category==='demo')return loadSong(e),state.page='practice',applyPage();if(category==='builtin')return await builtinMidiOpen(e);if(category==='folder')return await loadFolderSong(e.folderPath);if(category==='saved'){const found=collectionIndex.find(x=>x.id===e.id);const binary=await libraryReadBinary(found.id);return await libraryLoadFile(binary.name,binary.data,binary.id,{title:binary.title,author:binary.author,type:'saved'})}if(category==='online')return await (e.source===MAESTRO_SOURCE?maestroOpen(e):e.sourcePath?mutopiaOpen(e):onlineOpen(e))}catch(err){libraryError(err)}};
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
 const query=$('librarySearch').value.toLocaleLowerCase().trim(),sel=$('librarySourceSelect').value,onlyFavorites=$('libraryFavoritesOnly').checked,
  fingerFilter=$('libraryFingeringSelect').value;
 const demo=demoSongs.map(s=>({...s,source:'Демо'})),folder=folderIndex.map(x=>x.song).filter(Boolean).map(e=>({...e,source:'Папка'})),saved=collectionIndex.map(e=>({...e,source:'Моя коллекция'}));
 const combos=[...builtinMidiIndex.map(e=>({e,category:'builtin'})),...demo.map(e=>({e,category:'demo'})),...folder.map(e=>({e,category:'folder'})),...saved.map(e=>({e,category:'saved'})),...REMOTE_INDEX.map(e=>({e,category:'online'})),...mutopiaLive.map(e=>({e,category:'online'})),...museTrainerLive.map(e=>({e,category:'online'})),...asapLive.map(e=>({e,category:'online'})),...maestroLive.map(e=>({e,category:'online'}))];
 const mutopiaComposer=$('mutopiaComposer').value,mutopiaInstrument=$('mutopiaInstrument').value;
 const matches=combos.filter(({e,category})=>(sel==='all'||sel===category||(sel==='mutopia'&&e.source==='Mutopia')||(sel==='musetrainer'&&e.source==='MuseTrainer')||(sel==='asap'&&e.source==='ASAP Dataset')||(sel==='maestro'&&e.source===MAESTRO_SOURCE)||(sel==='openscore'&&e.source==='OpenScore GitHub')||(sel==='repertoire'&&e.source==='Public Domain MIDI'))&&(!(sel==='mutopia'&&mutopiaComposer)||e.composerCode===mutopiaComposer||!e.sourcePath)&&(!(sel==='mutopia'&&mutopiaInstrument)||String(e.instrument||'').toLowerCase().includes(mutopiaInstrument))&&(!onlyFavorites||favoritesV08.has(e.id))&&(fingerFilter==='all'||libraryCoverageStatusFor(e,category)===fingerFilter)&&(!query||[e.title,e.author,e.source,e.genre,e.license,e.instrument,e.composerCode,e.sourcePath].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
 matches.sort((a,b)=>{const mode=$('librarySort').value;return mode==='title'?a.e.title.localeCompare(b.e.title):mode==='author'?a.e.author.localeCompare(b.e.author): mode==='difficulty'?(a.e.level||9)-(b.e.level||9): (a.category==='saved'?-2:a.category==='folder'?-1:a.category==='demo'?0:1)-(b.category==='saved'?-2:b.category==='folder'?-1:b.category==='demo'?0:1)||a.e.title.localeCompare(b.e.title)});
 $('libraryCount').textContent=matches.length+' / '+combos.length;$('libV8Counts').textContent=collectionIndex.length+' сохранено · '+folderIndex.length+' в папке · '+builtinMidiIndex.length+' встроенных MIDI · '+(REMOTE_INDEX.length+mutopiaLive.length+museTrainerLive.length+asapLive.length+maestroLive.length)+' онлайн · '+favoritesV08.size+' избранных';
 const progress=$('libraryFingeringProgress');
 if(progress)progress.textContent=libraryCoveragePending&&libraryCoverageChecked<libraryCoveragePending
  ?'Проверяю сохранённые партитуры: '+libraryCoverageChecked+' / '+libraryCoveragePending
  :'Статус «Не проверено» означает, что содержимое ещё не прочитано.';
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
 libraryFolderFiltersChanged();
 requestAnimationFrame(()=>{$('songList').closest('.panelSection')?.scrollIntoView({block:'start',behavior:'auto'})});
}
// These are UI preferences, not song preferences: keep them across reloads
// and include them in the existing validated settings backup.
function libraryRestoreFilters(){
 const filters=state.libraryFilters;
 $('librarySourceSelect').value=filters.source;
 $('librarySort').value=filters.sort;
 $('libraryFingeringSelect').value=filters.fingering;
 $('libraryFavoritesOnly').checked=filters.favoritesOnly;
 $('librarySearch').value=filters.query;
 $('mutopiaInstrument').value=filters.mutopiaInstrument;
 // The composer choices are loaded asynchronously; the catalog applies this
 // stored code once it has rebuilt the options.
 if([...$('mutopiaComposer').options].some(option=>option.value===filters.mutopiaComposer))
  $('mutopiaComposer').value=filters.mutopiaComposer;
}
function libraryRememberFilters(){
 state.libraryFilters=settingLibraryFilters({
  source:$('librarySourceSelect').value,
  sort:$('librarySort').value,
  fingering:$('libraryFingeringSelect').value,
  favoritesOnly:$('libraryFavoritesOnly').checked,
  query:$('librarySearch').value,
  // The async catalog may not have recreated its options yet.
  mutopiaComposer:$('mutopiaComposer').options.length===1&&state.libraryFilters.mutopiaComposer
   ?state.libraryFilters.mutopiaComposer:$('mutopiaComposer').value,
  mutopiaInstrument:$('mutopiaInstrument').value
 },false);
 persist();
}
function libraryFolderFiltersChanged(){libraryPageLimit=60;libraryRememberFilters();renderLibrary()}
renderLibrary=renderLibraryV08;
libraryRestoreFilters();
const builtinMidiCatalogPromise=builtinMidiLoadCatalog().then(()=>true).catch(error=>{
 console.error('Built-in MIDI catalog:',error);
 setLibraryStatus('Не удалось открыть встроенные MIDI: '+error.message);
 return false;
});
renderFolderListing=function(){
 const count=folderIndex.filter(e=>e.type==='score').length;
 $('folderListing').textContent=folderIndex.length+' файлов для поиска · MusicXML/MXL/MuseScore: '+count+' — доступны для открытия и тренировки.';
 $('browseFolder').disabled=folderIndex.length===0;
 const n=folderIndex.length,r=n%100,last=n%10,word=r>=11&&r<=14?'файлов':last===1?'файл':last>=2&&last<=4?'файла':'файлов';
 $('browseFolder').textContent='📂 Просмотреть '+n+' '+word;
};
async function libraryLoadFolderSong(path){const entry=folderIndex.find(e=>e.path===path);if(!entry)return;try{
 const file=entry.file||(await entry.handle.getFile()),data=await file.arrayBuffer();
 await libraryLoadFile(file.name,data,await libraryContentId(data),{author:'📁 '+path,type:'folder'});
 try{await librarySaveBinary(file.name,data,'Папка пользователя',{title:current.title,author:current.author})}
 catch(e){setLibraryStatus('Файл открыт, но не сохранён для следующих запусков: '+e.message)}
 }catch(e){libraryError(e)}}
loadFolderSong=libraryLoadFolderSong;
importMIDI=async function(file){if(!file)return;try{await importMusicFiles([file])}finally{$('midiFile').value=''}};