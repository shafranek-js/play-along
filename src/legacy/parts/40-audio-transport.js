// ===== v0.3 transport bridge: one AudioContext for SoundFont and explicit simple fallback =====
const audioModuleUrl=new URL('./audio/index.js',document.currentScript?.src||location.href);
let audioModulePromise=null,audioEngine=null,audioEnginePromise=null,audioCatalog=null,audioInventory=null,audioEnsurePromise=null,audioBankGeneration=0;
const audioPreparedCache=new Map();
let audioLifecycle='idle',audioRequest=null,audioPendingBank=null,audioError=null,audioNotice=null,audioRequestId=0,audioNoticeId=0;
let audioListeners=new Set(),audioPlayGeneration=0,audioStarting=false,fileCancelPromise=Promise.resolve();
let audioTimelineCache=null,audioTimelineKey='',audioOffScheduled=new Set(),audioDroppedNoteIds=new Set(),audioVisualByNoteId=new Map();
let audioLiveTokens=new Map(),audioLiveNotes=new Map(),audioVoiceSequence=0;
const audioLiveControlState=new Map();
const audioEffectState={enabled:false,reverbGain:.65,chorusGain:.2};
function audioEmit(){const status=audioGetStatus();for(const listener of audioListeners){try{listener(status)}catch(error){console.warn('Audio status listener failed',error)}}}
function audioGetEngine(){return audioEngine}
function audioPresetLabel(patch){return`${patch?.bankMSB??0}:${patch?.bankLSB??0}:${patch?.program??0}${patch?.isDrum?' drum':''}`}
function audioSetNotice(code,message,details={}){audioNotice={id:++audioNoticeId,code,message,...details};audioEmit()}
function audioAcknowledgeNotice(id){if(audioNotice?.id===id){audioNotice=null;audioEmit();return true}return false}
function audioClearNotice(){if(audioNotice){audioNotice=null;audioEmit()}}
function audioScheduleEvent(event){if(!audioEngine)throw new Error('SoundFont engine is not initialized');return audioEngine.scheduleEvent(event)}
async function audioPlanNoteLanes(events,options){audioModulePromise??=import(audioModuleUrl.href);const mod=await audioModulePromise;return mod.planNoteLanes(events,options)}
async function audioCapturePcm(options){if(!audioEngine)await audioEnsureReady();return audioEngine.capturePcm(options)}
function audioBankSummary(bankId,runtime=null){const bank=audioCatalog?.banks?.find(item=>item.id===bankId);return{id:bankId,name:bank?.name||runtime?.name||bankId,version:bank?.version||runtime?.version||null,format:runtime?.format||bank?.format||null,bytes:runtime?.bytes??bank?.bytes??null,sha256:runtime?.sha256||bank?.sha256||null,stableId:bank?.stableId||null}}
function audioGetStatus(){const activeBank=audioInventory?{...audioBankSummary(audioInventory.id,audioInventory),presets:audioInventory.presets?.map(preset=>({...preset}))||[]}:null;const pendingBank=audioPendingBank?audioBankSummary(typeof audioPendingBank==='string'?audioPendingBank:audioPendingBank.id,typeof audioPendingBank==='object'?audioPendingBank:null):null;return{backend:state.audioSettings?.backend||'soundfont',lifecycle:audioLifecycle,selectedBankId:state.audioSettings?.bankId||null,defaultBankId:audioCatalog?.defaultBankId||null,activeBank,pendingBank,request:audioRequest?{...audioRequest}:null,catalog:audioCatalog?.banks?.map(bank=>({...bank}))||[],inventory:audioInventory?.presets?.map(preset=>({...preset}))||[],livePreset:{...(state.audioSettings?.livePreset||{bankMSB:0,bankLSB:0,program:0,isDrum:false})},filePreset:{bankMSB:0,bankLSB:0,program:0,isDrum:false},masterGain:clamp(state.volume/100,0,1),effects:{...audioEffectState},transport:{isPlaying,isStarting:audioStarting,pendingPlay:audioStarting,pos,leadInRemaining:isPlaying&&ctx?Math.max(0,startAudioTime-ctx.currentTime):0},diagnostics:audioEngine?.getMetrics?.()||null,error:audioError,notice:audioNotice}}
function audioSubscribe(callback){if(typeof callback!=='function')throw new TypeError('callback must be a function');audioListeners.add(callback);try{callback(audioGetStatus())}catch(error){console.warn('Audio status listener failed',error)}return()=>audioListeners.delete(callback)}
function audioOperation(operation,callback,bankId=null){const id=++audioRequestId,priorLifecycle=audioLifecycle;audioRequest={id,operation};audioPendingBank=bankId;audioError=null;audioEmit();return Promise.resolve().then(callback).then(result=>{if(audioRequest?.id===id){audioRequest=null;audioPendingBank=null;audioEmit()}return result},error=>{if(audioRequest?.id===id){audioRequest=null;audioPendingBank=null;audioError=String(error?.message||error);audioLifecycle=audioEngine?(audioInventory?(priorLifecycle==='ready'?'ready':'bank-indexed'):'engine-ready'):'error';audioEmit()}throw error})}
function ensureAudio(){if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx}
async function audioLoadEngine(){if(audioEngine)return audioEngine;if(audioEnginePromise)return audioEnginePromise;audioEnginePromise=(async()=>{const a=ensureAudio();audioModulePromise??=import(audioModuleUrl.href);const mod=await audioModulePromise;audioEngine=await mod.createPlaybackAudioEngine(a,{masterGain:clamp(state.volume/100,0,1)});audioCatalog=await audioEngine.getCatalog();audioLifecycle='engine-ready';audioEngine.setMasterGain(clamp(state.volume/100,0,1));await audioEngine.setEffects(audioEffectState);audioEmit();return audioEngine})().catch(error=>{audioEnginePromise=null;audioLifecycle='error';audioError=String(error?.message||error);audioEmit();throw error});return audioEnginePromise}
function audioResolvePatch(patch,inventory=audioInventory,fallback='same-program'){const normalized={bankMSB:patch?.bankMSB??0,bankLSB:patch?.bankLSB??0,program:patch?.program??0,isDrum:patch?.isDrum===true};const found=inventory?.presets?.find(item=>item.bankMSB===normalized.bankMSB&&item.bankLSB===normalized.bankLSB&&item.program===normalized.program&&item.isDrum===normalized.isDrum);if(found)return{patch:normalized,preset:found,fallback:false};const sameProgram=fallback==='same-program'?inventory?.presets?.find(item=>item.bankMSB===0&&item.bankLSB===0&&item.program===normalized.program&&!item.isDrum):null;const piano=sameProgram||inventory?.presets?.find(item=>item.bankMSB===0&&item.bankLSB===0&&item.program===0&&!item.isDrum);if(!piano)throw new Error('Загруженный банк не содержит GM-программу для воспроизведения');return{patch:{bankMSB:piano.bankMSB,bankLSB:piano.bankLSB,program:piano.program,isDrum:false},preset:piano,fallback:true,requested:normalized}}
function audioDefaultDrumPatch(inventory=audioInventory){const presets=inventory?.presets||[];const selected=presets.find(item=>item.isDrum&&item.bankMSB===0&&item.bankLSB===0&&item.program===0)||presets.find(item=>item.isDrum&&item.bankMSB===0&&item.bankLSB===0)||presets.find(item=>item.isDrum);if(!selected)throw new Error('Загруженный банк не содержит доступного ударного комплекта');return{bankMSB:selected.bankMSB,bankLSB:selected.bankLSB,program:selected.program,isDrum:true}}
function audioInitialChannelPatch(channel,filePrograms,inventory=audioInventory){return channel===9&&filePrograms?audioDefaultDrumPatch(inventory):{bankMSB:0,bankLSB:0,program:0,isDrum:false}}
async function audioPreparePatch(patch,pitches,velocities=[32,64,96,127]){const engine=await audioLoadEngine();const notes=[...new Map([...new Set(pitches)].filter(p=>Number.isInteger(p)&&p>=0&&p<=127).flatMap(pitch=>velocities.map(velocity=>[`${pitch}:${velocity}`,{pitch,velocity}]))).values()];if(!notes.length)return[];const cacheKey=`${audioInventory?.id||''}:${patch.bankMSB}:${patch.bankLSB}:${patch.program}:${patch.isDrum?1:0}:${notes.map(note=>`${note.pitch}:${note.velocity}`).sort().join(',')}`;if(audioPreparedCache.has(cacheKey))return audioPreparedCache.get(cacheKey);const promise=(async()=>{const requests=[];for(let index=0;index<notes.length;index+=4096)requests.push({bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:patch.isDrum,notes:notes.slice(index,index+4096)});const results=[];for(let index=0;index<requests.length;index+=256)results.push(await engine.preparePatches(requests.slice(index,index+256)));return results})();audioPreparedCache.set(cacheKey,promise);while(audioPreparedCache.size>256)audioPreparedCache.delete(audioPreparedCache.keys().next().value);try{return await promise}catch(error){audioPreparedCache.delete(cacheKey);throw error}}
async function audioEnsureReady(){if(audioLifecycle==='ready'&&audioEngine&&audioInventory?.id===(state.audioSettings?.bankId||audioCatalog?.defaultBankId))return audioGetStatus();if(audioEnsurePromise)return audioEnsurePromise;const generation=audioBankGeneration;audioEnsurePromise=audioOperation('prepare',async()=>{if(!audioEngine)audioLifecycle='initializing';const engine=await audioLoadEngine();const requestedId=state.audioSettings?.bankId;const requestedBank=requestedId&&audioCatalog.banks.some(bank=>bank.id===requestedId)?requestedId:audioCatalog.defaultBankId;if(requestedId&&requestedBank!==requestedId){state.audioSettings.bankId=requestedBank;audioSetNotice('SAVED_BANK_UNAVAILABLE','Сохранённый банк больше недоступен; выбран банк по умолчанию.');persist()}if(!audioInventory||audioInventory.id!==requestedBank){const inventory=await engine.loadBank(requestedBank);if(generation!==audioBankGeneration)throw new Error('Подготовка банка отменена новой операцией');audioInventory=inventory;state.audioSettings.bankId=requestedBank;audioPreparedCache.clear()}audioLifecycle='bank-indexed';const requestedPatch=state.audioSettings?.livePreset||{bankMSB:0,bankLSB:0,program:0,isDrum:false};const selected=audioResolvePatch(requestedPatch,audioInventory,'piano');if(selected.fallback){state.audioSettings.livePreset=selected.patch;audioSetNotice('LIVE_PRESET_FALLBACK',`${audioPresetLabel(selected.requested)} недоступен; используется ${selected.preset.name}.`,{requestedPreset:selected.requested,selectedPreset:{...selected.patch,name:selected.preset.name}});persist()}if(!selected.patch.isDrum)await audioPreparePatch(selected.patch,Array.from({length:76},(_,i)=>24+i),[32,64,96,127]);if(generation!==audioBankGeneration)throw new Error('Подготовка банка отменена новой операцией');engine.scheduleEvent({type:'programChange',group:'live',channel:0,at:engine.context.currentTime+.003,bankMSB:selected.patch.bankMSB,bankLSB:selected.patch.bankLSB,program:selected.patch.program,isDrum:selected.patch.isDrum});for(const event of audioLiveControlState.values())engine.scheduleEvent({...event,group:'live',channel:0,at:engine.context.currentTime+.004});engine.setMasterGain(clamp(state.volume/100,0,1));audioLifecycle='ready';audioError=null;audioEmit();return audioGetStatus()}).finally(()=>{audioEnsurePromise=null});return audioEnsurePromise}
async function audioSwitchBank(bankId){if(typeof bankId!=='string'||!bankId)throw new TypeError('bankId must be a non-empty string');const generation=++audioBankGeneration;audioClearNotice();pause();await audioPanic({group:'live'});await fileCancelPromise;return audioOperation('switch-bank',async()=>{const engine=await audioLoadEngine();audioCatalog??=await engine.getCatalog();if(!audioCatalog.banks.some(bank=>bank.id===bankId))throw new Error('Неизвестный SoundFont');const previous=audioInventory;try{const inventory=await engine.loadBank(bankId);if(generation!==audioBankGeneration)throw new Error('Запрос смены банка устарел');audioInventory=inventory;state.audioSettings.bankId=bankId;audioTimelineCache=null;audioTimelineKey='';audioPreparedCache.clear();const requested=state.audioSettings.livePreset||{bankMSB:0,bankLSB:0,program:0,isDrum:false};const selected=audioResolvePatch(requested,inventory,'piano');if(selected.fallback){state.audioSettings.livePreset=selected.patch;audioSetNotice('LIVE_PRESET_FALLBACK',`${audioPresetLabel(selected.requested)} отсутствует в выбранном банке; используется ${selected.preset.name}.`,{requestedPreset:selected.requested,selectedPreset:{...selected.patch,name:selected.preset.name}});persist()}if(generation!==audioBankGeneration)throw new Error('Запрос смены банка устарел');if(!selected.patch.isDrum)await audioPreparePatch(selected.patch,Array.from({length:76},(_,i)=>24+i),[32,64,96,127]);if(generation!==audioBankGeneration)throw new Error('Запрос смены банка устарел');engine.setMasterGain(clamp(state.volume/100,0,1));await engine.setEffects(audioEffectState);if(generation!==audioBankGeneration)throw new Error('Запрос смены банка устарел');engine.scheduleEvent({type:'programChange',group:'live',channel:0,at:engine.context.currentTime+.003,bankMSB:selected.patch.bankMSB,bankLSB:selected.patch.bankLSB,program:selected.patch.program,isDrum:selected.patch.isDrum});audioLifecycle='ready';audioError=null;persist();audioEmit();return inventory}catch(error){if(generation!==audioBankGeneration)throw error;const actual=engine.getBankInventory?.();if(actual?.id&&actual.id!==previous?.id){audioInventory=actual;state.audioSettings.bankId=actual.id;audioLifecycle='bank-indexed';audioSetNotice('BANK_INDEXED_PREPARATION_FAILED',`Банк ${actual.id} загружен, но подготовить тембр не удалось.`);persist()}else{audioInventory=previous;state.audioSettings.bankId=previous?.id||null;audioLifecycle=previous?'ready':'error'}throw error}},bankId)}
async function audioSelectLivePreset(patch){audioClearNotice();const engine=await audioLoadEngine();if(!audioInventory)await audioEnsureReady();const selected=audioResolvePatch(patch,audioInventory,'piano');if(!selected.patch.isDrum)await audioPreparePatch(selected.patch,Array.from({length:76},(_,i)=>24+i),[32,64,96,127]);state.audioSettings.livePreset=selected.patch;if(selected.fallback)audioSetNotice('LIVE_PRESET_FALLBACK',`${audioPresetLabel(selected.requested)} отсутствует; используется ${selected.preset.name}.`,{requestedPreset:selected.requested,selectedPreset:{...selected.patch,name:selected.preset.name}});else audioEmit();engine.scheduleEvent({type:'programChange',group:'live',channel:0,at:engine.context.currentTime+.003,bankMSB:selected.patch.bankMSB,bankLSB:selected.patch.bankLSB,program:selected.patch.program,isDrum:selected.patch.isDrum});persist();return selected.patch}
async function audioSelectFilePreset(patch){if(!audioInventory)await audioEnsureReady();const selected=audioResolvePatch(patch,audioInventory,'same-program');if(!selected.patch.isDrum)await audioPreparePatch(selected.patch,Array.from({length:76},(_,i)=>24+i),[32,64,96,127]);audioTimelineCache=null;audioTimelineKey='';audioEmit();return selected.patch}
function audioListPresets({group='gm',bankId=audioInventory?.id}={}){if(!audioInventory||bankId!==audioInventory.id)return[];return audioInventory.presets.filter(preset=>group==='drums'?preset.isDrum:group==='extra'?(!preset.isDrum&&(preset.bankMSB!==0||preset.bankLSB!==0)):group==='all'?true:(!preset.isDrum&&preset.bankMSB===0&&preset.bankLSB===0)).map(preset=>({...preset}))}
function audioSetMasterVolume(value){if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Master volume must be from 0 to 1');state.volume=value*100;if(audioEngine)audioEngine.setMasterGain(value);persist();audioEmit()}
function audioSetSimpleFallback(enabled){if(typeof enabled!=='boolean')throw new TypeError('enabled must be boolean');audioClearNotice();const next=enabled?'simple':'soundfont';if(state.audioSettings.backend!==next)audioPanic({group:'all'}).catch(()=>{});state.audioSettings.backend=next;audioError=null;persist();audioEmit();return state.audioSettings.backend}
function audioUseSimpleSound(){return audioSetSimpleFallback(true)}
async function audioPanic({group='all'}={}) {
 if(!['all','file','live'].includes(group))throw new TypeError('group must be all, file, or live');
 if(group==='all'){
  if(isPlaying&&ctx)pos=clockPos();audioPlayGeneration++;audioStarting=false;
  if(isPlaying&&practice)for(const pitch of [...practice.played.keys()])practice.inputOff(pitch,pos);
  isPlaying=false;holdForInput=false;waitReleaseGroup=null;waitReleasePitches.clear();
  if(schedulerTimer!==null){clearInterval(schedulerTimer);schedulerTimer=null}
 }
 if(group==='live'||group==='all'){
  for(const [pitch,voice] of liveVoices){try{voice.g.gain.cancelScheduledValues(ctx?.currentTime||0);voice.g.gain.setValueAtTime(0,ctx?.currentTime||0);voice.o.stop((ctx?.currentTime||0)+.005)}catch{}liveVoices.delete(pitch)}
  for(const pitch of audioLiveNotes.keys())audioLiveTokens.set(pitch,(audioLiveTokens.get(pitch)||0)+1);
  audioLiveNotes.clear();audioLiveControlState.clear();
 }
 if(group==='file'||group==='all'){
  for(const voice of activeVoices)if(voice.group==='file'){if(voice.o){try{voice.g.gain.cancelScheduledValues(ctx?.currentTime||0);voice.g.gain.setValueAtTime(0,ctx?.currentTime||0);voice.o.stop((ctx?.currentTime||0)+.005)}catch{}}activeVoices.delete(voice)}
  audioVisualByNoteId.clear();audioOffScheduled.clear();audioDroppedNoteIds.clear();
 }
 if(!audioEngine){audioEmit();if(group==='all')updateUI();return}
 const groups=group==='all'?['file','live']:[group];
 const resetPromise=Promise.all(groups.map(async name=>{
  try{
   await audioEngine.cancelGroup(name);
   // Queue panic resets at the earliest AudioContext time after the cancel
   // acknowledgement. A fresh live NoteOn is scheduled at now + 3 ms; placing
   // resets at +4 ms lets that note start first and CC120 then kills it.
   const at=audioEngine.context.currentTime;
   for(let channel=0;channel<16;channel++){
    for(const controller of [64,66,120,121])audioEngine.scheduleEvent({type:'cc',group:name,channel,controller,value:0,at});
    audioEngine.scheduleEvent({type:'pitchWheel',group:name,channel,value:8192,at});
   }
   if(name==='live'){
    const patch=state.audioSettings?.livePreset||{bankMSB:0,bankLSB:0,program:0,isDrum:false};
    audioEngine.scheduleEvent({type:'programChange',group:'live',channel:0,bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:patch.isDrum,at});
   }
  }catch(error){audioError=String(error?.message||error)}
 }));
 if(group==='file'||group==='all')fileCancelPromise=resetPromise;
 await resetPromise;audioEmit();if(group==='all')updateUI();
}
function audioLiveControl(event){if(!event||typeof event.type!=='string')return false;const key=event.type==='cc'?`cc:${event.controller}`:event.type==='pitchWheel'?'pitchWheel':event.type==='channelPressure'?'channelPressure':event.type==='polyPressure'?`polyPressure:${event.pitch}`:null;if(!key)return false;const normalized={...event,group:'live',channel:0};audioLiveControlState.set(key,normalized);if(!audioEngine||audioLifecycle!=='ready')return true;try{audioEngine.scheduleEvent({...normalized,at:audioEngine.context.currentTime+.002});return true}catch(error){audioError=String(error?.message||error);audioEmit();return false}}
// A disconnected MIDI controller's sustain/sostenuto/pitch-wheel should not
// remain latched. Unlike audioPanic('live'), preserve any virtual-key voice.
function audioResetLiveInputControls(){
 audioLiveControlState.clear();
 for(const controller of [64,66,121])audioLiveControl({type:'cc',controller,value:0});
 audioLiveControl({type:'pitchWheel',value:8192});
}
function rate(){return state.speed/100}
function clockPos(){
 if(!isPlaying||!ctx)return pos;
 const v=Math.max(startAt,startAt+(ctx.currentTime-startAudioTime)*rate());
 if(state.mode==='wait'&&practice){
  // A completed note/chord does not advance the sheet until the keys are released.
  if(waitReleaseGroup){pos=practice.playableStart(waitReleaseGroup);return pos}
  const next=practice.nextGroup();
  const nextStart=next?practice.playableStart(next):null;
  if(next&&v>=nextStart-1e-5){
   pos=nextStart;
   if(!holdForInput){holdForInput=true;startAt=pos;startAudioTime=ctx.currentTime}
   return pos;
  }
  if(holdForInput)return pos;
 }
 return v;
}
function silence(){for(const v of [...activeVoices]){if(v.o){try{v.g.gain.cancelScheduledValues(ctx.currentTime);v.g.gain.setValueAtTime(0,ctx.currentTime);v.o.stop(ctx.currentTime+.004)}catch{}}activeVoices.delete(v)}audioVisualByNoteId.clear();audioOffScheduled.clear();audioDroppedNoteIds.clear()}
function sound(pitch,velocity,when,len,sourceNote=null){if(state.volume<=0)return null;let a=ensureAudio(),t=Math.max(a.currentTime+.003,when),dur=Math.max(.05,Math.min(35,len)),g=a.createGain(),o=a.createOscillator();o.type='triangle';o.frequency.value=440*2**((pitch-69)/12);const amp=clamp(state.volume/100,0,.9)*clamp(velocity/127,0,1)*.22;if(amp<=0)return null;
 g.gain.setValueAtTime(0,t);g.gain.exponentialRampToValueAtTime(amp,t+.009);g.gain.setValueAtTime(amp*.6,t+.045);g.gain.exponentialRampToValueAtTime(.00001,t+dur);o.connect(g);g.connect(a.destination);const voice={o,g,pitch,startTime:t,endTime:t+dur,source:'song',group:'file',sourceNote};activeVoices.add(voice);o.onended=()=>{activeVoices.delete(voice);o.disconnect();g.disconnect()};o.start(t);o.stop(t+dur+.04);return voice;}
// A short note-block audition is NOT MIDI input and must not advance Wait,
// scoring, the transport, or held-key state. SoundFont uses the same live
// engine but a reserved audition channel; simple fallback uses the existing
// short oscillator voice, without routing through onNoteOn / practice.
let audioAuditionSerial=0;
async function audioAuditionNote(note){
 if(!note||!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
    !current||state.volume<=0)return false;
 const song=current,serial=++audioAuditionSerial;
 const velocity=clamp(Math.round(Number(note.velocity)||85),1,127);
 const length=clamp(Number(note.duration)||.38,.20,.75);
 if(state.audioSettings?.backend==='simple'){
  const a=ensureAudio();
  sound(note.pitch,velocity,a.currentTime+.004,length);
  return true;
 }
 try{
  ensureAudio(); // synchronous user-gesture activation
  await audioEnsureReady();
  if(current!==song||serial!==audioAuditionSerial||
     state.audioSettings?.backend!=='soundfont')return false;
  const patch=audioResolvePatch(state.audioSettings?.livePreset,audioInventory).patch;
  await audioPreparePatch(patch,[note.pitch],[velocity]);
  if(current!==song||serial!==audioAuditionSerial||
     state.audioSettings?.backend!=='soundfont')return false;
  const engine=audioEngine,at=engine.context.currentTime+.009;
  const noteId='note-audition-'+serial+'-'+note.pitch;
  // Channel 1 avoids the virtual / USB piano's live channel 0.
  engine.scheduleEvent({type:'programChange',group:'live',channel:1,at,
   bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:patch.isDrum});
  engine.scheduleEvent({type:'noteOn',group:'live',channel:1,noteId,
   pitch:note.pitch,velocity,at:at+.004});
  engine.scheduleEvent({type:'noteOff',group:'live',channel:1,noteId,
   pitch:note.pitch,at:at+length+.004});
  return true;
 }catch(error){
  console.warn('Не удалось озвучить выбранную ноту',error);
  if(current===song)notify('Не удалось озвучить ноту. Проверь настройки звука.');
  return false;
 }
}
function playLive(pitch,velocity=85,channel=0){if(!Number.isInteger(pitch)||pitch<0||pitch>127||liveVoices.has(pitch)||audioLiveNotes.has(pitch))return;const a=ensureAudio();const token=(audioLiveTokens.get(pitch)||0)+1;audioLiveTokens.set(pitch,token);const noteId='live-'+(++audioVoiceSequence)+'-'+pitch;if(state.audioSettings?.backend==='simple'){if(state.volume<=0)return;const t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.value=440*2**((pitch-69)/12);const amp=clamp(state.volume/100,0,.9)*clamp(velocity/127,0,1)*.19;if(amp<=0)return;g.gain.setValueAtTime(0,t);g.gain.exponentialRampToValueAtTime(amp,t+.012);o.connect(g);g.connect(a.destination);o.start(t);liveVoices.set(pitch,{o,g});o.onended=()=>{if(liveVoices.get(pitch)?.o===o)liveVoices.delete(pitch);o.disconnect();g.disconnect()};return}const selectedPatch=state.audioSettings?.livePreset||{bankMSB:0,bankLSB:0,program:0,isDrum:false};const safeVelocity=clamp(Math.round(velocity),1,127);audioLiveNotes.set(pitch,{noteId,channel:0,token});audioEnsureReady().then(async()=>{if(state.audioSettings?.backend!=='soundfont'||audioLiveTokens.get(pitch)!==token||!midiHeld.has(pitch)||audioLiveNotes.get(pitch)?.noteId!==noteId)return;const activePatch=state.audioSettings?.livePreset||selectedPatch;await audioPreparePatch(activePatch,[pitch],[safeVelocity]);if(state.audioSettings?.backend!=='soundfont'||audioLiveTokens.get(pitch)!==token||!midiHeld.has(pitch)||audioLiveNotes.get(pitch)?.noteId!==noteId)return;audioEngine.scheduleEvent({type:'noteOn',group:'live',channel:0,noteId,pitch,velocity:safeVelocity,at:Math.max(audioEngine.context.currentTime+.003,a.currentTime+.003)})}).catch(error=>{if(audioLiveTokens.get(pitch)===token){audioLiveNotes.delete(pitch);audioError=String(error?.message||error);audioEmit()}})}
function releaseLive(pitch,channel=0){audioLiveTokens.set(pitch,(audioLiveTokens.get(pitch)||0)+1);const simple=liveVoices.get(pitch);if(simple&&ctx){liveVoices.delete(pitch);try{simple.g.gain.cancelScheduledValues(ctx.currentTime);simple.g.gain.setTargetAtTime(.00001,ctx.currentTime,.04);simple.o.stop(ctx.currentTime+.20)}catch{}}const active=audioLiveNotes.get(pitch);if(active){audioLiveNotes.delete(pitch);if(audioEngine&&audioLifecycle==='ready'){try{audioEngine.scheduleEvent({type:'noteOff',group:'live',channel:active.channel??0,noteId:active.noteId,pitch,at:audioEngine.context.currentTime+.003})}catch(error){audioError=String(error?.message||error);audioEmit()}}}}
function stopLiveAll(){audioPanic({group:'live'}).catch(()=>{})}
// Show only notes that the audio clock says are actually sounding now.
// Separate MIDI input from scheduled playback so the two visual states cannot get confused.
function soundingSongKeys(){
 const keys=new Set();if(!isPlaying||!ctx)return keys;
 const now=ctx.currentTime;
 for(const voice of activeVoices)if(voice.startTime<=now+.002&&voice.endTime>now+.002)keys.add(voice.pitch);
 return keys;
}
// The falling blocks and piano keys share the ACTUAL WebAudio voice schedule.
// A note is lit only while its own oscillator is audible; scheduled-ahead
// notes, repeated pitches and overlapping voices cannot light the wrong block.
function soundingScoreNotes(){
 const playing=new Set();
 if(!isPlaying||!ctx)return playing;
 const now=ctx.currentTime;
 for(const voice of activeVoices){
  if(voice.sourceNote&&voice.startTime<=now+.002&&voice.endTime>now+.002)playing.add(voice.sourceNote);
 }
 return playing;
}
// In Wait/Tempo, the practice part is played by the person, not by the song
// synth. Tie that orange highlight to the note awarded by PracticeSession.
function performedScoreNotes(){
 const playing=new Set();
 if(!state.highlight||!practice)return playing;
 for(const active of practice.played.values()){
  // PracticeSession stores an array per pressed pitch: unison voices share a
  // physical key and must all remain highlighted until its NoteOff.
  for(const item of Array.isArray(active)?active:[active]){
   if(!midiHeld.has(item.pitch))continue;
   for(const [original,record] of practice.noteLookup){
    if(record===item){playing.add(original);break}
   }
  }
 }
 return playing;
}
const scheduleAhead=.16;
function audioSequence(){if(!current)return[];const notes=state.mode==='listen'?(state.accompany?current.tracks.flatMap((t,i)=>i===state.track?selectedPlaybackNotes():t.notes):selectedPlaybackNotes()).slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch):state.accompany?current.tracks.flatMap((t,i)=>i===state.track?[]:t.notes).sort((a,b)=>a.start-b.start||a.pitch-b.pitch):[];return loop.enabled&&Number.isFinite(loop.end)?notes.filter(note=>note.start<loop.end):notes}
function audioTimelineKeyForSong(){const notes=audioSequence();return JSON.stringify([current?.id,state.mode,state.track,state.accompany,state.audioSettings?.useFilePrograms!==false,audioInventory?.id,loop.enabled?loop.end:null,notes.map((note,index)=>[note.noteId||index,note.pitch,note.start,note.duration,note.velocity,note.channel,note.track])])}
function audioBuildEvents(){const visualNoteById=new Map();const notes=audioSequence().map((sourceNote,index)=>{const noteId=String(sourceNote.noteId||`legacy:${current?.id||'song'}:${sourceNote.track??0}:${index}`);visualNoteById.set(noteId,sourceNote);return{...sourceNote,noteId,velocity:clamp(Math.round(sourceNote.velocity||85),1,127)}});const noteById=new Map(notes.map(note=>[note.noteId,note]));const includedChannels=new Set(notes.map(note=>Number.isInteger(note.channel)?note.channel:0));let events;let firstMissing=null;
 if(Array.isArray(current?.audioEvents)&&current.audioEvents.length){const sourceEvents=current.audioEvents;events=sourceEvents.filter(event=>{if(event.type==='noteOn'||event.type==='noteOff')return noteById.has(String(event.noteId));return includedChannels.has(Number.isInteger(event.channel)?event.channel:0)}).map((event,index)=>{const clone={...event,sequence:Number.isSafeInteger(event.sequence)?event.sequence:index,channel:Number.isInteger(event.channel)?event.channel:0};const note=noteById.get(String(event.noteId));if(note&&(event.type==='noteOn'||event.type==='noteOff')){clone.pitch=note.pitch;if(event.type==='noteOn')clone.velocity=note.velocity}return clone})}
  else{events=[];let sequence=0;for(const note of notes){events.push({type:'noteOn',time:note.start,channel:note.channel??0,track:note.track,sourceTrack:note.sourceTrack,sequence:sequence++,noteId:note.noteId,pitch:note.pitch,velocity:note.velocity,isDrum:note.isDrum});events.push({type:'noteOff',time:note.start+Math.max(.005,note.duration),channel:note.channel??0,track:note.track,sourceTrack:note.sourceTrack,sequence:sequence++,noteId:note.noteId,pitch:note.pitch})}}
  if(loop.enabled&&Number.isFinite(loop.end))events=events.filter(event=>event.type==='noteOn'||event.type==='noteOff'?noteById.has(String(event.noteId)):event.time<loop.end);
 events.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);const filePrograms=state.audioSettings?.useFilePrograms!==false;const channels=new Array(16).fill(0).map((_,channel)=>audioInitialChannelPatch(channel,filePrograms));const patchByNoteId=new Map();const normalized=[];for(const event of events){if(!Number.isInteger(event.channel)||event.channel<0||event.channel>15)continue;const channel=channels[event.channel];if(event.type==='cc'){if(filePrograms&&event.controller===0)channel.bankMSB=event.value;if(filePrograms&&event.controller===32)channel.bankLSB=event.value;normalized.push(event);continue}if(event.type==='programChange'){if(!filePrograms)continue;if(event.bankMSB!==undefined)channel.bankMSB=event.bankMSB;if(event.bankLSB!==undefined)channel.bankLSB=event.bankLSB;if(event.isDrum!==undefined)channel.isDrum=event.isDrum;channel.program=event.program;const resolved=audioResolvePatch(channel);Object.assign(channel,resolved.patch);normalized.push({...event,bankMSB:channel.bankMSB,bankLSB:channel.bankLSB,program:channel.program,isDrum:channel.isDrum});if(resolved.fallback&&!firstMissing)firstMissing={requested:resolved.requested,preset:resolved.preset};continue}if(event.type==='noteOn'){const note=noteById.get(String(event.noteId));const requested=filePrograms?{...channel,isDrum:typeof event.isDrum==='boolean'?event.isDrum:channel.isDrum}:{bankMSB:0,bankLSB:0,program:0,isDrum:false};const resolved=audioResolvePatch(requested);patchByNoteId.set(String(event.noteId),resolved.patch);if(resolved.fallback&&!firstMissing)firstMissing={requested:resolved.requested,preset:resolved.preset};const patchChanged=channel.bankMSB!==resolved.patch.bankMSB||channel.bankLSB!==resolved.patch.bankLSB||channel.program!==resolved.patch.program||channel.isDrum!==resolved.patch.isDrum;if(filePrograms&&patchChanged){normalized.push({type:'programChange',time:event.time,channel:event.channel,track:event.track,sourceTrack:event.sourceTrack,sequence:event.sequence,noteId:event.noteId,isDrum:resolved.patch.isDrum,bankMSB:resolved.patch.bankMSB,bankLSB:resolved.patch.bankLSB,program:resolved.patch.program,_patch:resolved.patch})}Object.assign(channel,resolved.patch);normalized.push({...event,pitch:note?.pitch??event.pitch,velocity:note?.velocity??event.velocity,isDrum:resolved.patch.isDrum,_patch:resolved.patch});continue}if(event.type==='noteOff'){const note=noteById.get(String(event.noteId));normalized.push({...event,pitch:note?.pitch??event.pitch,_patch:patchByNoteId.get(String(event.noteId))});continue}normalized.push(event)}if(firstMissing)audioSetNotice('FILE_PRESET_FALLBACK',`Источник использует отсутствующий тембр ${audioPresetLabel(firstMissing.requested)}; применяется ${firstMissing.preset.name}.`,{requestedPreset:firstMissing.requested,selectedPreset:{bankMSB:firstMissing.preset.bankMSB,bankLSB:firstMissing.preset.bankLSB,program:firstMissing.preset.program,isDrum:firstMissing.preset.isDrum,name:firstMissing.preset.name}})
 if(loop.enabled&&Number.isFinite(loop.end)){for(const event of normalized)if(event.type==='noteOff'&&event.time>loop.end)event.time=loop.end;}
 normalized.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);return{events:normalized,notes,noteById,visualNoteById,patchByNoteId}}
