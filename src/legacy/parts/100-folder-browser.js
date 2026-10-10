// ===== Private local music folder (read-only) via browser user permission =====
const FOLDER_DB='playalong-local-library-v07';let folderHandle=null,folderIndex=[];
async function folderDatabase(){return new Promise((resolve,reject)=>{const req=indexedDB.open(FOLDER_DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('directories');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveFolderHandle(handle){try{const db=await folderDatabase();await new Promise((r,j)=>{const t=db.transaction('directories','readwrite');t.objectStore('directories').put(handle,'main');t.oncomplete=r;t.onerror=()=>j(t.error)});db.close()}catch{}}
async function restoreFolder(){try{const db=await folderDatabase(),handle=await new Promise((r,j)=>{let q=db.transaction('directories','readonly').objectStore('directories').get('main');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();if(handle){folderHandle=handle;const permitted=await handle.queryPermission({mode:'read'});if(permitted==='granted')await scanFolder(handle);else $('folderStatus').textContent='Папка «'+handle.name+'» сохранена; нажми «Подключить папку» для восстановления доступа.';}}catch{}}
async function chooseFolder(){if(!window.showDirectoryPicker){$('folderStatus').textContent='В этом браузере нет showDirectoryPicker. Выбери папку через кнопку ниже; её потребуется выбрать снова при следующем запуске.';return}
 try{const handle=await window.showDirectoryPicker({id:'playalong-music',mode:'read',startIn:'music'});folderHandle=handle;await saveFolderHandle(handle);await scanFolder(handle);}catch(e){if(e.name!=='AbortError')$('folderStatus').textContent='Доступ к папке: '+(e.message||e)}}
async function refreshFolder(){if(!folderHandle){$('folderStatus').textContent='Сначала подключи папку';return}try{let allowed=await folderHandle.queryPermission({mode:'read'});if(allowed!=='granted')allowed=await folderHandle.requestPermission({mode:'read'});if(allowed==='granted')await scanFolder(folderHandle);else $('folderStatus').textContent='Разрешение на чтение папки не получено.'}catch(e){$('folderStatus').textContent='Не удалось перечитать папку: '+e.message}}
// Enumerate every nested directory. File-count safety caps are explicit, never silent.
const FOLDER_FILE_LIMIT=20000;
let folderScanSummary=null;
async function scanFolder(handle){
 let found=[],queue=[{dir:handle,path:'',depth:0}],folders=0,maxDepth=0,ignored=0,failures=[],truncated=false;
 $('folderStatus').textContent='Сканирование «'+handle.name+'»…';
 try{
  while(queue.length&&!truncated){
   const {dir,path,depth}=queue.shift();folders++;maxDepth=Math.max(maxDepth,depth);
   try{
    for await(const [name,entry] of dir.entries()){
     const relative=path?path+'/'+name:name;
     if(entry.kind==='directory')queue.push({dir:entry,path:relative,depth:depth+1});
     else if(/\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i.test(name)){
      if(found.length>=FOLDER_FILE_LIMIT){truncated=true;break}
      found.push({name,path:relative,handle:entry,type:/\.(mid|midi)$/i.test(name)?'midi':'score',source:'persistent'});
     }else ignored++;
    }
   }catch(e){failures.push((path||handle.name)+': '+(e.message||String(e)))}
   if(folders%20===0){
    $('folderStatus').textContent='Сканирование: '+folders+' папок · '+found.length+' партитур и MIDI…';
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  found.sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true,sensitivity:'base'}));
  folderIndex=found.map(e=>({...e,song:{id:'folder:'+e.path,title:e.name.replace(/\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i,''),author:'📁 '+e.path,type:'folder',folderPath:e.path,tracks:[]}}));
  folderScanSummary={files:found.length,folders,maxDepth,ignored,truncated,failures};
  $('folderStatus').textContent='«'+handle.name+'»: '+found.length+' музыкальных файлов · '+folders+' папок · глубина '+maxDepth+'.'+(truncated?' Достигнут явный лимит '+FOLDER_FILE_LIMIT+' файлов.':'')+(failures.length?' Не удалось прочитать '+failures.length+' папок: '+failures.slice(0,2).join('; '):'');
  renderFolderListing();renderLibrary();
 }catch(e){$('folderStatus').textContent='Ошибка сканирования: '+e.message;throw e}
}
async function importFallbackFolder(files){
 folderHandle=null;
 const matching=[...files].filter(f=>/\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i.test(f.name));
 const truncated=matching.length>FOLDER_FILE_LIMIT;
 folderIndex=matching.slice(0,FOLDER_FILE_LIMIT).map(f=>{
  const path=f.webkitRelativePath||f.name;
  return{name:f.name,path,file:f,type:/\.(mid|midi)$/i.test(f.name)?'midi':'score',source:'snapshot',song:{id:'folder:'+path,title:f.name.replace(/\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i,''),author:'📁 '+path,type:'folder',folderPath:path,tracks:[]}};
 });
 const folders=new Set(folderIndex.map(e=>e.path.split('/').slice(0,-1).join('/')).filter(Boolean));
 const maxDepth=Math.max(0,...folderIndex.map(e=>Math.max(0,e.path.split('/').length-2)));
 folderScanSummary={files:folderIndex.length,folders:folders.size,maxDepth,ignored:0,truncated,failures:[]};
 $('folderStatus').textContent='Выбрано музыкальных файлов: '+folderIndex.length+' · найдено вложенных папок: '+folders.size+' · глубина: '+maxDepth+'.'+(truncated?' Лимит '+FOLDER_FILE_LIMIT+' файлов, остальные не добавлены.':'')+' Выбор одноразовый — для обновления выбери папку снова.';
 renderFolderListing();renderLibrary();
}
function renderFolderListing(){const box=$('folderListing'),unsupported=folderIndex.filter(e=>e.type==='score').length;box.textContent=folderIndex.filter(e=>e.type==='midi').length+' MIDI в поиске · '+unsupported+' нотных файлов (MusicXML/MXL — следующий этап)';}
async function loadFolderSong(path){const entry=folderIndex.find(e=>e.path===path);if(!entry||entry.type!=='midi')return;
 try{let f=entry.file||(await entry.handle.getFile());let s=parseMidi(new Uint8Array(await f.arrayBuffer()),f.name);s.id='folder:'+path;s.author='📁 '+path;s.type='folder';loadSong(s);state.page='practice';applyPage();notify('Загружено: '+f.name)}catch(e){$('errorText').textContent=e.message||String(e);$('importErrorOverlay').classList.add('show')}}

