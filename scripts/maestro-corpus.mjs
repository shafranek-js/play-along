/**
 * Offline MAESTRO v3.0.0 metadata validator and deterministic QA corpus planner.
 * Research-only: no remote requests, no copyrighted MIDI redistribution,
 * no score/fingering inference. Node >=22, zero dependencies.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const MAESTRO = Object.freeze({
  version:'3.0.0',
  license:'CC BY-NC-SA 4.0',
  attribution:'Google LLC / MAESTRO Dataset v3.0.0',
  official:'https://magenta.tensorflow.org/datasets/maestro',
  zipSha256:'70470ee253295c8d2c71e6d9d4a815189e35c89624b76d22fce5a019d5dde12c',
  splitCounts:Object.freeze({train:962,validation:137,test:177}),
  expectedRows:1276
});
const REQUIRED=['canonical_composer','canonical_title','split','year','midi_filename','audio_filename','duration'];
const ALLOWED_SPLITS=new Set(Object.keys(MAESTRO.splitCounts));
const DEFAULT_QUOTAS=Object.freeze({train:16,validation:4,test:4});

/** Parse RFC 4180-like CSV with quoted fields, escaped quotes, LF/CRLF and BOM. */
export function parseCsv(input){
  if(typeof input!=='string')throw Error('CSV must be UTF-8 text');
  const source=input.replace(/^\uFEFF/,'');
  const rows=[];let cells=[],field='',quoted=false,justClosed=false;
  const emitField=()=>{cells.push(field);field='';justClosed=false};
  const emitRow=()=>{emitField();if(cells.some(v=>v.trim()!==''))rows.push(cells);cells=[]};
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quoted){
      if(c==='"'&&source[i+1]==='"'){field+='"';i++}
      else if(c==='"'){quoted=false;justClosed=true}
      else field+=c;
    }else if(c==='"'){
      if(field!==''||justClosed)throw Error('Unexpected quote in CSV');
      quoted=true;
    }else if(c===',')emitField();
    else if(c==='\r'||c==='\n'){
      if(c==='\r'&&source[i+1]==='\n')i++;
      emitRow();
    }else{
      if(justClosed)throw Error('Characters after closing CSV quote');
      field+=c;
    }
  }
  if(quoted)throw Error('Unclosed quoted CSV field');
  if(field!==''||cells.length||justClosed)emitRow();
  if(rows.length===0)throw Error('Empty metadata CSV');
  const header=rows.shift();
  if(new Set(header).size!==header.length)throw Error('Duplicate CSV headers');
  for(const col of REQUIRED)if(!header.includes(col))throw Error(`Missing MAESTRO column: ${col}`);
  return rows.map((cells,i)=>{
    if(cells.length!==header.length)throw Error(`CSV row ${i+2}: expected ${header.length} columns, got ${cells.length}`);
    return Object.fromEntries(header.map((name,j)=>[name,cells[j]]));
  });
}

function cleanPath(value,label){
  if(typeof value!=='string'||!value||value.length>500||value.includes('\\')||value.startsWith('/')||value.includes('\0')||value.includes(':'))throw Error(`Unsafe ${label}`);
  const segments=value.split('/');
  if(segments.some(s=>!s||s==='.'||s==='..'||s.startsWith('.'))||!/^[\x20-\x7e]+$/.test(value))throw Error(`Unsafe ${label}`);
  return value;
}

export function validateMetadata(rows,{strict=true}={}){
  if(!Array.isArray(rows))throw Error('Invalid metadata rows');
  const seen=new Set();const counts={train:0,validation:0,test:0};
  const normalized=rows.map((r,index)=>{
    const n=index+2;
    const composer=String(r.canonical_composer||'').trim();
    const title=String(r.canonical_title||'').trim();
    if(!composer||!title)throw Error(`CSV row ${n}: missing composer/title`);
    if(!ALLOWED_SPLITS.has(r.split))throw Error(`CSV row ${n}: invalid split`);
    const midi=cleanPath(r.midi_filename,'midi_filename');
    cleanPath(r.audio_filename,'audio_filename');
    if(!/\.midi?$/i.test(midi))throw Error(`CSV row ${n}: not a MIDI path`);
    if(!/\.wav$/i.test(r.audio_filename))throw Error(`CSV row ${n}: not a WAV path`);
    if(seen.has(midi))throw Error(`CSV row ${n}: duplicate MIDI path`);
    seen.add(midi);
    const year=Number(r.year),duration=Number(r.duration);
    if(!/^\d{4}$/.test(String(r.year))||!Number.isInteger(year)||year<2000||year>2100)throw Error(`CSV row ${n}: invalid year`);
    if(!Number.isFinite(duration)||duration<=0||duration>20000)throw Error(`CSV row ${n}: invalid duration`);
    counts[r.split]++;
    return {canonical_composer:composer,canonical_title:title,split:r.split,year,
      midi_filename:midi,duration};
  });
  if(strict){
    if(normalized.length!==MAESTRO.expectedRows)throw Error(`Expected ${MAESTRO.expectedRows} rows, got ${normalized.length}`);
    for(const split of Object.keys(counts))if(counts[split]!==MAESTRO.splitCounts[split])throw Error(`Unexpected ${split} count: ${counts[split]}`);
  }
  return {rows:normalized,counts};
}

