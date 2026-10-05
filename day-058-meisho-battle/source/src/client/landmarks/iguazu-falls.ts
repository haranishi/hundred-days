// Round 6: irregular closed gorge banks, narrow supported upper river strips,
// exposed vegetated gaps and unequal falling sheets replace the rectangular dam.
// Main Garganta drop stays tall. Minor ledges are artistic observations from
// operator Inferior/Superior photos, not surveyed dimensions or one universal cascade.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COLORS, type Kit } from './kit'

type BankPoint = { x: number; z: number; nx: number; nz: number; crest: number; width: number }
function banks(): BankPoint[] {
  const raw: [number, number][] = []
  for (let i=0;i<12;i++) {const z=2.4-i*0.325;raw.push([-1.08+0.13*Math.sin(z*1.9),z])}
  for (let i=1;i<=12;i++) {const a=-Math.PI/2+i*Math.PI/12;const r=1.08+0.06*Math.sin(i*1.7);raw.push([Math.sin(a)*r,-1.175-Math.cos(a)*r])}
  for (let i=1;i<=11;i++) {const z=-1.175+i*0.325;raw.push([1.08+0.11*Math.sin(z*1.65+0.6),z])}
  return raw.map(([x,z],i)=>{const p=raw[Math.max(0,i-1)]!,q=raw[Math.min(raw.length-1,i+1)]!,dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);return{x,z,nx:-dz/len,nz:dx/len,crest:2.0+0.07*Math.sin(i*0.77),width:1.72+0.17*Math.sin(i*0.83)}})
}
function bankAt(p:BankPoint,u:number):[number,number,number] {
  const distance=p.width*u
  return[p.x-p.nx*distance,p.crest+0.3*u*u+0.15*Math.sin(p.x*2.4+p.z*1.3+u*3)*u,p.z-p.nz*distance]
}

export function build(kit:Kit):void {
  const edge=banks()
  kit.ground(COLORS.forest)
  kit.stage(1)
  kit.mesh({geometry:bankGeometry(edge,1,false),color:'#747462'})
  // Upper water samples the same surface with a 0.03 function offset.
  // The separately triangulated meshes have a measured positive gap, not a constant one.
  kit.mesh({geometry:bankGeometry(edge,0.49,true),color:'#779B8D',finish:'water'})
  kit.water({points:[[-0.88,3.7],[0.86,3.7],[1.02,2.05],[0.86,-1.17],[0.6,-1.9],[0,-2.12],[-0.6,-1.9],[-0.86,-1.17],[-1.02,2.05]],at:[0,0.055,0],color:'#5D8F85'})
  kit.stage(2)
  kit.order(-1)
  kit.part(()=>{
    for(let i=0;i<edge.length-1;i++) {
      // Dense curved head remains a high drop; side falls have varied gaps/widths.
      const head=i>=11&&i<=23
      if(!head&&(i%4===1||i===30))continue
      const p=edge[i]!,q=edge[i+1]!,dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz)
      const nx=-dz/len,nz=dx/len
      const width=len*(head?0.83+0.09*Math.sin(i*2):0.46+0.26*(0.5+0.5*Math.sin(i*1.7)))
      const crest=(p.crest+q.crest)/2
      kit.mesh({geometry:flowRibbon(width,i,crest,!head&&i%5===0),at:[(p.x+q.x)/2,0,(p.z+q.z)/2],rotY:Math.atan2(nx,nz)*180/Math.PI,color:i%3===0?'#D8EAE5':'#EDF4EF',finish:'water'})
    }
    // Vegetated rock tongues interrupt the side fall lines without filling the gorge.
    for(const i of [2,6,9,26,30,33]) {
      const p=edge[i]!,[x,y,z]=bankAt(p,0.11)
      kit.mound({r:0.24,rx:0.24,rz:0.18,h:0.13,at:[x,y+0.018,z],color:'#587C4F'})
    }
  })
  kit.order(0)
  kit.stage(3)
  kit.part(()=>{
    for(const[x,z]of[[-0.63,-1.7],[0.63,-1.7],[-0.73,-0.6],[0.73,0.2],[-0.78,1.5],[0.75,2.2]]as const)kit.sphere({r:0.21,squash:0.36,at:[x,0.07,z],color:'#F4F7EF',seg:8})
    for(const z of[-1.4,0.1,1.6,3.0])kit.torus({r:0.28,tube:0.02,flat:true,arc:135,at:[0,0.09,z],rotY:z*27,seg:12,color:'#D6E5DE',finish:'water'})
  })
  kit.stage(4)
  kit.part(()=>{
    // Dense forest occupies the dry outside half of each curved bank. Root pads
    // have individually sampled support elevations; trees cannot float on water.
    for(let i=0;i<edge.length;i+=2)for(const u of[0.62,0.86]) {
      const[x,y,z]=bankAt(edge[i]!,u)
      kit.cylinder({r:0.2,rTop:0.17,h:0.07,at:[x,y-0.02,z],seg:8,color:'#668052'})
      kit.tree({h:0.39+(i%3)*0.045,at:[x,y+0.045,z],color:i%4===0?COLORS.forest:'#4E8556'})
    }
    // Small green river islets break up the supported upper stream.
    for(const i of[4,8,18,27,31]) {
      const[x,y,z]=bankAt(edge[i]!,0.32)
      kit.mound({r:0.25,h:0.12,at:[x,y+0.033,z],color:COLORS.forest})
      kit.tree({h:0.28,at:[x,y+0.14,z],color:COLORS.forest})
    }
  })
  const[x,y,z]=bankAt(edge[4]!,0.59)
  kit.person({at:[x,y+0.05,z],h:0.1})
}

