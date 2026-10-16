import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('not found');return;
 }
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1792,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys.length===88);
 const measure=()=>page.evaluate(()=>{
  const r=id=>{const {top,bottom,left,right,width,height}=document.getElementById(id).getBoundingClientRect();return {top,bottom,left,right,width,height};};
  const g=window.__prototypeTest.pianoGeometry, k=window.__fingerGuideTest.layout;
  return {head:r('topbar'),piano:r('rollWrap'),transport:r('bottomBar'),status:r('statusBar'),keys:g.keys.length,
   keyRatio:(k.keyboardBottom-k.keyboardTop)/g.whites[0].w,
   visibleHead:document.querySelectorAll('.centerHead').length,
   pageWidth:innerWidth,headerScroll:document.getElementById('topbar').scrollWidth};
 });
 const first=await measure();
 assert.equal(first.visibleHead,0,'entire redundant song header is gone');
 assert.equal(first.keys,88);
 assert.ok(Math.abs(first.piano.top-first.head.bottom)<=1,'roll starts immediately after top menu');
 assert.ok(Math.abs(first.piano.bottom-first.transport.top)<=1,'roll reaches transport with no empty gap');
 assert.ok(Math.abs(first.keyRatio-5.5)<.04,'white keys preserve proportional geometry');
 assert.ok(first.piano.height>first.pageWidth*.25,'music has substantial vertical space');

 // Visible topbar controls must change the genuine score surface.
 await page.locator('#viewSheet').click();
 await page.waitForFunction(()=>!document.getElementById('sheetWrap').classList.contains('hidden'));
 assert.equal(await page.locator('#rollWrap').isVisible(),false);
 await page.locator('#developerToolsToggle').evaluate(el=>{if(!el.checked)el.click()});
 await page.locator('#viewFingerEditor').click();
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 await page.locator('#viewRoll').click();
 assert.equal(await page.locator('#rollWrap').isVisible(),true);

 await page.locator('#handsMenuButton').click();
 assert.equal(await page.locator('#fingerGuideMode').isVisible(),true);
 await page.locator('#fingerGuideMode').selectOption('hands');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.fingerGuidanceMode),'hands');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#handsMenuPanel').isVisible(),false);

 await page.locator('#songInfoButton').click();
 assert.equal(await page.locator('#songInfoPopover').isVisible(),true);
 assert.ok((await page.locator('#songName').textContent()).length>0);
 assert.match(await page.locator('#songMeta').textContent(),/дорож/);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#songInfoPopover').isVisible(),false);

 await page.locator('#layoutMenuButton').click();
 await page.locator('[data-layout="play"]').click();
 assert.equal(await page.locator('#layoutMenuItems').isVisible(),false);
 assert.equal(await page.locator('#layoutMenuButton').textContent(),'Компоновка: Игра ▾');
 const play=await measure();
 assert.ok(Math.abs(play.piano.left)<=1&&Math.abs(play.piano.width-play.pageWidth)<=1,
  'closed panels free all window width');
 await page.locator('#layoutMenuButton').click();
 await page.locator('[data-layout="learn"]').click();
 assert.equal(await page.locator('#leftPanel').isVisible(),true);

 await page.locator('#focusBtn').click();
 const focus=await measure();
 assert.ok(Math.abs(focus.piano.top)<=1,'focus rolls to top edge: '+JSON.stringify({focus,bodyClass:await page.locator('body').getAttribute('class'),top:await page.locator('#rollWrap').evaluate(el=>getComputedStyle(el).top)}));
 assert.ok(Math.abs(focus.piano.bottom-focus.status.top)<=1,'focus ends at persistent status');
 await page.keyboard.press('f');

 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>innerWidth===390);
 assert.equal(await page.locator('#compactViewSelect').isVisible(),true);
 await page.locator('#compactViewSelect').selectOption('sheet');
 assert.equal(await page.locator('#sheetWrap').isVisible(),true);
 await page.locator('#compactViewSelect').selectOption('editor');
 assert.equal(await page.locator('#fingerEditorWrap').isVisible(),true);
 await page.locator('#compactViewSelect').selectOption('roll');
 const mobile=await measure();
 assert.ok(Math.abs(mobile.piano.top-mobile.head.bottom)<=1,'mobile roll starts below menu');
 assert.ok(Math.abs(mobile.piano.bottom-mobile.transport.top)<=1,'mobile roll fills height');
 assert.ok(Math.abs(mobile.keyRatio-5.5)<.04);
 assert.ok(mobile.headerScroll<=mobile.pageWidth+3,'topbar has no horizontal overflow');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.pianoGeometry.keys.length),88);
 await page.locator('[data-page="library"]').evaluate(el=>el.click());
 assert.equal(await page.locator('#leftPanel').isVisible(),true);
 await page.locator('[data-page="progress"]').evaluate(el=>el.click());
 assert.equal(await page.locator('#rightPanel').isVisible(),true);
 assert.deepEqual(errors,[],'compact workspace has no browser runtime error');
 console.log('COMPACT WORKSPACE: no redundant header, full-height roll, top views/layout/hands, song info, focus/mobile/library: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
