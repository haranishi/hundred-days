// A diamond's radius is half the original square's diagonal.
const a=Math.SQRT1_2;
export const heart={
  id:'heart',name:'ハート',reading:'はーと',level:1,minutes:3,
  paper:{width:1,height:1,rotationDeg:45,front:'#f2e3f4',back:'#963d86',frontName:'薄藤色の面',backName:'紫の面'},
  steps:[
    {id:'center',title:'縦横に折り目をつける',text:'薄藤色の面を上にして、角を上下に置きます。縦と横に手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{through:['BL','TR']},moving:'BR',mode:'valley'},
      {type:'crease',line:{through:['TL','BR']},moving:'BL',mode:'valley'}]},
    {id:'top',title:'上の角を中心へ',text:'上の角を手前に折り、折り目の交点に合わせます。',ops:[
      {type:'fold',line:{point:[0,-a/2],dir:[1,0]},moving:'TR',mode:'valley'}]},
    {id:'bottom',title:'下の角を上の辺へ',text:'下の角を手前に折り、上の辺の真ん中に合わせます。',tip:'中心の交点より上にある、横の辺を目印にします。',ops:[
      {type:'fold',line:{point:[0,a/4],dir:[1,0]},moving:'BL',mode:'valley'}]},
    {id:'right',title:'右の辺を中心線へ',text:'右半分を手前に折り、下の辺を縦の中心線に合わせます。',tip:'重なった紙をまとめて折ります。',ops:[
      {type:'fold',line:{point:[0,a/4],dir:[1,-1]},moving:'BR',mode:'valley'}]},
    {id:'left',title:'左の辺を中心線へ',text:'左半分も手前に折り、下の辺を中心線に合わせます。',ops:[
      {type:'fold',line:{point:[0,a/4],dir:[1,1]},moving:'TL',mode:'valley'}]},
    {id:'turn',title:'裏返す',text:'全体を裏返して、小さな角を整える面を上にします。',ops:[{type:'turn',axis:'vertical'}]},
    {id:'lobes',title:'上の角を丸める',text:'上の2つの角を少し手前に折り、同じ高さにそろえます。',ops:[
      {type:'fold',line:{point:[0,-5*a/8],dir:[1,0]},moving:[a/4,-3*a/4],mode:'valley'}]},
    {id:'sides',title:'左右の角を丸める',text:'左右にとがった角も少し手前に折ります。',tip:'左右の折り幅を同じにします。',ops:[
      {type:'fold',line:{point:[-9*a/16,0],dir:[0,1]},moving:[-5*a/8,-3*a/8],mode:'valley'},
      {type:'fold',line:{point:[9*a/16,0],dir:[0,1]},moving:[5*a/8,-3*a/8],mode:'valley',together:true}]},
    {id:'finish',title:'表に返す',text:'全体を裏返します。紫のハートの完成です。',ops:[{type:'turn',axis:'vertical'}]},
  ],
};
export default heart;
