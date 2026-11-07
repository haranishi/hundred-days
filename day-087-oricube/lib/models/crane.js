// The four-petal pattern uses the validated C1/C2 branch. All coordinates are
// derived from the square's angle bisectors; no sampled mesh is embedded here.
const a=1-Math.SQRT1_2,b=(Math.SQRT2-1)/2,tip=Math.SQRT1_2;
const world=(q,r)=>[(q+r)*Math.SQRT1_2,(r-q)*Math.SQRT1_2];
const spin=(p,k)=>{
  let [x,y]=p.map(v=>v-.5);
  for(let i=0;i<k;i++) [x,y]=[-y,x];
  return [x+.5,y+.5];
};
const pattern=[],petals=[];
for(let k=0;k<4;k++) {
  const p=spin([1,0],k),r=spin([.5+a,.5],k),l=spin([.5,.5-a],k);
  pattern.push([p,r],[p,l],[r,l]);
  petals.push({line:{through:[p,r]},degrees:180},{line:{through:[p,l]},degrees:180});
  if(k%2===0) petals.push({line:{through:[r,l]},degrees:-180});
}
pattern.push(['BL','TR'],['BR','TL'],['T','B'],['L','R']);
for(const p of [[1,.5],[.5,1],[0,.5],[.5,0]])
  petals.push({line:{through:[p.map(x=>.5+(x-.5)*2*a),p]},degrees:0});
const narrow=(side,rear=false)=>{
  // A vertical turn reflects x about the unchanged bounding-box centre a/2.
  const reflect=p=>[a-p[0],p[1]],slope=Math.tan(Math.PI/16);
  const p=world(tip,0),d=world(-1,side*slope),moving=world(b,side*b);
  return {type:'fold',line:{point:rear?reflect(p):p,dir:rear?[-d[0],d[1]]:d},
    moving:rear?reflect(moving):moving,mode:'valley',select:{tags:[rear?'rear':'front']}};
};
const raise=(tag,side)=>({type:'fold',line:{point:world(b,0),dir:world(1,side*2.5)},
  moving:side>0?'TR':'BL',select:{tags:[tag]},mode:'valley',
  tagMoved:side>0?'neck':'tail',stack:{mode:'between',upper:'front',lower:'rear'}});
// Reflect a length of .1 at the neck tip into a horizontal, forward-facing beak.
const neck=[-21/29,20/29],headBase=[b+.4*neck[0],.4*neck[1]];
const wingAxis={through:[world(0,-.3),world(0,.3)]};
export const crane={
  id:'crane',name:'鶴',reading:'つる',level:3,minutes:10,heavy:true,
  paper:{width:1,height:1,front:'#faf9f3',back:'#3f9c92',frontName:'白い面',backName:'青磁色の面',layerGap:.0008},
  steps:[
    {id:'centers',title:'対角線と縦横に折り目',text:'白い面を上に置きます。対角線は向こうに、縦横の中心線は手前に折り、そのつど開きます。',tip:'角と辺をそろえてから、折り目をつけます。',ops:[
      {type:'crease',line:{through:['BL','TR']},moving:'BR',mode:'mountain',tagMoved:'front',tagStationary:'rear'},
      {type:'scribe',segments:[['BR','TL'],['T','B'],['L','R']]}]},
    {id:'pattern',title:'花弁折りの折り目を用意',text:'あとで使う折り目を先につけておきます。凧の形になる斜めの線と、横の線が目印です。',tip:'紙は平らに開いたままです。',ops:[
      {type:'scribe',split:true,segments:pattern.map(e=>e.map(p=>typeof p==='string'?p:[p[0]-.5,.5-p[1]]))},
      {type:'tag',rect:[.66,.55,1,.75],add:['square-pin']},
      {type:'tag',rect:[.646,.451,.647,.452],add:['petal-pin']},
      {type:'tag',rect:[.5,.5,1,1],add:['legTR']},
      {type:'tag',rect:[0,0,.5,.5],add:['legBL']},
      {type:'tag',rect:[.5,0,1,.5],add:['wingFront']},
      {type:'tag',rect:[0,.5,.5,1],add:['wingRear']}]},
    {id:'square',title:'つぶして正方基本形に',text:'折り目に沿って左右を寄せ、4つの角を重ねます。袋をつぶして、小さな正方形にします。',tip:'紙を引っ張らず、折り目からたたみます。',ops:[
      {type:'mechanism',pin:{tags:['square-pin']},hinges:[['R',180],['TR',-180],['T',180],['L',180],['BL',-180],['B',180]].map(([r,degrees])=>({line:{through:['C',r]},degrees}))}]},
    {id:'petals',title:'花弁折りで鳥の基本形に',text:'下の角を持ち上げ、両側を内側へたたみます。前後の袋を同時に開いて、細長い形にします。',tip:'先に用意した斜めと横の折り目を使います。',ops:[
      {type:'mechanism',pin:{tags:['petal-pin']},hinges:petals}]},
    {id:'narrow-front',title:'前の脚を細くする',text:'前の層の左右の辺を、手前に折って中心線に合わせます。2本の脚を細くします。',tip:'後ろの層は動かさず、前の紙だけを折ります。',ops:[narrow(1),narrow(-1)]},
    {id:'narrow-rear',title:'裏返して同じように折る',text:'裏返して、左右の辺を手前に折り、中心線に合わせます。折れたら元の面へ返します。',tip:'前後の折り幅をそろえます。',ops:[
      {type:'turn',axis:'vertical'},narrow(1,true),narrow(-1,true),{type:'turn',axis:'vertical'}]},
    {id:'neck-tail',title:'首としっぽを中割り折り',text:'2本の脚をそれぞれ紙の間へ折り込み、左右へ引き上げます。片方が首、もう片方がしっぽになります。',tip:'折り目をつけて開き、脚を前後の紙の間へ押し込んで裏返します。',ops:[raise('legTR',1),raise('legBL',-1)]},
    {id:'head',title:'首の先を中割り折り',text:'首の先をもう一度、紙の間へ折り込みます。先端を前へ向けて頭にします。',tip:'首の先の約5分の1を折り返します。',ops:[
      {type:'fold',line:{point:world(...headBase),dir:world(neck[0],neck[1]+1)},moving:'TR',select:{tags:['neck']},mode:'valley',tagMoved:'head',stack:{mode:'between',upper:'rear',lower:'front'}}]},
    {id:'wings-down',title:'翼を折り下げる',text:'前の翼は手前に、後ろの翼は向こうに折り下げます。左右の折り目の高さをそろえます。',tip:'首としっぽを一緒に折らないようにします。',ops:[
      {type:'fold',line:{point:world(0,0),dir:world(0,1)},moving:'BR',select:{tags:['wingFront']},mode:'valley',tagMoved:'flapFront'},
      {type:'fold',line:{point:world(0,0),dir:world(0,1)},moving:'TL',select:{tags:['wingRear']},mode:'mountain',tagMoved:'flapRear'}]},
    {id:'finish',title:'翼を開いて完成',text:'胴を起こし、左右の翼を少し上げ、同じ高さに開きます。青磁色の鶴の完成です。',tip:'胴の上はとがったまま、翼を水平より少し上げて、V字に開きます。',view:'side',ops:[
      {type:'hinge',axis:wingAxis,degrees:-90},
      {type:'hinge',axis:wingAxis,select:{tags:['flapFront']},degrees:110},
      {type:'hinge',axis:wingAxis,select:{tags:['flapRear']},degrees:-110,together:true}]},
  ],
};
export default crane;
