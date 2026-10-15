import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// LAUNCH-02 hybrid sidebars: real DOM/Canvas, not an isolated CSS fixture.
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
 const page=await browser.newPage({viewport:{width:1792,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys.length===88);
 await page.locator('#layoutMenuButton').click();
 await page.locator('[data-layout="learn"]').click();
 const geometry=()=>page.evaluate(()=>{
  const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();
   return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const shell=document.getElementById('shell');
  const g=window.__prototypeTest.pianoGeometry;
  return {left:rect('leftPanel'),right:rect('rightPanel'),roll:rect('rollWrap'),
   keys:g.keys.length,whiteWidth:g.whites[0].w,
   keyboardHeight:window.__fingerGuideTest.layout.keyboardBottom-
    window.__fingerGuideTest.layout.keyboardTop,
   dockLeft:shell.classList.contains('dockLeft'),
   dockRight:shell.classList.contains('dockRight'),
   overlay:!document.getElementById('panelScrim').classList.contains('hidden'),
   viewport:innerWidth,
   scrollHeight:document.getElementById('leftPanel').scrollHeight,
   clientHeight:document.getElementById('leftPanel').clientHeight};
 });
 const first=await geometry();
 assert.equal(first.keys,88);
 assert.ok(first.dockLeft&&first.dockRight,'both pins dock on a wide monitor');
 assert.ok(Math.abs(first.roll.left-first.left.right-5)<=2,'roll starts after left dock and splitter');
 assert.ok(Math.abs(first.roll.right-first.right.left+5)<=2,'roll ends before right dock and splitter');
 assert.ok(first.left.bottom>first.roll.top+100,'left drawer reaches BELOW the roll start');
 assert.ok(first.right.bottom>first.roll.top+100,'right drawer reaches BELOW the roll start');
 assert.ok(Math.abs(first.keyboardHeight/first.whiteWidth-5.5)<.04,'natural keys keep physical proportions');
 assert.ok(first.scrollHeight>=first.clientHeight,'side panel supports independent scrolling');
 assert.equal(first.overlay,false,'pinned panels do not need a blocking backdrop');

 // Unpin left: it floats above the piano; keyboard gains back its width.
 await page.locator('#leftPin').click();
 await page.waitForTimeout(220);
 const floating=await geometry();
 assert.equal(floating.dockLeft,false);
 assert.equal(floating.dockRight,true);
 assert.equal(floating.overlay,true);
 assert.equal(floating.roll.left,0,'floating drawer does not shrink the piano');
 const front=await page.evaluate(()=>{
  const e=document.elementFromPoint(14,680);
  return !!e?.closest('#leftPanel');
 });
 assert.equal(front,true,'drawer is on top of the full-height roll at keyboard Y');

 // Backdrop click dismisses ONLY the floating drawer.
 await page.mouse.click(720,450);
 const dismissed=await geometry();
 assert.equal(dismissed.overlay,false);
 assert.equal(await page.locator('#leftPanel').isVisible(),false);
 await page.locator('#rightToggle').click();
 const full=await geometry();
 assert.equal(full.dockRight,false);
 assert.equal(full.roll.left,0);
 assert.ok(Math.abs(full.roll.width-full.viewport)<=1,'closed panels yield edge-to-edge 88 keys');

 // Stored pins and open/closed state survive reload.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys.length===88);
 assert.equal(await page.locator('#leftPin').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#rightPin').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#leftPanel').isVisible(),false);
 await page.locator('#leftToggle').click();
 assert.equal((await geometry()).overlay,true);
 await page.keyboard.press('Escape');
 assert.equal((await geometry()).overlay,false,'Escape dismisses floating drawers');

 // A saved pin is advisory: narrow screens override it, then restore it.
 await page.locator('#leftToggle').click();
 await page.locator('#leftPin').click();
 assert.equal((await geometry()).dockLeft,true);
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>innerWidth===390&&!document.getElementById('shell').classList.contains('dockLeft'));
 const mobile=await geometry();
 assert.equal(mobile.keys,88);
 assert.equal(mobile.dockLeft,false);
 assert.equal(mobile.overlay,true);
 assert.ok(Math.abs(mobile.roll.width-390)<=1,'mobile still shows all 88 piano keys');
 assert.ok(Math.abs(mobile.left.top-54)<=1,'drawer starts below mobile header');
 assert.ok(mobile.left.bottom>mobile.roll.top+100,'mobile drawer spans keyboard, not just header');
 await page.setViewportSize({width:1792,height:900});
 await page.waitForFunction(()=>innerWidth===1792&&document.getElementById('shell').classList.contains('dockLeft'));
 assert.equal((await geometry()).dockLeft,true,'saved pin redocks when space returns');

 // Focus mode has an uninterrupted A0-C8 surface; independent full Library unaffected.
 await page.locator('#focusBtn').click();
 assert.ok(Math.abs((await geometry()).roll.width-1792)<=1,'focus mode uses complete viewport width');
 await page.keyboard.press('f');
 await page.locator('[data-page="library"]').click();
 assert.equal(await page.locator('#leftPanel').isVisible(),true);
 assert.equal((await geometry()).overlay,false);
 assert.ok((await geometry()).left.width>=1790,'Library workspace keeps full width');
 assert.deepEqual(errors,[],'hybrid layout must not throw browser exceptions');
 console.log('HYBRID PANELS: wide docks, floating z-index, backdrop/Esc, saved pins, mobile fallback, full 88, focus, Library: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
