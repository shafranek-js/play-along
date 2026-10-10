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
function libraryDB(){return new Promise((resolve,reject)=>{let q=indexedDB.open(LIBRARY_DB_V08,2);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('works'))q.result.createObjectStore('works',{keyPath:'id'});if(!q.result.objectStoreNames.contains('prefs'))q.result.createObjectStore('prefs');if(!q.result.objectStoreNames.contains('performances')){const records=q.result.createObjectStore('performances',{keyPath:'id'});records.createIndex('profile','profile',{unique:false})}};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function libraryTransaction(store,mode,run){const db=await libraryDB();try{return await new Promise((resolve,reject)=>{let t=db.transaction(store,mode),q=run(t.objectStore(store));t.oncomplete=()=>resolve(q?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);})}finally{db.close()}}
async function loadLibraryIndex(){try{collectionIndex=await libraryTransaction('works','readonly',s=>s.getAll())||[];favoritesV08=new Set(await libraryTransaction('prefs','readonly',s=>s.get('favorites'))||[]);collectionReady=true;renderLibrary();}catch(e){collectionReady=true;setLibraryStatus('Браузер не разрешил доступ к библиотеке: '+e.message);renderLibrary()}}
function libraryBinaryId(buffer){const arr=new Uint8Array(buffer);let h=2166136261;for(let i=0;i<arr.length;i++)h=Math.imul(h^arr[i],16777619)>>>0;return 'saved-'+h.toString(16)+'-'+arr.length}
async function librarySaveBinary(name,buffer,origin,details={}){if(buffer.byteLength>15*1024*1024)throw Error('Файл превышает 15 МБ');const id=libraryBinaryId(buffer);const entry={id,name,title:details.title||name.replace(/\.(mid|midi|xml|musicxml|mxl|mscx|mscz)$/i,''),author:details.author||'Пользовательская коллекция',format:name.toLowerCase().split('.').pop(),origin,license:details.license||'',page:details.page||'',added:Date.now(),data:buffer};await libraryTransaction('works','readwrite',s=>s.put(entry));collectionIndex=collectionIndex.filter(e=>e.id!==id).concat(entry);renderLibrary();return entry}
async function libraryRemoveEntry(id){await libraryTransaction('works','readwrite',s=>s.delete(id));collectionIndex=collectionIndex.filter(e=>e.id!==id);delete state.songSettings[id];if(state.selected===id)state.selected='demo-scale';persist();renderLibrary()}
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
function readMusicXML(xmlString,filename){
 if(xmlString.length>15e6)throw Error('MusicXML слишком велик для браузерного импорта');
 const safeXml=musicSafeXml(xmlString);
 const doc=new DOMParser().parseFromString(safeXml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Ошибка структуры XML');
 const root=doc.documentElement;if(root.localName!=='score-partwise')throw Error('Поддерживается MusicXML score-partwise (score-timewise пока нет)');
 const title=xmlText(xmlDirect(root,'work'),'work-title',xmlText(root,'movement-title',libraryTitleFile(filename)));
 const creator=[...root.getElementsByTagName('creator')].find(x=>x.getAttribute('type')==='composer');const author=creator?.textContent?.trim()||'MusicXML · импорт';
 const namesById={};for(const p of xmlList(xmlDirect(root,'part-list'),'score-part'))namesById[p.getAttribute('id')]=xmlText(p,'part-name','Партия');
 const segments=[],tempos=[{tick:0,tempo:500000}],ppq=10080;let warnings=new Set();
 const durationTicks=(duration,divisions)=>Math.round((Number(duration)||0)/Math.max(1,divisions)*ppq);
 for(const part of xmlList(root,'part')){
  let absolute=0,divisions=1,transposition=0;let beats=4,beatType=4;
  const voices=new Map();const ties=new Map();
  for(const measure of xmlList(part,'measure')){
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
     const sound=xmlDirect(el,'sound');const bpm=Number(sound?.getAttribute('tempo'));if(bpm>0&&bpm<1000)tempos.push({tick:absolute+at,tempo:60000000/bpm});
     const metr=xmlDirect(xmlDirect(el,'direction-type'),'metronome');const per=Number(xmlText(metr,'per-minute'));if(!bpm&&per>0){const unit=xmlText(metr,'beat-unit','quarter');const factor=({whole:4,half:2,quarter:1,eighth:.5,'16th':.25})[unit]||1;tempos.push({tick:absolute+at,tempo:60000000/(per*factor)})}
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
   const expected=durationTicks(beats*(4/beatType)*divisions,divisions);
   absolute+=Math.max(0,maxAt)||expected;
  }
  for(const [key,notes] of voices)if(notes.length)segments.push({name:(namesById[part.getAttribute('id')]||'Партия')+' · '+key.replace('|','/'),notes});
 }
 if(!segments.length)throw Error('В MusicXML не обнаружены воспроизводимые ноты');
 if(segments.reduce((sum,t)=>sum+t.notes.length,0)>25000)throw Error('В MusicXML больше 25 000 нот');
 const byTick=new Map();for(const t of tempos)byTick.set(t.tick,t.tempo);const tempoMap=[...byTick].sort((a,b)=>a[0]-b[0]).map(([tick,tempo])=>({tick,tempo}));if(tempoMap[0].tick!==0)tempoMap.unshift({tick:0,tempo:500000});let acc=0;for(let i=0;i<tempoMap.length;i++){const t=tempoMap[i],prev=tempoMap[i-1];if(prev)acc+=(t.tick-prev.tick)/ppq*prev.tempo/1e6;t.sec=acc}
 function toSeconds(tick){let lo=0,hi=tempoMap.length;while(lo+1<hi){const m=(lo+hi)>>1;if(tempoMap[m].tick<=tick)lo=m;else hi=m}const t=tempoMap[lo];return t.sec+(tick-t.tick)/ppq*t.tempo/1e6}
 const tracks=segments.map((s,i)=>({name:s.name,notes:s.notes.map(n=>({pitch:n.pitch,start:toSeconds(n.tick),duration:Math.max(.025,toSeconds(n.tick+n.len)-toSeconds(n.tick)),velocity:n.velocity,track:i,channel:0}))}));
 return{id:'xml-'+Date.now(),title:title.slice(0,100),author:author.slice(0,110),type:'import',format:'MusicXML',tracks,warnings:[...warnings],notationXML:safeXml,scoreTempoMap:tempoMap.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))};
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
