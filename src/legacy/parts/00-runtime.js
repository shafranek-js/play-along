const $=id=>document.getElementById(id);
const STORE='playalong:smart-practice:v07';const V06_STORE='playalong:performance-analyzer:v06';const PREV_STORE='playalong:smart-phrasing:v05';const PREV2_OLD_STORE='playalong:real-piano:v04';const PREV2_STORE='playalong:keyboard-engine:v03';const OLD_STORE='playalong:music-engine:v02';const OLDER_STORE='playalong:ui-prototype:v1';
const defaults={layout:'learn',page:'practice',left:true,right:true,leftWidth:286,rightWidth:318,rightTab:'practice',mode:'listen',accompany:true,accompanyExplicit:false,autoMidi:true,preferredMidiName:'',speed:100,displayRange:'song',labels:true,highlight:true,allTracks:true,volume:40,selected:'demo-scale',track:0,deviceProfiles:{},targetRange:'device',adaptMode:'original',adaptShift:0,auditionAdapted:false,showReviewMarkers:true,scoreView:'roll',sheetZoom:100,sheetFollow:true};
let stored={};try{stored=JSON.parse(localStorage.getItem(STORE)||localStorage.getItem(V06_STORE)||localStorage.getItem(PREV_STORE)||localStorage.getItem(PREV2_OLD_STORE)||localStorage.getItem(PREV2_STORE)||localStorage.getItem(OLD_STORE)||localStorage.getItem(OLDER_STORE)||'{}')||{}}catch{}
const state={...defaults,...stored};if(!['roll','sheet'].includes(state.scoreView))state.scoreView='roll';state.sheetZoom=Math.max(65,Math.min(150,Number(state.sheetZoom)||100));state.deviceProfiles=typeof state.deviceProfiles==='object'&&state.deviceProfiles!==null?state.deviceProfiles:{};
// Device configuration and panels are global; practice preferences are independent per piece.
const SONG_PREF_FIELDS=['mode','speed','track','accompany','accompanyExplicit','targetRange','adaptMode','adaptShift','adaptProfile','auditionAdapted','displayRange','allTracks','scoreView','sheetZoom','sheetFollow'];
const newSongDefaults=Object.fromEntries(SONG_PREF_FIELDS.map(k=>[k,defaults[k]]));
state.songSettings=(state.songSettings&&typeof state.songSettings==='object'&&!Array.isArray(state.songSettings))?state.songSettings:{};
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
 if(!['roll','sheet'].includes(state.scoreView))state.scoreView='roll';
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
 $('sheetZoomLabel').textContent=state.sheetZoom+'%';$('sheetFollow').checked=state.sheetFollow!==false;
}

const demoSongs=[
 {id:'demo-scale',title:'Упражнение: гамма C major',author:'Демонстрационная фраза · 8 нот',type:'demo',tempo:92,tracks:[{name:'Мелодия',notes:[60,62,64,65,67,69,71,72,71,69,67,65,64,62,60].map((p,i)=>({pitch:p,start:i*.46,duration:.39,velocity:84,track:0}))}]},
 {id:'demo-chords',title:'Упражнение: C · F · G · C',author:'Демонстрационная фраза · аккорды',type:'demo',tempo:85,tracks:[{name:'Аккорды',notes:[[60,64,67],[65,69,72],[67,71,74],[60,64,67]].flatMap((ch,i)=>ch.map(p=>({pitch:p,start:i*1.6,duration:1.35,velocity:85,track:0})))}]},
 {id:'demo-intervals',title:'Упражнение: интервалы',author:'Демонстрационная фраза · две дорожки',type:'demo',tempo:105,tracks:[{name:'Мелодия',notes:[60,67,62,69,64,72,65,72].map((p,i)=>({pitch:p,start:i*.65,duration:.5,velocity:86,track:0}))},{name:'Нижний голос',notes:[48,50,52,53].map((p,i)=>({pitch:p,start:i*1.3,duration:1.1,velocity:70,track:1}))}]}
];
let imports=[],current=null,selectedNote=null,pos=0,isPlaying=false,startAt=0,startAudioTime=0,playNext=0,ctx=null,activeVoices=new Set(),mouseNote=null;let schedulerTimer=null,practice=null,holdForInput=false,liveVoices=new Map();
let midiAccess=null,midiInput=null,deviceName='',midiConnecting=null,monitor=[],midiHeld=new Set(),noteCount=0,cal={step:0,low:null,high:null},pointerDrag=null,hitboxes=[];
let loop={start:null,end:null,enabled:false},bookmarks=[];let adaptPlan=null,adaptMemo=null;let waitReleaseGroup=null,waitReleasePitches=new Set();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const nameOf=p=>names[((p%12)+12)%12]+(Math.floor(p/12)-1);
const fmt=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')};
const allNotes=s=>s?.tracks.flatMap(t=>t.notes)||[];
const duration=()=>Math.max(1,...allNotes(current).map(n=>n.start+n.duration))+.5;
const persist=()=>{
 if(startupSongRestorePending)return;
 try{captureSongSettings();localStorage.setItem(STORE,JSON.stringify(state))}
 catch(e){console.warn('Cannot save Play Along settings',e);try{setLibraryStatus('Не удалось сохранить настройки браузера: '+e.message)}catch{}}
};

