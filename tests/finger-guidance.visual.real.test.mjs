// FG-00B visual acceptance fixture; only captures real Play Along Canvas, no gameplay mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts','fg00b');
fs.mkdirSync(out,{recursive:true});
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return;}
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__fingerGuideTest?.demoDuet);
 await page.evaluate(()=>window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet));
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>window.__fingerGuideTest?.steps.length===4);
 await page.screenshot({path:path.join(out,'two-hands.png')});
 await page.locator('#fingerGuideMode').selectOption('ghost');
 await page.screenshot({path:path.join(out,'two-hands-next.png')});
 await page.evaluate(()=>window.__prototypeTest.loadSong(
   {id:'demo-scale',title:'C major',author:'Reference',type:'demo',tempo:92,tracks:[
    {name:'RH',notes:[60,62,64,65,67,69,71,72,71,69,67,65,64,62,60]
     .map((pitch,i)=>({pitch,start:i*.46,duration:.39,velocity:84,track:0}))}]}));
 await page.evaluate(()=>window.__prototypeTest.seek(1.38));
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.screenshot({path:path.join(out,'thumb-under.png')});
 const note=await page.evaluate(()=>window.__fingerGuideTest.frame.current);
 assert.ok(Math.abs(note-1.38)<.0001);
 assert.ok((await page.locator('#roll').boundingBox()).height>250);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__prototypeTest.loadSong(window.__fingerGuideTest.demoDuet));
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.screenshot({path:path.join(out,'mobile.png')});
 assert.deepEqual(errors,[],'FG-00B hand renderer must not throw');
 console.log('FG-00B real-app visual reference screenshots (two hands, ghost, thumb, mobile): PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
