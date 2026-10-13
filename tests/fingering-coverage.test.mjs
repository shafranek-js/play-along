import test from 'node:test';
import assert from 'node:assert/strict';
import {fingeringCoverageFromSong,fingeringCoverageStatus,fingeringCoverageLabel,fingeringCoverageValid} from '../src/core/fingering-coverage.mjs';

const note=(pitch,finger,hand='RH',id=null)=>({pitch,start:0,duration:.3,
 ...(finger==null?{}:{finger,hand,fingeringSource:'musicxml'}),
 ...(id?{noteId:id}:{})});
const score=(...notes)=>({format:'MusicXML',tracks:[{notes}]});
test('Coverage: full means all sounding score notes have valid finger labels',()=>{
 const x=fingeringCoverageFromSong(score(note(60,1),note(62,2)));
 assert.deepEqual(x,{total:2,marked:2,hands:2,author:2,user:0});
 assert.equal(fingeringCoverageStatus(x),'full');
 assert.equal(fingeringCoverageLabel(x),'Есть · 2/2 (100%)');
});
test('Coverage: partial with missing hand remains full if every finger known',()=>{
 const x=fingeringCoverageFromSong(score(note(60,1,null),note(62,2),note(64,null)));
 assert.equal(x.marked,2);assert.equal(x.hands,1);
 assert.equal(fingeringCoverageStatus(x),'partial');
 assert.equal(fingeringCoverageLabel(x),'Частично · 2/3 (67%)');
 const noHand=fingeringCoverageFromSong(score(note(60,2,null),note(64,3,null)));
 assert.equal(fingeringCoverageStatus(noHand),'full');
 assert.equal(noHand.hands,0);
});
test('Coverage: unannotated MusicXML and MIDI with actual notes are none',()=>{
 const a=fingeringCoverageFromSong(score(note(60,null),note(64,null)));
 const b=fingeringCoverageFromSong({format:'MIDI',tracks:[{notes:[note(62,null)]}]});
 assert.equal(fingeringCoverageStatus(a),'none');
 assert.equal(fingeringCoverageStatus(b),'none');
 assert.equal(fingeringCoverageLabel(a),'Нет · 0/2 (0%)');
});
test('Coverage: unread remote and empty scores are unknown, not none',()=>{
 assert.equal(fingeringCoverageFromSong({title:'MuseTrainer',tracks:[]}),null);
 assert.equal(fingeringCoverageStatus(null),'unknown');
 assert.equal(fingeringCoverageLabel(null),'Не проверено');
 assert.equal(fingeringCoverageValid({total:2,marked:3,hands:2,author:2,user:1}),false);
});
test('Coverage: valid per-note user overrides fill gaps without mutating author source',()=>{
 const id='xml:P1:0:0:2';
 const s=score(note(60,1),note(62,null,'RH',id));
 const result=fingeringCoverageFromSong(s,{[id]:{finger:3,hand:'LH'}});
 assert.deepEqual(result,{total:2,marked:2,hands:2,author:1,user:1});
 assert.equal(fingeringCoverageStatus(result),'full');
 assert.equal(s.tracks[0].notes[1].finger,undefined);
});
test('Coverage: invalid proposals and untrusted MIDI finger fields cannot raise coverage',()=>{
 const input=score(note(60,1),{pitch:64,start:1,duration:.3,finger:5,hand:'RH',fingeringSource:'research'});
 const result=fingeringCoverageFromSong(input);
 assert.equal(result.marked,1);
 assert.equal(fingeringCoverageStatus(result),'partial');
 assert.equal(fingeringCoverageStatus(fingeringCoverageFromSong({id:'demo-scale',tracks:[{notes:[note(60,null),note(62,null)]}]})),'none');
 assert.equal(fingeringCoverageStatus(fingeringCoverageFromSong({id:'demo-finger-duet',tracks:[{notes:[note(60,null),note(62,null)]}]})),'full');
});

test('FG-04D1: downloaded user-edited XML digits count neither as author nor as verified user corrections',()=>{
 const n=note(60,3,'RH','xml:P1:0:0:1');
 n.fingeringSource='musicxml-user-export-unverified';
 const s=score(n,note(62,null));
 const unknown=fingeringCoverageFromSong(s);
 assert.deepEqual(unknown,{total:2,marked:0,hands:0,author:0,user:0});
 assert.equal(fingeringCoverageStatus(unknown),'none');
 const manual=fingeringCoverageFromSong(s,{[n.noteId]:{finger:3,hand:'RH'}});
 assert.deepEqual(manual,{total:2,marked:1,hands:1,author:0,user:1});
});
