import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {test} from 'node:test';
import {createPlaybackAudioEngine, EngineError} from '../src/audio/index.js';

// These tests exercise the loader's fetch, validation, cache, concurrency, and
// lifecycle boundaries with a controlled processor port. Real parsing and PCM
// rendering are covered separately by audio-browser.real.test.mjs.
const manifestUrl='http://play-along.test/play-along/assets/audio/soundfont-manifest.json';
const validBytes=makeBank();
const validHash=hash(validBytes);

function makeBank(){
 const bytes=new Uint8Array(12);
 bytes.set(Buffer.from('RIFF'),0);
 bytes[4]=4;
 bytes.set(Buffer.from('sfbk'),8);
 return bytes;
}

function hash(bytes){return createHash('sha256').update(bytes).digest('hex');}
function asArrayBuffer(bytes){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
async function bounded(promise,ms,label){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}
 finally{clearTimeout(timer);}
}
function descriptor(id='fixture',overrides={}){
 return {id,name:id,format:'SF2',filename:id+'.sf2',url:'soundfonts/'+id+'.sf2',bytes:validBytes.byteLength,sha256:validHash,source:'unit fixture',license:'unit fixture',noticeFiles:[],...overrides};
}
function response(bytes,status=200){return new Response(asArrayBuffer(bytes),{status});}
function catalog(...banks){return {schemaVersion:1,banks};}

class Port{
 constructor(){this.onmessage=null;this.sent=[];this.posts=[];this.closed=false;}
 postMessage(message,transfer=[]){
  const incoming=transfer.length?structuredClone(message,{transfer}):message;
  this.sent.push(message);
  this.posts.push({type:message.type,transferCount:transfer.length,bankId:message.bankId});
  queueMicrotask(()=>{
   if(this.closed)return;
   if(incoming.type==='dispose'&&FakeAudioWorkletNode.disposeHandler?.(this,incoming))return;
    if(message.type==='prepare-patches'&&FakeAudioWorkletNode.prepareHandler){
     FakeAudioWorkletNode.prepareHandler(this,incoming);
     return;
    }
   let reply;
   if(incoming.type==='initialize')reply={type:'ready',requestId:incoming.requestId};
   else if(incoming.type==='load-bank')reply={type:'loaded',requestId:incoming.requestId,bankId:incoming.bankId,format:incoming.format,bytes:incoming.bytes.byteLength,parseMs:0.25,presetList:[]};
   else if(incoming.type==='prepare-patches')reply={type:'prepared',requestId:incoming.requestId,elapsedMs:0.1,uniqueSampleCount:1,reusedSampleCount:0,patches:[]};
   else if(incoming.type==='set-effects')reply={type:'effects-set',requestId:incoming.requestId};
   else if(incoming.type==='cancel-group')reply={type:'cancelled',requestId:incoming.requestId,group:incoming.group,epoch:incoming.epoch,removedEvents:0,activeNotes:0};
   else if(incoming.type==='dispose')reply={type:'disposed',requestId:incoming.requestId};
   if(reply)this.onmessage?.({data:reply});
  });
 }
 close(){this.closed=true;}
}

class FakeAudioWorkletNode{
 constructor(context,name,options){
  this.context=context;this.name=name;this.options=options;this.port=new Port();this.onprocessorerror=null;this.connected=[];this.disconnected=false;
  FakeAudioWorkletNode.instances.push(this);
 }
 connect(node){this.connected.push(node);return node;}
 disconnect(){this.disconnected=true;}
}
FakeAudioWorkletNode.instances=[];
FakeAudioWorkletNode.prepareHandler=null;
FakeAudioWorkletNode.disposeHandler=null;

function fakeContext(){
 const modules=[];
 let gainCreations=0;
 return {
  currentTime:0,
  sampleRate:48000,
  destination:{},
  audioWorklet:{async addModule(url){modules.push(String(url));}},
  modules,
  get gainCreations(){return gainCreations;},
  createGain(){gainCreations+=1;return {gain:{value:0,setTargetAtTime(value){this.value=value;}},connections:[],connect(node){this.connections.push(node);return node;},disconnect(){this.disconnected=true;}};},
 };
}

async function createEngine({banks=[descriptor()],fetchImpl=async()=>response(validBytes),cacheStorage=null,context=fakeContext(),...options}={}){
 return {context,engine:await createPlaybackAudioEngine(context,{
  catalog:catalog(...banks),catalogUrl:manifestUrl,fetchImpl,cacheStorage,cryptoImpl:webcrypto,
  ...options,
 })};
}

