import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return}
 res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:950}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong&&window.__prototypeTest.audio);
 await page.evaluate(()=>{
  const app=window.__prototypeTest;
  app.audio.setSimpleFallback(true);
  app.loadSong({id:'lead-in-fixture',title:'Lead-in fixture',author:'QA',type:'demo',
   tracks:[{name:'Piano',notes:[{pitch:60,start:0,duration:.25,velocity:85,track:0,channel:0}]}]});
 });
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.leadInDuration),2,'Fresh install default lead-in is 2 seconds');
 assert.equal(await page.locator('#leadInDuration').inputValue(),'2');
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying===true);
 await page.waitForTimeout(450);
 const before=await page.evaluate(()=>({pos:window.__prototypeTest.pos,visible:!document.getElementById('leadInCountdown').hidden}));
 assert.equal(before.pos,0,'Transport must remain at its start during lead-in');
 assert.equal(before.visible,true,'Lead-in countdown must be visible');
 await page.locator('#playBtn').click();
 assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),false,'Pause cancels the countdown');

 const setLeadIn=async seconds=>page.locator('#leadInDuration').evaluate((el,value)=>{
  el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));
 },seconds);
 await setLeadIn(0);
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.pos>.22,null,{timeout:5000});
 await page.locator('#restartBtn').click();
 const rewound=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,playing:window.__prototypeTest.isPlaying,seek:document.getElementById('seek').value
 }));
 assert.equal(rewound.playing,false,'Restart control stops the current playback');
 assert.equal(rewound.pos,0,'Restart control seeks the full song to zero');
 assert.equal(rewound.seek,'0');

 // A manual seek while running skips a new countdown: no two-second interruption.
 await setLeadIn(3);
 await page.locator('#playBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.isPlaying===true);
 await page.locator('#rewindBtn').click();
 await page.waitForFunction(()=>window.__prototypeTest.pos>.1,null,{timeout:3500});
 assert.equal(await page.evaluate(()=>document.getElementById('leadInCountdown').hidden),true,
  'Seeking during playback must not restart lead-in');
 await page.waitForFunction(()=>!window.__prototypeTest.isPlaying&&window.__prototypeTest.pos===0,null,{timeout:7000});
 assert.equal(await page.locator('#seek').inputValue(),'0','Natural ending resets the slider');
 assert.equal(await page.locator('#playBtn').textContent(),'▶','Natural ending leaves playback stopped');

 await setLeadIn(3.5);
 await page.reload();
 await page.waitForFunction(()=>window.__prototypeTest?.state);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.leadInDuration),3.5,'Lead-in preference persists after reload');
 assert.equal(await page.locator('#leadInDuration').inputValue(),'3.5');
 assert.equal(await page.locator('#leadInDurationValue').textContent(),'3.5 с');
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log('PASS: adjustable lead-in, cancel, restart, no seek count-in, natural auto-rewind, reload persistence');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
