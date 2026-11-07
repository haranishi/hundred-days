// The wing crease is the bisector (11.25 degrees from the spine) of the 22.5 degree
// leading edge, so a folded wing's leading edge lands exactly on the spine as in a
// real dart. Opened 90 degrees about that inclined crease the wing is not level:
// it pitches by the crease angle (|normal.y| = cos 11.25 degrees, about .98), as a
// hand-folded dart does. A flatter crease would level it but push the leading edge
// past the spine, which is not what the instructions tell a person to fold.
const H=Math.SQRT2,Q=H-.5/Math.tan(Math.PI/8),W=.5-H*Math.tan(Math.PI/16);
export const plane={
  id:'plane',name:'紙飛行機',reading:'かみひこうき',level:1,minutes:3,
  paper:{width:1,height:H,front:'#2e7bd0',back:'#f8f5ee',frontName:'青い面',backName:'生成りの面'},
  marks:{PL:[0,H-.5],PR:[1,H-.5],QL:[0,Q],QR:[1,Q],WL:[W,0],WR:[1-W,0]},
  steps:[
    {id:'center',title:'縦半分に折り目をつける',text:'青い面を上に置きます。右半分を手前に折り、開きます。',ops:[
      {type:'crease',line:{through:['T','B']},moving:'BR',mode:'valley'}]},
    {id:'corners',title:'上の角を中心線へ',text:'左右の上の角を手前に折り、中心線に合わせます。',ops:[
      {type:'fold',line:{through:['T','PL']},moving:'TL',mode:'valley',tagMoved:'cornerL'},
      {type:'fold',line:{through:['T','PR']},moving:'TR',mode:'valley',tagMoved:'cornerR',together:true}]},
    {id:'narrow',title:'斜めの辺をもう一度中心線へ',text:'左右の斜めの辺を手前に折り、中心線に合わせます。',tip:'折り重なった紙も一緒に動かします。',ops:[
      {type:'fold',line:{through:['T','QL']},moving:'PL',mode:'valley'},
      {type:'fold',line:{through:['T','QR']},moving:'PR',mode:'valley',together:true}]},
    {id:'body',title:'中心線で山折りに半分',text:'左半分を向こうに折り、青い面を外にします。',ops:[
      {type:'fold',line:{through:['T','B']},moving:'BL',mode:'mountain',tagMoved:'halfL',tagStationary:'halfR'}]},
    {id:'wing-right',title:'手前の翼を折り下げる',text:'手前の紙だけを、細い胴を残して手前に折ります。',tip:'奥の紙は動かしません。',ops:[
      {type:'fold',line:{through:['T','WR']},moving:'BR',select:{tags:['halfR']},mode:'valley',tagMoved:'wingR'}]},
    {id:'turn',title:'裏返す',text:'全体を裏返して、反対の面を上にします。',ops:[{type:'turn',axis:'vertical'}]},
    {id:'wing-left',title:'反対の翼',text:'反対の紙も手前に折り、最初の翼とそろえます。',ops:[
      {type:'fold',line:{through:['T','WL']},moving:'BL',select:{tags:['halfL']},mode:'valley',tagMoved:'wingL'}]},
    {id:'stand',title:'立てて持つ',text:'背骨を下にして、胴を立てます。',view:'iso',ops:[
      {type:'hinge',axis:{through:['T','B']},degrees:-90}]},
    {id:'open',title:'翼を開く',text:'左右の翼を水平に開きます。紙飛行機の完成です。',ops:[
      {type:'hinge',axis:{through:['T','WR']},select:{tags:['wingR']},degrees:90},
      {type:'hinge',axis:{through:['T','WL']},select:{tags:['wingL']},degrees:-90,together:true}]},
  ],
};
export default plane;
