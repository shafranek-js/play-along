const $=id=>document.getElementById(id);
const STORE='playalong:smart-practice:v07';const V06_STORE='playalong:performance-analyzer:v06';const PREV_STORE='playalong:smart-phrasing:v05';const PREV2_OLD_STORE='playalong:real-piano:v04';const PREV2_STORE='playalong:keyboard-engine:v03';const OLD_STORE='playalong:music-engine:v02';const OLDER_STORE='playalong:ui-prototype:v1';
const defaultAudioSettings=()=>({backend:'soundfont',bankId:null,livePreset:{bankMSB:0,bankLSB:0,program:0,isDrum:false},useFilePrograms:true});
const defaults={layout:'learn',page:'practice',left:true,right:true,leftPinned:true,rightPinned:true,leftWidth:286,rightWidth:318,rightTab:'practice',mode:'listen',accompany:true,accompanyExplicit:false,autoMidi:true,preferredMidiName:'',speed:100,displayRange:'song',gridVisibility:50,labels:true,highlight:true,allTracks:true,volume:40,selected:'demo-scale',track:0,deviceProfiles:{},audioSettings:defaultAudioSettings(),targetRange:'device',adaptMode:'original',adaptShift:0,auditionAdapted:false,showReviewMarkers:true,scoreView:'roll',sheetZoom:100,sheetFollow:true,fingerGuidanceMode:'off',fingerLookaheadMs:750,fingerBrowserHandSize:'M',fingerOverrides:{},librarySections:librarySectionLayoutNormalize()};
// Treat backups AND older localStorage snapshots as untrusted input.
// Invalid restored values are rejected in strict backup mode; legacy
// localStorage uses safe defaults to preserve normal upgrades.
const SONG_PREF_FIELDS=['mode','speed','track','accompany','accompanyExplicit','targetRange','adaptMode','adaptShift','adaptProfile','auditionAdapted','displayRange','allTracks','scoreView','sheetZoom','sheetFollow'];
const SETTING_ENUMS={
 layout:['learn','play','analyze'],page:['practice','library','progress'],
 rightTab:['practice','adapt','midi','review','smart','analysis'],mode:['listen','wait','tempo'],
 displayRange:['song','device'],targetRange:['device','preview25','preview37','preview49','preview61','preview76','preview88'],
 adaptMode:['original','transpose','adaptive'],adaptProfile:['center','low','high'],scoreView:['roll','sheet','editor'],
 fingerBrowserHandSize:['XXS','XS','S','M','L','XL','XXL'],
 fingerGuidanceMode:['off','numbers','hands','ghost']
};
const SETTING_NUMBERS={
 leftWidth:[210,520],rightWidth:[240,550],speed:[25,150],volume:[0,100],gridVisibility:[0,100],
 sheetZoom:[65,150],fingerLookaheadMs:[500,1000],track:[0,1000],adaptShift:[-72,72],position:[0,864000]
};
const SETTING_BOOLS=new Set(['left','right','leftPinned','rightPinned','accompany','accompanyExplicit','autoMidi','labels','highlight','allTracks','auditionAdapted','showReviewMarkers','sheetFollow']);
const SETTING_STRINGS={preferredMidiName:200,selected:250};
const settingPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
function settingValidated(key,value){
 if(Object.hasOwn(SETTING_ENUMS,key))return SETTING_ENUMS[key].includes(value)?value:undefined;
 if(Object.hasOwn(SETTING_NUMBERS,key)){
  const [min,max]=SETTING_NUMBERS[key];
  return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
   &&(!['track','fingerLookaheadMs','gridVisibility'].includes(key)||Number.isInteger(value))&&
   (key!=='fingerLookaheadMs'||[500,600,750,900,1000].includes(value))?value:undefined;
 }
 if(SETTING_BOOLS.has(key))return typeof value==='boolean'?value:undefined;
 if(Object.hasOwn(SETTING_STRINGS,key))
  return typeof value==='string'&&value.length<=SETTING_STRINGS[key]?value:undefined;
 return undefined;
}
function settingSafeProfiles(value,strict){
 if(!settingPlainObject(value)||Object.keys(value).length>100)return strict?undefined:{};
 const profiles=Object.create(null);
 for(const [id,item] of Object.entries(value)){
  if(id.length>250||['__proto__','constructor','prototype'].includes(id)||!settingPlainObject(item)
    ||!Number.isInteger(item.low)||!Number.isInteger(item.high)
    ||item.low<0||item.high>127||item.high<=item.low){
   if(strict)return undefined;
   continue;
  }
  profiles[id]={low:item.low,high:item.high};
 }
 return profiles;
}
function settingAudioSettings(value,strict){
 if(!settingPlainObject(value)||Object.keys(value).length>6)return strict?undefined:defaultAudioSettings();
 const allowed=new Set(['backend','bankId','livePreset','useFilePrograms']);
 if(Object.keys(value).some(key=>!allowed.has(key)))return strict?undefined:defaultAudioSettings();
 const safe=defaultAudioSettings();
 if(Object.hasOwn(value,'backend')){
  if(['soundfont','simple'].includes(value.backend))safe.backend=value.backend;
  else if(strict)return undefined;
 }
 if(Object.hasOwn(value,'bankId')){
  if(value.bankId===null)safe.bankId=null;
  else if(typeof value.bankId==='string'&&/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value.bankId))safe.bankId=value.bankId;
  else if(strict)return undefined;
 }
 if(Object.hasOwn(value,'useFilePrograms')){
  if(typeof value.useFilePrograms==='boolean')safe.useFilePrograms=value.useFilePrograms;
  else if(strict)return undefined;
 }
 if(Object.hasOwn(value,'livePreset')){
  const preset=value.livePreset;
  if(!settingPlainObject(preset)||Object.keys(preset).length!==4
    ||Object.keys(preset).some(key=>!['bankMSB','bankLSB','program','isDrum'].includes(key))
    ||!['bankMSB','bankLSB','program'].every(key=>Number.isInteger(preset[key])&&preset[key]>=0&&preset[key]<=127)
    ||typeof preset.isDrum!=='boolean'){
   if(strict)return undefined;
  }else safe.livePreset={bankMSB:preset.bankMSB,bankLSB:preset.bankLSB,program:preset.program,isDrum:preset.isDrum};
 }
 return safe;
}
function settingSongPrefs(value,strict){
 if(!settingPlainObject(value))return strict?undefined:Object.create(null);
 const result=Object.create(null);
 for(const [id,prefs] of Object.entries(value)){
  if(id.length>250||['__proto__','constructor','prototype'].includes(id)||!settingPlainObject(prefs)){
   if(strict)return undefined;
   continue;
  }
  const safe={};
  for(const key of SONG_PREF_FIELDS){
   if(!Object.hasOwn(prefs,key))continue;
   const validated=settingValidated(key,prefs[key]);
   if(validated===undefined){if(strict)return undefined;continue}
   safe[key]=validated;
  }
  if(Object.hasOwn(prefs,'position')){
   const position=settingValidated('position',prefs.position);
   if(position===undefined){if(strict)return undefined}else safe.position=position;
  }
  if(Object.hasOwn(prefs,'loop')){
   const loop=prefs.loop;
   const valid=settingPlainObject(loop)&&typeof loop.enabled==='boolean'&&
    ['start','end'].every(k=>loop[k]===null||(
     typeof loop[k]==='number'&&Number.isFinite(loop[k])&&loop[k]>=0&&loop[k]<=864000));
   if(!valid){if(strict)return undefined}
   else safe.loop={start:loop.start,end:loop.end,enabled:loop.enabled};
  }
  if(Object.hasOwn(prefs,'bookmarks')){
   const marks=prefs.bookmarks;
   if(!Array.isArray(marks)||marks.length>80||marks.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>864000)){
    if(strict)return undefined;
   }else safe.bookmarks=marks.slice();
  }
  result[id]=safe;
 }
 return result;
}
function sanitizePlayAlongSettings(value,{strict=false}={}){
 if(!settingPlainObject(value)) {if(strict)throw Error('Повреждённые настройки');return {...defaults,audioSettings:defaultAudioSettings()}}
 const safe={...defaults};
 safe.audioSettings=defaultAudioSettings();
 for(const [key,raw] of Object.entries(value)){
  if(key==='fingerOverrides'){
   try{safe.fingerOverrides=fingerOverrideValidate(raw,{strict})}
   catch(err){if(strict)throw err}
  }else if(key==='librarySections'){
   try{safe.librarySections=librarySectionLayoutNormalize(raw,{strict})}
   catch(err){if(strict)throw err}
  }else if(key==='songSettings'){
   const parsed=settingSongPrefs(raw,strict);
   if(parsed===undefined&&strict)throw Error('Некорректные настройки мелодий');
   if(parsed!==undefined)safe.songSettings=parsed;
  }else if(key==='deviceProfiles'){
   const parsed=settingSafeProfiles(raw,strict);
   if(parsed===undefined&&strict)throw Error('Некорректная калибровка MIDI');
   if(parsed!==undefined)safe.deviceProfiles=parsed;
  }else if(key==='audioSettings'){
   const parsed=settingAudioSettings(raw,strict);
   if(parsed===undefined&&strict)throw Error('Некорректные настройки звука');
   if(parsed!==undefined)safe.audioSettings=parsed;
  }else if(Object.hasOwn(defaults,key)||key==='adaptProfile'){
   const parsed=settingValidated(key,raw);
   if(parsed===undefined){if(strict)throw Error('Некорректное значение настройки: '+key)}
   else safe[key]=parsed;
  }
 }
 return safe;
}
let stored={};try{stored=JSON.parse(localStorage.getItem(STORE)||localStorage.getItem(V06_STORE)||localStorage.getItem(PREV_STORE)||localStorage.getItem(PREV2_OLD_STORE)||localStorage.getItem(PREV2_STORE)||localStorage.getItem(OLD_STORE)||localStorage.getItem(OLDER_STORE)||'{}')||{}}catch{}
const state=sanitizePlayAlongSettings(stored);
// Old mobile sessions never had dock/overlay preferences: start with drawers closed
// instead of covering the whole score on the first upgraded visit.
if(window.innerWidth<=820&&!Object.hasOwn(stored,'leftPinned')&&!Object.hasOwn(stored,'rightPinned')){
 state.left=false;state.right=false;
}if(!['roll','sheet','editor'].includes(state.scoreView))state.scoreView='roll';state.sheetZoom=Math.max(65,Math.min(150,Number(state.sheetZoom)||100));state.deviceProfiles=typeof state.deviceProfiles==='object'&&state.deviceProfiles!==null?state.deviceProfiles:{};
// Device configuration and panels are global; practice preferences are independent per piece.
const newSongDefaults=Object.fromEntries(SONG_PREF_FIELDS.map(k=>[k,defaults[k]]));
state.songSettings=(state.songSettings&&typeof state.songSettings==='object'&&!Array.isArray(state.songSettings))?state.songSettings:{};
// v0.10.0 and earlier kept mode/speed/view per browser instead of per work.
// Preserve those values for the selected song on the first upgrade, including demo scores.
if(!Object.keys(state.songSettings).length && typeof stored.selected==='string' && stored.selected){
 const legacy=Object.fromEntries(SONG_PREF_FIELDS.filter(k=>Object.hasOwn(stored,k)).map(k=>[k,stored[k]]));
 if(Object.keys(legacy).length)state.songSettings[stored.selected]=legacy;
}

