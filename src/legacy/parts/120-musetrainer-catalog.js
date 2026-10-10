// MuseTrainer publishes real compressed MusicXML files (.mxl), not MIDI.
// Bootstrap files and labels come from the upstream repository README.
// The complete catalogue can be refreshed from README or the GitHub file tree.
const MUSETRAINER_SEEDS=[
 ['Air','J._S._Bach_-_Air_on_the_G_String_Piano_arrangement.mxl','Johann Sebastian Bach'],
 ['Arabesque No. 1 in E Major','Arabesque_L._66_No._1_in_E_Major.mxl','Claude Debussy'],
 ['Ave Maria','Ave_Maria_D839_-_Schubert_-_Solo_Piano_Arrg..mxl','Franz Schubert'],
 ['Bach Minuet in G Major BWV Anh. 114','Bach_Minuet_in_G_Major_BWV_Anh._114.mxl','Christian Petzold'],
 ['Bach Toccata and Fugue in D Minor (piano)','Bach_Toccata_and_Fugue_in_D_Minor_Piano_solo.mxl','Johann Sebastian Bach'],
 ['Ballade No. 1 in G minor, Op. 23','Chopin_-_Ballade_no._1_in_G_minor_Op._23.mxl','Frédéric Chopin'],
 ['Bella Ciao (piano)','Bella_Ciao.mxl','Traditional'],
 ['Canon in D','Canon_in_D.mxl','Johann Pachelbel'],
 ['Canon in D (easy)','Canon_in_D_easy.mxl','Johann Pachelbel'],
 ['Carol of the Bells (easy piano)','Carol_of_the_Bells_easy_piano.mxl','Mykola Leontovych'],
 ['Chopin · Nocturne Op. 9 No. 1','Chopin_-_Nocturne_Op._9_No._1.mxl','Frédéric Chopin'],
 ['Clair de Lune','Clair_de_Lune__Debussy.mxl','Claude Debussy'],
 ['Dance of the Sugar Plum Fairy','Dance_of_the_sugar_plum_fairy.mxl','Pyotr Ilyich Tchaikovsky'],
 ['Gymnopédie No. 1','Erik_Satie_-_Gymnopedie_No.1.mxl','Erik Satie'],
 ['Für Elise (easy piano)','Fur_Elise_Easy_Piano.mxl','Ludwig van Beethoven'],
 ['Für Elise (beginner)','Fur_Elise_-_Beethoven_-_for_beginner_piano.mxl','Ludwig van Beethoven'],
 ['Für Elise','Fur_Elise.mxl','Ludwig van Beethoven'],
 ['Gnossienne No. 1','Gnossienne_No._1.mxl','Erik Satie'],
 ['Greensleeves (easy piano)','Greensleeves_for_Piano_easy_and_beautiful.mxl','Traditional'],
 ['Hungarian Dance No. 5 in G minor','Hungarian_Dance_No_5_in_G_Minor.mxl','Johannes Brahms'],
 ['La Campanella','La_Campanella_-_Grandes_Etudes_de_Paganini_No._3_-_Franz_Liszt.mxl','Franz Liszt'],
 ['Maple Leaf Rag','Maple_Leaf_Rag_Scott_Joplin.mxl','Scott Joplin'],
 ['Moonlight Sonata (3rd movement)','moonlight_sonata_3rd_movement.mxl','Ludwig van Beethoven'],
 ['Mozart · Piano Sonata No. 16 (Allegro)','Mozart_-_Piano_Sonata_No._16_-_Allegro.mxl','Wolfgang Amadeus Mozart'],
 ['Ode to Joy (easy)','Ode_to_Joy_Easy_variation.mxl','Ludwig van Beethoven'],
 ['Prelude in C major, BWV 846','Prelude_I_in_C_major_BWV_846_-_Well_Tempered_Clavier_First_Book.mxl','Johann Sebastian Bach'],
];
const MUSETRAINER_CATALOG_KEY='musetrainer-readme-catalog-v1';
const MUSETRAINER_README_URL='https://raw.githubusercontent.com/musetrainer/library/master/README.md';
const MUSETRAINER_INDEX_URL='https://api.github.com/repos/musetrainer/library/git/trees/master?recursive=1';
const MUSETRAINER_SCORES_ROOT='https://musetrainer.github.io/library/scores/';
let museTrainerLive=[],museTrainerLoaded=false,museTrainerLoading=null;
function museTrainerItem(title,filename,author=''){
 const safe=filename.split('/').map(encodeURIComponent).join('/');
 return {id:'musetrainer-'+filename,title,author,source:'MuseTrainer',license:'Права на аранжировку: см. источник',instrument:'MusicXML',format:'MXL',type:'online',
  url:MUSETRAINER_SCORES_ROOT+safe,
  fallback:'https://raw.githubusercontent.com/musetrainer/library/master/scores/'+safe,
  page:'https://github.com/musetrainer/library/blob/master/scores/'+safe};
}
const MUSETRAINER_INDEX=MUSETRAINER_SEEDS.map(([title,file,author])=>museTrainerItem(title,file,author));
function museTrainerParseReadme(md){
 if(typeof md!=='string')throw Error('Некорректный README MuseTrainer');
 const items=new Map();
 // README lists one title + [Play] + [Download] per line; only trust hosted score URLs.
 const pattern=/^\s*[-*]\s+(.+?)\s*(?:&middot;|·)\s*\[Play\]\([^)]+\)\s*(?:&middot;|·)\s*\[Download\]\((https:\/\/musetrainer\.github\.io\/library\/scores\/[^\s)]+\.mxl)\)/gim;
 for(const m of md.matchAll(pattern)){
  let filename;
  try{filename=decodeURIComponent(new URL(m[2]).pathname.slice('/library/scores/'.length))}catch{continue}
  if(!filename||filename.includes('..'+'/')||filename.startsWith('/')||!/^[-.\w ()]+\.mxl$/i.test(filename))continue;
  const seed=MUSETRAINER_INDEX.find(x=>x.id==='musetrainer-'+filename);
  const title=m[1].replace(/&middot;/g,'·').replace(/&amp;/g,'&').trim();
  items.set(filename,museTrainerItem(title,filename,seed?.author||''));
 }
 return [...items.values()];
}
function museTrainerParseTree(tree){
 if(!Array.isArray(tree))throw Error('GitHub не вернул дерево');
 return tree.filter(x=>x.type==='blob'&&/^scores\/[^/]+\.mxl$/i.test(x.path)).map(({path})=>{
  const filename=path.slice('scores/'.length),existing=MUSETRAINER_INDEX.find(x=>x.id==='musetrainer-'+filename);
  const title=existing?.title||filename.replace(/\.mxl$/i,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
  return museTrainerItem(title,filename,existing?.author||'');
 });
}
function museTrainerStatus(message){const el=$('museTrainerProgress');if(el)el.textContent=message}
async function museTrainerFetch(url){const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),18000);try{
 const response=await fetch(url,{mode:'cors',signal:ac.signal,cache:'no-cache'});
 if(!response.ok)throw Error('HTTP '+response.status);return response;
}finally{clearTimeout(timer)}}
async function museTrainerLoadIndex(force=false){
 if(museTrainerLoading)return museTrainerLoading;
 museTrainerLoading=(async()=>{
  try{
   if(!force){const cached=await mutopiaCacheRead(MUSETRAINER_CATALOG_KEY);if(cached?.entries?.length>=30){museTrainerLive=cached.entries;museTrainerLoaded=true;renderLibrary();museTrainerStatus('Каталог из кэша: '+museTrainerLive.length+' произведений. «Обновить» — получить актуальный список.');return museTrainerLive}}
   museTrainerStatus('Загружаю список оригинальных MusicXML из MuseTrainer…');let entries=[],errors=[];
   for(const url of [MUSETRAINER_README_URL,'https://cdn.jsdelivr.net/gh/musetrainer/library@master/README.md']){
    try{entries=museTrainerParseReadme(await (await museTrainerFetch(url)).text());if(entries.length<30)throw Error('README содержит слишком мало записей');break}catch(err){errors.push(err.message);entries=[]}
   }
   if(!entries.length){
    museTrainerStatus('README недоступен. Пробую дерево GitHub…');
    try{entries=museTrainerParseTree((await (await museTrainerFetch(MUSETRAINER_INDEX_URL)).json()).tree);if(entries.length<30)throw Error('Недостаточно записей в дереве')}catch(err){errors.push(err.message);entries=[]}
   }
   if(!entries.length)throw Error(errors.join(' / '));
   museTrainerLive=entries.filter(e=>!MUSETRAINER_INDEX.some(s=>s.id===e.id));
   museTrainerLoaded=true;
   await mutopiaCacheWrite(MUSETRAINER_CATALOG_KEY,{entries:museTrainerLive,updated:Date.now()});
   renderLibrary();museTrainerStatus('В каталоге '+(MUSETRAINER_INDEX.length+museTrainerLive.length)+' партитур · формат MXL. Нажми название, чтобы открыть в Play Along.');
   return museTrainerLive;
  }catch(err){museTrainerStatus('Не удалось обновить: '+err.message+'. Стартовая подборка ('+MUSETRAINER_INDEX.length+') доступна; файлы открываются напрямую.');throw err}
  finally{museTrainerLoading=null}
 })();return museTrainerLoading;
}
