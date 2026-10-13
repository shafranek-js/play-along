// MAE-04A: user-initiated MAESTRO v3.0.0 repertoire index and source-verified MIDI.
// Source performances: Google LLC, CC BY-NC-SA 4.0. Do not fabricate score/fingers.
const MAESTRO_SOURCE='MAESTRO v3.0.0';
const MAESTRO_HOME='https://magenta.tensorflow.org/datasets/maestro';
const MAESTRO_CSV=[
 'https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.csv',
 'https://huggingface.co/datasets/projectlosangeles/maestro-v3.0.0/resolve/main/maestro-v3.0.0.csv'
];
const MAESTRO_MIDI_ZIP='https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0-midi.zip';
const MAESTRO_SHA256='70470ee253295c8d2c71e6d9d4a815189e35c89624b76d22fce5a019d5dde12c';
const MAESTRO_ZIP_MAX=65*1024*1024,MAESTRO_ENTRY_MAX=5*1024*1024;
const MAESTRO_CACHE_KEY='maestro-v3-official-metadata-v1';
let maestroLive=[],maestroLoaded=false,maestroIndexLoading=null,maestroArchive=null,maestroArchiveLoading=null,maestroOpenBusy=false;
function maestroStatus(message){if($('maestroProgress'))$('maestroProgress').textContent=message}
function maestroSafePath(path){
 return typeof path==='string'&&path.length<500&&/^[\x20-\x7e]+\.midi?$/i.test(path)&&
  !path.startsWith('/')&&!path.includes('\\')&&!path.includes(':')&&
  !path.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'));
}
function maestroParseIndex(csv){
 if(typeof csv!=='string'||csv.length>1_000_000)throw Error('Слишком большой или некорректный CSV MAESTRO');
 const records=asapCsvRows(csv);
 const columns=records.shift()?.map(s=>s.trim().replace(/^\uFEFF/,''));
 const required=['canonical_composer','canonical_title','split','year','midi_filename','audio_filename','duration'];
 if(!columns||required.some(k=>!columns.includes(k)))throw Error('CSV MAESTRO не содержит обязательных полей');
 const lookup=k=>columns.indexOf(k),seen=new Set(),counts={train:0,validation:0,test:0},result=[];
 for(const row of records){
  if(row.length!==columns.length)throw Error('Некорректная строка каталога MAESTRO');
  const author=row[lookup('canonical_composer')].trim(),title=row[lookup('canonical_title')].trim();
  const split=row[lookup('split')],filename=row[lookup('midi_filename')],year=Number(row[lookup('year')]),duration=Number(row[lookup('duration')]);
  if(!author||!title||author.length>300||title.length>500||!maestroSafePath(filename)||seen.has(filename)||
     !Object.hasOwn(counts,split)||!Number.isInteger(year)||year<2000||year>2020||!Number.isFinite(duration)||
     duration<=0||duration>20000)throw Error('Некорректные метаданные MAESTRO');
  seen.add(filename);counts[split]++;
  result.push({id:'maestro:'+filename,title,author,year,split,duration,
   midiPath:filename,source:MAESTRO_SOURCE,format:'MIDI',
   instrument:'Piano · '+year+' · концертное исполнение',
   license:'CC BY-NC-SA 4.0 · Google LLC',page:MAESTRO_HOME});
 }
 if(result.length!==1276||counts.train!==962||counts.validation!==137||counts.test!==177)
  throw Error('Каталог MAESTRO v3 не прошёл проверку 1276 / 962 / 137 / 177');
 return result;
}
async function maestroDownloadMetadata(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(url,{mode:'cors',cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(Number(response.headers.get('content-length')||0)>1_000_000)throw Error('Слишком большие метаданные');
  const csv=await response.text();
  return maestroParseIndex(csv);
 }finally{clearTimeout(timer)}
}
async function maestroLoadIndex(force=false){
 if(maestroIndexLoading)return maestroIndexLoading;
 maestroIndexLoading=(async()=>{
  try{
   if(!force){
    const cache=await mutopiaCacheRead(MAESTRO_CACHE_KEY).catch(()=>null);
    if(cache?.entries?.length===1276){
     // Treat persisted records as untrusted: use only whitelisted fields.
     const paths=new Set(),valid=cache.entries.every(e=>e&&e.source===MAESTRO_SOURCE&&maestroSafePath(e.midiPath)&&
       !paths.has(e.midiPath)&&(paths.add(e.midiPath),true)&&typeof e.title==='string'&&typeof e.author==='string'&&
       typeof e.page==='string'&&e.page===MAESTRO_HOME);
     if(valid){
      maestroLive=cache.entries;maestroLoaded=true;
      maestroStatus('Каталог из кэша: 1 276 исполнений. Выберите запись для загрузки MIDI (~56 МБ при первом открытии).');
      renderLibrary();return maestroLive;
     }
    }
   }
   maestroStatus('Загружаю официальный каталог MAESTRO v3.0.0…');
   let index=null,errors=[];
   for(const url of MAESTRO_CSV){
    try{index=await maestroDownloadMetadata(url);break}catch(e){errors.push(e.message)}
   }
   if(!index)throw Error(errors.join(' · ')||'Сетевой каталог недоступен');
   maestroLive=index;maestroLoaded=true;renderLibrary();
   maestroStatus('1 276 записей MAESTRO. Щелчок по записи загрузит официальный MIDI-архив при необходимости. MIDI не содержит проверенных пальцев.');
   void mutopiaCacheWrite(MAESTRO_CACHE_KEY,{entries:index,updated:Date.now()}).catch(()=>{});
   return index;
  }catch(e){
   maestroStatus('Каталог MAESTRO недоступен: '+e.message+'. Проверь соединение и повтори загрузку.');
   throw e;
  }finally{maestroIndexLoading=null}
 })();
 return maestroIndexLoading;
}
async function maestroDigest(buffer){
 if(!globalThis.crypto?.subtle)throw Error('Для проверки SHA256 нужен HTTPS или localhost');
 const raw=await crypto.subtle.digest('SHA-256',buffer);
 return [...new Uint8Array(raw)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function maestroZipDirectory(buffer){
 const data=new Uint8Array(buffer),view=new DataView(buffer);
 if(data.length<22||data.length>MAESTRO_ZIP_MAX)throw Error('Размер ZIP MAESTRO не соответствует ожидаемому');
 const u16=i=>view.getUint16(i,true),u32=i=>view.getUint32(i,true);
 let end=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){
  if(u32(i)===0x06054b50&&i+22+u16(i+20)===data.length){end=i;break}
 }
 if(end<0||u16(end+4)!==0||u16(end+6)!==0)throw Error('Не найден корректный ZIP-каталог');
 const count=u16(end+10),dirSize=u32(end+12),dirStart=u32(end+16);
 if(count<1276||count>1500||dirStart+dirSize>end)throw Error('Некорректное число или размер ZIP-записей');
 let cursor=dirStart,entries=new Map(),midiCount=0;
 for(let n=0;n<count;n++){
  if(cursor+46>dirStart+dirSize||u32(cursor)!==0x02014b50)throw Error('Некорректный центральный каталог ZIP');
  const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),packed=u32(cursor+20),
   unpacked=u32(cursor+24),nameLength=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32),local=u32(cursor+42);
  if(cursor+46+nameLength+extra+comment>dirStart+dirSize)throw Error('Неполный центральный каталог ZIP');
  const filename=new TextDecoder().decode(data.subarray(cursor+46,cursor+46+nameLength));
  cursor+=46+nameLength+extra+comment;
  if(!filename||filename.includes('\\')||filename.startsWith('/')||filename.split('/').some(part=>part==='..'||part==='.'))
   throw Error('Недопустимый путь внутри архива');
  if((flags&1)||(flags&0x40)||![0,8].includes(method)||packed>MAESTRO_ENTRY_MAX||unpacked>MAESTRO_ENTRY_MAX)
   throw Error('Недопустимая запись ZIP MAESTRO');
  if(entries.has(filename))throw Error('Повторяющаяся запись ZIP');
  if(/\.midi?$/i.test(filename))midiCount++;
  entries.set(filename,{method,packed,unpacked,crc,local,filename});
 }
 if(cursor!==dirStart+dirSize||midiCount!==1276)throw Error('В архиве отсутствуют MIDI-файлы MAESTRO v3.0.0');
 return entries;
}
async function maestroUseArchive(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>MAESTRO_ZIP_MAX)throw Error('Некорректный или слишком большой архив MAESTRO');
 maestroStatus('Проверяю SHA256 исходного архива MAESTRO…');
 if(await maestroDigest(buffer)!==MAESTRO_SHA256)throw Error('Контрольная сумма MAESTRO не совпала. Файл не используется.');
 const entries=maestroZipDirectory(buffer);
 maestroArchive={buffer,entries};maestroStatus('Официальный архив MAESTRO проверен. Можно открывать исполнения.');
 return maestroArchive;
}
async function maestroFetchArchive(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
 try{
  const response=await fetch(MAESTRO_MIDI_ZIP,{mode:'cors',cache:'force-cache',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(Number(response.headers.get('content-length')||0)>MAESTRO_ZIP_MAX)throw Error('Слишком большой ответ архива');
  if(!response.body)return maestroUseArchive(await response.arrayBuffer());
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
   while(true){
    const {done,value}=await reader.read();if(done)break;
    total+=value.length;if(total>MAESTRO_ZIP_MAX)throw Error('Превышен безопасный размер архива');
    chunks.push(value);
    if(total%4_000_000<value.length)maestroStatus('Загружаю архив MAESTRO: '+(total/1048576).toFixed(1)+' МБ / 55.7 МБ…');
   }
  }finally{reader.releaseLock()}
  const all=new Uint8Array(total);let pos=0;
  for(const chunk of chunks){all.set(chunk,pos);pos+=chunk.length}
  return await maestroUseArchive(all.buffer);
 }finally{clearTimeout(timer)}
}
async function maestroEnsureArchive(){
 if(maestroArchive)return maestroArchive;
 if(maestroArchiveLoading)return maestroArchiveLoading;
 maestroStatus('Первое открытие: загружаю 56-МБ официальный MIDI ZIP Google. Повторно в этой вкладке не понадобится.');
 maestroArchiveLoading=maestroFetchArchive();
 try{return await maestroArchiveLoading}finally{maestroArchiveLoading=null}
}
function maestroCRC32(bytes){
 let c=0xffffffff;
 for(const value of bytes){c^=value;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1}
 return (c^0xffffffff)>>>0;
}
async function maestroExtractMidi(entry){
 const archive=maestroArchive;
 if(!archive)throw Error('Сначала подключите архив MAESTRO');
 if(!maestroSafePath(entry.midiPath))throw Error('Недопустимый путь MIDI');
 const key='maestro-v3.0.0/'+entry.midiPath;
 const file=archive.entries.get(key)||archive.entries.get(entry.midiPath);
 if(!file)throw Error('MIDI отсутствует в проверенном архиве: '+entry.midiPath);
 const view=new DataView(archive.buffer),bytes=new Uint8Array(archive.buffer);
 if(file.local+30>bytes.length||view.getUint32(file.local,true)!==0x04034b50)throw Error('Некорректный заголовок ZIP');
 const n=view.getUint16(file.local+26,true),extra=view.getUint16(file.local+28,true);
 const name=new TextDecoder().decode(bytes.subarray(file.local+30,file.local+30+n));
 if(name!==file.filename)throw Error('Несовпадение имени MIDI в ZIP');
 const offset=file.local+30+n+extra;
 if(offset+file.packed>bytes.length||offset+file.packed>bytes.length-22)throw Error('Повреждённые границы ZIP');
 let result=bytes.slice(offset,offset+file.packed);
 if(file.method===8)result=await zipInflateBounded(result,MAESTRO_ENTRY_MAX,'MAESTRO');
 if(result.length!==file.unpacked||maestroCRC32(result)!==file.crc||
    result.length<14||new TextDecoder().decode(result.subarray(0,4))!=='MThd')
  throw Error('Повреждённая или не-MIDI запись MAESTRO');
 return result.buffer;
}
async function maestroOpen(e){
 if(maestroOpenBusy)return;
 maestroOpenBusy=true;
 try{
  if(!maestroLoaded||!maestroLive.some(x=>x.id===e.id))throw Error('Сначала загрузите каталог MAESTRO');
  await maestroEnsureArchive();
  maestroStatus('Открываю исполнение '+e.title+'…');
  const data=await maestroExtractMidi(e),name=e.midiPath.split('/').pop(),id=await libraryContentId(data);
  await libraryLoadFile(name,data,id,{title:e.title+' · '+e.year,author:e.author,type:'online'});
  try{await librarySaveBinary(name,data,MAESTRO_SOURCE,{title:e.title+' · '+e.year,author:e.author,license:e.license,page:e.page})}
  catch(err){maestroStatus('MIDI открыт, но не сохранён в коллекцию: '+err.message);return}
  maestroStatus('Открыто: '+e.title+'. Это концертное MIDI, авторской аппликатуры и MusicXML нет.');
  renderLibrary();
 }catch(err){
  maestroStatus('Не удалось открыть MAESTRO: '+err.message+'. При проблеме загрузки выберите официальный ZIP с диска.');
 }finally{maestroOpenBusy=false}
}
async function maestroImportZipFile(file){
 if(!file)return;
 try{
  if(file.size>MAESTRO_ZIP_MAX)throw Error('Архив превышает 65 МБ');
  await maestroUseArchive(await file.arrayBuffer());
 }catch(e){maestroStatus('Не удалось подключить ZIP: '+e.message)}
 finally{$('maestroZipFile').value=''}
}
