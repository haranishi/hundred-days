import Phaser from 'phaser';
import { FootstepClock, surfaceAt, type Surface } from './audio-model';
import { CHARACTERS } from './content';
import { createMap, findPath, TILE, walkable, moveOnMap, safePosition, clearSegment } from './maps';
import { chosen, done as storyDone } from './story';
import { has, objective } from './state';
import { createPeopleTextures, getSheets, PEOPLE, preloadPixels } from './pixel-assets';
import {EndingView,type EndingActor} from './ending-view';
import { paintWorld } from './world-art';
import { openingStage, type OpeningBeat, type OpeningStage } from './opening-script';
import type { EndingCue, GameState, MapData, Point, Zone } from './types';
export interface WorldHooks {blocked:()=>boolean;interact:(p:Point)=>void;nearby:(p:Point|null)=>void;position:(x:number,y:number)=>void;ready:()=>void;step:(surface:Surface,running:boolean)=>void}
interface Walker {sprite:Phaser.GameObjects.Sprite;id:string;origin:{x:number;y:number};phase:number;kind:'person'|'bird'}
export class WorldScene extends Phaser.Scene {
 snapshot!:GameState;map!:MapData;player!:Phaser.GameObjects.Sprite;hooks!:WorldHooks;
 private keys!:Record<string,Phaser.Input.Keyboard.Key>;private route:{x:number;y:number}[]=[];private routeTarget:Point|null=null;private entities:Phaser.GameObjects.GameObject[]=[];private followers:Phaser.GameObjects.Sprite[]=[];private near:Point|null=null;private moving=false;private step=0;private elapsed=0;private facing=0;private labels:{label:Phaser.GameObjects.Text;point:Point}[]=[];private walkers:Walker[]=[];private trail:{x:number;y:number;frame:number}[]=[];private routeDots:Phaser.GameObjects.Graphics|null=null;
 private footClock=new FootstepClock();private cinematic=false;private stageKey='';private stageFocus:{x:number;y:number}|null=null;private castActors:EndingActor[]=[];private endingView:EndingView|null=null;private stageLights:Phaser.GameObjects.GameObject[]=[];
 touch={x:0,y:0};
 constructor(){super('world');}
 init(data:{state:GameState;hooks:WorldHooks}){this.snapshot=data.state;this.hooks=data.hooks;this.route=[];this.entities=[];this.followers=[];this.labels=[];this.walkers=[];this.trail=[];this.near=null;}
 preload(){preloadPixels(this);this.load.on('loaderror',(file:Phaser.Loader.File)=>console.error('Asset failed:',file.key));}
 create(){
 createPeopleTextures(this);
 this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string,Phaser.Input.Keyboard.Key>;
 this.input.keyboard!.removeCapture(['W','A','S','D','UP','DOWN','LEFT','RIGHT']);
 this.player=this.add.sprite(0,0,'walk:lyca',0).setOrigin(.5,.9).setScale(1).setDepth(1000);
 this.loadMap(this.snapshot.zone);
 this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(this.hooks.blocked())return;const pt=this.cameras.main.getWorldPoint(pointer.x,pointer.y);const target=this.map.points.find(p=>Math.hypot(p.x-pt.x,p.y-pt.y)<19);this.navigate(target??pt);});
 this.hooks.ready();
 }
 private loadMap(zone:Zone,hiddenProps:string[]=[]){
 this.endingView?.dispose();this.endingView=null;this.cancelRoute();this.footClock.reset();this.moving=false;for(const x of this.entities){this.tweens.killTweensOf(x);x.destroy();}this.entities=[];this.followers.forEach(x=>x.destroy());this.followers=[];this.labels=[];this.walkers=[];this.trail=[];
 this.map=createMap(zone);const key='world:v2:'+zone;
 if(!this.textures.exists(key)){
 const painted=paintWorld(this.map,getSheets(this));this.textures.addCanvas(key,painted.ground);
 for(const prop of painted.props){const k=`prop:${zone}:${prop.key}`;if(!this.textures.exists(k))this.textures.addCanvas(k,prop.canvas);}
 // Props are kept as plain rendering metadata so rebuilding an interaction doesn't repaint.
 this.registry.set('props:'+zone,painted.props.map(({canvas,...prop})=>prop));
 }
 this.entities.push(this.add.image(0,0,key).setOrigin(0).setDepth(-100));
 const props=this.registry.get('props:'+zone) as {key:string;x:number;y:number;depth:number}[];
 for(const p of props)if(!hiddenProps.includes(p.key))this.entities.push(this.add.image(p.x,p.y,`prop:${zone}:${p.key}`).setOrigin(0).setDepth(p.depth));
 this.player.setPosition(this.snapshot.position.x,this.snapshot.position.y);
 const restored=safePosition(this.map,this.player);this.player.setPosition(restored.x,restored.y);
 this.cameras.main.setBounds(0,0,this.map.width*TILE,this.map.height*TILE).setZoom(this.zoom()).startFollow(this.player,true,.09,.09).setRoundPixels(true);
 this.routeDots=this.add.graphics().setDepth(-20);this.entities.push(this.routeDots);
 this.player.setVisible(!this.cinematic);if(!this.cinematic)this.buildPeople();this.addAtmosphere();this.addStoryChanges();
 this.near=null;this.hooks.nearby(null);this.hooks.position(this.player.x,this.player.y);
 }
 private zoom(){const w=this.game.canvas.parentElement!.clientWidth;return Math.max(2,Math.floor(w/420))*960/w;}
 private buildPeople(){
 for(const id of this.snapshot.party)this.followers.push(this.add.sprite(this.player.x,this.player.y,'walk:'+id,0).setOrigin(.5,.9).setScale(1));
 for(const p of this.map.points){
 if(p.id==='toma'&&!has(this.snapshot,'bramble')||p.id==='demon'&&has(this.snapshot,'ended'))continue;
 const isHerb=p.kind==='herb',taken=isHerb&&has(this.snapshot,'gather:'+p.id);
 if(p.character){
 const person=this.add.sprite(p.x,p.y,'walk:'+p.character,0).setOrigin(.5,.9).setScale(1).setDepth(p.y);this.entities.push(person);
 if(p.id==='demon'){person.setVisible(false);const demon=this.add.sprite(p.x,p.y,'enemy:demon',0).setOrigin(.5,.85).setScale(.9).setDepth(p.y);this.entities.push(demon);this.tweens.add({targets:demon,y:demon.y-3,duration:1600,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});}
 }else if(isHerb){
 const herb=this.add.image(p.x,p.y,'TilesetNature').setCrop(6*16,11*16,16,16).setPosition(p.x-104,p.y-188);herb.setOrigin(0).setDepth(p.y).setAlpha(taken?.25:1);this.entities.push(herb);
 if(!taken){const glow=this.add.circle(p.x,p.y-5,9,0xefe9a5,.11).setDepth(p.y-1);this.entities.push(glow);this.tweens.add({targets:glow,alpha:.3,scale:1.2,duration:1300,yoyo:true,repeat:-1});}
 }else if(p.kind==='chest'){
 const taken=has(this.snapshot,'found:'+p.id);const box=this.add.image(p.x-56,p.y-28,'TilesetElement').setCrop(48,16,16,16).setOrigin(0).setDepth(p.y).setAlpha(taken?.45:1);this.entities.push(box);
 if(!taken){const star=this.add.text(p.x,p.y-22,'✦',{fontSize:'9px',color:'#f5d793',stroke:'#294534',strokeThickness:2}).setOrigin(.5).setDepth(p.y+1);this.entities.push(star);this.tweens.add({targets:star,y:star.y-4,duration:1000,yoyo:true,repeat:-1});}
 }else if(p.kind==='story'){
 const sealed=p.id==='story:voices'||p.id==='story:power',opened=sealed&&chosen(this.snapshot,'citadel',p.id==='story:voices'?'voices':'power');
 const mark=this.add.text(p.x,p.y-13,sealed?(opened?'◇':'◆'):p.id==='story:well'?'水':'葉',{fontFamily:'KingdomPixel,monospace',fontSize:'12px',color:opened?'#d4e0b9':sealed?'#b99cda':'#d0df9e',stroke:'#152237',strokeThickness:2}).setOrigin(.5).setDepth(p.y);this.entities.push(mark);
 if(sealed&&!opened)this.tweens.add({targets:mark,alpha:.45,duration:1000,yoyo:true,repeat:-1});
 }else if(p.kind==='lore'){
 const book=this.add.text(p.x,p.y-13,'✧',{fontSize:'15px',color:'#d6d6ba',stroke:'#294534',strokeThickness:2}).setOrigin(.5).setDepth(p.y);this.entities.push(book);
 }else if(p.id==='bramble'){
 if(!has(this.snapshot,'bramble')){const monster=this.add.sprite(p.x,p.y,'enemy:bramble',0).setOrigin(.5,.87).setScale(.68).setDepth(p.y);this.entities.push(monster);this.walkers.push({sprite:monster,id:'bramble',origin:{x:p.x,y:p.y},phase:0,kind:'bird'});}
 }else if(p.kind==='gate'){
 const glyph=this.add.text(p.x,p.y-16,p.target==='palace'?'♜':p.target==='abyss'?'✧':'›',{fontFamily:'serif',fontSize:'13px',color:'#ffe4a5',stroke:'#29423e',strokeThickness:3}).setOrigin(.5).setDepth(p.y+1);this.entities.push(glyph);this.tweens.add({targets:glyph,y:glyph.y-3,duration:1100,yoyo:true,repeat:-1});
 }
 const label=this.add.text(p.x,p.y+7,p.label,{fontFamily:'KingdomPixel,monospace',fontSize:'8px',color:'#f4edd9',backgroundColor:'#132a29e6',padding:{x:5,y:3}}).setResolution(2).setOrigin(.5,0).setDepth(2000).setAlpha(0);this.labels.push({label,point:p});this.entities.push(label);
 }
 const o=objective(this.snapshot);const target=this.map.points.find(p=>p.id===o.target&&o.zone===this.map.zone);
 if(target){const marker=this.add.text(target.x,target.y-28,'!',{fontFamily:'Georgia,serif',fontSize:'11px',fontStyle:'bold',color:'#ffe4a5',stroke:'#31453a',strokeThickness:3}).setOrigin(.5).setDepth(2001);this.entities.push(marker);this.tweens.add({targets:marker,y:marker.y-4,duration:900,ease:'Sine.easeInOut',yoyo:true,repeat:-1});}
 if(this.map.zone==='town')for(const [i,id] of ['citizen1','citizen2','citizen1','merchant'].entries()){
 const origin=safePosition(this.map,{x:[310,430,500,200][i],y:[381,278,454,455][i]}),{x,y}=origin;const person=this.add.sprite(x,y,'walk:'+id,0).setOrigin(.5,.9).setScale(1).setDepth(y);this.entities.push(person);this.walkers.push({sprite:person,id,origin:{x,y},phase:i*1.7,kind:'person'});
 }
 }
 private addStoryChanges(){
 if(this.map.zone==='town'&&storyDone(this.snapshot,'forge')){
  const fire=this.add.sprite(201,237,'fx:fire',0).setOrigin(.5,.8).setScale(.55).setDepth(240);if(!this.anims.exists('oven-fire'))this.anims.create({key:'oven-fire',frames:this.anims.generateFrameNumbers('fx:fire'),frameRate:9,repeat:-1});fire.play('oven-fire');this.entities.push(fire);
 }
 }
 private addAtmosphere(){
 const forest=this.map.zone==='forest',dark=this.map.zone==='abyss';
 for(let i=0;i<(forest?38:dark?24:15);i++){
 const x=45+(i*103)%680,y=40+(i*79)%455;
 const spark=this.add.circle(x,y,forest?1:dark?.7:.6,dark?0xbf9fde:0xffe6ad,.6).setDepth(1900);this.entities.push(spark);this.tweens.add({targets:spark,x:x+20,y:y-20,alpha:.05,duration:2400+i*63,yoyo:true,repeat:-1,delay:i*80});
 }
 if(forest||this.map.zone==='town'){
 const fog=document.createElement('canvas');fog.width=256;fog.height=128;const ctx=fog.getContext('2d')!;const g=ctx.createRadialGradient(128,64,8,128,64,128);g.addColorStop(0,forest?'#e8e2b021':'#fff0d012');g.addColorStop(1,'#fff0d000');ctx.fillStyle=g;ctx.fillRect(0,0,256,128);const key='atmosphere:'+this.map.zone;if(!this.textures.exists(key))this.textures.addCanvas(key,fog);
 for(let i=0;i<4;i++){const cloud=this.add.image(140+i*145,110+(i%2)*180,key).setScale(2).setDepth(1800).setBlendMode(Phaser.BlendModes.ADD);this.entities.push(cloud);this.tweens.add({targets:cloud,x:cloud.x+80,duration:16000+i*2000,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});}
 }
 }
 setSnapshot(state:GameState,reset=false){
 const old=this.snapshot;this.snapshot=state;if(reset){this.cinematic=false;this.stageKey='';this.stageFocus=null;this.castActors=[];this.stageLights=[];}if(!this.player)return;
 if(reset||old.zone!==state.zone){this.loadMap(state.zone);return;}
 if(old.party.join()!==state.party.join()||old.flags.join()!==state.flags.join()||old.brothers.length!==state.brothers.length){const x=this.player.x,y=this.player.y;this.snapshot.position={x,y};this.loadMap(state.zone);}
 }
 navigate(point:Point|{x:number;y:number}){
 if(!this.player||this.hooks.blocked())return;const route=findPath(this.map,this.player,point);if(!route.length&&Math.hypot(point.x-this.player.x,point.y-this.player.y)>24)return;
 this.route=route;this.routeTarget='id'in point?point:null;this.routeDots?.clear();
 if(this.routeDots){this.routeDots.fillStyle(0xffe4a5,.4);route.forEach((p,i)=>{if(i%2===0)this.routeDots!.fillCircle(p.x,p.y,1);});}
 if(!route.length&&this.routeTarget){const target=this.routeTarget;this.routeTarget=null;this.hooks.interact(target);}
 }
 guide(id:string){const p=this.map.points.find(p=>p.id===id);if(p)this.navigate(p);}
 cancelRoute(){this.route=[];this.routeTarget=null;this.routeDots?.clear();}
 interact(){if(this.near&&!this.hooks.blocked()){this.cancelRoute();this.hooks.interact(this.near);}}
 pickup(message:string){
 const t=this.add.text(this.player.x,this.player.y-26,message,{fontFamily:'sans-serif',fontSize:'8px',fontStyle:'bold',color:'#fff0b6',stroke:'#2b4339',strokeThickness:3}).setOrigin(.5).setDepth(2100);this.entities.push(t);this.tweens.add({targets:t,y:t.y-24,alpha:0,duration:1300,ease:'Cubic.easeOut',onComplete:()=>t.destroy()});
 for(let i=0;i<8;i++){const orb=this.add.circle(this.player.x,this.player.y-12,1,0xf4df8e);this.entities.push(orb);this.tweens.add({targets:orb,x:orb.x+Math.cos(i*Math.PI/4)*22,y:orb.y+Math.sin(i*Math.PI/4)*18,alpha:0,duration:500,onComplete:()=>orb.destroy()});}
 }
 update(_time:number,delta:number){
 if(!this.player)return;const dt=Math.min(delta,40)/1000;this.elapsed+=dt;
 for(const w of this.walkers){if(w.kind==='bird'){w.sprite.setFrame(Math.floor(this.elapsed*5)%6);continue;}const x=w.origin.x+Math.sin(this.elapsed*.45+w.phase)*23,y=w.origin.y+Math.cos(this.elapsed*.3+w.phase)*5;const pos=moveOnMap(this.map,w.sprite,x-w.sprite.x,y-w.sprite.y),dx=pos.x-w.sprite.x;w.sprite.setPosition(pos.x,pos.y).setFrame((dx>0?3:2)+Math.floor(this.elapsed*5)%4*4).setDepth(pos.y);}
 if(this.cinematic){this.footClock.reset();this.moving=false;for(const a of this.castActors){const moving=Math.abs(a.sprite.y-a.targetY)>.5;if(moving)a.sprite.y+=Math.sign(a.targetY-a.sprite.y)*Math.min(Math.abs(a.targetY-a.sprite.y),dt*34);a.sprite.setFrame((moving?(a.sprite.y<a.targetY?0:1):a.facing)+(moving?Math.floor(this.elapsed*7)%4*4:0)).setDepth(a.sprite.y+1);if(a.seated)a.sprite.setCrop(0,0,16,13);a.label.setPosition(a.sprite.x,a.sprite.y+9);}this.touch={x:0,y:0};return;}
 if(this.hooks.blocked()){this.footClock.reset();this.moving=false;this.touch={x:0,y:0};return;}
 const previousX=this.player.x,previousY=this.player.y;
 let dx=(this.keys.RIGHT.isDown||this.keys.D.isDown?1:0)-(this.keys.LEFT.isDown||this.keys.A.isDown?1:0)+this.touch.x;
 let dy=(this.keys.DOWN.isDown||this.keys.S.isDown?1:0)-(this.keys.UP.isDown||this.keys.W.isDown?1:0)+this.touch.y;
 if(dx||dy)this.cancelRoute();
 if(!dx&&!dy&&this.route.length){const p=this.route[0],d=Math.hypot(p.x-this.player.x,p.y-this.player.y);if(d<3){if(clearSegment(this.map,this.player,p))this.player.setPosition(p.x,p.y);this.route.shift();}else{dx=(p.x-this.player.x)/d;dy=(p.y-this.player.y)/d;}}
 this.moving=!!(dx||dy);
 if(this.moving){
 const len=Math.hypot(dx,dy);this.facing=Math.abs(dx)>Math.abs(dy)?dx>0?3:2:dy>0?0:1;
 const speed=this.keys.SHIFT.isDown?128:94;dx=dx/Math.max(1,len)*speed*dt;dy=dy/Math.max(1,len)*speed*dt;
 const next=moveOnMap(this.map,this.player,dx,dy);this.player.setPosition(next.x,next.y);
 const distance=Math.hypot(this.player.x-previousX,this.player.y-previousY);this.moving=distance>.01;if(this.moving){if(this.footClock.advance(distance))this.hooks.step(surfaceAt(this.map,this.player.x,this.player.y),this.keys.SHIFT.isDown);}else this.footClock.reset();
 this.step+=dt;this.player.setFrame(this.facing+Math.floor(this.step*9)%4*4).setDepth(this.player.y+1);this.hooks.position(this.player.x,this.player.y);
 if(!this.trail.length||Math.hypot(this.player.x-this.trail[0].x,this.player.y-this.trail[0].y)>2){this.trail.unshift({x:this.player.x,y:this.player.y,frame:this.facing+Math.floor(this.step*9)%4*4});if(this.trail.length>90)this.trail.pop();}
 }else {this.player.setFrame(this.facing);this.footClock.reset();}
 if(!this.moving)this.player.setFrame(this.facing);
 this.followers.forEach((f,i)=>{const step=this.trail[Math.min(this.trail.length-1,(i+1)*9)];if(step)f.setPosition(step.x,step.y).setFrame(this.moving?step.frame:step.frame%4).setDepth(step.y);});
 for(const entry of this.labels){const d=Math.hypot(entry.point.x-this.player.x,entry.point.y-this.player.y);entry.label.setAlpha(d<45?1:0);}
 const nearest=this.map.points.filter(p=>!(p.id==='toma'&&!has(this.snapshot,'bramble'))).map(p=>({p,d:Math.hypot(p.x-this.player.x,p.y-this.player.y)})).sort((a,b)=>a.d-b.d)[0];const near=nearest&&nearest.d<27?nearest.p:null;
 if(near?.id!==this.near?.id){this.near=near;this.hooks.nearby(near);}
 if(!this.route.length&&this.routeTarget){const target=this.routeTarget;this.routeTarget=null;this.routeDots?.clear();if(Math.hypot(target.x-this.player.x,target.y-this.player.y)<27)this.hooks.interact(target);}
 }
 refreshCamera(){if(!this.player)return;const camera=this.cameras.main;camera.setZoom(this.zoom());if(this.cinematic&&this.stageFocus)camera.centerOn(this.stageFocus.x,this.stageFocus.y+this.scale.height/camera.zoom*.08);}
 showNarrative(stage:OpeningStage,key:string){this.showStage(stage,key,false);}
 showOpening(beat:OpeningBeat){this.showStage(openingStage(beat.scene,beat.lights),beat.scene,beat.lights);}
 showTitle(){const stage=openingStage('ceremony',true);stage.actors=stage.actors.filter(a=>a.id!=='king');this.showStage(stage,'title',true);}
 private showStage(stage:OpeningStage,key:string,lights:boolean){
  if(!this.player)return;if(this.stageKey===key){this.setStageLights(lights);return;}
  this.cinematic=true;this.stageKey=key;this.snapshot={...this.snapshot,zone:stage.zone,position:{...stage.focus},party:[]};this.loadMap(stage.zone,stage.table?['washing']:[]);this.castActors=[];this.stageLights=[];
  this.stageFocus={...stage.focus};this.cameras.main.stopFollow();this.refreshCamera();
  if(stage.table){const key='story:supper-table';if(!this.textures.exists(key)){const c=document.createElement('canvas');c.width=96;c.height=16;const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;const source=this.textures.get('TilesetElement').getSourceImage() as HTMLImageElement;for(let x=0;x<96;x+=48)ctx.drawImage(source,32,160,48,16,x,0,48,16);this.textures.addCanvas(key,c);}this.entities.push(this.add.image(stage.table.x,stage.table.y,key).setOrigin(0).setDepth(stage.table.y+8));}
  for(const a of stage.actors){const sprite=this.add.sprite(a.x,matchMedia('(prefers-reduced-motion: reduce)').matches?a.y:a.fromY??a.y,'walk:'+a.id,a.facing).setOrigin(.5,.9).setScale(1).setDepth(a.y+1);this.entities.push(sprite);const label=this.add.text(a.x,a.y+9,CHARACTERS[a.id].name,{fontFamily:'KingdomPixel,monospace',fontSize:'8px',color:'#fff4cf',stroke:'#101625',strokeThickness:2}).setResolution(2).setOrigin(.5).setDepth(2000);this.entities.push(label);this.castActors.push({id:a.id,sprite,label,targetY:a.y,facing:a.facing});}
  if(stage.ending)this.endingView=new EndingView(this,stage,this.castActors,(...items)=>this.entities.push(...items));
  this.setStageLights(lights);
 }
 private setStageLights(lit:boolean){
  if(lit===!!this.stageLights.length)return;for(const x of this.stageLights)x.destroy();this.stageLights=[];if(!lit)return;
  for(const a of this.castActors){const id=a.sprite.texture.key.replace('walk:','');if(!['flame','tide','grove','storm','lyca'].includes(id))continue;const color=id==='lyca'?0x606579:Phaser.Display.Color.HexStringToColor(CHARACTERS[id].color).color;
   const aura=this.add.circle(a.sprite.x,a.targetY-7,12,color,id==='lyca'?.13:.32).setDepth(a.targetY-1);const mark=this.add.text(a.sprite.x,a.targetY-33,id==='lyca'?'？':CHARACTERS[id].symbol,{fontFamily:'KingdomPixel,monospace',fontSize:'11px',color:id==='lyca'?'#8990a3':CHARACTERS[id].color,stroke:'#101625',strokeThickness:2}).setOrigin(.5).setDepth(2100);this.entities.push(aura,mark);this.stageLights.push(aura,mark);if(id!=='lyca')this.tweens.add({targets:aura,alpha:.12,scale:1.3,duration:900,yoyo:true,repeat:-1});
  }
 }
 playEndingCue(cue:EndingCue){return this.endingView?.play(cue)??Promise.resolve();}
 getSnapshot(){return {zone:this.map?.zone,x:this.player?.x,y:this.player?.y,moving:this.moving,route:this.route.length,frame:Number(this.player?.frame.name),facing:this.facing,ending:this.endingView?.snapshot()??null,view:{x:this.cameras.main.scrollX,y:this.cameras.main.scrollY,zoom:this.cameras.main.zoom,width:this.scale.width,height:this.scale.height}};}
}
export function createWorld(parent:HTMLElement,state:GameState,hooks:WorldHooks):{game:Phaser.Game;scene:WorldScene}{
 const scene=new WorldScene(),bounds=parent.getBoundingClientRect();const height=Math.max(300,Math.round(960*bounds.height/bounds.width));
 const game=new Phaser.Game({type:Phaser.AUTO,parent,width:960,height,backgroundColor:'#354f42',pixelArt:true,roundPixels:true,antialias:false,banner:false,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:[],input:{keyboard:true,touch:true,mouse:true},audio:{noAudio:true}});
 game.scene.add('world',scene,true,{state,hooks});
 const resize=new ResizeObserver(()=>{const b=parent.getBoundingClientRect();if(b.width>0){const h=Math.max(300,Math.round(960*b.height/b.width));if(game.scale.height!==h)game.scale.resize(960,h);if(scene.player)scene.refreshCamera();}});resize.observe(parent);game.events.once('destroy',()=>resize.disconnect());return {game,scene};
}
