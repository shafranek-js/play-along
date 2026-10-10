// ===== v0.2 musical engine: unified AudioContext clock + independent scheduling =====
function ensureAudio(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();ctx.resume?.();return ctx}
function rate(){return state.speed/100}
function clockPos(){
 if(!isPlaying||!ctx)return pos;
 const v=startAt+(ctx.currentTime-startAudioTime)*rate();
 if(state.mode==='wait'&&practice){
  // A completed note/chord does not advance the sheet until the keys are released.
  if(waitReleaseGroup){pos=waitReleaseGroup.start;return pos}
  const next=practice.nextGroup();
  if(next&&v>=next.start-1e-5){
   pos=next.start;
   if(!holdForInput){holdForInput=true;startAt=pos;startAudioTime=ctx.currentTime}
   return pos;
  }
  if(holdForInput)return pos;
 }
 return v;
}
function silence(){for(const v of activeVoices){try{v.g.gain.cancelScheduledValues(ctx.currentTime);v.g.gain.setValueAtTime(.00001,ctx.currentTime);v.osc.stop(ctx.currentTime+.004)}catch{}}activeVoices.clear()}
function sound(pitch,velocity,when,len,sourceNote=null){let a=ensureAudio(),t=Math.max(a.currentTime+.003,when),dur=Math.max(.05,Math.min(35,len)),g=a.createGain(),o=a.createOscillator();o.type='triangle';o.frequency.value=440*2**((pitch-69)/12);let amp=clamp(state.volume/100,0,.9)*clamp(velocity/127,.1,1)*.22;
 g.gain.setValueAtTime(.00001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0001,amp),t+.009);g.gain.setValueAtTime(Math.max(.0001,amp*.6),t+.045);g.gain.exponentialRampToValueAtTime(.00001,t+dur);o.connect(g);g.connect(a.destination);const voice={osc:o,g,pitch,startTime:t,endTime:t+dur,source:'song',sourceNote};activeVoices.add(voice);o.onended=()=>{activeVoices.delete(voice);o.disconnect();g.disconnect()};o.start(t);o.stop(t+dur+.04);return voice;}
function playLive(pitch,velocity){if(liveVoices.has(pitch))return;const a=ensureAudio(),t=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.value=440*2**((pitch-69)/12);const amp=Math.max(.0001,clamp(state.volume/100,0,.9)*velocity/127*.19);g.gain.setValueAtTime(.00001,t);g.gain.exponentialRampToValueAtTime(amp,t+.012);o.connect(g);g.connect(a.destination);o.start(t);const voice={o,g};liveVoices.set(pitch,voice);o.onended=()=>{if(liveVoices.get(pitch)===voice)liveVoices.delete(pitch);o.disconnect();g.disconnect()}}
function releaseLive(pitch){const v=liveVoices.get(pitch);if(!v||!ctx)return;liveVoices.delete(pitch);try{v.g.gain.cancelScheduledValues(ctx.currentTime);v.g.gain.setTargetAtTime(.00001,ctx.currentTime,.04);v.o.stop(ctx.currentTime+.20)}catch{}}
function stopLiveAll(){for(const p of liveVoices.keys())releaseLive(p)}
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
 for(const item of practice.played.values()){
  if(!midiHeld.has(item.pitch))continue;
  // noteLookup indexes original arrangement objects, while played uses a copy.
  for(const [original,record] of practice.noteLookup){if(record===item){playing.add(original);break;}}
 }
 return playing;
}
const scheduleAhead=.16;
function audioSequence(){if(!current)return[];if(state.mode==='listen')return (state.accompany?current.tracks.flatMap((t,i)=>i===state.track?selectedPlaybackNotes():t.notes):selectedPlaybackNotes()).slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 return state.accompany?current.tracks.flatMap((t,i)=>i===state.track?[]:t.notes).sort((a,b)=>a.start-b.start||a.pitch-b.pitch):[];}
function scheduleAudio(){if(!isPlaying||!ctx)return;const now=clockPos();const limit=(state.mode==='wait'&&holdForInput)?now-1e-5:(state.mode==='wait'&&practice?.nextGroup())?Math.min(now+scheduleAhead*rate(),practice.nextGroup().start-1e-5):now+scheduleAhead*rate();const seq=window._playNotes||[];const maxLimit=loop.enabled&&loop.start!=null&&loop.end!=null?Math.min(limit,loop.end-1e-5):limit;
 while(playNext<seq.length&&seq[playNext].start<=maxLimit){const n=seq[playNext++];if(n.start<now-.06*rate())continue;if(n.channel===9)continue;const when=ctx.currentTime+Math.max(.005,(n.start-now)/rate());sound(n.pitch,n.velocity,when,Math.max(.005,Math.min(n.duration,(loop.enabled&&loop.end!=null?loop.end-n.start:n.duration)))/rate(),n)}}
