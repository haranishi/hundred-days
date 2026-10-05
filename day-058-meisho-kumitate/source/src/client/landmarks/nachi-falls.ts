// A long single fall framed by forest and the vermilion three-storey pagoda.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COLORS, type Kit } from './kit'
export function build(kit: Kit): void {
  kit.ground(COLORS.forest)
  kit.stage(1)
  kit.mound({ r:3.7,h:0.7,rx:3.6,rz:2.4,at:[0,0,-0.6],color:COLORS.forest })
  kit.mesh({ geometry: cliff(), color:'#727668' })
  // The pond sits above the hillside surface, so its water cannot be buried by the mound.
  kit.water({ r:1.02,at:[0.6,0.72,0.1],color:COLORS.pond })
  kit.box({ w:1.5,h:0.16,d:1.4,at:[-1.8,0.45,1.0],color:COLORS.stone })
  kit.stage(2)
  // Narrow straight drop: a ribbon against a deeply vertical rock wall.
  kit.order(-1)
  kit.part(() => {
    kit.mesh({ geometry: fallingRibbon(),color:COLORS.white,finish:'water' })
    for(const offset of [-0.09,0.015,0.095]) for(let i=0;i<8;i++) {
      const y0=0.78+i*3.05/8,y1=0.78+(i+1)*3.05/8
      kit.beam({ from:[0.6+offset,y0,cliffFront(y0)+0.145],to:[0.6+offset*0.8,y1,cliffFront(y1)+0.145],size:0.014,color:offset<0?'#D6E5EA':'#F9FAF5',finish:'water' })
    }
  // The three-storey pagoda and falling water share one early landing part.
  // The famous near-left / far-right view is an artistic compression, not a site plan.
  for (let n=0;n<3;n++) {
    const w=1.05-n*0.15,y=0.61+n*0.7
    kit.box({ w:w*0.72,h:0.47,d:w*0.72,at:[-1.8,y,1],color:COLORS.vermilion })
    kit.curvedRoof({ w,d:w,h:0.25,at:[-1.8,y+0.47,1],style:'hogyo',overhang:0.14,color:COLORS.roofTile })
  }
  })
  kit.order(0)
  kit.stage(3)
  kit.cylinder({ r:0.03,h:0.5,at:[-1.8,2.73,1],color:COLORS.gold,seg:6 })
  for(let n=0;n<5;n++) kit.torus({ r:0.07,tube:0.012,flat:true,at:[-1.8,2.75+n*0.09,1],seg:10,color:COLORS.gold })
  kit.stage(4)
  for (const [x,z] of [[-2.8,-0.8],[-1.8,-1.7],[2.2,-1.2],[2.5,0.5],[1.8,1.8],[-2.9,1.8]] as const) kit.tree({ kind:'cone',h:1.0,at:[x,kit.groundAt(x,z)-0.03,z] })
  kit.part(() => {
    // Low spray and broken foam arcs at the foot, secondary to the straight drop.
    for(const [x,z,r] of [[0.47,-0.56,0.14],[0.63,-0.53,0.19],[0.79,-0.5,0.12]] as const) kit.sphere({ r,squash:0.28,at:[x,0.75,z],color:COLORS.white,seg:8 })
    for(const [r,angle] of [[0.34,20],[0.54,190]] as const) kit.torus({ r,tube:0.016,flat:true,arc:155,rotY:angle,at:[0.6,0.76,-0.35],seg:16,color:COLORS.white })
  })
  kit.person({ at:[-1.4,0.61,1.4] })
}

// Closed triangulated rock mass: irregular perimeter, tapering crest, faceted sloped front.
function cliff(): BufferGeometry {
  const verts:number[]=[], index:number[]=[], n=12
  const levels=[0,0.6,2.0,3.45,4.05]
  for(let k=0;k<levels.length;k++) for(let i=0;i<n;i++) {
    const a=i*2*Math.PI/n, radius=1+0.11*Math.sin(i*2.7+k*0.8)
    const taper=1-k*0.065
    verts.push(0.6+1.65*Math.cos(a)*radius*taper,levels[k]!+(k===0?0:0.13*Math.sin(i*1.9+k)), -1.6+0.88*Math.sin(a)*radius*taper)
  }
  for(let k=0;k<levels.length-1;k++) for(let i=0;i<n;i++) {
    const j=(i+1)%n,a=k*n+i,b=k*n+j,c=(k+1)*n+i,d=(k+1)*n+j
    index.push(a,c,b,b,c,d)
  }
  // Caps are planar triangle fans; relief remains on the continuous side surface.
  const bottom=verts.length/3;verts.push(0.6,0,-1.6)
  const top=verts.length/3;verts.push(0.6,4.05,-1.6)
  for(let i=0;i<n;i++){const j=(i+1)%n;index.push(bottom,i,j,top,4*n+j,4*n+i)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(verts,3));g.setIndex(index)
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat
}

// Track the front of the same cliff cross-sections. This binds the thin water to the rock.
function cliffFront(y: number): number {
  const levels=[0,0.6,2.0,3.45,4.05]
  const front=(k:number)=>-1.6+0.88*(1+0.11*Math.sin(3*2.7+k*0.8))*(1-k*0.065)
  for(let k=1;k<levels.length;k++) if(y<=levels[k]!) {
    const t=(y-levels[k-1]!)/(levels[k]!-levels[k-1]!)
    return front(k-1)+(front(k)-front(k-1))*t
  }
  return front(4)
}
// A watertight thin sheet with a changing width, stepped flow and irregular edges.
function fallingRibbon(): BufferGeometry {
  const vertices:number[]=[], indices:number[]=[], rows=12,cols=5,stride=cols*2
  for(let i=0;i<=rows;i++) {
    const t=i/rows,y=0.76+t*3.11,width=0.6-0.25*t+0.035*Math.sin(i*2.4),x=0.6+0.018*Math.sin(i*1.5),z=cliffFront(y)+0.12
    for(const back of [false,true]) for(let j=0;j<cols;j++) {
      const u=j/(cols-1),rib=(j%2===1?0.025:-0.007)*Math.sin(Math.PI*u)
      vertices.push(x+width*(u-0.5),y+0.015*Math.sin(i*1.9)*u,z+rib+(back?-0.035:0))
    }
  }
  for(let i=0;i<rows;i++) {
    const a=i*stride,b=(i+1)*stride
    for(let j=0;j<cols-1;j++) {
      indices.push(a+j,a+j+1,b+j,a+j+1,b+j+1,b+j)
      indices.push(a+cols+j,b+cols+j,a+cols+j+1,a+cols+j+1,b+cols+j,b+cols+j+1)
    }
    indices.push(a,b,a+cols,a+cols,b,b+cols,a+cols-1,a+stride-1,b+cols-1,a+stride-1,b+stride-1,b+cols-1)
  }
  for(let j=0;j<cols-1;j++) {
    indices.push(j,j+cols,j+1,j+1,j+cols,j+cols+1)
    const t=rows*stride;indices.push(t+j,t+j+1,t+cols+j,t+j+1,t+cols+j+1,t+cols+j)
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
}
