import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerEditionSnapshot as snapshot,fingerEditionReconcile as reconcile,
 fingerEditionManualReview as manualReview,fingerEditionManualBatch as manualBatch}
 from '../src/core/fingering-edition-reconcile.mjs';

const T=value=>({nodeType:3,nodeValue:String(value)});
function E(name,attributes={},...kids){
 const el={nodeType:1,localName:name,namespaceURI:null,
  attributes:Object.entries(attributes).map(([localName,value])=>({
   localName,namespaceURI:null,value:String(value)})),
  childNodes:kids.flat(),parentElement:null};
 el.children=el.childNodes.filter(k=>k.nodeType===1);
 for(const x of el.childNodes)x.parentElement=el;
 el.getAttribute=k=>el.attributes.find(a=>a.localName===k)?.value??null;
 el.getElementsByTagName=k=>{
  const found=[];function visit(n){for(const c of n.children||[]){
   if(c.localName===k||k==='*')found.push(c);visit(c)
  }}visit(el);return found;
 };
 Object.defineProperty(el,'textContent',{get:()=>el.childNodes.map(x=>x.nodeType===3?x.nodeValue:x.textContent).join('')});
 return el;
}
const pitch=p=>E('pitch',{},E('step',{},T(({60:'C',62:'D',64:'E',65:'F',67:'G'})[p]||'C')),E('octave',{},T('4')));
let incarnation=0;
function score(bars,{title='Edition Demo',author='Same Composer',fingers={},ties={}}={}){
 const notes=[],partBars=[],noteIdPrefix='xml:P1:0:',xmlSerial=++incarnation;
 let ordinal=0;
 bars.forEach((pitches,m)=>{
  const music=pitches.map((p,i)=>{
   const id=noteIdPrefix+m+':'+(++ordinal);
   const n={noteId:id,sourceNoteIds:[id],pitch:p,partId:'P1',
    sourceTrack:0,voice:'1',staff:'1',start:ordinal*.5,duration:.5,
    velocity:85,channel:0};
   if(fingers[id]){n.finger=fingers[id];n.fingeringSource='musicxml'}
   notes.push(n);
   const tech=fingers[id]?[E('notations',{},E('technical',{},E('fingering',{},T(fingers[id]))))]:[];
   if(ties[id])n.sourceNoteIds.push('xml:P1:0:'+m+':900');
   return E('note',{},pitch(p),E('duration',{},T('480')),
    E('voice',{},T('1')),E('staff',{},T('1')),...tech);
  });
  partBars.push(E('measure',{number:String(m+1)},...(m===0?[E('attributes',{},E('divisions',{},T('480')))]:[]),...music));
 });
 const dom=E('score-partwise',{},E('part',{id:'P1'},...partBars));
 const xml='<score-partwise data-case="'+xmlSerial+'"/>';
 const song={format:'MusicXML',title,author,notationXML:xml,
  tracks:[{notes}]};
 return {song,parse:()=>({documentElement:dom,getElementsByTagName:dom.getElementsByTagName}),
  noteIds:notes.map(n=>n.noteId)};
}
const S=o=>snapshot(o.song,{parse:o.parse});
const updates=(old,changes,newer,now={})=>reconcile(S(old),S(newer),changes,now);
const edit=(finger,hand='RH')=>({finger,hand});
test('unique unchanged measure maps edited finger across inserted bar and shifted canonical IDs',()=>{
 const old=score([[60],[62]]),next=score([[60],[64],[62]]);
 const r=updates(old,{[old.noteIds[1]]:edit(3)},next);
 assert.equal(r.status,'review');
 assert.deepEqual(r.proposals.map(x=>[x.from,x.to,x.finger]),[
  [old.noteIds[1],next.noteIds[2],3]]);
 assert.deepEqual(r.conflicts,[]);assert.deepEqual(r.unresolved,[]);
 assert.equal(r.automaticApply,false);assert.equal(r.productionEligible,false);
});
test('unique exact note may be transferred as hand-only without invented finger',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const r=updates(a,{[a.noteIds[1]]:edit(null,'LH')},b);
 assert.equal(r.proposals[0].finger,null);
 assert.equal(r.proposals[0].hand,'LH');
});
test('identical repeated bars refuse even when indices look stable',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const r=updates(a,{[a.noteIds[1]]:edit(2)},b);
 assert.equal(r.proposals.length,0);
 assert.equal(r.unresolved[0].reason,'ambiguous-or-changed-measure');
 assert.equal(r.unresolved[0].oldOccurrences,2);
});
test('newly duplicated destination refuses even when source passage was unique',()=>{
 const a=score([[60],[62]]),b=score([[60],[62],[62]]);
 const r=updates(a,{[a.noteIds[1]]:edit(2)},b);
 assert.equal(r.proposals.length,0);
 assert.equal(r.unresolved[0].newOccurrences,2);
});
test('changed target pitch refuses, no nearest-note or nearest-time guess',()=>{
 const a=score([[60],[62]]),b=score([[60],[64]]);
 const r=updates(a,{[a.noteIds[1]]:edit(3)},b);
 assert.equal(r.proposals.length,0);
 assert.equal(r.unresolved[0].reason,'ambiguous-or-changed-measure');
});
test('target original author fingering conflict stays in manual review',()=>{
 const a=score([[60],[62]]);const b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':5}});
 const r=updates(a,{[a.noteIds[1]]:edit(3)},b);
 assert.equal(r.proposals.length,0);
 assert.equal(r.conflicts[0].reason,'target-author-finger-conflict');
 assert.equal(r.conflicts[0].authorFinger,5);
});
test('verified target author RH hand conflicts with imported user LH even if finger number matches',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':3}});
 b.song.tracks[0].notes[2].hand='RH';
 const r=updates(a,{[a.noteIds[1]]:edit(3,'LH')},b);
 assert.equal(r.proposals.length,0);
 assert.equal(r.conflicts[0].reason,'target-author-hand-conflict');
});
test('same author digit requires no override conflict for hand correction',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':3}});
 const r=updates(a,{[a.noteIds[1]]:edit(3,'LH')},b);
 assert.equal(r.proposals.length,1);
 assert.equal(r.conflicts.length,0);
});
test('existing different USER correction is never overwritten by plan',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const r=updates(a,{[a.noteIds[1]]:edit(3)},b,{[b.noteIds[2]]:edit(4)});
 assert.equal(r.proposals.length,0);
 assert.equal(r.conflicts[0].reason,'existing-user-correction');
});
test('identical current USER correction is skipped, not applied twice',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const r=updates(a,{[a.noteIds[1]]:edit(3)},b,{[b.noteIds[2]]:edit(3)});
 assert.equal(r.proposals.length,0);
 assert.equal(r.unresolved[0].reason,'already-identical');
});
test('different work metadata, part identity, identical versions refuse',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{author:'Another Composer'});
 assert.equal(updates(a,{[a.noteIds[1]]:edit(2)},b).reason,'different-work-metadata');
 const same=S(a);
 assert.equal(reconcile(same,same,{[a.noteIds[0]]:edit(2)}).reason,'same-edition');
 const altered=S(score([[60],[64],[62]]));altered.parts[0].partId='Different';
 assert.equal(reconcile(S(a),altered,{[a.noteIds[0]]:edit(2)}).reason,'part-identity-changed');
});
test('malformed correction, unknown source ID and missing source notes refuse',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 assert.equal(updates(a,{[a.noteIds[1]]:{finger:8,hand:'RH'}},b).reason,'invalid-snapshot-or-corrections');
 assert.equal(updates(a,{[a.noteIds[1]]:{finger:3,hand:'LH',source:'generated'}},b).reason,'invalid-snapshot-or-corrections');
 const r=updates(a,{'xml:P1:0:5:99':edit(2)},b);
 assert.equal(r.unresolved[0].reason,'source-note-missing');
});
test('exported MusicXML finger annotations alone do not alter structural measure match',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':3}});
 const r=updates(a,{[a.noteIds[1]]:edit(3)},b);
 assert.equal(r.proposals.length,1);
});
test('importer pitch discrepancies block the entire snapshot',()=>{
 const a=score([[60],[62]]);
 a.song.tracks[0].notes[1].pitch=67;
 assert.equal(S(a).reason,'xml-playback-identity-mismatch');
});
test('duplicate source-note IDs, unsupported repeats and XML entity payloads are refused',()=>{
 const a=score([[60],[62]]);
 a.song.tracks[0].notes[1].noteId=a.noteIds[0];
 assert.equal(S(a).reason,'invalid-imported-notes');
 const b=score([[60],[62]]);
 b.song.notationXML='<!DOCTYPE foo [<!ENTITY a SYSTEM "file:///tmp/x">]>';
 assert.equal(S(b).reason,'unsupported-source');
 const c=score([[60],[62]]);
 c.song.originalNotationXML='original-repetition';
 assert.equal(S(c).reason,'unsupported-source');
});
test('transfer planning never mutates immutable source, target or correction objects',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const source=S(a),target=S(b),changes={[a.noteIds[1]]:edit(3)};
 const before=JSON.stringify([source,target,changes]);
 const first=reconcile(source,target,changes),second=reconcile(source,target,changes);
 assert.deepEqual(first,second);
 assert.equal(JSON.stringify([source,target,changes]),before);
});


