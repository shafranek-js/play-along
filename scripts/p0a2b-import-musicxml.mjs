/**
 * Private, SOURCE-BYTES-BOUND MusicXML -> blind-hand reviewer intake.
 *
 * Usage (after npm ci and npm run build):
 * node scripts/p0a2b-import-musicxml.mjs --file /private/score.musicxml
 *  --id work-001 --group composer-001 --split development
 *  --rights-confirmed --output /private/blind-packet.json
 *
 * No networking, no uploaded score and no expert finger fabrication.
 */
import {readFile,open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,dirname,join,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {p0a2bCandidateFromSong} from '../src/core/p0a2b-source-intake.mjs';
import {makeP0A2bBlindPacket} from '../src/core/p0a2b-independent-review.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fail=reason=>({ok:false,reason,candidateOnly:true,productionEligible:false});
export async function importP0A2bMusicXML({file,output,cohortId,groupId,split='development',
 rightsConfirmed=false,dist=join(repo,'dist')}={}){
 if(!file||!output||!cohortId||!groupId||rightsConfirmed!==true)
  return fail('SOURCE_AND_RIGHTS_REQUIRED');
 const path=resolve(file),dest=resolve(output);
 if(path===dest||extname(path).toLowerCase()!=='.musicxml'&&
    extname(path).toLowerCase()!=='.xml')return fail('ONLY_LOCAL_UNCOMPRESSED_MUSICXML');
 let raw;
 try{
  const s=await stat(path);if(!s.isFile()||s.size<50||s.size>5_000_000)
   return fail('MUSICXML_SIZE_UNSUPPORTED');
  raw=await readFile(path);
 }catch{return fail('PRIVATE_SOURCE_UNREADABLE')}
 const sha=createHash('sha256').update(raw).digest('hex');
 const xml=new TextDecoder('utf8',{fatal:true}).decode(raw);
 if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))return fail('XML_EXTERNAL_ENTITIES_REFUSED');
 const root=resolve(dist);
 const server=createServer((req,res)=>{
  let uri;
  try{uri=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}
  catch{res.writeHead(400);res.end();return;}
  const served=resolve(root,'.'+(uri==='/'?'/index.html':uri));
  if(!served.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  // No private source paths exposed through the local QA server.
  import('node:fs').then(fs=>{
   if(!fs.existsSync(served)||!fs.statSync(served).isFile()){
    res.writeHead(404);res.end();return;
   }
   res.setHeader('content-type',served.endsWith('.js')?'application/javascript':
    served.endsWith('.css')?'text/css':'text/html');
   res.end(fs.readFileSync(served));
  }).catch(()=>{res.writeHead(404);res.end()});
 });
 let browser;
 try{
  await new Promise((ok,failListen)=>server.once('error',failListen)
   .listen(0,'127.0.0.1',ok));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>!!window.__libraryV08?.readMusicXML,
    {timeout:25000});
  const imported=await page.evaluate(source=>{
   const s=window.__libraryV08.readMusicXML(source,'research.musicxml');
   return {format:s.format,warnings:s.warnings,
    tracks:s.tracks.map(t=>({notes:t.notes.map(n=>({
     noteId:n.noteId,pitch:n.pitch,start:n.start,duration:n.duration,
     sourceNoteIds:n.sourceNoteIds,isDrum:n.isDrum
    }))})),
    audioEvents:s.audioEvents.filter(e=>e.type==='noteOn'||e.type==='noteOff')
     .map(e=>({type:e.type,noteId:e.noteId,pitch:e.pitch,time:e.time}))};
  },xml);
  const compiled=p0a2bCandidateFromSong(imported,{
   cohortId,groupId,split,scoreSha256:sha,rightsConfirmed:true
  });
  if(!compiled.ok)return fail(compiled.reason);
  const built=makeP0A2bBlindPacket(compiled.source);
  if(!built.ok)return fail('BLIND_PACKET_'+built.reason);
  try{
   const out=await open(dest,'wx',0o600);
   try{await out.writeFile(JSON.stringify(built.packet,null,2)+'\n')}
   finally{await out.close()}
  }catch{return fail('BLIND_PACKET_EXISTS_OR_UNWRITABLE')}
  // Aggregate metadata only; source note rows/fingers stay in private file.
  return {ok:true,status:'PRIVATE_CANDIDATE_PACKED',
   packetSha256:built.packet.packetSha256,scoreSha256:sha,
   stats:compiled.summary,handLabelsProvided:false,
   acceptedAsIndependentExpertReference:false,productionEligible:false};
 }catch{return fail('MUSICXML_IMPORT_OR_BROWSER_ERROR')}
 finally{
  if(browser)await browser.close().catch(()=>{});
  await new Promise(done=>server.listening?server.close(done):done());
 }
}
export const parseP0A2bCli=args=>{
 const opts={};
 const known=new Set(['--file','--output','--id','--group','--split','--rights-confirmed']);
 for(let i=0;i<args.length;i++){
  const x=args[i];if(!known.has(x))return null;
  if(x==='--rights-confirmed'){opts.rightsConfirmed=true;continue}
  if(!args[i+1]||args[i+1].startsWith('--')||opts[x])return null;
  opts[x]=args[++i];
 }
 return {file:opts['--file'],output:opts['--output'],
  cohortId:opts['--id'],groupId:opts['--group'],split:opts['--split'],
  rightsConfirmed:opts.rightsConfirmed===true};
};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const parsed=parseP0A2bCli(process.argv.slice(2));
 const result=parsed?await importP0A2bMusicXML(parsed):fail('INVALID_ARGUMENTS');
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.ok)process.exitCode=1;
}
