// Portable backup of the user's own repertoire and preferences; never uploaded to a server.
const BACKUP_FORMAT='play-along-backup',BACKUP_VERSION=1;
const BACKUP_MAX_BYTES=96*1024*1024;
function backupBytesToBase64(buffer){
 const bytes=buffer instanceof ArrayBuffer?new Uint8Array(buffer):new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength);
 const chunks=[];for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 return btoa(chunks.join(''));
}
function backupBase64ToBytes(base64){
 if(typeof base64!=='string'||base64.length>21*1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw Error('Повреждённое содержимое музыкального файла');
 const bin=atob(base64);if(bin.length>15*1024*1024)throw Error('Файл в резервной копии превышает лимит 15 МБ');
 const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer;
}
async function backupCreate(){
 if(startupSongRestorePending)await startupLibraryPromise;
 await startupPerformancePromise;
 if(startupSongRestorePending)throw Error('Библиотека ещё не загружена. Повтори через несколько секунд');
 if(isPlaying&&ctx)pos=clockPos();persist();
 const works=await libraryTransaction('works','readonly',s=>s.getAll())||[];
 const size=works.reduce((n,w)=>n+(w.data?.byteLength||0),0);
 if(size>BACKUP_MAX_BYTES)throw Error('Коллекция больше 96 МБ. Для больших библиотек потребуется потоковый формат резервной копии.');
 const saved=works.map(({data,...info})=>({...info,data:backupBytesToBase64(data)}));
 const raw={format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),appVersion:window.__playAlongVersion,
  works:saved,settings:JSON.parse(localStorage.getItem(STORE)||'{}'),
  favorites:await libraryTransaction('prefs','readonly',s=>s.get('favorites'))||[],
  performances:await libraryTransaction('performances','readonly',s=>s.getAll())||perfAttempts,
  smartMastery:JSON.parse(localStorage.getItem(SMART_STORE)||'{}')};
 return JSON.stringify(raw);
}
async function backupDownload(){
 const button=$('backupExport');button.disabled=true;
 try{
  setLibraryStatus('Готовлю резервную копию…');
  const backup=await backupCreate();const blob=new Blob([backup],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='play-along-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  setLibraryStatus('Резервная копия скачана. Сохрани файл в надёжном месте.');
 }catch(err){setLibraryStatus('Ошибка резервного копирования: '+err.message);throw err}
 finally{button.disabled=false}
}
function backupCheckJson(payload){
 if(!payload||payload.format!==BACKUP_FORMAT||payload.version!==BACKUP_VERSION||!Array.isArray(payload.works)||!payload.settings||typeof payload.settings!=='object'||Array.isArray(payload.settings))throw Error('Неверный формат или неподдерживаемая версия резервной копии');
 if(payload.works.length>4000||JSON.stringify(payload.settings).length>4*1024*1024)throw Error('Слишком большая или повреждённая резервная копия');
 const results=[],seen=new Set();let total=0;
 for(const entry of payload.works){
  if(!entry||typeof entry.id!=='string'||!entry.id.startsWith('saved-')||seen.has(entry.id)||typeof entry.name!=='string'||entry.name.length>250||!isSupportedFile(entry.name))throw Error('Некорректный музыкальный файл или дубликат ID в копии');
  const data=backupBase64ToBytes(entry.data);total+=data.byteLength;
  if(total>BACKUP_MAX_BYTES)throw Error('Музыкальные файлы превышают лимит 96 МБ');
  if(libraryBinaryId(data)!==entry.id)throw Error('Контрольная сумма не совпадает для '+entry.name);
  seen.add(entry.id);
  results.push({id:entry.id,name:entry.name,title:String(entry.title||entry.name).slice(0,250),author:String(entry.author||'').slice(0,250),format:libraryExt(entry.name),origin:String(entry.origin||'backup').slice(0,250),license:String(entry.license||'').slice(0,250),page:String(entry.page||'').slice(0,1024),added:Number.isFinite(entry.added)?entry.added:Date.now(),data});
 }
 if(!Array.isArray(payload.favorites)||payload.favorites.length>10000)throw Error('Неверный список избранного');
 if(!Array.isArray(payload.performances)||payload.performances.length>5000||payload.performances.some(r=>!r||typeof r.id!=='string'||r.id.length>100)||JSON.stringify(payload.performances).length>12*1024*1024)throw Error('Некорректная или слишком большая история тренировок');
 if(payload.smartMastery && (typeof payload.smartMastery!=='object'||Array.isArray(payload.smartMastery)||JSON.stringify(payload.smartMastery).length>4*1024*1024))throw Error('Некорректный прогресс Smart Practice');
 const settings={...defaults};
 for(const key of Object.keys(defaults))if(key!=='songSettings'&&Object.hasOwn(payload.settings,key))settings[key]=payload.settings[key];
 const songSettings=payload.settings.songSettings;
 if(songSettings&&typeof songSettings==='object'&&!Array.isArray(songSettings)){
  settings.songSettings=Object.create(null);
  const ids=Object.keys(songSettings);if(ids.length>4000)throw Error('Слишком много профилей мелодий');
  for(const id of ids){if(id==='__proto__'||id==='constructor'||id==='prototype'||id.length>250)continue;
   const original=songSettings[id];if(!original||typeof original!=='object'||Array.isArray(original))continue;
   const safe={};for(const key of [...SONG_PREF_FIELDS,'position','loop','bookmarks'])if(Object.hasOwn(original,key))safe[key]=original[key];
   settings.songSettings[id]=safe;
  }
 }
 return {works:results,settings,performances:payload.performances,favorites:payload.favorites.filter(x=>typeof x==='string'),smartMastery:payload.smartMastery||{}};
}
async function backupRestore(file){
 if(!file)return;
 if(file.size>130*1024*1024)throw Error('Резервная копия слишком велика');
 const payload=JSON.parse(await file.text()),validated=backupCheckJson(payload);
 const agree=confirm('Восстановить '+validated.works.length+' файлов и настройки Play Along? Существующие мелодии останутся, а настройки и прогресс будут заменены данными из копии.');
 if(!agree)return false;
 // Write works in one IndexedDB transaction, so an error rolls back all imported binaries.
 const db=await libraryDB();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction(['works','workIndex','prefs','performances'],'readwrite');
  const works=tx.objectStore('works'),index=tx.objectStore('workIndex');for(const item of validated.works){works.put(item);index.put(libraryEntryMetadata(item))}
  tx.objectStore('prefs').put(validated.favorites,'favorites');
  const attempts=tx.objectStore('performances');attempts.clear();for(const record of validated.performances)attempts.put(record);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 })}finally{db.close()}
 // Settings are updated only after the whole library transaction commits.
 const keys=[STORE,PERF_STORE,SMART_STORE];
 // The complete history was already restored atomically into IndexedDB;
 // localStorage only needs the newest compatible 30-record cache.
 const historyCache=[...validated.performances].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,30);
 const values=[validated.settings,historyCache,validated.smartMastery].map(x=>JSON.stringify(x));
 const originals=keys.map(k=>localStorage.getItem(k));
 window.__playAlongRestoringBackup=true;
 try{
  for(let i=0;i<keys.length;i++)localStorage.setItem(keys[i],values[i]);
 }catch(e){
  for(let i=0;i<keys.length;i++)try{if(originals[i]===null)localStorage.removeItem(keys[i]);else localStorage.setItem(keys[i],originals[i])}catch{}
  window.__playAlongRestoringBackup=false;
  setLibraryStatus('Файлы восстановлены, но настройки не сохранены: '+e.message);throw e;
 }
 location.reload();return true;
}
function backupSetup(){
 $('backupExport').onclick=()=>backupDownload().catch(e=>console.error('Backup failed',e));
 $('backupImport').onclick=()=>$('backupFile').click();
 $('backupFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{setLibraryStatus('Проверяю резервную копию…');await backupRestore(f)}
  catch(err){setLibraryStatus('Восстановление не выполнено: '+(err.message||err));console.error('Restore failed',err)}
 };
}
