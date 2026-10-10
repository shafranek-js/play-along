import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const xml='<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Legacy Migration Fixture</work-title></work><movement-title>Legacy Migration Fixture</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note><note><rest/><duration>1440</duration><type>half</type><dot/></note></measure></part></score-partwise>';
const input=Buffer.from(xml,'utf8');let h=2166136261;for(const b of input)h=Math.imul(h^b,16777619)>>>0;
const id='saved-'+h.toString(16)+'-'+input.length;
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/seed'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Seed IndexedDB v2</title>');return}
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin+'/seed');
 await page.evaluate(async({id,xml})=>{
  const req=indexedDB.open('playalong-library-v08',2);
  req.onupgradeneeded=()=>{
   const db=req.result;db.createObjectStore('works',{keyPath:'id'});db.createObjectStore('prefs');
   const history=db.createObjectStore('performances',{keyPath:'id'});history.createIndex('profile','profile',{unique:false});
  };
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const data=new TextEncoder().encode(xml).buffer;
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['works','prefs','performances'],'readwrite');
   tx.objectStore('works').put({id,name:'legacy.musicxml',title:'Legacy Migration Fixture',author:'Previous release',format:'musicxml',origin:'test',license:'',page:'',added:42,data});
   tx.objectStore('prefs').put([id],'favorites');
   tx.objectStore('performances').put({id:'previous-attempt',profile:'test-profile',date:'2026-01-01T00:00:00.000Z',score:87,notes:[]});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();localStorage.setItem('playalong:smart-practice:v07',JSON.stringify({selected:id}));
 },{id,xml});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.collection.length===1&&window.__prototypeTest?.song?.title==='Legacy Migration Fixture',null,{timeout:25000});
 const migrated=await page.evaluate(async()=>{
  const rows=window.__libraryV08.collection;
  const req=indexedDB.open('playalong-library-v08');
  const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  const get=store=>new Promise((resolve,reject)=>{const q=db.transaction(store,'readonly').objectStore(store).get(rows[0].id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  const [binary,meta]=await Promise.all([get('works'),get('workIndex')]);
  const version=db.version;db.close();
  return {version,meta,byteLength:binary?.data?.byteLength,selected:window.__prototypeTest.song.id,rows:rows.length,notes:window.__prototypeTest.song.tracks[0].notes.length};
 });
 assert.equal(migrated.version,3);assert.equal(migrated.rows,1);assert.equal(migrated.selected,id);
 assert.equal(migrated.byteLength,input.length);assert.equal(migrated.meta.data,undefined);
 assert.equal(migrated.meta.dataSize,input.length);assert.ok(migrated.notes>0);
 assert.equal(await page.evaluate(()=>window.__libraryV08.collection[0].data),undefined);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(expected=>window.__prototypeTest?.song?.id===expected,id,{timeout:25000});
 assert.deepEqual(errors,[]);
 console.log('LIBRARY MIGRATION: v2 → v3; metadata-only listing; binary preserved; auto-restored song: PASS');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
