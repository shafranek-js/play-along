import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,validateMetadata,selectQaCorpus,createManifest,MAESTRO} from '../scripts/maestro-corpus.mjs';

const header='canonical_composer,canonical_title,split,year,midi_filename,audio_filename,duration';
const record=(i,split='train',overrides={})=>({canonical_composer:\`Composer \${i%31}\`,
  canonical_title:\`Work \${i%67}\`,split,year:String(2004+i%15),
  midi_filename:\`\${2004+i%15}/performance-\${i}.midi\`,audio_filename:\`\${2004+i%15}/performance-\${i}.wav\`,
  duration:String(60+i*3.14),...overrides});
const csvRows=(rows)=>header+'\n'+rows.map(row=>Object.values(row).map(s=>{
  const v=String(s);return /[",\r\n]/.test(v)?\`"\${v.replaceAll('"','""')}"\`:v;
}).join(',')).join('\n')+'\n';
const fullRows=()=>[
  ...Array.from({length:962},(_,i)=>record(i,'train')),
  ...Array.from({length:137},(_,i)=>record(i+962,'validation')),
  ...Array.from({length:177},(_,i)=>record(i+1099,'test'))
];

test('correct RFC-style CSV quoting, comma, escaped quote, CRLF, multiline and BOM',()=>{
 const rows=parseCsv('\uFEFF'+csvRows([record(0,'train',{canonical_composer:'J. S. Bach, Jr.',canonical_title:'Prelude "The First"\nMovement'})]).replaceAll('\n','\r\n'));
 assert.equal(rows[0].canonical_composer,'J. S. Bach, Jr.');
 assert.equal(rows[0].canonical_title,'Prelude "The First"\r\nMovement');
});
test('reject malformed CSV quote, wrong row length and missing column',()=>{
 assert.throws(()=>parseCsv(header+'\n"unterminated'),/Unclosed/);
 assert.throws(()=>parseCsv(header+'\na,b,c'),/expected 7/);
 assert.throws(()=>parseCsv('hello,world\na,b'),/Missing MAESTRO column/);
});
test('valid metadata validates 1276 and official per-split totals',()=>{
 const data=validateMetadata(parseCsv(csvRows(fullRows())));
 assert.equal(data.rows.length,MAESTRO.expectedRows);
 assert.deepEqual(data.counts,MAESTRO.splitCounts);
});
test('reject full count changes and split changes',()=>{
 assert.throws(()=>validateMetadata(parseCsv(csvRows(fullRows().slice(1)))),/Expected 1276/);
 const rows=fullRows();rows[0].split='test';
 assert.throws(()=>validateMetadata(parseCsv(csvRows(rows))),/Unexpected train count/);
});
test('reject duplicated path and unsafe relative path',()=>{
 const rows=[record(0),record(1)];rows[1].midi_filename=rows[0].midi_filename;
 assert.throws(()=>validateMetadata(rows,{strict:false}),/duplicate MIDI/);
 assert.throws(()=>validateMetadata([record(1,'train',{midi_filename:'../../escape.midi'})],{strict:false}),/Unsafe/);
 assert.throws(()=>validateMetadata([record(1,'train',{midi_filename:'C:\\out.mid'})],{strict:false}),/Unsafe/);
});
test('reject wrong split, non-midi extension and invalid durations',()=>{
 assert.throws(()=>validateMetadata([record(1,'oops')],{strict:false}),/invalid split/);
 assert.throws(()=>validateMetadata([record(1,'train',{midi_filename:'2004/file.txt'})],{strict:false}),/not a MIDI/);
 assert.throws(()=>validateMetadata([record(1,'train',{duration:'NaN'})],{strict:false}),/invalid duration/);
});
test('deterministic 24-record stratified selection without repeats',()=>{
 const rows=validateMetadata(parseCsv(csvRows(fullRows()))).rows;
 const a=selectQaCorpus(rows),b=selectQaCorpus([...rows].reverse());
 assert.deepEqual(a,b);
 assert.equal(a.length,24);
 assert.deepEqual(Object.fromEntries(['train','validation','test'].map(s=>[s,a.filter(r=>r.split===s).length])),{train:16,validation:4,test:4});
 assert.equal(new Set(a.map(r=>r.midi_filename)).size,24);
 assert.deepEqual(new Set(a.filter(r=>r.split==='train').map(r=>r.selection_bucket)),new Set(['shorter','lower_mid','upper_mid','longer']));
});
test('manifest contains complete provenance but no claim of verified MIDI notes',()=>{
 const m=createManifest(csvRows(fullRows()));
 assert.equal(m.works.length,24);
 assert.equal(m.dataset.license,'CC BY-NC-SA 4.0');
 assert.equal(m.validation.archive_sha256_verified,false);
 assert.equal(m.validation.individual_midi_verified,false);
 assert.equal(m.validation.performance_complexity_profiled,false);
 assert.equal(m.schema,'play-along-maestro-research-corpus/1');
 assert.equal(JSON.stringify(m),JSON.stringify(createManifest(csvRows(fullRows()))));
});
test('empty split cannot satisfy nonzero quota',()=>{
 assert.throws(()=>selectQaCorpus([record(1)],{train:1,validation:1,test:0}),/Insufficient valid validation/);
});
