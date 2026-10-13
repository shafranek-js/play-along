/**
 * FG-04B3c — evidence-only triage of previously audited ASAP scores.
 * No source note positions, pitches, finger numbers, XML or MIDI are returned.
 * Classifications are editorial/engineering buckets, NOT a musical verdict.
 */
const fail=reason=>{throw Error(reason)};
const category=reason=>{
 if(reason===null)return 'aligned';
 if(reason==='MUSICXML_REPEAT_NAVIGATION_UNSUPPORTED')return 'repeat_navigation';
 if(reason==='MUSICXML_GRACE_TIMING_UNSUPPORTED')return 'grace_realization';
 if(reason==='MUSICXML_UNPAIRED_TIE_STOP'||
    reason==='MUSICXML_NONCONTIGUOUS_TIE'||
    reason==='MUSICXML_AMBIGUOUS_TIE_STOP'||
    reason==='MUSICXML_AMBIGUOUS_TIE_CONTINUATION'||
    reason==='MUSICXML_UNFINISHED_TIE')return 'tie_provenance';
 if(reason==='MUSICXML_BACKUP_BEFORE_MEASURE')return 'voice_timeline';
 if(reason==='SCORE_EVENT_UNMATCHED'||
    reason==='SCORE_MIDI_NOTE_COUNT_MISMATCH'||
    reason==='AMBIGUOUS_MIDI_EVENT_CANDIDATES')return 'score_midi_divergence';
 if(reason==='ZERO_LENGTH_MIDI_NOTE')return 'midi_source_data';
 return 'other_refusal';
};

/**
 * A pinned before/after comparison cannot silently erase a prior successful
 * score. Rejections are kept visible; an improvement requires BOTH actual
 * verified source loading and an unambiguous aligned status.
 */
export function compareAsapAuditBaseline(baseline,current,{sourceRevision}={}){
 if(baseline?.schema!=='fg04b3c-asap-alignment-baseline-v1'||
    baseline?.source?.revision!==sourceRevision||
    baseline?.source?.license!=='CC-BY-NC-SA-4.0'||
    !Array.isArray(baseline.cases)||baseline.cases.length!==16||
    !Array.isArray(current?.cases)||current.cases.length!==16)
  fail('INVALID_ASAP_ALIGNMENT_BASELINE');
 const before=new Map(),after=new Map();
 for(const [list,target] of [[baseline.cases,before],[current.cases,after]]){
  for(const row of list){
   if(typeof row?.id!=='string'||!/^[a-z0-9-]{3,60}$/.test(row.id)||
      target.has(row.id)||!['aligned','rejected'].includes(row.status)||
      (row.status==='rejected'&&(!row.reason||typeof row.reason!=='string'))||
      (row.status==='aligned'&&row.reason!==null))
    fail('MALFORMED_ASAP_ALIGNMENT_CASE');
   target.set(row.id,row);
  }
 }
 if(before.size!==16||after.size!==16)fail('ASAP_ALIGNMENT_SCOPE_MISMATCH');
 const newlyAligned=[],regressions=[],reasonChanges=[],unresolved=[],families={};
 for(const [id,old] of before){
  const row=after.get(id);
  if(!row)fail('ASAP_ALIGNMENT_SCOPE_MISMATCH');
  if(old.status==='rejected'&&row.status==='aligned')newlyAligned.push(id);
  if(old.status==='aligned'&&row.status==='rejected')regressions.push(id);
  if(old.status==='rejected'&&row.status==='rejected'&&old.reason!==row.reason)
   reasonChanges.push({id,from:old.reason,to:row.reason});
  if(row.status==='rejected'){
   const family=category(row.reason);
   families[family]=(families[family]??0)+1;
   unresolved.push({id,reason:row.reason,family});
  }
 }
 const prevAligned=[...before.values()].filter(c=>c.status==='aligned').length;
 const currAligned=[...after.values()].filter(c=>c.status==='aligned').length;
 if(baseline.baseline?.aligned!==prevAligned||
    current.aligned!==currAligned||current.rejected!==16-currAligned)
  fail('ASAP_ALIGNMENT_TOTAL_INCONSISTENT');
 return {schema:'fg04b3c-alignment-triage-v1',
  sourceRevision,baselineRelease:baseline.provenance?.release??'unknown',
  baselineAligned:prevAligned,currentAligned:currAligned,
  newlyAligned,regressions,reasonChanges,
  unresolved,refusalsByFamily:families,
  allPairsAligned:currAligned===16,
  notesOrFingersIncluded:false,teacherApproved:false,
  productionAutoFingeringAllowed:false};
}
