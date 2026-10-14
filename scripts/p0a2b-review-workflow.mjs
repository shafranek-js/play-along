/**
 * P0-A2b local-only, no network, no score/music upload.
 *
 * packet <curated-source.json> <blind-packet.json>:
 *   compile an immutable source SHA-bound, FINGERLESS review packet
 * evaluate <blind-packet.json> <reviewer1.json> <reviewer2.json>
 *          <adjudicator.json|-> <play-along.json> <piano-motion.json>
 *   prints ONLY aggregate note-level accuracy/technique coverage counts.
 *
 * Reviewer credentials, qualifications and score rights MUST be verified
 * outside this software. JSON submissions alone are never expert proof.
 */
import {readFile,open,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeP0A2bBlindPacket,adjudicateP0A2b,
 evaluateP0A2bEngines}from '../src/core/p0a2b-independent-review.mjs';
const MAX=6_000_000;
async function readJSON(filename){
 const file=resolve(filename),info=await stat(file);
 if(!info.isFile()||info.size>MAX)throw Error('REVIEW_INPUT_UNSUPPORTED');
 return JSON.parse(await readFile(file,'utf8'));
}
const error=reason=>({ok:false,reason,productionEligible:false});
export async function runP0A2bLocal(args){
 if(!Array.isArray(args)||!args.length)return error('COMMAND_REQUIRED');
 if(args[0]==='packet'){
  if(args.length!==3)return error('PACKET_SOURCE_AND_OUTPUT_REQUIRED');
  let source;try{source=await readJSON(args[1]);}
  catch{return error('LOCAL_SOURCE_UNREADABLE');}
  const built=makeP0A2bBlindPacket(source);
  if(!built.ok)return error(built.reason);
  let dest;try{
   dest=await open(resolve(args[2]),'wx',0o600);
   try{await dest.writeFile(JSON.stringify(built.packet,null,2)+'\n');}
   finally{await dest.close();}
  }catch{return error('PACKET_FILE_EXISTS_OR_UNWRITABLE');}
  return {ok:true,status:'BLIND_PACKET_CREATED',
   sourceNotes:built.packet.notes.length,
   packetSha256:built.packet.packetSha256,reviewerQualificationVerified:false,
   productionEligible:false};
 }
 if(args[0]==='evaluate'){
  if(args.length!==7)return error('EVALUATION_SIX_INPUTS_REQUIRED');
  let input;
  try{
   input=await Promise.all(args.slice(1).map((file,i)=>
    i===3&&file==='-'?null:readJSON(file)));
  }catch{return error('LOCAL_REVIEW_FILE_UNREADABLE');}
  const [packet,r1,r2,adjudicator,playAlong,pianoMotion]=input;
  const review=adjudicateP0A2b(packet,[r1,r2],{adjudicator});
  if(!review.ok)return error(review.reason);
  const r=evaluateP0A2bEngines(packet,review,{
   playAlong:playAlong?.items,pianoMotion:pianoMotion?.items
  });
  if(!r.ok)return error(r.reason);
  // Never print the Map of accepted fingers or raw review vectors.
  return {ok:true,packetSha256:packet.packetSha256,
   schema:'p0a2b-aggregate-review-v1',...r,
   externalReviewerCredentialsValidated:false,
   independentConsensusCertified:false,productionEligible:false};
 }
 return error('UNKNOWN_COMMAND');
}
const direct=process.argv[1]&&import.meta.url===
 pathToFileURL(resolve(process.argv[1])).href;
if(direct){
 const r=await runP0A2bLocal(process.argv.slice(2));
 process.stdout.write(JSON.stringify(r,null,2)+'\n');
 if(!r.ok)process.exitCode=1;
}