test('audio loader fallback, integrity, cache keys, state separation, and repeat preparation',async t=>{
 const original=globalThis.AudioWorkletNode;
 FakeAudioWorkletNode.instances=[];
 globalThis.AudioWorkletNode=FakeAudioWorkletNode;
 try{
  await t.test('supplied bank buffers are copied by default and transferred only with explicit ownership',async()=>{
   const defaultCopy=asArrayBuffer(validBytes);
   const defaultHash=hash(new Uint8Array(defaultCopy));
   const copyCase=await createEngine({cacheStorage:null});
   const copyPort=FakeAudioWorkletNode.instances.at(-1).port;
   const copiedLoad=await copyCase.engine.loadBank('fixture',{bytes:defaultCopy});
   assert.equal(copiedLoad.bytes,validBytes.byteLength,'the processor must receive the complete supplied fixture');
   assert.equal(defaultCopy.byteLength,validBytes.byteLength,'default loading must preserve caller buffer ownership');
   assert.equal(hash(new Uint8Array(defaultCopy)),defaultHash,'default loading must preserve every caller buffer byte');
   assert.deepEqual(copyPort.posts.filter(post=>post.type==='load-bank').map(post=>post.transferCount),[1],
    'the engine transfers its private clone to the processor while keeping the caller buffer intact');
   await copyCase.engine.dispose();

   const transferredInput=asArrayBuffer(validBytes);
   const transferCase=await createEngine({cacheStorage:null});
   const transferPort=FakeAudioWorkletNode.instances.at(-1).port;
   const transferredLoad=await transferCase.engine.loadBank('fixture',{bytes:transferredInput,transferOwnership:true});
   assert.equal(transferredInput.byteLength,0,'opt-in ownership transfer must detach the caller buffer after posting');
   assert.equal(transferredLoad.bytes,validBytes.byteLength,'the processor must receive the transferred bytes intact');
   assert.deepEqual(transferPort.posts.filter(post=>post.type==='load-bank').map(post=>post.transferCount),[1],
    'explicit ownership transfer must post exactly one transferred bank payload');
   await transferCase.engine.dispose();

   const invalidCase=await createEngine({cacheStorage:null});
   const invalidPort=FakeAudioWorkletNode.instances.at(-1).port;
   assert.throws(()=>invalidCase.engine.loadBank('fixture',{bytes:new Uint8Array(validBytes)}),TypeError,
    'non-ArrayBuffer inputs must be rejected before posting');
   assert.equal(invalidPort.posts.filter(post=>post.type==='load-bank').length,0,
    'invalid caller buffers must never reach the worklet');
   await invalidCase.engine.dispose();
  });

  await t.test('shares one engine initialization and refetches corrupt cache despite quota failure',async()=>{
   const context=fakeContext();
   const cacheCalls={open:0,match:[],deleted:[],put:[]};
   const cache={
    async match(key){cacheCalls.match.push(key.url);return response(Uint8Array.from([1,2,3]));},
    async delete(key){cacheCalls.deleted.push(key.url);return true;},
    async put(key){cacheCalls.put.push(key.url);throw new DOMException('storage full','QuotaExceededError');},
   };
   const cacheStorage={async open(){cacheCalls.open+=1;return cache;}};
   let fetchCount=0;
   const fetchImpl=async url=>{fetchCount+=1;assert.match(url,/fixture\.sf2$/);return response(validBytes);};
   const first=createPlaybackAudioEngine(context,{catalog:catalog(descriptor()),catalogUrl:manifestUrl,fetchImpl,cacheStorage,cryptoImpl:webcrypto});
   const joined=createPlaybackAudioEngine(context,{catalog:catalog(descriptor()),catalogUrl:manifestUrl,fetchImpl,cacheStorage,cryptoImpl:webcrypto});
   assert.strictEqual(joined,first,'repeated create on one AudioContext must share initialization promise');
   const engine=await first;
   assert.equal(context.modules.length,1);
   assert.equal(FakeAudioWorkletNode.instances.at(-1).name,'sf01-synth');
   assert.equal(engine.getState().engineReady,true);
   assert.equal(engine.getState().bankIndexed,false);
   assert.equal(FakeAudioWorkletNode.instances.at(-1).port.sent.filter(message=>message.type==='initialize').length,1,
    'one AudioContext must send one initialization handshake');

   const indexed=await engine.loadBank('fixture');
   assert.equal(indexed.id,'fixture');
   assert.equal(engine.getState().bankIndexed,true);
   assert.equal(engine.getState().preparedPatches.length,0,'indexing does not imply prepared samples');
   assert.equal(fetchCount,1,'corrupt cache entry should fall back to one network fetch');
   assert.equal(cacheCalls.open,1);
   assert.equal(cacheCalls.match.length,1);
   assert.equal(cacheCalls.deleted.length,1,'corrupt cache record should be deleted before refetch');
   assert.match(cacheCalls.match[0],/__sf01_sha256=/,'cache key must include the pinned content hash');
   assert.equal(engine.getMetrics().cache.corruptions,1);
   assert.ok(engine.getMetrics().cache.fallbacks>=1,'quota error should be recorded as cache fallback');
   assert.equal(engine.getMetrics().bank.cacheHit,false);
   assert.ok(Number.isFinite(engine.getMetrics().bank.integrityMs)&&engine.getMetrics().bank.integrityMs>=0,
    'successful bank diagnostics must preserve integrity-validation duration');

   const request=[{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:90}]}];
   const firstPrep=await engine.preparePatches(request);
   const state=engine.getState();
   const secondPrep=await engine.preparePatches(request);
   assert.equal(firstPrep.preparationPass,'first-request');
   assert.equal(secondPrep.preparationPass,'repeat-request');
   assert.equal(state.lifecycle,'ready');
   assert.equal(state.preparedPatches.length,1);
   assert.equal(engine.getMetrics().preparations.length,2);
   await engine.dispose();
   assert.equal(engine.getState().lifecycle,'disposed');
   await assert.rejects(engine.loadBank('fixture'),error=>error instanceof EngineError&&error.code==='ENGINE_DISPOSED');
  });

  await t.test('storage security failure falls back to a verified network load',async()=>{
   const cacheStorage={async open(){throw new DOMException('blocked in private mode','SecurityError');}};
   let fetchCount=0;
   const {engine}=await createEngine({cacheStorage,fetchImpl:async()=>{fetchCount+=1;return response(validBytes);}});
   await engine.loadBank('fixture');
   assert.equal(fetchCount,1);
   assert.equal(engine.getMetrics().bank.sha256,validHash);
   assert.equal(engine.getMetrics().cache.fallbacks,1);
   assert.match(engine.getMetrics().cache.lastError,/private mode/);
   await engine.dispose();
  });

  await t.test('bad size, magic, hash, network, and HTTP responses reject before synth parsing',async()=>{
   const cases=[
    {name:'size',bytes:validBytes,bank:descriptor('size',{bytes:validBytes.length+1}),code:'BANK_SIZE'},
    {name:'magic',bytes:Uint8Array.from([1,2,3,4,5,6,7,8,9,10,11,12]),bank:descriptor('magic'),code:'BANK_MAGIC'},
    {name:'hash',bytes:validBytes,bank:descriptor('hash',{sha256:'0'.repeat(64)}),code:'BANK_HASH'},
   ];
   for(const item of cases){
    const {engine}=await createEngine({banks:[item.bank],fetchImpl:async()=>response(item.bytes)});
    await assert.rejects(engine.loadBank(item.bank.id),error=>error instanceof EngineError&&error.code===item.code,item.name);
    assert.equal(FakeAudioWorkletNode.instances.at(-1).port.sent.filter(message=>message.type==='load-bank').length,0,
     `${item.name} validation must precede worklet parse`);
    await engine.dispose();
   }
   const network=await createEngine({cacheStorage:null,fetchImpl:async()=>{throw new TypeError('offline fixture');}});
   await assert.rejects(network.engine.loadBank('fixture'),error=>error.code==='BANK_NETWORK');
   await network.engine.dispose();
   const httpFailure=await createEngine({cacheStorage:null,fetchImpl:async()=>new Response('missing',{status:404})});
   await assert.rejects(httpFailure.engine.loadBank('fixture'),error=>error.code==='BANK_HTTP');
   await httpFailure.engine.dispose();
  });

  await t.test('bad network bytes are never written into cache and encoded traversal is rejected',async()=>{
   const writes=[];
   const cache={async match(){return undefined;},async delete(){return true;},async put(key){writes.push(key.url);}};
   const cacheStorage={async open(){return cache;}};
   const badHash=descriptor('bad-network',{sha256:'0'.repeat(64)});
   const bad=await createEngine({banks:[badHash],cacheStorage,fetchImpl:async()=>response(validBytes)});
   await assert.rejects(bad.engine.loadBank(badHash.id),error=>error.code==='BANK_HASH');
   assert.equal(writes.length,0,'integrity failure must not poison the shared cache');
   await bad.engine.dispose();

   const escaped=descriptor('escaped',{url:'soundfonts/%2e%2e/%2e%2e/app.js'});
   let fetchCount=0;
   const traversal=await createEngine({banks:[escaped],cacheStorage:null,fetchImpl:async()=>{fetchCount+=1;return response(validBytes);}});
   await assert.rejects(traversal.engine.loadBank('escaped'),error=>error.code==='CATALOG_MANIFEST');
   assert.equal(fetchCount,0,'encoded path traversal must be rejected before network access');
   await traversal.engine.dispose();
  });

  await t.test('invalid graph options fail before worklet or gain-node allocation',async()=>{
   const context=fakeContext();
   const before=FakeAudioWorkletNode.instances.length;
   await assert.rejects(createPlaybackAudioEngine(context,{catalog:catalog(descriptor()),catalogUrl:manifestUrl,fetchImpl:async()=>response(validBytes),cacheStorage:null,cryptoImpl:webcrypto,masterGain:2}),RangeError);
   assert.equal(context.modules.length,0,'invalid gain must be rejected before loading worklets');
   assert.equal(context.gainCreations,0,'invalid gain must not allocate a graph node');
   assert.equal(FakeAudioWorkletNode.instances.length,before,'invalid gain must not allocate a processor');
  });

  await t.test('processor failure moves lifecycle to error and rejects later work',async()=>{
   const {engine}=await createEngine();
   const node=FakeAudioWorkletNode.instances.at(-1);
   node.onprocessorerror({message:'simulated processor failure'});
   assert.equal(engine.getState().lifecycle,'error');
   await assert.rejects(engine.loadBank('fixture'),error=>error.code==='PROCESSOR_ERROR');
   await engine.dispose();
  });
 }finally{
  if(original===undefined)delete globalThis.AudioWorkletNode;
  else globalThis.AudioWorkletNode=original;
 }
});

