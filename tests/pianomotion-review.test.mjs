import test from 'node:test';
import assert from 'node:assert/strict';
import {
 pianoMotionEmptyHistory,pianoMotionNoteState,pianoMotionProposeBatch,
 pianoMotionCommitBatch,pianoMotionTravelHistory,pianoMotionWindow,
 pianoMotionReviewEligibility,pianoMotionReviewSummary
}from '../src/core/pianomotion-review.mjs';
const note=(pitch,start)=>({pitch,start,duration:.2});
const aligned=(notes)=>({ok:true,matches:notes.map((n,i)=>({
 note:n,trackIndex:0,ordinal:i,suggestion:{pitch:n.pitch,start:n.start,
 end:n.start+n.duration,finger:1+i%5,hand:i%2?'LH':'RH'}
}))});
test('select one of 547 without mutating the other 546 or author/user layer',()=>{
 const notes=Array.from({length:547},(_,i)=>note(45+i%32,i*.25));
 notes[3].finger=2;notes[3].hand='RH';notes[3].fingeringSource='musicxml';
 notes[5].finger=5;notes[5].fingeringSource='user';
 const a=aligned(notes),snapshot=structuredClone(notes);
 const one=pianoMotionProposeBatch(a,[24],{});
 assert.equal(one.ok,true);assert.equal(one.patches.length,1);
 const h=pianoMotionCommitBatch(pianoMotionEmptyHistory(),one);
 assert.equal(h.ok,true);assert.equal(notes[24].finger,5);
 assert.equal(notes[24].fingeringSource,'pianomotion');
 assert.deepEqual(notes.slice(0,24),snapshot.slice(0,24));
 assert.deepEqual(notes.slice(25),snapshot.slice(25));
 const undo=pianoMotionTravelHistory(h.history,'undo');
 assert.equal(undo.ok,true);assert.deepEqual(notes,snapshot);
 const redo=pianoMotionTravelHistory(undo.history,'redo');
 assert.equal(redo.ok,true);assert.equal(notes[24].finger,5);
 assert.equal(notes[3].finger,2);assert.equal(notes[5].finger,5);
});
test('bulk selection filters protected, unresolved and manual override keys',()=>{
 const notes=[note(60,0),note(62,.2),note(64,.4),note(65,.6)];
 notes[1].finger=2;notes[1].fingeringSource='musicxml';
 const a=aligned(notes);a.matches[3].suggestion.finger=null;
 const batch=pianoMotionProposeBatch(a,[0,1,2,3],{[notes[2].noteId??'user']: {finger:4,hand:'RH'}});
 // third note has no noteId, so the declared user override key does not apply
 assert.equal(batch.patches.length,2);
 assert.equal(batch.protectedCount,1);assert.equal(batch.unresolved,1);
 const original=structuredClone(notes);
 const done=pianoMotionCommitBatch(pianoMotionEmptyHistory(),batch);
 assert.equal(done.ok,true);assert.equal(done.count,2);
 const undone=pianoMotionTravelHistory(done.history,'undo');
 assert.deepEqual(notes,original);
 assert.equal(undone.ok,true);
});
test('all-or-nothing undo rejects edits after a manual intervention',()=>{
 const notes=[note(60,0),note(64,.2)],a=aligned(notes);
 const step=pianoMotionCommitBatch(pianoMotionEmptyHistory(),
  pianoMotionProposeBatch(a,[0,1],{}));
 assert.equal(step.ok,true);
 notes[1].finger=4;notes[1].fingeringSource='user';
 assert.equal(pianoMotionTravelHistory(step.history,'undo').reason,'STALE_REVIEW');
 assert.equal(notes[0].finger,1,'no half-undo');
 assert.equal(notes[1].finger,4);
});
test('invalid/duplicate/unknown selection is refused atomically',()=>{
 const n=[note(60,0)],a=aligned(n);
 for(const selection of [[-1],[1],[0,0],[1.5],Array(30001).fill(0)]){
  assert.equal(pianoMotionProposeBatch(a,selection,{}).reason,'INVALID_REVIEW_SELECTION');
 }
 assert.equal(n[0].finger,undefined);
});
test('preview window visits all 547 original note objects via fixed 24-note pages',()=>{
 const notes=Array.from({length:547},(_,i)=>note(60+i%12,i*.2)),a=aligned(notes);
 const displayed=[];
 for(let i=0;i<547;i+=24)displayed.push(...pianoMotionWindow(a,i,24));
 assert.equal(displayed.length,547);
 assert.deepEqual(displayed.map(e=>e.index),Array.from({length:547},(_,i)=>i));
 assert.ok(displayed.every(e=>e.note===notes[e.index]));
 assert.deepEqual(pianoMotionWindow(a,-1,24),[]);
 assert.deepEqual(pianoMotionWindow(a,0,100),[]);
});
test('bounded per-song Undo history stores 40 atomic batches maximum',()=>{
 const n=note(60,0),a=aligned([n]);let h=pianoMotionEmptyHistory();
 for(let i=0;i<51;i++){
  a.matches[0].suggestion.finger=i%2?1:2;
  const c=pianoMotionCommitBatch(h,pianoMotionProposeBatch(a,[0],{}));
  if(c.ok)h=c.history;
 }
 assert.equal(h.past.length,40);
 assert.equal(h.future.length,0);
});

