// Paper is about one unit wide: 1e-9 welds roundoff, while 1e-6 rejects
// contact-only polygon intersections. Neither tolerance represents paper thickness.
export const VERTEX_EPS = 1e-9;
export const AREA_EPS = 1e-6;
export const LENGTH_EPS = 1e-7;
export const RANK_EPS = 1e-10;
export const DEGENERATE_AREA_EPS = 1e-16;
export const BARYCENTRIC_DEN_EPS = 1e-18;
export function add(a,b) {
  const out=new Array(a.length);
  for(let i=0;i<a.length;i++) out[i]=a[i]+b[i];
  return out;
}
export function sub(a,b) {
  const out=new Array(a.length);
  for(let i=0;i<a.length;i++) out[i]=a[i]-b[i];
  return out;
}
export function mul(a,s) {
  const out=new Array(a.length);
  for(let i=0;i<a.length;i++) out[i]=a[i]*s;
  return out;
}
export function dot(a,b) {
  let sum=0;
  for(let i=0;i<a.length;i++) sum+=a[i]*b[i];
  return sum;
}
export const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm = a => Math.hypot(...a);
export const unit = a => mul(a,1/norm(a));
export const distance = (a,b) => norm(sub(a,b));
export const lerp = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
export const cross2 = (a,b) => a[0]*b[1]-a[1]*b[0];
export const signedArea = p => p.reduce((s,a,i)=>s+cross2(a,p[(i+1)%p.length]),0)/2;
export function rotate(p,origin,axis,angle) {
  const x=p[0]-origin[0],y=p[1]-origin[1],z=p[2]-origin[2];
  const ax=axis[0],ay=axis[1],az=axis[2],c=Math.cos(angle),s=Math.sin(angle);
  const d=(x*ax+y*ay+z*az)*(1-c);
  return [origin[0]+((x*c+(ay*z-az*y)*s)+ax*d),
    origin[1]+((y*c+(az*x-ax*z)*s)+ay*d),
    origin[2]+((z*c+(ax*y-ay*x)*s)+az*d)];
}
export const axisDistance = (p,o,a) => norm(cross(sub(p,o),a));
export function barycentric(p,a,b,c) {
  const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1];
  const den=bx*cy-by*cx;
  if(Math.abs(den)<BARYCENTRIC_DEN_EPS) return null;
  const px=p[0]-a[0],py=p[1]-a[1];
  const v=(px*cy-py*cx)/den;
  const w=(bx*py-by*px)/den;
  return [1-v-w,v,w];
}
export const inTriangle = w => w && w.every(v=>v>=-VERTEX_EPS && v<=1+VERTEX_EPS);
export function weighted(points,w) { return points[0].map((_,i)=>points.reduce((s,p,j)=>s+p[i]*w[j],0)); }
export function segmentTriangleInterval(a,b,triangle) {
  const winding=Math.sign(signedArea(triangle));
  if(!winding) return null;
  let low=0,high=1;
  for(let i=0;i<3;i++) {
    const o=triangle[i],d=sub(triangle[(i+1)%3],o);
    // Within the weld tolerance a point counts as on the edge. Keeping a value
    // like -1e-17 strictly negative skipped both clip branches below and left a
    // segment far outside the triangle with a non-empty interval (crease lines
    // drawn beyond the paper).
    const snap=v=>Math.abs(v)<=VERTEX_EPS?0:v;
    const s=snap(winding*cross2(d,sub(a,o))),e=snap(winding*cross2(d,sub(b,o)));
    if(s<0 && e<0) return null;
    if(s<0) low=Math.max(low,s/(s-e));
    else if(e<0) high=Math.min(high,s/(s-e));
  }
  return high>=low?[low,high]:null;
}
export function overlapArea(a,b) {
  let poly=a.map(p=>p.slice());
  const sign=Math.sign(signedArea(b));
  for(let i=0;i<b.length && poly.length;i++) {
    const o=b[i], d=sub(b[(i+1)%b.length],o), result=[];
    const side=p=>sign*cross2(d,sub(p,o));
    for(let j=0;j<poly.length;j++) {
      const p=poly[j], q=poly[(j+1)%poly.length], sp=side(p), sq=side(q);
      if(sp>=0) result.push(p);
      if((sp>0 && sq<0)||(sp<0 && sq>0)) result.push(lerp(p,q,sp/(sp-sq)));
    }
    poly=result;
  }
  return poly.length>=3?Math.abs(signedArea(poly)):0;
}
export function boundsOf(points) {
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(const p of points) for(let i=0;i<3;i++) { min[i]=Math.min(min[i],p[i]); max[i]=Math.max(max[i],p[i]); }
  const center=lerp(min,max,.5);
  return {min,max,center,radius:distance(min,max)/2};
}
