import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMeasuredCorpus,coverage} from '../scripts/maestro-diversity.mjs';

function row(i,split){
 const pitchSpan=i%7*5, density=(i%11)+1, poly=1+i%6;
 const noteCount=100+i*3, repeat=Math.round(noteCount*(i%5)/20);
 return {
  canonical_composer:'Composer '+(i%13),canonical_title:'Work '+(i%21),
  split,year:2008,
  midi_filename:'2008/'+split+'-'+String(i).padStart(4,'0')+'.midi',duration:60+i*7,
  midi_sha256:'a'.repeat(64),
  profile:{
   note_count:noteCount,notes_per_second:density,max_simultaneous_held_notes:poly,
   repeated_pitch_within_250ms:repeat,
   velocity:{p10:22+(i%6),p90:61+(i%8)*5},
   pitch_min:40,pitch_max:40+pitchSpan,
   tempo_event_count:i%9,
   cc_counts:{sustain:i%2?1:0,sostenuto:i%17===0?1:0,una_corda:i%13===0?1:0}
  }
 };
}
function population(){
 return [
  ...Array.from({length:40},(_,i)=>row(i,'train')),
  ...Array.from({length:12},(_,i)=>row(i+100,'validation')),
  ...Array.from({length:12},(_,i)=>row(i+200,'test'))
 ];
}
test('deterministic across source order and complete 16/4/4 without duplicate paths',()=>{
 const data=population();
 const a=selectMeasuredCorpus(data),b=selectMeasuredCorpus([...data].reverse());
 assert.deepEqual(a,b);
 assert.equal(a.works.length,24);
 assert.equal(new Set(a.works.map(x=>x.midi_filename)).size,24);
 assert.deepEqual(Object.fromEntries(['train','validation','test'].map(s=>[s,a.works.filter(x=>x.split===s).length])),{train:16,validation:4,test:4});
});
test('feature coverage never falls below metadata-only baseline per split',()=>{
 const result=selectMeasuredCorpus(population());
 for(const split of ['train','validation','test']){
  const record=result.comparisons[split];
  assert.ok(record.chosen.weighted_feature_coverage>=record.baseline.weighted_feature_coverage);
  assert.equal(record.chosen.unique_composers,new Set(result.works.filter(r=>r.split===split).map(r=>r.canonical_composer)).size);
  assert.equal(record.quantile_cutoffs.note_density.length,3);
  assert.ok(['measured-diversity','baseline-retained'].includes(record.selection));
 }
});
test('zero variance fields do not create artificial percentile categories',()=>{
 const data=population().map(x=>({...x,profile:{...x.profile,
  notes_per_second:3,max_simultaneous_held_notes:1,
  cc_counts:{sustain:0,sostenuto:0,una_corda:0}}}));
 const result=selectMeasuredCorpus(data);
 for(const s of ['train','validation','test']){
  assert.equal(result.comparisons[s].chosen.by_feature.note_density,1);
  assert.equal(result.comparisons[s].chosen.by_feature.held_polyphony,1);
 }
});
test('holdout splits are selected independently, unaffected by train-only profile edits',()=>{
 const originals=population();
 const first=selectMeasuredCorpus(originals);
 const changed=originals.map(r=>r.split!=='train'?r:{...r,duration:r.duration+1000,
  profile:{...r.profile,notes_per_second:r.profile.notes_per_second+200}});
 const second=selectMeasuredCorpus(changed);
 for(const split of ['validation','test']){
  assert.deepEqual(first.works.filter(r=>r.split===split),second.works.filter(r=>r.split===split));
 }
});
test('invalid profiles, duplicate paths and insufficient quota are refused',()=>{
 const rows=population();
 assert.throws(()=>selectMeasuredCorpus([...rows,rows[0]]),/INVALID_OR_DUPLICATE_PROFILE_PATH/);
 assert.throws(()=>selectMeasuredCorpus(rows.map((x,i)=>i===0?{...x,profile:null}:x)),/INVALID_MIDI_PROFILE/);
 assert.throws(()=>selectMeasuredCorpus(rows,{train:41,validation:4,test:4}),/Insufficient valid train/);
 assert.throws(()=>selectMeasuredCorpus([]),/EMPTY_PROFILED_SOURCE/);
});
test('weighted metric weights align with coverage tokens, not fictitious difficulty labels',()=>{
 const result=selectMeasuredCorpus(population());
 const info=result.comparisons.train;
 assert.ok(info.chosen.weighted_feature_coverage>0);
 assert.ok(info.baseline.covered_feature_buckets>0);
 assert.ok(result.works.every(r=>Number.isInteger(r.measured_buckets.note_density)&&r.measured_buckets.note_density>=0&&r.measured_buckets.note_density<=3));
 assert.equal(typeof coverage,'function');
});
