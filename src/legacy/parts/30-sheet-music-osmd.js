// ===== v0.9.0 Interactive Sheet Music (OSMD), share one existing AudioContext transport =====
// The optional renderer is loaded on demand: the HTML remains a standalone file; online notation needs network.
let scoreRenderer=null,scoreSong=null,scoreBusy=null,scoreCursorIndex=0,scoreCursorTimes=[],scoreLastSecond=-1,scoreLastFrame=0;
let scoreLibPromise=null,scoreLoadSerial=0,scoreZoomTimer=null;
const SCORE_CDNS=[
 './assets/vendor/opensheetmusicdisplay.min.js',
 'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.2.0/build/opensheetmusicdisplay.min.js',
 'https://unpkg.com/opensheetmusicdisplay@2.2.0/build/opensheetmusicdisplay.min.js'
];
function scoreSetStatus(msg){$('sheetStatus').textContent=msg}
function scoreNotice(msg,isError=false){const el=$('sheetNotice');el.textContent=msg;el.classList.toggle('hidden',!msg);el.classList.toggle('error',!!isError)}
function scoreError(err){const message=(err?.message||String(err));scoreSetStatus('Ошибка визуализации');scoreNotice(message+' · Piano Roll по-прежнему доступен.',true)}
function scoreOnSongChanged(){scoreLoadSerial++;scoreRenderer=null;scoreSong=null;scoreBusy=null;scoreCursorTimes=[];scoreCursorIndex=0;scoreLastSecond=-1;const target=$('sheetCanvas');if(target)target.replaceChildren();scoreSetStatus('Партитура не загружена');scoreNotice('')}
function scoreLoadScript(url){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=url;tag.async=true;tag.crossOrigin='anonymous';let timer=setTimeout(()=>{tag.remove();reject(Error('Истекло время загрузки OSMD'))},16000);tag.onload=()=>{clearTimeout(timer);resolve()};tag.onerror=()=>{clearTimeout(timer);tag.remove();reject(Error('Не удалось загрузить '+url.split('/')[2]))};document.head.append(tag);})}
async function scoreLibrary(){
 if(window.opensheetmusicdisplay?.OpenSheetMusicDisplay)return window.opensheetmusicdisplay;
 if(!scoreLibPromise){scoreLibPromise=(async()=>{let lastError=null;for(const url of SCORE_CDNS){try{await scoreLoadScript(url);if(window.opensheetmusicdisplay?.OpenSheetMusicDisplay)return window.opensheetmusicdisplay;}catch(e){lastError=e;}}throw new Error('Библиотека OpenSheetMusicDisplay не загружается (локальная копия, jsDelivr и unpkg недоступны). '+(lastError?.message||''));})();scoreLibPromise.catch(()=>{scoreLibPromise=null})}
 return scoreLibPromise;
}
function scoreEscape(text){return String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function scoreTempoFor(song){if(song.scoreTempoMap?.length)return song.scoreTempoMap;return[{beat:0,sec:0,tempo:60000000/(Number(song.tempo)||120)}]}
function scoreSecondToBeat(song,seconds){const tempos=scoreTempoFor(song);let low=0,high=tempos.length;while(low+1<high){const mid=(low+high)>>1;if(tempos[mid].sec<=seconds)low=mid;else high=mid}const t=tempos[low];return t.beat+Math.max(0,seconds-t.sec)*1e6/t.tempo}
function scoreBeatToSecond(song,beat){const tempos=scoreTempoFor(song);let low=0,high=tempos.length;while(low+1<high){const mid=(low+high)>>1;if(tempos[mid].beat<=beat)low=mid;else high=mid}const t=tempos[low];return t.sec+Math.max(0,beat-t.beat)*t.tempo/1e6}
function scorePitchXML(pitch){const names=['C','C','D','D','E','F','F','G','G','A','A','B'],alt=[0,1,0,1,0,0,1,0,1,0,1,0],pc=((pitch%12)+12)%12;return '<pitch><step>'+names[pc]+'</step>'+(alt[pc]?'<alter>1</alter>':'')+'<octave>'+(Math.floor(pitch/12)-1)+'</octave></pitch>'}
// Synthesize an explicitly approximate 4/4 notation from original MIDI beats.
// Distinct simultaneous durations are allocated to separate voices, not merged incorrectly into chords.
function scoreXMLFromSong(song){
 const tracks=song.tracks.filter(t=>t.notes?.length).slice(0,6),maxNotes=3500;
 if(song.tracks.reduce((n,t)=>n+t.notes.length,0)>maxNotes)throw Error('MIDI слишком велик для автоматической транскрипции (более 3500 нот). Открой MusicXML-партитуру или используй Piano Roll.');
 const beatPerSec=1e6/scoreTempoFor(song)[0].tempo,div=480,bar=4*div;
 const measures=[];let scoreEnd=0;
 for(const tr of tracks){const notes=tr.notes.map(n=>{
  const start=Math.max(0,Math.round((Number.isFinite(n.scoreBeat)?n.scoreBeat:n.start*beatPerSec)*4)/4);
  const length=Math.max(.25,Math.round((Number.isFinite(n.scoreBeatLength)?n.scoreBeatLength:n.duration*beatPerSec)*4)/4);
  return{at:Math.round(start*div),until:Math.round((start+length)*div),pitch:n.pitch};
 }).sort((a,b)=>a.at-b.at||a.until-b.until||a.pitch-b.pitch);
 const voices=[];
 for(const n of notes){let voice=voices.find(v=>v.until<=n.at);if(!voice){voice={until:0,notes:[]};voices.push(voice)}if(voices.length>12)throw Error('Слишком много независимых голосов для автоматической записи. Используй Piano Roll или оригинальный MusicXML.');voice.notes.push(n);voice.until=n.until;scoreEnd=Math.max(scoreEnd,n.until)}
 measures.push({name:tr.name,voices});
 }
 const barCount=Math.max(1,Math.ceil(scoreEnd/bar));if(barCount>250)throw Error('Произведение слишком длинное для автоматической нотной транскрипции.');
 const values=[[1920,'whole',false],[1440,'half',true],[960,'half',false],[720,'quarter',true],[480,'quarter',false],[360,'eighth',true],[240,'eighth',false],[180,'16th',true],[120,'16th',false]];
 function pieces(d){const out=[];for(const [value,type,dotted] of values){while(d>=value){out.push({value,type,dotted});d-=value}}if(d)throw Error('Неквантованная длительность при записи MIDI в ноты');return out}
 function rest(d,v){return pieces(d).map(p=>'<note><rest/><duration>'+p.value+'</duration><voice>'+v+'</voice><type>'+p.type+'</type>'+(p.dotted?'<dot/>':'')+'</note>').join('')}
 function noteXml(n,start,d,v,tieStop,tieStart){const parts=pieces(d);return parts.map((part,i)=>{const from=tieStop||i>0,to=tieStart||i<parts.length-1;return '<note>'+scorePitchXML(n.pitch)+'<duration>'+part.value+'</duration><voice>'+v+'</voice><type>'+part.type+'</type>'+(part.dotted?'<dot/>':'')+(from?'<tie type="stop"/>':'')+(to?'<tie type="start"/>':'')+(from||to?'<notations>'+(from?'<tied type="stop"/>':'')+(to?'<tied type="start"/>':'')+'</notations>':'')+'</note>'}).join('')}
 const chunks=[];
 for(let k=0;k<measures.length;k++){
  const {name,voices}=measures[k],partID='P'+(k+1);let body='<part id="'+partID+'">';
  for(let measure=0;measure<barCount;measure++){
   const left=measure*bar,right=left+bar;let xml='<measure number="'+(measure+1)+'">';if(measure===0)xml+='<attributes><divisions>'+div+'</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
   const active=voices.map((v,i)=>({index:i+1,notes:v.notes.filter(n=>n.at<right&&n.until>left)})).filter(v=>v.notes.length);
   if(!active.length){xml+=rest(bar,1)}else{
    active.forEach((voice,idx)=>{if(idx)xml+='<backup><duration>'+bar+'</duration></backup>';let at=left;
     for(const n of voice.notes){const begin=Math.max(left,n.at),end=Math.min(right,n.until);if(begin>at)xml+=rest(begin-at,voice.index);xml+=noteXml(n,begin,end-begin,voice.index,n.at<left,n.until>right);at=end;}
     if(at<right)xml+=rest(right-at,voice.index);
    });
   }
   body+=xml+'</measure>';
  }
  body+='</part>';chunks.push(body);
 }
 const list=measures.map((m,i)=>'<score-part id="P'+(i+1)+'"><part-name>'+scoreEscape(m.name||'Piano')+'</part-name><part-abbreviation>Pno.</part-abbreviation><score-instrument id="I'+(i+1)+'"><instrument-name>Piano</instrument-name></score-instrument></score-part>').join('');
 return '<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>'+scoreEscape(song.title)+'</work-title></work><movement-title>'+scoreEscape(song.title)+'</movement-title><identification><creator type="composer">'+scoreEscape(song.author||'')+'</creator></identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>'+list+'</part-list>'+chunks.join('')+'</score-partwise>';
}
function scoreSetView(view){
 if(!['roll','sheet'].includes(view))return;
 state.scoreView=view;const sheet=view==='sheet';$('rollWrap').classList.toggle('hidden',sheet);$('sheetWrap').classList.toggle('hidden',!sheet);
 for(const [id,on] of [['viewRoll',!sheet],['viewSheet',sheet]]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on))}
 persist();if(sheet)scoreEnsureRendered().catch(scoreError);else{resizeCanvas();scoreLastFrame=0;}
}
async function scoreEnsureRendered(){
 if(state.scoreView!=='sheet'||!current)return;
 if(scoreRenderer&&scoreSong===current){scoreSyncCursor(true);return}
 if(scoreBusy)return scoreBusy;
 const song=current,token=scoreLoadSerial;
 scoreBusy=(async()=>{
  scoreSetStatus('Подготавливаем MusicXML…');scoreNotice('');
  // Original score is used verbatim: clefs, rhythms, key signatures and repeats remain visible.
  // For MIDI we expose quantisation and playback limitations to avoid pretending it is authoritative sheet music.
  const hasOriginal=!!song.notationXML;
  const xml=hasOriginal?song.notationXML:scoreXMLFromSong(song);
  if(!hasOriginal)scoreNotice('MIDI не содержит нотной партитуры. Показана автоматически квантованная запись 4/4: длительности, группировка голосов, знаки, паузы и такты могут отличаться от оригинала. Для точных нот загрузи MusicXML/MXL.');
  scoreSetStatus('Загружаем OpenSheetMusicDisplay…');const library=await scoreLibrary();if(token!==scoreLoadSerial||song!==current)return;
  const el=$('sheetCanvas');el.replaceChildren();const renderer=new library.OpenSheetMusicDisplay(el,{autoResize:false,backend:'svg',drawTitle:true,drawingParameters:'compact'});
  scoreSetStatus('Вычерчиваем ноты…');await renderer.load(xml);if(token!==scoreLoadSerial||song!==current)return;
  renderer.Zoom=state.sheetZoom/100;renderer.render();if(token!==scoreLoadSerial||song!==current)return;
  if(!el.querySelector('svg'))throw Error('OSMD не создала SVG-партитуру');
  scoreRenderer=renderer;scoreSong=song;scoreCursorIndex=0;scoreLastSecond=-1;
  scoreCursorTimes=[];try{const cur=renderer.cursor;cur.reset();let n=0;while(!cur.iterator?.EndReached&&n++<30000){const val=Number(cur.iterator.CurrentSourceTimestamp?.RealValue);if(!Number.isFinite(val))break;scoreCursorTimes.push(val*4);cur.next()}cur.reset();cur.show();}catch(e){console.warn('OSMD cursor index unavailable',e);scoreCursorTimes=[];}
  scoreSetStatus((hasOriginal?'Исходный MusicXML':'MIDI → приближённая запись')+' · '+scoreCursorTimes.length+' позиций');scoreSyncCursor(true);
 })();
 try{await scoreBusy}finally{scoreBusy=null}
}
function scoreSyncCursor(force=false){
 if(state.scoreView!=='sheet'||!scoreRenderer||scoreSong!==current||!scoreCursorTimes.length)return;
 const at=isPlaying&&ctx?clockPos():pos;
 if(!force&&Math.abs(at-scoreLastSecond)<0.05)return;scoreLastSecond=at;
 const beat=scoreSecondToBeat(current,at);
 let lo=0,hi=scoreCursorTimes.length;while(lo<hi){const m=(lo+hi)>>1;if(scoreCursorTimes[m]<=beat+0.0001)lo=m+1;else hi=m}
 const idx=Math.max(0,lo-1),cur=scoreRenderer.cursor;
 try{
  if(idx<scoreCursorIndex){cur.reset();scoreCursorIndex=0}
  // Long seeks may contain hundreds of notes; do not schedule heavy DOM work inside an audio callback.
  let steps=0;while(scoreCursorIndex<idx&&steps++<2000){cur.next();scoreCursorIndex++}
  if(state.sheetFollow!==false&&cur.cursorElement&&(force||steps>0)){
    const host=$('sheetWrap'),area=host.getBoundingClientRect(),rect=cur.cursorElement.getBoundingClientRect();
    if(rect.height&&((rect.top<area.top+35)||(rect.bottom>area.bottom-35))){
      host.scrollTop+=rect.top-(area.top+Math.min(110,area.height/4));
    }
  }
 }catch(e){console.warn('OSMD cursor update',e)}
}
function scoreFrameSync(){
 const now=performance.now();if(now-scoreLastFrame<110)return;scoreLastFrame=now;scoreSyncCursor();
 const hint=$('sheetWaitStatus');if(!hint)return;
 if(state.scoreView!=='sheet'||state.mode!=='wait'||!isPlaying){hint.classList.add('hidden');return}
 hint.classList.remove('hidden');
 const next=practice?.nextGroup();
 hint.textContent=waitReleaseGroup?'✓ Нота/аккорд принят. Отпусти клавиши, чтобы перейти дальше.':holdForInput&&next?'⏳ Сыграй: '+[...new Set(next.notes.filter(n=>!n.hit).map(n=>nameOf(n.pitch)))].join(' + '):'▶ Следующая нота приближается…';
}
function scoreChangeZoom(delta){state.sheetZoom=Math.max(65,Math.min(150,state.sheetZoom+delta));$('sheetZoomLabel').textContent=state.sheetZoom+'%';persist();if(!scoreRenderer)return;clearTimeout(scoreZoomTimer);scoreZoomTimer=setTimeout(()=>{if(scoreRenderer&&scoreSong===current&&state.scoreView==='sheet'){try{scoreRenderer.Zoom=state.sheetZoom/100;scoreRenderer.render();scoreRenderer.cursor?.show();scoreCursorIndex=0;scoreRenderer.cursor?.reset();scoreSyncCursor(true)}catch(e){scoreError(e)}}},130)}
function scoreBarBeats(song){
 // The notation's actual measures take precedence over a guessed 4/4 grid.
 if(!song?.notationXML){const end=scoreSecondToBeat(song,duration());return Array.from({length:Math.ceil(end/4)+1},(_,i)=>i*4)}
 try{
  const doc=new DOMParser().parseFromString(song.notationXML,'application/xml');
  const part=[...doc.getElementsByTagName('part')][0];if(!part)throw Error('No part');
  let divisions=1,beats=4,unit=4,at=0;const boundaries=[];
  for(const measure of [...part.children].filter(n=>n.localName==='measure')){
   boundaries.push(at);if(boundaries.length>=1500)break;
   const attrs=[...measure.children].filter(n=>n.localName==='attributes');
   for(const a of attrs){const d=a.getElementsByTagName('divisions')[0];if(d){const v=Number(d.textContent);if(v>0)divisions=v}
    const time=a.getElementsByTagName('time')[0];if(time){const b=Number(time.getElementsByTagName('beats')[0]?.textContent),u=Number(time.getElementsByTagName('beat-type')[0]?.textContent);if(b>0&&u>0){beats=b;unit=u}}}
   const nominal=beats*4/unit;let pointer=0,max=0;
   for(const n of [...measure.children]){
    if(!['note','backup','forward'].includes(n.localName))continue;
    const d=Number([...n.children].find(c=>c.localName==='duration')?.textContent)||0;
    const q=d/divisions;
    if(n.localName==='backup')pointer=Math.max(0,pointer-q);
    else if(n.localName==='forward'){pointer+=q;max=Math.max(max,pointer)}
    else if(!n.getElementsByTagName('grace').length && !n.getElementsByTagName('chord').length){pointer+=q;max=Math.max(max,pointer)}
   }
   const implicit=measure.getAttribute('implicit')==='yes';
   at+=(implicit&&max>0)?Math.min(nominal,max):nominal;
  }
  if(boundaries.length)return boundaries;
 }catch(e){console.warn('Unable to read score bar positions',e)}
 const end=scoreSecondToBeat(song,duration());return Array.from({length:Math.ceil(end/4)+1},(_,i)=>i*4);
}
function scoreJumpBar(delta){
 if(!current)return;
 const starts=scoreBarBeats(current),beat=scoreSecondToBeat(current,pos);
 let index=0;for(let i=0;i<starts.length;i++){if(starts[i]<=beat+0.00001)index=i;else break}
 const dest=Math.max(0,Math.min(starts.length-1,index+delta));
 seek(scoreBeatToSecond(current,starts[dest]));scoreSyncCursor(true);
}
