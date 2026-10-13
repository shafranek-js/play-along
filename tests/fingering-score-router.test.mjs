import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeHybridScoreFingering as solve} from '../src/core/fingering-score-router.mjs';
import {auditFingeringAssignments as audit} from '../src/core/fingering-audit.mjs';

const note=(pitch,start,duration,finger=null,hand=null,noteId=null)=>({
 pitch,start,duration,...(finger==null?{}:{finger}),
 ...(hand?{hand}:{}),...(noteId?{noteId}:{})
});
const both=(RH,LH=[],opts={})=>solve({RH,LH},opts);
const digits=x=>x.map(n=>n.finger);
const ids=x=>x.map(n=>n.noteId);
test('FG-02I mixed-direction monophony routes to contextual FG-02H, not original rigid FG-02B',()=>{
 const notes=[60,62,64,62,60,62].map((p,i)=>note(p,i*.25,.2,null,'RH','m'+i));
 const r=both(notes);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.methods.RH,['fg02h-contextual']);
 assert.deepEqual(ids(r.hands.RH),ids(notes));
 assert.equal(audit(notes,r.hands.RH).valid,true);
});
test('FG-02I unannotated RH triad and LH triad remain separate hands',()=>{
 const RH=[60,64,67].map((p,i)=>note(p,0,.42,null,'RH','r'+i));
 const LH=[48,52,55].map((p,i)=>note(p,0,.42,null,'LH','l'+i));
 const r=both(RH,LH);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.methods,{RH:['fg02b-polyphonic'],LH:['fg02b-polyphonic']});
 assert.deepEqual(digits(r.hands.RH),[1,3,5]);
 assert.deepEqual(digits(r.hands.LH),[5,3,1]);
});
test('FG-02I held melody with second entry must not reuse active finger',()=>{
 const RH=[note(60,0,1.4,null,'RH','held'),
  note(64,.45,.32,null,'RH','entry')];
 const r=both(RH);assert.equal(r.ok,true,JSON.stringify(r));
 assert.notEqual(r.hands.RH[0].finger,r.hands.RH[1].finger);
 assert.equal(audit(RH,r.hands.RH).valid,true);
});
test('FG-02I full author annotations preserve rapid same finger reposition after a RELEASE',()=>{
 const RH=[note(60,0,.18,1,'RH','p0'),note(62,.2,.18,1,'RH','p1'),
  note(64,.4,.18,2,'RH','p2')];
 const r=both(RH);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(digits(r.hands.RH),[1,1,2]);
 assert.deepEqual(r.hands.RH.map(n=>n.source),Array(3).fill('anchor'));
 assert.ok(r.diagnostics.warnings.RH.some(w=>w.code==='AUTHOR_FAST_SAME_FINGER_UNVERIFIED'));
 assert.deepEqual(r.methods.RH,['author-validated']);
});
test('FG-02I fully author annotated chord is preserved without heuristic rewriting',()=>{
 const RH=[note(60,0,.4,1,'RH','c'),note(64,0,.4,3,'RH','e'),
  note(67,0,.4,5,'RH','g')];
 const r=both(RH);assert.equal(r.ok,true);
 assert.deepEqual(digits(r.hands.RH),[1,3,5]);
 assert.deepEqual(r.methods.RH,['author-validated']);
});
test('FG-02I invalid simultaneous author fingers fail with full audit evidence',()=>{
 const RH=[note(60,0,.5,1,'RH','c'),note(64,0,.5,1,'RH','e')];
 const r=both(RH);
 assert.equal(r.reason,'AUTHOR_PHYSICAL_CONFLICT');
 assert.ok(r.violations.some(x=>x.code==='FINGER_REUSED_WHILE_HELD'));
 assert.equal(r.hand,'RH');
});
test('FG-02I author same-key unison overlapping voices can share one physical finger',()=>{
 const RH=[note(60,0,.7,1,'RH','voice1'),note(60,0,.65,1,'RH','voice2'),
  note(64,0,.4,3,'RH','voice3')];
 const r=both(RH);assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(digits(r.hands.RH),[1,1,3]);
});
test('FG-02I unison with two conflicting author fingers must be refused',()=>{
 const RH=[note(60,0,.7,1,'RH','v1'),note(60,0,.7,2,'RH','v2')];
 const r=both(RH);assert.equal(r.reason,'AUTHOR_PHYSICAL_CONFLICT');
 assert.ok(r.violations.some(x=>x.code==='SAME_KEY_UNISON_SPLIT'));
});
test('FG-02I a part with monophonic lead, chord island, mono tail gives 3 segments',()=>{
 const RH=[
  note(60,0,.15,null,'RH','lead0'),note(62,.2,.15,null,'RH','lead1'),
  note(64,.5,.3,null,'RH','ch0'),note(67,.5,.3,null,'RH','ch1'),
  note(69,.9,.2,null,'RH','tail0'),note(67,1.15,.2,null,'RH','tail1')
 ];
 const r=both(RH);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.methods.RH,['fg02h-contextual','fg02b-polyphonic','fg02h-contextual']);
 assert.equal(r.hands.RH.length,6);
 assert.equal(audit(RH,r.hands.RH).valid,true);
 assert.equal(r.diagnostics.boundaryWarnings,2);
 assert.equal(r.diagnostics.warnings.RH.filter(x=>x.code==='SEGMENT_BOUNDARY_HAND_CONTINUITY_UNVERIFIED').length,2);
});
test('FG-02I partially authored polyphonic onset cannot overwrite written fingers',()=>{
 const RH=[note(60,0,.4,1,'RH','c'),note(64,0,.4,null,'RH','e'),
  note(67,0,.4,5,'RH','g')];
 const r=both(RH);assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.hands.RH[0].finger,1);assert.equal(r.hands.RH[2].finger,5);
 assert.equal(r.hands.RH[0].source,'anchor');
 assert.equal(r.hands.RH[1].source,'proposed-research');
});
test('FG-02I duplicate note IDs do not alias distinct score events by key',()=>{
 const RH=[note(60,0,.3,null,'RH','same-id'),note(64,0,.3,null,'RH','same-id')];
 const r=both(RH);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(ids(r.hands.RH),['same-id','same-id']);
 assert.notEqual(r.hands.RH[0].finger,r.hands.RH[1].finger);
});
test('FG-02I explicit RH/LH ownership cannot be guessed or silently corrected',()=>{
 assert.equal(both([note(60,0,.2,null,'LH')]).reason,'HAND_CONFLICT');
 const r=both([note(60,0,.2,null,null,'unknown')]);
 assert.equal(r.ok,true); // Caller explicit RH part is the ownership, not register.
 assert.equal(r.hands.RH[0].hand,'RH');
});
test('FG-02I both hands cannot independently hold same physical key',()=>{
 const r=both([note(60,0,.5,null,'RH','right')],
  [note(60,.1,.4,null,'LH','left')]);
 assert.equal(r.reason,'CROSS_HAND_SAME_KEY_OVERLAP');
 assert.equal(r.rhNoteId,'right');assert.equal(r.lhNoteId,'left');
});
test('FG-02I ambiguous same-hand reattack while held never fabricates fingering',()=>{
 const r=both([note(60,0,.8),note(60,.3,.4)]);
 assert.equal(r.ok,false);
 assert.ok(['HELD_KEY_REARTICULATION_UNSUPPORTED','AUTHOR_PHYSICAL_CONFLICT'].includes(r.reason));
});
test('FG-02I >5 simultaneous keys are rejected rather than allocated extra fingers',()=>{
 const RH=[60,62,64,65,67,69].map(p=>note(p,0,.5,null,'RH'));
 const r=both(RH);assert.equal(r.reason,'TOO_MANY_SIMULTANEOUS_KEYS');
});
test('FG-02I partial model inability produces explicit segment failure, not inferred fallback',()=>{
 const RH=[note(48,0,2,null,'RH','bass'),note(64,.4,.5,null,'RH','high')];
 const r=both(RH);assert.equal(r.ok,false);
 assert.ok(r.segmentKind==='polyphonic'&&r.segmentNoteIds.length===2);
});
test('FG-02I explicit author LH annotations accepted when physically feasible',()=>{
 const LH=[note(48,0,.3,5,'LH','l0'),note(52,0,.3,3,'LH','l1'),
  note(55,0,.3,1,'LH','l2')];
 const r=both([],LH);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(digits(r.hands.LH),[5,3,1]);assert.deepEqual(r.hands.RH,[]);
});
test('FG-02I unusual hand-size or beam settings fail closed',()=>{
 assert.equal(both([note(60,0,.2)],[],{handSize:'XLARGE'}).reason,'INVALID_HAND_SIZE');
 assert.equal(both([note(60,0,.2)],[],{beamWidth:0}).reason,'INVALID_BEAM_WIDTH');
 assert.equal(both([note(60,0,.2)],[],{beamWidth:129}).reason,'INVALID_BEAM_WIDTH');
});
test('FG-02I event validity and anchors are strict',()=>{
 assert.equal(both([note(140,0,.2)]).reason,'INVALID_NOTE');
 assert.equal(both([note(60,-1,.2)]).reason,'INVALID_NOTE');
 assert.equal(both([note(60,0,.2,0)]).reason,'INVALID_ANCHOR');
 assert.equal(both([]).reason,'HAND_PARTS_REQUIRED');
});
test('FG-02I note input order and timestamps are unmodified through routing',()=>{
 const RH=[note(69,1.15,.2,null,'RH','late'),note(64,.5,.25,null,'RH','ch1'),
  note(60,0,.2,null,'RH','early'),note(67,.5,.25,null,'RH','ch2')];
 const LH=[note(48,0,.2,null,'LH','low')];
 const orig=structuredClone({RH,LH});
 const a=both(RH,LH),b=both(RH,LH);
 assert.deepEqual({RH,LH},orig);assert.deepEqual(a,b);
 assert.equal(a.ok,true,JSON.stringify(a));
 assert.deepEqual(a.hands.RH.map(x=>x.noteId),RH.map(x=>x.noteId));
 assert.deepEqual(a.hands.RH.map(x=>x.start),RH.map(x=>x.start));
 assert.deepEqual(a.hands.LH.map(x=>x.duration),LH.map(x=>x.duration));
});
test('FG-02I a silence separates phrases and emits unverified continuity warning',()=>{
 const RH=[note(60,0,.2),note(62,.25,.2),note(64,2,.2),note(65,2.25,.2)];
 const r=both(RH);assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.segments.RH.length,2);assert.equal(r.diagnostics.boundaryWarnings,1);
});
test('FG-02I unannotated proposals are marked research only, not presented as certainty',()=>{
 const r=both([note(60,0,.2),note(62,.25,.2)]);
 assert.equal(r.ok,true);
 assert.equal(r.productionEligible,false);assert.equal(r.expertValidated,false);
 assert.equal(r.confidence,null);
 assert.ok(r.hands.RH.every(x=>x.source==='proposed-research'));
});

// FG-04C2 actual-router comparison controls; no simulated PianoMotion engine execution.
import './fingering-engine-comparison.test.mjs';

// FG-04C4: bundled offline Worker research engine integrity suite.
import './browser-fingering-research.test.mjs';
