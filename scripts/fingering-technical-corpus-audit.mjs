/**
 * FG-04B1a: fixed, licensed MusicXML technical regression corpus.
 * Deliberately NOT a fingering ground-truth benchmark or a collection of 16
 * independently performed compositions. No third-party scores are committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'research/fg04b1a-musicxml-corpus.json');
const REPO='w3c-cg/musicxmlTestSuite';
const CATEGORIES=['chords','pickup','polyphony','arpeggios','ties','glissando',
  'multi-staff','cross-staff','repeats','tuplets','grace'];
const fail=code=>{throw Error(code)};
export const manuscript=()=>JSON.parse(fs.readFileSync(manifestPath,'utf8'));

export function validateTechnicalManifest(corpus) {
  if(corpus?.schema!=='fg04b1a-musicxml-technical-corpus-v1' ||
    corpus?.source?.repository!==REPO || corpus?.source?.license!=='MIT' ||
    !/^[a-f0-9]{40}$/.test(corpus?.source?.revision??'') ||
    !Array.isArray(corpus.cases) || corpus.cases.length!==16)
    fail('INVALID_TECHNICAL_CORPUS_MANIFEST');
  const ids=new Set(),paths=new Set(),seen=new Set();
  for(const item of corpus.cases) {
    if(typeof item.id!=='string'||!/^[a-z0-9-]{2,48}$/.test(item.id)||
      ids.has(item.id)||typeof item.path!=='string'||
      !/^xmlFiles\/[A-Za-z0-9-]+\.musicxml$/.test(item.path)||
      paths.has(item.path)||!CATEGORIES.includes(item.category)||
      item.kind!=='synthetic-notation-test' ||
      !/^[a-f0-9]{40}$/.test(item.blobSha??'')||
      !Number.isInteger(item.bytes)||item.bytes<100||item.bytes>100_000)
      fail('INVALID_TECHNICAL_CORPUS_ENTRY');
    ids.add(item.id);paths.add(item.path);seen.add(item.category);
  }
  for(const category of CATEGORIES)if(!seen.has(category))
    fail('MISSING_TECHNICAL_CATEGORY:'+category);
  return {cases:corpus.cases.length,categoryCount:seen.size,realPieces:0,
    annotatedFingerGroundTruth:0,independentMusicianRatings:0,
    handthesiaCandidatePairs:0,productionAutoFingeringAllowed:false};
}

export function gitBlobSha1(bytes) {
  const b=Buffer.from(bytes);
  return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
}

const pinUrl=(corpus,entry)=>
  'https://raw.githubusercontent.com/'+REPO+'/'+corpus.source.revision+'/'+entry.path;

export async function fetchTechnicalFixture(corpus,entry,{fetcher=globalThis.fetch}={}) {
  validateTechnicalManifest(corpus);
  const stored=corpus.cases.find(e=>e.id===entry?.id);
  if(!stored || stored.path!==entry.path || stored.blobSha!==entry.blobSha ||
      stored.bytes!==entry.bytes)fail('UNPINNED_FIXTURE');
  const url=pinUrl(corpus,stored);
  const response=await fetcher(url,{
    signal:AbortSignal.timeout(20_000),
    headers:{accept:'application/xml,text/xml,text/plain'}
  });
  if(!response?.ok)fail('FIXTURE_HTTP_ERROR:'+stored.id);
  if(response.url && response.url!==url)fail('FIXTURE_REDIRECT_NOT_PINNED');
  const declared=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>100_000)fail('FIXTURE_TOO_LARGE');
  const arr=new Uint8Array(await response.arrayBuffer());
  if(arr.length!==stored.bytes || arr.length>100_000)
    fail('FIXTURE_SIZE_CHANGED:'+stored.id);
  const sha=gitBlobSha1(arr);
  if(sha!==stored.blobSha)fail('FIXTURE_GIT_SHA_CHANGED:'+stored.id);
  const data=new TextDecoder('utf-8',{fatal:true}).decode(arr);
  // This is a conservative text-level smoke screen, NOT XML validation.
  // No external entity resolution, score import, or remote code execution.
  if(!/<score-partwise(?:\s|>)/.test(data) ||
     !/<part(?:\s|>)/.test(data) || /<!ENTITY\b/i.test(data))
    fail('FIXTURE_UNSAFE_OR_NOT_PARTWISE:'+stored.id);
  return {id:stored.id,category:stored.category,path:stored.path,
    license:corpus.source.license,bytes:arr.length,blobSha:sha,
    noteTags:(data.match(/<note(?:\s|>)/g)??[]).length,
    fingeringTags:(data.match(/<fingering(?:\s|>)/g)??[]).length,
    url};
}

export async function auditTechnicalCorpus({fetcher=globalThis.fetch,manifest=manuscript()}={}) {
  const readiness=validateTechnicalManifest(manifest),results=[];
  for(const entry of manifest.cases) {
    // Never silently skip or substitute a missing fixture.
    results.push(await fetchTechnicalFixture(manifest,entry,{fetcher}));
  }
  const byCategory={};
  for(const row of results)byCategory[row.category]=(byCategory[row.category]??0)+1;
  return {schema:'fg04b1a-technical-download-report-v1',
    status:'TECHNICAL_SOURCES_VERIFIED',
    sourceRevision:manifest.source.revision,license:manifest.source.license,
    attribution:manifest.source.attribution,
    readiness,downloaded:results.length,byCategory,
    inspectedNoteTags:results.reduce((n,x)=>n+x.noteTags,0),
    inspectedFingeringTags:results.reduce((n,x)=>n+x.fingeringTags,0),
    fixtures:results,
    musicalAccuracyValidated:false,sourceToMidiExportValidated:false,
    realMusicCorpusComplete:false,productionAutoFingeringAllowed:false};
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  try {
    const report=await auditTechnicalCorpus();
    const output=process.env.FG04B1A_REPORT;
    if(output){
      const dest=path.resolve(output);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
    }
    console.log('FG-04B1a MIT technical MusicXML sources',JSON.stringify({
      status:report.status,downloaded:report.downloaded,categories:report.byCategory,
      noteTags:report.inspectedNoteTags,realPieces:report.readiness.realPieces,
      learnerAutoFingeringAllowed:false},null,2));
  } catch(error) {
    console.error('FG-04B1a source integrity HARD FAILURE:',error.message);
    process.exitCode=1;
  }
}
