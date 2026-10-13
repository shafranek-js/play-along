// ===== MuseScore MSCX/MSCZ reader (browser-only; experimental subset) =====
// XML is never executed. Durations are resolved in MIDI PPQ, then via a shared tempo map.
function museFraction(v){
  if(!v)return NaN;
  const s=String(v).trim();
  if(s.includes('/')){const [a,b]=s.split('/').map(Number);return Number.isFinite(a)&&b>0?a/b:NaN}
  return Number(s);
}
function museDuration(node,measureWhole,ppq){
  const durationType=xmlText(node,'durationType','');
  const count={maxima:8,long:4,breve:2,whole:1,half:.5,quarter:.25,eighth:.125,'16th':1/16,'32nd':1/32,'64th':1/64,'128th':1/128,'256th':1/256}[durationType];
  if(durationType==='measure'){
    const explicit=museFraction(xmlText(node,'duration',''));
    return Math.round((Number.isFinite(explicit)&&explicit>0?explicit:measureWhole)*4*ppq);
  }
  if(count===undefined)return 0;
  let factor=1,part=.5;let dots=Math.min(4,Math.max(0,Number(xmlText(node,'dots','0'))||0));
  for(let j=0;j<dots;j++){factor+=part;part/=2}
  return Math.max(1,Math.round(count*factor*4*ppq));
}
function museRead(xmlString,filename){
  if(xmlString.length>15e6)throw Error('MSCX превышает ограничение в 15 МБ');
  const doc=new DOMParser().parseFromString(musicSafeXml(xmlString),'application/xml');
  if(doc.querySelector('parsererror'))throw Error('MSCX: ошибка структуры XML');
  const root=doc.documentElement;
  if(root.localName!=='museScore')throw Error('Файл не является партитурой MuseScore (MSCX)');
  const score=xmlDirect(root,'Score');if(!score)throw Error('MSCX: отсутствует раздел Score');
  const scoreMeta=name=>[...xmlList(score,'metaTag')].find(n=>n.getAttribute('name')===name)?.textContent?.trim()||'';
  const title=(scoreMeta('workTitle')||scoreMeta('movementTitle')||xmlText(score,'workTitle')||xmlText(score,'movementTitle')||libraryTitleFile(filename)).slice(0,120);
  const author=(scoreMeta('composer')||xmlText(score,'composer')||'MuseScore · импорт').slice(0,100);
  const version=parseFloat(root.getAttribute('version')||'0');
  const warning=new Set();
  if(version>4.6)warning.add('Файл создан новой версией MuseScore: часть обозначений может отличаться.');
  if(score.getElementsByTagName('Tuplet').length)warning.add('Триоли/туоли пока не пересчитываются точно: для них лучше использовать экспорт MusicXML.');
  if(score.getElementsByTagName('Tremolo').length)warning.add('Тремоло не разворачиваются в отдельные ноты.');
  if(score.getElementsByTagName('Repeats').length||score.getElementsByTagName('Jump').length||score.getElementsByTagName('Marker').length||score.getElementsByTagName('Volta').length||[...score.getElementsByTagName('BarLine')].some(x=>/start-repeat|end-repeat/.test(xmlText(x,'subtype',''))))warning.add('Репризы/переходы не разворачиваются; звучит записанный порядок тактов.');
  const ppq=480;
  const usedChannels=new Set(),channelSignatures=new Map(),channelByStaff=new Map();let nextMelodicChannel=0;
  const audioEventTicks=[];let audioSequence=0;
  const addAudioTick=event=>{if(audioEventTicks.length>=100000)throw Error('MSCX содержит слишком много событий для аудиопроигрывателя');audioEventTicks.push({...event,sequence:audioSequence++})};
  const allocateChannel=()=>{
    // Traverse all sixteen raw values; channel 9 is skipped, leaving fifteen
    // usable melodic channels. A 15-try bound can miss the final free channel.
    for(let tries=0;tries<16;tries++){const ch=nextMelodicChannel++%16;if(ch===9||usedChannels.has(ch))continue;usedChannels.add(ch);return ch}
    warning.add('В партитуре больше 15 мелодических партий: некоторые используют общий MIDI-канал.');return 0;
  };
  // The Part/Staff structures describe instruments. The Score/Staff structures contain notes.
  const names=new Map();for(const [partIndex,part] of xmlList(score,'Part').entries()){
    const instr=xmlDirect(part,'Instrument');const label=xmlText(part,'trackName',xmlText(instr,'trackName',xmlText(instr,'longName','Партия')));
    const partStaves=xmlList(part,'Staff'),isDrum=xmlText(instr,'useDrumset','0')==='1';
    const channels=xmlList(instr,'Channel');if(channels.length>1)warning.add('В MSCX найдены варианты Channel; без StaffText/артикуляции используется только первый вариант.');
    const channelNode=channels[0]||null,channel=isDrum?9:allocateChannel(),instrumentId=instr?.getAttribute('id')||'part-'+(partIndex+1);
    const programNode=xmlDirect(channelNode,'program'),programRaw=programNode?.getAttribute('value');
    const program=programRaw==null?null:(programRaw.trim()===''?NaN:Number(programRaw));
    if(programRaw!=null&&(!Number.isInteger(program)||program<0||program>127))warning.add('Значение program в MSCX Channel вне диапазона 0–127 и пропущено.');
    const controllers=[];
    for(const controller of xmlList(channelNode,'controller')){
      const numberRaw=controller.getAttribute('ctrl'),valueRaw=controller.getAttribute('value'),number=Number(numberRaw),value=Number(valueRaw);
      if(numberRaw!=null&&numberRaw.trim()!==''&&valueRaw!=null&&valueRaw.trim()!==''&&Number.isInteger(number)&&number>=0&&number<=127&&Number.isInteger(value)&&value>=0&&value<=127)controllers.push({controller:number,value});
      else warning.add('В MSCX Channel найдено неподдерживаемое значение контроллера; оно пропущено.');
    }
    const signature=String(program)+'|'+controllers.map(c=>c.controller+':'+c.value).join(',')+'|'+isDrum;
    if(channelSignatures.has(channel)&&channelSignatures.get(channel)!==signature)warning.add('Партии MSCX используют общий MIDI-канал с разными тембрами или контроллерами; они могут влиять друг на друга.');
    else channelSignatures.set(channel,signature);
    const config={channel,isDrum,program,instrumentId,sourceTrack:partIndex};
    for(const c of controllers)addAudioTick({type:'cc',tick:0,channel,track:null,sourceTrack:partIndex,...c});
    if(program!=null&&Number.isInteger(program)&&program>=0&&program<=127)addAudioTick({type:'programChange',tick:0,channel,track:null,sourceTrack:partIndex,program,isDrum});
    partStaves.forEach((st,i)=>{const staffId=st.getAttribute('id');names.set(staffId,partStaves.length===1?label:label+' · '+(i+1));channelByStaff.set(staffId,config)});
  }
  if(score.getElementsByTagName('InstrumentChange').length)warning.add('Смены инструмента MSCX не применяются; используется начальный тембр каждой партии.');
  if(score.getElementsByTagName('MidiAction').length||score.getElementsByTagName('Articulation').length)warning.add('MIDI-действия и артикуляция MSCX не передаются в аудиопроигрыватель.');
  const staves=xmlList(score,'Staff').filter(st=>xmlList(st,'Measure').length);
  if(!staves.length)throw Error('MSCX: в партитуре нет музыкальных станов с тактами');
  let metreN=4,metreD=4;
  const master=staves.reduce((best,st)=>xmlList(st,'Measure').length>xmlList(best,'Measure').length?st:best,staves[0]);
  const bars=xmlList(master,'Measure');let tick=0;const barTicks=[];const barsLength=[];
  // Work out a single absolute bar timeline shared across all staves/voices.
  for(const bar of bars){
    barTicks.push(tick);
    for(const voice of xmlList(bar,'voice'))for(const node of xmlList(voice,'TimeSig')){
      const n=Number(xmlText(node,'sigN','')),d=Number(xmlText(node,'sigD',''));
      if(n>0&&d>0){metreN=n;metreD=d}
    }
    const explicit=museFraction(bar.getAttribute('len'));
    const beats=Number.isFinite(explicit)&&explicit>0?explicit:metreN/metreD;
    const length=Math.max(1,Math.round(beats*ppq*4));barsLength.push(length);tick+=length;
  }
  const midiNotes=[],tempos=[{tick:0,tempo:500000}];
  staves.forEach((staff,si)=>{
    const staffId=staff.getAttribute('id')||String(si+1),staffName=names.get(staffId)||'Стан '+staffId;
    const config=channelByStaff.get(staffId)||{channel:allocateChannel(),isDrum:false,instrumentId:'staff-'+staffId,sourceTrack:si};
    if(!channelByStaff.has(staffId))warning.add('Для стана MSCX не найден Part/Instrument: назначен канал автоматически.');
    const notes=[];let sourceOrdinal=0;
    const measures=xmlList(staff,'Measure');const activeTies=new Map();
    for(let m=0;m<measures.length;m++){
      const measure=measures[m];const start=barTicks[m]??tick;
      const barLength=barsLength[m]??barsLength.at(-1)??1920;
      const measureWhole=barLength/(4*ppq);
      const voices=xmlList(measure,'voice');
      // In MuseScore, separate voices within a measure run concurrently.
      voices.forEach((voice,voiceId)=>{
        let local=0;
        for(const el of voice.children){
          const tag=el.localName;
          if(tag==='Tempo'){
            const bps=Number(xmlText(el,'tempo',''));
            if(bps>0&&bps<16)tempos.push({tick:start+local,tempo:1e6/bps});
            continue;
          }
          if(tag==='TimeSig'||tag==='KeySig'||tag==='Clef'||tag==='BarLine'||tag==='Dynamic'||tag==='StaffText'||tag==='Fermata')continue;
          if(tag==='tick'){
            const move=Number(el.textContent?.trim());if(Number.isFinite(move))local=Math.max(0,move-start);
            continue;
          }
          if(tag!=='Chord'&&tag!=='Rest'&&tag!=='RepeatMeasure')continue;
          const dur=museDuration(el,measureWhole,ppq);
          if(tag==='Chord'){
            if(!dur){warning.add('Есть аккорды с неподдерживаемой длительностью.');continue}
            for(const note of xmlList(el,'Note')){
              const pitch=Number(xmlText(note,'pitch',''));
              if(!Number.isInteger(pitch)||pitch<0||pitch>127)continue;
              const tieKey=voiceId+'-'+pitch;
              const last=activeTies.get(tieKey);
              const hasTie=[...xmlList(note,'Spanner')].some(x=>x.getAttribute('type')==='Tie');
              if(last&&Math.abs(last.tick+last.len-(start+local))<=2){
                last.len+=dur;
                if(!hasTie)activeTies.delete(tieKey);
              }else{
                const n={pitch,tick:start+local,len:dur,velocity:85,channel:config.channel,isDrum:config.isDrum,
                  noteId:'mscx:'+staffId+':'+m+':'+(++sourceOrdinal),sourceTrack:config.sourceTrack,instrumentId:config.instrumentId};
                notes.push(n);
                if(hasTie)activeTies.set(tieKey,n);
                else activeTies.delete(tieKey);
              }
            }
          }
          if(tag==='RepeatMeasure')warning.add('Знаки повтора предыдущего такта не разворачиваются автоматически.');
          local+=dur;
        }
      });
    }
    if(notes.length)midiNotes.push({name:staffName,notes});
  });
  if(!midiNotes.length)throw Error('MSCX: не обнаружено воспроизводимых нот');
  const total=midiNotes.reduce((a,x)=>a+x.notes.length,0);
  if(total>25000)throw Error('В партитуре слишком много нот для браузерного прототипа (более 25 000)');
  const grouped=new Map();for(const t of tempos)grouped.set(t.tick,t.tempo);
  const map=[...grouped].sort((a,b)=>a[0]-b[0]).map(([tick,tempo])=>({tick,tempo}));
  let sec=0;map.forEach((t,i)=>{if(i)sec+=(t.tick-map[i-1].tick)/ppq*map[i-1].tempo/1e6;t.sec=sec});
  function toSeconds(v){let a=0,b=map.length;while(a+1<b){let m=(a+b)>>1;if(map[m].tick<=v)a=m;else b=m}let t=map[a];return t.sec+(v-t.tick)/ppq*t.tempo/1e6}
  const tracks=midiNotes.map((t,i)=>({name:t.name,notes:t.notes.map(n=>({
    pitch:n.pitch,start:toSeconds(n.tick),duration:Math.max(.025,toSeconds(n.tick+n.len)-toSeconds(n.tick)),velocity:n.velocity,
    channel:n.channel,track:i,noteId:n.noteId,sourceTrack:n.sourceTrack,instrumentId:n.instrumentId,isDrum:n.isDrum
  })).sort((a,b)=>a.start-b.start||a.pitch-b.pitch)}));
  for(let track=0;track<midiNotes.length;track++)for(const n of midiNotes[track].notes){
    addAudioTick({type:'noteOn',tick:n.tick,channel:n.channel,track,sourceTrack:n.sourceTrack,noteId:n.noteId,pitch:n.pitch,velocity:n.velocity});
    addAudioTick({type:'noteOff',tick:n.tick+n.len,channel:n.channel,track,sourceTrack:n.sourceTrack,noteId:n.noteId,pitch:n.pitch});
  }
  const audioEvents=audioEventTicks.map(({tick,...event})=>({...event,time:toSeconds(tick)})).sort((a,b)=>a.time-b.time||a.sequence-b.sequence);
  if(tracks.reduce((a,t)=>a+t.notes.length,0)<2)warning.add('В партитуре обнаружено мало нот. Проверь результат импорта.');
  warning.add('MSCX/MSCZ импортируются как учебный MIDI: аппликатура, артикуляция, динамика и часть музыкальных обозначений могут не воспроизводиться. Для наиболее точного импорта сложных партитур используй MusicXML/MXL.');
  return{id:'mscx-'+Date.now(),title,author,type:'import',format:'MuseScore MSCX',tracks,audioEvents,warnings:[...warning],scoreTempoMap:map.map(t=>({beat:t.tick/ppq,sec:t.sec,tempo:t.tempo}))};
}
async function zipUnpackMuseScore(buffer){
  // MuseScore MSCZ uses ZIP with an MSCX score and optional media resources.
  const a=new Uint8Array(buffer),d=new DataView(buffer);if(a.length>16e6)throw Error('MSCZ превышает 16 МБ');
  let tail=-1;for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--){if(d.getUint32(i,true)===0x06054b50){tail=i;break}}
  if(tail<0)throw Error('MSCZ не является ZIP-архивом');
  const count=d.getUint16(tail+10,true),central=d.getUint32(tail+16,true);if(count>500)throw Error('Слишком много файлов в MSCZ');
  const entries=[];let offset=central;
  for(let i=0;i<count;i++){
    if(offset+46>a.length||d.getUint32(offset,true)!==0x02014b50)throw Error('Повреждённый ZIP в MSCZ');
    const method=d.getUint16(offset+10,true),size=d.getUint32(offset+20,true),rawSize=d.getUint32(offset+24,true),nameLen=d.getUint16(offset+28,true),extra=d.getUint16(offset+30,true),comment=d.getUint16(offset+32,true),loc=d.getUint32(offset+42,true);
    const name=new TextDecoder().decode(a.subarray(offset+46,offset+46+nameLen));entries.push({name,method,size,rawSize,loc});offset+=46+nameLen+extra+comment;
  }
  const file=entries.find(e=>e.name.endsWith('.mscx')&&!e.name.startsWith('META-INF/'));
  if(!file)throw Error('В архиве MSCZ не найден .mscx');
  if(file.rawSize>15e6||file.size>15e6)throw Error('Слишком большой MSCX внутри MSCZ');
  const off=file.loc;
  if(off+30>a.length||d.getUint32(off,true)!==0x04034b50)throw Error('Повреждённый файл внутри MSCZ');
  const begin=off+30+d.getUint16(off+26,true)+d.getUint16(off+28,true);
  if(begin+file.size>a.length)throw Error('Обрезанный файл MSCZ');
  const data=a.slice(begin,begin+file.size);
  if(file.method===0)return new TextDecoder().decode(data);
  if(file.method!==8)throw Error('Неизвестный тип ZIP-сжатия MuseScore');
  if(typeof DecompressionStream==='undefined')throw Error('Для MSCZ необходим современный Chrome / Edge с DecompressionStream');
  const raw=await zipInflateBounded(data,15e6,'MSCZ');return new TextDecoder().decode(raw);
}
