import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// FG-03B2B-1: automated score-to-geometry evidence, NOT pianist UAT.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist'),out=path.join(root,'artifacts','finger-range-review');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('not found');return;
 }
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'};
 res.setHeader('content-type',types[path.extname(filename)]||'application/octet-stream');
 res.end(fs.readFileSync(filename));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__fingerGuideTest);

 // All fingers below are explicitly supplied as MusicXML author fixtures.
 // A future RH black-key chord includes 84, outside the 25-key view.
 const mk=(pitch,start,finger,hand)=>({pitch,start,duration:.34,velocity:83,
  finger,hand,fingeringSource:'musicxml',track:hand==='RH'?0:1});
 await page.evaluate(song=>window.__prototypeTest.loadSong(song),{
  id:'fg03b2b-range-matrix',title:'FG-03B2B annotated multi-range',author:'CI only',type:'import',
  tracks:[
   {name:'RH',notes:[mk(60,0,1,'RH'),mk(64,0,3,'RH'),
    mk(61,.55,1,'RH'),mk(65,.55,3,'RH'),mk(84,.55,5,'RH')]},
   {name:'LH',notes:[mk(48,0,5,'LH'),mk(55,0,1,'LH'),
    mk(50,.55,5,'LH'),mk(57,.55,1,'LH')]}
  ]
 });
 await page.locator('#fingerGuideMode').selectOption('ghost');
 await page.waitForFunction(()=>window.__fingerGuideTest.steps.length===2);
 await page.locator('[data-layout="play"]').click();
 const matrix=[
  {key:'preview25',count:25,low:48,high:72},
  {key:'preview37',count:37,low:48,high:84},
  {key:'preview49',count:49,low:36,high:84},
  {key:'preview61',count:61,low:36,high:96},
  {key:'preview76',count:76,low:28,high:103},
  {key:'preview88',count:88,low:21,high:108}
 ];
 const reports=[];
 for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  for(const config of matrix){
   // Exercise REAL controls and their onchange handling, not private state
   // assignments or a fake MIDI device calibration.
   await page.evaluate(key=>{
    const elem=document.getElementById('targetRange');
    elem.value=key;elem.dispatchEvent(new Event('change',{bubbles:true}));
    const display=document.getElementById('displayRange');
    display.value='device';display.dispatchEvent(new Event('change',{bubbles:true}));
   },config.key);
   await page.evaluate(()=>window.__prototypeTest.seek(0));
   await page.waitForFunction(()=>{
    const g=window.__prototypeTest.pianoGeometry;
    return g&&g.min===21&&g.max===108&&g.keys.length===88;
   });
   const snapshot=await page.evaluate(()=>{
    const geom=window.__prototypeTest.pianoGeometry;
    const steps=window.__fingerGuideTest.steps;
    const future=steps[1].notes;
    const placements=window.__fingerGuideTest.nextSpritePlacements;
    const chord=window.__fingerGuideTest.ghostMotion;
    const key=geom.byPitch.get(61),canvas=document.getElementById('roll');
    const rect=canvas.getBoundingClientRect();
    const blackPitch=window.__prototypeTest.virtualKeyAt({
     clientX:rect.left+key.center,
     clientY:rect.top+window.__fingerGuideTest.layout.keyboardTop+5
    });
    const hit=p=>{
     const k=geom.byPitch.get(p);
     return window.__prototypeTest.virtualKeyAt({
      clientX:rect.left+k.center,
      clientY:rect.top+window.__fingerGuideTest.layout.keyboardTop+5
     });
    };
    return {
     range:{min:geom.min,max:geom.max,count:geom.keys.length,
      whites:geom.whites.length,blacks:geom.blacks.length},
     displayedRange:window.__prototypeTest.state.displayRange,
     whiteWidth:geom.whites[0].w,
     blackPitch,
     sourceFuture:future.map(n=>({pitch:n.pitch,hand:n.hand,finger:n.finger})),
     outsideController:future.filter(n=>n.pitch<window.__prototypeTest.state.targetKeyLow||
      n.pitch>window.__prototypeTest.state.targetKeyHigh).map(n=>n.pitch),
     futureAllOnFullPiano:future.every(n=>geom.byPitch.has(n.pitch)),
     ghostVisible:chord.visible,
     canvasCssWidth:rect.width,
     canvasLeft:rect.left,
     viewportWidth:window.innerWidth,
     scrollWidth:document.getElementById('rollWrap').scrollWidth,
     clientWidth:document.getElementById('rollWrap').clientWidth,
     keyHeight:window.__fingerGuideTest.layout.keyboardBottom-
      window.__fingerGuideTest.layout.keyboardTop,
     keyHits:{outsideLow:hit(21),inside:hit(60),outsideHigh:hit(108),
      black:hit(61)},
     keyboardTop:window.__fingerGuideTest.layout.keyboardTop
    };
   });
   assert.deepEqual(snapshot.range,
    {min:21,max:108,count:88,whites:52,blacks:36},
    '88 piano keys are always present for ALL preview and calibration ranges');
   assert.equal(snapshot.displayedRange,'device',
    'legacy display preferences cannot crop the physical 88-key piano');
   assert.equal(snapshot.canvasLeft,0,'piano roll begins at window edge');
   assert.ok(Math.abs(snapshot.canvasCssWidth-snapshot.viewportWidth)<=1,
    'full 88-key piano ends at opposite window edge');
   assert.equal(snapshot.scrollWidth,snapshot.clientWidth,
    'scroll-free full piano should never require horizontal travel');
   assert.ok(Math.abs(snapshot.keyHeight/snapshot.whiteWidth-5.5)<.04,
    'white-key height and width scale by one invariant ratio');
   assert.equal(snapshot.blackPitch,61,'black key wins key hit testing');
   assert.equal(snapshot.keyHits.black,61);
   assert.equal(snapshot.keyHits.inside,60);
   assert.equal(snapshot.keyHits.outsideLow,config.count===88?21:null,
    'A0 is inactive unless the controller spans the 88-key range');
   assert.equal(snapshot.keyHits.outsideHigh,
    config.count===88?108:null,'C8 is inactive outside 88-key controller');
   const contrast=await page.evaluate(()=>{
    const piano=window.__prototypeTest.pianoGeometry;
    const canvas=document.getElementById('roll');
    const context=canvas.getContext('2d');
    const y=window.__fingerGuideTest.layout.keyboardTop+
     (window.__fingerGuideTest.layout.keyboardBottom-
      window.__fingerGuideTest.layout.keyboardTop)*.43;
    const rgb=p=>{
     const k=piano.byPitch.get(p),pixel=context.getImageData(
      Math.floor(k.center),Math.floor(y),1,1).data;
     return [...pixel.slice(0,3)];
    };
    return {outer:rgb(21),inside:rgb(69)};
   });
   const luma=rgb=>rgb[0]*.21+rgb[1]*.72+rgb[2]*.07;
   if(config.count<88)assert.ok(luma(contrast.outer)<luma(contrast.inside)*.55,
    'disabled unreachable white keys must be visibly darkened on Canvas');
   else assert.ok(luma(contrast.outer)>150,
    '88-key controller keeps the extreme A0 white natural bright and active');
   assert.deepEqual(snapshot.sourceFuture,[
    {pitch:61,hand:'RH',finger:1},{pitch:65,hand:'RH',finger:3},
    {pitch:84,hand:'RH',finger:5},
    {pitch:50,hand:'LH',finger:5},{pitch:57,hand:'LH',finger:1}
   ],'MIDI/MusicXML finger provenance never changes with controller selection');
   assert.equal(snapshot.futureAllOnFullPiano,true,
    'out-of-controller piano-roll notes remain visible; none are deleted');
   assert.equal(snapshot.ghostVisible,true,'author-verified preview stays accessible');
   // The legacy 25-key view previously hid pitch 84 entirely. It must now
   // be visible above the piano but dimmed and unclickable on the keyboard.
   const high84=await page.evaluate(()=>{
    const k=window.__prototypeTest.pianoGeometry.byPitch.get(84);
    const rect=document.getElementById('roll').getBoundingClientRect();
    return window.__prototypeTest.virtualKeyAt({
     clientX:rect.left+k.center,
     clientY:rect.top+window.__fingerGuideTest.layout.keyboardTop+8
    });
   });
   assert.equal(high84,config.count===25?null:84);
   const png=config.key+'-'+viewport.name+'.png';
   await page.screenshot({path:path.join(out,png)});
   reports.push({...snapshot,viewport:viewport.name,keyCount:config.count,screenshot:png});
  }
 }
 assert.deepEqual(errors,[],'No browser runtime errors in the 8-device geometry matrix');
 fs.writeFileSync(path.join(out,'geometry-matrix.json'),JSON.stringify({
  version:'FG-03B2B-1',pianistApproved:false,calibratedMIDI:false,
  tests:reports
 },null,2));
 console.log('FULL88: 25/37/49/61/76/88 controller ranges × desktop/mobile, responsive piano, no scroll, disabled limits, score intact: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
