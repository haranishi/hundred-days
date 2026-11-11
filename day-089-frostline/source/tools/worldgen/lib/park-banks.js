import {parkWeight,parkPoint} from './park-search.js';
/** Project only transition cells. Both the groomed core and the untouched mountain are fixed. */
export function softenParkBanks(height,c,p){
 const corners=[parkPoint(p,-122,-197),parkPoint(p,-122,197),parkPoint(p,p.length+122,-197),parkPoint(p,p.length+122,197)],n=c.grid;
 const i0=Math.max(1,Math.floor((Math.min(...corners.map(q=>q.x))+c.size/2)/c.cell)),i1=Math.min(n-2,Math.ceil((Math.max(...corners.map(q=>q.x))+c.size/2)/c.cell)),j0=Math.max(1,Math.floor((Math.min(...corners.map(q=>q.z))+c.size/2)/c.cell)),j1=Math.min(n-2,Math.ceil((Math.max(...corners.map(q=>q.z))+c.size/2)/c.cell));
 const cells=[];for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=parkWeight(p,(i+.5)*c.cell-c.size/2,(j+.5)*c.cell-c.size/2);if(a>0&&a<1)cells.push(j*n+i);}
 const offsets=[[-1,c.cell],[1,c.cell],[-n,c.cell],[n,c.cell],[-n-1,c.cell*Math.SQRT2],[-n+1,c.cell*Math.SQRT2],[n-1,c.cell*Math.SQRT2],[n+1,c.cell*Math.SQRT2]];
 for(let pass=0;pass<160;pass++){let delta=0;for(let q=0;q<cells.length;q++){const k=cells[pass%2?cells.length-1-q:q];let lo=-Infinity,hi=Infinity;for(const [o,d]of offsets){lo=Math.max(lo,height[k+o]-.64*d);hi=Math.min(hi,height[k+o]+.64*d);}const value=lo<=hi?Math.max(lo,Math.min(hi,height[k])):(lo+hi)/2;delta=Math.max(delta,Math.abs(value-height[k]));height[k]=value;}if(delta<.0001)break;}
}
