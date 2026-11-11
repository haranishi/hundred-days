/** Priority flood records the lowest escape height; only enclosed cells in this rectangle are raised. */
export function settlementFlood(height,c,{apply=false}={}){
 const x0=Math.ceil((60+c.size/2)/c.cell),x1=Math.floor((460+c.size/2)/c.cell),z0=Math.ceil((1150+c.size/2)/c.cell),z1=Math.floor((1400+c.size/2)/c.cell),width=x1-x0+1,rows=z1-z0+1,seen=new Uint8Array(width*rows),heap=[];let maxDepth=0,filled=0,at=null;
 const push=(k,h)=>{let q=heap.length;heap.push({k,h});while(q){const p=(q-1)>>1;if(heap[p].h<=h)break;heap[q]=heap[p];q=p;}heap[q]={k,h};};
 const pop=()=>{const root=heap[0],last=heap.pop();if(heap.length){let q=0;while(q*2+1<heap.length){let b=q*2+1;if(b+1<heap.length&&heap[b+1].h<heap[b].h)b++;if(heap[b].h>=last.h)break;heap[q]=heap[b];q=b;}heap[q]=last;}return root;};
 const global=k=>(z0+Math.floor(k/width))*c.grid+x0+k%width;
 for(let j=0;j<rows;j++)for(let i=0;i<width;i++)if(!i||!j||i===width-1||j===rows-1){const k=j*width+i;seen[k]=1;push(k,height[global(k)]);}
 while(heap.length){const {k,h}=pop(),i=k%width,j=Math.floor(k/width);for(const [di,dj]of [[-1,0],[1,0],[0,-1],[0,1]]){const u=i+di,v=j+dj;if(u<0||u>=width||v<0||v>=rows)continue;const next=v*width+u;if(seen[next])continue;seen[next]=1;const g=global(next),old=height[g],level=Math.max(old,h),depth=level-old;if(depth>maxDepth){maxDepth=depth;at={x:(x0+u+.5)*c.cell-c.size/2,z:(z0+v+.5)*c.cell-c.size/2};}if(depth>0){filled++;if(apply)height[g]=level;}push(next,level);}}
 return {bounds:[60,460,1150,1400],maxDepth,at,filled};
}
