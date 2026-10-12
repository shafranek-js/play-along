/**
 * FG-03C1: deterministic identity of an individual source MusicXML note.
 *
 * A part's *declared ID is NOT required to be unique* in files from third
 * parties. Its document-order part index disambiguates repeated/missing IDs.
 * The source ordinal distinguishes simultaneous unisons and voices, even
 * when staff, time, pitch and measure are all equal.
 *
 * This ID is stable for the same expanded playback XML. It is independent
 * of rendered track grouping, tempo conversion and playable transposition.
 * The original imported work is not rewritten.
 */
export function musicXmlSourceNoteId(partId,partIndex,measureIndex,ordinal){
 if(typeof partId!=='string'||partId.length>256||
  !Number.isSafeInteger(partIndex)||partIndex<0||
  !Number.isSafeInteger(measureIndex)||measureIndex<0||
  !Number.isSafeInteger(ordinal)||ordinal<1)
  throw Error('Invalid MusicXML source-note identity');
 return 'xml:'+encodeURIComponent(partId)+':'+partIndex+':'+measureIndex+':'+ordinal;
}
