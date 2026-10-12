import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePIGFingering} from '../src/core/fingering-repertoire-pig.mjs';
import {compareContextualToSource} from '../scripts/fingering-contextual-benchmark.mjs';
const line=(id,start,pitch,finger)=>[id,start.toFixed(3),(start+.18).toFixed(3),
 pitch,80,0,0,finger].join(' ');
const input=(pitches,fingers,hand='RH')=>
 parsePIGFingering('//Version: PIG/v1.0.0\n'+pitches.map((p,i)=>
  line(i,i*.20,p,hand==='RH'?fingers[i]:-fingers[i])).join('\n')+'\n');
test('FG-02H comparison separates unannotated notes from author-pinned notes',()=>{
 const parsed=input(['C4','D4','E4','D4','C4','C4'],[1,1,2,3,1,1]);
 const a=compareContextualToSource(parsed,{id:'synthetic',label:'test'});
 assert.equal(a.sourceNotes,6);
 assert.equal(a.fg02h.sourceNotes,6);
 assert.equal(a.fg02hPinned.attempted,6);
 assert.equal(a.fg02hPinned.matched,6);
 assert.equal(a.fg02hPinned.rejectedNotes,0);
 assert.equal(a.fg02hPinned.anchorViolations,0);
 assert.ok(a.fg02hPinned.unverifiedAnchorSlides>=1);
});
test('FG-02H source paper accepted denominator includes rejected and excluded',()=>{
 const parsed=input(['C4','E4','G4'],[1,3,5]);
 const a=compareContextualToSource(parsed,{id:'test',label:'test'});
 assert.equal(a.fg02h.sourceNotes,3);
 assert.equal(a.fg02h.attempted+a.fg02h.rejectedNotes,3);
 assert.equal(a.fg02hPinned.sourceNotes,3);
});
test('FG-02H two hands with same channel are evaluated separately without guessing',()=>{
 const parsed=parsePIGFingering('//Version: PIG/v1.0.0\n'+[
  line(0,0,'C4',-5),line(1,0,'G4',1),
  line(2,.2,'D4',-4),line(3,.2,'A4',2),
  line(4,.4,'E4',-3),line(5,.4,'B4',3)
 ].join('\n')+'\n');
 const c=compareContextualToSource(parsed,{id:'both',label:'test'});
 assert.equal(c.left,3);assert.equal(c.right,3);
 assert.equal(c.fg02h.sourceNotes,6);
 assert.equal(c.fg02hPinned.attempted,6);
 assert.equal(c.candidateByHand.length,2);
});