test('B6: duplicated bars require explicit destination selection and no auto mapping',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const edits={[a.noteIds[1]]:edit(4)};
 const p=manualReview(S(a),S(b),edits);
 assert.equal(p.status,'review');assert.equal(p.automaticApply,false);
 assert.equal(p.rows.length,1);
 assert.equal(p.rows[0].options.length,2);
 const chosen=p.rows[0].options[1].to;
 const confirmed=[{from:a.noteIds[1],to:chosen,acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.deepEqual(manualBatch(S(a),S(b),edits,{},confirmed),{
  status:'ready',entries:[{id:chosen,before:null,after:edit(4)}],
  accepted:1,automaticApply:false
 });
});
test('B6: edited measures are not silently mapped but exact compatible note may be manually chosen',()=>{
 const a=score([[60],[62]]),b=score([[60],[67],[62]]);
 const edits={[a.noteIds[1]]:edit(5,'LH')};
 assert.equal(reconcile(S(a),S(b),edits).proposals.length,1,
  'Unchanged source measure can still be verified automatically');
 const target=score([[60],[62,64]]),changes={[a.noteIds[1]]:edit(2,'LH')};
 assert.equal(reconcile(S(a),S(target),changes).proposals.length,0);
 const review=manualReview(S(a),S(target),changes);
 assert.equal(review.rows.length,1);
 assert.equal(review.rows[0].options.length,1);
 const choice=[{from:a.noteIds[1],to:review.rows[0].options[0].to,
  acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.equal(manualBatch(S(a),S(target),changes,{},choice).status,'ready');
});
test('B6: explicit different target author fingering needs a separate acknowledgement',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':5}});
 const edits={[a.noteIds[1]]:edit(3)};
 const row=manualReview(S(a),S(b),edits).rows[0];
 assert.equal(row.options[0].authorConflict,true);
 const pick=[{from:row.from,to:row.options[0].to,
   acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.equal(manualBatch(S(a),S(b),edits,{},pick).reason,'manual-overwrite-not-acknowledged');
 pick[0].acknowledgeAuthor=true;
 assert.equal(manualBatch(S(a),S(b),edits,{},pick).status,'ready');
});
test('B6: changing existing user override requires its own acknowledgement and keeps expected before',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const edits={[a.noteIds[1]]:edit(2,'RH')},existing={[b.noteIds[2]]:edit(5,'LH')};
 const row=manualReview(S(a),S(b),edits,existing).rows[0];
 assert.equal(row.options.find(o=>o.to===b.noteIds[2]).existingConflict,true);
 const choice=[{from:row.from,to:b.noteIds[2],
   acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.equal(manualBatch(S(a),S(b),edits,existing,choice).reason,'manual-overwrite-not-acknowledged');
 choice[0].acknowledgeExisting=true;
 const saved=manualBatch(S(a),S(b),edits,existing,choice);
 assert.equal(saved.status,'ready');
 assert.deepEqual(saved.entries,[{id:b.noteIds[2],before:edit(5,'LH'),after:edit(2,'RH')}]);
});
test('B6: author hand conflict independent from author finger conflict',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]],{fingers:{'xml:P1:0:2:3':3}});
 b.song.tracks[0].notes[2].hand='RH';
 const changes={[a.noteIds[1]]:edit(3,'LH')};
 const row=manualReview(S(a),S(b),changes).rows[0];
 assert.equal(row.options[0].authorConflict,true);
 const choose=[{from:row.from,to:row.options[0].to,acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.equal(manualBatch(S(a),S(b),changes,{},choose).status,'rejected');
 choose[0].acknowledgeAuthor=true;
 assert.equal(manualBatch(S(a),S(b),changes,{},choose).status,'ready');
});
test('B6: same target cannot be assigned by two old notes even with explicit acknowledgement',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const edits={[a.noteIds[1]]:edit(2),[a.noteIds[2]]:edit(3)};
 const p=manualReview(S(a),S(b),edits),target=p.rows[0].options[0].to;
 const selections=p.rows.map(row=>({
  from:row.from,to:target,acknowledgeAuthor:false,acknowledgeExisting:false
 }));
 assert.equal(manualBatch(S(a),S(b),edits,{},selections).reason,'duplicate-manual-mapping');
});
test('B6: unknown target and unknown source IDs are never accepted',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const edits={[a.noteIds[1]]:edit(2)};
 const invalid=[{from:a.noteIds[1],to:'xml:P1:0:99:500',
  acknowledgeAuthor:true,acknowledgeExisting:true}];
 assert.equal(manualBatch(S(a),S(b),edits,{},invalid).reason,'unverified-manual-destination');
 invalid[0].from='xml:P1:0:0:999';
 assert.equal(manualBatch(S(a),S(b),edits,{},invalid).reason,'unverified-manual-destination');
});
test('B6: invalid/implicit choice confirmation is refused, never silently assumed',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const changes={[a.noteIds[1]]:edit(4)},row=manualReview(S(a),S(b),changes).rows[0];
 for(const invalid of [
  null,[],{},[{from:row.from,to:row.options[0].to}],
  [{from:row.from,to:row.options[0].to,acknowledgeAuthor:0,acknowledgeExisting:false}],
  [{from:row.from,to:row.options[0].to,acknowledgeAuthor:false,acknowledgeExisting:false,force:true}]
 ]){
  assert.equal(manualBatch(S(a),S(b),changes,{},invalid).status,'rejected');
 }
});
test('B6: exact matching prior user value gives no manual transfer entry',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 const old={[a.noteIds[1]]:edit(3)},current={[b.noteIds[2]]:edit(3)};
 assert.equal(manualReview(S(a),S(b),old,current).rows.length,0);
});
test('B6: tied source and tied target are ineligible regardless of manual confirmation',()=>{
 const a=score([[60],[62]]),b=score([[60],[64],[62]]);
 a.song.tracks[0].notes[1].sourceNoteIds.push('xml:P1:0:1:900');
 const r=manualReview(S(a),S(b),{[a.noteIds[1]]:edit(3)});
 assert.equal(r.status,'rejected'); // fixture missing expanded tied segment in DOM
});
test('B6: candidate list is bounded, no scrolling to thousands of guessed matches',()=>{
 const a=score([[60],[62]]),b=score([[60],...Array.from({length:30},()=>[62])]);
 const x=manualReview(S(a),S(b),{[a.noteIds[1]]:edit(3)});
 assert.equal(x.rows.length,0);
 assert.equal(x.excluded[0].reason,'too-many-candidates');
});
test('B6: pure reconciliation does not mutate any snapshot, edits or selection',()=>{
 const a=score([[60],[62],[62]]),b=score([[60],[64],[62],[62]]);
 const old=S(a),next=S(b),changes={[a.noteIds[1]]:edit(4)},current={};
 const before=JSON.stringify([old,next,changes,current]);
 const review=manualReview(old,next,changes,current),picked=[{from:review.rows[0].from,
  to:review.rows[0].options[0].to,acknowledgeAuthor:false,acknowledgeExisting:false}];
 const out=manualBatch(old,next,changes,current,picked);
 assert.equal(out.status,'ready');
 assert.equal(JSON.stringify([old,next,changes,current]),before);
});


