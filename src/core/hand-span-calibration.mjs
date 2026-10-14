/**
 * FG-04C5: conservative ergonomic *self-report* selector, NOT a medical
 * measurement of anatomy or a verified fingering recommendation.
 *
 * Interval is the farthest white-key span between thumb and fifth finger
 * that the user reports trying on their own keyboard. Use only an interval
 * that can be held without pain. Separate LH and RH; current solver uses
 * a single profile, so it must use the smaller of two estimates.
 *
 * There is insufficient information here to recommend XXL or to calibrate
 * reach of 2–3 / 3–4 / 4–5. Those always require manual review.
 */
const SPAN_CAL_LEVELS=['XXS','XS','S','M','L','XL'];
const SPAN_CAL_INTERVALS=Object.freeze({
 sub7:'XXS',seventh:'XS',octave:'S',
 ninth:'M',tenth:'L',beyondTenth:'XL'
});
const SPAN_CAL_FEELINGS=['easy','stretch','pain'];
export function recommendHandSpanProfile(responses={}){
 if(!responses||typeof responses!=='object'||Array.isArray(responses))
  return {ok:false,reason:'INVALID_RESPONSES'};
 const byHand={};let measured=0;
 for(const h of ['RH','LH']){
  const r=responses[h];
  if(r==null||r.interval==='unknown')continue;
  if(!r||typeof r!=='object'||Array.isArray(r)||
    !Object.hasOwn(SPAN_CAL_INTERVALS,r.interval)||
    !SPAN_CAL_FEELINGS.includes(r.comfort))
   return {ok:false,reason:'INVALID_'+h+'_RESPONSE'};
  measured++;
  if(r.comfort==='pain')
   return {ok:false,reason:'DISCOMFORT_REPORTED',hand:h};
  const base=SPAN_CAL_LEVELS.indexOf(SPAN_CAL_INTERVALS[r.interval]);
  // A reached interval with noticeable stretch is not comfortably available.
  // One category down is a *screening precaution*, not a verified safe span.
  const selected=SPAN_CAL_LEVELS[Math.max(0,base-(r.comfort==='stretch'?1:0))];
  byHand[h]=selected;
 }
 if(!measured)return {ok:false,reason:'NO_HAND_MEASURED'};
 const index=Math.min(...Object.values(byHand).map(s=>SPAN_CAL_LEVELS.indexOf(s)));
 return {ok:true,profile:SPAN_CAL_LEVELS[index],byHand,
  status:measured===2?'both-hands':'provisional-one-hand',
  researchOnly:true,physiologicalMeasurement:false,neighbourFingerReachUnverified:true};
}
