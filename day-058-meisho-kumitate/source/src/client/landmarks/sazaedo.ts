// Exterior study: enclosed hexagonal timber hall, curved eaves and a large entrance canopy.
// The historical double helix is internal; no invented exposed spiral walkway is shown.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COLORS, type Kit } from './kit'
export function build(kit:Kit):void {
  kit.ground(COLORS.gravel)
  kit.stage(1)
  kit.cylinder({ r:1.5,h:0.18,seg:6,color:COLORS.stone })
  kit.box({ w:2.05,h:0.18,d:0.75,at:[0,0,1.24],color:COLORS.stone })
  kit.stairs({ w:1.15,d:0.85,h:0.32,at:[0,0,1.5],steps:5,color:'#62574A' })
  kit.stage(2);kit.order(-1)
  kit.part(() => {
    kit.cylinder({ r:1.19,h:3.02,at:[0,0.18,0],seg:6,color:'#75634F' })
    // Narrow board seams, not the heavy cross-braces of a watchtower.
    for(let side=0;side<6;side++) {
      const a=side*Math.PI/3,b=(side+1)*Math.PI/3,rotY=(a+b)*90/Math.PI
      const [cx,cz]=hexPoint((a+b)/2,1.205)
      for(const offset of [-0.39,-0.13,0.13,0.39]) {
        const dx=Math.cos((a+b)/2)*offset,dz=-Math.sin((a+b)/2)*offset
        kit.box({ w:0.016,h:2.9,d:0.025,at:[cx+dx,0.22,cz+dz],rotY,color:'#655641' })
      }
      // Recessed windows retain timber wall above/below; their small bars avoid scaffold bands.
      for(const y of [1.32,2.42]) {
        kit.box({ w:0.74,h:0.35,d:0.03,at:[cx,y,cz],rotY,color:'#302A23' })
        for(const offset of [-0.27,-0.135,0,0.135,0.27]) {
          const dx=Math.cos((a+b)/2)*offset,dz=-Math.sin((a+b)/2)*offset
          kit.box({ w:0.026,h:0.35,d:0.04,at:[cx+dx,y,cz+dz],rotY,color:'#9B8568' })
        }
      }
    }
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3
      kit.cylinder({ r:0.06,h:3.06,at:[1.19*Math.sin(a),0.18,1.19*Math.cos(a)],seg:6,color:'#8C7558' })
    }
    // Uneven/sloping window-side eaves are shallow; the broad top roof dominates.
    kit.mesh({ geometry:hexEave(1.12,1.32,1.1,0.045,0.07),color:'#564936' })
    kit.mesh({ geometry:hexEave(1.12,1.36,2.18,0.07,0.07),color:'#564936' })
    kit.mesh({ geometry:hexEave(1.08,1.64,3.2,0.13,0),color:COLORS.roofBark })
    kit.cylinder({ r:1.25,rTop:0.06,h:0.64,at:[0,3.2,0],seg:6,color:COLORS.roofBark })
    // Large curved entrance pediment, almost the hall's width, rather than a small shed roof.
    kit.mesh({ geometry:entranceCanopy(),color:COLORS.roofBark })
    kit.box({ w:0.7,h:1.23,d:0.045,at:[0,0.32,1.21],color:'#211D18' })
    for(const x of [-0.91,0.91])kit.cylinder({ r:0.065,h:1.54,at:[x,0.18,1.53],seg:6,color:'#8C7558' })
    kit.beam({ from:[-0.91,1.62,1.53],to:[0.91,1.62,1.53],size:0.1,color:'#8C7558' })
  });kit.order(0)
  kit.stage(3)
  kit.part(() => {
    // Thin rafters are supported by the upper wall and finish below the roof edge.
    for(let side=0;side<6;side++)for(const offset of [-0.2,0,0.2]) {
      const a=(side+0.5)*Math.PI/3+offset,p=hexPoint(a,1.1),q=hexPoint(a,1.55)
      kit.beam({ from:[p[0],3.22,p[1]],to:[q[0],3.38,q[1]],size:0.035,color:'#90795C' })
    }
    kit.cylinder({ r:0.05,h:0.09,at:[0,3.84,0],seg:6,color:COLORS.wood })
  })
  kit.stage(4)
  for(const [x,z] of [[-2.1,-1.8],[2.2,-1.6],[-2.6,0.4],[2.5,0.5]] as const)kit.tree({ kind:'pine',h:0.9,at:[x,0,z] })
  kit.person({ at:[0.8,0,2.5],h:0.12 })
}
function hexPoint(a:number,r:number):readonly [number,number] {
  const normalized=((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI),i=Math.floor(normalized/(Math.PI/3)),t=(normalized-i*Math.PI/3)/(Math.PI/3)
  return [r*((1-t)*Math.sin(i*Math.PI/3)+t*Math.sin((i+1)*Math.PI/3)),r*((1-t)*Math.cos(i*Math.PI/3)+t*Math.cos((i+1)*Math.PI/3))]
}
// Each sector starts with two upward top triangles, then bottom/inner/outer faces.
function hexEave(inner:number,outer:number,y:number,rise:number,tilt:number):BufferGeometry {
  const v:number[]=[],idx:number[]=[],n=48
  for(let i=0;i<n;i++) {
    const a=i*2*Math.PI/n,p=hexPoint(a,inner),q=hexPoint(a,outer),dy=tilt*Math.sin(a)
    v.push(p[0],y+dy,p[1],q[0],y+rise+dy,q[1],p[0],y+dy-0.08,p[1],q[0],y+rise+dy-0.08,q[1])
  }
  for(let i=0;i<n;i++) {
    const a=i*4,b=((i+1)%n)*4
    idx.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1)
  }
  return closedGeometry(v,idx)
}
function entranceCanopy():BufferGeometry {
  const v:number[]=[],idx:number[]=[],n=32
  for(let i=0;i<=n;i++) {
    const x=-1.32+2.64*i/n,y=1.73+0.43*Math.cos(x/1.32*Math.PI/2)**2+0.07*(Math.abs(x)/1.32)**8
    v.push(x,y,1.0,x,y,1.91,x,y-0.12,1.0,x,y-0.12,1.91)
  }
  for(let i=0;i<n;i++){const a=i*4,b=(i+1)*4;idx.push(a,a+1,b,a+1,b+1,b,a+2,b+2,a+3,a+3,b+2,b+3,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1)}
  idx.push(0,2,1,1,2,3,n*4,n*4+1,n*4+2,n*4+1,n*4+3,n*4+2)
  return closedGeometry(v,idx)
}
function closedGeometry(v:number[],idx:number[]):BufferGeometry {
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();return g
}