test('audio loader same-bank joins, different-bank stale guards, and disposal aborts pending work',async t=>{
 const original=globalThis.AudioWorkletNode;
 FakeAudioWorkletNode.instances=[];
 globalThis.AudioWorkletNode=FakeAudioWorkletNode;
 try{
  await t.test('same bank returns one request and only fetches once',async()=>{
   let releaseFetch;
   let fetchCount=0;
   const fetchImpl=()=>{fetchCount+=1;return new Promise(resolve=>{releaseFetch=()=>resolve(response(validBytes));});};
   const {engine}=await createEngine({fetchImpl,cacheStorage:null});
   const first=engine.loadBank('fixture');
   while(!releaseFetch)await new Promise(resolve=>setTimeout(resolve,0));
   const second=engine.loadBank('fixture');
   // Attach both completion handlers before releasing the fixture response so
   // a regression cannot become an unhandled rejection during the test.
   const both=Promise.all([first,second]);
   releaseFetch();
   await both;
   assert.equal(fetchCount,1);
   await engine.dispose();
  });

  await t.test('newer bank load cancels the older fetch and only indexes the current bank',async()=>{
   const slow=descriptor('slow');
   const fast=descriptor('fast');
   let slowStartedResolve;
   const slowStarted=new Promise(resolve=>{slowStartedResolve=resolve;});
   let fetchCount=0;
   const fetchImpl=(url,{signal})=>{
    fetchCount+=1;
    if(url.endsWith('/slow.sf2'))return new Promise((resolve,reject)=>{
     slowStartedResolve();
     signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
    });
    return Promise.resolve(response(validBytes));
   };
   const {engine}=await createEngine({banks:[slow,fast],fetchImpl,cacheStorage:null});
   const pending=engine.loadBank('slow');
   const pendingFailure=assert.rejects(pending,error=>error instanceof EngineError&&error.code==='STALE_OPERATION');
   await slowStarted;
   const current=await engine.loadBank('fast');
   await pendingFailure;
   assert.equal(current.id,'fast');
   assert.equal(engine.getState().bankId,'fast');
   assert.deepEqual(FakeAudioWorkletNode.instances.at(-1).port.sent.filter(message=>message.type==='load-bank').map(message=>message.bankId),['fast']);
   assert.equal(fetchCount,2);
   await engine.dispose();
  });

  await t.test('a preparation reply from a replaced bank cannot mark the new bank prepared',async()=>{
   const firstBank=descriptor('first');
   const secondBank=descriptor('second');
   let beginResolve;
   const began=new Promise(resolve=>{beginResolve=resolve;});
   let releasePrepare;
   FakeAudioWorkletNode.prepareHandler=(port,message)=>{
    beginResolve();
    releasePrepare=()=>port.onmessage?.({data:{type:'prepared',requestId:message.requestId,elapsedMs:0.1,uniqueSampleCount:1,reusedSampleCount:0,patches:[]}});
   };
   const {engine}=await createEngine({banks:[firstBank,secondBank],fetchImpl:async()=>response(validBytes),cacheStorage:null});
   await engine.loadBank('first');
   const preparing=engine.preparePatches([{bankMSB:0,bankLSB:0,program:0,isDrum:false,notes:[{pitch:60,velocity:90}]}]);
   const stalePreparation=assert.rejects(preparing,error=>error.code==='STALE_OPERATION');
   await began;
   await engine.loadBank('second');
   releasePrepare();
   await stalePreparation;
   assert.equal(engine.getState().bankId,'second');
   assert.equal(engine.getState().lifecycle,'bank-indexed');
   assert.equal(engine.getState().preparedPatches.length,0,'old-bank sample preparation must not cross the bank boundary');
   FakeAudioWorkletNode.prepareHandler=null;
   await engine.dispose();
  });

  await t.test('a newer bank load survives a delayed dispose acknowledgement from the old synth',async()=>{
   FakeAudioWorkletNode.instances=[];
   FakeAudioWorkletNode.disposeHandler=null;
   let releaseOldDispose;
   const oldDisposeStarted=new Promise(resolve=>{
    FakeAudioWorkletNode.disposeHandler=(port,message)=>{
     if(port!==FakeAudioWorkletNode.instances[0].port||releaseOldDispose)return false;
     releaseOldDispose=()=>port.onmessage?.({data:{type:'disposed',requestId:message.requestId}});
     resolve();
     return true;
    };
   });
   const {engine}=await createEngine({banks:[descriptor('bank-a'),descriptor('bank-b'),descriptor('bank-c')],fetchImpl:async()=>response(validBytes),cacheStorage:null});
   try{
    await engine.loadBank('bank-a');
    const oldNode=FakeAudioWorkletNode.instances[0];
    const superseded=engine.loadBank('bank-b');
    const supersededFailure=assert.rejects(superseded,error=>error instanceof EngineError&&error.code==='STALE_OPERATION');
    await bounded(oldDisposeStarted,2500,'old synth dispose request was not observed');
    const latest=engine.loadBank('bank-c');
    assert.equal(engine.getState().lifecycle,'loading-bank','the third bank request must become current before the old dispose reply');
    await new Promise(resolve=>setTimeout(resolve,0));
    releaseOldDispose();
    await supersededFailure;
    const latestResult=await bounded(latest,2500,'latest bank stayed blocked on a stale synth disposal');
    assert.equal(latestResult.id,'bank-c');
    assert.equal(engine.getState().bankId,'bank-c');
    assert.equal(engine.getState().lifecycle,'bank-indexed');
    assert.equal(engine.getMetrics().processorError,null,'a stale auxiliary-node disposal must not poison the active engine');
    const activeNodes=FakeAudioWorkletNode.instances.filter(node=>!node.disconnected&&!node.port.closed);
    assert.equal(activeNodes.length,1,'only the current synth should remain connected after the overlapping swap');
    assert.notEqual(activeNodes[0],oldNode,'the active engine must not retain the disposed original synth');
    const sequence=engine.scheduleEvent({group:'file',channel:0,at:0,type:'programChange',program:0});
    assert.ok(activeNodes[0].port.sent.some(message=>message.type==='schedule-event'&&message.event?.sequence===sequence),
     'the final active synth must accept events after the race');
   }finally{
    FakeAudioWorkletNode.disposeHandler=null;
    releaseOldDispose?.();
    await engine.dispose();
   }
  });

  await t.test('dispose invalidates a pending bank fetch and later calls reject',async()=>{
   let startedResolve;
   const started=new Promise(resolve=>{startedResolve=resolve;});
   const fetchImpl=(_url,{signal})=>new Promise((_resolve,reject)=>{
    startedResolve();
    signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
   });
   const {engine}=await createEngine({fetchImpl,cacheStorage:null});
   const pending=engine.loadBank('fixture');
   await started;
   const result=await engine.dispose();
   assert.equal(result.acknowledged,true,'fake worklet acknowledges bounded disposal');
   await assert.rejects(pending,error=>error instanceof EngineError&&error.code==='STALE_OPERATION');
   assert.equal(engine.getState().lifecycle,'disposed');
   assert.throws(()=>engine.scheduleEvent({group:'file',channel:0,at:0,type:'programChange',program:0}),error=>error.code==='ENGINE_DISPOSED');
  });
 }finally{
  FakeAudioWorkletNode.prepareHandler=null;
  FakeAudioWorkletNode.disposeHandler=null;
  if(original===undefined)delete globalThis.AudioWorkletNode;
  else globalThis.AudioWorkletNode=original;
 }
});
