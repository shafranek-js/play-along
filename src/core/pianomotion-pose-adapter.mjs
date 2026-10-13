/**
 * PianoMotion Studio → Play Along FG-03D4: source-verified visual-only pose bridge.
 * Original, independently written interchange validator. No imported Python,
 * PixiJS or licensed hand graphics; no MIDI/finger inference or timing writes.
 */
const MAX_FRAMES=128, MAX_NOTES=10, MAX_BONES=40, MAX_JOINTS=120;
const MAX_SPAN_SECONDS=4.01, EPS=1e-7;
const isFiniteNumber=n=>typeof n==='number'&&Number.isFinite(n);
const isInt=n=>Number.isInteger(n);
const pos3=v=>Array.isArray(v)&&v.length===3&&v.every(n=>isFiniteNumber(n)&&Math.abs(n)<=1000);
const result=(kind,reason,more={})=>({kind,reason,visualOnly:true,productionAutoFingeringAllowed:false,...more});
const verified=n=>n&&typeof n.noteId==='string'&&n.noteId.trim()&&
 isInt(n.pitch)&&n.pitch>=0&&n.pitch<=127&&
 (n.hand==='RH'||n.hand==='LH')&&isInt(n.finger)&&n.finger>=1&&n.finger<=5&&
 ((n.source==='musicxml'&&n.verification==='source-author')||
  (n.source==='user'&&n.verification==='user-verified'));
const canonicalIds=notes=>notes.map(n=>n.noteId).sort();
const equals=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const validBone=b=>b&&typeof b.boneId==='string'&&b.boneId.trim()&&
 typeof b.kind==='string'&&b.kind.trim()&&pos3(b.a)&&pos3(b.b);
const validJoint=j=>j&&typeof j.kind==='string'&&j.kind.trim()&&pos3(j.point);
function validPose(pose,expectedHand){
 if(!pose||pose.hand!==expectedHand||!isFiniteNumber(pose.transportTimeSeconds)||
  pose.transportTimeSeconds<0||!Array.isArray(pose.bones)||
  pose.bones.length===0||pose.bones.length>MAX_BONES||
  !Array.isArray(pose.joints)||pose.joints.length>MAX_JOINTS||
  !pose.bones.every(validBone)||!pose.joints.every(validJoint))return false;
 return new Set(pose.bones.map(b=>b.boneId)).size===pose.bones.length;
}
const sameTopology=(a,b)=>a.bones.length===b.bones.length&&a.joints.length===b.joints.length&&
 a.bones.every((v,i)=>v.boneId===b.bones[i].boneId&&v.kind===b.bones[i].kind)&&
 a.joints.every((v,i)=>v.kind===b.joints[i].kind);
const blend3=(a,b,f)=>a.map((n,i)=>n+(b[i]-n)*f);
function blendPose(a,b,f,t){
 return {hand:a.hand,transportTimeSeconds:t,
  bones:a.bones.map((bone,i)=>({boneId:bone.boneId,kind:bone.kind,
   a:blend3(bone.a,b.bones[i].a,f),b:blend3(bone.b,b.bones[i].b,f)})),
  joints:a.joints.map((joint,i)=>({kind:joint.kind,
   point:blend3(joint.point,b.joints[i].point,f)}))};
}
/**
 * Accepted input: {target, hand, frames, viewport, transport}.
 * Each frame: {pose: PianoMotion MotionPose, binding:{sourceNoteIds,iteration,generation}}.
 * A trusted target is an entire MusicXML onset group, never an inferred finger.
 * Recompute frames after seek, loop restart or new score with a new generation.
 */
