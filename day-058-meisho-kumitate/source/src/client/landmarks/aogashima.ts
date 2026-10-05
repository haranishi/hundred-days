// Irregular sea cliffs, depressed caldera floor and visible interior cone.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COLORS, type Kit } from './kit'
export function build(kit: Kit): void {
  kit.ground(COLORS.sea)
  kit.stage(1)
  kit.water({ r:4.65,color:COLORS.sea })
  kit.mesh({ geometry: terrain(false),color:'#71765D' })
  kit.stage(2)
  kit.order(-1)
  kit.mesh({ geometry: terrain(true),color:COLORS.forest })
  kit.order(0)
  kit.stage(3)
  kit.torus({ r:0.26,tube:0.07,flat:true,at:[0.1,1.54,0.25],color:COLORS.forest,seg:16 })
  kit.cylinder({ r:0.23,h:0.025,at:[0.1,1.60,0.25],color:COLORS.soil,seg:12 })
  kit.stage(4)
  for(const [x,z,y] of [[-1.7,0.8,0.61],[1.7,0.7,0.61],[-1.5,-0.8,0.62],[1.4,-1,0.61]] as const) kit.tree({ kind:'round',h:0.22,at:[x,y,z] })
  for(const x of [-0.6,0,0.6]) kit.part(() => {
    kit.box({ w:0.22,h:0.15,d:0.23,at:[x,1.48,-2.3],color:COLORS.white })
    kit.gableRoof({ w:0.22,d:0.23,h:0.09,at:[x,1.63,-2.3],color:COLORS.roofTile })
  })
}
// One watertight triangulated terrain. Interior center and exterior rim share vertices.
function terrain(upper: boolean): BufferGeometry {
  const n=32, verts:number[]=[], indices:number[]=[]
  const rings: readonly (readonly [number,number])[]=upper ? [[0,1.63],[0.42,1.5],[0.85,1.15],[1.3,0.6],[1.8,0.57],[2.2,0.83],[2.65,1.96],[2.91,1.56],[3.23,0.42]] : [[0,0.44],[2.7,0.44],[3.23,0.42],[3.45,0.04]]
  for(let k=0;k<rings.length;k++) for(let i=0;i<n;i++) {
    const a=i*2*Math.PI/n, [r,y]=rings[k]!
    const rough=1+0.07*Math.sin(a*3+0.3)+0.025*Math.cos(a*7)
    // Lower near rim exposes the inner cone from the default oblique camera.
    const rimDrop=upper&&k>=5&&k<=7 ? 0.4*Math.max(0,Math.sin(a)) : 0
    const h=y+(r===0?0:0.075*Math.sin(a*5+k*0.45))-rimDrop
    verts.push((upper&&k<3?0.1:0)+r*Math.cos(a)*rough,h,(upper&&k<3?0.25:0)+r*Math.sin(a)*rough*0.86)
  }
  for(let k=0;k<rings.length-1;k++) for(let i=0;i<n;i++) {
    const j=(i+1)%n,a=k*n+i,b=k*n+j,c=(k+1)*n+i,d=(k+1)*n+j
    indices.push(a,b,c,b,d,c)
  }
  const bottom=verts.length/3;verts.push(0,0.01,0)
  const last=(rings.length-1)*n
  for(let i=0;i<n;i++) {const j=(i+1)%n; indices.push(last+i,last+j,bottom)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(verts,3));g.setIndex(indices)
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();return flat
}
