async function songFromBuffer(name,arrayBuffer){const ext=libraryExt(name);if(ext==='mid'||ext==='midi')return parseMidi(new Uint8Array(arrayBuffer),name);if(['xml','musicxml','mxl'].includes(ext)){const xml=ext==='mxl'?await zipUnpackMXL(arrayBuffer):new TextDecoder().decode(arrayBuffer);return readMusicXML(xml,name)}if(ext==='mscx'||ext==='mscz'){const xml=ext==='mscz'?await zipUnpackMuseScore(arrayBuffer):new TextDecoder().decode(arrayBuffer);return museRead(xml,name)}throw Error('Неизвестный формат: '+ext)}
function libraryNotifyWarnings(song){if(song.warnings?.length)setLibraryStatus(song.warnings.join(' '));else setLibraryStatus('Готово: '+song.title+' · '+allNotes(song).length+' нот')}
async function libraryLoadFile(name,buffer,identity,details={}){const song=await songFromBuffer(name,buffer);if(identity)song.id=identity;if(details.title)song.title=details.title;if(details.author)song.author=details.author;if(details.type)song.type=details.type;loadSong(song);state.page='practice';applyPage();libraryNotifyWarnings(song);
 // Existing saved works gain exact-source coverage as soon as they are opened.
 if(identity)void libraryCoverageStore(song,identity).catch(e=>console.warn('Coverage index update failed',e));
 return song}
