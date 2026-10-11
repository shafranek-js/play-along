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
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html'};
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong);
 const setup=async(mode,notes)=>{
  await page.evaluate(({mode,notes})=>{
   const app=window.__prototypeTest;
   app.pause();
   app.loadSong({id:'regression-'+mode,title:'Partial onset chord',author:'Fixture',
    type:'import',tracks:[{name:'Piano',notes:notes.map(n=>({
     pitch:n[0],start:n[1],duration:.4,velocity:85,track:0,channel:0
    }))}]});
   app.setMode(mode);
   app.seek(.02);
  },{mode,notes});
  await page.locator('#playBtn').click();
  assert.equal(await page.evaluate(()=>window.__prototypeTest.isPlaying),true);
 };
 await setup('wait',[[60,0],[62,.02],[64,2]]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(62));
 const accepted=await page.evaluate(()=>{
  const a=window.__prototypeTest,s=a.session;
  return {hits:a.stats.hits,hold:a.hold,release:a.waitRelease,position:a.pos,
   first:{skipped:s.all[0].skipped,hit:s.all[0].hit},
   second:{hit:s.all[1].hit},next:s.nextGroup()?.start};
 });
 assert.equal(accepted.hits,1);
 assert.equal(accepted.release?.start,0,'Group retains its notated origin');
 assert.equal(accepted.position,.02,'Wait cursor must not rewind to skipped onset');
 assert.deepEqual(accepted.first,{skipped:true,hit:false});
 assert.equal(accepted.second.hit,true);
 assert.equal(accepted.next,2);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOff(62));
 await page.waitForTimeout(140);
 const resumed=await page.evaluate(()=>({
  pos:window.__prototypeTest.pos,hold:window.__prototypeTest.hold,
  release:window.__prototypeTest.waitRelease
 }));
 assert.ok(resumed.pos>.04,'Wait transport remains stuck after releasing the playable group');
 assert.equal(resumed.hold,false);
 assert.equal(resumed.release,null);
 await page.evaluate(()=>window.__prototypeTest.pause());
 await setup('tempo',[[60,0],[60,.02],[64,2]]);
 await page.evaluate(()=>window.__prototypeTest.receiveNoteOn(60));
 const tempo=await page.evaluate(()=>({
  hits:window.__prototypeTest.stats.hits,
  skipped:window.__prototypeTest.session.all[0].skipped,
  skippedHit:window.__prototypeTest.session.all[0].hit,
  playableHit:window.__prototypeTest.session.all[1].hit
 }));
 assert.deepEqual(tempo,{hits:1,skipped:true,skippedHit:false,playableHit:true});
 await page.evaluate(()=>{
  window.__prototypeTest.receiveNoteOff(60);
  window.__prototypeTest.pause();
 });
 assert.deepEqual(errors,[]);
 console.log('B01/B02: actual Chromium Wait release, cursor resume and Tempo unison after seek: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
