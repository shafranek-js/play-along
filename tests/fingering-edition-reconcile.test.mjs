import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerEditionSnapshot as snapshot,fingerEditionReconcile as reconcile}
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