test('LAUNCH-02 selection exactly matches safe writable proposals across pages',()=>{
 const notes=Array.from({length:30},(_,i)=>({...note(50+i,i*.2),noteId:'note-'+i}));
 notes[1].finger=2;notes[1].fingeringSource='musicxml';
 notes[2].finger=5;notes[2].fingeringSource='user';
 const alignment=aligned(notes),edits={'note-3':{hand:'RH',finger:3}};
 alignment.matches[4].suggestion.finger=null;
 const audit={ok:true,total:30,blocked:[5,6],issues:[]};
 const snapshot=JSON.stringify(notes);
 let summary=pianoMotionReviewSummary(alignment,edits,audit);
 assert.equal(summary.ok,true);
 assert.deepEqual(summary.eligibility.slice(0,8),[
  'eligible','protected','protected','protected','unresolved',
  'conflict','conflict','eligible'
 ]);
 assert.deepEqual(summary.counts,{eligible:24,protected:3,unresolved:1,
  conflict:2,applied:0,invalid:0});
 assert.equal(summary.eligibleIndices.includes(29),true,'last preview page remains included');
 const batch=pianoMotionProposeBatch(alignment,summary.eligibleIndices,edits,audit);
 assert.equal(batch.ok,true);assert.equal(batch.patches.length,24);
 assert.equal(JSON.stringify(notes),snapshot,'dry-run selection must not change score');
 const applied=pianoMotionCommitBatch(pianoMotionEmptyHistory(),batch);
 assert.equal(applied.ok,true);
 summary=pianoMotionReviewSummary(alignment,edits,audit);
 assert.equal(summary.counts.applied,24);
 assert.equal(summary.counts.eligible,0);
 assert.deepEqual(summary.eligibleIndices,[]);
 assert.equal(pianoMotionReviewEligibility(notes[29],alignment.matches[29].suggestion,29,edits,new Set(audit.blocked)),'applied');
 const undo=pianoMotionTravelHistory(applied.history,'undo');
 assert.equal(undo.ok,true);
 assert.equal(JSON.stringify(notes),snapshot,'Undo restores exact original note states');
 summary=pianoMotionReviewSummary(alignment,edits,audit);
 assert.equal(summary.counts.eligible,24,'Undo re-enables the formerly applied proposals');
 assert.equal(pianoMotionReviewSummary(alignment,edits,{ok:false,total:30,blocked:[]}).ok,false);
});
