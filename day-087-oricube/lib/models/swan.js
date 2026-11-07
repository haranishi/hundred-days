// Reverse folds name their two stationary bounds explicitly. Auto stacking would
// put the neck outside the body, even though its projected silhouette looks right.
// The head selects neck layers because the infinite head line also crosses the tail.
// A .05 neck base and .45 head base leave the beak above and ahead of the body.
export const swan={
  id:'swan',name:'白鳥',reading:'はくちょう',level:2,minutes:5,
  paper:{width:1,height:1,rotationDeg:45,front:'#fbfaf6',back:'#e8738a',frontName:'白い面',backName:'桜色の面'},
  marks:{PL:[Math.SQRT2-1,1],PR:[1,Math.SQRT2-1]},
  steps:[
    {id:'center',title:'対角線に折り目',text:'白い面を上に置きます。対角線で手前に折り、開きます。',view:'flat',ops:[
      {type:'crease',line:{through:['BL','TR']},moving:'BR',mode:'valley'}]},
    {id:'kite',title:'左右の辺を中心線へ',text:'左右の辺を手前に折り、中心線に合わせて凧の形にします。',ops:[
      {type:'fold',line:{through:['BL','PL']},moving:'TL',mode:'valley',tagMoved:'kite'},
      {type:'fold',line:{through:['BL','PR']},moving:'BR',mode:'valley',tagMoved:'kite',together:true}]},
    {id:'body',title:'半分に折る',text:'左半分を手前に折り、右半分に重ねます。桜色の面が外に出ます。',ops:[
      {type:'fold',line:{through:['BL','TR']},moving:'PL',mode:'valley',tagMoved:'halfL',tagStationary:'halfR'}]},
    {id:'neck',title:'首を中割り折り',text:'細くとがったほうの先端を、折り筋で内側へ折り込みます。胴の紙の間に入れて、先端を裏返します。',tip:'中割り折りは、折り筋をつけてから、先端を紙の間へ押し込んで裏返す折り方です。首は胴の外ではなく間に収まります。',durationMs:3800,ops:[
      {type:'fold',line:{point:[0,.05],dir:[1,1]},moving:'BL',mode:'valley',stack:{mode:'between',upper:'halfL',lower:'halfR'},tagMoved:'neck'}]},
    {id:'head',title:'頭を中割り折り',text:'首の先端も同じ要領で紙の間へ折り込み、前を向く頭にします。',tip:'首の細い先端を、もう一度、中割り折りします。',durationMs:3800,ops:[
      {type:'fold',line:{point:[.45,.05],dir:[1,1]},moving:'BL',select:{tags:['neck']},mode:'valley',stack:{mode:'between',upper:'halfR',lower:'halfL'},tagMoved:'head'}]},
    {id:'stand',title:'立たせる',text:'背骨を下にして立たせます。白鳥の完成です。',view:'side',ops:[
      {type:'hinge',axis:{through:[[0,-.7],[0,.05]]},degrees:90}]},
  ],
};
export default swan;
