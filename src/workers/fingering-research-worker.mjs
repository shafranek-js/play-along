import {compareBrowserFingeringResearch} from '../core/browser-fingering-research.mjs';

// Dedicated, bundled classic Worker. No network, storage or engine downloads.
// Transport/score are never mutated; results are read-only suggestions.
self.onmessage=(event)=>{
 const id=event.data?.id;
 if(!Number.isSafeInteger(id)||id<1)return;
 let report;
 try{
  report=compareBrowserFingeringResearch({
   notes:event.data?.notes,handSize:event.data?.handSize
  });
 }catch{
  report={ok:false,reason:'RESEARCH_WORKER_FAILED',researchOnly:true,
    productionEligible:false};
 }
 self.postMessage({id,report});
};