// FG-03C2B7: realistic, complete XML tied source segments, preserved by the
// importer as ONE playable note with two or three original sourceNoteIds.
function tiedFixture({
 insert=false,three=false,duplicate=false,
 changeStopDuration=false,invalidTie=false,
 orphan=false,authorFinger=null
}={}){
 const groups=[[60],...(insert?[[64]]:[]),
  [62],[62],...(three?[[62]]:[]),[67],
  ...(duplicate?[[62],[62],...(three?[[62]]:[])]:[])];
 const first=insert?2:1,last=first+(three?2:1);
 const beginnings=duplicate?[first,groups.length-(three?3:2)]:[first];
 const records=[],measures=[],serial=++incarnation;
 let ordinal=0;
 let ongoing=null;
 groups.forEach(([pitchValue],mi)=>{
  const id='xml:P1:0:'+mi+':'+(++ordinal);
  const start=beginnings.includes(mi);
  const end=beginnings.some(n=>mi===n+(three?2:1));
  const middle=three&&beginnings.some(n=>mi===n+1);
  let types=start?['start']:end?['stop']:middle?['stop','start']:[];
  if(invalidTie&&end&&mi===last)types=['start'];
  if(orphan&&start&&mi===first)types=['stop'];
  const note=E('note',{},pitch(pitchValue),
   E('duration',{},T(changeStopDuration&&end&&mi===last?'960':'480')),
   E('voice',{},T('1')),E('staff',{},T('1')),
   ...types.map(type=>E('tie',{type})),
   ...(authorFinger!==null&&start?[E('notations',{},
    E('technical',{},E('fingering',{},T(authorFinger))))]:[]));
  measures.push(E('measure',{number:String(mi+1)},
   ...(mi===0?[E('attributes',{},E('divisions',{},T('480')))]:[]),note));
  if(start){
   ongoing={noteId:id,sourceNoteIds:[id],pitch:pitchValue,
    partId:'P1',voice:'1',staff:'1',start:mi*.5,duration:.5};
   records.push(ongoing);
   if(authorFinger!==null){ongoing.finger=authorFinger;ongoing.fingeringSource='musicxml'}
  }else if(middle||end){
   if(!ongoing)throw Error('Broken test tie fixture');
   ongoing.sourceNoteIds.push(id);
   ongoing.duration+=.5;
   if(end)ongoing=null;
  }else records.push({noteId:id,sourceNoteIds:[id],pitch:pitchValue,
   partId:'P1',voice:'1',staff:'1',start:mi*.5,duration:.5});
 });
 const dom=E('score-partwise',{},E('part',{id:'P1'},...measures));
 return {song:{format:'MusicXML',title:'Edition Demo',author:'Same Composer',
  notationXML:'<score-partwise data-tie-fixture="'+serial+'"/>',
  tracks:[{notes:records}]},
  parse:()=>({documentElement:dom,getElementsByTagName:dom.getElementsByTagName}),
  notes:records,tieNotes:records.filter(n=>n.sourceNoteIds.length>1)};
}
test('B7: fully verified two-segment tie shifts with inserted bar, manual consent required',()=>{
 const before=tiedFixture(),after=tiedFixture({insert:true});
 const source=before.tieNotes[0],target=after.tieNotes[0];
 assert.equal(source.sourceNoteIds.length,2);
 assert.equal(S(before).status,'ready');
 assert.equal(S(after).status,'ready');
 const changes={[source.noteId]:edit(4,'LH')};
 assert.equal(reconcile(S(before),S(after),changes).unresolved[0].reason,'tied-note-requires-review');
 const review=manualReview(S(before),S(after),changes);
 assert.equal(review.status,'review');assert.equal(review.rows.length,1);
 assert.equal(review.rows[0].tieCount,2);
 assert.deepEqual(review.rows[0].options.map(x=>x.to),[target.noteId]);
 const choice=[{from:source.noteId,to:target.noteId,
  acknowledgeAuthor:false,acknowledgeExisting:false}];
 const plan=manualBatch(S(before),S(after),changes,{},choice);
 assert.deepEqual(plan.entries,[{id:target.noteId,before:null,after:edit(4,'LH')}]);
 assert.equal(plan.automaticApply,false);
});
test('B7: middle stop/start in three-segment chain matches only exact topology',()=>{
 const from=tiedFixture({three:true}),to=tiedFixture({insert:true,three:true});
 assert.equal(S(from).status,'ready');assert.equal(S(to).status,'ready');
 const changes={[from.tieNotes[0].noteId]:edit(3)};
 const review=manualReview(S(from),S(to),changes);
 assert.equal(review.rows[0].options.length,1);
 assert.equal(review.rows[0].options[0].tieCount,3);
 assert.equal(manualBatch(S(from),S(to),changes,{},[{
  from:from.tieNotes[0].noteId,to:to.tieNotes[0].noteId,
  acknowledgeAuthor:false,acknowledgeExisting:false
 }]).status,'ready');
 const mismatch=tiedFixture({insert:true});
 assert.equal(manualReview(S(from),S(mismatch),changes).rows.length,0);
});
test('B7: altered duration on tied stop cannot be mapped as equivalent source',()=>{
 const from=tiedFixture(),to=tiedFixture({insert:true,changeStopDuration:true});
 const changes={[from.tieNotes[0].noteId]:edit(2)};
 const result=manualReview(S(from),S(to),changes);
 assert.equal(result.rows.length,0);
 assert.equal(result.excluded[0].reason,'no-compatible-note');
 assert.equal(manualBatch(S(from),S(to),changes,{},[{
  from:from.tieNotes[0].noteId,to:to.tieNotes[0].noteId,
  acknowledgeAuthor:true,acknowledgeExisting:true
 }]).reason,'unverified-manual-destination');
});
test('B7: malformed stop/start and orphan stop refuse snapshot',()=>{
 const invalid=tiedFixture({invalidTie:true}),orphan=tiedFixture({orphan:true});
 assert.equal(S(invalid).reason,'inconsistent-tie-chain');
 assert.equal(S(orphan).reason,'inconsistent-tie-chain');
});
test('B7: cannot map a tied old note onto a plain same-pitch note',()=>{
 const old=tiedFixture(),target=score([[60],[62],[67]]);
 const result=manualReview(S(old),S(target),{[old.tieNotes[0].noteId]:edit(2)});
 assert.equal(result.rows.length,0);
});
test('B7: duplicate verified tie chains are shown as manual alternatives, never auto-selected',()=>{
 const old=tiedFixture(),target=tiedFixture({insert:true,duplicate:true});
 const review=manualReview(S(old),S(target),{[old.tieNotes[0].noteId]:edit(5)});
 assert.equal(review.rows.length,1);
 assert.equal(review.rows[0].options.length,2);
 assert.equal(new Set(review.rows[0].options.map(x=>x.to)).size,2);
});
test('B7: exact tie candidate still requires explicit target overwrite acknowledgements',()=>{
 const old=tiedFixture(),target=tiedFixture({insert:true,authorFinger:5});
 const changes={[old.tieNotes[0].noteId]:edit(3)};
 const pick=[{from:old.tieNotes[0].noteId,to:target.tieNotes[0].noteId,
  acknowledgeAuthor:false,acknowledgeExisting:false}];
 assert.equal(manualBatch(S(old),S(target),changes,{},pick).reason,'manual-overwrite-not-acknowledged');
 pick[0].acknowledgeAuthor=true;
 assert.equal(manualBatch(S(old),S(target),changes,{},pick).status,'ready');
});
