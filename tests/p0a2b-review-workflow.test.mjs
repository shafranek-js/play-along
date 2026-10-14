import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runP0A2bLocal} from '../scripts/p0a2b-review-workflow.mjs';
const source=()=>({schema:'p0a2b-curated-source-v1',cohortId:'x',
 groupId:'research-composer',split:'heldout',handMode:'supplied-hands',
 rightsStatus:'verified-by-owner',scoreSha256:'f'.repeat(64),
 notes:[{noteId:'n0',pitch:60,start:0,duration:.5,hand:'RH',tags:['inversion']},
 {noteId:'n1',pitch:48,start:0,duration:.7,hand:'LH',tags:['held-voice']}]});
test('private CLI creates fingerless no-overwrite packet and emits only aggregates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'p0a2b-test-'));
 try{
  const src=join(dir,'curated.json'),packetPath=join(dir,'packet.json');
  await writeFile(src,JSON.stringify(source()),'utf8');
  const made=await runP0A2bLocal(['packet',src,packetPath]);
  assert.equal(made.ok,true);assert.equal(made.sourceNotes,2);
  assert.equal((await runP0A2bLocal(['packet',src,packetPath])).reason,
   'PACKET_FILE_EXISTS_OR_UNWRITABLE');
  const packet=JSON.parse(await readFile(packetPath,'utf8'));
  assert.equal(packet.containsFingerAnswers,false);
  if(process.platform!=='win32')assert.equal((await stat(packetPath)).mode&0o777,0o600);
  const review=(code)=>({schema:'p0a2b-blind-review-v1',
   packetSha256:packet.packetSha256,cohortId:'x',reviewerCode:code,
   role:'independent',blindToAlgorithms:true,
   decisions:[{noteId:'n0',uncertain:false,acceptable:[{hand:'RH',finger:1}]},
    {noteId:'n1',uncertain:false,acceptable:[{hand:'LH',finger:5}]}]});
  const predictions={items:[{noteId:'n0',pitch:60,start:0,duration:.5,hand:'RH',finger:1},
   {noteId:'n1',pitch:48,start:0,duration:.7,hand:'LH',finger:4}]};
  const paths=[review('a'),review('b'),predictions,predictions].map((x,i)=>{
   const p=join(dir,'bundle-'+i+'.json');return [p,x];
  });
  await Promise.all(paths.map(([p,x])=>writeFile(p,JSON.stringify(x))));
  const evaluated=await runP0A2bLocal(['evaluate',packetPath,paths[0][0],
   paths[1][0],'-',paths[2][0],paths[3][0]]);
  assert.equal(evaluated.ok,true);
  assert.equal(evaluated.scoredNotes,2);
  assert.equal(evaluated.engines.playAlong.acceptable,1);
  assert.equal(evaluated.engines.pianoMotion.disagree,1);
  assert.equal(evaluated.productionEligible,false);
  assert.equal(evaluated.externalReviewerCredentialsValidated,false);
  assert.ok(!JSON.stringify(evaluated).includes('RH:1'),'no finger vectors emitted');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('invalid paths and absent review files are reported without dumping contents',async()=>{
 assert.equal((await runP0A2bLocal([])).reason,'COMMAND_REQUIRED');
 assert.equal((await runP0A2bLocal(['evaluate'])).reason,'EVALUATION_SIX_INPUTS_REQUIRED');
 assert.equal((await runP0A2bLocal(['packet','not-found','x'])).reason,'LOCAL_SOURCE_UNREADABLE');
});
