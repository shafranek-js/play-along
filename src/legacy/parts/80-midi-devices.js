// MIDI connection + per-device calibration; only actual incoming MIDI messages establish boundaries.
function deviceId(){return midiInput?.id||'manual-device'}function getProfile(){return state.deviceProfiles[deviceId()]||null}
function updateDevice(){const connected=!!midiInput;$('deviceDot').className='dot '+(connected?'good':'');$('deviceBadgeText').textContent=connected?(midiInput.name||'MIDI подключён'):'MIDI не подключён';$('midiLive').textContent=connected?'MIDI: '+(midiHeld.size?'удержано '+midiHeld.size:'готово'):'MIDI: ожидание';let prof=getProfile();$('profileInfo').innerHTML=prof?'<strong>'+nameOf(prof.low)+' — '+nameOf(prof.high)+' · '+(prof.high-prof.low+1)+' клавиш</strong><p>Определено калибровкой. Профиль сохранён в этом браузере.</p>':'<strong>Диапазон не определён</strong><p>Подключи устройство и нажми самую левую и правую клавиши для определения границ.</p>';renderCapability();updateRange()}
async function connectMidi({quiet=false}={}){
 if(midiAccess){refreshInputs();return midiAccess}
 if(midiConnecting)return midiConnecting;
 if(!navigator.requestMIDIAccess){$('midiNotice').textContent='Web MIDI недоступен: используй обычную вкладку Chrome/Edge (HTTPS или localhost).';return null}
 midiConnecting=(async()=>{
  try{
   const access=await navigator.requestMIDIAccess({sysex:false});midiAccess=access;
   access.onstatechange=refreshInputs;refreshInputs();
   $('midiNotice').className='notice ok';
   $('midiNotice').textContent=midiInput?'Автоматически подключено: '+midiInput.name:'MIDI разрешён. Подключи USB-клавиатуру — она определится автоматически.';
   if(!quiet)notify(midiInput?'MIDI подключён':'MIDI-доступ получен');return access;
  }catch(e){
   const msg=String(e.message||e);
   $('midiNotice').className='notice';
   $('midiNotice').textContent=/permissions policy|disabled in this document/i.test(msg)?'Web MIDI заблокирован встроенным окном. Открой Play Along в отдельной вкладке Chrome/Edge по HTTPS или localhost.':'MIDI не подключён: '+msg+' · Нажми «Подключить MIDI» для новой попытки.';
   if(!quiet)notify('MIDI недоступен');return null;
  }finally{midiConnecting=null}
 })();return midiConnecting;
}
async function autoConnectMidi(){
 if(!state.autoMidi||!navigator.requestMIDIAccess)return;
 // Do not override a previous denial, and do not display duplicate permission prompts.
 try{if(navigator.permissions?.query){const p=await navigator.permissions.query({name:'midi',sysex:false});if(p.state==='denied'){$('midiNotice').textContent='MIDI запрещён в браузере. Разреши MIDI в настройках сайта и нажми «Подключить MIDI».';return;}}}catch{}
 await connectMidi({quiet:true});
}
function refreshInputs(){
 if(!midiAccess)return;
 const ins=[...midiAccess.inputs.values()].filter(x=>x.state==='connected');
 const select=$('inputSelect'),prev=midiInput?.id||select.value||'';
 select.replaceChildren(new Option('Выберите MIDI-вход',''));
 ins.forEach(x=>select.add(new Option(x.name||x.id,x.id)));
 // Re-select a persisted device name even if its ephemeral MIDI id changes after USB reconnect.
 const chosen=ins.find(x=>x.id===prev)||ins.find(x=>x.name===state.preferredMidiName)||ins.find(x=>/microlab/i.test(x.name||''))||ins[0]||null;
 select.value=chosen?.id||'';
 if(chosen!==midiInput)setInput(chosen,false);
 $('midiNotice').className=chosen?'notice ok':'notice';
 $('midiNotice').textContent=chosen?'MIDI подключён: '+chosen.name:'Разрешение получено, но MIDI-клавиатура не найдена. Подключи её через USB.';
}
function setInput(input,remember=true){
 if(midiInput===input)return;
 if(midiInput)midiInput.onmidimessage=null;
 // Only the previous USB input's pitches are synthetic NoteOffs. A key held
 // on the virtual keyboard belongs to a different input and must survive.
 releaseMidiInputNotes();
 // MIDI pedals/controllers are also owned by the disconnected input. Clear
 // them without silencing any surviving virtual-keyboard voice.
 if(midiHeld.size)audioResetLiveInputControls();else stopLiveAll();
 if(waitReleaseGroup)advanceWaitAfterRelease();midiInput=input||null;deviceName=midiInput?.name||'';
 if(midiInput){midiInput.onmidimessage=onMIDI;if(remember){state.preferredMidiName=midiInput.name||'';persist()}}
 updateDevice();
}
function releaseMidiInputNotes(){
 for(const [pitch,sources] of [...midiHeldSources])if(sources.has('midi'))onNoteOff(pitch,'midi');
}
function onMIDI(e){
 if(!e.data)return;
 const [status,data1=0,data2=0]=e.data,op=status&0xF0;
 if(op===0x90&&data2>0)onNoteOn(data1,data2,'midi',e.timeStamp);
 else if(op===0x80||(op===0x90&&data2===0))onNoteOff(data1,'midi',e.timeStamp);
 else if(op===0xB0&&[120,123,124,125,126,127].includes(data1)){
  // Real MIDI controllers may send All Sound Off / All Notes Off without
  // individual NoteOffs. Release the practice/Wait ownership as well as the
  // synthesizer; preserve any simultaneous virtual-keyboard press.
  releaseMidiInputNotes();
  if(midiHeld.size)audioResetLiveInputControls();
  else if(typeof audioLiveControl==='function')audioLiveControl({type:'cc',controller:data1,value:data2});
 }
 else if(typeof audioLiveControl==='function'){
  let event=null;
  if(op===0xB0)event={type:'cc',controller:data1,value:data2};
  else if(op===0xE0)event={type:'pitchWheel',value:data1|(data2<<7)};
  else if(op===0xD0)event={type:'channelPressure',value:data1};
  else if(op===0xA0)event={type:'polyPressure',pitch:data1,value:data2};
  // Program Change is intentionally ignored: the live instrument selector
  // owns the keyboard sound, independent of MIDI file/source program events.
  if(event)try{audioLiveControl(event)}catch(error){console.warn('Live MIDI control was not applied',error)}
 }
}
function eventPosition(timestamp){const p=isPlaying?clockPos():pos;if(!isPlaying||!timestamp||!Number.isFinite(timestamp))return p;return p-Math.max(0,Math.min(120,performance.now()-timestamp))/1000*rate()}
function addMonitor(t){monitor.unshift(t);monitor=monitor.slice(0,5);$('midiMonitor').textContent=monitor.join('\n');}
function onNoteOn(note,velocity=85,from='midi',timestamp){
 if(calibrationOpen()&&cal.step<2){calibrateCapture(note);return}
 // A physical MIDI key and a virtual key can own the same pitch at once.
 // Ignore repeated NoteOns from the SAME source, not a new second source.
 const source=from==='virtual'?'virtual':'midi';
 let owners=midiHeldSources.get(note);
 if(owners?.has(source))return;
 if(!owners){owners=new Set();midiHeldSources.set(note,owners)}
 owners.add(source);
 if(midiHeld.has(note))return;
 midiHeld.add(note);noteCount++;addMonitor('ON  '+nameOf(note).padEnd(5)+'  '+String(velocity).padStart(3));
 $('statNotes').textContent=noteCount;$('midiLive').textContent='MIDI: '+nameOf(note)+' · vel '+velocity;
 if(smart.waitingNext&&source==='midi'){midiHeld.delete(note);midiHeldSources.delete(note);smartGoNext();return}
 playLive(note,velocity);
 if(isPlaying&&practice&&(!ctx||ctx.currentTime>=startAudioTime)){
  const wait=state.mode==='wait';
  // A fresh expected NoteOn leads the timeline in Wait. This accepts legato
  // (next key down before the old key up) and slightly early correct notes.
  // Duplicate NoteOn for a held pitch was suppressed above, so repeated
  // same-pitch notes still require physical rearticulation.
  const group=wait?practice.nextGroup():null;
  const expected=!!(group&&group.notes.some(n=>n.pitch===note&&!n.skipped&&!n.hit&&!n.miss));
  if(wait&&expected){
   const groupStart=practice.playableStart(group);
   if(waitReleaseGroup){waitReleaseGroup=null;waitReleasePitches.clear()}
   if(!holdForInput||pos<groupStart-0.0001){
    pos=groupStart;
    if(ctx){startAt=pos;startAudioTime=ctx.currentTime}
   }
   holdForInput=true;
  }
  if(!wait||expected||(holdForInput&&!waitReleaseGroup)){
   const at=eventPosition(timestamp);
   const result=practice.inputOn(note,at,Number.isFinite(timestamp)?timestamp:performance.now());
   if(wait&&expected&&result!==false&&group)scheduleWaitAcceptedGroup(practice.playableStart(group));
   if(wait&&result==='released'&&group){
    waitReleaseGroup=group;
    waitReleasePitches=new Set(group.notes.filter(n=>!n.skipped&&n.hit&&midiHeld.has(n.pitch)).map(n=>n.pitch));
    pos=practice.playableStart(group);holdForInput=true;
    // Keep cursor and accompaniment frozen until the last chord key is released.
    if(!waitReleasePitches.size)advanceWaitAfterRelease();
   }
   showPractice();
  }
 }
 updateUI();
}
function advanceWaitAfterRelease(){
 if(!waitReleaseGroup)return;
 const completed=waitReleaseGroup;
 pos=practice.playableStart(completed);
 if(ctx){startAt=pos;startAudioTime=ctx.currentTime}
 waitReleaseGroup=null;waitReleasePitches.clear();holdForInput=false;
 if(isPlaying)engineTick();
}
function onNoteOff(note,from='midi',timestamp){
 if(calibrationOpen()&&cal.step<2)return;
 const source=from==='virtual'?'virtual':'midi',owners=midiHeldSources.get(note);
 if(!owners?.has(source))return; // late NoteOff from an old input
 owners.delete(source);
 if(owners.size)return; // the other input is still physically held
 midiHeldSources.delete(note);
 midiHeld.delete(note);releaseLive(note);
 if(practice){practice.inputOff(note,isPlaying?eventPosition(timestamp):pos);if(isPlaying)showPractice()}
 if(waitReleaseGroup){waitReleasePitches.delete(note);if(!waitReleasePitches.size)advanceWaitAfterRelease()}
 addMonitor('OFF '+nameOf(note));$('midiLive').textContent=midiHeld.size?'MIDI: удержано '+midiHeld.size:'MIDI: готово';
}
function calibrationOpen(){return $('calibrationOverlay').classList.contains('show')}
function openCalibration(){stop();updateUI();cal={step:0,low:null,high:null};$('manualRange').classList.add('hidden');$('calibrationOverlay').classList.add('show');renderCal()}
function calibrateCapture(note){if(cal.step===0){cal.low=note;cal.step=1}else if(cal.step===1){if(note<=cal.low){$('calWarning').textContent='Верхняя нота должна быть выше нижней. Попробуй нажать самую правую клавишу ещё раз.';return}cal.high=note;cal.step=2}renderCal()}
function renderCal(){let box=$('calStep');if(cal.step===0){box.innerHTML='<div class="small">ШАГ 1 / 2</div><span class="big">⇤</span><strong>Нажми самую левую физическую клавишу</strong><p>MIDI-сообщение определит нижнюю границу</p>'}else if(cal.step===1){box.innerHTML='<div class="small">ШАГ 2 / 2</div><span class="big green">'+nameOf(cal.low)+' · '+cal.low+'</span><strong>Теперь нажми самую правую физическую клавишу</strong><p>Будет определена верхняя граница</p>'}else{box.innerHTML='<div class="small">КАЛИБРОВКА ЗАВЕРШЕНА</div><span class="big green">'+(cal.high-cal.low+1)+' клавиш</span><strong>'+nameOf(cal.low)+' → '+nameOf(cal.high)+'</strong><p>Диапазон определён по фактическим MIDI-нотам. Текущий октавный режим учитывается.</p>'}$('calBack').disabled=cal.step===0;$('calSave').disabled=cal.step!==2;}
function saveCalibration(){if(cal.step!==2||cal.high<=cal.low||cal.low<0||cal.high>127)return;state.deviceProfiles[deviceId()]={low:cal.low,high:cal.high};$('calibrationOverlay').classList.remove('show');state.targetRange='device';state.displayRange='device';$('targetRange').value='device';$('displayRange').value='device';refreshArrangement({restart:false});updateDevice();rebuildPerfLast();renderReview();renderCanvas();notify('Клавиатура: '+(cal.high-cal.low+1)+' клавиш · '+nameOf(cal.low)+' — '+nameOf(cal.high));}
const commands=[['Начать / остановить',togglePlay,'Space'],['Показать партитуру',()=>scoreSetView('sheet'),''],['Показать Piano Roll',()=>scoreSetView('roll'),''],['Режим: Слушать',()=>setMode('listen'),''],['Режим: Wait',()=>setMode('wait'),''],['Режим: Tempo',()=>setMode('tempo'),''],['Изучение',()=>applyLayout('learn'),''],['Игра · без панелей',()=>applyLayout('play'),''],['Разбор исполнения',()=>openReview(),''],['Smart Practice',()=>{state.right=true;applyPanels();switchRightTab('smart')},''],['Начать Smart Practice',()=>smartStart(),''],['Сохранить попытку',()=>finishPerformance('manual'),''],['Анализ системы',()=>applyLayout('analyze'),''],['Показать / скрыть библиотеку',()=>toggleSide('left'),'Shift+L'],['Показать / скрыть настройки',()=>toggleSide('right'),'Shift+R'],['Калибровать MIDI',openCalibration,''],['Адаптация диапазона',()=>{state.right=true;applyPanels();switchRightTab('adapt')},''],['Подключить MIDI',()=>{state.right=true;applyPanels();switchRightTab('midi');connectMidi()},''],['Режим фокуса',toggleFocus,'F'],['Открыть MIDI-файл',()=>$('midiFile').click(),''],['Сбросить интерфейс',resetLayout,'']];
function showCommands(){hideMenu();$('commandOverlay').classList.add('show');$('commandSearch').value='';renderCommands();$('commandSearch').focus()}
function renderCommands(){let q=$('commandSearch').value.toLowerCase(),list=$('commandList');list.innerHTML='';commands.filter(c=>c[0].toLowerCase().includes(q)).forEach(([name,fn,key])=>{let b=document.createElement('button');b.innerHTML='<span></span><small></small>';b.firstElementChild.textContent=name;b.lastElementChild.textContent=key;b.onclick=()=>{$('commandOverlay').classList.remove('show');fn()};list.append(b)});if(!list.children.length)list.innerHTML='<div class="empty">Команда не найдена</div>'}
function toggleFocus(){let focused=document.body.classList.toggle('focus');$('focusBtn').classList.toggle('on',focused);requestAnimationFrame(resizeCanvas);if(focused)notify('Фокус: Esc или F для возврата');}
function resetLayout(){state.leftWidth=286;state.rightWidth=318;state.page='practice';state.left=true;state.right=true;state.rightTab='practice';state.layout='learn';document.body.classList.remove('focus');applyPage();applyLayout('learn');updateUI();persist();}
// Compact SMF parser used to make this UI prototype testable with users' own .mid files.
// This parser handles SMF formats 0/1, running status, channel voice events and a tempo map.
function parseMidi(bytes,title){
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let i=0,sequence=0;
 const ensure=n=>{if(i+n>bytes.length)throw Error('MIDI-файл повреждён или обрезан')};
 const u8=()=>{ensure(1);return bytes[i++]};
 const u16=()=>{ensure(2);let n=dv.getUint16(i);i+=2;return n};
 const u32=()=>{ensure(4);let n=dv.getUint32(i);i+=4;return n};
 const str=n=>{ensure(n);let s=String.fromCharCode(...bytes.subarray(i,i+n));i+=n;return s};
 const vlq=end=>{let n=0;for(let k=0;k<4;k++){if(i>=end)throw Error('Ошибка VLQ');let b=u8();n=(n<<7)|(b&127);if(!(b&128))return n}throw Error('Слишком длинный VLQ')};
 if(str(4)!=='MThd')throw Error('Это не Standard MIDI File');
 let hsize=u32();if(hsize<6)throw Error('Некорректный заголовок MIDI');
 let format=u16(),num=u16(),ppq=u16();i+=hsize-6;
 if(format>1)throw Error('MIDI Type 2 пока не поддерживается');
 if(ppq&0x8000)throw Error('SMPTE timing пока не поддерживается');
 if(!ppq||num>150)throw Error('Некорректный MIDI timing');
 let rawTracks=[],tempos=[{tick:0,tempo:500000}],warnings=new Set(),rawEventCount=0;
 const MAX_AUDIO_EVENTS=100000;
 for(let tr=0;tr<num;tr++){
  if(str(4)!=='MTrk')throw Error('Отсутствует дорожка MTrk');
  let trLen=u32(),end=i+trLen;
  if(end>bytes.length)throw Error('Обрезанная дорожка');
  const trackByte=()=>{if(i>=end)throw Error('Обрезанная MIDI-дорожка');return u8()};
  let tick=0,status=0,active=new Map(),notes=[],events=[],trackName='Дорожка '+(tr+1),noteSerial=0;
  while(i<end){
   tick+=vlq(end);
   if(i>=end)break;
   let first=bytes[i],s;
   if(first&0x80){s=u8();if(s>=0x80&&s<0xf0)status=s}
   else{if(!status)throw Error('MIDI использует running status до первого channel event');s=status}
   if(s===0xff){
    let meta=trackByte(),length=vlq(end),from=i;
    if(from+length>end)throw Error('Повреждённая MIDI meta-секция');
    if(meta===0x51&&length===3)tempos.push({tick,tempo:(bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2]});
    if(meta===0x03&&length)trackName=new TextDecoder().decode(bytes.slice(from,from+length)).replace(/[\x00-\x1f]/g,'').slice(0,55)||trackName;
    if(meta===0x21&&length)warnings.add('MIDI-события port/cable требуют несколько MIDI-портов и не воспроизводятся.');
    if(meta===0x2f){i=from+length;break}
    i=from+length;continue;
   }
   if(s===0xf0||s===0xf7){
    let len=vlq(end);if(i+len>end)throw Error('Обрезанное MIDI SysEx-событие');
    i+=len;status=0;warnings.add('MIDI SysEx-события не поддерживаются и пропущены; заданные ими тембровые настройки могут отличаться.');continue;
   }
   if(s>=0xf0)throw Error('Неизвестное системное MIDI-событие 0x'+s.toString(16));
   let op=s&0xf0,ch=s&0x0f;
   const readData=()=>{const v=trackByte();if(v&0x80)throw Error('Некорректный MIDI data byte');return v};
   let a=readData(),b=(op===0xc0||op===0xd0)?0:readData(),seq=sequence++;
   rawEventCount++;if(rawEventCount>MAX_AUDIO_EVENTS)throw Error('Слишком много MIDI events для прототипа');
   if(op===0x90&&b>0){
    let key=ch+':'+a,queue=active.get(key)||[];
    queue.push({tick,velocity:b,channel:ch,sequence:seq,noteId:'midi:'+tr+':'+(++noteSerial)});
    active.set(key,queue);
   }else if(op===0x80||(op===0x90&&b===0)){
    let key=ch+':'+a,queue=active.get(key);
    if(queue?.length){
     let on=queue.shift();if(!queue.length)active.delete(key);
     let note={pitch:a,tick:on.tick,len:Math.max(1,tick-on.tick),velocity:on.velocity,track:tr,channel:ch,noteId:on.noteId,sourceTrack:tr};
     notes.push(note);
     events.push({type:'noteOn',tick:on.tick,channel:ch,track:tr,sourceTrack:tr,sequence:on.sequence,noteId:on.noteId,pitch:a,velocity:on.velocity});
     events.push({type:'noteOff',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,noteId:on.noteId,pitch:a,velocity:b});
    }
   }else if(op===0xa0){
    events.push({type:'polyPressure',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,pitch:a,value:b});
   }else if(op===0xb0){
    events.push({type:'cc',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,controller:a,value:b});
   }else if(op===0xc0){
    events.push({type:'programChange',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,program:a,isDrum:ch===9});
   }else if(op===0xd0){
    events.push({type:'channelPressure',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,value:a});
   }else if(op===0xe0){
    events.push({type:'pitchWheel',tick,channel:ch,track:tr,sourceTrack:tr,sequence:seq,value:a|(b<<7)});
   }else throw Error('Неизвестное MIDI channel event 0x'+op.toString(16));
  }
  if(i<end)i=end;
  if([...active.values()].some(q=>q.length))warnings.add('Незавершённые MIDI NoteOn пропущены, чтобы не оставлять ноты активными.');
  rawTracks.push({name:trackName,notes,events});
 }
 const canonical=musicCreateTempoTimeline(tempos,ppq);
 const sec=tick=>musicTickToSeconds(canonical,ppq,tick);
 const sourceToTrack=new Map(),tracks=[];
 for(let sourceTrack=0;sourceTrack<rawTracks.length;sourceTrack++){
  const source=rawTracks[sourceTrack];
  if(!source.notes.length)continue;
  let trackIndex=tracks.length;sourceToTrack.set(sourceTrack,trackIndex);
  tracks.push({name:source.name,notes:source.notes.map(n=>({
   // Original MIDI key-release timing must not be coerced to a 25 ms duration.
   // Audio backends may apply a *sound-rendering* minimum independently.
   pitch:n.pitch,start:sec(n.tick),duration:sec(n.tick+n.len)-sec(n.tick),velocity:n.velocity,
   track:trackIndex,channel:n.channel,noteId:n.noteId,sourceTrack:n.sourceTrack,
   scoreBeat:n.tick/ppq,scoreBeatLength:n.len/ppq
  }))});
 }
 if(!tracks.length)throw Error('MIDI не содержит нот');
 if(tracks.reduce((n,t)=>n+t.notes.length,0)>25000)throw Error('Слишком много MIDI-нот для прототипа');
 const audioEvents=rawTracks.flatMap(t=>t.events).map(e=>({
  ...e,time:sec(e.tick),track:sourceToTrack.has(e.track)?sourceToTrack.get(e.track):null
 })).map(({tick,...e})=>e).sort((a,b)=>a.time-b.time||a.sequence-b.sequence);
 return{
  id:'import-'+Date.now(),title:title.replace(/\.(mid|midi)$/i,'').slice(0,90),
  author:'Импортированный файл · '+tracks.reduce((n,t)=>n+t.notes.length,0)+' нот',
  type:'import',format:'MIDI',tracks,audioEvents,warnings:[...warnings],
  scoreTempoMap:canonical.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))
 };
}
async function importMIDI(file){if(!file)return;try{if(file.size>12*1024*1024)throw Error('Размер MIDI больше 12 МБ — в этом прототипе файл слишком большой');let arr=new Uint8Array(await file.arrayBuffer());let s=parseMidi(arr,file.name);imports.push(s);loadSong(s);state.page='practice';applyPage();state.left=false;applyPanels();notify('Импортировано '+allNotes(s).length+' MIDI-нот');}catch(e){$('errorText').textContent=e.message||String(e);$('importErrorOverlay').classList.add('show')}finally{$('midiFile').value=''}}

