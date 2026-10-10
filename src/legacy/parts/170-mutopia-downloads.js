// Resolve actual downloadable artifacts from the official Mutopia FTP directory.
// Directory listing is untrusted HTML: use DOMParser, validate each same-origin URL,
// and accept only direct .mid/.midi or ZIP links under the exact score directory.
const MUTOPIA_RESOLVED_KEY='mutopia-published-midi-v1';
let mutopiaResolved={};
function mutopiaPublishedUrls(html,directory){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const root=new URL(directory),found=[];
 if(root.protocol!=='https:'||root.hostname!=='www.mutopiaproject.org'||!root.pathname.startsWith('/ftp/'))throw Error('Неверный адрес каталога Mutopia');
 for(const a of doc.querySelectorAll('a[href]')){
  let u;try{u=new URL(a.getAttribute('href'),root)}catch{continue}
  if(u.origin!==root.origin||u.pathname.slice(0,u.pathname.lastIndexOf('/')+1)!==root.pathname||u.search||u.hash)continue;
  if(!/\.(mid|midi|zip)$/i.test(u.pathname))continue;
  if(!found.includes(u.href))found.push(u.href);
 }
 return found.sort((a,b)=>{const az=/\.zip$/i.test(a),bz=/\.zip$/i.test(b);return Number(az)-Number(bz)||a.localeCompare(b)});
}
async function mutopiaResolvePublished(e){
 if(!e.sourcePath)return e;
 const cached=mutopiaResolved[e.sourcePath];
 if(cached?.length){e.url=cached[0];e.fallback=cached[1]||null;e.verifiedSource=true;return e}
 const directory='https://www.mutopiaproject.org/ftp/'+e.sourcePath.slice(4,e.sourcePath.lastIndexOf('/')+1);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(directory,{mode:'cors',signal:controller.signal,cache:'no-cache'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const html=await response.text();
  if(html.length>1200000)throw Error('Слишком большой ответ каталога');
  const links=mutopiaPublishedUrls(html,directory);
  if(!links.length)throw Error('В опубликованной папке MIDI/ZIP не найден');
  mutopiaResolved[e.sourcePath]=links;e.url=links[0];e.fallback=links[1]||null;e.verifiedSource=true;
  await mutopiaCacheWrite(MUTOPIA_RESOLVED_KEY,mutopiaResolved);
  return e;
 }finally{clearTimeout(timeout)}
}
async function mutopiaOpen(e){
 setLibraryStatus('Mutopia: проверяю опубликованные файлы «'+e.title+'»…');
