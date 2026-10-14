/**
 * P0-A2b local-only, no network, no score/music upload.
 *
 * packet <curated-source.json> <blind-packet.json>:
 *   compile an immutable source SHA-bound, FINGERLESS review packet
 * template <blind-packet.json> <review-template.json> <reviewer-code> <independent|adjudicator>:\n *   produce no-overwrite PRIVATE source-bound blank reviewer form\n * study <blind-packet1.json> [more-packets.json ...]:\n *   reject group leakage, duplicated source hashes and repeated score identities\n * evaluate <blind-packet.json> <reviewer1.json> <reviewer2.json>
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
 evaluateP0A2bEngines,validateP0A2bStudy}from '../src/core/p0a2b-independent-review.mjs';
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
 if(args[0]==='template'){
  if(args.length!==5)return error('TEMPLATE_PACKET_OUTPUT_REVIEWER_ROLE_REQUIRED');
  const [_,file,destination,reviewerCode,role]=args;
  if(!/^[a-z0-9][a-z0-9._:-]{0,120}$/i.test(reviewerCode)||
   !['independent','adjudicator'].includes(role))
   return error('INVALID_REVIEWER_OR_ROLE');
  let packet;
  try{packet=await readJSON(file);}
  catch{return error('LOCAL_PACKET_UNREADABLE');}
  const verified=validateP0A2bStudy([packet]);
  if(!verified.ok)return error('TEMPLATE_'+verified.reason);
  const review={schema:'p0a2b-blind-review-v1',
   packetSha256:packet.packetSha256,cohortId:packet.cohortId,
   reviewerCode,role,blindToAlgorithms:true,
   decisions:packet.notes.map(n=>({noteId:n.noteId,uncertain:true,
    acceptable:[],
    ...(role==='adjudicator'?{rationale:''}:{})}))};
  try{
   const out=await open(resolve(destination),'wx',0o600);
   try{await out.writeFile(JSON.stringify(review,null,2)+'\\n');}
   finally{await out.close();}
  }catch{return error('TEMPLATE_EXISTS_OR_UNWRITABLE');}
  return {ok:true,status:'BLIND_REVIEW_TEMPLATE_CREATED',
   noteCount:packet.notes.length,packetSha256:packet.packetSha256,
   productionEligible:false};
 }
 if(args[0]==='study'){
  if(args.length<2)return error('STUDY_PACKETS_REQUIRED');
  let packets;
  try{packets=await Promise.all(args.slice(1).map(readJSON));}
  catch{return error('STUDY_PACKET_UNREADABLE');}
  return validateP0A2bStudy(packets);
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
