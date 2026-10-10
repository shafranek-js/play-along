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
 await page.waitForFunction(()=>document.querySelector('#libraryStatus')?.textContent?.includes('Восстановление не выполнено')
  ||document.body.innerText.includes('Восстановление не выполнено'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__auditBackupXss===1),false,'HTML executed through backup setting');
 assert.ok(!(await page.evaluate(()=>window.__prototypeTest.state.leftWidth===payload)),'Injected width accepted');
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
 // Real Chromium quota fill: no monkeypatch of Storage APIs. Settings and
 // history supplied in the backup are valid, but the master data is too big
 // to be stored together with an existing localStorage allocation.
 const quotaBackup=structuredClone(template);
 quotaBackup.works=[];
 quotaBackup.performances=[{id:'new-attempt',date:'2026-10-10T12:00:00.000Z',profile:'audit',score:91,total:1,mode:'tempo',stats:{hits:1,wrong:0,missed:0,early:0,late:0,short:0,long:0}}];
 quotaBackup.settings.leftWidth=286;
 quotaBackup.smartMastery={padding:'Z'.repeat(3*1024*1024)};
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
 assert.deepEqual(errors,[],'Uncaught browser errors');
 console.log('BACKUP SECURITY: HTML injection rejected, startup preferences normalized, quota failure preserves prior IndexedDB history: PASS');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
