// ===== v0.3 Keyboard Capability Engine =====
// No MIDI protocol field reliably reports physical key count. Device profile = observed endpoints.
const PREVIEW_RANGES={preview25:{low:48,high:72},preview37:{low:48,high:84},preview49:{low:36,high:84},preview61:{low:36,high:96},preview76:{low:28,high:103},preview88:{low:21,high:108}};
const isPlayableNote=n=>n.channel!==9;
function targetKeyboard(){
 if(state.targetRange==='device'){
   const d=getProfile();return d?{...d,virtual:false,label:'Калиброванная клавиатура'}:null;
 }
 const d=PREVIEW_RANGES[state.targetRange];return d?{...d,virtual:true,label:'Демонстрационный диапазон'}:null;
}
function originalSelectedNotes(){return current?.tracks[state.track]?.notes||[];}
function contiguousShiftOptions(notes,range){
 if(!notes.length||!range)return [];
 const pitches=notes.map(n=>n.pitch),lo=Math.min(...pitches),hi=Math.max(...pitches),options=[];
 const min=range.low-lo,max=range.high-hi;
 for(let d=min;d<=max;d++)if(lo+d>=0&&hi+d<=127)options.push(d);
 return options.sort((a,b)=>(a%12===0?0:1)-(b%12===0?0:1)||Math.abs(a)-Math.abs(b)||a-b);
}
function simultaneityInfo(notes){
 const events=notes.flatMap(n=>[{t:n.start,on:1,pitch:n.pitch},{t:n.start+Math.max(.005,n.duration),on:0,pitch:n.pitch}]);
 events.sort((a,b)=>a.t-b.t||a.on-b.on);const active=[],stats={maxSimultaneous:0,maxSpan:0};
 for(const e of events){if(e.on){active.push(e.pitch);stats.maxSimultaneous=Math.max(stats.maxSimultaneous,active.length);if(active.length>1)stats.maxSpan=Math.max(stats.maxSpan,Math.max(...active)-Math.min(...active));}
 else{const i=active.indexOf(e.pitch);if(i!==-1)active.splice(i,1)}}return stats;
}
function onsetGroups(notes){const sorted=notes.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);const groups=[];
 for(const note of sorted){let prev=groups.at(-1);if(!prev||Math.abs(note.start-prev.time)>.014)groups.push({time:note.start,notes:[note]});else prev.notes.push(note)}return groups;}
