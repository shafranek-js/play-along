import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const prefix='<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>';
const suffix='</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
// Fixed, verified birthday collision in 32-bit FNV, with valid MusicXML and equal length.
const a=new TextEncoder().encode(prefix+'003hqws2'+suffix);
const b=new TextEncoder().encode(prefix+'01nc3u4v'+suffix);
const fnv=bytes=>{let h=2166136261;for(const v of bytes)h=Math.imul(h^v,16777619)>>>0;return 'saved-'+h.toString(16)+'-'+bytes.length};
assert.equal(fnv(a),'saved-4e52c948-331');
assert.equal(fnv(b),fnv(a));
assert.notDeepEqual(a,b);

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
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.collection&&window.__prototypeTest);
 await page.evaluate(async ({id,bytes})=>{
  const req=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['works','workIndex','prefs','performances'],'readwrite');
   const entry={id,name:'legacy-collision.musicxml',title:'Legacy collision',author:'Audit',format:'musicxml',origin:'import',
    license:'',page:'',added:1,data:new Uint8Array(bytes).buffer};
   tx.objectStore('works').put(entry);
   const {data,...meta}=entry;
   tx.objectStore('workIndex').put({...meta,dataSize:data.byteLength});
   tx.objectStore('prefs').put([id],'favorites');
   tx.objectStore('performances').put({id:'collision-sentinel',profile:'audit',date:'2026-10-11T10:00:00.000Z',
    mode:'wait',score:100,total:1,stats:{hits:1,wrong:0,missed:0,early:0,late:0,short:0,long:0}});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  db.close();
 },{id:fnv(a),bytes:[...a]});
 // Export a valid backup: this normalizes the old history sentinel.
 const download=page.waitForEvent('download');
 await page.locator('#backupExport').click();
 const template=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
 assert.ok(template.works.some(w=>w.id===fnv(a)));
 const snapshot=()=>page.evaluate(async()=>{
  const req=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const tx=db.transaction(['works','workIndex','prefs','performances'],'readonly');
  const read=store=>new Promise((resolve,reject)=>{
   const r=tx.objectStore(store).getAll();
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  const [works,index,prefs,history]=await Promise.all(
   ['works','workIndex','prefs','performances'].map(read));
  db.close();
  const normalize=x=>JSON.stringify(x);
  return {works:normalize(works.map(({data,...meta})=>({...meta,bytes:[...new Uint8Array(data)]}))),
   index:normalize(index),prefs:normalize(prefs),history:normalize(history),
   local:Object.fromEntries(['playalong:smart-practice:v07','playalong:performance:attempts:v06',
    'playalong:smart-practice:mastery:v01'].map(k=>[k,localStorage.getItem(k)]))};
 });
 const before=await snapshot();
 const tampered=structuredClone(template);
 const target=tampered.works.find(w=>w.id===fnv(a));
 target.data=Buffer.from(b).toString('base64');
 // Old 32-bit checksum still passes validation, but the existing bytes differ.
 await page.locator('#backupFile').setInputFiles({
  name:'collision-backup.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(tampered))
 });
 await page.waitForFunction(()=>document.body.innerText.includes('Восстановление не выполнено: Конфликт ID музыкального файла'),
  null,{timeout:15000});
 const after=await snapshot();
 assert.deepEqual(after,before,'Aborted restore must preserve IndexedDB and localStorage');
 assert.deepEqual(pageErrors,[],'Rejected restore must not produce uncaught browser exceptions');
 assert.ok(await page.locator('body').innerText().then(s=>s.includes('Восстановление отменено без изменения данных')));
 console.log('B03: real legacy FNV collision rejected, clear UI error, atomic rollback, no pageerror: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
