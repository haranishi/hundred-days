const g=1/3;
export const tray={
  id:'tray',name:'立方体の箱',reading:'りっぽうたいのはこ',level:2,minutes:5,
  paper:{width:1,height:1,front:'#2fa37a',back:'#f6f1e3',frontName:'緑の面',backName:'生成りの面'},
  marks:{bSW:[g,g],bSE:[2*g,g],bNE:[2*g,2*g],bNW:[g,2*g],
    a1:[g,0],a2:[g,1],b1:[2*g,0],b2:[2*g,1],c1:[0,g],c2:[1,g],d1:[0,2*g],d2:[1,2*g],
    eS1:[g,0],eS2:[2*g,0],eN1:[g,1],eN2:[2*g,1],eW1:[0,g],eW2:[0,2*g],eE1:[1,g],eE2:[1,2*g]},
  steps:[
    {id:'thirds-vertical',title:'縦に3等分の折り目',text:'緑の面を上に置きます。左右を手前に折り、開きます。',ops:[
      {type:'crease',line:{through:['a1','a2']},moving:'BL',mode:'valley'},
      {type:'crease',line:{through:['b1','b2']},moving:'BR',mode:'valley',together:true}]},
    {id:'thirds-horizontal',title:'横に3等分の折り目',text:'上下を手前に折り、開きます。',ops:[
      {type:'crease',line:{through:['c1','c2']},moving:'BL',mode:'valley'},
      {type:'crease',line:{through:['d1','d2']},moving:'TL',mode:'valley',together:true}]},
    {id:'corners',title:'角に斜めの折り目',text:'4つの角に、対角線の折り目を谷折りでつけます。この折り目で、次の手順に角が二つに折りたたまれます。',ops:[
      {type:'scribe',segments:[['BL','bSW'],['bSE','BR'],['TR','bNE'],['TL','bNW']],split:true},
      ...[['base',[g,g,2*g,2*g]],['wallS',[g,0,2*g,g]],['wallE',[2*g,g,1,2*g]],
        ['wallN',[g,2*g,2*g,1]],['wallW',[0,g,g,2*g]],['finSW',[0,0,g,g]],
        ['finSE',[2*g,0,1,g]],['finNE',[2*g,2*g,1,1]],['finNW',[0,2*g,g,1]]]
        .map(([tag,rect])=>({type:'tag',rect,add:[tag],together:true}))]},
    {id:'raise',title:'壁を立ち上げる',text:'4つの壁を手前に立てます。角は折り目で二つに折れます。',view:'iso',durationMs:2800,ops:[
      {type:'drive',fixed:{tags:['base']},groups:[
        {select:{tags:['wallS']},axis:{through:['bSW','bSE']},degrees:-90},
        {select:{tags:['wallE']},axis:{through:['bSE','bNE']},degrees:-90},
        {select:{tags:['wallN']},axis:{through:['bNE','bNW']},degrees:-90},
        {select:{tags:['wallW']},axis:{through:['bNW','bSW']},degrees:-90}]}]},
    {id:'fins',title:'角のひれを壁に沿わせる',text:'角のひれを外側へ回し、壁に沿わせます。ふたのない立方体の箱の完成です。',ops:[
      {type:'hinge',select:{tags:['finSW']},axis:{through:['bSW','eS1']},degrees:135,stack:'outside'},
      {type:'hinge',select:{tags:['finSE']},axis:{through:['bSE','eE1']},degrees:135,stack:'outside',together:true},
      {type:'hinge',select:{tags:['finNE']},axis:{through:['bNE','eN2']},degrees:135,stack:'outside',together:true},
      {type:'hinge',select:{tags:['finNW']},axis:{through:['bNW','eW2']},degrees:135,stack:'outside',together:true}]},
  ],
};
export default tray;