export function samplePianoMotionVerifiedPose({target,hand,frames,viewport,transport}={}){
 if(!transport||!['listen','tempo','wait'].includes(transport.mode)||
  !isFiniteNumber(transport.now)||transport.now<0||
  !isInt(transport.generation)||transport.generation<0||
  !isFiniteNumber(transport.speedPercent)||transport.speedPercent<50||transport.speedPercent>200||
  !isInt(transport.leadMs)||transport.leadMs<500||transport.leadMs>1000||
  typeof transport.playing!=='boolean'||
  !viewport||!isInt(viewport.minPitch)||!isInt(viewport.maxPitch)||
  viewport.minPitch<0||viewport.maxPitch>127||viewport.minPitch>=viewport.maxPitch||
  (hand!=='RH'&&hand!=='LH'))return result('refuse','invalid-configuration');
 if(target?.isNextUnfinished!==true||!isFiniteNumber(target.onset)||target.onset<0||
  !isInt(target.iteration)||target.iteration<0||
  !Array.isArray(target.notes)||target.notes.length===0||target.notes.length>MAX_NOTES||
  target.totalNotes!==target.notes.length)return result('refuse','unconfirmed-source-target');
 const ids=new Set(),byHand=[];
 for(const note of target.notes){
  if(!verified(note)||ids.has(note.noteId))return result('refuse','unverified-or-ambiguous-fingering');
  ids.add(note.noteId);
  if(note.pitch<viewport.minPitch||note.pitch>viewport.maxPitch)
   return result('markers','target-key-clipped');
  if(note.completed!==undefined&&typeof note.completed!=='boolean')
   return result('refuse','invalid-completion');
  if(note.hand===hand)byHand.push(note);
 }
 if(!byHand.length)return result('markers','no-target-for-hand');
 if(target.notes.some(n=>n.completed===true))return result('markers','partially-completed-target');
 if(transport.mode==='wait')return result('markers','wait-unfinished-target');
 if(!transport.playing||transport.repositioned===true)
  return result('static','paused-or-repositioned');
 if(!Array.isArray(transport.heldNoteIds)||transport.heldNoteIds.length>MAX_NOTES||
  transport.heldNoteIds.some(id=>typeof id!=='string'||!id.trim()))
  return result('markers','held-key-state-unverified');
 if(transport.heldNoteIds.length)return result('markers','physical-keys-held');
 if(transport.oppositeHandClear!==true)return result('markers','crossing-unverified');
 let delta=target.onset-transport.now;
 if(transport.loop?.enabled){
  const loop=transport.loop;
  if(!isFiniteNumber(loop.start)||!isFiniteNumber(loop.end)||loop.end<=loop.start||
   target.onset<loop.start||target.onset>=loop.end||
   transport.now<loop.start||transport.now>loop.end)
   return result('refuse','invalid-loop');
  if(delta<=0){
   if(loop.nextCycle!==true)return result('markers','loop-iteration-unconfirmed');
   delta=loop.end-transport.now+target.onset-loop.start;
  }
 }else if(delta<=0)return result('markers','target-already-due');
 const remainingMs=delta*1000/(transport.speedPercent/100);
 if(!isFiniteNumber(remainingMs)||remainingMs<=0)return result('markers','target-already-due');
 if(remainingMs>transport.leadMs+EPS)return result('static','outside-lookahead');
 if(!Array.isArray(frames)||frames.length<2||frames.length>MAX_FRAMES)
  return result('markers','unavailable-pose-buffer');
 const expected=canonicalIds(byHand),expectedHand=hand==='RH'?'right':'left';
 let previous=null;
 for(const frame of frames){
  if(!frame||!validPose(frame.pose,expectedHand)||!frame.binding||
   frame.binding.generation!==transport.generation||
   frame.binding.iteration!==target.iteration||
   !Array.isArray(frame.binding.sourceNoteIds)||
   !equals([...frame.binding.sourceNoteIds].sort(),expected))
   return result('markers','unverified-pose-binding');
  if(previous){
   if(frame.pose.transportTimeSeconds<=previous.pose.transportTimeSeconds+EPS||
      !sameTopology(previous.pose,frame.pose))
    return result('markers','inconsistent-pose-sequence');
  }
  previous=frame;
 }
 const first=frames[0].pose.transportTimeSeconds,last=frames.at(-1).pose.transportTimeSeconds;
 if(last-first>MAX_SPAN_SECONDS||transport.now<first-EPS||transport.now>last+EPS)
  return result('markers','pose-window-missing');
 let index=1;
 while(index<frames.length-1&&frames[index].pose.transportTimeSeconds<transport.now)index++;
 const a=frames[index-1].pose,b=frames[index].pose;
 const fraction=Math.max(0,Math.min(1,(transport.now-a.transportTimeSeconds)/
  (b.transportTimeSeconds-a.transportTimeSeconds)));
 return result('motion','verified-source-pose',{
  hand,sourceNoteIds:expected,iteration:target.iteration,
  generation:transport.generation,remainingMs:Math.round(remainingMs),
  pose:blendPose(a,b,fraction,transport.now)});
}