/** Metadata diversity ≠ measured MIDI note density, technique or difficulty. */
export function selectQaCorpus(rows,quotas=DEFAULT_QUOTAS){
  const selected=[],usedPaths=new Set(),composers=new Map(),titles=new Map();
  const pattern=[0,3,1,2];
  for(const split of ['train','validation','test']){
    const source=rows.filter(row=>row.split===split).sort((a,b)=>a.duration-b.duration||a.midi_filename.localeCompare(b.midi_filename,'en'));
    const quota=quotas[split]??0;
    if(!Number.isInteger(quota)||quota<0||source.length<quota)throw Error(`Insufficient valid ${split} rows for quota ${quota}`);
    for(let i=0;i<quota;i++){
      const bucket=pattern[i%pattern.length];
      const start=Math.floor(source.length*bucket/4);
      const end=Math.floor(source.length*(bucket+1)/4);
      let pool=source.slice(start,end).filter(row=>!usedPaths.has(row.midi_filename));
      // Tiny fixture pools may have empty quartiles; full MAESTRO splits do not.
      if(!pool.length)pool=source.filter(row=>!usedPaths.has(row.midi_filename));
      if(!pool.length)throw Error(`No unused ${split} candidates for duration bucket ${bucket}`);
      const target=(bucket+0.5)/4;
      const rank=row=>{
        const comp=composers.get(row.canonical_composer)||0;
        const title=titles.get(`${row.canonical_composer}\0${row.canonical_title}`)||0;
        const position=source.indexOf(row)/Math.max(1,source.length-1);
        return comp*10000+title*1000+Math.abs(position-target)*100;
      };
      pool.sort((a,b)=>rank(a)-rank(b)||a.midi_filename.localeCompare(b.midi_filename,'en'));
      const chosen=pool[0];usedPaths.add(chosen.midi_filename);
      composers.set(chosen.canonical_composer,(composers.get(chosen.canonical_composer)||0)+1);
      const key=`${chosen.canonical_composer}\0${chosen.canonical_title}`;
      titles.set(key,(titles.get(key)||0)+1);
      selected.push({...chosen,selection_bucket:['shorter','lower_mid','upper_mid','longer'][bucket]});
    }
  }
  return selected;
}

export function createManifest(csv,{strict=true,quotas=DEFAULT_QUOTAS,archiveSha256Verified=false}={}){
  const {rows,counts}=validateMetadata(parseCsv(csv),{strict});
  const corpus=selectQaCorpus(rows,quotas);
  return {
    schema:'play-along-maestro-research-corpus/1',
    dataset:{version:MAESTRO.version,source:MAESTRO.official,attribution:MAESTRO.attribution,
      license:MAESTRO.license,archive_sha256:MAESTRO.zipSha256},
    validation:{metadata_rows:rows.length,split_counts:counts,archive_sha256_verified:archiveSha256Verified,
      individual_midi_verified:false,performance_complexity_profiled:false},
    selection:{method:'deterministic duration-quartile and composer-diversity sampling',quotas,
      note:'Metadata diversity only. Full MIDI byte checks and polyphony/velocity/CC profiling are separate follow-up gates.'},
    works:corpus
  };
}

export async function sha256File(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}

async function cli(argv){
  let csvPath=null,zipPath=null,outPath=null;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(!['--csv','--zip','--out'].includes(arg)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Usage: node scripts/maestro-corpus.mjs --csv <official CSV> [--zip <MIDI-only ZIP>] [--out <manifest.json>]');
    if(arg==='--csv')csvPath=argv[++i];
    else if(arg==='--zip')zipPath=argv[++i];
    else outPath=argv[++i];
  }
  if(!csvPath)throw Error('Required: --csv <official maestro-v3.0.0.csv>');
  let archiveSha256Verified=false;
  if(zipPath){
    const got=await sha256File(zipPath);
    if(got!==MAESTRO.zipSha256)throw Error(`MAESTRO archive SHA256 mismatch: ${got}`);
    archiveSha256Verified=true;
  }
  const content=await readFile(csvPath,'utf8');
  const manifest=createManifest(content,{archiveSha256Verified});
  const json=JSON.stringify(manifest,null,2)+'\n';
  if(outPath){await writeFile(outPath,json,'utf8');process.stdout.write(`Wrote ${manifest.works.length} research records to ${outPath}\n`)}
  else process.stdout.write(json);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  cli(process.argv.slice(2)).catch(e=>{console.error(`MAESTRO corpus error: ${e.message}`);process.exitCode=1});
}
