// LAUNCH-01 F2 — actual production Chromium visual-vs-sustain regression.
// CC64 may extend sounding duration, but original NoteOff bytes/timing are fixed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((request,response)=>{
 const pathname=new URL(request.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end('not found');return}
 response.setHeader('content-type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
 response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong,{timeout:15000});
 const prepared=await page.evaluate(()=>{
  const app=window.__prototypeTest;
  const notes=[
   {pitch:60,start:.1,duration:.22,velocity:85,track:0,channel:0,noteId:'pedaled-c4'},
   {pitch:65,start:.12,duration:.21,velocity:85,track:0,channel:1,noteId:'unpedaled-f4'},
   {pitch:67,start:.45,duration:.13,velocity:85,track:0,channel:1,noteId:'before-pedal-g4'},
   {pitch:72,start:1.8,duration:.3,velocity:85,track:0,channel:0,noteId:'duration-anchor-c5'},
  ];
  const events=[
   {type:'noteOn',time:.1,channel:0,pitch:60,noteId:'pedaled-c4',velocity:85},
   {type:'noteOn',time:.12,channel:1,pitch:65,noteId:'unpedaled-f4',velocity:85},
   {type:'cc',time:.16,channel:0,controller:64,value:127},
   {type:'noteOff',time:.32,channel:0,pitch:60,noteId:'pedaled-c4',velocity:0},
   {type:'noteOff',time:.33,channel:1,pitch:65,noteId:'unpedaled-f4',velocity:0},
   {type:'noteOn',time:.45,channel:1,pitch:67,noteId:'before-pedal-g4',velocity:85},
   {type:'noteOff',time:.58,channel:1,pitch:67,noteId:'before-pedal-g4',velocity:0},
   {type:'cc',time:.7,channel:1,controller:64,value:127},
   {type:'cc',time:1.15,channel:1,controller:64,value:0},
   {type:'cc',time:1.35,channel:0,controller:64,value:0},
   {type:'noteOn',time:1.8,channel:0,pitch:72,noteId:'duration-anchor-c5',velocity:85},
   {type:'noteOff',time:2.1,channel:0,pitch:72,noteId:'duration-anchor-c5',velocity:0},
  ].map((event,sequence)=>({...event,sourceTrack:0,track:0,sequence}));
  app.pause();app.loadSong({id:'cc64-visual-boundary',title:'CC64 original NoteOff visual',type:'import',author:'Synthetic',tracks:[{name:'Piano',notes}],audioEvents:events});
  app.setMode('listen');app.seek(0);
  return {events:JSON.stringify(app.song.audioEvents),notes:JSON.stringify(app.song.tracks[0].notes)};
 });
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',{},{timeout:60000});
 await page.waitForFunction(()=>window.__prototypeTest.pos>.7,{},{timeout:15000});
 const whilePedal=await page.evaluate(()=>{
  const app=window.__prototypeTest;return {pos:app.pos,lit:app.soundingKeys};
 });
 assert.ok(whilePedal.lit.includes(60),'C4 must remain lit past physical NoteOff=.32 while CC64 remains down until 1.35');
 assert.ok(!whilePedal.lit.includes(65)&&!whilePedal.lit.includes(67),'CC64 on another channel or pedal-down after NoteOff must not revive a note');

 // Seeking into a sustained tail must reconstruct its key highlight after
 // replaying CC64 state and NoteOn/NoteOff without rewriting the score.
 await page.evaluate(()=>window.__prototypeTest.seek(.9));
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest;return app.isPlaying&&app.pos>.94&&app.pos<1.2&&app.soundingKeys.includes(60);
 },null,{timeout:15000});
 const seekSustain=await page.evaluate(()=>({pos:window.__prototypeTest.pos,lit:window.__prototypeTest.soundingKeys}));
 assert.ok(!seekSustain.lit.includes(65),'unpedaled channel may not be revived on seek');
 await page.waitForFunction(()=>window.__prototypeTest.pos>1.48,null,{timeout:15000});
 const afterPedalUp=await page.evaluate(()=>({pos:window.__prototypeTest.pos,lit:window.__prototypeTest.soundingKeys}));
 assert.ok(!afterPedalUp.lit.includes(60),'pedal-up must extinguish the highlighted sustained note');

 await page.evaluate(()=>window.__prototypeTest.pause());
 const preserved=await page.evaluate(()=>{
  const app=window.__prototypeTest;return {events:JSON.stringify(app.song.audioEvents),notes:JSON.stringify(app.song.tracks[0].notes)};
 });
 assert.deepEqual(preserved,prepared,'CC64 visual processing must not modify source MIDI events or score notes');
 assert.deepEqual(errors,[],'uncaught browser exceptions');
 console.log('LAUNCH01_F2_CC64_VISUAL_PASS',JSON.stringify({
  noteOff:.32,pedalUp:1.35,whilePedal,seekSustain,afterPedalUp,
  originalEventsUntouched:true,channelIsolation:true,physicalHardwareTested:false,
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
