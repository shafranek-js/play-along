/**
 * FG-04B3e — optional pinned ASAP four-piece control-only repeat probe.
 * Run: node scripts/fg04b3e-asap-repeat-probe.mjs
 *
 * Downloads are ephemeral, verified with frozen Git blob SHA-1 + byte size
 * by the existing loader. CC BY-NC-SA 4.0: noncommercial research only.
 * No source notes/XML/MIDI bytes are printed or written.
 *
 * This is NOT a source-to-MIDI alignment test. Grace, ornament or missing
 * independently validated note timing means explicit unsupported, not success.
 */
import path from 'node:path';
import {realCorpusManifest} from './fingering-asap-real-score-audit.mjs';
import {loadVerifiedScorePair} from './fingering-asap-xml-midi-audit.mjs';
import {parseMusicXmlRepeatControls} from '../src/core/musicxml-repeat-traversal.mjs';

const IDS=['beethoven-sonata-17-1','haydn-sonata-39-1',
 'schumann-arabeske','schumann-kreisleriana-1'];

export async function probePinnedRepeatControls({fetcher=globalThis.fetch}={}){
 const manifest=realCorpusManifest();
 const cases=[];
 for(const id of IDS){
  const entry=manifest.cases.find(c=>c.id===id);
  if(!entry)throw Error('REPEAT_PROBE_MANIFEST_MISSING:'+id);
  const {xml}=await loadVerifiedScorePair(manifest,entry,{fetcher});
  let control;
  try{control=parseMusicXmlRepeatControls(xml);}
  catch(e){
   cases.push({id,controlStatus:'unsupported',category:'unsupported',
    reason:String(e.message||e),midiAlignment:'not_tested'});
   continue;
  }
  // Do not invent written measure lengths or source-note event times.
  const reason=control.hasUnresolvedGrace?'REPEAT_GRACE_TIMING_UNSUPPORTED':
   control.hasUnresolvedOrnament?'REPEAT_ORNAMENT_REALIZATION_UNSUPPORTED':
    'REPEAT_SOURCE_NOTE_TIMELINE_NOT_INDEPENDENTLY_VALIDATED';
  cases.push({id,controlStatus:'parsed',category:'unsupported',reason,
   writtenMeasures:control.measureNumbers.length,
   controlEvents:control.events.length,midiAlignment:'not_tested'});
 }
 const categories={aligned:0,unsupported:0,ambiguous:0,score_midi_mismatch:0};
 for(const c of cases)categories[c.category]++;
 return {schema:'fg04b3e-pinned-repeat-control-probe-v1',
  pinnedAsapRevision:manifest.source.revision,sourceLicense:manifest.source.license,
  researchOnly:true,total:cases.length,controlsParsed:cases.filter(c=>
   c.controlStatus==='parsed').length,fullMidiScoreMatches:0,
  fullMidiMatchesAttempted:0,
  priorWholeCorpusBaseline:{aligned:1,rejected:15,total:16},
  categories,sourceBytesPersisted:false,sourceFingeringsGenerated:false,
  productionAutoFingeringAllowed:false,cases};
}

if(process.argv[1]&&path.basename(process.argv[1])==='fg04b3e-asap-repeat-probe.mjs'){
 try{console.log(JSON.stringify(await probePinnedRepeatControls(),null,2));}
 catch(e){console.error('FG-04B3e pinned-source verification failed:',e.message);process.exitCode=1;}
}
