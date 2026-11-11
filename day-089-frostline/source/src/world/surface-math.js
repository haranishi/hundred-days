import {bridgeDeck} from './structures.js';
const NORMAL_STEP = 0.25;
const CURVE_STEP = 1.5;
export function clamp(x,lo,hi) { return Math.max(lo,Math.min(hi,x)); }
function index(i,n,periodic) { return periodic ? ((i%n)+n)%n : clamp(i,0,n-1); }
function weight(t,k) {
  if(k===0)return (1-t)**3/6;
  if(k===1)return (3*t*t*t-6*t*t+4)/6;
  if(k===2)return (-3*t*t*t+3*t*t+3*t+1)/6;
  return t*t*t/6;
}
function derivative(t,k) {
  if(k===0)return -((1-t)**2)/2;
  if(k===1)return 1.5*t*t-2*t;
  if(k===2)return -1.5*t*t+t+.5;
  return t*t/2;
}
/** Uniform cubic B-spline; sample coordinates are relative to texel centers. No allocations. */
export function spline(a,n,x,z,stride=1,channel=0,periodic=false) {
  const ix=Math.floor(x), iz=Math.floor(z), tx=x-ix, tz=z-iz;
  const x0=index(ix-1,n,periodic)*stride+channel,x1=index(ix,n,periodic)*stride+channel;
  const x2=index(ix+1,n,periodic)*stride+channel,x3=index(ix+2,n,periodic)*stride+channel;
  const w0=weight(tx,0),w1=weight(tx,1),w2=weight(tx,2),w3=weight(tx,3);
  let sum=0;
  for(let j=0;j<4;j++) {
    const row=index(iz+j-1,n,periodic)*n*stride;
    sum+=weight(tz,j)*(a[row+x0]*w0+a[row+x1]*w1+a[row+x2]*w2+a[row+x3]*w3);
  }
  return sum;
}
export function splineDerivative(a,n,x,z,dx,dz) {
  const ix=Math.floor(x),iz=Math.floor(z),tx=x-ix,tz=z-iz;
  let v=0;
  for(let j=0;j<4;j++)for(let i=0;i<4;i++)v+=a[index(iz+j-1,n,false)*n+index(ix+i-1,n,false)]*
    (dx*derivative(tx,i)*weight(tz,j)+dz*weight(tx,i)*derivative(tz,j));
  return v;
}
export function heightAt(c,b,x,z) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
  const xx=clamp(x,-c.size/2,c.size/2)+c.size/2,zz=clamp(z,-c.size/2,c.size/2)+c.size/2;
  const base=spline(b.height,c.grid,xx/c.cell-.5,zz/c.cell-.5);
  const amp=spline(b.masksB,c.maskGrid,xx/(c.cell*2)-.5,zz/(c.cell*2)-.5,4,1)*(.75/255);
  const tile=spline(b.tileA,c.tileGrid,xx*c.tileGrid/c.tilePeriod-.5,zz*c.tileGrid/c.tilePeriod-.5,1,0,true);
  return Math.max(base+amp*tile,bridgeDeck(c,x,z));
}
export function sampleSurface(c,b,x,z,out) {
  const valid=Number.isFinite(x)&&Number.isFinite(z);
  // Derivatives at a clamped point must equal derivatives queried at that edge.
  const xx=valid?clamp(x,-c.size/2,c.size/2):0,zz=valid?clamp(z,-c.size/2,c.size/2):0;
  const hx=valid?(heightAt(c,b,xx+NORMAL_STEP,zz)-heightAt(c,b,xx-NORMAL_STEP,zz))/(2*NORMAL_STEP):0;
  const hz=valid?(heightAt(c,b,xx,zz+NORMAL_STEP)-heightAt(c,b,xx,zz-NORMAL_STEP))/(2*NORMAL_STEP):0;
  const inv=1/Math.sqrt(1+hx*hx+hz*hz);
  out.h=valid?heightAt(c,b,xx,zz):0; out.nx=-hx*inv;out.ny=inv;out.nz=-hz*inv;
  out.inBounds=valid&&x>=-c.size/2&&x<=c.size/2&&z>=-c.size/2&&z<=c.size/2;
  return out;
}
export function curvatureAlong(c,b,x,z,dx,dz) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(dx)||!Number.isFinite(dz))return 0;
  x=clamp(x,-c.size/2,c.size/2); z=clamp(z,-c.size/2,c.size/2);
  const h=heightAt(c,b,x,z),hp=heightAt(c,b,x+dx*CURVE_STEP,z+dz*CURVE_STEP),hm=heightAt(c,b,x-dx*CURVE_STEP,z-dz*CURVE_STEP);
  const hd=(hp-hm)/(2*CURVE_STEP),hdd=(hp+hm-2*h)/(CURVE_STEP*CURVE_STEP);
  const hx=(heightAt(c,b,x+NORMAL_STEP,z)-heightAt(c,b,x-NORMAL_STEP,z))/(2*NORMAL_STEP);
  const hz=(heightAt(c,b,x,z+NORMAL_STEP)-heightAt(c,b,x,z-NORMAL_STEP))/(2*NORMAL_STEP);
  return hdd/((1+hd*hd)*Math.sqrt(1+hx*hx+hz*hz));
}
