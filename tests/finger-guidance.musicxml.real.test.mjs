import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(dist,'.'+(route==='/'?'/index.html':route));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end('not found');return;}
 res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');
 res.end(fs.readFileSync(file));
});
const note=(step,oct,staff,voice,finger)=>'<note><pitch><step>'+step+'</step><octave>'+oct+'</octave></pitch>'+
 '<duration>480</duration><voice>'+voice+'</voice><type>quarter</type><staff>'+staff+'</staff>'+
 (finger==null?'':'<notations><technical><fingering>'+finger+'</fingering></technical></notations>')+'</note>';
const begin='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">';
const grand=begin+'<measure number="1"><attributes><divisions>480</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'+
 note('C',4,1,1,1)+note('D',4,1,1,2)+note('E',4,1,1,null)+note('F',4,1,1,3)+
 '<backup><duration>1920</duration></backup>'+
 note('C',3,2,2,5)+note('E',3,2,2,3)+note('G',3,2,2,1)+note('A',3,2,2,null)+
 '</measure></part></score-partwise>';
const solo=begin+'<measure number="1"><attributes><divisions>480</divisions></attributes>'+
 note('C',4,1,1,1)+note('D',4,1,1,null)+
 '<note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><notations><technical><fingering alternate="yes">3</fingering></technical></notations></note>'+
 '<note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><notations><technical><fingering>9</fingering></technical></notations></note>'+
 '</measure></part></score-partwise>';
const tie='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Right hand</part-name></score-part></part-list>'+
 '<part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>'+
 '<note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><tie type="start"/>'+
 '<notations><technical><fingering>4</fingering></technical></notations></note></measure>'+
 '<measure number="2"><note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><tie type="stop"/>'+
 '<notations><technical><fingering>5</fingering></technical></notations></note></measure></part></score-partwise>';

await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__libraryV08&&window.__prototypeTest&&window.__fingerGuideTest);
 const result=await page.evaluate(data=>{
  const read=xml=>window.__libraryV08.readMusicXML(xml,'authored.musicxml');
  const score=read(data.grand);
  window.__prototypeTest.loadSong(score);
  return {
   tracks:score.tracks.map(t=>t.notes.map(n=>({pitch:n.pitch,finger:n.finger??null,hand:n.hand??null,
    src:n.fingeringSource??null,staff:n.staff,voice:n.voice,id:n.noteId}))),
   steps:window.__fingerGuideTest.steps,
   solo:(()=>{const s=read(data.solo);return {notes:s.tracks.flatMap(t=>t.notes),warnings:s.warnings}})(),
   tie:(()=>{const s=read(data.tie);return {notes:s.tracks.flatMap(t=>t.notes),warnings:s.warnings}})()
  };
 },{grand,solo,tie});
 assert.equal(result.tracks.length,2);
 const notes=result.tracks.flat(),top=notes.filter(n=>n.staff==='1'),bottom=notes.filter(n=>n.staff==='2');
 assert.deepEqual(top.map(n=>n.finger),[1,2,null,3]);
 assert.deepEqual(bottom.map(n=>n.finger),[5,3,1,null]);
 assert.deepEqual(top.map(n=>n.hand),['RH','RH',null,'RH']);
 assert.deepEqual(bottom.map(n=>n.hand),['LH','LH','LH',null]);
 assert.equal(new Set(notes.map(n=>n.id)).size,8);
 assert.ok(notes.every(n=>n.id.startsWith('xml:P1:')));
 assert.deepEqual(result.steps.map(g=>g.notes.length),[2,2,1,1]);
 assert.deepEqual(result.solo.notes.map(n=>n.finger??null),[1,null,null,null]);
 assert.equal(result.solo.notes[0].hand,undefined,'Unknown hand must not be guessed');
 assert.ok(result.solo.warnings.some(w=>w.includes('альтернативная')));
 assert.ok(result.solo.warnings.some(w=>w.includes('не распознаны')));
 assert.equal(result.tie.notes.length,1);
 assert.equal(result.tie.notes[0].finger,4);
 assert.equal(result.tie.notes[0].hand,'RH');
 assert.equal(result.tie.notes[0].duration,1);
 assert.ok(result.tie.warnings.some(w=>w.includes('лигой')));
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>document.querySelector('#fingerGuideStatus').textContent.includes('MusicXML: авторская аппликатура'));
 await page.waitForFunction(()=>window.__fingerGuideTest.imageAssets.RH.thumb.loaded&&window.__fingerGuideTest.imageAssets.LH.pinky.loaded,{timeout:10000});
 const frame=await page.evaluate(()=>({
  imageAssets:window.__fingerGuideTest.imageAssets,
  placements:window.__fingerGuideTest.spritePlacements,
  status:document.querySelector('#fingerGuideStatus').textContent
 }));
 assert.ok(frame.imageAssets.RH.thumb.loaded&&frame.imageAssets.LH.pinky.loaded);
 assert.ok(frame.placements.RH&&frame.placements.LH);
 assert.ok(frame.status.includes('6/8'),'Partial annotation count must be shown');
 await page.evaluate(()=>window.__prototypeTest.seek(.5));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.steps[1].notes.length),2);
 await page.evaluate(()=>window.__prototypeTest.setAdaptMode('transpose',12));
 assert.equal(await page.evaluate(()=>window.__fingerGuideTest.steps.length),0);
 await page.evaluate(()=>window.__prototypeTest.setAdaptMode('original',0));
 await page.evaluate(xml=>window.__prototypeTest.loadSong(window.__libraryV08.readMusicXML(xml,'solo.musicxml')),solo);
 await page.locator('#fingerGuideMode').selectOption('hands');
 await page.waitForFunction(()=>document.querySelector('#fingerGuideStatus').textContent.includes('рука не указана'));
 const single=await page.evaluate(()=>window.__fingerGuideTest.steps);
 assert.equal(single[0].notes[0].hand,null);
 assert.deepEqual(errors,[],'No unhandled JavaScript errors');
 console.log('FG-01 MusicXML: grand staff, source fingers, ambiguity, tie, original hand PNGs, Seek: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
