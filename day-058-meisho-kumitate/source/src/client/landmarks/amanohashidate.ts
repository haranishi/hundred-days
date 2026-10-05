// A low pine-covered curved sandbar separating two bays. All geometry is original.
import { COLORS, type Kit, type XZ } from './kit'
const center=(t:number):XZ=>[-2.9+5.95*t,-0.37+0.88*t+0.33*Math.sin(t*Math.PI*1.4)]
const halfWidth=(t:number):number=>0.13+0.12*Math.sin(t*Math.PI)**2+0.11*t
function strip(scale:number):XZ[] {
  const left:XZ[]=[],right:XZ[]=[]
  for(let i=0;i<=32;i++) {
    const t=i/32,[x,z]=center(t),width=halfWidth(t)*scale
    left.push([x,z-width]);right.push([x,z+width])
  }
  return [...left,...right.reverse()]
}
export function build(kit: Kit):void {
  kit.ground(COLORS.sea)
  kit.stage(1)
  kit.water({ r:4.62,color:'#367FA7' })
  // Aso Sea is the quieter inland water, behind the sandbar. Its mouth stays open.
  kit.water({ points:[[-3.7,-1.15],[-2.5,-2.65],[0,-3.6],[2.45,-2.35],[3.5,-0.55],[3.0,0.1],[1.7,0.23],[0.4,0.15],[-1.2,-0.1],[-2.9,-0.6]],at:[0,0.008,0],color:'#508E9F' })
  kit.extrude({ points:[[-4,-0.9],[-3.5,-1.3],[-3.15,-0.95],[-3.15,0.1],[-3.45,0.72],[-4.2,0.75]],h:0.13,color:COLORS.grass })
  kit.extrude({ points:[[2.95,0.16],[3.55,-0.1],[4.12,0.3],[3.7,1.35],[3.25,1.62],[2.91,0.91]],h:0.15,color:COLORS.grass })
  kit.stage(2)
  kit.order(-1)
  // One essential part: the whole sandbar and its pine avenue settle together before p=.55.
  kit.part(() => {
    kit.extrude({ points:strip(1),h:0.1,at:[0,0.03,0],color:'#E6D0A3' })
    kit.extrude({ points:strip(0.52),h:0.02,at:[0,0.13,0],color:'#9CAA65' })
    for(let i=0;i<31;i++) {
      const t=0.025+i*0.95/30,[x,z]=center(t)
      kit.tree({ kind:'pine',h:0.31+0.1*(0.5+0.5*Math.sin(i*2.1)),at:[x,0.15,z+(i%2?1:-1)*halfWidth(t)*0.26],rotY:i*67 })
    }
  },{appear:'grow'})
  kit.order(0)
  kit.stage(3)
  // Low footpath: no elevated road bridge is substituted for the natural landform.
  kit.part(() => {
    for(let i=0;i<24;i++) {
      const [x,z]=center(0.015+i*0.97/24),[nx,nz]=center(0.015+(i+1)*0.97/24)
      kit.beam({ from:[x,0.157,z+0.055],to:[nx,0.157,nz+0.055],size:0.012,width:0.04,color:'#D6C7A5' })
    }
  })
  kit.stage(4)
  // Secondary scenery remains low, preserving the long horizontal silhouette.
  kit.mound({ r:0.65,h:0.28,rx:0.56,rz:0.7,at:[-3.55,0.13,-0.35],color:COLORS.forest })
  kit.mound({ r:0.7,h:0.35,rx:0.57,rz:0.68,at:[3.5,0.15,0.55],color:COLORS.forest })
  for(const t of [0.28,0.55,0.8]) {const [x,z]=center(t);kit.person({ at:[x,0.16,z+0.07],h:0.08 })}
  kit.boat({ kind:'row',at:[-2.9,0.04,-1.18],rotY:40 })
}
