async function zipInflateBounded(data,maxBytes,label='ZIP'){
 if(typeof DecompressionStream==='undefined')throw Error('Для распаковки '+label+' необходим современный браузер');
 const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
 const chunks=[];let total=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;
   total+=value.byteLength;if(total>maxBytes){await reader.cancel().catch(()=>{});throw Error(label+': распакованный файл превышает лимит '+Math.floor(maxBytes/1048576)+' МБ')}
   chunks.push(value);
  }
  const buffer=new Uint8Array(total);let at=0;for(const c of chunks){buffer.set(c,at);at+=c.length}return buffer;
 }finally{reader.releaseLock()}
}
// Version 3 separates small searchable metadata from musical binary data.
// The upgrade migrates old v1/v2 records one-by-one inside the SAME atomic
// IndexedDB upgrade transaction; binary records remain completely unchanged.
function libraryEntryMetadata(entry){
 const {data,...meta}=entry;
 return {...meta,dataSize:data?.byteLength??entry.dataSize??0};
}
function libraryDB(){return new Promise((resolve,reject)=>{
 const q=indexedDB.open(LIBRARY_DB_V08,3);
 q.onupgradeneeded=()=>{
  const db=q.result,tx=q.transaction;
  if(!db.objectStoreNames.contains('works'))db.createObjectStore('works',{keyPath:'id'});
  if(!db.objectStoreNames.contains('prefs'))db.createObjectStore('prefs');
  if(!db.objectStoreNames.contains('performances')){
   const records=db.createObjectStore('performances',{keyPath:'id'});
   records.createIndex('profile','profile',{unique:false});
  }
  if(!db.objectStoreNames.contains('workIndex')){
   const index=db.createObjectStore('workIndex',{keyPath:'id'});
   const cursor=tx.objectStore('works').openCursor();
   cursor.onsuccess=()=>{
    const record=cursor.result;
    if(record){index.put(libraryEntryMetadata(record.value));record.continue()}
   };
  }
 };
 q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Закрой другие вкладки Play Along, чтобы обновить хранилище'));
})}
async function libraryTransaction(store,mode,run){const db=await libraryDB();try{return await new Promise((resolve,reject)=>{let t=db.transaction(store,mode),q=run(t.objectStore(store));t.oncomplete=()=>resolve(q?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('Операция с библиотекой отменена'));})}finally{db.close()}}
// Coverage is lightweight INDEX metadata. Never store the entire XML or the
// MIDI events in workIndex. An unread legacy score is UNKNOWN, not "none".
let libraryCoverageBackfillStarted=false,libraryCoverageChecked=0,libraryCoveragePending=0;
async function libraryCoverageStore(song,id){
 const found=collectionIndex.find(e=>e.id===id);
 if(!found||!song)return;
 const key=fingerOverrideWorkKey(song);
 const coverage=fingeringCoverageFromSong(song,key?state.fingerOverrides?.[key]:null);
 if(!fingeringCoverageValid(coverage))return;
 const currentMeta=collectionIndex.find(e=>e.id===id);
 if(!currentMeta||JSON.stringify(currentMeta.fingeringCoverage)===JSON.stringify(coverage))return;
 const updated={...currentMeta,fingeringCoverage:coverage};
 await libraryTransaction('workIndex','readwrite',store=>store.put(updated));
 collectionIndex=collectionIndex.map(e=>e.id===id?updated:e);
 renderLibrary();
}
async function libraryCoverageBackfill(){
 if(libraryCoverageBackfillStarted)return;
 libraryCoverageBackfillStarted=true;
 const missing=collectionIndex.filter(e=>!fingeringCoverageValid(e.fingeringCoverage)&&
  !['mid','midi'].includes(String(e.format||'').toLowerCase()));
 libraryCoveragePending=missing.length;libraryCoverageChecked=0;
 renderLibrary();
 for(const entry of missing){
  try{
   // An untrusted/malformed score must not be indexed as having no fingering.
   const binary=await libraryReadBinary(entry.id);
   const song=await songFromBuffer(binary.name,binary.data);
   await libraryCoverageStore(song,entry.id);
  }catch(err){
   console.warn('Fingering metadata not indexed for',entry.id,err?.message||err);
  }
  libraryCoverageChecked++;
  // Cede the browser main thread between files; no remote catalog is fetched.
  if(libraryCoverageChecked%3===0||libraryCoverageChecked===missing.length)renderLibrary();
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 libraryCoveragePending=0;renderLibrary();
}
async function loadLibraryIndex(){
 try{
  collectionIndex=await libraryTransaction('workIndex','readonly',s=>s.getAll())||[];
  favoritesV08=new Set(await libraryTransaction('prefs','readonly',s=>s.get('favorites'))||[]);
  collectionReady=true;renderLibrary();
  // Existing v3 records have no coverage; upgrade metadata progressively.
  // Keep the same IndexedDB schema and never rewrite original binary works.
  void libraryCoverageBackfill().catch(e=>console.warn('Coverage scan failed',e));
 }catch(e){collectionReady=true;setLibraryStatus('Браузер не разрешил доступ к библиотеке: '+e.message);renderLibrary()}
}
// Binary payloads are requested only when a user opens an individual piece.
async function libraryReadBinary(id){
 const entry=await libraryTransaction('works','readonly',store=>store.get(id));
 if(!entry||!entry.data)throw Error('Сохранённое произведение не найдено. Проверь коллекцию или восстанови резервную копию.');
 return entry;
}
async function libraryWriteWork(entryOrId,remove=false){
 const db=await libraryDB();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(['works','workIndex'],'readwrite');
   const works=tx.objectStore('works'),index=tx.objectStore('workIndex');
   let abortReason=null;
   if(remove){works.delete(entryOrId);index.delete(entryOrId)}
   else {
    const request=works.get(entryOrId.id);
    request.onsuccess=()=>{
     const present=request.result;
     if(present&&!libraryBuffersEqual(present.data,entryOrId.data)){
      abortReason=new Error('Конфликт ID музыкального файла '+entryOrId.id+': исходный файл сохранён без изменений.');
      console.error('Different musical bytes share the same ID; keeping existing work',entryOrId.id);
      tx.abort();return;
     }
     works.put(entryOrId);index.put(libraryEntryMetadata(entryOrId));
    };
   }
   tx.oncomplete=()=>resolve(true);
   tx.onerror=()=>reject(abortReason??tx.error??new Error('Ошибка сохранения музыкального файла'));
   tx.onabort=()=>reject(abortReason??tx.error??new Error('Сохранение музыкального файла отменено'));
  });
 }finally{db.close()}
}
// Legacy FNV IDs remain addressable for existing collection items and backups.
function libraryBinaryId(buffer){const arr=new Uint8Array(buffer);let h=2166136261;for(let i=0;i<arr.length;i++)h=Math.imul(h^arr[i],16777619)>>>0;return 'saved-'+h.toString(16)+'-'+arr.length}
function libraryBuffersEqual(a,b){
 if(!a||!b)return false;
 const left=new Uint8Array(a),right=new Uint8Array(b);
 if(left.length!==right.length)return false;
 for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;
 return true;
}
async function libraryStrongId(buffer){
 if(!globalThis.crypto?.subtle)throw Error('SHA-256 недоступен: открой Play Along по HTTPS или localhost');
 const digest=await crypto.subtle.digest('SHA-256',buffer);
 return 'saved-sha256-'+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function libraryContentId(buffer){
 const oldId=libraryBinaryId(buffer);
 const existing=await libraryTransaction('works','readonly',store=>store.get(oldId));
 // Re-importing an old saved file MUST retain its original ID and settings.
 if(existing&&libraryBuffersEqual(existing.data,buffer))return oldId;
 return libraryStrongId(buffer);
}
async function libraryMatchesContentId(buffer,id){
 if(/^saved-[a-f0-9]{1,8}-[0-9]+$/.test(id))return id===libraryBinaryId(buffer);
 if(/^saved-sha256-[a-f0-9]{64}$/.test(id))return id===await libraryStrongId(buffer);
 return false;
}
async function librarySaveBinary(name,buffer,origin,details={}){
 if(buffer.byteLength>15*1024*1024)throw Error('Файл превышает 15 МБ');
 const id=await libraryContentId(buffer);
 const existing=await libraryTransaction('works','readonly',store=>store.get(id));
 if(existing&&libraryBuffersEqual(existing.data,buffer))return existing;
 const coverage=current?.id===id?fingeringCoverageFromSong(current,
  (fingerOverrideWorkKey(current)?state.fingerOverrides?.[fingerOverrideWorkKey(current)]:null)):null;
 const entry={id,name,title:details.title||name.replace(/\.(mid|midi|xml|musicxml|mxl|mscx|mscz)$/i,''),
  author:details.author||'Пользовательская коллекция',format:name.toLowerCase().split('.').pop(),
  origin,license:details.license||'',page:details.page||'',added:Date.now(),
  ...(fingeringCoverageValid(coverage)?{fingeringCoverage:coverage}:{}),data:buffer};
 await libraryWriteWork(entry);
 collectionIndex=collectionIndex.filter(e=>e.id!==id).concat(libraryEntryMetadata(entry));
 renderLibrary();return entry;
}
async function libraryRemoveEntry(id){await libraryWriteWork(id,true);collectionIndex=collectionIndex.filter(e=>e.id!==id);delete state.songSettings[id];if(state.selected===id)state.selected='demo-scale';persist();renderLibrary()}
async function libraryFavorite(id){if(favoritesV08.has(id))favoritesV08.delete(id);else favoritesV08.add(id);try{await libraryTransaction('prefs','readwrite',s=>s.put([...favoritesV08],'favorites'))}catch(e){setLibraryStatus('Не удалось сохранить избранное: '+e.message)}renderLibrary()}
function setLibraryStatus(s){$('onlineStatus').textContent=s}
function libraryExt(name){return (name.split('.').pop()||'').toLowerCase()}
function isSupportedFile(name){return /\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i.test(name)}
function libraryTitleFile(filename){return filename.replace(/\.(mid|midi|musicxml|xml|mxl|mscx|mscz)$/i,'')}
function xmlDirect(parent,name){return [...parent?.children||[]].find(x=>x.localName===name)||null}
function xmlList(parent,name){return [...parent?.children||[]].filter(x=>x.localName===name)}
function xmlText(parent,name,def=''){return xmlDirect(parent,name)?.textContent?.trim()||def}
// Remove the standard MusicXML DOCTYPE before DOMParser (no network/DTD evaluation).
// A limited set of literal internal entities is expanded safely, without recursion.
// External, parameter, recursive or very large entities are never resolved.
function musicSafeXml(xmlString){
 const where=xmlString.search(/<!DOCTYPE\b/i);
 if(where<0){
  if(/<!ENTITY\b/i.test(xmlString))throw Error('XML: ENTITY вне DTD не поддерживается');
  return xmlString;
 }
 if(xmlString.slice(where+9).search(/<!DOCTYPE\b/i)>=0)throw Error('XML: несколько DOCTYPE недопустимы');
 let quote='',inside=0,end=-1;
 for(let i=where+9;i<xmlString.length;i++){
  const c=xmlString[i];
  if(quote){if(c===quote)quote='';continue}
  if(c==='"'||c==="'"){quote=c;continue}
  if(c==='[')inside++;
  else if(c===']')inside=Math.max(0,inside-1);
  else if(c==='>'&&inside===0){end=i+1;break}
 }
 if(end<0)throw Error('XML: объявление DOCTYPE повреждено');
 const declaration=xmlString.slice(where,end);
 const start=/^<!DOCTYPE\s+([\w:.-]+)/i.exec(declaration);
 if(!start)throw Error('XML: некорректное объявление DOCTYPE');
 const first=declaration.indexOf('['),last=declaration.lastIndexOf(']');
 const subset=first>=0&&last>first?declaration.slice(first+1,last):'';
 const definitions=new Map();
 if(subset){
  if(/<!ENTITY\s*%|%[\w.-]+;|<!ENTITY\s+[\w:.-]+\s+(?:SYSTEM|PUBLIC)\b/i.test(subset))
   throw Error('XML: внешние и параметрические ENTITY запрещены. Экспортируй MusicXML без внешних сущностей.');
  const declarations=[...subset.matchAll(/<!ENTITY\s+([A-Za-z_][\w.:-]*)\s+(["'])([\s\S]*?)\2\s*>/gi)];
  if(declarations.length>32)throw Error('XML: превышен лимит 32 простых ENTITY');
  for(const match of declarations){
   if(match[3].length>256||match[3].includes('<')||/&(?!#\d+;|#x[0-9a-f]+;|amp;|lt;|gt;|quot;|apos;)/i.test(match[3]))
    throw Error('XML: сложная или вложенная ENTITY не поддерживается');
   const decoded=match[3].replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(full,num,special)=>{
    if(num){const n=num[0].toLowerCase()==='x'?parseInt(num.slice(1),16):Number(num);if(!n||n>0x10ffff||(n>=0xd800&&n<=0xdfff))throw Error('XML: неверный символ в ENTITY');return String.fromCodePoint(n)}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[special.toLowerCase()];
   });
   definitions.set(match[1],decoded);
  }
  const left=subset.replace(/<!ENTITY\s+[A-Za-z_][\w.:-]*\s+(["'])([\s\S]*?)\1\s*>/gi,'').replace(/<!--[^]*?-->/g,'').trim();
  // Other DTD declarations (<ELEMENT>, <ATTLIST>) can be ignored by the parser.
  if(/<!ENTITY\b/i.test(left)||/<!\[|\]\]>/i.test(left))throw Error('XML: сложная DTD-сущность не поддерживается');
 }
 let clean=xmlString.slice(0,where)+xmlString.slice(end);
 if(definitions.size){
  let count=0,total=0;
  clean=clean.replace(/&([A-Za-z_][\w.:-]*);/g,(all,name)=>{
   if(!definitions.has(name))return all;
   const value=definitions.get(name);
   if(++count>5000||(total+=value.length)>65000)throw Error('XML: превышен лимит раскрытия ENTITY');
   return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  });
 }
 return clean;
}
// Expand only unambiguous MusicXML forward/backward repeats, keeping all
// parts on the same unrolled playback timeline. The returned notation is the
// expanded sequence so OSMD's cursor, Piano Roll and sound agree.
// Unsupported voltas, nested repeats and navigation marks remain untouched.
// Support the common 1st/2nd ending form only: repeat two passes, skip
// the first ending on pass 2, play the second ending, then continue normally.
// The entire playback order is unfolded identically in all parts and OSMD.
// Do not unfold passages whose repeated execution would inherit incorrect
// divisions/meter/transposition/key or tempo from the previous pass.
// Until measure-state materialization is implemented, explicit warnings are
// safer than publishing a score with silently shortened or shifted notes.
function musicRepeatNeedsStateRestore(parts,sequence){
 // At a backward jump, state inherited from the FIRST ending matters even
 // when that measure itself is visited just once. Inspect every measure
 // between the jump target and the measure we are leaving.
 const revisit=new Set();
 for(let i=1;i<sequence.length;i++)if(sequence[i]<=sequence[i-1]){
  for(let j=sequence[i];j<=sequence[i-1];j++)revisit.add(j);
 }
 for(const part of parts){
  const measures=xmlList(part,'measure');
  for(const index of revisit){
   const measure=measures[index];
   if(!measure)continue;
   if(index!==0&&xmlList(measure,'attributes').length)return true;
   if(index!==0&&xmlList(measure,'sound').some(sound=>sound.hasAttribute('tempo')))return true;
   if(index!==0&&xmlList(measure,'direction').some(direction=>{
    const sound=xmlDirect(direction,'sound');
    return !!(sound?.hasAttribute('tempo')||xmlDirect(xmlDirect(direction,'direction-type'),'metronome'));
   }))return true;
  }
 }
 return false;
}
function musicExpandTwoEndings(doc){
 const root=doc.documentElement,parts=xmlList(root,'part'),measures=xmlList(parts[0],'measure');
 const decline=reason=>({expanded:false,warning:'Репризы не развёрнуты: '+reason});
 const n=measures.length;
 if(!n||n>600||parts.some(p=>xmlList(p,'measure').length!==n))
  return decline('слишком много тактов или различная структура партий.');
 const unsupported=[...root.getElementsByTagName('*')].some(x=>{
  if(['segno','coda','dalsegno','dacapo','tocoda','fine'].includes(x.localName.toLowerCase()))return true;
  return x.localName==='sound'&&['dacapo','dalsegno','segno','coda','tocoda','fine'].some(attr=>x.hasAttribute(attr));
 });
 if(unsupported)return decline('D.C./D.S., коды и переходы не поддерживаются в вольтах.');
 const scan=part=>xmlList(part,'measure').map(m=>{
  const bars=xmlList(m,'barline');
  return {
   forward:bars.flatMap(b=>xmlList(b,'repeat')).filter(x=>x.getAttribute('direction')==='forward'),
   backward:bars.flatMap(b=>xmlList(b,'repeat')).filter(x=>x.getAttribute('direction')==='backward'),
   endings:bars.flatMap(b=>xmlList(b,'ending')).map(x=>({number:x.getAttribute('number')||'',type:x.getAttribute('type')||''}))
  };
 });
 const marks=scan(parts[0]);
 const forwards=[],backwards=[],firstStarts=[],firstStops=[],secondStarts=[],secondStops=[];
 for(let i=0;i<n;i++){
  const m=marks[i];
  if(m.forward.length>1||m.backward.length>1)return decline('повреждённая разметка повторов.');
  if(m.forward.length)forwards.push(i);
  if(m.backward.length)backwards.push(i);
  for(const e of m.endings){
   if(!['1','2'].includes(e.number)||!['start','stop','discontinue'].includes(e.type))
    return decline('поддерживаются только первая и вторая вольты без объединённых номеров.');
   const list=e.number==='1'
    ?(e.type==='start'?firstStarts:firstStops)
    :(e.type==='start'?secondStarts:secondStops);
   list.push(i);
  }
 }
 if(forwards.length>1||backwards.length!==1||firstStarts.length!==1||firstStops.length!==1||secondStarts.length!==1||secondStops.length!==1)
  return decline('ожидается одна пара вольт с полными метками начала и окончания.');
 const backward=backwards[0],start=forwards.length?forwards[0]:0;
 const first=firstStarts[0],endFirst=firstStops[0],second=secondStarts[0],endSecond=secondStops[0];
 const raw=marks[backward].backward[0].getAttribute('times');
 if(raw!==null&&Number(raw)!==2)return decline('первый и второй варианты окончания требуют ровно два прохода.');
 if(start>=backward||first<=start||first>backward||endFirst!==backward||second!==backward+1||endSecond<second)
  return decline('вольты должны следовать непосредственно друг за другом после репризы.');
 if(marks.slice(second).some(m=>m.forward.length||m.backward.length))
  return decline('дополнительные репризы после второй вольты пока не поддерживаются.');
 // Secondary parts may omit repeat symbols. If present, however, they
 // must agree with the authoritative first part; no discordant ending labels.
 for(const part of parts.slice(1)){
  const other=scan(part);
  for(let i=0;i<n;i++){
   if((other[i].forward.length&&!marks[i].forward.length)||(other[i].backward.length&&!marks[i].backward.length))
    return decline('репризы различаются между партиями.');
   if(other[i].backward.length){
    const otherTimes=other[i].backward[0].getAttribute('times');
    if(otherTimes!==null&&Number(otherTimes)!==2)return decline('количество повторов различается между партиями.');
   }
   for(const e of other[i].endings)
    if(!marks[i].endings.some(x=>x.number===e.number&&x.type===e.type))
     return decline('разметка вольт различается между партиями.');
  }
 }
 // Prefix includes the first pass and its first ending. On pass 2 the
 // first ending is omitted and the second ending is played instead.
 const sequence=[
  ...Array.from({length:backward+1},(_,i)=>i),
  ...Array.from({length:first-start},(_,i)=>start+i),
  ...Array.from({length:n-second},(_,i)=>second+i)
 ];
 if(sequence.length>1200)return decline('слишком длинная исполняемая последовательность.');
 if(musicRepeatNeedsStateRestore(parts,sequence))
  return decline('изменения divisions/размера/темпа внутри репризы требуют восстановления музыкального состояния перед следующим проходом.');
 for(const part of parts){
  const written=xmlList(part,'measure');
  const expanded=sequence.map((index,position)=>{
   const clone=written[index].cloneNode(true);clone.setAttribute('number',String(position+1));
   for(const barline of xmlList(clone,'barline')){
    for(const node of [...barline.children])
     if(node.localName==='repeat'||node.localName==='ending')node.remove();
    if(!barline.children.length)barline.remove();
   }
   return clone;
  });
  for(const measure of written)measure.remove();
  for(const measure of expanded)part.appendChild(measure);
 }
 return {expanded:true,written:n,played:sequence.length,endings:true};
}
function musicExpandSimpleRepeats(doc){
 const root=doc.documentElement,parts=xmlList(root,'part'),first=parts[0];
 if(!first)return {expanded:false};
 const measures=xmlList(first,'measure');
 if(measures.length>600)return {expanded:false,warning:'Слишком много тактов для разворачивания реприз.'};
 const markers=part=>{
  const ms=xmlList(part,'measure');
  return ms.map(m=>({
   forward:xmlList(m,'barline').some(b=>xmlList(b,'repeat').some(r=>r.getAttribute('direction')==='forward')),
   backward:xmlList(m,'barline').flatMap(b=>xmlList(b,'repeat')).find(r=>r.getAttribute('direction')==='backward')||null
  }));
 };
 const marks=markers(first);
 const hasRepeat=parts.some(p=>markers(p).some(x=>x.forward||x.backward));
 if(!hasRepeat)return {expanded:false};
 if(root.getElementsByTagName('ending').length)return musicExpandTwoEndings(doc);
 const decline=warning=>({expanded:false,warning:'Репризы не развёрнуты: '+warning});
 if(parts.some(p=>xmlList(p,'measure').length!==measures.length))return decline('число тактов различается между партиями.');
 const unsupported=[...root.getElementsByTagName('*')].some(node=>{
  const tag=node.localName.toLowerCase();
  if(tag==='ending'||tag==='segno'||tag==='coda'||tag==='dalsegno'||tag==='dacapo'||tag==='tocoda'||tag==='fine')return true;
  if(tag==='sound')return ['dacapo','dalsegno','segno','coda','tocoda','fine'].some(a=>node.hasAttribute(a));
  return false;
 });
 if(unsupported)return decline('вольты, D.C./D.S., коды и другие переходы требуют отдельной обработки.');
 for(const part of parts){
  const its=markers(part);
  for(let i=0;i<marks.length;i++){
   // In many files repeat barlines are omitted from secondary staves.
   if((its[i].forward&&!marks[i].forward)||(its[i].backward&&!marks[i].backward))
    return decline('разметка реприз различается между партиями.');
   if(its[i].backward&&marks[i].backward&&its[i].backward.getAttribute('times')!==marks[i].backward.getAttribute('times'))
    return decline('разные количества повторов в партиях.');
  }
 }
 let start=0,opened=false,hasBackward=false;
 const sequence=[];
 for(let i=0;i<marks.length;i++){
  const m=marks[i];
  if(m.forward){
   if(opened)return decline('вложенные репризы пока не поддерживаются.');
   opened=true;start=i;
  }
  sequence.push(i);
  if(m.backward){
   hasBackward=true;
   const raw=m.backward.getAttribute('times'),times=raw==null?2:Number(raw);
   if(!Number.isInteger(times)||times<2||times>4)return decline('число проходов должно быть от 2 до 4.');
   for(let pass=1;pass<times;pass++)for(let j=start;j<=i;j++)sequence.push(j);
   opened=false;start=i+1;
  }
  if(sequence.length>1200)return decline('слишком длинная исполняемая последовательность.');
 }
 if(opened||!hasBackward)return decline('неполная или несогласованная разметка повторов.');
 if(musicRepeatNeedsStateRestore(parts,sequence))
  return decline('изменения divisions/размера/темпа внутри репризы требуют восстановления музыкального состояния перед следующим проходом.');
 // Mutation only after complete validation: unsupported scores are untouched.
 for(const part of parts){
  const written=xmlList(part,'measure'),expanded=sequence.map((index,position)=>{
   const copy=written[index].cloneNode(true);
   copy.setAttribute('number',String(position+1));
   for(const barline of xmlList(copy,'barline')){
    for(const repeat of xmlList(barline,'repeat'))barline.removeChild(repeat);
    if(!barline.children.length)barline.remove();
   }
   return copy;
  });
  for(const measure of written)measure.remove();
  for(const measure of expanded)part.appendChild(measure);
 }
 return {expanded:true,written:measures.length,played:sequence.length};
}
// MusicXML score-partwise shares one measure grid across synchronized staves.
// The first score part is the temporal authority: another staff may omit
// redundant time signatures or trailing rests but must not drift from it.
// Canonical MusicXML meter adapter: beats and beat-type can occur as
// additive strings and multiple paired groups within one <time> element.
function musicXmlMeter(time,beats,beatType,warnings=null){
 if(!time)return {beats,beatType};
 const num=xmlList(time,'beats'),den=xmlList(time,'beat-type');
 if(!num.length||num.length!==den.length){
  warnings?.add('Нераспознанный музыкальный размер MusicXML; использован предыдущий.');
  return {beats,beatType};
 }
 const parsed=musicParseMeterGroups(num.map((n,i)=>({beats:n.textContent.trim(),beatType:den[i].textContent.trim()})));
 if(!parsed)warnings?.add('Неподдерживаемый музыкальный размер MusicXML; использован предыдущий.');
 return parsed||{beats,beatType};
}
function musicSharedBarStarts(measures,ppq){
 const frames=[];let divisions=1,beats=4,beatType=4;
 const ticks=value=>Math.round((Number(value)||0)/Math.max(1,divisions)*ppq);
 for(const measure of measures){
  let at=0,maxAt=0;
  for(const el of [...measure.children]){
   const tag=el.localName;
   if(tag==='attributes'){
    const nextDivisions=Number(xmlText(el,'divisions',divisions));
    if(nextDivisions>0)divisions=nextDivisions;
    const time=xmlDirect(el,'time');
    if(time)({beats,beatType}=musicXmlMeter(time,beats,beatType))
   }else if(tag==='backup')at=Math.max(0,at-ticks(xmlText(el,'duration','0')));
   else if(tag==='forward'){at+=ticks(xmlText(el,'duration','0'));maxAt=Math.max(maxAt,at)}
   else if(tag==='note'&&!xmlDirect(el,'chord')&&!xmlDirect(el,'grace')){
    at+=ticks(xmlText(el,'duration','0'));maxAt=Math.max(maxAt,at);
   }
  }
  frames.push({beats,beatType,occupied:maxAt/ppq,implicit:measure.getAttribute('implicit')==='yes'});
 }
 return musicBarGrid(frames).map(beat=>Math.round(beat*ppq));
}
function readMusicXML(xmlString,filename){
 if(xmlString.length>15e6)throw Error('MusicXML слишком велик для браузерного импорта');
 const safeXml=musicSafeXml(xmlString);
 const doc=new DOMParser().parseFromString(safeXml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Ошибка структуры XML');
 const root=doc.documentElement;if(root.localName!=='score-partwise')throw Error('Поддерживается MusicXML score-partwise (score-timewise пока нет)');
 const repeatExpansion=musicExpandSimpleRepeats(doc);
 const playbackXml=repeatExpansion.expanded?new XMLSerializer().serializeToString(doc):safeXml;
 const title=xmlText(xmlDirect(root,'work'),'work-title',xmlText(root,'movement-title',libraryTitleFile(filename)));
 const creator=[...root.getElementsByTagName('creator')].find(x=>x.getAttribute('type')==='composer');const author=creator?.textContent?.trim()||'MusicXML · импорт';
 const namesById={};for(const p of xmlList(xmlDirect(root,'part-list'),'score-part'))namesById[p.getAttribute('id')]=xmlText(p,'part-name','Партия');
 const segments=[],pianoGrandStaffParts=[],tempos=[{tick:0,tempo:500000}],ppq=10080;let warnings=new Set();
 // One MIDI port requires no routing: warn only if multiple distinct ports
 // coexist across score-part definitions or mid-measure sound declarations.
 const portSet=new Set();
 for(const def of xmlList(xmlDirect(root,'part-list'),'score-part')){
  const devices=xmlList(def,'midi-device');
  if(!devices.length)portSet.add('1');
  for(const d of devices)portSet.add(d.getAttribute('port')||'1');
 }
 for(const sound of [...root.getElementsByTagName('sound')]){
  for(const d of xmlList(sound,'midi-device'))
   portSet.add(d.getAttribute('port')||'1');
 }
 if(portSet.size>1)
  warnings.add('Порты MusicXML midi-device не разделяются; инструменты с разными портами могут звучать вместе.');
 const userExportMarker=xmlList(xmlDirect(xmlDirect(root,'identification'),'miscellaneous'),'miscellaneous-field')
  .some(x=>x.getAttribute('name')==='play-along-user-fingering');
 if(userExportMarker)warnings.add('В MusicXML есть отметка о пользовательских правках Play Along. Все номера пальцев из файла считаются неподтверждёнными: они НЕ используются как авторские подсказки. Чтобы включить подсказку, проверь и назначь палец и руку вручную в редакторе.');
 // MusicXML fingerings are optional authorial annotations (not inferred).
 // Preserve only a single unambiguous finger 1..5; never invent one.
 const authorFinger=(el)=>{
  const technical=xmlDirect(xmlDirect(el,'notations'),'technical');
  const annotations=xmlList(technical,'fingering');
  if(!annotations.length)return null;
  if(annotations.length!==1||annotations[0].getAttribute('alternate')==='yes'||annotations[0].getAttribute('substitution')==='yes'){
   warnings.add('Есть альтернативная или заменяемая аппликатура: такие обозначения пока не отображаются.');return null;
  }
  const value=annotations[0].textContent.trim();
  if(!/^[1-5]$/.test(value)){warnings.add('Некоторые обозначения пальцев MusicXML не распознаны (допустимы цифры 1–5).');return null;}
  return Number(value);
 };
 const partHand=(name)=>{
  if(/(?:\bright\s*hand\b|\bRH\b|mano\s+destra|main\s+droite)/i.test(name))return 'RH';
  if(/(?:\bleft\s*hand\b|\bLH\b|mano\s+sinistra|main\s+gauche)/i.test(name))return 'LH';
  return null;
 };if(repeatExpansion.expanded)warnings.add('Реприза развёрнута: '+repeatExpansion.written+' записанных тактов → '+repeatExpansion.played+' исполняемых. Партитура показывает каждый проход.');else if(repeatExpansion.warning)warnings.add(repeatExpansion.warning);
 const durationTicks=(duration,divisions)=>Math.round((Number(duration)||0)/Math.max(1,divisions)*ppq);
 // <sound> is legal both directly inside a measure and under <direction>.
 // It uses the same tick/offset semantics in both locations.
 const recordSoundTempo=(sound,direction,at,absolute,divisions,beats,beatType)=>{
  const embedded=xmlDirect(sound,'offset'),inDirection=xmlDirect(direction,'offset');
  const offset=embedded||inDirection;
  const audible=!!(embedded||inDirection?.getAttribute('sound')==='yes');
  const delta=audible&&offset?durationTicks(offset.textContent,divisions):0;
  const measureTicks=Math.round(beats*4/Math.max(1,beatType)*ppq);
  const tempoTick=absolute+Math.max(0,Math.min(measureTicks,at+delta));
  const bpm=Number(sound?.getAttribute('tempo'));
  if(bpm>0&&bpm<1000)tempos.push({tick:tempoTick,tempo:60000000/bpm});
  return {bpm,tempoTick};
 };
 const scoreParts=xmlList(root,'part');
 const scorePartDefs=new Map(xmlList(xmlDirect(root,'part-list'),'score-part').map(p=>[p.getAttribute('id'),p]));
 const usedAudioChannels=new Map(),reservedAudioChannels=new Set();let nextMelodicChannel=0;
 for(const def of scorePartDefs.values()){
  for(const instrument of [...xmlList(def,'midi-instrument'),...xmlList(def,'score-instrument').flatMap(x=>xmlList(x,'midi-instrument'))]){
   const channel=Number(xmlText(instrument,'midi-channel',''));
   if(Number.isInteger(channel)&&channel>=1&&channel<=16)reservedAudioChannels.add(channel-1);
  }
 }
 const allocateMelodicChannel=()=>{
  // Try a full MIDI channel cycle: automatic assignment skips channel 10, so
  // the number of candidate melodic channels is fifteen, not the loop bound.
  for(let tries=0;tries<16;tries++){
   const ch=nextMelodicChannel++%16;if(ch===9)continue;
   if(!usedAudioChannels.has(ch)&&!reservedAudioChannels.has(ch))return ch;
  }
  warnings.add('В партитуре больше 15 мелодических MIDI-инструментов: некоторые используют общий канал.');
  return 0;
 };
 const musicXmlPanController=(raw)=>{
  if(raw==='')return null;
  const degrees=Number(raw);
  if(!Number.isFinite(degrees)||degrees< -180||degrees>180){warnings.add('Недопустимый MusicXML pan пропущен.');return null;}
  // MusicXML defines -90/+90 as hard left/right and 0 as ahead. For the
  // rear half, fold the angle back toward center for stereo; this is a
  // projection to CC10, not surround rendering.
  if(Math.abs(degrees)>90)warnings.add('MusicXML pan позади слушателя спроецирован в стерео; объемное позиционирование не воспроизводится.');
  const lateral=Math.abs(degrees)<=90?degrees/90:Math.sign(degrees)*(180-Math.abs(degrees))/90;
  return Math.round((lateral+1)*63.5);
 };
 const audioEventTicks=[];let audioSequence=0;
 const addAudioTick=event=>{if(audioEventTicks.length>=100000)throw Error('В MusicXML слишком много аудиособытий для прототипа');audioEventTicks.push({...event,sequence:audioSequence++})};
 const counts=scoreParts.map(p=>xmlList(p,'measure').length);
 // Only synchronize when the parts contain matching measure counts. Scores
 // with genuinely different structures remain on the previous safe path.
 const sharedStarts=scoreParts.length>1&&counts.every(n=>n===counts[0])
  ?musicSharedBarStarts(xmlList(scoreParts[0],'measure'),ppq):null;
 if(scoreParts.length>1&&!sharedStarts)warnings.add('Число тактов различается между партиями: общая тактовая сетка не используется.');
 for(const [partIndex,part] of scoreParts.entries()){
  let absolute=0,divisions=1,transposition=0;let beats=4,beatType=4;
  const partId=part.getAttribute('id')||'part',partName=namesById[partId]||'Партия';
  const partDef=scorePartDefs.get(partId),configs=new Map();
  const midiInstruments=partDef?xmlList(partDef,'midi-instrument'):[];
  const scoreInstruments=partDef?xmlList(partDef,'score-instrument'):[];
  const makeConfig=(instrumentId,midi)=>{
   const midiChannelRaw=xmlText(midi,'midi-channel',''),midiChannel=Number(midiChannelRaw);
   let channel;
   if(Number.isInteger(midiChannel)&&midiChannel>=1&&midiChannel<=16)channel=midiChannel-1;
   else{
   if(midiChannelRaw!=='')warnings.add('В MusicXML MIDI-канал должен быть от 1 до 16; назначен канал автоматически.');
    channel=xmlDirect(midi,'midi-unpitched')?9:allocateMelodicChannel();
   }
   if(midiChannel===10&&!xmlDirect(midi,'midi-unpitched'))warnings.add('Мелодический инструмент MusicXML явно использует канал 10, обычно отведённый для ударных.');
   const programRaw=xmlText(midi,'midi-program','1'),programNumber=Number(programRaw);
   const program=Number.isInteger(programNumber)&&programNumber>=1&&programNumber<=128?programNumber-1:0;
   if(programRaw!==''&&(!Number.isInteger(programNumber)||programNumber<1||programNumber>128))warnings.add('Недопустимый MusicXML midi-program: использована программа 0.');
   const bankRaw=xmlText(midi,'midi-bank','1'),bankNumber=Number(bankRaw);
   const bank=Number.isInteger(bankNumber)&&bankNumber>=1&&bankNumber<=16384?bankNumber-1:0;
   if(bankRaw!==''&&(!Number.isInteger(bankNumber)||bankNumber<1||bankNumber>16384))warnings.add('Недопустимый MusicXML midi-bank: использован банк 0.');
   const config={id:instrumentId,channel,program,bankMSB:(bank>>7)&127,bankLSB:bank&127,isDrum:!!xmlDirect(midi,'midi-unpitched'),midiUnpitched:xmlDirect(midi,'midi-unpitched')?Number(xmlText(midi,'midi-unpitched',''))-1:null};
   if(config.midiUnpitched!=null&&(!Number.isInteger(config.midiUnpitched)||config.midiUnpitched<0||config.midiUnpitched>127)){warnings.add('Недопустимый MusicXML midi-unpitched: соответствующие ноты будут пропущены.');config.midiUnpitched=null;}
   const signature=[config.program,config.bankMSB,config.bankLSB,config.isDrum,xmlText(midi,'volume',''),xmlText(midi,'pan','')].join('/');
   if(usedAudioChannels.has(channel)&&usedAudioChannels.get(channel)!==signature)warnings.add('Несколько инструментов MusicXML используют канал '+(channel+1)+' с разными тембрами; для независимого звучания нужны дополнительные каналы.');
   else usedAudioChannels.set(channel,signature);
   addAudioTick({type:'programChange',tick:0,channel,track:null,sourceTrack:partIndex,program:config.program,bankMSB:config.bankMSB,bankLSB:config.bankLSB,isDrum:config.isDrum});
   const volumeRaw=xmlText(midi,'volume',''),volume=Number(volumeRaw);if(volumeRaw!==''&&Number.isFinite(volume)&&volume>=0&&volume<=100)addAudioTick({type:'cc',tick:0,channel,track:null,sourceTrack:partIndex,controller:7,value:Math.round(volume*127/100)});
   const panRaw=xmlText(midi,'pan',''),panValue=musicXmlPanController(panRaw);if(panValue!=null)addAudioTick({type:'cc',tick:0,channel,track:null,sourceTrack:partIndex,controller:10,value:panValue});
   configs.set(instrumentId,config);
  };
  if(scoreInstruments.length){
   for(const definition of scoreInstruments){
    const instrumentId=definition.getAttribute('id')||partId;
    const midi=midiInstruments.find(x=>x.getAttribute('id')===instrumentId)||xmlDirect(definition,'midi-instrument');
    makeConfig(instrumentId,midi);
   }
  }else if(midiInstruments.length){
   for(const midi of midiInstruments)makeConfig(midi.getAttribute('id')||partId,midi);
  }
  if(!configs.size)makeConfig(partId,null);
  const defaultInstrumentId=configs.keys().next().value,defaultConfig=configs.get(defaultInstrumentId);
  // Inter-port conflicts were checked globally; same-port declarations are harmless.
  const recordMidiSound=(sound,soundTick)=>{
   if(!sound)return;
   // Sound-local port changes are already included in the global conflict audit.
   if(xmlList(sound,'instrument-change').length)warnings.add('Смена виртуального инструмента MusicXML не применяется; сохраняется исходный тембр партии.');
   for(const midi of xmlList(sound,'midi-instrument')){
    const id=midi.getAttribute('id')||defaultInstrumentId,config=configs.get(id);
    if(!config){warnings.add('Элемент MusicXML sound ссылается на неизвестный ID инструмента: '+id+'.');continue;}
    const channelRaw=xmlText(midi,'midi-channel',''),channelValue=Number(channelRaw);
    if(channelRaw!==''&&(!Number.isInteger(channelValue)||channelValue<1||channelValue>16||channelValue-1!==config.channel))warnings.add('Переназначение MIDI-канала в середине партитуры не применяется; используется исходный канал.');
    const p=xmlText(midi,'midi-program',''),b=xmlText(midi,'midi-bank','');
    if(p){const n=Number(p);if(Number.isInteger(n)&&n>=1&&n<=128)config.program=n-1;else warnings.add('Недопустимый mid-score midi-program пропущен.');}
    if(b){const n=Number(b);if(Number.isInteger(n)&&n>=1&&n<=16384){const bank=n-1;config.bankMSB=(bank>>7)&127;config.bankLSB=bank&127;}else warnings.add('Недопустимый mid-score midi-bank пропущен.');}
    if(p||b)addAudioTick({type:'programChange',tick:soundTick,channel:config.channel,track:null,sourceTrack:partIndex,program:config.program,bankMSB:config.bankMSB,bankLSB:config.bankLSB,isDrum:config.isDrum});
    const volumeRaw=xmlText(midi,'volume',''),volume=Number(volumeRaw);if(volumeRaw!==''&&Number.isFinite(volume)&&volume>=0&&volume<=100)addAudioTick({type:'cc',tick:soundTick,channel:config.channel,track:null,sourceTrack:partIndex,controller:7,value:Math.round(volume*127/100)});
    const panRaw=xmlText(midi,'pan',''),panValue=musicXmlPanController(panRaw);if(panValue!=null)addAudioTick({type:'cc',tick:soundTick,channel:config.channel,sourceTrack:partIndex,track:null,controller:10,value:panValue});
   }
  };
  const staffNumbers=new Set(xmlList(part,'measure').flatMap(m=>[...m.getElementsByTagName('staff')].map(x=>x.textContent.trim())));
  const declaredStaves=Math.max(1,...xmlList(part,'measure').flatMap(m=>[...m.getElementsByTagName('staves')].map(x=>Number(x.textContent)||1)));
  const hasGrandStaff=declaredStaves>1||staffNumbers.size>1;
  const explicitHand=partHand(partName);
  // A two-staff PIANO part offers an editorial hand hypothesis, not
  // evidence of the performer's actual hands. Never extrapolate this
  // rule to arbitrary two-staff non-piano parts or multi-staff organs.
  const pianoTitle=[partName,...scoreInstruments.map(x=>xmlText(x,'instrument-name',''))].join(' ');
  const namedPiano=/(?:\b(?:piano|pianoforte|fortepiano|klavier|pno)\b|фортепиано|рояль)/i.test(pianoTitle);
  const programPiano=midiInstruments.some(x=>{
   const program=xmlText(x,'midi-program','');
   return /^(?:[1-8])$/.test(program);
  });
  if(!explicitHand&&declaredStaves===2&&staffNumbers.has('1')&&staffNumbers.has('2')&&
     [...staffNumbers].every(s=>s==='1'||s==='2')&&
     (namedPiano||programPiano)&&[...configs.values()].every(x=>!x.isDrum))
   pianoGrandStaffParts.push(partId);
  let sourceOrdinal=0;
  const voices=new Map();const ties=new Map();
  let measureIndex=0;
  for(const measure of xmlList(part,'measure')){
   if(sharedStarts)absolute=sharedStarts[measureIndex];
   let at=0,lastOnset=0,maxAt=0;
   for(const el of [...measure.children]){
    const tag=el.localName;
    if(tag==='attributes'){
     const d=Number(xmlText(el,'divisions',divisions));if(d>0)divisions=d;
     const ts=xmlDirect(el,'time');if(ts)({beats,beatType}=musicXmlMeter(ts,beats,beatType,warnings))
     const tr=xmlDirect(el,'transpose');if(tr){transposition=Number(xmlText(tr,'chromatic',0))+12*Number(xmlText(tr,'octave-change',0));if(transposition)warnings.add('Транспонирующие инструменты пересчитаны в звучащую высоту.')}
     continue;
    }
    if(tag==='backup'){at=Math.max(0,at-durationTicks(xmlText(el,'duration',0),divisions));continue}
    if(tag==='forward'){at+=durationTicks(xmlText(el,'duration',0),divisions);maxAt=Math.max(maxAt,at);continue}
    if(tag==='sound'){
     const {tempoTick}=recordSoundTempo(el,null,at,absolute,divisions,beats,beatType);
     recordMidiSound(el,tempoTick);
     continue;
    }
    if(tag==='direction'){
     const sound=xmlDirect(el,'sound');
     const {bpm,tempoTick}=recordSoundTempo(sound,el,at,absolute,divisions,beats,beatType);
     recordMidiSound(sound,tempoTick);
     const metr=xmlDirect(xmlDirect(el,'direction-type'),'metronome');const per=Number(xmlText(metr,'per-minute'));if(!bpm&&per>0){const unit=xmlText(metr,'beat-unit','quarter');const unitQuarter=({whole:4,half:2,quarter:1,eighth:.5,'16th':.25,'32nd':.125,'64th':.0625})[unit]||1;
      // MusicXML can specify a dotted beat unit, e.g. dotted quarter = 60
      // in 6/8. A dotted quarter occupies 1.5 ordinary quarter beats.
      const dots=Math.min(3,xmlList(metr,'beat-unit-dot').length);
      let dottedFactor=1;for(let j=1;j<=dots;j++)dottedFactor+=2**(-j);
      tempos.push({tick:tempoTick,tempo:60000000/(per*unitQuarter*dottedFactor)})}
     continue;
    }
    if(tag==='barline'){if(xmlDirect(el,'repeat'))warnings.add('Повторы MusicXML пока не разворачиваются: выполняется записанная последовательность тактов.');continue}
    if(tag!=='note')continue;
    const noteDur=durationTicks(xmlText(el,'duration',0),divisions);
    const chord=!!xmlDirect(el,'chord'),rest=!!xmlDirect(el,'rest'),grace=!!xmlDirect(el,'grace');
    const onset=chord?lastOnset:at;
    if(!chord){lastOnset=at;at+=noteDur;maxAt=Math.max(at,maxAt)}
    if(rest||grace){if(grace)warnings.add('Форшлаги/украшения пропущены.');continue}
    const sourceInstruments=xmlList(el,'instrument');
    if(sourceInstruments.length>1)warnings.add('Нота MusicXML назначена нескольким инструментам; воспроизводится первое назначение.');
    else if(!sourceInstruments.length&&configs.size>1)warnings.add('Ноты MusicXML без instrument ID не различают несколько объявленных инструментов; использован первый.');
    const instrumentId=sourceInstruments[0]?.getAttribute('id')||defaultInstrumentId;
    const config=configs.get(instrumentId)||defaultConfig;
    if(sourceInstruments.length&&!configs.has(instrumentId))warnings.add('Нота MusicXML ссылается на неизвестный instrument ID: '+instrumentId+'; использован инструмент по умолчанию.');
    const pitch=xmlDirect(el,'pitch'),unpitched=xmlDirect(el,'unpitched');
    if(!pitch&&!(unpitched&&config.isDrum&&Number.isInteger(config.midiUnpitched))){warnings.add('Есть ноты без определённой MIDI-высоты — пропущены.');continue}
    const pitchNumber=pitch
     ?({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[xmlText(pitch,'step','C')]+Number(xmlText(pitch,'alter','0'))+(Number(xmlText(pitch,'octave','4'))+1)*12+transposition
     :config.midiUnpitched;
    if(!Number.isFinite(pitchNumber)||pitchNumber<0||pitchNumber>127||Math.round(pitchNumber)!==pitchNumber)continue;
    const voice=xmlText(el,'voice','1'),staff=xmlText(el,'staff','1'),key=staff+'|'+voice;
    const finger=authorFinger(el);
    const hand=explicitHand||(hasGrandStaff?(staff==='1'?'RH':staff==='2'?'LH':null):null);
    const id=part.getAttribute('id')||'part',fullKey=id+'|'+key;
    let list=voices.get(key);if(!list){list=[];voices.set(key,list)}
    const tied=xmlList(el,'tie').map(t=>t.getAttribute('type'));
    const noteId=musicXmlSourceNoteId(partId,partIndex,measureIndex,++sourceOrdinal);
    const note={pitch:pitchNumber,tick:absolute+onset,len:Math.max(1,noteDur),velocity:85,channel:config.channel,isDrum:config.isDrum,
     noteId,sourceNoteIds:[noteId],partId,staff,voice,sourceTrack:partIndex,instrumentId:config.id};
    if(finger!==null){note.finger=finger;note.fingeringSource=userExportMarker?'musicxml-user-export-unverified':'musicxml';if(hand)note.hand=hand;}
    const tieKey=fullKey+'|'+config.id+'|'+pitchNumber;const last=ties.get(tieKey);
    if(tied.includes('stop')&&last&&Math.abs(last.tick+last.len-note.tick)<=2){
     last.len+=note.len;
     // The unified held note keeps each written tie segment's identity.
     last.sourceNoteIds.push(note.noteId);
     if(finger!==null){
      if(last.finger==null){last.finger=finger;last.fingeringSource=userExportMarker?'musicxml-user-export-unverified':'musicxml';if(hand)last.hand=hand;}
      else if(last.finger!==finger)warnings.add('Связанные лигой ноты содержат разные номера пальцев: первое обозначение сохранено, возможная замена пальца не воспроизводится.');
     }
     if(!tied.includes('start'))ties.delete(tieKey);
    }
    else{list.push(note);if(tied.includes('start'))ties.set(tieKey,note)}
    if(xmlDirect(el,'notations')?.getElementsByTagName('ornaments')?.length)warnings.add('Украшения не развёрнуты в отдельные MIDI-ноты.');
   }
   // The same pure measure-span rule is used by OSMD bar navigation.
   const implicit=measure.getAttribute('implicit')==='yes';
   const spanTicks=Math.round(musicMeasureSpan(beats,beatType,maxAt/ppq,implicit)*ppq);
   if(sharedStarts){
    const barTicks=sharedStarts[measureIndex+1]-sharedStarts[measureIndex];
    if(maxAt>barTicks+2)warnings.add('Некоторые партии содержат ноты длиннее общего такта; сложный полиметр требует проверки.');
    absolute=sharedStarts[measureIndex+1];
   }else absolute+=spanTicks;
   measureIndex++;
  }
  for(const [key,notes] of voices)if(notes.length)segments.push({name:partName+' · '+key.replace('|','/'),notes});
 }
 if(!segments.length)throw Error('В MusicXML не обнаружены воспроизводимые ноты');
 if(segments.reduce((sum,t)=>sum+t.notes.length,0)>25000)throw Error('В MusicXML больше 25 000 нот');
 const tempoMap=musicCreateTempoTimeline(tempos,ppq);
 const toSeconds=tick=>musicTickToSeconds(tempoMap,ppq,tick);
 const tracks=segments.map((s,i)=>({name:s.name,notes:s.notes.map(n=>({
  pitch:n.pitch,start:toSeconds(n.tick),duration:Math.max(.025,toSeconds(n.tick+n.len)-toSeconds(n.tick)),velocity:n.velocity,track:i,channel:n.channel,
  noteId:n.noteId,sourceNoteIds:n.sourceNoteIds.slice(),partId:n.partId,staff:n.staff,voice:n.voice,sourceTrack:n.sourceTrack,instrumentId:n.instrumentId,isDrum:n.isDrum,
  ...(n.finger!=null?{finger:n.finger,fingeringSource:n.fingeringSource,...(n.hand?{hand:n.hand}:{})}:{})
 }))}));
 for(let track=0;track<tracks.length;track++)for(const n of segments[track].notes){
  addAudioTick({type:'noteOn',tick:n.tick,channel:n.channel,track,sourceTrack:n.sourceTrack,noteId:n.noteId,pitch:n.pitch,velocity:n.velocity});
  addAudioTick({type:'noteOff',tick:n.tick+n.len,channel:n.channel,track,sourceTrack:n.sourceTrack,noteId:n.noteId,pitch:n.pitch});
 }
 const audioEvents=audioEventTicks.map(({tick,...event})=>({...event,time:toSeconds(tick)})).sort((a,b)=>a.time-b.time||a.sequence-b.sequence);
 return{id:'xml-'+Date.now(),title:title.slice(0,100),author:author.slice(0,110),type:'import',format:'MusicXML',tracks,audioEvents,pianoGrandStaffParts,warnings:[...warnings],notationXML:playbackXml,originalNotationXML:repeatExpansion.expanded?safeXml:undefined,scoreTempoMap:tempoMap.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))};
}
async function zipUnpackMXL(arrayBuffer){
 const a=new Uint8Array(arrayBuffer),d=new DataView(arrayBuffer);
 if(a.length>16*1024*1024)throw Error('MXL больше 16 МБ');
 if(a.length<22)throw Error('Некорректный ZIP/MXL');
 let eocd=-1;
 for(let p=a.length-22;p>=Math.max(0,a.length-65557);p--){
  if(d.getUint32(p,true)===0x06054b50&&p+22+d.getUint16(p+20,true)===a.length){
   eocd=p;break;
  }
 }
 if(eocd<0)throw Error('Некорректный ZIP/MXL');
 const count=d.getUint16(eocd+10,true),dirAt=d.getUint32(eocd+16,true),
  dirSize=d.getUint32(eocd+12,true);
 // ZIP64, encrypted, split archives, and silently trailing directory records
 // are not supported. The MXL format has no need for these variants.
 if(count>500||count===0)throw Error('Некорректное число элементов MXL');
 if(d.getUint16(eocd+4,true)!==0||d.getUint16(eocd+6,true)!==0||
  d.getUint16(eocd+8,true)!==count||
  dirAt===0xffffffff||dirSize===0xffffffff||
  dirAt>eocd||dirSize>eocd-dirAt)
  throw Error('Некорректный каталог ZIP/MXL');
 const entries=[],names=new Set();let p=dirAt;
 for(let i=0;i<count;i++){
  if(p+46>dirAt+dirSize||d.getUint32(p,true)!==0x02014b50)
   throw Error('Ошибка каталога ZIP');
  const flags=d.getUint16(p+8,true),method=d.getUint16(p+10,true),
   size=d.getUint32(p+20,true),originalSize=d.getUint32(p+24,true),
   nameLength=d.getUint16(p+28,true),extraLength=d.getUint16(p+30,true),
   commentLength=d.getUint16(p+32,true),localOffset=d.getUint32(p+42,true);
  const end=p+46+nameLength+extraLength+commentLength;
  if(end>dirAt+dirSize)throw Error('Обрезанный каталог ZIP');
  const name=new TextDecoder().decode(a.subarray(p+46,p+46+nameLength));
  if(!name||name.includes('\\')||name.startsWith('/')||name.includes('\0')||
   name.split('/').some(x=>x==='.'||x==='..')||names.has(name))
   throw Error('Некорректный путь или повтор в MXL');
  if(flags&1)throw Error('Зашифрованный MXL не поддерживается');
  names.add(name);
  entries.push({name,method,size,originalSize,localOffset,flags});
  p=end;
 }
 if(p!==dirAt+dirSize)throw Error('Несогласованный каталог ZIP');
 async function entryText(e){
  if(e.originalSize>15*1024*1024)throw Error('MXL XML слишком большой');
  const off=e.localOffset;
  if(off>dirAt||off+30>dirAt||d.getUint32(off,true)!==0x04034b50)
   throw Error('Повреждён ZIP');
  const localFlags=d.getUint16(off+6,true),localMethod=d.getUint16(off+8,true),
   n=d.getUint16(off+26,true),extra=d.getUint16(off+28,true);
  const start=off+30+n+extra;
  if((localFlags&1)||(localFlags&8)!==(e.flags&8)||
   localMethod!==e.method||start>dirAt||e.size>dirAt-start)
   throw Error('Повреждённая запись MXL');
  const localName=new TextDecoder().decode(a.subarray(off+30,off+30+n));
  if(localName!==e.name)throw Error('Несогласованное имя файла MXL');
  const src=a.slice(start,start+e.size);
  let raw;
  if(e.method===0)raw=src;
  else if(e.method===8)raw=await zipInflateBounded(src,15*1024*1024,'MXL');
  else throw Error('Метод сжатия MXL не поддерживается');
  if(raw.length!==e.originalSize)
   throw Error('Несовпадение размера распакованного MXL');
  return new TextDecoder('utf-8',{fatal:true}).decode(raw);
 }
 const c=entries.find(x=>x.name==='META-INF/container.xml');
 let rootName='';
 if(c){
  if(c.originalSize>1024*1024)throw Error('Слишком большой META-INF/container.xml');
  const xml=await entryText(c);
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
   throw Error('Недопустимая декларация XML в контейнере MXL');
  const dom=new DOMParser().parseFromString(xml,'text/xml');
  if(dom.querySelector('parsererror'))throw Error('Повреждён контейнер MXL');
  rootName=dom.querySelector('rootfile')?.getAttribute('full-path')||'';
  if(rootName&&(!names.has(rootName)||rootName==='META-INF/container.xml'))
   throw Error('Указанный нотный XML отсутствует в MXL');
 }
 const target=rootName?entries.find(x=>x.name===rootName):
  entries.find(x=>/\.(musicxml|xml)$/i.test(x.name)&&!x.name.startsWith('META-INF/'));
 if(!target)throw Error('В MXL нет нотного XML');
 return entryText(target);
}
