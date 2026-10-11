import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(here,'index.html'),'utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Standalone document: no external server or requests, no user-profile data.
 await page.setContent(html,{waitUntil:'load'});
 assert.equal(await page.locator('#piano .key-bg').count(),22);
 assert.equal(await page.locator('#piano .black-key').count(),15);
 for(let i=0;i<5;i++){
  await page.evaluate(i=>window.__fg00.select(i),i);
  assert.equal(await page.evaluate(()=>window.__fg00.step),0);
  assert.ok(await page.locator('#piano .hand-layer').count()>=1);
  await page.evaluate(()=>window.__fg00.setView('digits'));
  assert.equal(await page.locator('#piano .hand-layer').count(),0);
  assert.equal(await page.locator('#piano .number-disc').count(),
   await page.evaluate(()=>window.__fg00.fingerings.length));
  await page.evaluate(()=>window.__fg00.setView('ghost'));
  if(i<4){await page.locator('#next').click();assert.equal(await page.evaluate(()=>window.__fg00.step),1)}
 }
 await page.evaluate(()=>window.__fg00.select(4));
 assert.equal(await page.locator('#piano .hand-layer').count(),2);
 assert.equal(await page.locator('#piano .ghost-layer').count(),2);
 await page.locator('#transition').click();
 await page.waitForTimeout(920);
 assert.equal(await page.evaluate(()=>window.__fg00.step),0);
 await page.locator('#play').click();
 await page.waitForTimeout(1450);
 assert.equal(await page.evaluate(()=>window.__fg00.step),1);
 await page.locator('#play').click();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#piano .hand-layer').count(),2);
 assert.ok(await page.evaluate(()=>document.querySelector('.keyboard-wrap').scrollWidth >
   document.querySelector('.keyboard-wrap').clientWidth),
  'Mobile keyboard must be horizontally scrollable');
 assert.deepEqual(errors,[],'Uncaught errors');
 console.log('FG-00 Chromium smoke: 5 scenarios, 3 modes, hand targets, transition, autoplay and mobile PASS');
}finally{await browser.close()}
