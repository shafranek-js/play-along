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
async function libraryTransaction(store,mode,run){const db=await libraryDB();try{return await new Promise((resolve,reject)=>{let t=db.transaction(store,mode),q=run(t.objectStore(store));t.oncomplete=()=>resolve(q?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);})}finally{db.close()}}
async function loadLibraryIndex(){try{collectionIndex=await libraryTransaction('workIndex','readonly',s=>s.getAll())||[];favoritesV08=new Set(await libraryTransaction('prefs','readonly',s=>s.get('favorites'))||[]);collectionReady=true;renderLibrary();}catch(e){collectionReady=true;setLibraryStatus('Браузер не разрешил доступ к библиотеке: '+e.message);renderLibrary()}}
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
   if(remove){works.delete(entryOrId);index.delete(entryOrId)}
   else {
    const request=works.get(entryOrId.id);
    request.onsuccess=()=>{
     const present=request.result;
     if(present&&!libraryBuffersEqual(present.data,entryOrId.data)){
      console.error('Different musical bytes share the same ID; keeping existing work',entryOrId.id);
      tx.abort();return;
     }
     works.put(entryOrId);index.put(libraryEntryMetadata(entryOrId));
    };
   }
   tx.oncomplete=()=>resolve(true);
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error);
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
 const entry={id,name,title:details.title||name.replace(/\.(mid|midi|xml|musicxml|mxl|mscx|mscz)$/i,''),
  author:details.author||'Пользовательская коллекция',format:name.toLowerCase().split('.').pop(),
  origin,license:details.license||'',page:details.page||'',added:Date.now(),data:buffer};
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
 const count=new Map();
 for(const index of sequence)count.set(index,(count.get(index)||0)+1);
 for(const part of parts){
  const measures=xmlList(part,'measure');
  for(const [index,visits] of count){
   if(visits<2)continue;
   const measure=measures[index];
   if(index!==0&&xmlList(measure,'attributes').length)return true;
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
    if(time){beats=Number(xmlText(time,'beats',beats))||beats;beatType=Number(xmlText(time,'beat-type',beatType))||beatType}
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
 const segments=[],tempos=[{tick:0,tempo:500000}],ppq=10080;let warnings=new Set();if(repeatExpansion.expanded)warnings.add('Реприза развёрнута: '+repeatExpansion.written+' записанных тактов → '+repeatExpansion.played+' исполняемых. Партитура показывает каждый проход.');else if(repeatExpansion.warning)warnings.add(repeatExpansion.warning);
 const durationTicks=(duration,divisions)=>Math.round((Number(duration)||0)/Math.max(1,divisions)*ppq);
 const scoreParts=xmlList(root,'part');
 const counts=scoreParts.map(p=>xmlList(p,'measure').length);
 // Only synchronize when the parts contain matching measure counts. Scores
 // with genuinely different structures remain on the previous safe path.
 const sharedStarts=scoreParts.length>1&&counts.every(n=>n===counts[0])
  ?musicSharedBarStarts(xmlList(scoreParts[0],'measure'),ppq):null;
 if(scoreParts.length>1&&!sharedStarts)warnings.add('Число тактов различается между партиями: общая тактовая сетка не используется.');
 for(const part of scoreParts){
  let absolute=0,divisions=1,transposition=0;let beats=4,beatType=4;
  const voices=new Map();const ties=new Map();
  let measureIndex=0;
  for(const measure of xmlList(part,'measure')){
   if(sharedStarts)absolute=sharedStarts[measureIndex];
   let at=0,lastOnset=0,maxAt=0;
   for(const el of [...measure.children]){
    const tag=el.localName;
    if(tag==='attributes'){
     const d=Number(xmlText(el,'divisions',divisions));if(d>0)divisions=d;
     const ts=xmlDirect(el,'time');if(ts){beats=Number(xmlText(ts,'beats',beats))||beats;beatType=Number(xmlText(ts,'beat-type',beatType))||beatType}
     const tr=xmlDirect(el,'transpose');if(tr){transposition=Number(xmlText(tr,'chromatic',0))+12*Number(xmlText(tr,'octave-change',0));if(transposition)warnings.add('Транспонирующие инструменты пересчитаны в звучащую высоту.')}
     continue;
    }
    if(tag==='backup'){at=Math.max(0,at-durationTicks(xmlText(el,'duration',0),divisions));continue}
    if(tag==='forward'){at+=durationTicks(xmlText(el,'duration',0),divisions);maxAt=Math.max(maxAt,at);continue}
    if(tag==='direction'){
     const sound=xmlDirect(el,'sound');
     // MusicXML offsets are in current divisions; direction-level offset
     // affects playback only when sound="yes". A nested <sound><offset>
     // is an explicit playback offset and has precedence if both exist.
     const soundOffset=xmlDirect(sound,'offset');
     const directionOffset=xmlDirect(el,'offset');
     const offsetNode=soundOffset||directionOffset;
     const offsetApplies=!!(soundOffset||directionOffset?.getAttribute('sound')==='yes');
     const delta=offsetApplies&&offsetNode?durationTicks(offsetNode.textContent,divisions):0;
     const measureTicks=Math.round(beats*4/Math.max(1,beatType)*ppq);
     const tempoTick=absolute+Math.max(0,Math.min(measureTicks,at+delta));
     const bpm=Number(sound?.getAttribute('tempo'));
     if(bpm>0&&bpm<1000)tempos.push({tick:tempoTick,tempo:60000000/bpm});
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
    const pitch=xmlDirect(el,'pitch');if(!pitch){warnings.add('Есть ноты без определённой высоты — пропущены.');continue}
    const step=xmlText(pitch,'step','C'),alter=Number(xmlText(pitch,'alter','0')),octave=Number(xmlText(pitch,'octave','4'));
    const pitchNumber=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[step]+alter+(octave+1)*12+transposition;
    if(!Number.isFinite(pitchNumber)||pitchNumber<0||pitchNumber>127||Math.round(pitchNumber)!==pitchNumber)continue;
    const voice=xmlText(el,'voice','1'),staff=xmlText(el,'staff','1'),key=staff+'|'+voice;
    const id=part.getAttribute('id')||'part',fullKey=id+'|'+key;
    let list=voices.get(key);if(!list){list=[];voices.set(key,list)}
    const tied=xmlList(el,'tie').map(t=>t.getAttribute('type'));
    const note={pitch:pitchNumber,tick:absolute+onset,len:Math.max(1,noteDur),velocity:85,channel:0};
    const tieKey=fullKey+'|'+pitchNumber;const last=ties.get(tieKey);
    if(tied.includes('stop')&&last&&Math.abs(last.tick+last.len-note.tick)<=2){last.len+=note.len;if(!tied.includes('start'))ties.delete(tieKey)}
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
  for(const [key,notes] of voices)if(notes.length)segments.push({name:(namesById[part.getAttribute('id')]||'Партия')+' · '+key.replace('|','/'),notes});
 }
 if(!segments.length)throw Error('В MusicXML не обнаружены воспроизводимые ноты');
 if(segments.reduce((sum,t)=>sum+t.notes.length,0)>25000)throw Error('В MusicXML больше 25 000 нот');
 const tempoMap=musicCreateTempoTimeline(tempos,ppq);
 const toSeconds=tick=>musicTickToSeconds(tempoMap,ppq,tick);
 const tracks=segments.map((s,i)=>({name:s.name,notes:s.notes.map(n=>({pitch:n.pitch,start:toSeconds(n.tick),duration:Math.max(.025,toSeconds(n.tick+n.len)-toSeconds(n.tick)),velocity:n.velocity,track:i,channel:0}))}));
 return{id:'xml-'+Date.now(),title:title.slice(0,100),author:author.slice(0,110),type:'import',format:'MusicXML',tracks,warnings:[...warnings],notationXML:playbackXml,originalNotationXML:repeatExpansion.expanded?safeXml:undefined,scoreTempoMap:tempoMap.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))};
}
async function zipUnpackMXL(arrayBuffer){
 const a=new Uint8Array(arrayBuffer),d=new DataView(arrayBuffer);if(a.length>16*1024*1024)throw Error('MXL больше 16 МБ');let eocd=-1;
 for(let p=a.length-22;p>=Math.max(0,a.length-65557);p--)if(d.getUint32(p,true)===0x06054b50){eocd=p;break}
 if(eocd<0)throw Error('Некорректный ZIP/MXL');const number=d.getUint16(eocd+10,true),dirAt=d.getUint32(eocd+16,true);if(number>500)throw Error('Слишком много элементов в MXL');
 const entries=[];let p=dirAt;for(let i=0;i<number;i++){
  if(p+46>a.length||d.getUint32(p,true)!==0x02014b50)throw Error('Ошибка каталога ZIP');
  const method=d.getUint16(p+10,true),size=d.getUint32(p+20,true),originalSize=d.getUint32(p+24,true),nameLength=d.getUint16(p+28,true),extraLength=d.getUint16(p+30,true),commentLength=d.getUint16(p+32,true),localOffset=d.getUint32(p+42,true);
  const name=new TextDecoder().decode(a.subarray(p+46,p+46+nameLength));
  entries.push({name,method,size,originalSize,localOffset});p+=46+nameLength+extraLength+commentLength;
 }
 async function entryText(e){if(e.originalSize>15*1024*1024)throw Error('MXL XML слишком большой');let off=e.localOffset;if(d.getUint32(off,true)!==0x04034b50)throw Error('Повреждён ZIP');let start=off+30+d.getUint16(off+26,true)+d.getUint16(off+28,true);if(start+e.size>a.length)throw Error('Обрезанный ZIP');let src=a.slice(start,start+e.size);
  if(e.method===0)return new TextDecoder().decode(src);
  if(e.method!==8)throw Error('Метод сжатия MXL не поддерживается');
  if(typeof DecompressionStream==='undefined')throw Error('Браузер не поддерживает распаковку MXL (DecompressionStream). Используй Chrome/Edge или распакованный MusicXML.');
  const raw=await zipInflateBounded(src,15*1024*1024,'MXL');return new TextDecoder().decode(raw);
 }
 const c=entries.find(x=>x.name==='META-INF/container.xml');let rootName='';if(c){const text=await entryText(c);const dom=new DOMParser().parseFromString(text,'text/xml');rootName=dom.querySelector('rootfile')?.getAttribute('full-path')||''}
 const target=entries.find(x=>x.name===rootName)||entries.find(x=>/\.(musicxml|xml)$/i.test(x.name)&&!x.name.startsWith('META-INF/'));
 if(!target)throw Error('В MXL нет нотного XML');return entryText(target);
}
