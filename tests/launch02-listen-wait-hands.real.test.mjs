import {selectCompactFingerMode,selectCompactLookahead} from './compact-ui-helpers.mjs';
/**
 * LAUNCH-02: Listen hands physically follow source NoteOn/NoteOff; Wait hands
 * target the next unfinished note/chord, without guessing missing fingers.
 * Real production Chromium playback; synthetic notation provenance fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((request,response)=>{
 const name=new URL(request.url,'http://localhost').pathname;
 const f=path.resolve(dist,'.'+(name==='/'?'/index.html':name));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){response.writeHead(404);response.end('missing');return}
 response.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');
 fs.createReadStream(f).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong&&window.__fingerGuideTest?.frame,{timeout:15000});
 await page.locator('#leadInDuration').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await selectCompactFingerMode(page,'hands');
 const original=await page.evaluate(()=>{
  const notes=[
   {pitch:60,start:0,duration:.65,finger:1,hand:'RH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'rh60'},
   {pitch:64,start:0,duration:.65,finger:3,hand:'RH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'rh64'},
   {pitch:48,start:0,duration:.65,finger:5,hand:'LH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'lh48'},
   {pitch:67,start:1.3,duration:.4,finger:5,hand:'RH',track:0,velocity:85,fingeringSource:'musicxml',noteId:'rh67'},
  ];
  const app=window.__prototypeTest;
  app.pause();app.loadSong({id:'launch02-hand-modes',title:'Physical playback vs Wait',author:'QA',
   type:'import',tracks:[{name:'Two-hand piano',notes}]});
  app.setMode('listen');app.seek(0);
  return JSON.stringify(app.song.tracks[0].notes.map(n=>[n.pitch,n.start,n.duration,n.finger,n.hand]));
 });
 // First notes physically held during playback: unlike the old
 // "always next onset" preview, real active fingers remain on these keys.
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
 await page.waitForFunction(()=>window.__prototypeTest.pos>.15&&window.__prototypeTest.pos<.55,null,{timeout:15000});
 const sounding=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,
  frame:window.__fingerGuideTest.frame,
  contacts:window.__fingerGuideTest.preview,
 }));
 assert.equal(sounding.frame.current,0,'Listen must show current depressed keys, not next 1.3s onset');
 assert.deepEqual(sounding.contacts.map(n=>n.pitch).sort((a,b)=>a-b),[48,60,64]);
 assert.equal(sounding.frame.next,1.3);
 // Physical releases at .65 must lift visual fingers even though remaining
 // sound may decay; none of the future keys may appear prematurely.
 await page.waitForFunction(()=>window.__prototypeTest.pos>.85&&window.__prototypeTest.pos<1.2,null,{timeout:15000});
 const rest=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,frame:window.__fingerGuideTest.frame,
  contacts:window.__fingerGuideTest.preview,
 }));
 assert.equal(rest.frame.current,null,'Between physical NoteOff and next NoteOn, no finger is pressed');
 assert.deepEqual(rest.contacts,[]);
 await page.evaluate(()=>{const app=window.__prototypeTest;app.pause();app.setMode('wait');app.seek(0)});
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying,null,{timeout:15000});
 const initialTargets=await page.evaluate(()=>window.__fingerGuideTest.waitTargets);
 assert.deepEqual(initialTargets.map(x=>x.pitch).sort((a,b)=>a-b),[48,60,64]);
 assert.deepEqual(initialTargets.map(x=>x.finger).sort((a,b)=>a-b),[1,3,5]);
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.receiveNoteOn(79);app.receiveNoteOff(79);
 });
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.frame.current),0,'Wrong key cannot advance the Wait hand target');
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 assert.deepEqual((await page.evaluate(()=>window.__fingerGuideTest.waitTargets)).map(x=>x.pitch).sort((a,b)=>a-b),[48,64]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(64));
 assert.deepEqual((await page.evaluate(()=>window.__fingerGuideTest.waitTargets)).map(x=>x.pitch),[48]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(48));
 assert.deepEqual((await page.evaluate(()=>window.__fingerGuideTest.waitTargets)).map(x=>x.pitch),[67],
  'After final correct chord key, point to the next real source note');
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  for(const pitch of [48,60,64])app.receiveNoteOff(pitch);
  app.pause();
  app.loadSong({id:'launch02-unknown-finger',title:'Unannotated MIDI',author:'QA',
   type:'import',tracks:[{name:'Piano',notes:[
    {pitch:72,start:0,duration:.5,velocity:85,track:0,noteId:'unknown'}
   ]}]});
  app.setMode('wait');app.seek(0);
 });
 assert.deepEqual(await page.evaluate(()=>window.__fingerGuideTest.waitTargets),
  [{pitch:72,hand:null,finger:null}],'Unknown MIDI must expose target key without inventing finger or hand');
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.steps.length),0);
 const afterward=await page.evaluate(()=>{
  const s=window.__prototypeTest.song;
  return s.tracks[0].notes.map(n=>[n.pitch,n.start,n.duration,n.finger,n.hand]);
 });
 assert.equal(afterward[0][0],72);
 assert.equal(original.includes('[60,0,0.65,1,"RH"]'),true,'first original source note unchanged');
 assert.deepEqual(errors,[],'no unhandled browser errors');
 console.log('LAUNCH02_LISTEN_WAIT_HANDS_PASS',JSON.stringify({
  playbackHeld:sounding.contacts.map(x=>x.pitch),duringRest:rest.contacts,
  waitWrongKeyDoesNotAdvance:true,chordCompletionAdvances:true,unknownFingerNotGuessed:true,
  physicallyArticulated3DHands:false,hardwareMidiTested:false
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
