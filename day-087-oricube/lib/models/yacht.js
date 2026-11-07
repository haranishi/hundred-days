// The folded strip reverses colour and forms a symmetric trapezoid below one sail.
const a=Math.SQRT1_2;
export const yacht={
  id:'yacht',name:'ヨット',reading:'よっと',level:1,minutes:3,
  paper:{width:1,height:1,rotationDeg:45,front:'#f7f4ea',back:'#4d8fc4',frontName:'白い面',backName:'空色の面'},
  steps:[
    {id:'center',title:'縦横に折り目をつける',text:'白い面を上にして、角を上下に置きます。縦と横に手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{point:[0,0],dir:[0,1]},moving:'TL',mode:'valley'},
      {type:'crease',line:{point:[0,0],dir:[1,0]},moving:'BL',mode:'valley'}]},
    {id:'tip',title:'下の角を中心へ',text:'下の角を手前に折り、折り目の交点に合わせます。',tip:'帆と船体の色を分けるための折り返しです。',ops:[
      {type:'fold',line:{point:[0,a/2],dir:[1,0]},moving:'BL',mode:'valley'}]},
    {id:'sail',title:'三角の帆を作る',text:'横の折り目で、下半分を手前に折ります。上の白い三角を帆にします。',ops:[
      {type:'fold',line:{point:[0,0],dir:[1,0]},moving:[0,a/4],mode:'valley'}]},
    {id:'hull-crease',title:'船体の折り目をつける',text:'下の辺を少し手前に折り上げ、開きます。',tip:'折り幅は三角の高さの4分の1です。重なった紙を一緒に折ります。',ops:[
      {type:'crease',line:{point:[0,-a/4],dir:[1,0]},moving:[0,0],mode:'valley'}]},
    {id:'hull',title:'船体を折り上げる',text:'折り目に沿って、下の辺を手前に折り上げます。空色の船体と白い帆のヨットです。',ops:[
      {type:'fold',line:{point:[0,-a/4],dir:[1,0]},moving:[0,0],mode:'valley',tagMoved:'hull'}]},
  ],
};
export default yacht;