// A closed terrain strip with curved, faceted outer banks and changing crest.
// Thin upper-water strip samples the SAME top function, hence stays supported.
function bankGeometry(edge:BankPoint[],extent:number,water:boolean):BufferGeometry {
  const vertices:number[]=[],indices:number[]=[],rows=5
  for(const p of edge)for(let j=0;j<rows;j++) {
    const u=extent*j/(rows-1),[x,y,z]=bankAt(p,u)
    vertices.push(x,water?y+0.03:y,z,x,water?y+0.012:0,z)
  }
  const v=(i:number,j:number,top:boolean)=>((i*rows+j)*2)+(top?0:1)
  const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d)
  for(let i=0;i<edge.length-1;i++)for(let j=0;j<rows-1;j++) {
    quad(v(i,j,true),v(i+1,j,true),v(i+1,j+1,true),v(i,j+1,true))
    quad(v(i,j,false),v(i,j+1,false),v(i+1,j+1,false),v(i+1,j,false))
  }
  for(let i=0;i<edge.length-1;i++) {
    quad(v(i,0,true),v(i,0,false),v(i+1,0,false),v(i+1,0,true))
    quad(v(i,rows-1,true),v(i+1,rows-1,true),v(i+1,rows-1,false),v(i,rows-1,false))
  }
  for(let j=0;j<rows-1;j++) {
    quad(v(0,j,true),v(0,j+1,true),v(0,j+1,false),v(0,j,false))
    const i=edge.length-1;quad(v(i,j,true),v(i,j,false),v(i,j+1,false),v(i,j+1,true))
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices)
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat
}
function flowRibbon(width:number,seed:number,crest:number,ledge:boolean):BufferGeometry {
  const vertices:number[]=[],indices:number[]=[],n=9
  for(let i=0;i<=n;i++) {
    const t=i/n,y=0.085+t*(crest+0.03-0.085)
    const w=width*(0.84+0.13*Math.sin(seed+i*1.8)+0.13*(1-t))
    const x=width*0.06*Math.sin(seed*1.8+i*0.9)*(1-t)
    const z=0.045+0.16*(1-t)*(1-t)+(ledge?0.09*Math.exp(-(((t-0.37)/0.12)**2)):0)
    vertices.push(x-w/2,y,z,x+w/2,y,z,x-w/2,y,z-0.025,x+w/2,y,z-0.025)
  }
  for(let i=0;i<n;i++){const a=i*4,b=(i+1)*4;indices.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1)}
  indices.push(0,2,1,1,2,3,n*4,n*4+1,n*4+2,n*4+1,n*4+3,n*4+2)
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
}
