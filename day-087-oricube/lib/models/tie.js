// Equal kite bisectors keep the side flaps from folding across one another.
// The hidden top corner reveals ivory at the knot after the upper pleat.
const a=Math.SQRT1_2,k=Math.tan(Math.PI/8);
export const tie={
  id:'tie',name:'ネクタイ',reading:'ねくたい',level:1,minutes:3,
  paper:{width:1,height:1,rotationDeg:45,front:'#f4efe6',back:'#353943',frontName:'生成りの面',backName:'炭色の面'},
  steps:[
    {id:'center',title:'縦に折り目をつける',text:'生成りの面を上にして、角を上下に置きます。左右の角を合わせて手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{point:[0,0],dir:[0,1]},moving:'TL',mode:'valley'}]},
    {id:'knot-colour',title:'上の角を小さく折る',text:'上の角を向こうに折ります。結び目に出る色を準備します。',tip:'折り幅は、上の角から中心までの約5分の1です。',ops:[
      {type:'fold',line:{point:[0,-.55],dir:[1,0]},moving:'TR',mode:'mountain'}]},
    {id:'upper-sides',title:'左右の上の辺を中心へ',text:'左上と右上の辺を、縦の折り目に合わせて手前に折ります。',tip:'上の小さな折り返しも一緒に折ります。',ops:[
      {type:'fold',line:{point:[0,-a],dir:[-k,1]},moving:'TL',mode:'valley'},
      {type:'fold',line:{point:[0,-a],dir:[k,1]},moving:'BR',mode:'valley'}]},
    {id:'blade',title:'左右の下の辺も中心へ',text:'左下と右下の辺も、中心の折り目に合わせて手前に折ります。細長い剣先を作ります。',tip:'先端がずれないように、重なった紙を一緒に折ります。',ops:[
      {type:'fold',line:{point:[0,a],dir:[-k,-1]},moving:[-.4,0],mode:'valley'},
      {type:'fold',line:{point:[0,a],dir:[k,-1]},moving:[.4,0],mode:'valley'}]},
    {id:'knot-down',title:'上側を折り下げる',text:'中心より少し上で、上側の紙をまとめて向こうに折ります。',tip:'下の剣先は動かしません。',ops:[
      {type:'fold',line:{point:[0,-.2],dir:[1,0]},moving:[0,-.55],mode:'mountain',tagMoved:'knot'}]},
    {id:'knot-return',title:'結び目を折り返す',text:'今折った上側だけを、少しずらして手前に折り返します。結び目の上に生成りの面が細く出る、ネクタイの完成です。',tip:'前の折り線より少し下で折り返し、左右のくびれをそろえます。',ops:[
      {type:'fold',line:{point:[0,-.125],dir:[1,0]},moving:[0,.15],select:{tags:['knot']},mode:'valley'}]},
  ],
};
export default tie;
