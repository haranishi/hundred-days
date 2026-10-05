// Continuous walkable stone bridge pierced by two equal semicircular arches.
import { ExtrudeGeometry, Shape } from 'three'
import { COLORS, type Kit } from './kit'
const deckY=(x:number):number=>1.05+0.7*Math.sin(Math.PI*(2.55-Math.abs(x))/5.1)+0.24*Math.sin(Math.PI*Math.abs(x)/2.55)
export function build(kit: Kit): void {
  kit.ground(COLORS.pavement)
  kit.stage(1)
  kit.water({ points:[[-2.5,-3.4],[2.5,-3.4],[2.5,3.4],[-2.5,3.4]],color:COLORS.pond })
  for(const x of [-3.0,3.0]) kit.box({ w:0.85,h:0.48,d:6.6,at:[x,0,0],color:COLORS.stone })
  kit.stage(2)
  // Both spans and their deck are a single landing part: neither appears alone.
  const s=new Shape();s.moveTo(-2.55,0.04);s.lineTo(-2.25,0.04)
  for(const cx of [-1.2,1.2]) {
    s.lineTo(cx-1.05,0.27)
    for(let i=0;i<=20;i++){const a=Math.PI-i*Math.PI/20;s.lineTo(cx+1.05*Math.cos(a),0.27+1.05*Math.sin(a))}
    s.lineTo(cx+1.05,0.04);s.lineTo(cx+1.35,0.04)
  }
  for(let i=0;i<=40;i++){const x=2.55-i*5.1/40;s.lineTo(x,deckY(x))}
  s.closePath()
  const g=new ExtrudeGeometry(s,{depth:1.02,bevelEnabled:false,steps:1,curveSegments:16});g.translate(0,0,-0.51)
  kit.mesh({ geometry:g,color:'#AAA493' })
  kit.stage(3)
  for(const z of [-0.48,0.48]) kit.part(() => {
    const y=deckY
    for(let i=0;i<32;i++) {
      const x=-2.55+i*5.1/32,nx=x+5.1/32
      kit.beam({ from:[x,y(x)+0.25,z],to:[nx,y(nx)+0.25,z],size:0.075,color:COLORS.stone })
      if(i%2===0) kit.beam({ from:[x,y(x),z],to:[x,y(x)+0.25,z],size:0.055,color:COLORS.stone })
    }
  })
  kit.stage(4)
  for(const x of [-3.15,3.15]) {kit.tree({ h:0.6,at:[x,0.48,-1.9] });kit.person({ at:[x,0.48,1.4] })}
}
