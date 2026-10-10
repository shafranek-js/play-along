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
 midiHeld.clear();stopLiveAll();if(waitReleaseGroup)advanceWaitAfterRelease();midiInput=input||null;deviceName=midiInput?.name||'';
 if(midiInput){midiInput.onmidimessage=onMIDI;if(remember){state.preferredMidiName=midiInput.name||'';persist()}}
 updateDevice();
}
function onMIDI(e){if(!e.data)return;let [s,n,v=0]=e.data;let op=s&0xF0;if(op===0x90&&v>0)onNoteOn(n,v,'midi',e.timeStamp);else if(op===0x80||(op===0x90&&v===0))onNoteOff(n,'midi',e.timeStamp);}
function eventPosition(timestamp){const p=isPlaying?clockPos():pos;if(!isPlaying||!timestamp||!Number.isFinite(timestamp))return p;return p-Math.max(0,Math.min(120,performance.now()-timestamp))/1000*rate()}
function addMonitor(t){monitor.unshift(t);monitor=monitor.slice(0,5);$('midiMonitor').textContent=monitor.join('\n');}
function onNoteOn(note,velocity=85,from='midi',timestamp){
 if(calibrationOpen()&&cal.step<2){calibrateCapture(note);return}
 if(midiHeld.has(note))return; // suppress duplicate NoteOn / key autorepeat
 midiHeld.add(note);noteCount++;addMonitor('ON  '+nameOf(note).padEnd(5)+'  '+String(velocity).padStart(3));
 $('statNotes').textContent=noteCount;$('midiLive').textContent='MIDI: '+nameOf(note)+' · vel '+velocity;
 if(smart.waitingNext&&from==='midi'){midiHeld.delete(note);smartGoNext();return}
 playLive(note,velocity);
 if(isPlaying&&practice){
  const wait=state.mode==='wait';
  // Never score a note before its onset or while the previous key/chord is still held.
  if(!wait||(holdForInput&&!waitReleaseGroup)){
   const at=eventPosition(timestamp);
   const group=wait?practice.nextGroup():null;
   const result=practice.inputOn(note,at,Number.isFinite(timestamp)?timestamp:performance.now());
   if(wait&&result==='released'&&group){
    waitReleaseGroup=group;
    waitReleasePitches=new Set(group.notes.filter(n=>midiHeld.has(n.pitch)).map(n=>n.pitch));
    pos=group.start;holdForInput=true;
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
 pos=completed.start;
 if(ctx){startAt=pos;startAudioTime=ctx.currentTime}
 waitReleaseGroup=null;waitReleasePitches.clear();holdForInput=false;
 if(isPlaying)engineTick();
}
function onNoteOff(note,from='midi',timestamp){
 if(calibrationOpen()&&cal.step<2)return;
 midiHeld.delete(note);releaseLive(note);
 if(isPlaying&&practice){practice.inputOff(note,eventPosition(timestamp));showPractice()}
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
// This preview parser handles SMF formats 0/1, running status, notes and tempo map.
function parseMidi(bytes,title){const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let i=0;const ensure=n=>{if(i+n>bytes.length)throw Error('MIDI-файл повреждён или обрезан')};const u8=()=>{ensure(1);return bytes[i++]},u16=()=>{ensure(2);let n=dv.getUint16(i);i+=2;return n},u32=()=>{ensure(4);let n=dv.getUint32(i);i+=4;return n},str=n=>{ensure(n);let s=String.fromCharCode(...bytes.subarray(i,i+n));i+=n;return s};const vlq=end=>{let n=0;for(let k=0;k<4;k++){if(i>=end)throw Error('Ошибка VLQ');let b=u8();n=(n<<7)|(b&127);if(!(b&128))return n}throw Error('Слишком длинный VLQ')};if(str(4)!=='MThd')throw Error('Это не Standard MIDI File');let hsize=u32();if(hsize<6)throw Error('Некорректный заголовок MIDI');let format=u16(),num=u16(),ppq=u16();i+=hsize-6;if(format>1)throw Error('MIDI Type 2 пока не поддерживается');if(ppq&0x8000)throw Error('SMPTE timing пока не поддерживается');if(!ppq||num>150)throw Error('Некорректный MIDI timing');let rawTracks=[],tempos=[{tick:0,tempo:500000}];for(let tr=0;tr<num;tr++){if(str(4)!=='MTrk')throw Error('Отсутствует дорожка MTrk');let trLen=u32(),end=i+trLen;if(end>bytes.length)throw Error('Обрезанная дорожка');let tick=0,status=0,active=new Map(),notes=[],trackName='Дорожка '+(tr+1);while(i<end){tick+=vlq(end);if(i>=end)break;let b=bytes[i],s=b&0x80?u8():status;if(s>=0x80&&s<0xf0)status=s;if(s===0xff){let meta=u8(),length=vlq(end),from=i;if(from+length>end)throw Error('Повреждённая MIDI мета-секция');if(meta===0x51&&length===3)tempos.push({tick,tempo:(bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2]});if(meta===0x03&&length)trackName=new TextDecoder().decode(bytes.slice(from,from+length)).replace(/[\x00-\x1f]/g,'').slice(0,55)||trackName;i+=length;continue}if(s===0xf0||s===0xf7){let len=vlq(end);i+=len;continue}if(s>=0xf0)throw Error('Неизвестное системное MIDI-событие');let op=s&0xf0,ch=s&0x0f,n=u8(),vel=(op===0xc0||op===0xd0)?0:u8(),key=ch+':'+n;if(op===0x90&&vel>0){let a=active.get(key)||[];a.push({tick,vel});active.set(key,a)}else if(op===0x80||(op===0x90&&vel===0)){let a=active.get(key);if(a?.length){let on=a.shift();notes.push({pitch:n,tick:on.tick,len:Math.max(1,tick-on.tick),velocity:on.vel,track:tr,channel:ch})}}}i=end;rawTracks.push({name:trackName,notes})}tempos.sort((a,b)=>a.tick-b.tick);let canonical=[];for(let e of tempos){if(canonical.length&&canonical.at(-1).tick===e.tick)canonical[canonical.length-1]=e;else canonical.push(e)}let cumulative=0;canonical.forEach((t,k)=>{if(k)cumulative+=(t.tick-canonical[k-1].tick)/ppq*canonical[k-1].tempo/1e6;t.sec=cumulative});function sec(tick){let lo=0,hi=canonical.length;while(lo+1<hi){let m=(lo+hi)>>1;if(canonical[m].tick<=tick)lo=m;else hi=m}let t=canonical[lo];return t.sec+(tick-t.tick)/ppq*t.tempo/1e6}let tracks=rawTracks.map(t=>({name:t.name,notes:t.notes.map(n=>({pitch:n.pitch,start:sec(n.tick),duration:Math.max(.025,sec(n.tick+n.len)-sec(n.tick)),velocity:n.velocity,track:n.track,channel:n.channel,scoreBeat:n.tick/ppq,scoreBeatLength:n.len/ppq}))})).filter(t=>t.notes.length);if(!tracks.length)throw Error('MIDI не содержит нот');if(tracks.reduce((n,t)=>n+t.notes.length,0)>25000)throw Error('Слишком много MIDI-нот для прототипа');tracks.forEach((t,index)=>t.notes.forEach(n=>n.track=index));return{id:'import-'+Date.now(),title:title.replace(/\.(mid|midi)$/i,'').slice(0,90),author:'Импортированный файл · '+tracks.reduce((n,t)=>n+t.notes.length,0)+' нот',type:'import',format:'MIDI',tracks,scoreTempoMap:canonical.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))};}
async function importMIDI(file){if(!file)return;try{if(file.size>12*1024*1024)throw Error('Размер MIDI больше 12 МБ — в этом прототипе файл слишком большой');let arr=new Uint8Array(await file.arrayBuffer());let s=parseMidi(arr,file.name);imports.push(s);loadSong(s);state.page='practice';applyPage();state.left=false;applyPanels();notify('Импортировано '+allNotes(s).length+' MIDI-нот');}catch(e){$('errorText').textContent=e.message||String(e);$('importErrorOverlay').classList.add('show')}finally{$('midiFile').value=''}}

