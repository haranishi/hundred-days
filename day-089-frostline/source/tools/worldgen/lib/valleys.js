import {protectValley,lakeInside} from './valley-layout.js';
import {boxBlur,widenField} from './fields.js';
import {routeFlow} from './drainage.js';
import {smooth01} from './features.js';
import {clamp} from '../../../src/world/surface-math.js';
export const VALLEY_PARAMS=Object.freeze({width:26,smoothing:13,minimumArea:15000,maxIncision:95});
/** A finite-width bank-collapse stage widens the incision computed by SPL, not radial strokes.
 * The maximum field follows real tributaries, then sediment/snow rounding yields a broad trough.
 */
export function widenValleys(source,eroded,c){
  const n=c.grid,p=VALLEY_PARAMS,flow=routeFlow(eroded,c,{outlet:c.layout==='valley-1'?lakeInside:null}),cut=new Float32Array(source.length);
  for(let k=0;k<cut.length;k++)cut[k]=clamp(source[k]-eroded[k],0,p.maxIncision)*smooth01(flow.area[k]/p.minimumArea);
  const widened=boxBlur(widenField(cut,n,Math.max(1,Math.round(p.width/c.cell))),n,p.smoothing/c.cell,3),height=new Float32Array(cut.length);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i,x=(i+.5)*c.cell-c.size/2,z=(j+.5)*c.cell-c.size/2;
    const protect=c.layout==='valley-1'?protectValley(x,z):0;
    const incision=Math.max(Math.max(0,source[k]-eroded[k])*.25,widened[k]*1.5);
    height[k]=source[k]+Math.max(0,eroded[k]-source[k])*.3-incision*(1-protect);
  }
  return height;
}