let startupSongRestorePending=false;
function captureSongSettings(song=current){
 if(!song?.id)return;
 const prefs=Object.fromEntries(SONG_PREF_FIELDS.map(k=>[k,state[k]]));
 prefs.position=Math.max(0,Math.min(Number(pos)||0,duration()));
 prefs.loop={start:loop.start,end:loop.end,enabled:!!loop.enabled};
 prefs.bookmarks=bookmarks.filter(n=>Number.isFinite(n)&&n>=0).slice(-80);
 state.songSettings[song.id]=prefs;
}
function applySongSettings(id){
 const prefs=state.songSettings[id];
 for(const key of SONG_PREF_FIELDS)state[key]=prefs&&Object.hasOwn(prefs,key)?prefs[key]:newSongDefaults[key];
 if(!['listen','wait','tempo'].includes(state.mode))state.mode='listen';
 state.speed=Math.max(25,Math.min(150,Number(state.speed)||100));
 if(!['roll','sheet','editor'].includes(state.scoreView))state.scoreView='roll';
 state.sheetZoom=Math.max(65,Math.min(150,Number(state.sheetZoom)||100));
 const last=Number(prefs?.position);pos=Number.isFinite(last)?Math.max(0,Math.min(last,duration())):0;
 const savedLoop=prefs?.loop;
 loop=savedLoop&&Number.isFinite(savedLoop.start)&&Number.isFinite(savedLoop.end)&&savedLoop.end>savedLoop.start
  ?{start:savedLoop.start,end:savedLoop.end,enabled:!!savedLoop.enabled}:{start:null,end:null,enabled:false};
 bookmarks=Array.isArray(prefs?.bookmarks)?prefs.bookmarks.filter(v=>typeof v==='number'&&Number.isFinite(v)).slice(-80):[];
}
function syncSongSettingsUI(){
 $('speed').value=state.speed;$('speedLabel').textContent=state.speed+'%';
 $('bottomMode').value=state.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
 $('accompany').checked=state.accompany;$('allTracks').checked=state.allTracks;
 $('displayRange').value=state.displayRange;
 $('fingerGuideMode').value=state.fingerGuidanceMode;
 $('fingerBrowserHandSize').value=state.fingerBrowserHandSize;
 $('fingerGuideLookahead').value=String(state.fingerLookaheadMs);
 $('fingerGuideLookahead').disabled=state.fingerGuidanceMode!=='ghost';
 $('sheetZoomLabel').textContent=state.sheetZoom+'%';$('sheetFollow').checked=state.sheetFollow!==false;
}

