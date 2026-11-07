import {hatFixture} from './mechanism-feasibility.mjs';
export function hatPocketFixture() {
  const def=hatFixture(),h=Math.SQRT2/2;def.id='hat-pocket-fixture';
  // The brim reverses the new crease's mountain/valley assignment.
  def.steps.push({id:'open-pocket',ops:[{type:'mechanism',pin:{tags:['pin']},hinges:[
    {line:{through:['C',[.5,h-.5]]},degrees:90},
    {line:{through:[[.5,h-.5],'B']},degrees:-90},
    {line:{through:['C',[.5,h+.5]]},degrees:90},
    {line:{through:[[.5,h+.5],'T']},degrees:-90},
    {line:{through:['C','R']},degrees:90},
    {line:{through:['C','L']},degrees:90},
  ]}]});
  return def;
}
export function cupFlatFixture() {
  const L=Math.SQRT1_2,h=L*(2-Math.SQRT2),x=L-h;
  return {id:'cup-flat-fixture',paper:{width:1,height:1,rotationDeg:45},steps:[
    {ops:[{type:'fold',line:{through:['TL','BR']},moving:'BL',mode:'valley',tagMoved:'back',tagStationary:'front'}]},
    {ops:[{type:'fold',line:{perpBisector:['TL',[x,-h]]},moving:'TL',mode:'valley',tagMoved:'left-flap'}]},
    {ops:[{type:'fold',line:{perpBisector:['BR',[-x,-h]]},moving:'BR',mode:'valley',tagMoved:'right-flap'}]},
    {ops:[{type:'tag',rect:[.25,.15,.5,.4],add:['body']},
      {type:'fold',line:{point:[0,-h],dir:[1,0]},moving:'TR',mode:'mountain',select:{tags:['front']}}]},
    {ops:[{type:'fold',line:{point:[0,-h],dir:[1,0]},moving:'BL',mode:'valley',select:{tags:['back']},
      stack:{mode:'between',upper:'left-flap',lower:'body'}}]},
    {ops:[{type:'scribe',split:true,segments:[[[0,-h],[0,0]]]}]},
  ]};
}
