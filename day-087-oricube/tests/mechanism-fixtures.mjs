// Analytic truth is deliberately separate from the numerical solver.
export function vertexFixture(sectors=[60,90,120,90],degrees=[180,-180,180,180]) {
  let angle=0;
  const rays=sectors.map(s=>{const p=[Math.cos(angle),0,-Math.sin(angle)];angle+=s*Math.PI/180;return p;});
  return {clusters:rays.map((p,i)=>({points:[[0,0,0],p,rays[(i+1)%rays.length]]})),
    hinges:rays.map((p,i)=>({a:(i+rays.length-1)%rays.length,b:i,edge:[[0,0,0],p],degrees:degrees[i]})),pin:0,driver:0};
}
export function vertexAngles(t) {
  const a=Math.PI*t,b=t===1?-Math.PI:2*Math.atan((Math.sqrt(3)-2)*Math.tan(a/2));
  return [a,b,a,-b];
}
export function squareBaseFixture(sign=1) {
  const rays=['R','TR','T','TL','L','BL','B','BR'],degrees=[180,-180,180,0,180,-180,180,0];
  return {id:'square-base-fixture',paper:{width:1,height:1},steps:[
    {ops:[{type:'scribe',split:true,segments:[['BL','TR'],['BR','TL'],['T','B'],['L','R']]},
      {type:'tag',rect:[.66,.55,1,.75],add:['pin']}]},
    {ops:[{type:'mechanism',pin:{tags:['pin']},hinges:rays.flatMap((r,i)=>degrees[i]?
      [{line:{through:['C',r]},degrees:sign*degrees[i]}]:[])}]},
    {ops:[{type:'tag',rect:[0,0,1,1],add:['finished']}]},
  ]};
}
