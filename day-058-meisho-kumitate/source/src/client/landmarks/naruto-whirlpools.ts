// Exaggerated static foam spirals under Onaruto Bridge identify a tidal seascape.
import { COLORS, type Kit } from './kit'
export function build(kit: Kit): void {
  kit.ground(COLORS.sea)
  kit.stage(1)
  kit.water({ r:4.7,color:COLORS.sea })
  for (const x of [-3.35,3.35]) kit.mound({ r:1.15,h:0.65,rx:0.7,rz:1.1,at:[x,0,-1.8],color:COLORS.forest })
  kit.stage(2)
  kit.box({ w:7.5,h:0.12,d:0.45,at:[0,1.45,-1.2],color:COLORS.concrete })
  for (const x of [-2.55,2.55]) kit.part(() => {
    for(const z of [-1.42,-0.98]) kit.box({ w:0.16,h:2.95,d:0.16,at:[x,0.03,z],color:COLORS.white })
    for(const y of [1.9,2.8]) kit.box({ w:0.16,h:0.14,d:0.6,at:[x,y,-1.2],color:COLORS.white })
  })
  kit.stage(3)
  for (const z of [-1.43,-0.97]) kit.part(() => {
    const y=(x:number)=>1.8+1.05*(x/2.55)**2
    for(let i=0;i<16;i++) {
      const x=-2.55+i*5.1/16, nx=x+5.1/16
      kit.beam({ from:[x,y(x),z],to:[nx,y(nx),z],size:0.035,color:COLORS.white })
      kit.beam({ from:[x,y(x),z],to:[x,1.56,z],size:0.017,color:COLORS.white })
    }
  })
  kit.stage(2)
  kit.order(-1)
  for(const [cx,cz,r] of [[0,1.2,1.3],[-2.2,0.6,0.55],[2.1,1.9,0.6]] as const) kit.part(() => {
    // Spiral ribbon made of solid short foam segments; no time animation/GPU update.
    for(let i=0;i<42;i++) {
      const a=i*0.29, b=(i+1)*0.29, r0=r*(1-i/50), r1=r*(1-(i+1)/50)
      kit.beam({ from:[cx+r0*Math.cos(a),0.075,cz+r0*Math.sin(a)],to:[cx+r1*Math.cos(b),0.075,cz+r1*Math.sin(b)],size:0.055,color:COLORS.white })
    }
  })
  kit.order(0)
  kit.stage(3)
  kit.torus({ r:0.18,tube:0.025,flat:true,at:[0,0.07,1.2],color:COLORS.white })
  kit.stage(4)
  kit.boat({ kind:'ship',at:[2.5,0.03,0.3],rotY:40 })
  for(const x of [-3.35,3.35]) kit.tree({ kind:'pine',h:0.5,at:[x,0.6,-1.8] })
}
