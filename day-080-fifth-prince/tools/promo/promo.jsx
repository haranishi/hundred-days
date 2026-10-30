import React from 'react';
import {AbsoluteFill,Img,continueRender,delayRender,staticFile,useCurrentFrame,interpolate} from 'remotion';
const fontReady=delayRender('Game font');
if(typeof document!=='undefined'){const font=new FontFace('KingdomPixel',`url(${staticFile('kingdom.ttf')})`);font.load().then(face=>{document.fonts.add(face);continueRender(fontReady);}).catch(()=>continueRender(fontReady));}
const C={ink:'#131e28',paper:'#f4ead3',gold:'#e6c485',muted:'#9baea6'};
const clips=[
 {id:'hook',from:0,length:108,chapter:'01 / 挑む',lines:['魔法ゼロの王子。','それでも、挑め。'],accent:'#d99b7c'},
 {id:'market',from:108,length:180,chapter:'02 / 商う',lines:['最初の冒険は、','麦の仕入れから。'],accent:'#e6c485'},
 {id:'companions',from:288,length:180,chapter:'03 / 出会う',lines:['町で出会った人が、','旅の仲間になる。'],accent:'#9fbe93'},
 {id:'brothers',from:468,length:180,chapter:'04 / 向き合う',lines:['兄弟に、返事をする。','同じ冒険へ進む。'],accent:'#afa2ca'},
 {id:'battle',from:648,length:252,chapter:'05 / 共闘する',lines:['攻める？ 守る？','仲間に託す？'],accent:'#d99b7c'},
 {id:'outro',from:900,length:180,chapter:'DAY 80 / 100',lines:['その出会いが、','君の力になる。'],accent:'#e6c485'},
];
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'};
export function Promo(){
 const f=useCurrentFrame(),clip=[...clips].reverse().find(c=>f>=c.from),local=f-clip.from;
 const image=`footage/${clip.id}/${String(Math.min(clip.length-1,local)).padStart(4,'0')}.jpg`;
 const enter=interpolate(local,[0,12],[24,0],clamp),alpha=1,end=clip.id==='outro';
 return <AbsoluteFill style={{background:C.ink,color:C.paper,fontFamily:'KingdomPixel,sans-serif',overflow:'hidden'}}>
  <div style={{position:'absolute',left:48,top:63,right:48,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:27,letterSpacing:2,color:C.gold}}><span>DAY 80 <span style={{color:C.muted}}>/ 100</span></span><span style={{fontSize:23,color:C.muted}}>第五王子と、名もなき加護</span></div>
  <div style={{position:'absolute',top:124,left:48,right:48,height:3,background:'#dfc18b33'}}><div style={{width:`${f/1079*100}%`,height:3,background:C.gold}}/></div>
  <div style={{position:'absolute',top:164,left:48,fontSize:24,letterSpacing:4,color:clip.accent}}>{clip.chapter}</div>
  <div style={{position:'absolute',top:228,left:0,width:1080,height:1440,overflow:'hidden',borderTop:'3px solid #d8bf7e66',borderBottom:'3px solid #d8bf7e66'}}>
   <Img src={staticFile(image)} style={{width:1080,height:1440,imageRendering:'pixelated'}}/>
   {end&&<AbsoluteFill style={{background:'linear-gradient(180deg,#131e2899,#131e28dd 35%,#131e28ee)'}}/>}
  </div>
  {!end&&<div style={{position:'absolute',top:1703,left:48,right:48,opacity:alpha,transform:`translateY(${enter}px)`,fontSize:57,lineHeight:1.38,letterSpacing:1}}>{clip.lines.map((text,i)=><div key={text} style={{color:i===1?clip.accent:C.paper}}>{text}</div>)}</div>}
  {end&&<>
   <div style={{position:'absolute',top:432,left:64,right:64,textAlign:'center',fontSize:42,lineHeight:1.6,color:C.gold,opacity:alpha}}>火も、水も、雷もない。<br/>僕には、あなたがいる。</div>
   <div style={{position:'absolute',top:748,left:48,right:48,textAlign:'center',fontSize:87,lineHeight:1.5,textShadow:'0 5px 1px #09121d',transform:`translateY(${enter}px)`}}>第五王子と、<br/><span style={{color:C.gold}}>名もなき加護</span></div>
   <div style={{position:'absolute',top:1170,left:60,right:60,textAlign:'center',fontSize:31,color:C.muted}}>商いと仲間で、勇者になる短編RPG</div>
   <div style={{position:'absolute',top:1413,left:100,right:100,border:'2px solid #e6c485',padding:'25px 10px',textAlign:'center',fontSize:38,color:C.gold}}>ブラウザで、冒険へ。</div>
   <div style={{position:'absolute',top:1733,left:48,right:48,textAlign:'center',fontSize:32,lineHeight:1.75}}>結末まで遊べます。<br/><span style={{fontSize:27,color:C.muted}}>プレイリンクは投稿に</span></div>
  </>}
  <div style={{position:'absolute',left:48,right:48,bottom:25,display:'flex',gap:8}}>{['#b36147','#628eab','#7c9b66','#9d87ac','#d7b86c'].map((color,i)=><div key={color} style={{height:5,width:`${18+i}%`,background:color,opacity:.65}}/>)}</div>
 </AbsoluteFill>;
}
