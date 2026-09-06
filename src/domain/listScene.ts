import {seasonFrame} from './scenery';
/** Stable logical position: appending rendered rows does not alter this denominator. */
export function listSceneProgress(rowIndex:number, fraction:number, total:number) {
  return total > 0 ? Math.max(0, Math.min(1, (rowIndex + Math.max(0, Math.min(1, fraction))) / total)) : 0;
}
export function listSceneFrame(rowIndex:number, fraction:number, total:number) {
  const progress=listSceneProgress(rowIndex,fraction,total);
  if(total<=800)return seasonFrame(progress,[0,1/3,2/3,1]);
  const phase=(progress*total/200*4)%4;
  const from=Math.floor(phase);
  return {from,to:(from+1)%4,mix:phase-from};
}
