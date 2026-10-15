import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
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
 const pageerrors=[];page.on('pageerror',e=>pageerrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys.length===88);
 const frame=()=>page.evaluate(()=>{
  const rect=id=>{const {left,right,top,bottom,width,height}=document.getElementById(id).getBoundingClientRect();return {left,right,top,bottom,width,height};};
  return {status:rect('statusBar'),roll:rect('rollWrap'),transport:rect('bottomBar'),
   shell:rect('shell'),viewHeight:innerHeight,footerWidth:rect('statusBar').width,
   keyboardWidth:window.__prototypeTest.pianoGeometry.whites[0].w,
   keyboardHeight:window.__fingerGuideTest.layout.keyboardBottom-window.__fingerGuideTest.layout.keyboardTop};
 });
 const initial=await frame();
 assert.ok(Math.abs(initial.status.bottom-initial.viewHeight)<=1,'status line touches viewport bottom');
 assert.ok(initial.status.height>=24&&initial.status.height<=28,'compact status line remains 26px');
 assert.ok(initial.transport.bottom<=initial.status.top+1,'transport above status');
 assert.ok(initial.roll.bottom<=initial.transport.top+1,'piano is not covered by status or transport');
 assert.ok(Math.abs(initial.keyboardHeight/initial.keyboardWidth-5.5)<.04,'proportional 88 keys preserved');
 assert.equal(await page.locator('#statusMode').textContent(),'MIDI · Слушать');
 assert.equal(await page.locator('#keyboardRangeText').textContent(),'88 клавиш · A0–C8');
 assert.equal(await page.locator('#roll .rollStatus').count(),0,'transient notice no longer overlays piano');
 assert.equal(await page.locator('.keyboardInfo').count(),0,'old information strip removed');
 await page.locator('#handsMenuButton').click();
 assert.equal(await page.locator('#fingerGuideMode').isVisible(),true,'finger guidance selector retained in topbar menu');
 assert.equal(await page.locator('#fingerGuideLookahead').isVisible(),true);

 // Status shows actual target reachability; existing source remains 88-key.
 await page.evaluate(()=>{
  const select=document.getElementById('targetRange');
  select.value='preview25';
  select.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.waitForFunction(()=>document.getElementById('deviceRangeText').textContent.includes('25'));
 assert.equal(await page.locator('#deviceRangeText').textContent(),' · активны 25');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pianoGeometry.keys.length),88);
 assert.match(await page.locator('#statusKeyboard').getAttribute('title'),/Активный диапазон .+–.+ · предпросмотр/);

 // Mode changes must flow into the status bar even when toolbar is disabled.
 await page.locator('#bottomMode').selectOption('wait');
 await page.waitForFunction(()=>document.getElementById('statusMode').textContent==='MIDI · Wait');
 await page.locator('#bottomMode').selectOption('tempo');
 await page.waitForFunction(()=>document.getElementById('statusMode').textContent==='MIDI · Tempo');
 await page.locator('#bottomMode').selectOption('listen');

 // A transient info notice goes to the footer, not across falling notes.
 await page.locator('#focusBtn').click();
 await page.waitForFunction(()=>document.getElementById('rollStatus').textContent.includes('Фокус'));
 const focused=await frame();
 assert.ok(Math.abs(focused.roll.bottom-focused.status.top)<=1,'focus stops at status edge');
 assert.ok(await page.locator('#rollStatus').isVisible(),'focus notice appears in footer');
 await page.keyboard.press('f');
 await page.waitForFunction(()=>!document.body.classList.contains('focus'));
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>innerWidth===390);
 const mobile=await frame();
 assert.ok(Math.abs(mobile.status.bottom-844)<=1);
 assert.ok(mobile.roll.bottom<=mobile.transport.top+1,'mobile piano stops above transport');
 assert.equal(await page.locator('#statusMode').isVisible(),true);
 assert.equal(await page.locator('#statusKeyboard').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pianoGeometry.keys.length),88);

 await page.locator('[data-page="library"]').evaluate(el=>el.click());
 const lib=await frame();
 assert.ok(lib.shell.bottom<=lib.status.top+1,'Library workspace respects fixed status line');
 await page.locator('[data-page="progress"]').evaluate(el=>el.click());
 const progress=await frame();
 assert.ok(progress.shell.bottom<=progress.status.top+1,'Progress workspace respects fixed status line');
 assert.deepEqual(pageerrors,[],'no runtime errors from status bar reparenting');
 console.log('STATUS BAR v0.10.115: pinned 26px, modes, range 25/88, no roll overlay, focus/mobile/library/progress: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
