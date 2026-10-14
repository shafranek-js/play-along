/**
 * FG-04C8: ephemeral original-MIDI bytes for the selected score.
 * NOT a musical parser, file store, worker, or source of inferred fingers.
 * WeakMap means replaced songs can be garbage-collected; copies isolate the
 * immutable original input from callers, transferables and accidental edits.
 */
export function createOriginalMidiSession({maxBytes=4_000_000}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<22||maxBytes>16_000_000)
  throw Error('INVALID_SESSION_SIZE_LIMIT');
 const bySong=new WeakMap();
 const object=s=>s!==null&&typeof s==='object';
 const original=b=>b instanceof Uint8Array?b:
  b instanceof ArrayBuffer?new Uint8Array(b):null;
 return Object.freeze({
  remember(song,raw){
   const bytes=original(raw);
   if(!object(song)||!bytes||bytes.length<22||bytes.length>maxBytes||
      String.fromCharCode(...bytes.subarray(0,4))!=='MThd')
    return {ok:false,reason:'ORIGINAL_MIDI_UNAVAILABLE'};
   bySong.set(song,bytes.slice());
   return {ok:true,bytes:bytes.length};
  },
  copy(song){
   if(!object(song))return null;
   const bytes=bySong.get(song);
   return bytes?bytes.slice():null;
  },
  has(song){return object(song)&&bySong.has(song)},
  forget(song){return object(song)&&bySong.delete(song)}
 });
}
