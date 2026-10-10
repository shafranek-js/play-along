// ===== v0.7 Smart Practice: adaptive section loop, separate from normal training =====
const SMART_STORE='playalong:smart:mastery:v07';let smartData={};try{smartData=JSON.parse(localStorage.getItem(SMART_STORE)||'{}')||{}}catch{}
const smart={active:false,waitingNext:false,segment:null,plan:[],index:0,speed:60,streak:0,round:0,lastScore:null};
function smartKey(seg){return performanceProfile()+':'+Math.round(seg.start*1000)+'-'+Math.round(seg.end*1000)}
function smartMakePlan(){
 if(!current)return[];const notes=selectedArrangement().filter(isPlayableNote),d=duration(),chunks=new Map();
 for(const n of notes){const start=Math.floor(n.start/4)*4;let c=chunks.get(start);if(!c){c={start,end:Math.min(d,start+4),count:0,errors:0,mastery:0};chunks.set(start,c)}c.count++;c.end=Math.max(c.end,Math.min(d,n.start+n.duration+.08));}
 const previous=perfAttempts.filter(r=>r.profile===performanceProfile()).slice(0,6);
 for(const c of chunks.values()){
  const record=smartData[smartKey(c)]||{};c.mastery=record.mastery||0;c.best=record.best||0;
  for(const a of previous)for(const s of a.sections||[])if(Math.abs(s.start-c.start)<.25)c.errors+=(s.errors||0)*(a===previous[0]?1.5:0.35);
  // Never suppress unseen sections; favour observed mistakes without starving new material.
  c.priority=c.errors*5+(c.mastery?0:2)+Math.log2(1+c.count)-c.mastery*1.5;
 }
 return [...chunks.values()].filter(c=>c.count>0).sort((a,b)=>b.priority-a.priority||a.start-b.start).slice(0,16);
}
function smartRender(){if(!$('smartHeadline'))return;const box=$('smartHeadline');const seg=smart.segment;
 box.innerHTML=smart.active?'<strong>Тренировка · '+fmt(seg.start)+'–'+fmt(seg.end)+'</strong><p>Скорость '+smart.speed+'% · проходов '+smart.round+' · подряд успешно '+smart.streak+' / 2 · '+(smart.lastScore==null?'ожидаем результат':'последний результат '+smart.lastScore+'%')+(smart.waitingNext?'<br><b>Нажми MIDI-клавишу для следующего фрагмента</b>':'')+'</p>': '<strong>Готово к занятию</strong><p>Подбор по последним ошибкам · результат сохраняется локально.</p>';
 const list=$('smartSections');list.replaceChildren();const plans=smart.plan.length?smart.plan:smartMakePlan();
 for(const [i,c] of plans.slice(0,9).entries()){
  let div=document.createElement('div');div.className='smartRow';let h=document.createElement('strong'),p=document.createElement('p'),b=document.createElement('button');h.textContent=fmt(c.start)+'–'+fmt(c.end)+(smart.active&&smart.index===i?' · сейчас':'');p.textContent=`${c.count} нот · ошибок (в истории): ${Math.round(c.errors)} · освоение: ${c.mastery||0}/2`;b.className='btn tiny ghost';b.textContent='Тренировать';b.onclick=()=>smartStart(i);div.append(h,p,b);list.append(div);
 }
 if(!plans.length)list.textContent='Для тренировки нужна выбранная MIDI-партия.';
}
function smartStart(index){
 if(!current)return;smartStop(false);smart.plan=smartMakePlan();if(!smart.plan.length){notify('В партии нет упражнений');return;}
 smart.index=Math.max(0,Math.min(index??0,smart.plan.length-1));smart.segment=smart.plan[smart.index];smart.active=true;smart.waitingNext=false;smart.streak=0;smart.round=0;smart.lastScore=null;
 setMode('tempo');smart.active=true;smart.speed=60;state.speed=60;smartOpenSegment();
}
function smartOpenSegment(){const seg=smart.segment;if(!seg)return;pause();state.mode='tempo';state.speed=smart.speed;loop={start:seg.start,end:seg.end,enabled:true};pos=seg.start;resetPractice();updateUI();smartRender();play();}
function smartRoundComplete(){
 const seg=smart.segment;if(!seg)return;const result=summarizePerformance(practice); // Only the selected section's notes belong to this session.
 const noteTotal=result.total;const score=noteTotal?result.score:0;
 const perfectEnough=noteTotal>0&&result.accuracy>=90&&score>=86&&(result.holdPct==null||result.holdPct>=78)&&(result.chordPct==null||result.chordPct>=70);
 smart.lastScore=score;smart.round++;smart.streak=perfectEnough?smart.streak+1:0;
 const key=smartKey(seg),old=smartData[key]||{best:0,mastery:0,attempts:0};old.best=Math.max(old.best,score);old.attempts++;old.lastAt=new Date().toISOString();
 if(smart.streak>=2){if(smart.speed<100){smart.speed=Math.min(100,smart.speed+10);smart.streak=0;}else{old.mastery=2;smart.streak=0;}}
 smartData[key]=old;try{localStorage.setItem(SMART_STORE,JSON.stringify(smartData))}catch{}
 smart.plan=smartMakePlan();let mastered=old.mastery>=2;
 // A segment is mastered after two consecutive qualifying 100%-tempo passes.
 if(mastered){smart.waitingNext=true;pause();notify('Фрагмент освоен! Нажми MIDI-клавишу для продолжения.');smartRender();return;}
 pause();smartRender();setTimeout(()=>{if(smart.active&&!smart.waitingNext&&smart.segment===seg)smartOpenSegment()},650);
}
function smartGoNext(){if(!smart.active)return smartStart();smart.waitingNext=false;let candidates=smartMakePlan().filter(c=>(smartData[smartKey(c)]?.mastery||0)<2);if(!candidates.length){smartStop();notify('Все фрагменты освоены!');return;}
 let next=candidates.find(c=>c.start!==smart.segment.start)||candidates[0];smart.plan=smartMakePlan();smart.index=smart.plan.findIndex(c=>c.start===next.start);smart.segment=next;smart.speed=60;smart.streak=0;smart.round=0;smart.lastScore=null;smartOpenSegment();}
function smartStop(show=true){if(smart.active)pause();smart.active=false;smart.waitingNext=false;smart.segment=null;smart.streak=0;if(loop.enabled)loop.enabled=false;if(show){updateUI();smartRender();}}
