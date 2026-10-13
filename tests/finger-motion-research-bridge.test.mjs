import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectGuidanceResearchBridge as inspect} from '../src/core/finger-motion-research-bridge.mjs';

const BLACK=new Set([1,3,6,8,10]);
const xFor=p=>7*Math.floor(p/12)+[0,.5,1,1.5,2,3,3.5,4,4.5,5,5.5,6][p%12];
function geometry(){
 const byPitch=new Map();
 for(let p=21;p<=108;p++){
  const x=20+xFor(p)*16,w=BLACK.has(p%12)?9:16;
  byPitch.set(p,{x,w,center:x+w/2});
 }
 return {byPitch,whites:[{w:16}]};
}
const note=(noteId,pitch,start,duration=.06,fields={})=>({
 noteId,pitch,start,duration,...fields
});
const A=(hand,finger)=>({authorHand:hand,authorFinger:finger});
const U=(hand,finger)=>({userHand:hand,userFinger:finger});
const base=()=>({
 hand:'RH',targetNoteId:'next',geometry:geometry(),
 viewport:{left:0,right:1800},
 notes:[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,A('RH',3))],
 completedNoteIds:['old'],
 transport:{mode:'listen',playing:true,now:.1,leadMs:750,
  speedPercent:100,oppositeHandClear:true}
});
const run=change=>inspect({...base(),...change});
const why=(reason,changes)=>assert.equal(run(changes).reason,reason);
test('research bridge composes three solvers without passing generated fingers',()=>{
 const r=run();
 assert.equal(r.ok,true);assert.equal(r.motion.kind,'moving');
 assert.equal(r.motion.keys[0].pitch,64);
 assert.equal(r.motion.keys[0].finger,3);
 assert.equal(r.motion.keys[0].noteId,'next');
 assert.equal(r.handResearch.productionEligible,false);
 assert.equal(r.fingerResearch.productionEligible,false);
 assert.equal(r.productionEligible,false);assert.equal(r.expertValidated,false);
 assert.equal(r.researchOnly,true);
});
test('known candidate RH/LH cannot be substituted for missing trusted target finger',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,{authorHand:'RH'})];
 const r=run({notes});
 assert.equal(r.reason,'unverified-target-group');
 assert.equal(r.productionEligible,false);
 assert.ok(!('motion' in r));
});
test('inferred finger alone never authorizes hand motion',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,{authorHand:'RH',finger:3,
   source:'proposed-research'})];
 why('unverified-target-group',{notes});
});
test('generated or untrusted MIDI hand+finger metadata cannot masquerade as author',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,{hand:'RH',finger:3,source:'generated'})];
 why('unverified-target-group',{notes});
});
test('trusted complete user correction supersedes author without editing author fields',()=>{
 const n=note('next',64,.8,.06,{...A('LH',4),...U('RH',3)});
 const notes=[note('old',60,0,.06,A('RH',1)),n];
 const frozen=structuredClone(notes);
 const r=run({notes});
 assert.equal(r.motion.kind,'moving');
 assert.equal(r.motion.keys[0].finger,3);
 assert.equal(r.motion.keys[0].hand,'RH');
 assert.deepEqual(notes,frozen);
});
test('partial user override cannot borrow author finger for a new hand',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,{...A('LH',3),userHand:'RH'})];
 why('unverified-target-group',{notes});
});
test('partial user finger correction cannot borrow author hand',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,{...A('RH',3),userFinger:2})];
 why('unverified-target-group',{notes});
});
test('unresolved earlier task blocks any later verified target',()=>{
 const notes=[note('early',60,0,.06,{source:'midi'}),
  note('old',62,.4,.06,A('RH',1)),note('next',64,.8,.06,A('RH',3))];
 why('skipped-unfinished-onset',{notes,completedNoteIds:['old']});
});
test('target must be pending and part of exactly earliest unfinished score onset',()=>{
 why('target-not-pending',{completedNoteIds:['old','next']});
 const notes=[...base().notes,note('later',67,1.2,.06,A('RH',5))];
 why('skipped-unfinished-onset',{notes,targetNoteId:'later'});
});
test('simultaneous unknown note suppresses complete verified hand posture',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,A('RH',3)),note('unknown',48,.8,.06)];
 const r=run({notes});
 assert.equal(r.reason,'unverified-target-group');
 assert.ok(!('motion' in r));
});
test('source completed partial chord retains only the actual pending key',()=>{
 const notes=[note('old',60,0,.06,A('RH',1)),
  note('done',60,.8,.06,A('RH',1)),
  note('next',64,.8,.06,A('RH',3))];
 const r=run({notes,completedNoteIds:['old','done']});
 assert.equal(r.ok,true);
 assert.equal(r.motion.kind,'markers');
 assert.equal(r.motion.reason,'partial-wait-chord');
 assert.deepEqual(r.motion.keys.map(x=>x.noteId),['next']);
});
test('missing original origin produces static verified destination, not invented travel',()=>{
 const cfg=base();
 const r=run({notes:[cfg.notes[1]],completedNoteIds:[]});
 assert.equal(r.motion.kind,'static');
 assert.equal(r.motion.reason,'origin-unknown');
});
test('held original source duration blocks movement and is not shortened',()=>{
 const cfg=base();
 cfg.notes[0].duration=1.1;
 const snapshot=structuredClone(cfg.notes);
 const r=run(cfg);
 assert.equal(r.motion.kind,'markers');
 assert.equal(r.motion.reason,'held-note-conflict');
 assert.deepEqual(cfg.notes,snapshot);
});
test('Wait mode remains stationary for the next pending group',()=>{
 const cfg=base(),transport={...cfg.transport,mode:'wait'};
 const r=run({transport});
 assert.equal(r.motion.kind,'static');assert.equal(r.motion.reason,'wait-pending');
});
test('late discovery cannot invent time remaining for hand travel',()=>{
 const cfg=base();
 const r=run({transport:{...cfg.transport,now:.79}});
 assert.equal(r.motion.kind,'markers');
 assert.equal(r.motion.reason,'movement-infeasible-now');
});
test('separate two-handed onset requires independently trusted opposite origin',()=>{
 const cfg=base();
 const notes=[...cfg.notes,note('LHnext',48,.8,.06,A('LH',3))];
 const r=run({notes});
 assert.equal(r.motion.kind,'markers');
 assert.equal(r.motion.reason,'opposite-origin-unverified');
});
test('two-hand timing is derived from the same canonical score onset',()=>{
 const cfg=base();
 const notes=[cfg.notes[0],note('LHorigin',43,0,.06,A('LH',4)),
  cfg.notes[1],note('LHnext',48,.8,.06,A('LH',3))];
 const r=run({notes,completedNoteIds:['old','LHorigin']});
 assert.equal(r.ok,true);
 assert.equal(r.motion.kind,'moving',r.motion.reason);
 assert.deepEqual(r.targetNoteIds,['next','LHnext']);
});
test('all-note source identity, duplicate note IDs and invalid completion fail closed',()=>{
 const cfg=base();
 why('invalid-source-event',{notes:[cfg.notes[0],{...cfg.notes[1],noteId:'old'}]});
 why('invalid-completion',{completedNoteIds:['old','alien']});
 why('invalid-completion',{completedNoteIds:['old','old']});
});
test('submillisecond offset near another onset is refused, not silently regrouped',()=>{
 const cfg=base();
 const notes=[...cfg.notes,note('offset',72,.8001,.06,A('LH',2))];
 why('millisecond-onset-collision',{notes});
});
test('unsupported authored finger or hand value fails closed',()=>{
 const cfg=base();
 why('invalid-provenance',{notes:[cfg.notes[0],note('next',64,.8,.06,{authorHand:'RH',authorFinger:7})]});
 why('invalid-provenance',{notes:[cfg.notes[0],note('next',64,.8,.06,{authorHand:'?',authorFinger:3})]});
});
test('bounded song scope is explicit and does not mutate caller inputs',()=>{
 const cfg=base();
 const frozenNotes=structuredClone(cfg.notes),frozenCompleted=[...cfg.completedNoteIds];
 const a=run(cfg),b=run(cfg);
 assert.deepEqual(a,b);
 assert.deepEqual(cfg.notes,frozenNotes);
 assert.deepEqual(cfg.completedNoteIds,frozenCompleted);
 const oversize=Array.from({length:129},(_,i)=>note('note'+i,60,i,.06,A('RH',1)));
 assert.equal(run({notes:oversize}).reason,'invalid-scope');
});

test('unknown simultaneous note in prior chord cannot be removed from origin clearance',()=>{
 const notes=[
  note('old',60,0,.06,A('RH',1)),
  note('unknown-origin',48,0,.06),
  note('next',64,.8,.06,A('RH',3))
 ];
 const result=run({notes,completedNoteIds:['old','unknown-origin']});
 assert.equal(result.ok,true);
 assert.equal(result.motion.kind,'static');
 assert.equal(result.motion.reason,'origin-unknown');
});

test('simultaneous author labels on the identical physical piano key cannot authorize dual motion',()=>{
 const notes=[
  note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.06,A('RH',3)),
  note('voice2',64,.8,.06,A('LH',2))
 ];
 const r=run({notes});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'ambiguous-physical-key');
 assert.equal(r.productionEligible,false);
});
test('overlapping same-key voices at distinct onsets refuse motion despite verified metadata',()=>{
 const notes=[
  note('old',60,0,.06,A('RH',1)),
  note('next',64,.8,.9,A('RH',3)),
  note('later-overlap',64,1.0,.1,A('LH',2))
 ];
 const r=run({notes});
 assert.equal(r.reason,'ambiguous-physical-key');
});
