import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const midi=()=>{
 const header=Buffer.from('4d546864000000060000000101e0','hex');
 const events=Buffer.from([0,0x90,60,90,0x83,0x60,0x80,60,0,0,0xff,0x2f,0]);
 const track=Buffer.alloc(8);track.write('MTrk');track.writeUInt32BE(events.length,4);
 return Buffer.concat([header,track,events]);
};
function zipFiles(choices){
 const local=[],central=[];let offset=0;
 for(const [name,contents] of choices){
  const label=Buffer.from(name),packed=deflateRawSync(contents),length=contents.length;
  const entry=Buffer.alloc(30);
  entry.writeUInt32LE(0x04034b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(8,8);
  entry.writeUInt32LE(packed.length,18);entry.writeUInt32LE(length,22);entry.writeUInt16LE(label.length,26);
  local.push(entry,label,packed);
  const directory=Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);
  directory.writeUInt16LE(8,10);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(length,24);
  directory.writeUInt16LE(label.length,28);directory.writeUInt32LE(offset,42);
  central.push(directory,label);offset+=entry.length+label.length+packed.length;
 }
 const centralSize=central.reduce((n,b)=>n+b.length,0);
 const tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50,0);
 tail.writeUInt16LE(choices.length,8);tail.writeUInt16LE(choices.length,10);
 tail.writeUInt32LE(centralSize,12);tail.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,tail]);
}
const archive=zipFiles([['part-one.mid',midi()],['part-two.mid',midi()]]);
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/choices.zip'){res.setHeader('content-type','application/zip');res.end(archive);return}
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(filename)]||'application/octet-stream');res.end(fs.readFileSync(filename));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__libraryV08?.onlineOpen);
 const options={url:origin+'/choices.zip',title:'ZIP dialog lifecycle',author:'CI',
  source:'Mutopia',id:'zip-dialog-test'};
 await page.evaluate(input=>{window.__libraryV08.onlineOpen(input)},options);
 await page.waitForFunction(()=>[...document.querySelectorAll('.overlay.show h2')].some(x=>x.textContent.includes('Выбери часть')));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('.overlay.show')&&
  !document.querySelector('#onlineStatus').classList.contains('loading'),null,{timeout:7000});
 assert.match(await page.locator('#onlineStatus').textContent(),/Выбор части отменён/);
 // A fresh onlineOpen MUST be admitted immediately after cancellation.
 await page.evaluate(input=>{window.__libraryV08.onlineOpen(input)},options);
 await page.waitForFunction(()=>[...document.querySelectorAll('.overlay.show h2')].some(x=>x.textContent.includes('Выбери часть')),null,{timeout:7000});
 const second=page.locator('.overlay.show button').filter({hasText:'part-two.mid'}).first();
 await second.click();
 await page.waitForFunction(()=>window.__prototypeTest?.song?.title?.includes('part-two.mid')
   &&!document.querySelector('#onlineStatus').classList.contains('loading'),null,{timeout:15000});
 assert.ok(await page.evaluate(()=>window.__prototypeTest.song.tracks[0].notes.length)>0);
 assert.equal(await page.locator('.overlay.show').count(),0);
 assert.deepEqual(errors,[]);
 console.log('ZIP CANCEL: Escape settles pending selection; next online download opens without reload: PASS');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
