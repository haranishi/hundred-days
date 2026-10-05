// Dense, uneven five/six-sided coastal columns surrounding a sea inlet.
import { COLORS, type Kit, type XZ } from './kit'
export function build(kit:Kit):void {
  kit.ground(COLORS.sea)
  kit.stage(1)
  kit.water({ r:4.65,color:'#347F9E' })
  kit.extrude({ points:[[-3.45,-2.5],[3.45,-2.5],[3.5,-0.6],[3.25,0.6],[2.0,0.5],[1.7,-0.2],[0.8,-0.65],[-0.35,-0.4],[-1.1,0.25],[-2.5,0.85],[-3.2,0.2]],h:0.13,color:'#929080' })
  kit.stage(2);kit.order(-1)
  kit.part(() => {
    // Touching columns are rooted on the basal landmass and vary in height along the inlet.
    for(let row=0;row<5;row++)for(let col=0;col<14;col++) {
      const x=-2.9+col*0.435+(row%2)*0.215,z=-2.05+row*0.37
      if(row>2&&x> -0.65&&x<1.7)continue
      const h=1.12+0.6*Math.sin((col+1)*0.51)**2+0.18*Math.cos(row*1.8+col*1.1)-(row>2?0.4:0)
      const poly:XZ[]=[];const n=col%4===0?5:6
      for(let i=0;i<n;i++){const a=i*2*Math.PI/n+Math.PI/6;poly.push([x+0.267*Math.cos(a),z+0.267*Math.sin(a)])}
      kit.extrude({ points:poly,h,at:[0,0.13,0],color:col%3===0?'#A39D8C':'#8D8C7F' })
    }
    for(const [x,z,h] of [[-2.6,0.25,0.42],[-2.0,0.18,0.6],[2.45,0.2,0.65],[2.88,-0.1,0.8]] as const)kit.cylinder({ r:0.31,h,at:[x,0.13,z],seg:6,color:'#969180' })
  },{appear:'grow'});kit.order(0)
  kit.stage(3)
  kit.part(() => {
    for(const [x,z,r] of [[0.2,-0.1,0.5],[1.3,0.45,0.55],[-1.3,0.8,0.4]] as const)kit.torus({ r,tube:0.018,flat:true,arc:160,seg:18,at:[x,0.035,z],color:'#ECF0E8' })
  })
  kit.stage(4)
  kit.boat({ kind:'row',at:[0.3,0.04,1.65],rotY:55 })
}
