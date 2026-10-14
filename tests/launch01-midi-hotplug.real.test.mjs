// LAUNCH-01 F2: real Chromium/production Web MIDI hotplug regression.
// MIDI ports are emulated; this is NOT a physical MicroLab/speaker certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((request,response)=>{
 const pathname=new URL(request.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end('not found');return}
 const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html'};
 response.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const primary={id:'primary-midi',name:'MicroLab mock A',state:'connected',onmidimessage:null};
  const access={inputs:new Map([[primary.id,primary]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{
   configurable:true,value:async()=>access,
  });
  window.__midiHotplug={
   access,
   send(id,bytes){
    const input=access.inputs.get(id);
    if(!input||input.state!=='connected')throw Error('MIDI mock port unavailable: '+id);
    input.onmidimessage?.({data:Uint8Array.from(bytes),timeStamp:performance.now()});
   },
   unplug(id){
    const input=access.inputs.get(id);
    if(!input)throw Error('Unknown MIDI mock: '+id);
    input.state='disconnected';
    access.inputs.delete(id);
    access.onstatechange?.({port:input});
    return input.onmidimessage===null;
   },
   attach(id){
    const input={id,name:'MicroLab mock '+id,state:'connected',onmidimessage:null};
    access.inputs.set(id,input);
    access.onstatechange?.({port:input});
   },
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong,{timeout:15000});
 // The Connect button lives in the initially hidden MIDI settings panel.
 // Open it through the visible device badge like a real user would.
 await page.locator('#deviceBadge').click();
 await page.locator('#connectMidi').click();
 await page.waitForFunction(()=>window.__prototypeTest.midiInfo.connected&&window.__prototypeTest.midiInfo.name==='MicroLab mock A');
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.pause();
  app.loadSong({id:'launch01-midi-hotplug',title:'Hotplug Wait test',author:'Synthetic',type:'import',tracks:[
   {name:'Piano',notes:[
    {pitch:60,start:0,duration:.4,velocity:85,track:0,channel:0},
    {pitch:62,start:.02,duration:.4,velocity:85,track:0,channel:0},
    {pitch:64,start:2,duration:.4,velocity:85,track:0,channel:0},
   ]},
  ]});
  app.setMode('wait');app.seek(.02);
 });
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying&&window.__prototypeTest.audio.getStatus().lifecycle==='ready',null,{timeout:60000});
 await page.evaluate(()=>window.__midiHotplug.send('primary-midi',[0x90,62,92]));
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest;
  return app.midiHeld.includes(62)&&app.waitRelease?.pitches.includes(62)&&app.session.played.has(62);
 },null,{timeout:10000});

 // USB removal emits no NoteOff. The existing Wait session must still release
 // this key and move forward, not retain a hidden played[62] or phantom note.
 const oldHandlerDetached=await page.evaluate(()=>window.__midiHotplug.unplug('primary-midi'));
 assert.equal(oldHandlerDetached,true,'disconnect must remove the old MIDI handler');
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest;
  return !app.midiInfo.connected&&app.midiHeld.length===0&&app.waitRelease===null
   &&!app.session.played.has(62)&&app.pos>.04;
 },null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),true,
  'USB unplug must not stop the practice session');

 // Reconnect a different port ID without restarting the app; Wait must still
 // accept the next real NoteOn after the first port unexpectedly vanished.
 await page.evaluate(()=>window.__midiHotplug.attach('replacement-midi'));
 await page.waitForFunction(()=>window.__prototypeTest.midiInfo.connected&&window.__prototypeTest.midiInfo.name==='MicroLab mock replacement-midi');
 await page.evaluate(()=>window.__midiHotplug.send('replacement-midi',[0x90,64,93]));
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest;
  return app.stats.hits===2&&app.midiHeld.includes(64)&&app.session.played.has(64);
 },null,{timeout:10000});

 // Explicit input selection must also generate missing releases (not only
 // statechange unplug) while preserving the working practice transport.
 await page.evaluate(()=>window.__midiHotplug.attach('second-midi'));
 await page.locator('#inputSelect').selectOption('second-midi');
 await page.waitForFunction(()=>{
  const app=window.__prototypeTest;
  return app.midiInfo.name==='MicroLab mock second-midi'&&app.midiHeld.length===0
   &&!app.session.played.has(64)&&app.waitRelease===null;
 },null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),true);
 assert.deepEqual(errors,[],'uncaught browser exceptions');
 console.log('LAUNCH01 F2 MIDI HOTPLUG BROWSER:',JSON.stringify({
  disconnectReleasesPractice:true,reconnectAcceptsWait:true,manualSwitchReleasesPractice:true,
  physicalControllerTested:false,sourceNotesModified:false,pageErrors:errors.length,
 }));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
