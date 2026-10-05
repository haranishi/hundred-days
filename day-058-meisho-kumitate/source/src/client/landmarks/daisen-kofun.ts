// The officially named imperial tomb: keyhole mound and three moats, no burial attribution.
import { COLORS, type Kit, type XZ } from './kit'
function outline(scale:number):XZ[] {
  const p:XZ[]=[]
  for(let i=0;i<=32;i++){const a=(-140+i*280/32)*Math.PI/180;p.push([1.3*Math.sin(a)*scale,(-1.05-1.3*Math.cos(a))*scale])}
  p.push([1.58*scale,2.08*scale],[-1.58*scale,2.08*scale]);return p
}
export function build(kit:Kit):void {
  kit.ground(COLORS.lawn)
  kit.stage(1)
  kit.extrude({ points:outline(1.54),h:0.025,color:COLORS.gravel })
  kit.stage(2);kit.order(-1)
  kit.part(() => {
    // Nested filled footprints form three open water rings without disconnected banks.
    for(const [scale,y,color] of [[1.49,0.025,COLORS.pond],[1.39,0.055,COLORS.grass],[1.3,0.08,COLORS.pond],[1.19,0.11,COLORS.grass],[1.1,0.135,COLORS.pond]] as const)
      kit.extrude({ points:outline(scale),h:0.03,at:[0,y,0],color,finish:color===COLORS.pond?'water':'matte' })
    for(const [scale,y,h] of [[1,0.165,0.28],[0.87,0.445,0.25],[0.74,0.695,0.22]] as const)
      kit.extrude({ points:outline(scale),h,at:[0,y,0],color:'#568143' })
  },{appear:'grow'});kit.order(0)
  kit.stage(3)
  kit.part(() => {
    // Low woodland patches add living texture without masking the aerial keyhole outline.
    for(let i=0;i<12;i++){const a=i*Math.PI/6;kit.tree({ kind:'round',h:0.2,at:[0.65*Math.sin(a),0.915,-0.77-0.58*Math.cos(a)],color:COLORS.forest })}
    for(const x of [-0.7,0,0.7])kit.tree({ kind:'round',h:0.18,at:[x,0.915,1.18],color:COLORS.forest })
  })
  kit.stage(4)
  kit.box({ w:0.75,h:0.025,d:0.45,at:[0,0,3.6],color:COLORS.pavement })
  for(const x of [-0.23,0.22])kit.person({ at:[x,0.025,3.67],h:0.085 })
}