function engineTick(){if(!isPlaying||!ctx)return;pos=clockPos();if(state.mode==='tempo'&&practice){const before=practice.stats.missed;practice.advance(pos);if(practice.stats.missed!==before)showPractice()}
 const finishAt=loop.enabled&&loop.start!=null&&loop.end!=null?loop.end:duration();
 if(pos>=finishAt-1e-5){if(loop.enabled&&loop.start!=null&&loop.end!=null){if(state.mode!=='listen')finishPerformance('loop');if(smart.active&&smart.segment){smartRoundComplete();return;}seek(loop.start)}else{if(state.mode!=='listen')finishPerformance('complete');pos=duration();pause(true)}return}
 scheduleAudio();}
function restartAudioQueue(){window._playNotes=audioSequence();playNext=window._playNotes.findIndex(n=>n.start>=pos-.0001);if(playNext<0)playNext=window._playNotes.length}
function play(){if(!current)return;if(state.mode!=='listen'&&state.adaptMode!=='original'&&adaptPlan?.ready&&!adaptPlan.arrangement.feasible){notify('Диапазон: текущая адаптация невозможна. Открой панель «Диапазон».');state.right=true;applyPanels();switchRightTab('adapt');return;} if(pos>=duration()-.03){pos=0;resetPractice()}ensureAudio();if(state.mode!=='listen'&&!practice)resetPractice();if(practice&&state.mode!=='listen')practice.started=true;holdForInput=false;isPlaying=true;startAt=pos;startAudioTime=ctx.currentTime;restartAudioQueue();if(schedulerTimer!==null)clearInterval(schedulerTimer);schedulerTimer=setInterval(engineTick,25);engineTick();updateUI()}
function pause(finished=false){if(isPlaying&&ctx)pos=finished?pos:clockPos();isPlaying=false;holdForInput=false;waitReleaseGroup=null;waitReleasePitches.clear();if(schedulerTimer!==null){clearInterval(schedulerTimer);schedulerTimer=null;}silence();updateUI();persist()}
function stop(){isPlaying=false;holdForInput=false;waitReleaseGroup=null;waitReleasePitches.clear();if(schedulerTimer!==null){clearInterval(schedulerTimer);schedulerTimer=null;}silence()}
function seek(to){const was=isPlaying;if(was)pause();pos=clamp(to,0,duration());resetPractice();if(was)play();else updateUI();scoreSyncCursor(true);persist()}
function togglePlay(){isPlaying?pause():play()}
function frame(){if(isPlaying&&ctx){pos=clockPos();updateTimesOnly()}if(state.scoreView==='roll')renderCanvas();else scoreFrameSync();requestAnimationFrame(frame)}
function updateTimesOnly(){let d=duration();$('timeNow').textContent=fmt(pos);$('statPosition').textContent=fmt(pos);$('seek').value=Math.round(clamp(pos/d,0,1)*1000);$('playBtn').textContent=isPlaying?'Ⅱ':'▶';if(state.mode==='wait'&&practice){const g=practice.nextGroup();$('rollStatus').textContent=waitReleaseGroup?'✓ Засчитано · следующую ноту можно сыграть легато':holdForInput&&g?'⏳ Ожидание: '+[...new Set(g.notes.filter(n=>!n.hit).map(n=>nameOf(n.pitch)))].join(' + '):'▶ Wait · готовь следующую группу';}}