// Sustain is a channel control, not an extension of the source MIDI NoteOff.
// Derive the VISUAL-only release time from original, sequence-ordered CC64
// events. No note timing, audio events or imported source bytes are modified.
function audioSustainVisualEnds(events,lastTime){
 const pedal=new Array(16).fill(false),latched=Array.from({length:16},()=>new Set()),ends=new Map();
 const release=(channel,time)=>{for(const noteId of latched[channel])ends.set(noteId,Math.min(lastTime,time));latched[channel].clear()};
 for(const event of events){
  const channel=event.channel;
  if(!Number.isInteger(channel)||channel<0||channel>15)continue;
  if(event.type==='noteOff'&&pedal[channel]){latched[channel].add(event.noteId);continue}
  if(event.type!=='cc')continue;
  if(event.controller===64){const down=event.value>=64;if(pedal[channel]&&!down)release(channel,event.time);pedal[channel]=down}
  else if([120,121,123,124,125,126,127].includes(event.controller)){release(channel,event.time);pedal[channel]=false}
 }
 for(let channel=0;channel<16;channel++)release(channel,lastTime);
 return ends;
}
function audioPatchKey(patch){return`${patch.bankMSB}:${patch.bankLSB}:${patch.program}:${patch.isDrum?1:0}`}
function audioFallbackCandidates(patch){const presets=audioInventory?.presets||[];const sameProgram=!patch.isDrum?presets.find(item=>!item.isDrum&&item.bankMSB===0&&item.bankLSB===0&&item.program===patch.program):null;const piano=presets.find(item=>!item.isDrum&&item.bankMSB===0&&item.bankLSB===0&&item.program===0);return[sameProgram,piano].filter((item,index,list)=>item&&audioPatchKey(item)!==audioPatchKey(patch)&&list.findIndex(other=>other&&audioPatchKey(other)===audioPatchKey(item))===index).map(item=>({bankMSB:item.bankMSB,bankLSB:item.bankLSB,program:item.program,isDrum:item.isDrum,name:item.name}))}
async function audioPrepareTimeline(){
 if(!audioEngine||!audioInventory)throw new Error('SoundFont ещё не готов');
 const key=audioTimelineKeyForSong();if(audioTimelineCache&&audioTimelineCache.song===current&&audioTimelineKey===key)return audioTimelineCache;
 const built=audioBuildEvents();const groups=new Map();
 for(const event of built.events)if(event.type==='noteOn'){
  const patch=event._patch||audioResolvePatch({bankMSB:0,bankLSB:0,program:0,isDrum:false}).patch;event._patch=patch;
  const patchKey=audioPatchKey(patch);let group=groups.get(patchKey);if(!group){group={patch,notes:new Map()};groups.set(patchKey,group)}
  const noteKey=`${event.pitch}:${event.velocity}`;let item=group.notes.get(noteKey);if(!item){item={pitch:event.pitch,velocity:event.velocity,events:[]};group.notes.set(noteKey,item)}item.events.push(event)
 }
 const exclusiveByPatchNote=new Map(),unsupportedNoteIds=new Set();
 const recordPreparation=(result)=>{for(const sample of result?.exclusiveClasses||[])exclusiveByPatchNote.set(`${sample.bankMSB}:${sample.bankLSB}:${sample.program}:${sample.isDrum?1:0}:${sample.pitch}:${sample.velocity}`,sample.exclusiveClass)};
 const prepareOne=async(patch,note)=>{const result=await audioEngine.preparePatches([{bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:patch.isDrum,notes:[{pitch:note.pitch,velocity:note.velocity}]}]);recordPreparation(result)};
 for(const group of groups.values()){
  const notes=[...group.notes.values()];
  for(let start=0;start<notes.length;start+=4096){
   const chunk=notes.slice(start,start+4096),request={bankMSB:group.patch.bankMSB,bankLSB:group.patch.bankLSB,program:group.patch.program,isDrum:group.patch.isDrum,notes:chunk.map(({pitch,velocity})=>({pitch,velocity}))};
   try{recordPreparation(await audioEngine.preparePatches([request]));continue}catch(error){if(!['PREPARE_SAMPLE','PREPARE_PATCH_NOT_FOUND'].includes(error?.code))throw error}
   for(const note of chunk){let prepared=false;try{await prepareOne(group.patch,note);prepared=true}catch(error){if(!['PREPARE_SAMPLE','PREPARE_PATCH_NOT_FOUND'].includes(error?.code))throw error}
    if(prepared)continue;
    let fallback=null;for(const candidate of audioFallbackCandidates(group.patch)){try{await prepareOne(candidate,note);fallback=candidate;break}catch(error){if(!['PREPARE_SAMPLE','PREPARE_PATCH_NOT_FOUND'].includes(error?.code))throw error}}
    if(fallback){for(const event of note.events){event._patch=fallback;event.isDrum=fallback.isDrum}audioSetNotice('FILE_SAMPLE_FALLBACK',`${audioPresetLabel(group.patch)} не содержит сэмпл для ноты ${note.pitch}; используется ${fallback.name||audioPresetLabel(fallback)}.`,{requestedPreset:group.patch,selectedPreset:fallback})}
    else{for(const event of note.events)unsupportedNoteIds.add(event.noteId);audioSetNotice('FILE_SAMPLE_UNAVAILABLE',`Для ноты ${note.pitch} не найден подходящий сэмпл; эта нота будет пропущена.`,{requestedPreset:group.patch})}
   }
  }
 }
 if(unsupportedNoteIds.size)built.events=built.events.filter(event=>!unsupportedNoteIds.has(event.noteId));
 // A per-note sample fallback may change the active patch. Rebuild routed
 // program changes so later notes return to their own resolved patches.
 const filePrograms=state.audioSettings?.useFilePrograms!==false;const channelPatches=new Array(16).fill(0).map((_,channel)=>audioInitialChannelPatch(channel,filePrograms));
 const withRoutedPrograms=[];
 for(const event of built.events){
  if(event.type==='programChange'){const patch=event._patch||{bankMSB:event.bankMSB??0,bankLSB:event.bankLSB??0,program:event.program,isDrum:event.isDrum===true};channelPatches[event.channel]=patch;withRoutedPrograms.push(event);continue}
  if(event.type==='noteOn'&&event._patch){const active=channelPatches[event.channel];if(audioPatchKey(active)!==audioPatchKey(event._patch)){withRoutedPrograms.push({type:'programChange',time:event.time,channel:event.channel,track:event.track,sourceTrack:event.sourceTrack,sequence:event.sequence,bankMSB:event._patch.bankMSB,bankLSB:event._patch.bankLSB,program:event._patch.program,isDrum:event._patch.isDrum,_patch:event._patch});channelPatches[event.channel]=event._patch}}
  withRoutedPrograms.push(event)
 }
 built.events=withRoutedPrograms.sort((a,b)=>a.time-b.time||a.sequence-b.sequence);
 const exclusiveClassByNoteId={};for(const event of built.events)if(event.type==='noteOn'){const patch=event._patch;exclusiveClassByNoteId[event.noteId]=exclusiveByPatchNote.get(`${patch.bankMSB}:${patch.bankLSB}:${patch.program}:${patch.isDrum?1:0}:${event.pitch}:${event.velocity}`)||0}
 const lanes=audioModulePromise?await audioModulePromise.then(mod=>mod.planNoteLanes(built.events,{maxLanesPerPitch:4,exclusiveClassByNoteId})):null;if(!lanes)throw new Error('Note lane planner is unavailable');const laneByNoteId=new Map(lanes.assignments.map(item=>[item.noteId,item.lane]));for(const event of built.events)if(event.type==='noteOn'||event.type==='noteOff')event.lane=laneByNoteId.get(event.noteId)??0;
 const offByNoteId=new Map(built.events.filter(event=>event.type==='noteOff').map(event=>[event.noteId,event]));
 const visualStopAt=loop.enabled&&loop.end!=null?Math.min(loop.end,duration()):duration();
 const sustainVisualEnds=audioSustainVisualEnds(built.events,visualStopAt);
 const result={...built,song:current,offByNoteId,sustainVisualEnds,lanes:lanes.diagnostics};audioTimelineCache=result;audioTimelineKey=key;audioEmit();return result
}
function audioSchedule(event,at){if(!audioEngine)return null;const normalized={...event,group:'file',at,epoch:audioEngine.epochFor('file')};delete normalized.time;delete normalized.sequence;delete normalized.track;delete normalized.sourceTrack;delete normalized._patch;return audioEngine.scheduleEvent(normalized)}
function audioAddVisual(event,at,endAt){const voice={pitch:event.pitch,startTime:at,endTime:endAt,source:'song',group:'file',sourceNote:audioTimelineCache?.visualNoteById.get(event.noteId)||null,noteId:event.noteId};activeVoices.add(voice);audioVisualByNoteId.set(event.noteId,voice);setTimeout(()=>{activeVoices.delete(voice);if(audioVisualByNoteId.get(event.noteId)===voice)audioVisualByNoteId.delete(event.noteId)},Math.max(100,Math.min(3600000,(endAt-(ctx?.currentTime||0)+.25)*1000)));return voice}
function audioTimeAtScore(time){return Math.max(audioEngine.context.currentTime+.003,startAudioTime+(time-startAt)/rate())}
function audioScheduleTimelineEvent(event,{at=null,waitPair=false}={}){const time=at??audioTimeAtScore(event.time);if(event.type==='noteOn'){audioSchedule({...event,type:'noteOn'},time);const off=audioTimelineCache.offByNoteId.get(event.noteId);const endScore=off?off.time:event.time+.1;const sustainedUntil=!waitPair?audioTimelineCache.sustainVisualEnds.get(event.noteId):null;const visualEnd=Number.isFinite(sustainedUntil)?Math.max(endScore,sustainedUntil):endScore;const endAt=waitPair?time+Math.max(.005,endScore-event.time)/rate():audioTimeAtScore(visualEnd);audioAddVisual(event,time,endAt);if(waitPair&&off){audioSchedule({...off,type:'noteOff'},endAt);audioOffScheduled.add(off.noteId)}}else if(event.type==='noteOff'){if(audioOffScheduled.delete(event.noteId))return;audioSchedule(event,time);const voice=audioVisualByNoteId.get(event.noteId);if(voice){const sustainedUntil=audioTimelineCache?.sustainVisualEnds.get(event.noteId);voice.endTime=Number.isFinite(sustainedUntil)&&sustainedUntil>event.time?audioTimeAtScore(sustainedUntil):time}}else if(event.type==='programChange'||event.type==='cc'||event.type==='pitchWheel'||event.type==='channelPressure'||event.type==='polyPressure')audioSchedule(event,time)}
function audioReplayStateAtPosition(timeline){
 const engine=audioEngine,at=Math.max(engine.context.currentTime+.004,startAudioTime),filePrograms=state.audioSettings?.useFilePrograms!==false;
 const channelSet=new Set(timeline.events.filter(event=>['noteOn','programChange','cc','pitchWheel','channelPressure','polyPressure'].includes(event.type)).map(event=>event.channel));
 for(const channel of channelSet){const patch=audioInitialChannelPatch(channel,filePrograms);audioSchedule({type:'cc',channel,controller:64,value:0},at);audioSchedule({type:'cc',channel,controller:66,value:0},at);audioSchedule({type:'cc',channel,controller:121,value:0},at);audioSchedule({type:'programChange',channel,bankMSB:patch.bankMSB,bankLSB:patch.bankLSB,program:patch.program,isDrum:patch.isDrum},at)}
 const history=timeline.events.filter(event=>event.time<pos&&['programChange','cc','pitchWheel','channelPressure','polyPressure'].includes(event.type));for(const event of history)audioScheduleTimelineEvent(event,{at});
 const pedal=new Array(16).fill(false),active=new Map(),activeByChannel=Array.from({length:16},()=>new Set()),sustainedByChannel=Array.from({length:16},()=>new Set());
 const forget=(noteId)=>{const note=active.get(noteId);if(!note)return;note.active=false;note.held=false;note.sustained=false;activeByChannel[note.channel].delete(noteId);sustainedByChannel[note.channel].delete(noteId)};
 for(const event of timeline.events){if(!(event.time<pos))break;if(event.type==='noteOn'){const note={event,channel:event.channel,held:true,sustained:false,active:true};active.set(event.noteId,note);activeByChannel[event.channel].add(event.noteId);continue}if(event.type==='noteOff'){const note=active.get(event.noteId);if(!note?.active)continue;note.held=false;if(pedal[event.channel]){note.sustained=true;sustainedByChannel[event.channel].add(event.noteId)}else forget(event.noteId);continue}if(event.type!=='cc')continue;
  if(event.controller===64){const next=event.value>=64;if(pedal[event.channel]&&!next){for(const noteId of [...sustainedByChannel[event.channel]])forget(noteId)}pedal[event.channel]=next;continue}
  if(event.controller===121){pedal[event.channel]=false;for(const noteId of [...sustainedByChannel[event.channel]])forget(noteId);continue}
  if([120,123,124,125,126,127].includes(event.controller)){pedal[event.channel]=false;for(const noteId of [...activeByChannel[event.channel]])forget(noteId)}
 }
 for(const note of active.values())if(note.active){const event=note.event,off=timeline.offByNoteId.get(event.noteId);if(!off)continue;const now=Math.max(engine.context.currentTime+.007,startAudioTime+.007);audioSchedule({...event,type:'noteOn'},now);const offAt=note.sustained?now+.004:Math.max(now+.004,audioTimeAtScore(off.time));audioSchedule({...off,type:'noteOff'},offAt);const sustainedUntil=timeline.sustainVisualEnds.get(event.noteId);const visualEnd=Number.isFinite(sustainedUntil)&&sustainedUntil>pos?audioTimeAtScore(sustainedUntil):offAt;audioAddVisual(event,now,visualEnd);if(note.held&&off.time>=pos)audioOffScheduled.add(off.noteId)}
}
function audioPreparePlayAtPosition(timeline){audioOffScheduled.clear();audioDroppedNoteIds.clear();audioReplayStateAtPosition(timeline);playNext=timeline.events.findIndex(event=>event.time>=pos-.0001);if(playNext<0)playNext=timeline.events.length}
function scheduleAudio(){if(!isPlaying||!ctx)return;const now=clockPos();const limit=(state.mode==='wait'&&holdForInput)?now-1e-5:(state.mode==='wait'&&practice?.nextGroup())?Math.min(now+scheduleAhead*rate(),practice.playableStart(practice.nextGroup())-1e-5):now+scheduleAhead*rate();const maxLimit=loop.enabled&&loop.start!=null&&loop.end!=null?Math.min(limit,loop.end-1e-5):limit;
 if(state.audioSettings?.backend==='simple'){const seq=window._playNotes||[];while(playNext<seq.length&&seq[playNext].start<=maxLimit){const note=seq[playNext++];if(note.start<now-.06*rate()||note.channel===9)continue;const when=Math.max(ctx.currentTime+.005,startAudioTime+(note.start-startAt)/rate());sound(note.pitch,note.velocity,when,Math.max(.005,Math.min(note.duration,(loop.enabled&&loop.end!=null?loop.end-note.start:note.duration)))/rate(),note)}return}
  const timeline=audioTimelineCache;if(!timeline)return;while(playNext<timeline.events.length&&timeline.events[playNext].time<=maxLimit){const event=timeline.events[playNext++];if(event.time<now-.06*rate()){if(event.type==='noteOn')audioDroppedNoteIds.add(event.noteId);if(event.type==='noteOff')audioOffScheduled.delete(event.noteId);continue}if(event.type==='noteOff'&&audioDroppedNoteIds.delete(event.noteId))continue;if(event.type==='noteOff'&&audioOffScheduled.delete(event.noteId))continue;audioScheduleTimelineEvent(event,{waitPair:state.mode==='wait'&&event.type==='noteOn'})}}
