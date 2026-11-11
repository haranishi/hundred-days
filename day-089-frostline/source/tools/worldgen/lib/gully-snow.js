import {spline} from '../../../src/world/surface-math.js';
import {periodicNoise as noise} from './noise.js';
/** Snow fills terrain-derived cross-slope hollows. This function never writes height. */
export function paintGullySnow(height,c,masksA){
 const n=c.maskGrid,cell=c.cell*2,read=(x,z)=>spline(height,c.grid,(x+c.size/2)/c.cell-.5,(z+c.size/2)/c.cell-.5),candidates=[];let exposed=0;
 for(let j=2;j<n-2;j++)for(let i=2;i<n-2;i++){
  const x=(i+.5)*cell-c.size/2,z=(j+.5)*cell-c.size/2,k=j*n+i,rock=masksA[k*4+3]/255;if(x>=-700||rock<.3)continue;
  const hx=(read(x+8,z)-read(x-8,z))/16,hz=(read(x,z+8)-read(x,z-8))/16,l=Math.hypot(hx,hz);if(l<Math.tan(40*Math.PI/180))continue;exposed+=rock;if(rock<.7)continue;
  const ux=hx/l,uz=hz/l;let score=0;for(const along of [-32,-16,0,16,32]){const xx=x+ux*along,zz=z+uz*along,h=read(xx,zz);score+=(read(xx-uz*12,zz+ux*12)+read(xx+uz*12,zz-ux*12)-2*h)/2-.09*(read(xx-uz*40,zz+ux*40)+read(xx+uz*40,zz-ux*40)-2*h)/2;}
  // 場所ごとに、雪の筋の入りやすさを変える（大きなむら・480 m）。どこも同じ基準で選ぶと、同じ向き・同じ幅の縞が壁いっぱいに並び、
  // 櫛で引いた模様（ゼブラ模様）に見えた（見た目の採点 3 周目）。むらの低い所は、岩の面がまとまって残り、高い所は、雪の筋が密になる
  const zone=.3+1.6*Math.min(1,Math.max(0,.5+1.3*(noise(x/480,z/480,65536,9173)-.5)+.6*(noise(x/170,z/170,65536,4421)-.5)));
  candidates.push({k,x,z,ux,uz,rock,score:score/5*zone});
 }
 candidates.sort((a,b)=>b.score-a.score);let area=0,threshold=Infinity;for(const p of candidates){if(p.score<=0||area>=exposed*.48)break;area+=p.rock;threshold=p.score;}
 const selected=new Uint8Array(n*n);for(const p of candidates)if(p.score>=threshold&&p.score>0)selected[p.k]=1;
 const seen=new Uint8Array(n*n),components=[];for(const p of candidates){if(!selected[p.k]||seen[p.k])continue;const queue=[p.k],cells=[];seen[p.k]=1;let xmin=Infinity,xmax=-Infinity,zmin=Infinity,zmax=-Infinity;for(let q=0;q<queue.length;q++){const k=queue[q],x=k%n,z=Math.floor(k/n);cells.push(k);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);for(const o of [-n-1,-n,-n+1,-1,1,n-1,n,n+1]){const a=k+o;if(a>=0&&a<n*n&&selected[a]&&!seen[a]){seen[a]=1;queue.push(a);}}}
  const extent=cell*Math.hypot(xmax-xmin,zmax-zmin);if(extent<60){for(const k of cells)selected[k]=0;}else components.push({cells:cells.length,extent,bounds:[xmin,xmax,zmin,zmax].map(v=>v*cell-c.size/2)});
 }
 const widths=[];for(const p of candidates)if(selected[p.k]){let width=0;for(const sign of [-1,1])for(let d=2;d<=64;d+=2){const i=Math.floor((p.x-p.uz*d*sign+c.size/2)/cell),j=Math.floor((p.z+p.ux*d*sign+c.size/2)/cell);if(i<0||j<0||i>=n||j>=n||!selected[j*n+i])break;width+=2;}widths.push(width+cell);}widths.sort((a,b)=>a-b);
 let painted=0,count=0;for(const p of candidates)if(selected[p.k]){const k=p.k*4;painted+=p.rock;count++;masksA[k]=Math.round(20+20*Math.min(1,p.score/2));masksA[k+1]=230;masksA[k+3]=0;}
 return {region:'x < -700, slope >= 40',baselineRockArea:exposed*cell*cell,paintedArea:painted*cell*cell,fraction:painted/Math.max(1,exposed),cells:count,threshold,widths:{min:widths[0]??0,p10:widths[Math.floor(widths.length*.1)]??0,median:widths[Math.floor(widths.length*.5)]??0,p90:widths[Math.floor(widths.length*.9)]??0,max:widths.at(-1)??0,fraction8to30:widths.filter(w=>w>=8&&w<=30).length/Math.max(1,widths.length)},components,checks:{area:painted/exposed>=.35&&painted/exposed<=.5,length:components.every(c=>c.extent>=60),width:widths.every(w=>w>=8&&w<=30)},method:'cross-slope hollow at 12m minus broad 40m curvature; average along the fall line +/-32m; positive curvature only; connected extent >=60m'};
}
