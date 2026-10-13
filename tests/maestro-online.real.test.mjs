import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const csvPath=process.env.MAESTRO_REAL_CSV;
const zipPath=process.env.MAESTRO_REAL_ZIP;
if(Boolean(csvPath)!==Boolean(zipPath))throw Error('Real MAESTRO UI test needs BOTH MAESTRO_REAL_CSV and MAESTRO_REAL_ZIP');
const real=Boolean(csvPath);
const syntheticCsv=()=>{
 const rows=['canonical_composer,canonical_title,split,year,midi_filename,audio_filename,duration'];
 for(let i=0;i<1276;i++){
  const split=i<962?'train':i<1099?'validation':'test';
  rows.push(['Composer '+(i%13),'Catalog Piece '+i,split,2018,'2018/test-'+i+'.midi','2018/test-'+i+'.wav',140+i].join(','));
 }
 return rows.join('\n')+'\n';
};
const csv=real?fs.readFileSync(csvPath,'utf8'):syntheticCsv();
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',mime[path.extname(filename)]||'application/octet-stream');
 res.end(fs.readFileSync(filename));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/maestro-v3\.0\.0\.csv(?:$|\?)/,route=>route.fulfill({
  status:200,contentType:'text/csv; charset=utf-8',headers:{'access-control-allow-origin':'*'},body:csv
 }));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(window.__maestroCatalog?.maestroParseIndex));
 assert.equal(await page.locator('#filterMaestro').count(),1);
 assert.equal(await page.locator('option[value=maestro]').count(),1);
 // The archive must never be downloaded on app boot or on metadata lookup.
 let zipRequests=0;
 await page.route(/maestro-v3\.0\.0-midi\.zip/,route=>{zipRequests++;return route.abort('blockedbyclient')});
 await page.locator('#filterMaestro').click();
 await page.waitForFunction(()=>window.__maestroCatalog.entries.length===1276,{timeout:30000});
 assert.equal(await page.locator('#librarySourceSelect').inputValue(),'maestro');
 assert.equal(zipRequests,0,'MIDI ZIP must not be downloaded during catalog load');
 const sourceCount=await page.locator('#libraryCount').innerText();
 assert.match(sourceCount,/1276|1 276/);
 assert.ok(await page.locator('#songList .libv8-row').count()>0);
 assert.equal(await page.evaluate(()=>window.__maestroCatalog.entries.every(x=>x.source==='MAESTRO v3.0.0')),true);
 const negative=await page.evaluate(async ()=>{
  const good=window.__maestroCatalog.entries.length;
  const columns='canonical_composer,canonical_title,split,year,midi_filename,audio_filename,duration\n';
  let rejected=false;
  try{window.__maestroCatalog.maestroParseIndex(columns+'A,B,train,2018,../unsafe.midi,2018/x.wav,12\n')}catch{rejected=true}
  return rejected&&good===1276;
 });
 assert.ok(negative,'catalog must reject path traversal or malformed CSV');
 await page.locator('#librarySearch').fill(real?'Bach':'Catalog Piece 17');
 await page.waitForTimeout(100);
 assert.ok(await page.locator('#songList .libv8-row').count()>0,'composer/title search must be functional');
 if(real){
  await page.locator('#librarySearch').fill('');
  const picker=page.locator('#maestroZipFile');
  await picker.setInputFiles(zipPath);
  await page.waitForFunction(()=>window.__maestroCatalog.archiveReady,{timeout:60000});
  assert.equal(zipRequests,0,'local ZIP should not trigger an additional network request');
  const first=await page.evaluate(()=>window.__maestroCatalog.entries[0]);
  const q=first.title;
  await page.locator('#librarySearch').fill(q);
  await page.waitForTimeout(100);
  const row=page.locator('#songList .libv8-row').filter({hasText:q}).first();
  await row.locator('button.libv8-main').click();
  await page.waitForFunction(name=>document.querySelector('#songName')?.textContent?.includes(name),q,{timeout:60000});
  const title=await page.locator('#songName').innerText();
  assert.ok(title.includes(q));
  await page.waitForFunction(()=>/^(Открыто:|MIDI открыт, но не сохранён)/.test(document.querySelector('#maestroProgress')?.textContent||''),null,{timeout:45000});
  assert.match(await page.locator('#maestroProgress').innerText(),/Открыто|открыт/);
  assert.equal(zipRequests,0);
  console.log('MAESTRO_REAL_BROWSER_OPEN '+JSON.stringify({title,selected_file:first.midiPath}));
 }
 assert.deepEqual(errors,[],'Browser JavaScript errors');
 console.log('MAESTRO_CATALOG_BROWSER_OK '+JSON.stringify({metadata_records:1276,archive_downloads_before_selection:0,real_midi_opened:real}));
}finally{await browser?.close();await new Promise(ok=>server.close(ok))}