function engineTick(){if(!isPlaying||!ctx)return;pos=clockPos();if(state.mode==='tempo'&&practice){const before=practice.stats.missed;practice.advance(pos);if(practice.stats.missed!==before)showPractice()}const finishAt=loop.enabled&&loop.start!=null&&loop.end!=null?loop.end:duration();if(pos>=finishAt-1e-5){if(loop.enabled&&loop.start!=null&&loop.end!=null){if(state.mode!=='listen')finishPerformance('loop');if(smart.active&&smart.segment){smartRoundComplete();return}seek(loop.start)}else{if(state.mode!=='listen')finishPerformance('complete');pos=duration();pause(true);pos=0;fingerGuidanceResetTransitions();scoreSyncCursor(true);updateUI();persist()}return}scheduleAudio()}
function scheduleWaitAcceptedGroup(onset){if(!isPlaying||state.mode!=='wait'||!state.accompany||!ctx)return;if(state.audioSettings?.backend==='simple'){const notes=window._playNotes||[],epsilon=1e-4,last=loop.enabled&&loop.end!=null?loop.end:Infinity;while(playNext<notes.length&&notes[playNext].start<=onset+epsilon){const note=notes[playNext++];if(note.start<onset-epsilon||note.start>=last-epsilon)continue;sound(note.pitch,note.velocity,ctx.currentTime+.004,Math.max(.005,Math.min(note.duration,last-note.start))/rate(),note)}return}const timeline=audioTimelineCache,epsilon=1e-4;if(!timeline)return;const at=audioEngine.context.currentTime+.005;while(playNext<timeline.events.length&&timeline.events[playNext].time<=onset+epsilon){const event=timeline.events[playNext++];if(event.time<onset-epsilon){if(event.type==='noteOn')audioDroppedNoteIds.add(event.noteId);continue}if(event.type==='noteOff'&&audioDroppedNoteIds.delete(event.noteId))continue;if(event.type==='noteOff'&&audioOffScheduled.has(event.noteId))continue;audioScheduleTimelineEvent(event,{at,waitPair: event.type==='noteOn'})}}
function resumeSustainedAudio(){if(!ctx||!isPlaying||state.audioSettings?.backend!=='simple')return;const notes=window._playNotes||[],last=loop.enabled&&loop.end!=null?loop.end:Infinity;for(const note of notes){if(note.start>=pos-1e-4)break;const end=Math.min(note.start+note.duration,last);if(end<=pos+.002||note.channel===9)continue;const remaining=(end-pos)/rate();if(remaining>0)sound(note.pitch,note.velocity,Math.max(ctx.currentTime+.004,startAudioTime+.004),remaining,note)}}
function restartAudioQueue(){window._playNotes=audioSequence();if(state.audioSettings?.backend==='simple'){playNext=window._playNotes.findIndex(note=>note.start>=pos-.0001);if(playNext<0)playNext=window._playNotes.length}else if(audioTimelineCache){playNext=audioTimelineCache.events.findIndex(event=>event.time>=pos-.0001);if(playNext<0)playNext=audioTimelineCache.events.length}}
async function play({skipLeadIn=false}={}){if(isPlaying)return;if(audioStarting){pause();return}if(!current)return;if(state.mode!=='listen'&&state.adaptMode!=='original'&&adaptPlan?.ready&&!adaptPlan.arrangement.feasible){notify('Диапазон: текущая адаптация невозможна. Открой панель «Диапазон».');state.right=true;applyPanels();switchRightTab('adapt');return}const generation=++audioPlayGeneration,song=current;audioStarting=true;audioEmit();updateUI();try{if(pos>=duration()-.03)pos=0;if(loop.enabled&&loop.start!=null&&loop.end!=null&&(pos<loop.start||pos>=loop.end))pos=loop.start;if(state.mode!=='listen'&&!practice)resetPractice();await ensureAudio().resume?.();await fileCancelPromise;if(generation!==audioPlayGeneration||current!==song)return;if(state.audioSettings?.backend!=='simple'){await audioEnsureReady();if(generation!==audioPlayGeneration||current!==song)return;const timeline=await audioPrepareTimeline();if(generation!==audioPlayGeneration||current!==song)return;audioTimelineCache=timeline}if(state.mode!=='listen'&&practice)practice.started=true;holdForInput=false;isPlaying=true;audioStarting=false;startAt=pos;startAudioTime=ctx.currentTime+.008+(skipLeadIn?0:state.leadInDuration);if(state.audioSettings?.backend==='simple')restartAudioQueue();else audioPreparePlayAtPosition(audioTimelineCache);resumeSustainedAudio();if(schedulerTimer!==null)clearInterval(schedulerTimer);schedulerTimer=setInterval(engineTick,25);engineTick();audioEmit();updateUI()}catch(error){if(generation===audioPlayGeneration){audioStarting=false;isPlaying=false;audioError=String(error?.message||error);audioLifecycle='error';audioEmit();updateUI();notify('Не удалось подготовить звук: '+audioError)}}}
function audioCancelFile(){if(!audioEngine)return Promise.resolve();return audioPanic({group:'file'}).catch(error=>{audioError=String(error?.message||error)})}
function pause(finished=false){if(isPlaying&&ctx)pos=finished?pos:clockPos();audioPlayGeneration++;audioStarting=false;if(isPlaying&&practice)for(const pitch of [...practice.played.keys()])practice.inputOff(pitch,pos);isPlaying=false;holdForInput=false;waitReleaseGroup=null;waitReleasePitches.clear();if(schedulerTimer!==null){clearInterval(schedulerTimer);schedulerTimer=null}silence();if(audioEngine)fileCancelPromise=audioCancelFile();audioEmit();updateUI();persist()}
function stop(){audioPlayGeneration++;audioStarting=false;isPlaying=false;holdForInput=false;waitReleaseGroup=null;waitReleasePitches.clear();if(schedulerTimer!==null){clearInterval(schedulerTimer);schedulerTimer=null}silence();if(audioEngine)fileCancelPromise=audioCancelFile();audioEmit()}
function seek(to){fingerGuidanceResetTransitions();const was=isPlaying||audioStarting;if(was)pause();pos=clamp(to,0,duration());audioTimelineCache=null;audioTimelineKey='';resetPractice();if(was)play({skipLeadIn:true});else updateUI();scoreSyncCursor(true);persist()}
function rewindToStart(){pause();pos=0;fingerGuidanceResetTransitions();audioTimelineCache=null;audioTimelineKey='';resetPractice();scoreSyncCursor(true);updateUI();persist()}
function togglePlay(){isPlaying||audioStarting?pause():play()}
function updateLeadInCountdown(){const el=$('leadInCountdown');if(!el)return;const seconds=isPlaying&&ctx?Math.max(0,startAudioTime-ctx.currentTime):0;el.hidden=seconds<=.03;if(!el.hidden){el.textContent=seconds.toFixed(1)+' с';el.title='Старт через '+seconds.toFixed(1)+' с'}}
function frame(){if(isPlaying&&ctx){pos=clockPos();updateTimesOnly()}if(state.scoreView==='roll')renderCanvas();else scoreFrameSync();requestAnimationFrame(frame)}
function updateTimesOnly(){let d=duration();$('timeNow').textContent=fmt(pos);$('statPosition').textContent=fmt(pos);$('seek').value=Math.round(clamp(pos/d,0,1)*1000);$('playBtn').textContent=isPlaying?'Ⅱ':audioStarting?'…':'▶';updateLeadInCountdown();if(state.mode==='wait'&&practice){const g=practice.nextGroup();$('rollStatus').textContent=waitReleaseGroup?'✓ Засчитано · следующую ноту можно сыграть легато':holdForInput&&g?'⏳ Ожидание: '+[...new Set(g.notes.filter(n=>!n.skipped&&!n.hit&&!n.miss).map(n=>nameOf(n.pitch)))].join(' + '):'▶ Wait · готовь следующую группу'}}