const demoSongs=[
 {id:'demo-scale',title:'Упражнение: гамма C major',author:'Демонстрационная фраза · 8 нот',type:'demo',tempo:92,tracks:[{name:'Мелодия',notes:[60,62,64,65,67,69,71,72,71,69,67,65,64,62,60].map((p,i)=>({pitch:p,start:i*.46,duration:.39,velocity:84,track:0}))}]},
 {id:'demo-chords',title:'Упражнение: C · F · G · C',author:'Демонстрационная фраза · аккорды',type:'demo',tempo:85,tracks:[{name:'Аккорды',notes:[[60,64,67],[65,69,72],[67,71,74],[60,64,67]].flatMap((ch,i)=>ch.map(p=>({pitch:p,start:i*1.6,duration:1.35,velocity:85,track:0})))}]},
 {id:'demo-intervals',title:'Упражнение: интервалы',author:'Демонстрационная фраза · две дорожки',type:'demo',tempo:105,tracks:[{name:'Мелодия',notes:[60,67,62,69,64,72,65,72].map((p,i)=>({pitch:p,start:i*.65,duration:.5,velocity:86,track:0}))},{name:'Нижний голос',notes:[48,50,52,53].map((p,i)=>({pitch:p,start:i*1.3,duration:1.1,velocity:70,track:1}))}]},
 // FG-00: explicit, manually verified preset. No automatic fingering inference.
 {id:'demo-finger-duet',title:'Упражнение: две руки · C–F–G–C',author:'Finger Guidance · демо-аппликатура',type:'demo',tempo:90,
  tracks:[
   {name:'Правая рука',notes:[[60,64,67],[65,69,72],[67,71,74],[60,64,67]].flatMap((ch,i)=>ch.map(p=>({pitch:p,start:i*1.8,duration:1.25,velocity:85,track:0})))},
   {name:'Левая рука',notes:[[48,52,55],[53,57,60],[55,59,62],[48,52,55]].flatMap((ch,i)=>ch.map(p=>({pitch:p,start:i*1.8,duration:1.25,velocity:76,track:1})))}
  ]}
];
let imports=[],current=null,selectedNote=null,pos=0,isPlaying=false,startAt=0,startAudioTime=0,playNext=0,ctx=null,activeVoices=new Set(),mouseNote=null;let schedulerTimer=null,practice=null,holdForInput=false,liveVoices=new Map();
let midiAccess=null,midiInput=null,deviceName='',midiConnecting=null,monitor=[],midiHeld=new Set(),midiHeldSources=new Map(),noteCount=0,cal={step:0,low:null,high:null},pointerDrag=null,hitboxes=[];
let loop={start:null,end:null,enabled:false},bookmarks=[];let adaptPlan=null,adaptMemo=null;let waitReleaseGroup=null,waitReleasePitches=new Set();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const nameOf=p=>names[((p%12)+12)%12]+(Math.floor(p/12)-1);
const fmt=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')};
const allNotes=s=>s?.tracks.flatMap(t=>t.notes)||[];
const duration=()=>Math.max(1,...allNotes(current).map(n=>n.start+n.duration))+.5;
const persist=()=>{
 if(window.__playAlongRestoringBackup||startupSongRestorePending)return;
 try{captureSongSettings();localStorage.setItem(STORE,JSON.stringify(state))}
 catch(e){console.warn('Cannot save Play Along settings',e);try{setLibraryStatus('Не удалось сохранить настройки браузера: '+e.message)}catch{}}
};

