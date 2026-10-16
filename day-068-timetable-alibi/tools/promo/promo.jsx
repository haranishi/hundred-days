import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame} from 'remotion';

const C={ink:'#071a22',paper:'#f3e9d5',gold:'#e6bf7e',teal:'#83b9b3',red:'#e69c87'};
const clamp=n=>Math.min(1,Math.max(0,n));
const ease=n=>1-(1-clamp(n))**4;
const mix=(a,b,n)=>a+(b-a)*clamp(n);
const src=name=>staticFile(name);
const serif='"Hiragino Mincho ProN","Yu Mincho",serif';
const mono='"SFMono-Regular",Menlo,monospace';
const abs={position:'absolute'};
const textShadow='0 4px 30px #001018';

function Backdrop({name,f,position='50% 50%',dark=.35,travel=45}){
 return <><Img src={src(name)} style={{...abs,inset:-80,width:1240,height:2080,objectFit:'cover',objectPosition:position,transform:`translate(${mix(-travel,travel,f/144)}px,${mix(14,-14,f/144)}px) scale(${mix(1.04,1.11,f/144)})`}}/>
 <AbsoluteFill style={{background:`linear-gradient(180deg,rgba(3,15,24,.7),rgba(3,15,24,${dark}) 43%,rgba(3,15,24,.86))`}}/></>;
}
function Rain({f,opacity=.3}){
 return <svg width="1080" height="1920" style={{...abs,inset:0,opacity,pointerEvents:'none'}}>
 {Array.from({length:80},(_,i)=>{
  const x=((i*137.37+f*(i%3-1)*.35)%1200+1200)%1200-60;
  const y=((i*283+f*(9+i%7))%2100)-100;
  return <line key={i} x1={x} y1={y} x2={x-12} y2={y+24+i%32} stroke={i%3===0?'#deceb0':'#b4d6e3'} strokeWidth={i%3===0?1.3:.8}/>;
 })}</svg>;
}
function Top({label='23:47の約束',f=30}){
 return <div style={{...abs,left:84,right:84,top:115,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:24,letterSpacing:4,color:C.gold,opacity:ease(f/16)}}>
 <span style={{fontFamily:mono}}>100 DAYS <span style={{color:'#f3e9d566',margin:'0 13px'}}>/</span> 068</span><span style={{fontSize:25,letterSpacing:3}}>{label}</span></div>;
}
function Rule({top=185,f=30}){
 return <div style={{...abs,left:84,top,width:912*ease(f/35),height:1,background:`linear-gradient(90deg,${C.gold}99,${C.gold}11)`}}/>;
}
function Lines({lines,f,top=250,left=84,size=82,color=C.paper,delay=0,gap=20,center=false,serifFont=false}){
 return <div style={{...abs,left:center?60:left,right:center?60:60,top,color,fontSize:size,lineHeight:1.38,letterSpacing:serifFont?5:1,fontFamily:serifFont?serif:undefined,textShadow,textAlign:center?'center':'left'}}>
 {lines.map((line,i)=><div key={i} style={{marginBottom:gap,whiteSpace:'nowrap'}}>{Array.from(line).map((char,j)=>{
 const p=ease((f-delay-i*8-j*1.2)/18);
 return <span key={j} style={{display:'inline-block',opacity:p,transform:`translateY(${(1-p)*50}px)`,filter:`blur(${(1-p)*3}px)`}}>{char===' '? '\u00a0':char}</span>;
 })}</div>)}
 </div>;
}
function Footer({text='時刻表アリバイ',light=true}){
 return <div style={{...abs,left:84,right:84,top:1764,display:'flex',justifyContent:'space-between',alignItems:'center',color:light?'#dfd7c7a6':'#dfd7c755',fontSize:23,letterSpacing:3}}>
 <span>{text}</span><span style={{fontFamily:mono,fontSize:21}}>A BROWSER MYSTERY</span></div>;
}
function Actor({name,f,left=360,top=690,size=1000,opacity=1,mood=0}){
 return <div style={{...abs,left,top,width:size,height:size,backgroundImage:`url("${src(name)}")`,backgroundSize:'200% 200%',backgroundPosition:mood===0?'0 0':'100% 100%',opacity,filter:'drop-shadow(0 18px 38px #0007)',transform:`translateY(${Math.sin(f/40)*4}px) rotate(${Math.sin(f/90)*.3}deg)`}}/>;
}
function Ticket({f,top=1120,small=false}){
 const close=ease((f-12)/55),width=small?640:850,left=(1080-width)/2;
 return <div style={{...abs,left,top,width,height:small?210:265,perspective:1400,filter:'drop-shadow(0 16px 22px #001018aa)'}}>
 {[0,1].map((side)=><div key={side} style={{...abs,top:side?8:0,left:side?width/2:0,width:width/2,height:'100%',boxSizing:'border-box',background:side?'linear-gradient(130deg,#386d80,#254a62)':'linear-gradient(130deg,#538d99,#315e76)',border:'2px solid #abc4c07a',borderRadius:side?'0 8px 8px 0':'8px 0 0 8px',transform:`translateX(${(side?1:-1)*(1-close)*240}px) rotate(${(side?1:-1)*(1-close)*13}deg)`,clipPath:side?'polygon(3% 0,100% 0,100% 100%,3% 100%,0 94%,3% 88%,0 82%,3% 76%,0 70%,3% 64%,0 58%,3% 52%,0 46%,3% 40%,0 34%,3% 28%,0 22%,3% 16%,0 10%)':'polygon(0 0,97% 0,100% 6%,97% 12%,100% 18%,97% 24%,100% 30%,97% 36%,100% 42%,97% 48%,100% 54%,97% 60%,100% 66%,97% 72%,100% 78%,97% 84%,100% 90%,97% 96%,97% 100%,0 100%)'}}>
 <div style={{padding:'32px 28px',color:C.paper}}>
 <div style={{font: '17px '+mono,letterSpacing:3,color:'#d8e0d5'}}>SHIOMI RAILWAY</div>
 <div style={{fontFamily:serif,fontSize:small?42:50,marginTop:20,letterSpacing:5,whiteSpace:'nowrap'}}>{side?'一緒に。':'帰りは、'}</div>
 <div style={{font:'19px '+mono,marginTop:18,color:C.gold}}>23:47　{side?'LAST TRAIN':'HARBOR →'}</div>
 </div></div>)}
 </div>;
}
function Film({take,f,top=460,width=912,height,progress=true}){
 const enter=ease(f/18),left=(1080-width)/2;
 const frame=Math.max(0,Math.min(143,Math.floor(f)));
 return <div style={{...abs,left,top,width,height:height||width*1520/1080,borderRadius:14,overflow:'hidden',boxShadow:'0 24px 90px #0009',border:'1px solid #bdc3ad66',transform:`translateY(${(1-enter)*80}px) scale(${mix(.96,1,enter)})`,opacity:enter,background:C.ink}}>
 <Img src={src(`${take}/${String(frame).padStart(4,'0')}.jpg`)} style={{display:'block',width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/>
 {progress&&<div style={{...abs,left:0,right:0,bottom:0,height:4,background:'#00131b99'}}><div style={{width:`${frame/143*100}%`,height:'100%',background:C.gold}}/></div>}
 </div>;
}
function Hook({f}){
 return <AbsoluteFill>
 <Backdrop name="episode-concourse-night.webp" f={f} position="52% 50%" dark={.12}/><Rain f={f}/>
 <Top f={f}/><Rule f={f}/>
 <div style={{...abs,left:79,top:278,color:C.gold,fontFamily:mono,fontSize:238,letterSpacing:-19,textShadow:'0 0 80px #edc28a33',transform:`translateY(${mix(42,0,ease(f/24))}px)`}}>23<span style={{opacity:f%30<24?1:.45}}>:</span>47</div>
 <div style={{...abs,left:95,top:560,color:'#e2d9c6',fontSize:29,letterSpacing:10,opacity:ease((f-15)/18)}}>港の最終列車までに、帰ろう。</div>
 <Actor name="toru-expressions.webp" f={f} left={255-mix(0,20,f/144)} top={650} size={1000}/>
 <AbsoluteFill style={{background:'linear-gradient(0deg,#061820 0%,#061820e6 16%,#06182000 55%)'}}/>
 <Lines f={f} delay={26} lines={['一緒に帰る、','はずだった。']} top={1190} size={88} serifFont/>
 <div style={{...abs,left:92,top:1558,fontSize:32,letterSpacing:6,color:C.gold,opacity:ease((f-68)/20)}}>半分の青い切符。ひとつの約束。</div>
 <Footer/>
 </AbsoluteFill>;
}
function Message({f}){
 const cut=f>115;
 return <AbsoluteFill>
 <Backdrop name="episode-platform-night.webp" f={f} dark={.63}/><Rain f={f+144} opacity={.42}/>
 <Top label="23:12 / 一通の伝言" f={f}/><Rule f={f}/>
 <Lines f={f} lines={['相棒が、','消えた。']} top={290} size={107} serifFont/>
 <div style={{...abs,left:84,right:84,top:850,height:650,padding:'55px 44px',boxSizing:'border-box',border:'1px solid #c2b49066',background:'linear-gradient(140deg,#244541cc,#102c36ee)',borderRadius:'4px 40px 4px 4px',transform:`translateY(${mix(90,0,ease((f-7)/25))}px)`,opacity:ease((f-7)/20)}}>
 <div style={{display:'flex',justifyContent:'space-between',font:'24px '+mono,color:C.gold,letterSpacing:4}}><span>FROM : 朝倉 透</span><span>23:12</span></div>
 <svg width="815" height="140" style={{marginTop:48,marginBottom:25}}>{Array.from({length:68},(_,i)=>{
 const height=cut?2:10+(Math.sin(i*1.72+f*.3)*.5+.5)*(15+Math.sin(i*.2)**2*80);
 return <rect key={i} x={i*12} y={70-height/2} width="4" height={height} rx="2" fill={i>58?C.gold:C.teal} opacity={cut?.3:.9}/>;
 })}</svg>
 <div style={{fontFamily:serif,fontSize:45,lineHeight:1.9,letterSpacing:1,color:C.paper}}>「俺が急行に乗ったって<br/>言われても、信じるな」</div>
 <div style={{fontSize:25,letterSpacing:5,color:cut?C.red:'#a8c4be',marginTop:35}}>{cut?'— 伝言は、ここで途切れた。':'相棒から届いた、最後の伝言。'}</div>
 </div>
 <div style={{...abs,top:1590,left:86,fontSize:39,fontFamily:serif,color:C.paper,opacity:ease((f-75)/24)}}>かけ直しても、電話はつながらない。</div>
 <Footer/>
 </AbsoluteFill>;
}
function Evidence({f}){
 return <AbsoluteFill>
 <Backdrop name="episode-concourse-night.webp" f={f} dark={.72}/><Rain f={f+288} opacity={.15}/>
 <Top label="01 / 現場を調べる" f={f}/><Rule f={f}/>
 <Lines f={f} lines={['残された一枚が、','嘘をほどく。']} top={230} size={68}/>
 <Film take="investigate" f={f} top={478}/>
 {f>58&&<div style={{...abs,right:102,top:392,color:C.gold,font:'28px '+mono,opacity:ease((f-58)/14)}}>PHOTO / 23:14</div>}
 <Footer text="実際のゲーム画面"/>
 </AbsoluteFill>;
}
function Timetable({f}){
 const progress=clamp((f-8)/129),y=760+progress*658;
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 80% 35%,#254741,#071a22 75%)'}}>
 <Top label="02 / 証言と照らす" f={f}/><Rule f={f}/>
 <Lines f={f} lines={['時刻表は、','嘘をつかない。']} top={247} size={85} serifFont/>
 <div style={{...abs,left:84,top:615,width:912,height:930,border:'1px solid #91b1a344',borderRadius:12,background:'#18313999'}}/>
 <div style={{...abs,left:130,top:652,color:C.gold,fontSize:25,letterSpacing:3}}>急行 ほしあかり <span style={{font:'20px '+mono,color:C.teal,marginLeft:22}}>EXPRESS</span></div>
 <svg width="1080" height="1920" style={{...abs,inset:0}}>
 <path d="M 215 768 L 215 1418" stroke="#657e7360" strokeWidth="8"/>
 <path d="M 215 768 L 215 1418" stroke={C.gold} strokeWidth="8" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress}/>
 {[760,980,1190,1418].map((cy,i)=><circle key={i} cx="215" cy={cy} r={i===0||i===3?17:12} fill={C.ink} stroke={i===2?C.red:i===0||i===3?C.gold:'#728e82'} strokeWidth="4"/>)}
 <circle cx="215" cy={y} r="33" fill="#e6bf7e22"/><rect x="198" y={y-25} width="34" height="50" rx="9" fill={C.gold}/><rect x="204" y={y-16} width="22" height="13" rx="3" fill={C.ink}/>
 </svg>
 {[
  ['灯台港','23:15 発',740,true],['汐見中央','通過',957,false],['霧山','通過',1168,false],['星見温泉','23:36 着',1395,true]
 ].map(([station,time,top,stop],i)=><div key={station} style={{...abs,left:292,right:145,top,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:mix(.35,1,ease((f-i*9)/20)),color:i===2?C.red:C.paper}}>
 <span style={{fontFamily:serif,fontSize:50,letterSpacing:4}}>{station}</span><span style={{fontFamily:stop?mono:undefined,fontSize:stop?41:35,color:i===2?C.red:stop?C.gold:'#95b1a8'}}>{time}</span>
 </div>)}
 {f>55&&<div style={{...abs,left:285,right:130,top:1240,height:2,background:C.red,transformOrigin:'left',transform:`scaleX(${ease((f-55)/30)})`}}/>}
 <div style={{...abs,left:90,right:90,top:1610,textAlign:'center',fontFamily:serif,fontSize:47,letterSpacing:2,color:C.paper,opacity:ease((f-65)/20)}}>その列車に、乗れたのか。</div>
 <Footer text="証言 × 記録 × 時刻表"/>
 </AbsoluteFill>;
}
function Choice({f}){
 return <AbsoluteFill>
 <Backdrop name="episode-platform-night.webp" f={f} dark={.75}/><Rain f={f+576} opacity={.18}/>
 <Top label="03 / 選択を迫られる" f={f}/><Rule f={f}/>
 <Lines f={f} lines={['その証拠を、','消してと言われたら。']} top={230} size={67}/>
 <Film take="choice" f={f} top={478}/>
 <Footer text="消すか、残すか。"/>
 </AbsoluteFill>;
}
function Branches({f}){
 const collapse=ease((f-37)/27),p=ease(f/35);
 return <AbsoluteFill>
 <Backdrop name="complete-train-car-night.webp" f={f} dark={.78}/>
 <Top label="04 / 行く先を選ぶ" f={f}/><Rule f={f}/>
 <Lines f={f} lines={['誰と進むか。','どの列車に乗るか。']} top={230} size={68}/>
 <svg width="1080" height="1920" style={{...abs,inset:0,opacity:1-collapse*.8}}>
 <path d="M540 524 L540 640 Q540 700 320 750 L320 1510 M540 640 Q540 700 780 750 L780 1510" stroke="#76978b44" fill="none" strokeWidth="5"/>
 <path d="M540 524 L540 640 Q540 700 320 750 L320 1510" stroke={C.gold} fill="none" strokeWidth="5" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p}/>
 <path d="M540 524 L540 640 Q540 700 780 750 L780 1510" stroke={C.teal} fill="none" strokeWidth="5" pathLength="1" strokeDasharray="1" strokeDashoffset={1-p}/>
 </svg>
 {[['toru-expressions.webp','透と港へ',84,C.gold],['shiori-expressions.webp','栞と駅に残る',558,C.teal]].map(([name,label,left,color],i)=><div key={name} style={{...abs,left,top:mix(790,490,collapse),width:438,height:mix(750,106,collapse),overflow:'hidden',border:`1px solid ${color}66`,borderRadius:10,background:'#18363c',opacity:ease(f/18)}}>
 <div style={{...abs,left:-40,top:55,width:560,height:560,backgroundImage:`url("${src(name)}")`,backgroundSize:'200% 200%',backgroundPosition:'0 0',opacity:1-collapse}}/>
 <div style={{...abs,bottom:0,left:0,right:0,padding:'24px 8px',textAlign:'center',fontSize:34,color,background:'linear-gradient(transparent,#102a32 40%)',whiteSpace:'nowrap'}}>{label}</div>
 </div>)}
 {f>=48&&<div style={{opacity:ease((f-48)/18)}}><Film take="journey" f={f} top={630} width={790}/></div>}
 <Footer text="選ぶ道で、出会いと証拠が変わる"/>
 </AbsoluteFill>;
}
function Breath({f}){
 return <AbsoluteFill>
 <Backdrop name="complete-train-car-night.webp" f={f*1.7} position="35% 50%" dark={.42} travel={100}/>
 <Rain f={f*2+864} opacity={.17}/>
 {[0,1,2].map(i=><div key={i} style={{...abs,left:-200+((f*31+i*430)%1500),top:780+i*195,width:450,height:3,background:'linear-gradient(90deg,transparent,#f2ce9288,transparent)',transform:'rotate(-8deg)',opacity:.3}}/>)}
 <Top f={f}/><Rule f={f}/>
 <Lines f={f} delay={3} lines={['その嘘を、','ほどけ。']} top={790} size={115} center serifFont gap={35}/>
 <Footer/>
 </AbsoluteFill>;
}
function End({f}){
 return <AbsoluteFill>
 <Backdrop name="complete-harbor-platform.webp" f={f} position="48% 50%" dark={.05}/><Rain f={f+936} opacity={.23}/>
 <AbsoluteFill style={{background:'linear-gradient(180deg,#05182077,#05182022 36%,#051820bb 70%,#051820ef)'}}/>
 <Top label="短編Webミステリー" f={f}/><Rule f={f}/>
 <div style={{...abs,top:380,left:0,right:0,textAlign:'center',font:'26px '+mono,letterSpacing:12,color:C.gold,opacity:ease(f/30)}}>DAY 068</div>
 <Lines f={f} delay={4} lines={['時刻表アリバイ']} top={560} size={104} center serifFont/>
 <div style={{...abs,top:755,left:0,right:0,textAlign:'center',fontFamily:serif,fontSize:47,letterSpacing:11,color:C.gold,opacity:ease((f-20)/25)}}>23:47の約束</div>
 <div style={{...abs,left:180,right:180,top:885,height:1,background:'linear-gradient(90deg,transparent,#dfbf80,transparent)',transform:`scaleX(${ease((f-10)/40)})`}}/>
 <Ticket f={f} top={1085}/>
 <div style={{...abs,left:50,right:50,top:1490,textAlign:'center',fontSize:40,letterSpacing:3,color:C.paper,opacity:ease((f-38)/22)}}>ブラウザで遊べる、短編ミステリー。</div>
 <div style={{...abs,left:180,right:180,top:1605,padding:'24px 0',border:'1px solid #dfbf80bb',borderRadius:4,textAlign:'center',color:C.gold,background:'#102c35b3',fontSize:40,letterSpacing:5,opacity:ease((f-46)/22)}}>雨の駅で、真相をたどる。 <span style={{fontFamily:mono}}>↗</span></div>
 <div style={{...abs,left:0,right:0,top:1756,textAlign:'center',font:'23px '+mono,letterSpacing:4,color:'#ddd2bba6',opacity:ease((f-55)/20)}}>100 DAYS / 100 WEB APPS</div>
 </AbsoluteFill>;
}
const scenes=[Hook,Message,Evidence,Timetable,Choice,Branches,Breath,End];
const starts=[0,144,288,432,576,720,864,936];
export function Promo(){
 const frame=useCurrentFrame();
 const index=starts.reduce((a,s,i)=>frame>=s?i:a,0),local=frame-starts[index];
 const Scene=scenes[index];
 return <AbsoluteFill style={{background:C.ink,fontFamily:'"Zen Promo",sans-serif',color:C.paper,overflow:'hidden'}}>
 <style>{`@font-face{font-family:"Zen Promo";src:url("${src('zen-bold.ttf')}") format("truetype");font-weight:700;font-display:block;}*{box-sizing:border-box}`}</style>
 <Scene f={local}/>
 <div style={{...abs,inset:0,pointerEvents:'none',boxShadow:'inset 0 0 135px #0004'}}/>
 {index>0&&local<14&&<div style={{...abs,top:0,bottom:0,width:95,left:mix(-120,1180,ease(local/14)),background:'linear-gradient(90deg,transparent,#ddc39c99,transparent)',mixBlendMode:'screen',opacity:.45}}/>}
 <div style={{...abs,left:84,bottom:90,width:912,height:2,background:'#a5ac9d22'}}><div style={{width:`${frame/1079*100}%`,height:2,background:C.gold}}/></div>
 </AbsoluteFill>;
}
