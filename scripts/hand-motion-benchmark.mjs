/** FG-03D1 stand-alone bounded, non-musical, non-production microbenchmark. */
import {performance} from 'node:perf_hooks';
import inspector from 'node:inspector';
import {planAnticipatoryHandMotion as plan} from '../src/core/hand-motion-feasibility.mjs';
const cases=Number(process.argv[2]||200000);
if(!Number.isInteger(cases)||cases<1000||cases>1000000)throw Error('Iterations must be 1,000–1,000,000');
// Timed loop excludes audio, browser, screenshots and profiler overhead.
const keys=[];for(let p=21;p<=108;p++){
 const x=(p-21)*16;keys.push({pitch:p,x,w:12,center:x+6});
}
const geometry={byPitch:new Map(keys.map(k=>[k.pitch,k])),whites:[{w:16}]};
const N=(pitch,finger,hand='RH')=>({pitch,finger,hand,noteId:'xml:'+hand+':'+pitch,
 source:'musicxml',verification:'source-author',duration:.06});
const group=(onset,notes)=>({onset,notes,totalNotes:notes.length,isNextUnfinished:true});
const base={hand:'RH',geometry,viewport:{left:0,right:2000},origin:group(0,[N(60,1)]),
 target:group(.8,[N(64,3)]),transport:{mode:'listen',now:.2,leadMs:750,
 speedPercent:100,playing:true,oppositeHandClear:true}};
const configs=[base,
 {...base,target:group(.8,[N(88,5)])},
 {...base,transport:{...base.transport,mode:'wait'}},
 {...base,origin:group(0,[{...N(60,1),duration:1.1}])},
 {...base,target:group(.8,[N(64,3),{...N(48,3,'LH'),verification:'generated'}])}];
const counts=Object.create(null);
for(let i=0;i<10000;i++)plan(configs[i%configs.length]);
if(globalThis.gc)globalThis.gc();
const before=process.memoryUsage().heapUsed,t0=performance.now();
for(let i=0;i<cases;i++){
 const r=plan(configs[i%configs.length]);
 const k=r.kind+':'+r.reason;counts[k]=(counts[k]||0)+1;
}
const elapsed=performance.now()-t0;
if(globalThis.gc)globalThis.gc();
const after=process.memoryUsage().heapUsed;
const sampling=new inspector.Session();sampling.connect();
const command=(method,params={})=>new Promise((ok,fail)=>sampling.post(method,params,(e,r)=>e?fail(e):ok(r)));
await command('HeapProfiler.startSampling',{samplingInterval:512});
const sampleIterations=20000;
for(let i=0;i<sampleIterations;i++)plan(configs[i%configs.length]);
const profile=(await command('HeapProfiler.stopSampling')).profile;sampling.disconnect();
let sampledBytes=0;
const walk=node=>{sampledBytes+=node.selfSize;for(const c of node.children||[])walk(c)};
walk(profile.head);
console.log(JSON.stringify({stage:'FG-03D1',node:process.version,iterations:cases,
 elapsedMs:+elapsed.toFixed(2),averageMicroseconds:+(elapsed*1000/cases).toFixed(3),
 retainedHeapDeltaBytes:after-before,statisticalSampledAllocatedBytes:sampledBytes,
 sampleIterations,samplingIntervalBytes:512,gcAvailable:!!globalThis.gc,
 context:'pure JS only; not DOM, canvas, screenshot or pianist QA',classification:counts},null,2));
