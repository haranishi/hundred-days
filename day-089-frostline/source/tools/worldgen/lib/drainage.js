/** Priority flood gives every depression an outlet; ties are resolved by cell index.
 * A FIFO handles flooded cells while the perimeter advances through a binary heap.
 * The epsilon gradient makes D8 receivers acyclic, including on filled flats.
 */
export function fillDepressions(source,c,{outlet=null,outletMask=null}={}){
  const n=c.grid,a=source.slice(),seen=new Uint8Array(a.length),heap=new Int32Array(a.length),queue=new Int32Array(a.length);
  let size=0,head=0,tail=0,filled=0;
  const less=(u,v)=>a[u]<a[v]||(a[u]===a[v]&&u<v);
  function push(k){let pos=size++;while(pos){const parent=(pos-1)>>1;if(!less(k,heap[parent]))break;heap[pos]=heap[parent];pos=parent;}heap[pos]=k;}
  function pop(){const k=heap[0],last=heap[--size];let pos=0;while(pos*2+1<size){let child=pos*2+1;if(child+1<size&&less(heap[child+1],heap[child]))child++;if(!less(heap[child],last))break;heap[pos]=heap[child];pos=child;}heap[pos]=last;return k;}
  function edge(k){if(!seen[k]){seen[k]=1;push(k);}}
  for(let i=0;i<n;i++){edge(i);edge((n-1)*n+i);edge(i*n);edge(i*n+n-1);}
  if(outletMask)for(let k=0;k<a.length;k++){if(outletMask[k])edge(k);}
  if(outlet)for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++)if(outlet((i+.5)*c.cell-c.size/2,(j+.5)*c.cell-c.size/2))edge(j*n+i);
  while(size||head<tail){
    const k=head<tail?queue[head++]:pop(),x=k%n,z=(k/n)|0;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=n||zz>=n)continue;
      const q=zz*n+xx;if(seen[q])continue;seen[q]=1;
      if(a[q]<=a[k]){a[q]=a[k]+.002;queue[tail++]=q;filled++;}else push(q);
    }
  }
  return {height:a,filled};
}
/** Kahn ordering: leaves first, outlets last; reverse order solves the implicit SPL. */
export function routeFlow(height,c,{fill=true,outlet=null,outletMask=null,randomSeed=null}={}){
  const n=c.grid,filled=fill?fillDepressions(height,c,{outlet,outletMask}):{height,filled:0},a=filled.height,length=a.length;
  const receiver=new Int32Array(length).fill(-1),distance=new Float32Array(length),donors=new Uint8Array(length),area=new Float32Array(length).fill(c.cell*c.cell),order=new Int32Array(length);
  for(let j=1;j<n-1;j++)for(let i=1;i<n-1;i++){
    const k=j*n+i;if(outletMask?.[k]||outlet?.((i+.5)*c.cell-c.size/2,(j+.5)*c.cell-c.size/2))continue;let best=0,r=-1,dist=0,total=0;let hash=(Math.imul(k+1,1597334677)^(randomSeed??0))>>>0;hash=Math.imul(hash^(hash>>>16),2246822507)>>>0;const pick=(hash>>>0)/4294967296;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;const q=k+dz*n+dx,d=c.cell*(dx&&dz?Math.SQRT2:1),s=(a[k]-a[q])/d;
      if(randomSeed===null){if(s>best){best=s;r=q;dist=d;}}else if(s>0){total+=s;}
    }
    if(randomSeed!==null&&total>0){let remaining=pick*total;for(let dz=-1;dz<=1&&r<0;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const q=k+dz*n+dx,d=c.cell*(dx&&dz?Math.SQRT2:1),s=(a[k]-a[q])/d;if(s>0){remaining-=s;if(remaining<=0){r=q;dist=d;break;}}}}
    receiver[k]=r;distance[k]=dist;if(r>=0)donors[r]++;
  }
  let count=0;
  for(let k=0;k<length;k++)if(!donors[k])order[count++]=k;
  for(let head=0;head<count;head++){
    const k=order[head],r=receiver[k];if(r>=0){area[r]+=area[k];if(!--donors[r])order[count++]=r;}
  }
  if(count!==length)throw new Error('流路に循環があります');
  return {height:a,receiver,distance,area,order,filled:filled.filled};
}
