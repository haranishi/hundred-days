// Two crown pleats leave four concave corners; the lower kite stays a brown trunk.
const a=Math.SQRT1_2,k=Math.tan(Math.PI/8);
export const tree={
  id:'tree',name:'もみの木',reading:'もみのき',level:1,minutes:3,
  paper:{width:1,height:1,rotationDeg:45,front:'#8a5a3b',back:'#3f9e55',frontName:'茶色の面',backName:'若葉色の面'},
  steps:[
    {id:'center',title:'縦に折り目をつける',text:'茶色の面を上にして、角を上下に置きます。左右の角を合わせて手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{point:[0,0],dir:[0,1]},moving:'TL',mode:'valley'}]},
    {id:'left',title:'左上の辺を中心へ',text:'左上の辺を中心の折り目に合わせて手前に折ります。',ops:[
      {type:'fold',line:{point:[0,-a],dir:[-k,1]},moving:'TL',mode:'valley'}]},
    {id:'right',title:'右上の辺を中心へ',text:'右上の辺も中心に合わせて手前に折り、細長い凧の形にします。',ops:[
      {type:'fold',line:{point:[0,-a],dir:[k,1]},moving:'BR',mode:'valley'}]},
    {id:'trunk',title:'幹の先を整える',text:'下の茶色い角を少し向こうに折り、幹の底を平らにします。',tip:'折り線は中心と下の角の間の、下寄りの位置です。',ops:[
      {type:'fold',line:{point:[0,.5],dir:[1,0]},moving:'BL',mode:'mountain',tagMoved:'trunkTip'}]},
    {id:'lower-tier',title:'下の段を折る',text:'葉の上側を向こうに折り、少しずらして手前に折り返します。左右に段を作ります。',tip:'折り返すのは今動かした上側の紙だけです。',ops:[
      {type:'fold',line:{point:[0,-.1],dir:[1,0]},moving:[0,-a],mode:'mountain',tagMoved:'tier1'},
      {type:'fold',line:{point:[0,-.05],dir:[1,0]},moving:[0,a-.2],select:{tags:['tier1']},mode:'valley'}]},
    {id:'upper-tier',title:'上の段を折る',text:'先端に近いところも、向こうに折ってから小さく手前に折り返します。3段のもみの木です。',tip:'幹は動かさず、上の三角だけを折ります。',ops:[
      {type:'fold',line:{point:[0,-.35],dir:[1,0]},moving:[0,.1-a],mode:'mountain',tagMoved:'tier2'},
      {type:'fold',line:{point:[0,-.32],dir:[1,0]},moving:[0,a-.8],select:{tags:['tier2']},mode:'valley'}]},
  ],
};
export default tree;
