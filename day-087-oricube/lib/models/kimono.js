// Fold the free inner corners, not the corners attached to the gate hinges.
// Overlapping gates give the collars a real area in which left is below right.
const w=.2;
export const kimono={
  id:'kimono',name:'着物',reading:'きもの',level:2,minutes:5,
  paper:{width:1,height:1,front:'#35343b',back:'#f3c99c',frontName:'墨色の面',backName:'杏色の面'},
  steps:[
    {id:'center',title:'縦半分に折り目をつける',text:'墨色の面を上に置きます。縦半分に手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{through:['T','B']},moving:'TL',mode:'valley'}]},
    {id:'left',title:'左の辺を中心より少し先へ',text:'左の辺を手前に折り、中心を少し越えて重ねます。',tip:'折り幅は紙の幅の10分の3です。',ops:[
      {type:'fold',line:{point:[-w,0],dir:[0,1]},moving:'TL',mode:'valley',tagMoved:'left'}]},
    {id:'right',title:'右の辺も同じ幅で折る',text:'右の辺を手前に折り、同じ幅で重ねます。',ops:[
      {type:'fold',line:{point:[w,0],dir:[0,1]},moving:'TR',mode:'valley',tagMoved:'right'}]},
    {id:'collar-left',title:'左の襟を斜めに返す',text:'左から折った紙の、上の内側の角だけを手前に折ります。墨色の襟を出します。',tip:'外側の折り目の端から、内側の辺へ斜めに折ります。',ops:[
      {type:'fold',line:{point:[-w,-.5],dir:[1,1]},moving:[.1,-.5],select:{tags:['left']},mode:'valley',tagMoved:'collarL'}]},
    {id:'collar-right',title:'右の襟を重ねる',text:'右から折った紙の内側の角も手前に折り、左の襟の上に重ねます。',tip:'画面の左の襟が下になる、右前の合わせです。',ops:[
      {type:'fold',line:{point:[w,-.5],dir:[1,-1]},moving:[-.1,-.5],select:{tags:['right']},mode:'valley',tagMoved:'collarR'}]},
    {id:'hem',title:'裾を折り上げる',text:'下の縁を少し手前に折り上げます。袖を省いた着物の完成です。',tip:'折り幅は元の紙の高さの10分の1です。',ops:[
      {type:'fold',line:{point:[0,.4],dir:[1,0]},moving:'B',mode:'valley',tagMoved:'hem'}]},
  ],
};
export default kimono;
