// The bottom tip passes the centre; the lid nests above the body, below that tip.
// Side flaps do not overlap the lid, so they cannot be the lower stack bound.
const a=Math.SQRT1_2;
export const pochi={
  id:'pochi',name:'ポチ袋',reading:'ぽちぶくろ',level:1,minutes:3,
  paper:{width:1,height:1,rotationDeg:45,front:'#f2c14e',back:'#a77b12',frontName:'山吹色の面',backName:'からし色の面'},
  steps:[
    {id:'center',title:'縦横に折り目をつける',text:'山吹色の面を上にして、角を上下に置きます。縦と横に手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{through:['BL','TR']},moving:'BR',mode:'valley'},
      {type:'crease',line:{through:['TL','BR']},moving:'BL',mode:'valley'}]},
    {id:'left',title:'左の角を中心へ',text:'左の角を手前に折り、中心の交点に合わせます。',ops:[
      {type:'fold',line:{point:[-a/2,0],dir:[0,1]},moving:'TL',mode:'valley',tagMoved:'sideL'}]},
    {id:'right',title:'右の角を中心へ',text:'右の角も手前に折り、中心の交点に合わせます。',ops:[
      {type:'fold',line:{point:[a/2,0],dir:[0,1]},moving:'BR',mode:'valley',tagMoved:'sideR'}]},
    {id:'bottom',title:'下の角を中心より上へ',text:'下の角を手前に折り、中心から上の角までの4分の1の位置に合わせます。',tip:'左右の折り返しも一緒に折り上げます。',ops:[
      {type:'fold',line:{point:[0,3*a/8],dir:[1,0]},moving:'BL',mode:'valley',tagMoved:'bottom',tagStationary:'body'}]},
    {id:'lid-crease',title:'ふたに折り目をつける',text:'上の角を手前に折り、中心に合わせてから開きます。',ops:[
      {type:'crease',line:{point:[0,-a/2],dir:[1,0]},moving:'TR',mode:'valley'}]},
    {id:'tuck',title:'ふたを差し込む',text:'上の角を手前に折り、下から折った三角の下へ差し込みます。ポチ袋の完成です。',tip:'先端は本体と下の三角の間に入れます。',ops:[
      {type:'fold',line:{point:[0,-a/2],dir:[1,0]},moving:'TR',mode:'valley',stack:{mode:'between',upper:'bottom',lower:'body'},guideKind:'valley',tagMoved:'lid'}]},
  ],
};
export default pochi;
