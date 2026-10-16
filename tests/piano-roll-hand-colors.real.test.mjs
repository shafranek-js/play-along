import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// This checks PIXELS from the real production canvas, not a mock palette.
// Two different hands may occur on ONE MIDI track, and tracks may be reversed.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('missing');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':'text/html');
 res.end(fs.readFileSync(file));
});
const midi=[77,84,104,100,0,0,0,6,0,0,0,1,1,224,
 77,84,114,107,0,0,0,13,0,0x90,60,90,0x83,0x60,
 0x80,60,0,0,0xff,0x2f,0];
const isBlue=rgb=>rgb[2]>rgb[0]+35&&rgb[2]>rgb[1]+10;
const isPeach=rgb=>rgb[0]>rgb[2]+22&&rgb[1]>rgb[2]+10;
const isNeutral=rgb=>Math.max(...rgb)-Math.min(...rgb)<25;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1450,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest?.loadSong&&
  window.__fingerGuideTest?.noteRects&&window.__libraryV08?.songFromBuffer);
 const getPixels=()=>page.evaluate(()=>{
  const canvas=document.getElementById('roll');
  const ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect();
  const scaleX=canvas.width/rect.width,scaleY=canvas.height/rect.height;
  return Object.fromEntries(window.__fingerGuideTest.noteRects.map(b=>{
   const x=Math.floor((b.x+b.w/2)*scaleX);
   const y=Math.floor((b.y+Math.min(b.h-3,Math.max(21,b.h*.58)))*scaleY);
   return [b.id,[...ctx.getImageData(x,y,1,1).data].slice(0,3)];
  }));
 });
 const original=await page.evaluate(()=>{
  const notes=[
   {pitch:60,start:1,duration:.8,track:0,hand:'LH',noteId:'left-track0',velocity:90},
   {pitch:64,start:1,duration:.8,track:0,hand:'RH',noteId:'right-track0',velocity:90},
   {pitch:67,start:1,duration:.8,track:1,hand:'RH',noteId:'right-track1',velocity:90},
   {pitch:69,start:1,duration:.8,track:1,hand:'LH',noteId:'left-track1',velocity:90},
   {pitch:72,start:1,duration:.8,track:1,hand:null,noteId:'unknown-track1',velocity:90}
  ];
  const app=window.__prototypeTest;app.pause();
  app.loadSong({id:'notes-by-hand',title:'Same-track LH/RH and reverse order',
   author:'QA',type:'import',tracks:[
    {name:'Piano',notes:notes.slice(0,2)},
    {name:'Instrument',notes:notes.slice(2)}
   ]});
  app.seek(0);
  return JSON.stringify(app.song.tracks.map(t=>t.notes.map(n=>[
   n.pitch,n.start,n.duration,n.track,n.hand,n.finger??null
  ])));
 });
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===5);
 const pixels=await getPixels();
 assert.ok(isBlue(pixels['left-track0']),'LH on track 0 must be blue: '+pixels['left-track0']);
 assert.ok(isBlue(pixels['left-track1']),'LH on track 1 must be blue: '+pixels['left-track1']);
 assert.ok(isPeach(pixels['right-track0']),'RH on track 0 must be peach: '+pixels['right-track0']);
 assert.ok(isPeach(pixels['right-track1']),'RH on track 1 must be peach: '+pixels['right-track1']);
 assert.ok(isNeutral(pixels['unknown-track1']),
  'Without confirmed hand, MIDI must be neutral: '+pixels['unknown-track1']);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.tracks.map(
  t=>t.notes.map(n=>[n.pitch,n.start,n.duration,n.track,n.hand,n.finger??null])))),
 original,'changing the display palette cannot change music source events');

 // Live source MIDI is initially unassigned -> neutral. Explicit user hand
 // must recolor the SAME canvas immediately, without changing the raw MIDI.
 const source=await page.evaluate(async bytes=>{
  const song=await window.__libraryV08.songFromBuffer('unlabeled.mid',
   Uint8Array.from(bytes).buffer);
  window.__prototypeTest.loadSong(song);window.__prototypeTest.seek(0);
  return {raw:Array.from(window.__prototypeTest.originalMidiBytes),
   events:JSON.stringify(song.audioEvents),
   ids:window.__fingerGuideTest.sourceOrder};
 },midi);
 assert.equal(source.ids.length,1);
 await page.waitForFunction(()=>window.__fingerGuideTest.noteRects.length===1);
 let pixel=(await getPixels())[source.ids[0]];
 assert.ok(isNeutral(pixel),'no fabricated hand for unknown MIDI: '+pixel);
 await page.locator('#sceneFingerMode').click();
 const rect=await page.evaluate(()=>window.__fingerGuideTest.noteRects[0]);
 const canvas=await page.locator('#roll').boundingBox();
 await page.mouse.click(canvas.x+rect.x+rect.w/2,canvas.y+rect.y+rect.h/2);
 await page.locator('[data-scene-hand="LH"]').click();
 pixel=(await getPixels())[source.ids[0]];
 assert.ok(isBlue(pixel),'manual LH recolors note blue: '+pixel);
 assert.equal(await page.locator('[data-scene-hand="LH"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-scene-hand="RH"]').click();
 pixel=(await getPixels())[source.ids[0]];
 assert.ok(isPeach(pixel),'manual RH recolors note peach: '+pixel);
 assert.equal(await page.locator('[data-scene-hand="RH"]').getAttribute('aria-pressed'),'true');
 await page.locator('#sceneFingerUndo').click();
 assert.ok(isBlue((await getPixels())[source.ids[0]]),'Undo restores blue LH');
 await page.locator('#sceneFingerUndo').click();
 assert.ok(isNeutral((await getPixels())[source.ids[0]]),'Undo restores unknown hand');
 assert.deepEqual(await page.evaluate(()=>Array.from(window.__prototypeTest.originalMidiBytes)),
  source.raw,'raw imported MIDI remains immutable');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.__prototypeTest.song.audioEvents)),
  source.events,'audio events remain immutable');
 assert.deepEqual(errors,[],'no browser exceptions');
 console.log('PIANO_ROLL_HAND_COLORS_PASS: LH blue, RH peach independent of track, unassigned neutral, manual RH/LH and Undo live, raw MIDI intact');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
