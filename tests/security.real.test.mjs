import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest&&window.__libraryV08?.collection);
 const playAndWait=async()=>{
  await page.locator('#playBtn').click();
  await page.waitForFunction(()=>{
   const app=window.__prototypeTest,audio=app?.audio?.getStatus?.();
   return app?.isPlaying===true&&audio?.lifecycle==='ready'&&
    audio?.transport?.isPlaying===true&&audio?.transport?.isStarting!==true;
  },null,{timeout:60000});
 };
 page.on('dialog',dialog=>dialog.accept());
 const download=page.waitForEvent('download');
 await page.locator('#backupExport').click();
 const template=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
 const payload='<img src=x onerror="window.__auditBackupXss=1">';
 const malicious=structuredClone(template);
 malicious.settings.leftWidth=payload;
 const upload=async(obj)=>page.locator('#backupFile').setInputFiles({
  name:'play-along-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(obj))
 });
 await upload(malicious);
 await page.waitForFunction(()=>document.querySelector('#onlineStatus')?.textContent?.includes('Восстановление не выполнено')
  ||document.body.innerText.includes('Восстановление не выполнено'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__auditBackupXss===1),false,'HTML executed through backup setting');
 assert.ok(!(await page.evaluate(value=>window.__prototypeTest.state.leftWidth===value,payload)),'Injected width accepted');
 // Even a malicious previously saved localStorage snapshot must be normalized.
 const safeWidth=await page.evaluate(()=>{
  const key='playalong:smart-practice:v07';
  const state=JSON.parse(localStorage.getItem(key)||'{}');state.leftWidth='<img src=x onerror="window.__auditBackupXss=1">';
  localStorage.setItem(key,JSON.stringify(state));
  return state.leftWidth;
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.state);
 assert.equal(await page.evaluate(()=>window.__auditBackupXss===1),false,'HTML executed through legacy settings');
 assert.equal(await page.evaluate(()=>typeof window.__prototypeTest.state.leftWidth),'number');
 assert.ok(safeWidth.includes('<img'));
 // Keep a durable old history record as the integrity sentinel.
 await page.evaluate(async()=>{
  const q=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('performances','readwrite');
   tx.objectStore('performances').put({id:'old-attempt',date:'2026-10-10T00:00:00.000Z',profile:'audit',score:90,total:1,mode:'tempo',stats:{hits:1,wrong:0,missed:0,early:0,late:0,short:0,long:0}});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();
 });
 // A malformed performance is rejected BEFORE confirmation/reload.
 const corruptHistory=structuredClone(template);
 corruptHistory.performances=[{id:'corrupted-attempt',profile:'audit',date:'2026-10-10T00:00:00.000Z',notes:[]}];
 await upload(corruptHistory);
 await page.waitForFunction(()=>document.body.innerText.includes('Восстановление не выполнено: Некорректная запись истории'),
  null,{timeout:10000});
 assert.ok(await page.evaluate(()=>window.__prototypeTest&&window.__prototypeTest.song),
  'Rejected backup corrupted the running application');
 // Existing damaged IndexedDB history must not crash app boot or rendering.
 await page.evaluate(async()=>{
  const req=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('performances','readwrite');
   tx.objectStore('performances').put({id:'legacy-damaged',profile:'bad',date:'2026-10-10T00:00:00.000Z',notes:[]});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });db.close();
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__prototypeTest?.renderReview&&window.__libraryV08?.collection,
  null,{timeout:20000});
 await page.evaluate(()=>window.__prototypeTest.renderReview());
 // Real Chromium quota fill: no monkeypatch of Storage APIs. Settings and
 // history supplied in the backup are valid, but the master data is too big
 // to be stored together with an existing localStorage allocation.
 const quotaBackup=structuredClone(template);
 quotaBackup.works=[];
 quotaBackup.performances=[{version:1,id:'new-attempt',date:'2026-10-10T12:00:00.000Z',
  profile:'audit',score:91,total:1,mode:'tempo',accuracy:100,stats:{
   hits:1,wrong:0,missed:0,early:0,late:0,short:0,long:0,okHold:0,goodChords:0,badChords:0
  },sections:[],notes:[],extras:[],speed:100,position:0}];
 quotaBackup.settings.leftWidth=286;
 // Valid but sufficiently large per-song preferences ensure that the
 // real browser's exhausted localStorage quota is exercised deterministically.
 quotaBackup.settings.songSettings=Object.fromEntries(
  Array.from({length:1900},(_,i)=>['quota-'+i+'-'+'q'.repeat(150),{mode:'wait',speed:80}])
 );
 quotaBackup.smartMastery={};
 await page.evaluate(()=>{
  const fill='A'.repeat(256*1024);
  for(let i=0;i<28;i++){
   try{localStorage.setItem('audit-quota-filler-'+i,fill)}catch(err){
    if(err.name!=='QuotaExceededError')throw err;
    break;
   }
  }
 });
 await upload(quotaBackup);
 await page.waitForFunction(()=>document.body.innerText.includes('Восстановление не выполнено'),null,{timeout:15000});
 const remaining=await page.evaluate(async()=>{
  const q=indexedDB.open('playalong-library-v08'),db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  const rows=await new Promise((resolve,reject)=>{const r=db.transaction('performances','readonly').objectStore('performances').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  db.close();
  return {old:rows.some(r=>r.id==='old-attempt'),new:rows.some(r=>r.id==='new-attempt')};
 });
 assert.deepEqual(remaining,{old:true,new:false},'Failed recovery replaced the user history');
 // A forged backup history record may contain non-numeric HTML-like
 // strings; rendering reports must be text-only even if the record is bad.
 await page.evaluate(()=>{
  for(const key of Object.keys(localStorage))
   if(key.startsWith('audit-quota-filler-'))localStorage.removeItem(key);
  window.__prototypeTest.setMode('wait');
 });
 await playAndWait();
 await page.evaluate(()=>{
  window.__prototypeTest.receiveNoteOn(60);
  window.__prototypeTest.finishPerformance('manual');
  window.__prototypeTest.receiveNoteOff(60);
  window.__prototypeTest.pause();
  const record=window.__prototypeTest.performances[0];
  if(!record)throw Error('No performance was captured');
  record.score='<img src=x onerror="window.__auditPerfXss=1">';
  record.accuracy='<img src=x onerror="window.__auditPerfXss=1">';
  record.stats.hits='<img src=x onerror="window.__auditPerfXss=1">';
  window.__prototypeTest.setMode('listen');
  window.__prototypeTest.renderReview();
 });
 assert.equal(await page.evaluate(()=>window.__auditPerfXss===1),false,
  'Performance report executed injected markup');
 assert.deepEqual(errors,[],'Uncaught browser errors');
 console.log('BACKUP SECURITY: HTML injection rejected, startup preferences normalized, quota failure preserves prior IndexedDB history: PASS');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
