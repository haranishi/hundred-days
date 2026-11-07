// Independently constructed bird-base geometry. The paper's side is one.
// The stage principle follows Hu & Liang, arXiv:2006.05025, section 5.2;
// the coordinates below come from the 22.5-degree angle bisectors.
export const petalInset=1-Math.SQRT1_2;
export const squareAssignments=[
  [-180,0,180,0,180,0,180,0], [180,0,-180,0,180,0,180,0],
  [180,0,180,0,-180,0,180,0], [-180,0,-180,0,-180,0,180,0],
  [180,-180,180,0,180,-180,180,0], [180,0,180,0,180,0,-180,0],
  [-180,0,-180,0,180,0,-180,0], [-180,0,180,0,-180,0,-180,0],
  [180,0,-180,0,-180,0,-180,0], [-180,180,-180,0,-180,180,-180,0],
  [-180,0,-180,180,-180,0,-180,180], [180,0,180,-180,180,0,180,-180],
];
const spin=(p,k)=>{
  let [x,y]=p.map(v=>v-.5);for(let i=0;i<k;i++) [x,y]=[-y,x];return [x+.5,y+.5];
};
export function craneBaseFixture({sign=1,assignment=squareAssignments[4]}={}) {
  const rays=['R','TR','T','TL','L','BL','B','BR'],a=petalInset,segments=[],hinges=[];
  const petalSign=sign*Math.sign(assignment[0]),pair=assignment[1]===0&&assignment[3]!==0?1:0;
  for(let k=0;k<4;k++) {
    const tip=spin([1,0],k),kr=spin([.5+a,.5],k),kl=spin([.5,.5-a],k);
    segments.push([tip,kr],[tip,kl],[kr,kl]);
    hinges.push({line:{through:[tip,kr]},degrees:petalSign*180},{line:{through:[tip,kl]},degrees:petalSign*180});
    if(k%2===pair) hinges.push({line:{through:[kr,kl]},degrees:-petalSign*180});
  }
  segments.push(['BL','TR'],['BR','TL'],['T','B'],['L','R']);
  for(const r of ['R','T','L','B']) {
    const p={R:[1,.5],T:[.5,1],L:[0,.5],B:[.5,0]}[r],q=p.map(x=>.5+(x-.5)*2*a);
    hinges.push({line:{through:[q,p]},degrees:0});
  }
  return {id:'crane-bird-base',paper:{width:1,height:1},steps:[
    {id:'pattern',ops:[{type:'scribe',split:true,segments:segments.map(e=>e.map(p=>
      typeof p==='string'?p:[p[0]-.5,.5-p[1]]))},
      {type:'tag',rect:[.66,.55,1,.75],add:['square-pin']},
      {type:'tag',rect:[.646,.451,.647,.452],add:['petal-pin']}]},
    {id:'square',ops:[{type:'mechanism',pin:{tags:['square-pin']},hinges:rays.flatMap((r,i)=>assignment[i]?
      [{line:{through:['C',r]},degrees:sign*assignment[i]}]:[])}]},
    {id:'petals',ops:[{type:'mechanism',pin:{tags:['petal-pin']},hinges}]},
  ]};
}
