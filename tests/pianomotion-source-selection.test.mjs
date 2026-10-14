import test from 'node:test';
import assert from 'node:assert/strict';
import {
 pianoMotionSourcePlan,pianoMotionCanRetry,makePianoMotionMidiFromSong,
 pianoMotionAlignSuggestions,pianoMotionPlayableDiagnostic
} from '../src/core/pianomotion-song-to-midi.mjs';

const note=(pitch,start,duration,more={})=>({pitch,start,duration,...more});
const guitar={name:'Acoustic Guitar',program:24,notes:[note(64,0,.4),note(67,.45,.4)]};
const piano={name:'Piano',program:0,notes:[note(60,0,.4),note(62,.45,.4)]};

test('foreign instrument automatically selects one played piano-compatible track, not all instruments',()=>{
 const song={tracks:[{name:'Drums',notes:[note(36,0,.4,{channel:9})]},guitar,
  {name:'Flute',program:73,notes:[note(75,0,.4)]}]};
 const p=pianoMotionSourcePlan(song,1);
 assert.equal(p.mode,'derived');
 assert.deepEqual(p.trackIndices,[1]);
 const d=makePianoMotionMidiFromSong(song,{trackIndices:p.trackIndices});
 assert.equal(d.ok,true);
 assert.deepEqual(d.sourceNotes.map(n=>n.pitch),[64,67]);
 assert.deepEqual(d.sourceNotes.map(n=>n.trackIndex),[1,1]);
 assert.equal(d.midiBytes.slice(0,4).toString(),'77,84,104,100');
});

test('explicit piano multi-track remains direct, raw source unmodified',()=>{
 const song={tracks:[piano,{name:'Left Piano',program:0,notes:[note(48,0,.4)]}]};
 const p=pianoMotionSourcePlan(song,0);
 assert.equal(p.mode,'original');
 assert.deepEqual(p.trackIndices,[0,1]);
});
test('drums are excluded without dropping melody notes',()=>{
 const song={tracks:[{name:'Piano',notes:[note(60,0,.4),note(36,.3,.2,{isDrum:true})]}]};
 const p=pianoMotionSourcePlan(song,0);
 assert.equal(p.mode,'derived');
 const d=makePianoMotionMidiFromSong(song,{trackIndices:p.trackIndices});
 assert.equal(d.ok,true);
 assert.deepEqual(d.sourceNotes.map(n=>n.pitch),[60]);
});
test('runtime/network/worker errors never retry by rearranging the MIDI',()=>{
 for(const reason of ['PIANOMOTION_RUNTIME_FAILED','LOCAL_RUNTIME_ASSET_MISSING',
 'ASSET_SHA_MISMATCH','PYODIDE_VERSION_MISMATCH','PIANOMOTION_NOTE_RESULT_INVALID',
 'TypeError: Failed to fetch'])assert.equal(pianoMotionCanRetry(reason),false,reason);
 assert.equal(pianoMotionCanRetry('ORIGINAL_MIDI_PROVENANCE_UNVERIFIED'),true);
});
test('same-pitch overlapping MIDI must not be silently merged on one channel',()=>{
 const song={tracks:[{name:'Guitar',notes:[note(60,0,1),note(60,.5,1)]}]};
 assert.equal(makePianoMotionMidiFromSong(song).reason,'OVERLAPPING_UNISON_REQUIRES_REVIEW');
});
test('strict pitch/onset/end alignment maps each repeated note exactly once',()=>{
 const song={tracks:[{notes:[note(60,0,.1),note(60,.2,.1),note(64,0,.3)]}]};
 const suggestions=[
  {pitch:60,start:.2,end:.3,hand:'RH',finger:2},
  {pitch:64,start:0,end:.3,hand:'RH',finger:5},
  {pitch:60,start:0,end:.1,hand:'RH',finger:1}
 ];
 const match=pianoMotionAlignSuggestions(song,suggestions,{tolerance:.005});
 assert.equal(match.ok,true);
 assert.deepEqual(match.matches.map(e=>e.ordinal),[1,2,0]);
});
test('prohibit ambiguous unisons, extra notes and distant timeline matches',()=>{
 const identical={tracks:[{notes:[note(60,0,.4),note(60,0,.4)]}]};
 const suggestions=Array.from({length:2},()=>({pitch:60,start:0,end:.4,hand:'RH',finger:1}));
 assert.equal(pianoMotionAlignSuggestions(identical,suggestions).reason,'AMBIGUOUS_NOTE_MAPPING');
 assert.equal(pianoMotionAlignSuggestions({tracks:[piano]},[suggestions[0]]).reason,'NOTE_COUNT_MISMATCH');
 const wrong=[{pitch:60,start:.34,end:.74,hand:'RH',finger:1},
              {pitch:62,start:.45,end:.85,hand:'RH',finger:2}];
 assert.equal(pianoMotionAlignSuggestions({tracks:[piano]},wrong).reason,'NOTE_MAPPING_NOT_FOUND');
});
test('more than ten concurrent notes warns, without modifying the source song',()=>{
 const song={tracks:[{notes:Array.from({length:11},(_,i)=>note(50+i,0,1))}]};
 const snapshot=JSON.stringify(song);
 assert.deepEqual(pianoMotionPlayableDiagnostic(song),{maxHeld:11,possiblyUnplayable:true});
 assert.equal(JSON.stringify(song),snapshot);
});

test('SMF type 0 Program Change identifies guitar even when track is called Track 1',()=>{
 const song={tracks:[{name:'Track 1',notes:[note(60,0,.4,{channel:0}),
  note(64,.5,.4,{channel:0}),note(80,.2,.4,{channel:1})]}],
  audioEvents:[{type:'programChange',track:0,channel:0,program:24},
               {type:'programChange',track:0,channel:1,program:73}]};
 const plan=pianoMotionSourcePlan(song,0);
 assert.equal(plan.mode,'derived');
 assert.equal(plan.channel,0);
 const midi=makePianoMotionMidiFromSong(song,{trackIndices:plan.trackIndices,channel:plan.channel});
 assert.equal(midi.ok,true);
 assert.deepEqual(midi.sourceNotes.map(n=>n.pitch),[60,64]);
 const suggestions=[{pitch:60,start:0,end:.4,hand:'RH',finger:1},
                    {pitch:64,start:.5,end:.9,hand:'RH',finger:3}];
 assert.equal(pianoMotionAlignSuggestions(song,suggestions,{
  trackIndices:plan.trackIndices,channel:plan.channel}).ok,true);
});
