import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerEditorGeometry,fingerEditorExtent} from '../src/core/finger-editor-geometry.mjs';
const notes=[{noteId:'xml:A:0:0:1',pitch:60,start:0,duration:1},
 {noteId:'xml:A:0:0:2',pitch:64,start:5,duration:1},
 {noteId:'xml:A:0:0:3',pitch:67,start:18,duration:2}];
const opts={viewWidth:620,scrollLeft:0,pxPerSecond:72,minPitch:58,maxPitch:69};
test('FG editor: scrollable entire score extent without full width canvas',()=>{
 assert.ok(fingerEditorExtent(notes,72)>620);
 const a=fingerEditorGeometry(notes,opts);
 assert.ok(a.height>=160);
 assert.ok(a.boxes.length<=2,'Far-offscreen notes are not drawn');
 assert.equal(a.boxes[0].n.noteId,notes[0].noteId);
 const b=fingerEditorGeometry(notes,{...opts,scrollLeft:1120});
 assert.ok(b.boxes.some(x=>x.n.noteId===notes[2].noteId));
 assert.ok(!b.boxes.some(x=>x.n.noteId===notes[0].noteId));
});
test('FG editor: pitch spacing is stable across time scrolling/zoom',()=>{
 const a=fingerEditorGeometry(notes,opts),b=fingerEditorGeometry(notes,{...opts,scrollLeft:280});
 const id=notes[1].noteId,first=a.boxes.find(x=>x.n.noteId===id),second=b.boxes.find(x=>x.n.noteId===id);
 assert.ok(first&&second);
 assert.equal(first.y,second.y);
 assert.ok(first.x>second.x);
});
test('FG editor: dense short notes retain clickable block size',()=>{
 const a=fingerEditorGeometry([{pitch:60,start:1,duration:.005,noteId:'xml:A:0:0:6'}],opts);
 assert.equal(a.boxes.length,1);
 assert.ok(a.boxes[0].w>=19);
});
