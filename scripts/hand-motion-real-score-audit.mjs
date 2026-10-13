/**
 * FG-03D2: PINNED real ASAP MusicXML -> actual Play Along Chromium importer
 * -> strictly original source-numbered hand-motion screening evidence.
 *
 * The sample is NC-research only. No source notes, XML, MIDI or finger
 * suggestions are written to the report, committed or shipped to Pages.
 * "moving" means heuristic did not refuse, NOT pianist-approved motion.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {realCorpusManifest,validateRealCorpusManifest,gitBlobHash} from './fingering-asap-real-score-audit.mjs';
import {auditImportedHandMotion} from '../src/core/real-hand-motion-evidence.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..'),dist=path.join(root,'dist');
export const SAMPLE_IDS=[
 'bach-prelude-846','bach-fugue-846','chopin-etude-10-1','mozart-sonata-12-2'
];
const fail=code=>{throw Error(code)};
const pinned=manifest=>{
 validateRealCorpusManifest(manifest);
 const cases=SAMPLE_IDS.map(id=>manifest.cases.find(c=>c.id===id));
 if(cases.some(x=>!x)||new Set(cases.map(x=>x.composer)).size<3)
  fail('FG03D2_SAMPLE_NOT_PINNED');
 return cases;
};
const serve=()=>http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){
  res.writeHead(404);res.end('not found');return;
 }
 res.setHeader('content-type',file.endsWith('.js')?'text/javascript':
  file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');
 res.end(fs.readFileSync(file));
});
async function getScore(entry,revision,fetcher){
 const file=entry.musicxml;
 const url='https://raw.githubusercontent.com/fosfrancesco/asap-dataset/'+revision+'/'+file.path;
 const res=await fetcher(url,{signal:AbortSignal.timeout(45000)});
 if(!res?.ok||res.url&&res.url!==url)fail('FG03D2_PINNED_DOWNLOAD_FAILED:'+entry.id);
 const bytes=Buffer.from(await res.arrayBuffer());
 if(bytes.length!==file.bytes||bytes.length>4_000_000)fail('FG03D2_SOURCE_SIZE_MISMATCH:'+entry.id);
 if(gitBlobHash(bytes)!==file.blobSha)fail('FG03D2_SOURCE_HASH_MISMATCH:'+entry.id);
 const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(!/<score-partwise(?:\s|>)/.test(xml)||/<!ENTITY\b/i.test(xml))
  fail('FG03D2_UNSAFE_SCORE_SOURCE:'+entry.id);
 return xml;
}
export async function runPinnedRealMotionAudit({
 manifest=realCorpusManifest(),fetcher=globalThis.fetch
}={}){
 const entries=pinned(manifest);
 if(!fs.existsSync(path.join(dist,'index.html')))fail('FG03D2_BUILD_REQUIRED');
 const server=serve();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1450,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.__libraryV08?.readMusicXML);
  const report=[];
  for(const entry of entries){
   const xml=await getScore(entry,manifest.source.revision,fetcher);
   // Raw score bytes exist ONLY in volatile test process/browser memory.
   const parsed=await page.evaluate(source=>{
    try{
     const song=window.__libraryV08.readMusicXML(source,'pinned-real-score.musicxml');
     return {ok:true,
      originalNotationXML:!!song.originalNotationXML,
      tracks:song.tracks.map(t=>({notes:t.notes.map(n=>({
       noteId:n.noteId,sourceNoteIds:n.sourceNoteIds,
       pitch:n.pitch,start:n.start,duration:n.duration,
       staff:n.staff,voice:n.voice,partId:n.partId,
       finger:n.finger,hand:n.hand,fingeringSource:n.fingeringSource
      }))})),
      audioEvents:song.audioEvents.map(e=>({
       type:e.type,noteId:e.noteId,pitch:e.pitch,time:e.time
      })),
      warnings:song.warnings?.length||0
     };
    }catch{return {ok:false}}
   },xml);
   // Original source note IDs/timings never escape the process as a report.
   const result=parsed.ok
    ?auditImportedHandMotion({
      format:'MusicXML',notationXML:xml,
      originalNotationXML:parsed.originalNotationXML?xml:undefined,
      tracks:parsed.tracks,audioEvents:parsed.audioEvents
     })
    :{status:'REFUSED',reason:'MUSICXML_BROWSER_IMPORT_UNSUPPORTED',
      researchOnly:true,productionEligible:false,expertValidated:false};
   report.push({
    id:entry.id,composer:entry.composer,focus:entry.focus,
    sourceVerified:true,originalBlobSha:entry.musicxml.blobSha,
    importerStatus:parsed.ok?'IMPORTED':'REFUSED',
    ...result
   });
  }
  if(errors.length)fail('FG03D2_BROWSER_PAGE_ERROR');
  if(report.every(x=>x.importerStatus!=='IMPORTED'))
   fail('FG03D2_ALL_REAL_IMPORTS_REFUSED');
  const totals={
   sourceVerified:report.length,
   imported:report.filter(r=>r.importerStatus==='IMPORTED').length,
   scored:report.filter(r=>r.status!=='REFUSED').length,
   authoredPairs:report.reduce((s,x)=>s+(x.authorizedAuthorPairs||0),0),
   attemptedHandTransitions:report.reduce((s,x)=>s+(x.attemptedHandTransitions||0),0),
   heuristicallyScreenedMoving:report.reduce((s,x)=>s+(x.decisions?.moving||0),0),
   independentlyPianistLabeledNotes:0
  };
  return {schema:'fg03d2-pinned-real-motion-evidence-v1',
   status:'SOURCE_INTEGRITY_VERIFIED_NOT_MUSICAL_ACCURACY',
   sourceRepository:manifest.source.repository,revision:manifest.source.revision,
   license:manifest.source.license,usage:manifest.source.usage,
   sampleIds:[...SAMPLE_IDS],totals,scores:report,
   externalMusicianGroundTruth:false,physicalBiomechanicsMeasured:false,
   productionEligible:false,expertValidated:false,researchOnly:true};
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 try{
  const r=await runPinnedRealMotionAudit();
  if(process.env.FG03D2_REPORT){
   const file=path.resolve(process.env.FG03D2_REPORT);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
  }
  console.log('FG-03D2 real score provenance/motion screening (NOT accuracy):',
   JSON.stringify(r.totals,null,2));
 }catch(e){console.error('FG-03D2 real-score audit hard failure:',e.message);process.exitCode=1}
}
