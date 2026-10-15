import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'),pathname=u.pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
 res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1792,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys?.length===88);
 const slider=page.locator('#gridVisibility');
 assert.equal(await slider.inputValue(),'50','initial slider default is 50%');
 assert.equal(await page.locator('#gridVisibilityValue').textContent(),'50%');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.gridVisibility),50);

 // Real browser Canvas image data, not CSS opacity or a mock context.
 const canvasSample=()=>page.evaluate(()=>{
  const app=window.__prototypeTest,g=app.pianoGeometry;
  const canvas=document.getElementById('roll'),ctx=canvas.getContext('2d');
  const keyTop=window.__fingerGuideTest.layout.keyboardTop;
  const y=Math.max(10,Math.round(keyTop*.22));
  const white=g.whites[0],black=g.blacks[0],middle=g.whites[25];
  const sample=(x,cy)=>[...ctx.getImageData(Math.floor(x),Math.floor(cy),1,1).data].slice(0,3);
  return {white:sample(white.center,y),black:sample(black.center,y),
   keyboard:sample(middle.center,keyTop+Math.min(60,g.whites[0].w*3)),
   range:g.keys.length,firstWhite:Math.round(white.w),gridY:y};
 });
 const change=async value=>{
  await slider.evaluate((input,v)=>{
   input.value=String(v);
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
  await page.waitForFunction(v=>window.__prototypeTest.state.gridVisibility===v,value);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  assert.equal(await page.locator('#gridVisibilityValue').textContent(),value+'%');
 };
 const half=await canvasSample();
 await change(0);
 const zero=await canvasSample();
 const background=[0x11,0x17,0x20];
 assert.deepEqual(zero.white,background,'0% removes white lanes to solid background');
 assert.deepEqual(zero.black,background,'0% removes black lanes to solid background');
 assert.deepEqual(zero.keyboard,half.keyboard,'0% does not dim piano keys');
 assert.equal(zero.range,88);
 await change(100);
 const full=await canvasSample();
 const close=(rgb,expected,tolerance=3)=>
  rgb.every((channel,i)=>Math.abs(channel-expected[i])<=tolerance);
 assert.ok(close(full.white,[0x1c,0x27,0x35]),'100% restores legacy white lanes: '+full.white);
 assert.ok(close(full.black,[0x0c,0x12,0x1c]),'100% restores legacy black lanes: '+full.black);
 assert.deepEqual(full.keyboard,half.keyboard,'100% still has identical keyboard');
 await change(50);
 const midpoint=await canvasSample();
 const blend=(color,base)=>color.map((x,i)=>Math.round((x+base[i])/2));
 assert.ok(close(midpoint.white,blend(full.white,background)),'50% correctly blends white lane over dark: '+midpoint.white);
 assert.ok(close(midpoint.black,blend(full.black,background)),'50% correctly blends black lane over dark: '+midpoint.black);
 assert.deepEqual(midpoint.keyboard,half.keyboard,'50% preserves existing keys');

 // Global preference, persists across reload without changing source notes.
 await change(0);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys?.length===88);
 assert.equal(await slider.inputValue(),'0');
 assert.equal(await page.evaluate(()=>window.__prototypeTest.state.gridVisibility),0);
 assert.deepEqual((await canvasSample()).white,background,'persisted 0% remains a plain dark background');
 await change(100);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys?.length===88);
 assert.equal(await slider.inputValue(),'100');

 // Legacy installations missing the new key automatically get 50%.
 await page.evaluate(()=>{
  const key='playalong:smart-practice:v07';
  const stored=JSON.parse(localStorage.getItem(key)||'{}');
  delete stored.gridVisibility;
  localStorage.setItem(key,JSON.stringify(stored));
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys?.length===88);
 assert.equal(await slider.inputValue(),'50');
 // A malformed persisted value is normalized (backups use the same validation).
 await page.evaluate(()=>{
  const key='playalong:smart-practice:v07';
  const stored=JSON.parse(localStorage.getItem(key)||'{}');
  stored.gridVisibility=900;
  localStorage.setItem(key,JSON.stringify(stored));
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.pianoGeometry?.keys?.length===88);
 assert.equal(await slider.inputValue(),'50');
 assert.deepEqual(errors,[],'No runtime errors during opacity changes');
 console.log('ROLL GRID: 0% dark field, 50% blended lanes, 100% legacy, unchanged 88 keys, reload/migration/validation: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