// A monophonic phrase permits global optimization instead of locally greedy octave choices.
// Dynamic programming looks ahead across the melody to preserve interval directions.
function buildMelodicAdaptive(sorted,range,profile){
 const midpoint=(range.low+range.high)/2+(profile==='low'?-Math.min(10,(range.high-range.low)/4):profile==='high'?Math.min(10,(range.high-range.low)/4):0);
 const options=sorted.map(n=>{
  const a=[];for(let p=range.low;p<=range.high;p++)if((p-n.pitch)%12===0)a.push(p);
  return a;
 });
 if(options.some(x=>!x.length))return {valid:false,mapping:new Map(),notes:[],phrases:[],issues:['Невозможно подобрать октаву для одной из мелодических нот.']};
 const scores=[],previous=[];
 for(let i=0;i<sorted.length;i++){
   scores[i]=[];previous[i]=[];
   const src=sorted[i],opts=options[i];
   for(let j=0;j<opts.length;j++){
     const p=opts[j],shiftCost=Math.abs(p-src.pitch)/12*1.1+Math.abs(p-midpoint)*(profile==='center'?.075:.115);
     if(!i){scores[i][j]=shiftCost;previous[i][j]=-1;continue;}
     let best=Infinity,parent=-1;
     for(let k=0;k<options[i-1].length;k++){
       const q=options[i-1][k],sourceInterval=src.pitch-sorted[i-1].pitch,adaptedInterval=p-q;
       const gap=src.start-(sorted[i-1].start+sorted[i-1].duration);
       const connection=gap>1.3?.6:1;
       let cost=scores[i-1][k]+shiftCost;
       cost+=connection*(Math.min(48,Math.abs(adaptedInterval-sourceInterval))*1.65);
       if(sourceInterval*adaptedInterval<0&&Math.abs(sourceInterval)>=2)cost+=connection*55;
       if(Math.abs(sourceInterval)<=7&&Math.abs(adaptedInterval)>12)cost+=connection*28;
       if(Math.abs((p-src.pitch)-(q-sorted[i-1].pitch))>=12)cost+=connection*2.5;
       if(cost<best){best=cost;parent=k;}
     }
     scores[i][j]=best;previous[i][j]=parent;
   }
 }
 let idx=scores.at(-1).reduce((best,score,i)=>score<scores.at(-1)[best]?i:best,0);
 const mapping=new Map();
 for(let i=sorted.length-1;i>=0;i--){mapping.set(sorted[i],options[i][idx]);idx=previous[i][idx];}
 const phrases=[];let group=[],maxEnd=-Infinity;
 const flush=()=>{if(!group.length)return;const changes=group.filter(n=>mapping.get(n)!==n.pitch).length;
   const avg=Math.round(group.reduce((acc,n)=>acc+mapping.get(n)-n.pitch,0)/group.length/12)*12;
   phrases.push({start:group[0].start,end:Math.max(...group.map(n=>n.start+n.duration)),shift:avg,changed:changes,count:group.length});};
 for(const n of sorted){if(group.length&&((n.start-maxEnd>1.25)||(n.start-group[0].start>6&&n.start-maxEnd>.12))){flush();group=[];maxEnd=-Infinity;}group.push(n);maxEnd=Math.max(maxEnd,n.start+n.duration);}
 flush();
 return {valid:true,mapping,notes:sorted.map(n=>({...n,sourcePitch:n.pitch,pitch:mapping.get(n)})),phrases,issues:[]};
}
function buildAdaptive(notes,range,profile='center'){
 const sorted=notes.slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch),out=new Map(),issues=[],phrases=[];
 if(!sorted.length)return {valid:true,mapping:out,notes:[],phrases,issues};
 const groups=onsetGroups(sorted);
 // No need to rewrite an in-range melody: retain its precise register and intervals.
 if(sorted.every(n=>n.pitch>=range.low&&n.pitch<=range.high)){
   sorted.forEach(n=>out.set(n,n.pitch));
   return {valid:true,mapping:out,notes:sorted.map(n=>({...n,sourcePitch:n.pitch})),phrases:[{start:sorted[0].start,end:Math.max(...sorted.map(n=>n.start+n.duration)),shift:0,changed:0,count:sorted.length}],issues};
 }
 const purelyMelodic=sorted.every((n,i)=>i===0||n.start>=sorted[i-1].start+Math.max(.005,sorted[i-1].duration)-.004);
 if(purelyMelodic)return buildMelodicAdaptive(sorted,range,profile);
 const midpoint=(range.low+range.high)/2+(profile==='low'?-Math.min(10,(range.high-range.low)/4):profile==='high'?Math.min(10,(range.high-range.low)/4):0);
 // Partition only at gaps where all previous notes have stopped; sustain must not change octave mid-note.
 let batches=[],batch=[],maxEnd=-Infinity,previousTime=-Infinity;
 for(const g of groups){const cleanBreak=g.time>maxEnd+.045&&g.time-previousTime>.16;
 if(batch.length&&((g.time-batch[0].time>=3.8&&cleanBreak)||(g.time-previousTime>1.25&&cleanBreak))){batches.push(batch);batch=[];maxEnd=-Infinity;}
 batch.push(g);maxEnd=Math.max(maxEnd,...g.notes.map(n=>n.start+n.duration));previousTime=g.time;}
 if(batch.length)batches.push(batch);
 let lastPitch=null,lastOriginal=null;
 for(const [idx,phrase] of batches.entries()){
   const pn=phrase.flatMap(g=>g.notes),min=Math.min(...pn.map(n=>n.pitch)),max=Math.max(...pn.map(n=>n.pitch));
   const candidates=[];
   for(let k=-10;k<=10;k++){
     const projected=pn.map(n=>n.pitch+12*k),miss=projected.filter(p=>p<range.low||p>range.high).length;
     const center=(Math.min(...projected)+Math.max(...projected))/2;
     candidates.push({shift:12*k,cost:miss*25+Math.abs(center-midpoint)*(profile==='center'?.08:.26)+Math.abs(k)*1.5});
   }
   candidates.sort((a,b)=>a.cost-b.cost||Math.abs(a.shift)-Math.abs(b.shift));
   // Choose best phrase shift and adapt every chord without collapsing simultaneous held notes.
   let best=null;
   for(const candidate of candidates.slice(0,6)){
     const assigned=new Map(),active=[],localIssues=[];let totalCost=candidate.cost,previousPitch=lastPitch,previousOriginal=lastOriginal;
     for(const group of phrase){
       for(let a=active.length-1;a>=0;a--)if(active[a].end<=group.time+.004)active.splice(a,1);
       const occupied=new Set(active.map(n=>n.pitch));
       const options=group.notes.map(note=>{
         let possible=[];
         for(let p=range.low;p<=range.high;p++)if((p-note.pitch)%12===0&&!occupied.has(p)){
           let cost=Math.abs(p-(note.pitch+candidate.shift))*.6+Math.abs(p-note.pitch)*.55;
           if(previousOriginal!==null&&previousPitch!==null){
             const sourceInterval=note.pitch-previousOriginal,playedInterval=p-previousPitch;
             const expected=previousPitch+sourceInterval;
             cost+=Math.min(36,Math.abs(p-expected))*1.35;
             if(sourceInterval*playedInterval<0&&Math.abs(sourceInterval)>=2)cost+=35;
             if(Math.abs(playedInterval)>12&&Math.abs(sourceInterval)<=7)cost+=16;
           }
           possible.push({p,cost});}
         return {note,possible:possible.sort((a,b)=>a.cost-b.cost).slice(0,12)};
       }).sort((a,b)=>a.possible.length-b.possible.length);
       let bestGroup=null,searches=0;
       function dfs(i,used,items,cost){
         if(++searches>28000)return;if(bestGroup&&cost>=bestGroup.cost)return;
         if(i===options.length){bestGroup={cost,items:items.slice()};return;}
         const item=options[i];for(const pick of item.possible){
           if(used.has(pick.p))continue;
           // Preserve the vertical order of simultaneous notes whenever possible.
           // Only permit crossings as a marked, expensive fallback.
           let contourPenalty=0;
           for(const assignedNote of items){
             const srcDelta=item.note.pitch-assignedNote.note.pitch;
             const playedDelta=pick.p-assignedNote.pitch;
             if(srcDelta*playedDelta<0)contourPenalty+=45;
             if(srcDelta!==0)contourPenalty+=Math.min(12,Math.abs(playedDelta-srcDelta))*.7;
           }
           used.add(pick.p);items.push({note:item.note,pitch:pick.p});
           dfs(i+1,used,items,cost+pick.cost+contourPenalty);
           items.pop();used.delete(pick.p);
         }
       }
       dfs(0,new Set(occupied),[],0);
       if(!bestGroup){localIssues.push('Одновременно звучащие ноты в '+fmt(group.time)+' нельзя назначить отдельным клавишам без изменения состава аккорда');break;}
       for(const r of bestGroup.items){assigned.set(r.note,r.pitch);active.push({end:r.note.start+Math.max(.005,r.note.duration),pitch:r.pitch});}
       totalCost+=bestGroup.cost;
       // The highest voice is a useful (though not infallible) melody proxy.
       const lead=group.notes.reduce((a,b)=>a.pitch>b.pitch?a:b);
       previousOriginal=lead.pitch;previousPitch=assigned.get(lead);
     }
     if(!localIssues.length&&(!best||totalCost<best.cost))best={cost:totalCost,assigned,shift:candidate.shift,pitch:previousPitch,original:previousOriginal};
   }
   if(!best){issues.push('Фраза '+(idx+1)+' ('+fmt(phrase[0].time)+'): недостаточно клавиш для полного сохранения всех одновременных нот');break;}
   for(const [n,p] of best.assigned)out.set(n,p);
   lastPitch=best.pitch;lastOriginal=best.original;
   phrases.push({start:phrase[0].time,end:Math.max(...pn.map(n=>n.start+n.duration)),shift:best.shift,changed:pn.filter(n=>out.get(n)!==n.pitch).length,count:pn.length});
 }
 return {valid:!issues.length,mapping:out,notes:!issues.length?sorted.map(n=>({...n,sourcePitch:n.pitch,pitch:out.get(n)})):[],phrases,issues};
}
function adaptationQuality(source,arranged){
 if(!arranged?.length||arranged.length!==source.length)return {changed:0,octaveJumps:0,contourReversals:0,voicingCrossings:0,pitchClassErrors:0};
 let changed=0,octaveJumps=0,contourReversals=0,voicingCrossings=0,pitchClassErrors=0;
 const ordered=source.map((n,i)=>({source:n,target:arranged[i]})).sort((a,b)=>a.source.start-b.source.start||a.source.pitch-b.source.pitch);
 let prev=null;
 for(let i=0;i<ordered.length;i++){
   const {source:n,target:t}=ordered[i];
   if(n.pitch!==t.pitch)changed++;
   if(((t.pitch-n.pitch)%12+12)%12!==0)pitchClassErrors++;
   if(prev&&n.start>prev.source.start+.02){
      const a=n.pitch-prev.source.pitch,b=t.pitch-prev.target.pitch;
      if(a*b<0&&Math.abs(a)>=2)contourReversals++;
      if(Math.abs(a)<=7&&Math.abs(b)>12)octaveJumps++;
   }
   prev={source:n,target:t};
 }
 const groups=onsetGroups(source),sourceIndex=new Map(source.map((n,i)=>[n,i]));
 for(const g of groups){
   for(let i=0;i<g.notes.length;i++)for(let j=i+1;j<g.notes.length;j++){
     const ni=sourceIndex.get(g.notes[i]),nj=sourceIndex.get(g.notes[j]);
     if(ni<0||nj<0)continue;
     if((g.notes[i].pitch-g.notes[j].pitch)*(arranged[ni].pitch-arranged[nj].pitch)<0)voicingCrossings++;
   }
 }
 return {changed,octaveJumps,contourReversals,voicingCrossings,pitchClassErrors};
}
function analyzeCapability(){
 const track=originalSelectedNotes(),notes=track.filter(isPlayableNote),range=targetKeyboard();
 if(!range)return {ready:false,original:track,notes,reason:'Диапазон неизвестен. Подключи и откалибруй клавиатуру или выбери демонстрационный диапазон для предварительного анализа.'};
 if(!notes.length)return {ready:true,empty:true,range,original:track,notes,arrangement:{feasible:true,notes:track,changed:0},recommendation:'original',reason:'В выбранной партии нет мелодических MIDI-нот (возможно, только ударные).'};
 const pitches=notes.map(n=>n.pitch),min=Math.min(...pitches),max=Math.max(...pitches),shifts=contiguousShiftOptions(notes,range),simult=simultaneityInfo(notes);
 const originalFits=min>=range.low&&max<=range.high;
 const profile=state.adaptProfile||'center';const memoKey=current.id+'|'+state.track+'|'+range.low+':'+range.high+'|'+profile;const memo=adaptMemo?.key===memoKey?adaptMemo.value:null;const adaptive=memo||buildAdaptive(notes,range,profile);if(!memo)adaptMemo={key:memoKey,value:adaptive};
 let arrangement={feasible:true,notes:track,changed:0,label:'Оригинал'};
 if(state.adaptMode==='transpose'){
  const shift=Number(state.adaptShift);const feasible=shifts.includes(shift);
  arrangement={feasible,notes:feasible?track.map(n=>({...n,sourcePitch:n.pitch,pitch:isPlayableNote(n)?n.pitch+shift:n.pitch})):[],changed:feasible?notes.filter(n=>shift!==0).length:0,label:'Перенос '+(shift>0?'+':'')+shift};
 }else if(state.adaptMode==='adaptive'){
  arrangement={feasible:adaptive.valid,notes:adaptive.valid?track.map(n=>isPlayableNote(n)?{...n,sourcePitch:n.pitch,pitch:adaptive.mapping.get(n)}:{...n,sourcePitch:n.pitch}):[],changed:adaptive.valid?notes.filter(n=>adaptive.mapping.get(n)!==n.pitch).length:0,label:'По фразам'};
 }
 const recommendation=originalFits?'original':shifts.length?'transpose':adaptive.valid?'adaptive':'unplayable';
 const quality=adaptive.valid?adaptationQuality(notes,notes.map(n=>({...n,pitch:adaptive.mapping.get(n)}))):null;
 return {ready:true,range,notes,original:track,min,max,shifts,simult,originalFits,adaptive,quality,arrangement,recommendation};
}
function selectedArrangement(){if(state.adaptMode==='original'||!adaptPlan?.ready)return originalSelectedNotes();return adaptPlan.arrangement.feasible?adaptPlan.arrangement.notes:originalSelectedNotes();}
function useAdaptedArrangement(){return state.mode!=='listen'||state.auditionAdapted;}
function selectedPlaybackNotes(){return useAdaptedArrangement()?selectedArrangement():originalSelectedNotes();}
function renderCapability(){
 const r=adaptPlan=$('targetRange')?analyzeCapability():null;
 if(!r)return;
 $('targetRange').value=state.targetRange;$('adaptMode').value=state.adaptMode;$('auditionAdapted').checked=!!state.auditionAdapted;
 $('adaptProfile').value=state.adaptProfile||'center';
 const summary=$('capabilitySummary'),metrics=$('capabilityMetrics'),notice=$('adaptNotice'),phrases=$('adaptPhraseList'),shiftSelect=$('adaptShift'),qualityEl=$('adaptQuality');
 $('shiftSetting').style.display=state.adaptMode==='transpose'?'':'none';$('adaptStrategySetting').style.display=state.adaptMode==='adaptive'?'':'none';
 if(!r.ready){summary.innerHTML='<strong>Клавиатура ещё не определена</strong><p>Нужна калибровка или демонстрационный диапазон.</p>';metrics.textContent='';notice.textContent=r.reason;phrases.textContent='После выбора диапазона появится анализ.';qualityEl.textContent='Ожидание калибровки или предварительного диапазона.';$('adaptRecommend').disabled=true;shiftSelect.replaceChildren();$('rangeSource').textContent=r.reason;return;}
 const range=r.range;const label=nameOf(range.low)+'–'+nameOf(range.high)+' ('+(range.high-range.low+1)+' клавиш)';
 $('rangeSource').textContent=(range.virtual?'⚠ Предпросмотр, не фактическая клавиатура · ':'✓ Профиль MIDI-устройства · ')+label;
 if(r.empty){summary.innerHTML='<strong>Нет мелодической партии</strong><p>Выбери другую дорожку.</p>';metrics.textContent='';notice.textContent=r.reason;phrases.textContent='Нет данных';qualityEl.textContent='Нет мелодических нот для анализа.';shiftSelect.replaceChildren();$('adaptRecommend').disabled=true;return;}
 const recommendation={original:'Играй оригинал',transpose:'Доступен единый перенос',adaptive:'Нужна октавная адаптация',unplayable:'Требуется упрощённая аранжировка'}[r.recommendation];
 summary.replaceChildren();let strong=document.createElement('strong');strong.textContent=recommendation;summary.append(strong);let desc=document.createElement('p');desc.textContent='Партия '+nameOf(r.min)+'–'+nameOf(r.max)+' · диапазон клавиатуры '+label;summary.append(desc);
 summary.className='metabox'+(r.recommendation==='original'?'':'');
 metrics.textContent='Размах партии: '+(r.max-r.min+1)+' полутона · макс. одновременно: '+r.simult.maxSimultaneous+' · вертикальный размах: '+r.simult.maxSpan+' полутонов · допустимых единых переносов: '+r.shifts.length;
 if(r.quality){
  const q=r.quality;
  qualityEl.replaceChildren();
  const title=document.createElement('strong');title.textContent='Adaptive · изменение '+q.changed+' из '+r.notes.length+' нот';
  const p=document.createElement('p');p.textContent='Перевороты мелодического движения: '+q.contourReversals+' · неожиданные скачки > октавы: '+q.octaveJumps+' · перестановки голосов в аккорде: '+q.voicingCrossings+' · изменение звуковысотных классов: '+q.pitchClassErrors+'.';
  const hint=document.createElement('p');hint.textContent=q.contourReversals||q.octaveJumps||q.voicingCrossings?'Это учебная аранжировка, не идентичное воспроизведение оригинала. Для точной партии используй Original или другую клавиатуру.':'Расположение нот не создаёт выявленных инверсий контура / конфликтов голосов в отдельных аккордах.';
  qualityEl.append(title,p,hint);
 }else qualityEl.textContent='Невозможно построить адаптацию без потери независимых звучащих нот.';
 const oldShift=String(state.adaptShift);shiftSelect.replaceChildren();
 if(!r.shifts.length)shiftSelect.add(new Option('Единый перенос невозможен',''));
 else r.shifts.forEach(k=>shiftSelect.add(new Option((k===0?'0':k>0?'+'+k:String(k))+' полутонов'+(k%12===0?' · сохраняет тональность':' · меняет тональность'),String(k))));
 if(r.shifts.length){if(!r.shifts.includes(Number(state.adaptShift)))state.adaptShift=r.shifts[0];shiftSelect.value=String(state.adaptShift);}
 let message=state.adaptMode==='original'?(r.originalFits?'Original: все ноты выбранной партии входят в диапазон.':'Original: часть нот вне доступного диапазона. Оригинальная партия не меняется.'):
 state.adaptMode==='transpose'?(r.shifts.length?'Transpose: '+r.arrangement.changed+' нот перенесено; тайминг и интервалы партии сохранены.'+(Number(state.adaptShift)%12?' Внимание: изменится тональность партии относительно оригинального сопровождения.':''):'Единого переноса не существует. Выбери Adaptive или другую клавиатуру.'):
 r.adaptive.valid?'Adaptive: '+r.arrangement.changed+' нот перенесено по октавам; звуковысотные классы сохранены, регистр/контур могли измениться.'+(r.quality?.contourReversals?' Изменения мелодического направления: '+r.quality.contourReversals+'.':''):'Adaptive не смог сохранить все одновременные ноты без конфликтов. '+r.adaptive.issues.join('; ');
 if(range.virtual)message+=' Внимание: пример диапазона, физическое устройство не проверено.';
 notice.className='notice'+(r.arrangement.feasible&&(state.adaptMode!=='original'||r.originalFits)?' ok':'');notice.textContent=message;
 phrases.replaceChildren();const el=document.createElement('strong');el.textContent='Партия: '+r.notes.length+' нот · '+r.adaptive.phrases.length+' фраз';phrases.append(el);
 const list=document.createElement('p');list.textContent=r.adaptive.valid?r.adaptive.phrases.slice(0,6).map((p,i)=>'№'+(i+1)+' '+fmt(p.start)+'–'+fmt(p.end)+' · '+(p.shift>=0?'+':'')+p.shift+' · '+p.changed+'/'+p.count+' изменений').join(' | '):r.adaptive.issues.join(' • ');phrases.append(list);
 $('adaptRecommend').disabled=r.recommendation==='unplayable';
 $('adaptRecommend').textContent=r.recommendation==='original'?'Выбрать Original':r.recommendation==='transpose'?'Выбрать Transpose':r.recommendation==='adaptive'?'Выбрать Adaptive':'Нужна аранжировка';
}
function refreshArrangement({restart=true}={}){
 const playing=isPlaying;
 if(playing)pause();
 renderCapability();selectedNote=null;selectNote(null);resetPractice();updateUI();resizeCanvas();
 if(playing&&restart)play();persist();
}

