/**
 * P0-A2b technical pre-screen only: six source-pinned, MIT MusicXML test-suite
 * fixtures. This never emits/commits the scores, source note vectors or fingers.
 * These are notation engineering files, NOT genuine independently fingered
 * piano performances, and may be unsuitable for musician adjudication.
 */
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {manuscript,validateTechnicalManifest,gitBlobSha1}
 from './fingering-technical-corpus-audit.mjs';
import {importP0A2bMusicXML} from './p0a2b-import-musicxml.mjs';
const ids=['schubert-chord','interleaved-voices','single-arpeggio',
 'crossed-arpeggios','grand-staff','multi-staff-chords'];
const fail=reason=>({ok:false,reason,researchOnly:true,expertValidated:false});
export async function auditP0A2bMITCandidates({fetcher=globalThis.fetch,
 manifest=manuscript(),importer=importP0A2bMusicXML}={}){
 validateTechnicalManifest(manifest);
 if(manifest.source.license!=='MIT')return fail('LICENSE_NOT_MIT');
 const temporary=await mkdtemp(join(tmpdir(),'p0a2b-mit-candidates-'));
 const cases=[];
 try{
  for(const [index,id] of ids.entries()){
   const entry=manifest.cases.find(x=>x.id===id);
   if(!entry)return fail('PINNED_CANDIDATE_MISSING');
   const url='https://raw.githubusercontent.com/'+manifest.source.repository+
    '/'+manifest.source.revision+'/'+entry.path;
   let data;
   try{
    const response=await fetcher(url,{signal:AbortSignal.timeout(20_000)});
    if(!response?.ok||response.url&&response.url!==url)
     throw Error('UNAVAILABLE_OR_REDIRECTED');
    data=new Uint8Array(await response.arrayBuffer());
   }catch{return fail('VERIFIED_MIT_SOURCE_UNAVAILABLE')}
   if(data.length!==entry.bytes||gitBlobSha1(data)!==entry.blobSha)
    return fail('PINNED_MIT_BLOB_MISMATCH');
   const source=join(temporary,'source-'+index+'.musicxml');
   const output=join(temporary,'candidate-'+index+'.json');
   await writeFile(source,data,{mode:0o600,flag:'wx'});
   const result=await importer({file:source,output,cohortId:'mit-'+entry.id,
    groupId:'musicxml-testsuite',split:'development',rightsConfirmed:true});
   const scoreSha256=createHash('sha256').update(data).digest('hex');
   cases.push({id,category:entry.category,sourceKind:entry.kind,
    sourceBlobSha1:entry.blobSha,scoreSha256,
    status:result.ok?'TECHNICAL_CANDIDATE':'NOT_FULLY_SUPPORTED',
    ...(result.ok?{notes:result.stats.notes,tagSignals:{
     chord:result.stats.chordNotes,heldVoice:result.stats.heldVoiceNotes,
     repeatedNote:result.stats.repeatedNoteCandidates},
     ties:result.stats.tiedSourceNotes}:
     {reason:result.reason})});
  }
 }finally{await rm(temporary,{recursive:true,force:true})}
 return {ok:true,schema:'p0a2b-mit-musicxml-source-precheck-v1',
  pinnedRevision:manifest.source.revision,license:manifest.source.license,
  attribution:manifest.source.attribution,
  selected:cases.length,verifiedSourceBlobs:cases.length,
  technicallyParsed:cases.filter(x=>x.status==='TECHNICAL_CANDIDATE').length,
  sourcesCommitted:0,expertReviewerCount:0,
  notesReviewedByHuman:0,independentFingeringAccuracy:null,
  note:'MusicXML test suite contains SYNTHETIC notation fixtures, not expert pianist reference or real performance corpus. Development pre-screen only; ALL musicological tags require human review. No MIDI solver or pianist ratings executed.',
  cases,researchOnly:true,expertValidated:false,productionEligible:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await auditP0A2bMITCandidates();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.ok)process.exitCode=1;
}
