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
  {key:'preview49',count:49,low:36,high:84},
  {key:'preview61',count:61,low:36,high:96},
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
   await page.waitForFunction(c=>{
    const g=window.__prototypeTest.pianoGeometry;
    return g&&g.min===c.low&&g.max===c.high;
   },config);
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
    return {
     range:{min:geom.min,max:geom.max,count:geom.keys.length},
     displayedRange:window.__prototypeTest.state.displayRange,
     whiteWidth:Math.min(...geom.whites.map(x=>x.w)),
     blackPitch,
     sourceFuture:future.map(n=>({pitch:n.pitch,hand:n.hand,finger:n.finger})),
     outOfRange:future.filter(n=>!geom.byPitch.has(n.pitch)).map(n=>n.pitch),
     rhPoseAvailable:placements.RH!==null,
     ghostVisible:chord.visible,
     rhPlan:chord.plans?.RH?.kind??null,
     crossing:chord.crossing,
     canvasCssWidth:rect.width,
     viewportWidth:window.innerWidth,
     keyboardTop:window.__fingerGuideTest.layout.keyboardTop
    };
   });
   assert.deepEqual(snapshot.range,{min:config.low,max:config.high,count:config.count});
   assert.equal(snapshot.displayedRange,'device','Virtual preview range must work without MIDI profile');
   assert.ok(snapshot.whiteWidth>=20,
    'Wide virtual keyboard must preserve readable piano-key width with horizontal scrolling');
   assert.equal(snapshot.blackPitch,61,'A raised black key still wins coordinate hit testing');
   assert.deepEqual(snapshot.sourceFuture,[
    {pitch:61,hand:'RH',finger:1},{pitch:65,hand:'RH',finger:3},
    {pitch:84,hand:'RH',finger:5},
    {pitch:50,hand:'LH',finger:5},{pitch:57,hand:'LH',finger:1}
   ],'Changing the keyboard range must never change authored notes/fingers');
   assert.equal(snapshot.ghostVisible,true,'Source-approved lookahead must remain available');
   if(config.count===25){
    assert.deepEqual(snapshot.outOfRange,[84],'25-key view omits the high RH target');
    assert.equal(snapshot.rhPoseAvailable,false,
     'Do not paint a complete PNG pose for a partially off-range source chord');
    assert.equal(snapshot.rhPlan,'markers',
     'Fixed in-range key markers must replace misleading 25-key clipped PNG motion');
   }else assert.deepEqual(snapshot.outOfRange,[]);
   // Keep the music visible near middle C in scrollable 88-key/mobile layouts.
   await page.evaluate(()=>{
    const wrap=document.getElementById('rollWrap');
    const key=window.__prototypeTest.pianoGeometry.byPitch.get(60);
    if(key)wrap.scrollLeft=Math.max(0,key.center-wrap.clientWidth/2);
   });
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
 console.log('FG-03B2B-1: 25/49/61/88 x desktop/mobile, author notes preserved, range safety, black keys: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
