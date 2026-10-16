/**
 * Independent Fingering Piano Roll viewport. Pure math: never seeks the
 * musical transport, changes MIDI events or alters the piano key geometry.
 * View origin is the visual strike/reference line, looking ahead in time.
 */
export const EDITOR_WINDOW_DEFAULT=6;
export const EDITOR_WINDOW_MIN=2;
export const EDITOR_WINDOW_MAX=24;
const fingerViewportClamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function clampEditorTime(value,duration){
 if(!Number.isFinite(value)||!Number.isFinite(duration)||duration<0)return 0;
 return fingerViewportClamp(value,0,duration);
}
export function normalizedWheelPixels(delta,deltaMode,viewportHeight){
 if(!Number.isFinite(delta))return 0;
 return delta*(deltaMode===1?16:deltaMode===2?Math.max(1,viewportHeight):1);
}
export function editorPan({time,deltaPixels,pixelsPerSecond,duration}){
 if(!Number.isFinite(pixelsPerSecond)||pixelsPerSecond<=0)return clampEditorTime(time,duration);
 return clampEditorTime(time+deltaPixels/pixelsPerSecond,duration);
}
export function editorZoom({time,windowSeconds=EDITOR_WINDOW_DEFAULT,deltaPixels,anchorY,strikeY,duration}){
 const oldSeconds=fingerViewportClamp(Number.isFinite(windowSeconds)?windowSeconds:EDITOR_WINDOW_DEFAULT,
  EDITOR_WINDOW_MIN,EDITOR_WINDOW_MAX);
 if(!Number.isFinite(deltaPixels)||!Number.isFinite(anchorY)||
  !Number.isFinite(strikeY)||strikeY<=14)
  return {time:clampEditorTime(time,duration),windowSeconds:oldSeconds};
 const seconds=fingerViewportClamp(oldSeconds*Math.exp(deltaPixels*.0013),EDITOR_WINDOW_MIN,EDITOR_WINDOW_MAX);
 const height=Math.max(1,strikeY-14);
 const secondsFromView=(strikeY-anchorY)*oldSeconds/height;
 const anchorTime=clampEditorTime(time,duration)+secondsFromView;
 const newTime=anchorTime-(strikeY-anchorY)*seconds/height;
 return {time:clampEditorTime(newTime,duration),windowSeconds:seconds};
}
export function editorRevealTime({viewTime,target,windowSeconds,duration}){
 const seconds=fingerViewportClamp(windowSeconds,EDITOR_WINDOW_MIN,EDITOR_WINDOW_MAX);
 const here=clampEditorTime(viewTime,duration);
 const targetTime=clampEditorTime(target,duration);
 if(targetTime>=here-.10&&targetTime<=here+seconds*.90)return here;
 return clampEditorTime(targetTime-seconds*.50,duration);
}
