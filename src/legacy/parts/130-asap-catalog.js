// ===== v0.8.9 ASAP: non-commercial piano score & performance collection =====
// Source: https://github.com/fosfrancesco/asap-dataset
// Dataset license: CC BY-NC-SA 4.0. This catalog contains remote links only;
// do not redistribute binary score/performance files without proper attribution.
const ASAP_REPO='https://github.com/fosfrancesco/asap-dataset';
const ASAP_RAW='https://raw.githubusercontent.com/fosfrancesco/asap-dataset/master/';
const ASAP_CDN='https://cdn.jsdelivr.net/gh/fosfrancesco/asap-dataset@master/';
const ASAP_METADATA_URLS=[ASAP_RAW+'metadata.csv',ASAP_CDN+'metadata.csv'];
const ASAP_CACHE_KEY='asap-piano-score-catalog-v1';
const ASAP_LICENSE='CC BY-NC-SA 4.0';
// The fallback examples below use confirmed paths, not inferred file names.
const ASAP_SEED_ROWS=[
 ['Bach','Fugue_bwv_846','Bach/Fugue/bwv_846','Shi05M.mid'],
 ['Bach','Fugue_bwv_848','Bach/Fugue/bwv_848','Denisova06M.mid'],
 ['Bach','Fugue_bwv_854','Bach/Fugue/bwv_854','LuA01M.mid'],
 ['Beethoven','Piano_Sonatas_18-3','Beethoven/Piano_Sonatas/18-3','ChenGuang05.mid'],
 ['Chopin','Etudes_op_10_1','Chopin/Etudes_op_10/1','Shelest02.mid'],
 ['Liszt','Transcendental_Etudes_5','Liszt/Transcendental_Etudes/5','Huang16M.mid']
];
function asapIsPath(p,extension){return typeof p==='string'&&p.length<=350&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').includes('..')&&!p.split('/').includes('.')&&new RegExp('\\.'+extension+'$','i').test(p)}
function asapSafePath(path){return path.split('/').map(encodeURIComponent).join('/')}
function asapItem(composer,title,xmlPath,midiPath,performances=[]){
 const id='asap-'+xmlPath;
 return {id,title:title.replace(/_/g,' ').replace(/\s+/g,' ').trim(),author:composer,source:'ASAP Dataset',type:'online',genre:'Classical piano',instrument:'Piano',license:ASAP_LICENSE,
   format:'MusicXML',url:ASAP_RAW+asapSafePath(xmlPath),fallback:ASAP_CDN+asapSafePath(xmlPath),
   scorePath:xmlPath,midiPath,performances:[...new Set(performances)],
   page:ASAP_REPO+'/blob/master/'+asapSafePath(xmlPath)};
}
const ASAP_INDEX=ASAP_SEED_ROWS.map(([composer,title,folder,perf])=>asapItem(composer,title,folder+'/xml_score.musicxml',folder+'/midi_score.mid',[folder+'/'+perf]));
let asapLive=[],asapLoaded=false,asapLoading=null;
function asapApplyEntries(entries){
 const ids=new Set(ASAP_INDEX.map(e=>e.id)),byId=new Map(entries.map(e=>[e.id,e]));
 for(const seed of ASAP_INDEX){const full=byId.get(seed.id);if(full)seed.performances=[...full.performances]}
 asapLive=entries.filter(e=>!ids.has(e.id));
}
// A small, strict CSV parser that accepts quoted cells and CRLF.
function asapCsvRows(content){
 if(typeof content!=='string'||content.length>4e6)throw Error('Некорректные или слишком большие метаданные ASAP');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<content.length;i++){
  const c=content[i];if(quoted){if(c==='"'&&content[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}
  else if(c==='"')quoted=true;
  else if(c===','){row.push(cell);cell=''}
  else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('Незакрытые кавычки в CSV ASAP');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
 return rows;
}
function asapParseMetadata(csv){
 const rows=asapCsvRows(csv);if(rows.length<2)throw Error('CSV ASAP пустой');
 const headers=rows.shift().map(s=>s.trim().replace(/^\ufeff/,''));
 for(const key of ['composer','title','xml_score','midi_score','midi_performance'])if(!headers.includes(key))throw Error('Нет колонки ASAP: '+key);
 const idx=name=>headers.indexOf(name),items=new Map();
 for(const row of rows){
  const composer=(row[idx('composer')]||'').trim(),title=(row[idx('title')]||'').trim(),xmlPath=(row[idx('xml_score')]||'').trim(),midiPath=(row[idx('midi_score')]||'').trim(),perf=(row[idx('midi_performance')]||'').trim();
  if(!composer||!title||!asapIsPath(xmlPath,'musicxml')||!asapIsPath(midiPath,'mid'))continue;
  if(!items.has(xmlPath))items.set(xmlPath,asapItem(composer,title,xmlPath,midiPath));
  const entry=items.get(xmlPath);if(asapIsPath(perf,'mid')&&!entry.performances.includes(perf))entry.performances.push(perf);
 }
 if(!items.size)throw Error('В метаданных ASAP не найдены партитуры');
 return [...items.values()];
}
function asapStatus(msg){if($('asapProgress'))$('asapProgress').textContent=msg}
async function asapGetCsv(url){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),16000);
 try{const response=await fetch(url,{mode:'cors',cache:'no-cache',signal:ac.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.text()}
 finally{clearTimeout(timer)}
}
async function asapLoadIndex(force=false){
 if(asapLoading)return asapLoading;
 asapLoading=(async()=>{
  try{
   if(!force){const cached=await mutopiaCacheRead(ASAP_CACHE_KEY);if(cached?.entries?.length>50){
    asapApplyEntries(cached.entries.filter(e=>e&&e.source==='ASAP Dataset'&&asapIsPath(e.scorePath,'musicxml')));
    if(asapLive.length>50){asapLoaded=true;asapStatus('Из кэша: '+(asapLive.length+ASAP_INDEX.length)+' партитур. Нажми «Обновить», чтобы сверить каталог.');renderLibrary();return asapLive}
   }}
   asapStatus('Читаю официальный metadata.csv из репозитория ASAP…');let entries=[],errors=[];
   for(const url of ASAP_METADATA_URLS){try{entries=asapParseMetadata(await asapGetCsv(url));if(entries.length<50)throw Error('Слишком мало партитур в ответе');break}catch(err){errors.push(err.message);entries=[]}}
   if(!entries.length)throw Error(errors.join('; '));
   asapApplyEntries(entries);
   asapLoaded=true;renderLibrary();
   asapStatus('Доступно '+(asapLive.length+ASAP_INDEX.length)+' партитур с MusicXML и MIDI. Исполнения — по кнопке «Исп.».');
   await mutopiaCacheWrite(ASAP_CACHE_KEY,{entries,updated:Date.now()});
   return asapLive;
  }catch(err){asapStatus('Не удалось получить полный каталог ('+err.message+'). Работает стартовая подборка; можно скачать файл вручную на GitHub.');throw err}
  finally{asapLoading=null}
 })();return asapLoading;
}
function asapVariant(e,path,description){return {...e,url:ASAP_RAW+asapSafePath(path),fallback:ASAP_CDN+asapSafePath(path),title:e.title+' · '+description,format:'MIDI',page:ASAP_REPO+'/blob/master/'+asapSafePath(path)}}
function asapOpenMidi(e){if(!asapIsPath(e.midiPath,'mid'))return asapStatus('Для партитуры нет MIDI');return onlineOpen(asapVariant(e,e.midiPath,'MIDI-партитура'))}
function asapShowPerformances(e){
 const paths=(e.performances||[]).filter(p=>asapIsPath(p,'mid'));
 if(!paths.length){asapStatus('Для произведения нет записей исполнения в ASAP');return}
 const overlay=document.createElement('div');overlay.className='overlay show';overlay.style.zIndex=200;
 const panel=document.createElement('div');panel.className='modal';panel.style.maxHeight='80vh';panel.style.overflowY='auto';
 const heading=document.createElement('h2');heading.textContent='Исполнения · '+e.author+' — '+e.title;panel.append(heading);
 const desc=document.createElement('p');desc.textContent='Варианты записанного исполнения в MIDI ('+paths.length+'). Обозначения файлов не всегда соответствуют фамилии исполнителя. Использование: '+ASAP_LICENSE+'.';panel.append(desc);
 paths.slice(0,70).forEach((path,i)=>{const name=path.split('/').pop();const b=document.createElement('button');b.className='btn tiny';b.style.cssText='display:block;width:100%;text-align:left;margin:6px 0';b.textContent=(i+1)+'. '+name;b.onclick=()=>{overlay.remove();onlineOpen(asapVariant(e,path,'исполнение '+name))};panel.append(b)});
 const close=document.createElement('button');close.className='btn ghost';close.textContent='Отмена';close.onclick=()=>overlay.remove();panel.append(close);
 overlay.onclick=ev=>{if(ev.target===overlay)overlay.remove()};overlay.append(panel);document.body.append(overlay);
}

const REMOTE_INDEX=[...LIBRARY_MANIFEST.map(e=>({id:'pd-'+e.id,title:e.title,author:e.composer,source:'Public Domain MIDI',genre:e.genre,level:e.level,license:'See original source / arrangement',page:e.source,url:'https://raw.githubusercontent.com/tactilegalactic/public-domain-midi/09b39605e6654f3e71756ce19c1b505d63f90054/midi/'+encodeURIComponent(e.file),fallback:'https://cdn.jsdelivr.net/gh/tactilegalactic/public-domain-midi@09b39605e6654f3e71756ce19c1b505d63f90054/midi/'+encodeURIComponent(e.file),type:'online'})),...MUTOPIA_INDEX,...OPENSCORE_INDEX,...MUSETRAINER_INDEX,...ASAP_INDEX];
let collectionIndex=[],favoritesV08=new Set(),collectionReady=false,onlineBusy=false,activeLibraryFilter='all';
