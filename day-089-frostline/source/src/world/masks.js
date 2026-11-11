import {spline,clamp} from './surface-math.js';
export function maskValue(c,buffer,x,z,channel) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  return spline(buffer,c.maskGrid,(clamp(x,-c.size/2,c.size/2)+c.size/2)/(2*c.cell)-.5,(clamp(z,-c.size/2,c.size/2)+c.size/2)/(2*c.cell)-.5,4,channel);
}
export function snowAt(c,b,x,z,out) {
  out.depth=maskValue(c,b.masksA,x,z,0)*.02;
  const powder=maskValue(c,b.masksA,x,z,1)/255,ice=maskValue(c,b.masksA,x,z,2)/255,total=Math.max(1,powder+ice);
  out.powder=powder/total;out.ice=ice/total;out.packed=Math.max(0,1-out.powder-out.ice);
  out.rock=maskValue(c,b.masksA,x,z,3)/255;out.wind=maskValue(c,b.masksB,x,z,2)/255;
  out.rough=maskValue(c,b.masksB,x,z,1)/255;
  return out;
}

/** Categorical texels: use nearest cells, exactly as waterAt and the lake renderer. */
export function lakeValue(meta,buffers,x,z){
 const l=meta.lake;if(!l||!Number.isFinite(x)||!Number.isFinite(z)||x<l.x0||z<l.z0||x>=l.x0+l.size||z>=l.z0+l.size)return 0;
 return buffers.lake[Math.floor((z-l.z0)*l.grid/l.size)*l.grid+Math.floor((x-l.x0)*l.grid/l.size)];
}
