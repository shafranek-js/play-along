import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planNoteLanes} from '../src/audio/index.js';

function* permutations(values){
 if(values.length===0){yield [];return;}
 for(let i=0;i<values.length;i++)for(const rest of permutations(values.filter((_,j)=>i!==j)))yield [values[i],...rest];
}

test('file lanes are minimal and preserve every FIFO release across all six-note release permutations',()=>{
 let checked=0;
 for(const offOrder of permutations([0,1,2,3,4,5])){
  const rank=new Map(offOrder.map((id,i)=>[id,i]));
  // Independent lower bound: longest decreasing subsequence of release ranks.
  const lengths=[];
  for(let i=0;i<6;i++){
   lengths[i]=1;
   for(let j=0;j<i;j++)if(rank.get(j)>rank.get(i))lengths[i]=Math.max(lengths[i],lengths[j]+1);
  }
  const minimum=Math.max(...lengths);
  const events=[
   ...Array.from({length:6},(_,id)=>({type:'noteOn',time:id*.01,sequence:id,channel:0,pitch:60,velocity:90,noteId:'n'+id})),
   ...offOrder.map((id,i)=>({type:'noteOff',time:1+i*.01,sequence:6+i,channel:0,pitch:60,noteId:'n'+id})),
  ];
  if(minimum>4){
   assert.throws(()=>planNoteLanes(events),e=>e.code==='NOTE_LANE_CAPACITY_EXCEEDED'&&e.required===minimum);
  }else{
   const plan=planNoteLanes(events);
   assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['0:60'],minimum);
   const previousByLane=new Map();
   for(const assignment of plan.assignments){
    const id=Number(assignment.noteId.slice(1));
    const previous=previousByLane.get(assignment.lane);
    if(previous!==undefined)assert.ok(rank.get(previous)<rank.get(id),'lane must retain onset order at release');
    previousByLane.set(assignment.lane,id);
   }
  }
  checked++;
 }
 assert.equal(checked,720);
});

test('equal-time releases use source sequence and explicit pitched channel ten stays melodic',()=>{
 const events=[
  {type:'programChange',time:0,sequence:0,channel:9,program:0,isDrum:false},
  {type:'noteOn',time:0,sequence:1,channel:9,pitch:60,velocity:50,noteId:'long'},
  {type:'noteOn',time:.1,sequence:2,channel:9,pitch:60,velocity:110,noteId:'short'},
  {type:'noteOff',time:.5,sequence:3,channel:9,pitch:60,noteId:'short'},
  {type:'noteOff',time:.5,sequence:4,channel:9,pitch:60,noteId:'long'},
 ];
 const plan=planNoteLanes(events);
 assert.equal(plan.diagnostics.maxRequiredLanesByChannelPitch['9:60'],2);
 assert.notEqual(plan.assignments[0].lane,plan.assignments[1].lane);
});
