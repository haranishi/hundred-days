// Current tower: four splayed legs, slender octagonal shaft and broad layered crown.
import { COLORS, type Kit } from './kit'
export function build(kit: Kit): void {
  const steel = '#C5C8C7'
  kit.ground(COLORS.road)
  kit.stage(1)
  kit.box({ w: 2.6,h:0.04,d:2.4,color:COLORS.pavement })
  kit.lattice({ w0:2.2,w1:1.05,h:1.15,faces:false,post:0.16,at:[0,0.04,0],color:steel })
  kit.cylinder({ r:0.8,h:0.25,at:[0,1.2,0],seg:8,color:COLORS.white })
  kit.stage(2)
  kit.lattice({ w0:1.02,w1:0.82,h:2.65,at:[0,1.45,0],bays:5,post:0.07,member:0.03,color:steel })
  // Vertical blank panels suggest the shaft without reproducing trademarks or text.
  for (const z of [-0.46,0.46]) kit.box({ w:0.38,h:2.45,d:0.025,at:[0,1.55,z],color:COLORS.white })
  kit.stage(3)
  for (let i=0;i<3;i++) kit.part(() => {
    kit.cylinder({ r:1.03-i*0.035,h:0.075,at:[0,4.05+i*0.25,0],seg:8,rotY:22.5,color:steel })
    kit.cylinder({ r:0.96-i*0.035,h:0.18,at:[0,4.125+i*0.25,0],seg:8,rotY:22.5,color:COLORS.glass })
  })
  kit.cylinder({ r:0.94,h:0.1,at:[0,4.8,0],seg:8,color:steel })
  kit.cylinder({ r:0.16,h:0.55,at:[0,4.9,0],seg:8,color:steel })
  kit.cylinder({ r:0.04,h:0.38,at:[0,5.45,0],seg:6,color:steel })
  kit.stage(4)
  for (const x of [-2.2,2.2]) for (const z of [-1.8,0,1.8]) kit.part(() => {
    kit.box({ w:0.85,h:0.65,d:1.05,at:[x,0,z],color: x<0? '#D7BB90':'#D5D6D0' })
    kit.box({ w:0.88,h:0.06,d:1.08,at:[x,0.65,z],color:COLORS.roofTile })
  })
  for (const x of [-0.6,0.3,0.8]) kit.person({ at:[x,0,2.3] })
}
