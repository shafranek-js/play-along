/**
 * MAE-02C — full-dataset MIDI profiling and reproducible diversity selection.
 * Offline only. This is NOT a grading model, RH/LH/finger source, nor player code.
 * The entire official MIDI ZIP must match the pinned official SHA256.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseCsv,validateMetadata,selectQaCorpus,MAESTRO} from './maestro-corpus.mjs';
import {openMidiZip,locateMidiEntries,profileMidi} from './maestro-midi-audit.mjs';

const assert=(condition,message)=>{if(!condition)throw Error(message)};
const SHA256=bytes=>createHash('sha256').update(bytes).digest('hex');
const SPLITS=['train','validation','test'];
const QUOTAS=Object.freeze({train:16,validation:4,test:4});
const METRICS=Object.freeze([
 {id:'duration',weight:1,read:r=>r.duration},
 {id:'note_density',weight:3,read:r=>r.profile.notes_per_second},
 {id:'held_polyphony',weight:3,read:r=>r.profile.max_simultaneous_held_notes},
 {id:'repeated_attack_ratio',weight:3,read:r=>r.profile.repeated_pitch_within_250ms/r.profile.note_count},
 {id:'velocity_p90_minus_p10',weight:2,read:r=>r.profile.velocity.p90-r.profile.velocity.p10},
 {id:'pitch_span',weight:2,read:r=>r.profile.pitch_max-r.profile.pitch_min},
 {id:'tempo_events',weight:1,read:r=>r.profile.tempo_event_count}
]);
const PEDALS=Object.freeze([
 {id:'cc64',weight:1,read:r=>r.profile.cc_counts.sustain>0},
 {id:'cc66',weight:3,read:r=>r.profile.cc_counts.sostenuto>0},
 {id:'cc67',weight:3,read:r=>r.profile.cc_counts.una_corda>0}
]);
function orderByPath(a,b){return a.midi_filename<b.midi_filename?-1:a.midi_filename>b.midi_filename?1:0}
function prepareSplit(rows){
 const thresholds={},tokens=new Map(),weight=new Map();
 for(const m of METRICS){
  const values=rows.map(m.read).sort((a,b)=>a-b);
  assert(values.every(Number.isFinite),'NONFINITE_METRIC_'+m.id);
  thresholds[m.id]=[.25,.5,.75].map(q=>values[Math.floor(q*(values.length-1))]);
  for(let bucket=0;bucket<4;bucket++)weight.set(m.id+':'+bucket,m.weight);
 }
 for(const m of PEDALS){weight.set(m.id+':present',m.weight);weight.set(m.id+':absent',m.weight)}
 for(const row of rows){
  const t=[];
  for(const m of METRICS){
   const n=m.read(row),edges=thresholds[m.id];
   let bin=0;while(bin<edges.length&&n>edges[bin])bin++;
   t.push(m.id+':'+bin);
  }
  for(const m of PEDALS)t.push(m.id+':'+(m.read(row)?'present':'absent'));
  tokens.set(row.midi_filename,t);
 }
 return {thresholds,tokens,weight};
}
export function coverage(chosen,prepared){
 const all=new Set();
 for(const row of chosen)for(const token of prepared.tokens.get(row.midi_filename)||[])all.add(token);
 const byFeature={};let weighted=0;
 for(const token of all){
  const [id]=token.split(':');
  byFeature[id]=(byFeature[id]||0)+1;
  weighted+=prepared.weight.get(token)||0;
 }
 return {weighted_feature_coverage:weighted,covered_feature_buckets:all.size,by_feature:byFeature,
  unique_composers:new Set(chosen.map(r=>r.canonical_composer)).size};
}
function greedy(rows,quota,prepared){
 const remaining=[...rows].sort(orderByPath),selected=[],covered=new Set(),composers=new Set(),works=new Set();
 while(selected.length<quota){
  let best=null,bestScore=-Infinity;
  for(const row of remaining){
   const novel=prepared.tokens.get(row.midi_filename).filter(token=>!covered.has(token));
   const novelty=novel.reduce((s,token)=>s+prepared.weight.get(token),0);
   const score=novelty+(composers.has(row.canonical_composer)?0:0.75)+
     (works.has(row.canonical_composer+'\0'+row.canonical_title)?0:0.1);
   if(score>bestScore||score===bestScore&&best&&orderByPath(row,best)<0){best=row;bestScore=score}
  }
  assert(best,'CANDIDATES_EXHAUSTED');
  selected.push(best);
  remaining.splice(remaining.findIndex(x=>x.midi_filename===best.midi_filename),1);
  for(const token of prepared.tokens.get(best.midi_filename))covered.add(token);
  composers.add(best.canonical_composer);
  works.add(best.canonical_composer+'\0'+best.canonical_title);
 }
 return selected;
}
export function selectMeasuredCorpus(rows,quotas=QUOTAS){
 assert(Array.isArray(rows)&&rows.length,'EMPTY_PROFILED_SOURCE');
 const records=new Map();
 for(const row of rows){
  assert(typeof row?.midi_filename==='string'&&row.midi_filename&&!records.has(row.midi_filename),
    'INVALID_OR_DUPLICATE_PROFILE_PATH');
  assert(row.profile&&Number.isFinite(row.profile.note_count)&&row.profile.note_count>0,'INVALID_MIDI_PROFILE');
  records.set(row.midi_filename,row);
 }
 const baselinePaths=selectQaCorpus(rows,quotas).map(r=>r.midi_filename);
 const selections=[],comparisons={};
 for(const split of SPLITS){
  const source=rows.filter(r=>r.split===split).sort(orderByPath);
  const quota=quotas[split]??0;
  assert(Number.isInteger(quota)&&quota>=0&&quota<=source.length,'INVALID_SPLIT_QUOTA_'+split);
  if(!quota){comparisons[split]={quota,selection:'none'};continue}
  const profile=prepareSplit(source);
  const baseline=baselinePaths.map(path=>records.get(path)).filter(r=>r.split===split);
  assert(baseline.length===quota,'INVALID_BASELINE_'+split);
  const challenger=greedy(source,quota,profile);
  const oldScore=coverage(baseline,profile);
  const newScore=coverage(challenger,profile);
  const useMeasured=newScore.weighted_feature_coverage>oldScore.weighted_feature_coverage;
  const chosen=useMeasured?challenger:baseline;
  selections.push(...chosen.map(row=>({
   ...row,
   measured_buckets:Object.fromEntries(METRICS.map(m=>{
    const token=profile.tokens.get(row.midi_filename).find(x=>x.startsWith(m.id+':'));
    return [m.id,Number(token.split(':')[1])];
   }))
  })));
  comparisons[split]={
   quota,
   baseline:oldScore,
   measured_candidate:newScore,
   chosen:coverage(chosen,profile),
   selection:useMeasured?'measured-diversity':'baseline-retained',
   quantile_cutoffs:profile.thresholds
  };
 }
 assert(selections.length===Object.values(quotas).reduce((s,n)=>s+n,0),'INCORRECT_CORPUS_SIZE');
 return {works:selections,comparisons};
}
export function analyzeMaestroDiversity(csv,zip,{requireOfficialHash=true}={}){
 const actual=SHA256(zip);
 if(requireOfficialHash)assert(actual===MAESTRO.zipSha256,'OFFICIAL_ARCHIVE_SHA256_MISMATCH');
 const {rows,counts}=validateMetadata(parseCsv(csv));
 const archive=openMidiZip(zip),paths=locateMidiEntries(archive,rows);
 const all=[];let totalNotes=0,integrityFlagged=0;
 for(const row of rows){
  const midi=archive.extract(paths.get(row.midi_filename)); // CRC32 and size check
  const profile=profileMidi(midi,row.duration);
  totalNotes+=profile.note_count;
  if(profile.integrity.unpaired_note_off||profile.integrity.dangling_note_on||
      profile.integrity.overlapping_same_channel_pitch_on)integrityFlagged++;
  all.push({...row,profile,midi_sha256:SHA256(midi)});
 }
 const selected=selectMeasuredCorpus(all);
 const works=selected.works.map(r=>({
  midi_filename:r.midi_filename,midi_sha256:r.midi_sha256,
  canonical_composer:r.canonical_composer,canonical_title:r.canonical_title,
  split:r.split,year:r.year,duration:r.duration,measured_buckets:r.measured_buckets,profile:r.profile
 }));
 const summary={
  all_midi_verified:all.length,all_note_attacks:totalNotes,
  files_with_note_integrity_anomalies:integrityFlagged,
  selected:works.length,
  selected_notes:works.reduce((s,r)=>s+r.profile.note_count,0),
  selected_unique_composers:new Set(works.map(r=>r.canonical_composer)).size,
  selected_with_cc64:works.filter(r=>r.profile.cc_counts.sustain>0).length,
  selected_with_cc66:works.filter(r=>r.profile.cc_counts.sostenuto>0).length,
  selected_with_cc67:works.filter(r=>r.profile.cc_counts.una_corda>0).length
 };
 return {
  schema:'play-along-maestro-measured-corpus/1',
  dataset:{version:MAESTRO.version,source:MAESTRO.official,attribution:MAESTRO.attribution,
   license:MAESTRO.license,official_zip_sha256:MAESTRO.zipSha256,verified_archive_sha256:actual},
  validation:{archive_sha256_verified:actual===MAESTRO.zipSha256,
   source_metadata_rows:rows.length,split_counts:counts,all_midi_files_sha256_crc32_and_smf_profiled:true,
   original_midi_redistributed:false,independent_score_or_fingering_ground_truth:false},
  method:{name:'per-split weighted quartile feature-coverage greedy vs original metadata sample',
   quotas:QUOTAS,features:METRICS.map(m=>({name:m.id,weight:m.weight})),
   pedals:PEDALS.map(m=>({name:m.id,weight:m.weight})),
   measured_candidate_used_only_when_strictly_more_weighted_feature_coverage:true,
   baseline_comparison: 'MAE-02A per-split deterministic 16/4/4 sample',
   warning:'Feature coverage is test diversity, NOT representative sampling, performer technique, educational level, hand ID or anatomical fingering.'},
  summary,
  split_comparisons:selected.comparisons,
  works
 };
}
async function main(args){
 const options={};for(let i=0;i<args.length;i++){
  const flag=args[i];
  assert(['--csv','--zip','--out'].includes(flag)&&args[i+1]&&!args[i+1].startsWith('--'),
    'USAGE: --csv META_CSV --zip OFFICIAL_MIDI_ZIP --out DERIVED_JSON');
  options[flag]=args[++i];
 }
 assert(options['--csv']&&options['--zip']&&options['--out'],'REQUIRED_CSV_ZIP_OUT');
 const [csv,zip]=await Promise.all([readFile(options['--csv'],'utf8'),readFile(options['--zip'])]);
 const report=analyzeMaestroDiversity(csv,zip);
 await writeFile(options['--out'],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({
  status:'verified',dataset:report.dataset.version,
  profiled_files:report.summary.all_midi_verified,profiled_notes:report.summary.all_note_attacks,
  selected:report.summary.selected,selected_notes:report.summary.selected_notes,
  baseline_weighted_coverage:Object.fromEntries(SPLITS.map(s=>[s,report.split_comparisons[s].baseline.weighted_feature_coverage])),
  final_weighted_coverage:Object.fromEntries(SPLITS.map(s=>[s,report.split_comparisons[s].chosen.weighted_feature_coverage])),
  strategy:Object.fromEntries(SPLITS.map(s=>[s,report.split_comparisons[s].selection]))
 }));
}
if(process.argv[1]&&/(?:^|[/\\])maestro-diversity\.mjs$/.test(process.argv[1])){
 main(process.argv.slice(2)).catch(err=>{console.error('MAE-02C FAILED: '+err.message);process.exitCode=1});
}