function libraryError(e){setLibraryStatus('Ошибка: '+(e?.message||String(e)));$('errorText').textContent=e?.message||String(e);$('importErrorOverlay').classList.add('show')}
async function importMusicFiles(files){
 for(const file of [...files||[]].slice(0,40)){
  try{
   if(!isSupportedFile(file.name))throw Error('Неподдерживаемый файл: '+file.name);
   const buf=await file.arrayBuffer();
   await libraryLoadFile(file.name,buf,await libraryContentId(buf));
   const title=current.title,author=current.author;
   try{await librarySaveBinary(file.name,buf,'Загружен пользователем',{title,author})}
   catch(err){setLibraryStatus('Партитура «'+title+'» открыта, но браузер не смог сохранить её в «Мою коллекцию»: '+err.message+' (попробуй HTTPS-версию приложения).')}
  }catch(e){libraryError(e);break}
 }
 renderLibrary();
}
async function mutopiaUnpackMidiZip(buffer){
 const bytes=new Uint8Array(buffer),dv=new DataView(buffer);if(bytes.length>16*1024*1024)throw Error('ZIP больше 16 МБ');
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('Ответ не является ZIP-архивом');const count=dv.getUint16(eocd+10,true),root=dv.getUint32(eocd+16,true);
 if(count>250)throw Error('В ZIP слишком много файлов');let off=root,entries=[];
 for(let i=0;i<count;i++){
  if(off+46>bytes.length||dv.getUint32(off,true)!==0x02014b50)throw Error('Некорректный ZIP');
  const method=dv.getUint16(off+10,true),compressed=dv.getUint32(off+20,true),expanded=dv.getUint32(off+24,true),nameLen=dv.getUint16(off+28,true),extra=dv.getUint16(off+30,true),comment=dv.getUint16(off+32,true),local=dv.getUint32(off+42,true),name=new TextDecoder().decode(bytes.slice(off+46,off+46+nameLen));
  off+=46+nameLen+extra+comment;
  if(!/\.(?:mid|midi)$/i.test(name)||name.includes('..')||name.startsWith('/'))continue;
  if(compressed>8*1024*1024||expanded>12*1024*1024)continue;
  if(local+30>bytes.length||dv.getUint32(local,true)!==0x04034b50)continue;
  const payload=local+30+dv.getUint16(local+26,true)+dv.getUint16(local+28,true);
  if(payload+compressed>bytes.length)continue;
  let result=bytes.slice(payload,payload+compressed);
  if(method===8){result=await zipInflateBounded(result,12*1024*1024,'MIDI ZIP')}
  else if(method!==0)continue;
  if(result.length>12*1024*1024||String.fromCharCode(...result.slice(0,4))!=='MThd')continue;
  entries.push({name,buffer:result.buffer});
 }
 return entries;
}
function mutopiaChooseZipEntry(entries,title){
 if(entries.length===1)return Promise.resolve(entries[0]);
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='overlay show';overlay.style.zIndex=200;
  const panel=document.createElement('div');panel.className='modal';panel.style.maxHeight='80vh';panel.style.overflowY='auto';
  const h=document.createElement('h2');h.textContent='Выбери часть: '+title;panel.append(h);
  const desc=document.createElement('p');desc.textContent='В архиве '+entries.length+' MIDI-файлов. Каждая часть открывается отдельно.';panel.append(desc);
  let settled=false;
  const finish=(entry)=>{if(settled)return;settled=true;overlay.remove();resolve(entry)};
  // All cancellation routes (Escape, backdrop, Cancel) must settle this
  // Promise; hiding the DOM alone leaves onlineBusy permanently true.
  overlay.addEventListener('playalong:cancel',event=>{event.preventDefault();finish(null)});
  for(const e of entries){const b=document.createElement('button');b.className='btn tiny';b.style.cssText='display:block;width:100%;text-align:left;margin:6px 0';b.textContent=e.name;b.onclick=()=>finish(e);panel.append(b)}
  const close=document.createElement('button');close.className='btn ghost';close.textContent='Отмена';close.onclick=()=>finish(null);panel.append(close);
  overlay.onclick=ev=>{if(ev.target===overlay)finish(null)};overlay.append(panel);document.body.append(overlay);
 })
}
async function onlineOpen(e){if(onlineBusy)return;onlineBusy=true;setLibraryStatus('Загружаю «'+e.title+'» из '+e.source+'…');$('onlineStatus').classList.add('loading');try{const urls=[...new Set([e.url,e.fallback].filter(Boolean))];let data=null,error=null,selectedUrl='';for(const url of urls){try{const response=await fetch(url,{mode:'cors',cache:'force-cache'});if(!response.ok)throw Error('HTTP '+response.status);const buf=await response.arrayBuffer();if(buf.byteLength>12*1024*1024)throw Error('Файл превышает 12 МБ');if(/\.(mid|midi)(?:$|\?)/i.test(url)&&new TextDecoder().decode(buf.slice(0,4))!=='MThd')throw Error('Ответ не является MIDI');if(/\.(zip|mxl)(?:$|\?)/i.test(url)&&new TextDecoder().decode(buf.slice(0,2))!=='PK')throw Error('Ответ не является ZIP');data=buf;selectedUrl=url;break}catch(err){error=err}}if(!data)throw error||Error('Источник недоступен');if(/\.zip(?:$|\?)/i.test(selectedUrl)){
  const entries=await mutopiaUnpackMidiZip(data);if(!entries.length)throw Error('ZIP не содержит MIDI-файлов');
  const choice=await mutopiaChooseZipEntry(entries,e.title);if(!choice){setLibraryStatus('Выбор части отменён');return}
  const name=choice.name.split('/').pop();data=choice.buffer;
  await libraryLoadFile(name,data,await libraryContentId(data),{title:e.title+' · '+name,author:e.author,type:'online'});
  try{await librarySaveBinary(name,data,e.source,{title:e.title+' · '+name,author:e.author,license:e.license,page:e.page})}catch(saveErr){setLibraryStatus('Произведение открыто, но не сохранено: '+saveErr.message)}
 }else{
  const name=decodeURIComponent(selectedUrl.split('/').pop()||e.id+'.mid');await libraryLoadFile(name,data,await libraryContentId(data),{title:e.title,author:e.author||undefined,type:'online'});
  try{await librarySaveBinary(name,data,e.source,{title:e.title,author:current?.author||e.author,license:e.license,page:e.page})}catch(saveErr){setLibraryStatus('Произведение открыто, но не сохранено: '+saveErr.message)}
 }
 notify('Произведение открыто для изучения; сохранение зависит от доступа к браузерному хранилищу');}catch(err){setLibraryStatus('Не удалось загрузить '+(e.source==='MuseTrainer'||e.source==='ASAP Dataset'&&/\.(?:musicxml|xml|mxl)(?:$|\?)/i.test(e.url)?'MusicXML':'MIDI')+': '+err.message+'. Возможны CORS или недоступность файла. Открой оригинальный источник ↗, скачай файл и импортируй его через «Моя коллекция».');}finally{onlineBusy=false;$('onlineStatus').classList.remove('loading')}}
